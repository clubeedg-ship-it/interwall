"""
Unified ingestion pipeline worker (T-B02, D-032).

Picks pending and failed ingestion_events rows, dispatches by source
to the correct reprocessor, and updates status + retry_count atomically.

Dead-letter handling (T-B05, D-034):
  Events that fail >= MAX_RETRIES times move to status='dead_letter'.
  No automatic re-queue. Manual retry wired in T-C10.

Scratch — decisions binding this module:
  D-021: SELECT FOR UPDATE (not SKIP LOCKED) — correctness over throughput.
         Lock held on ingestion_events row for duration of reprocess call,
         serializing against poller inline-processing of the same row.
  D-022: process_bom_sale is single-transaction atomic. Reprocessors open
         their own DB connections; no nested savepoints.
  D-032: Unified ingestion table with source column.
  D-033: External xref is authoritative; missing xref or inactive build → RAISE.
  D-034: Dead-letter state for unprocessable events.
  D-017: Every sale must have ≥1 stock_ledger_entries row.
  D-025: cogs and profit stored at sale time, never recomputed.
  D-027: process_bom_sale raises (no default) when vat_rates row missing.

Status transition table:
  pending + success → processed (retry_count unchanged)
  pending + raise, new_count < MAX_RETRIES → failed, retry_count++, error_message
  pending + raise, new_count >= MAX_RETRIES → dead_letter, retry_count++, dead_letter_reason
  failed  + success → processed (retry_count unchanged, carry-through)
  failed  + raise, new_count >= MAX_RETRIES → dead_letter (as above)
  dead_letter / processed / review → never picked up
  unknown source → review, dead_letter_reason set, retry_count unchanged
"""

import logging

from db import get_conn
from email_poller.parsers import get_parser_for_marketplace
from email_poller.sale_writer import DraftBuildPendingError
from poller.bol_poller import _resolve_build_code, MARKETPLACE as _BOL_MARKETPLACE

logger = logging.getLogger(__name__)

# Maximum processing attempts before dead-letter transition.
# Not env-configurable in this task (config tunability is a follow-up note).
MAX_RETRIES = 5

# Events processed per worker tick.
WORKER_BATCH_SIZE = 25

_TRUNC = 500  # max chars for error_message / dead_letter_reason


def _is_stock_blocker_message(message: str) -> bool:
    message = (message or "").lower()
    return (
        "insufficient stock" in message
        and (
            "deduct_fifo_for_group" in message
            or "deduct_fifo_for_product" in message
        )
    )


def _reprocess_bolcom(event_row: dict, conn) -> str:
    """
    Reprocess a bolcom_api ingestion event.

    Resolves build_code via external_item_xref or EAN (D-033),
    then calls process_bom_sale (D-022) in its own connection.
    Returns transaction UUID string. Raises on any failure.

    Note: _resolve_build_code opens its own connection; process_bom_sale
    runs in a second connection. No nested savepoints (D-022).
    """
    item = event_row.get("parsed_data") or {}

    offer = item.get("offer") or {}
    product = item.get("product") or {}
    offer_reference = offer.get("reference")
    ean = product.get("ean", "")
    quantity = int(item.get("quantity", 1))
    total_price = float(item.get("totalPrice", 0))
    commission = item.get("commission")
    sale_price = total_price / quantity if quantity > 0 else 0

    build_code = _resolve_build_code(_BOL_MARKETPLACE, offer_reference, ean)

    event_id_str = str(event_row["id"])
    order_ref = event_row.get("external_id")  # matches poller convention

    # sold_at: Bol's orderPlacedDateTime when the poller stamped it into
    # parsed_data; otherwise the event's ingestion time (best available proxy).
    # process_bom_sale falls back to NOW() if we pass NULL.
    sold_at = item.get("orderPlacedDateTime") or event_row.get("created_at")

    with conn.cursor() as cur:
        cur.execute(
            "SELECT process_bom_sale(%s, %s, %s, %s, %s, %s, %s, %s) AS txn_id",
            (
                build_code,
                quantity,
                sale_price,
                _BOL_MARKETPLACE,
                order_ref,
                event_id_str,
                commission,
                sold_at,
            ),
        )
        return str(cur.fetchone()["txn_id"])


def _reprocess_email(event_row: dict, conn) -> str:
    """
    Reprocess an email ingestion event.

    Reconstructs an order-like object from parsed_data and calls
    write_sale (BOM-first routing per D-019, D-024, D-033).
    Returns transaction UUID string. Raises on any failure.

    Import of write_sale is deferred to call time to avoid circular imports.
    Duplication note: the RetryOrder pattern mirrors email_poller.poller.retry_pending.
    Dedup tracked as a follow-up in notes_to_human.
    """
    from email_poller.sale_writer import write_sale  # noqa: PLC0415

    pd = event_row.get("parsed_data") or {}
    event_id_str = str(event_row["id"])
    marketplace = event_row.get("marketplace") or ""

    class _Order:
        pass

    order = _Order()
    order.sku = (pd.get("sku") or "")
    order.generated_sku = pd.get("generated_sku") or order.sku
    order.product_description = pd.get("product_description") or ""
    order.marketplace = marketplace
    order.order_number = pd.get("order_number", "")
    order.price = float(pd.get("price") or 0)
    order.quantity = int(pd.get("quantity") or 1)
    order.raw_email_body = event_row.get("raw_body") or ""
    order.get_sku = lambda: order.sku  # write_sale calls order.get_sku()

    parser = get_parser_for_marketplace(marketplace)
    should_reparse = (
        order.raw_email_body
        and parser is not None
        and (
            not order.product_description
            or not order.generated_sku
            or not order.sku
            or order.sku.startswith("OMX-")
        )
    )
    if should_reparse:
        reparsed = parser.parse(
            {
                "from": event_row.get("sender", ""),
                "subject": event_row.get("subject", ""),
                "body": order.raw_email_body,
            }
        )
        if reparsed is not None:
            order.sku = reparsed.sku or order.sku
            order.generated_sku = reparsed.generated_sku or order.generated_sku
            order.product_description = (
                reparsed.product_description or order.product_description
            )
            order.price = float(pd.get("price") or reparsed.price or 0)
            order.quantity = int(pd.get("quantity") or reparsed.quantity or 1)

    # sold_at: parsed email date when the parser extracted one, otherwise the
    # event's ingestion timestamp. Ingestion timestamp is close to the email's
    # arrival for live polling; for replay it is far off — so prefer a parser
    # field when future parsers supply one.
    sold_at = pd.get("order_placed_at") or event_row.get("created_at")

    return write_sale(order, event_id_str, conn=conn, sold_at=sold_at)


# Dispatch table — maps source → reprocess callable.
# Unknown sources → 'review' (operator attention, not a retry scenario).
SOURCE_HANDLERS: dict = {
    "bolcom_api": _reprocess_bolcom,
    "email": _reprocess_email,
}


def _mark_failure(event_id: str, current_retry_count: int, exc: Exception) -> None:
    """Update event to failed or dead_letter state in a fresh transaction."""
    new_count = current_retry_count + 1
    error_text = str(exc)[:_TRUNC]

    if new_count >= MAX_RETRIES:
        logger.error(
            "Worker: event %s → dead_letter (retry_count=%d): %s: %s",
            event_id, new_count, type(exc).__name__, exc,
        )
        try:
            with get_conn() as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        """UPDATE ingestion_events
                               SET status             = 'dead_letter',
                                   retry_count        = %s,
                                   dead_letter_reason = %s
                             WHERE id = %s""",
                        (new_count, error_text, event_id),
                    )
        except Exception as update_err:
            logger.error(
                "Worker: failed to dead-letter event %s: %s", event_id, update_err
            )
    else:
        logger.warning(
            "Worker: event %s → failed (retry_count=%d): %s: %s",
            event_id, new_count, type(exc).__name__, exc,
        )
        try:
            with get_conn() as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        """UPDATE ingestion_events
                               SET status        = 'failed',
                                   retry_count   = %s,
                                   error_message = %s
                             WHERE id = %s""",
                        (new_count, error_text, event_id),
                    )
        except Exception as update_err:
            logger.error(
                "Worker: failed to mark event %s failed: %s", event_id, update_err
            )


def _mark_review(event_id: str, detail: str) -> None:
    """Update event to review state for operator follow-up."""
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """UPDATE ingestion_events
                           SET status             = 'review',
                               error_message      = %s,
                               dead_letter_reason = NULL
                         WHERE id = %s""",
                    (detail[:_TRUNC], event_id),
                )
    except Exception as update_err:
        logger.error(
            "Worker: failed to mark event %s review: %s", event_id, update_err
        )


def _process_one_event(event_id: str) -> None:
    """
    Process one ingestion event in its own transaction.

    Lock strategy (D-021): SELECT ... FOR UPDATE holds the ingestion_events
    row lock for the entire reprocess call, serializing against poller
    inline-processing of the same event.
    """
    event_data: dict | None = None

    try:
        with get_conn() as conn_outer:
            with conn_outer.cursor() as cur:
                cur.execute(
                    """SELECT id, source, marketplace, external_id,
                              sender, subject, raw_body, parsed_data, retry_count,
                              created_at
                         FROM ingestion_events
                        WHERE id = %s
                          AND status IN ('pending', 'failed')
                          AND retry_count < %s
                        FOR UPDATE""",
                    (event_id, MAX_RETRIES),
                )
                event = cur.fetchone()
                if event is None:
                    return  # Already processed or state changed since discovery

                event_data = dict(event)
                source = event_data["source"]

                if source not in SOURCE_HANDLERS:
                    # Unknown source — operator attention, no retry
                    cur.execute(
                        """UPDATE ingestion_events
                               SET status             = 'review',
                                   dead_letter_reason = %s
                             WHERE id = %s""",
                        (f"unknown source: {source}", event_id),
                    )
                    logger.warning(
                        "Worker: unknown source '%s' for event %s → review",
                        source, event_id,
                    )
                    return  # conn_outer commits on context-manager exit

                # Reprocessor runs inside the same transaction so the event-row
                # FK on transactions.source_email_id does not self-block.
                SOURCE_HANDLERS[source](event_data, conn_outer)

                # Success
                cur.execute(
                    """UPDATE ingestion_events
                           SET status       = 'processed',
                               processed_at = NOW()
                         WHERE id = %s""",
                    (event_id,),
                )
                logger.info("Worker: event %s (%s) → processed", event_id, source)

    except Exception as exc:
        if event_data is None:
            # Failed before loading event (DB connectivity issue, not a retry)
            logger.error("Worker: failed to load event %s: %s", event_id, exc)
            return
        if isinstance(exc, DraftBuildPendingError):
            logger.warning(
                "Worker: event %s (%s) moved to review — %s",
                event_id, event_data.get("source", "?"), exc,
            )
            _mark_review(event_id, str(exc))
            return
        if (
            event_data.get("source") == "email"
            and _is_stock_blocker_message(str(exc))
        ):
            logger.warning(
                "Worker: event %s (%s) moved to review for stock blocker — %s",
                event_id,
                event_data.get("source", "?"),
                exc,
            )
            _mark_review(event_id, str(exc))
            return
        logger.warning(
            "Worker: event %s (%s) failed — %s: %s",
            event_id, event_data.get("source", "?"), type(exc).__name__, exc,
        )
        _mark_failure(event_id, event_data["retry_count"], exc)


def process_pending_events() -> None:
    """
    Worker tick: process up to WORKER_BATCH_SIZE pending/failed events.

    Called by APScheduler every INGESTION_WORKER_INTERVAL_MINUTES minutes.
    Never raises — APScheduler BackgroundScheduler stops cleanly on
    unhandled job exceptions.

    Flow:
      1. Non-locking discovery SELECT (gets candidate IDs).
      2. Per-event: SELECT FOR UPDATE + reprocess + UPDATE status (D-021).
    """
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """SELECT id
                         FROM ingestion_events
                        WHERE status IN ('pending', 'failed')
                          AND retry_count < %s
                        ORDER BY created_at ASC
                        LIMIT %s""",
                    (MAX_RETRIES, WORKER_BATCH_SIZE),
                )
                event_ids = [str(row["id"]) for row in cur.fetchall()]
    except Exception as exc:
        logger.error("Worker: failed to discover pending events: %s", exc)
        return

    if not event_ids:
        logger.debug("Worker: no pending events")
        return

    logger.info("Worker: processing %d event(s)", len(event_ids))
    for event_id in event_ids:
        _process_one_event(event_id)
