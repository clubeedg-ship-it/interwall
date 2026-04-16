"""
Unified ingestion worker for ingestion_events (T-B02 + T-B05).

One entrypoint processes a single ingestion_events row regardless of source.
Source-specific parsing stays here; status transitions and retry/dead-letter
policy are centralized.
"""

from __future__ import annotations

import logging
import os
import re
from dataclasses import dataclass

from db import get_conn
from email_poller.parsers import get_parser_for_marketplace
from email_poller.sale_writer import DraftBuildPendingError, write_sale

logger = logging.getLogger("ingestion_worker")

MAX_ATTEMPTS = int(os.environ.get("INGESTION_MAX_ATTEMPTS", "3"))
MARKETPLACE_BOL = "BolCom"


@dataclass
class EmailOrder:
    marketplace: str
    order_number: str
    price: float
    quantity: int
    raw_email_body: str
    sku: str = ""
    generated_sku: str = ""
    product_description: str = ""

    def get_sku(self) -> str:
        return self.sku or self.generated_sku


def _is_stock_blocker_message(message: str) -> bool:
    message = (message or "").lower()
    return (
        "insufficient stock" in message
        and (
            "deduct_fifo_for_group" in message
            or "deduct_fifo_for_product" in message
        )
    )


def _resolve_bol_build_code(marketplace: str, offer_reference: str | None, ean: str) -> str:
    """Resolve a Bol.com order item to a build_code."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            if offer_reference:
                cur.execute(
                    """SELECT x.build_code, b.is_active
                       FROM external_item_xref x
                       JOIN builds b ON b.build_code = x.build_code
                       WHERE x.marketplace = %s AND x.external_sku = %s""",
                    (marketplace, offer_reference),
                )
                row = cur.fetchone()
                if row:
                    if not row["is_active"]:
                        raise RuntimeError(
                            f"D-033: xref ({marketplace}, {offer_reference}) -> "
                            f"build '{row['build_code']}' is inactive"
                        )
                    return row["build_code"]

            cur.execute(
                """SELECT x.build_code, b.is_active
                   FROM external_item_xref x
                   JOIN builds b ON b.build_code = x.build_code
                   WHERE x.marketplace = %s AND x.external_sku = %s""",
                (marketplace, ean),
            )
            row = cur.fetchone()
            if row:
                if not row["is_active"]:
                    raise RuntimeError(
                        f"D-033: xref ({marketplace}, {ean}) -> "
                        f"build '{row['build_code']}' is inactive"
                    )
                return row["build_code"]

            cur.execute(
                "SELECT build_code FROM builds WHERE build_code = %s AND is_active = TRUE",
                (ean,),
            )
            row = cur.fetchone()
            if row:
                return row["build_code"]

    raise RuntimeError(
        f"D-033: no build resolved for marketplace={marketplace}, "
        f"offer_reference={offer_reference}, ean={ean}"
    )


def _extract_original_email_sku(raw_body: str) -> str:
    patterns = [
        r"Interne referentie[^:]*:\s*([A-Za-z0-9_. /-]+)",
        r"[Rr]éférence interne[^:]*:\s*([A-Za-z0-9_. /-]+)",
    ]
    for pattern in patterns:
        match = re.search(pattern, raw_body or "")
        if match:
            return match.group(1).strip()
    return ""


def _build_email_order(event: dict) -> EmailOrder:
    parsed = event.get("parsed_data") or {}
    raw_body = event.get("raw_body") or ""
    order = EmailOrder(
        marketplace=event.get("marketplace") or "",
        order_number=parsed.get("order_number", "") or "",
        price=float(parsed.get("price", 0) or 0),
        quantity=int(parsed.get("quantity", 1) or 1),
        raw_email_body=raw_body,
        sku=parsed.get("sku", "") or _extract_original_email_sku(raw_body),
        generated_sku=parsed.get("generated_sku", "") or parsed.get("sku", "") or "",
        product_description=parsed.get("product_description", "") or "",
    )
    parser = get_parser_for_marketplace(order.marketplace)
    should_reparse = (
        raw_body
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
                "from": event.get("sender", ""),
                "subject": event.get("subject", ""),
                "body": raw_body,
            }
        )
        if reparsed is not None:
            order.sku = reparsed.sku or order.sku
            order.generated_sku = reparsed.generated_sku or order.generated_sku
            order.product_description = (
                reparsed.product_description or order.product_description
            )
            order.price = float(parsed.get("price", 0) or reparsed.price or 0)
            order.quantity = int(parsed.get("quantity", 1) or reparsed.quantity or 1)
    return order


def _process_bol_event(event: dict) -> None:
    item = event.get("parsed_data") or {}
    offer = item.get("offer") or {}
    product = item.get("product") or {}
    offer_reference = offer.get("reference")
    ean = product.get("ean", "")
    quantity = item.get("quantity", 1)
    total_price = item.get("totalPrice", 0)
    commission = item.get("commission")
    sale_price = total_price / quantity if quantity > 0 else 0

    build_code = _resolve_bol_build_code(MARKETPLACE_BOL, offer_reference, ean)

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT process_bom_sale(%s, %s, %s, %s, %s, %s, %s) AS txn_id",
                (
                    build_code,
                    quantity,
                    sale_price,
                    MARKETPLACE_BOL,
                    event["external_id"],
                    event["id"],
                    commission,
                ),
            )
            cur.fetchone()


def _process_email_event(event: dict) -> None:
    order = _build_email_order(event)
    if not order.order_number:
        raise RuntimeError("Email ingestion row missing parsed_data.order_number")
    write_sale(order, str(event["id"]))


def _load_event(event_id: str) -> dict | None:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT id, source, status, marketplace, parsed_type, parsed_data,
                          raw_body, sender, subject, external_id, message_id, attempt_count
                   FROM ingestion_events
                   WHERE id = %s""",
                (event_id,),
            )
            return cur.fetchone()


def _start_attempt(event_id: str) -> dict | None:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """UPDATE ingestion_events
                      SET attempt_count = COALESCE(attempt_count, 0) + 1,
                          last_attempt_at = NOW()
                    WHERE id = %s
                      AND status IN ('pending', 'failed')
                RETURNING id, source, status, marketplace, parsed_type, parsed_data,
                          raw_body, sender, subject, external_id, message_id, attempt_count""",
                (event_id,),
            )
            return cur.fetchone()


def _mark_processed(event_id: str) -> None:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """UPDATE ingestion_events
                      SET status = 'processed',
                          processed_at = NOW(),
                          error_message = NULL,
                          dead_letter_reason = NULL
                    WHERE id = %s""",
                (event_id,),
            )


def _mark_failure(event_id: str, attempt_count: int, error_message: str) -> str:
    trimmed = error_message[:1000]
    terminal = attempt_count >= MAX_ATTEMPTS
    status = "dead_letter" if terminal else "failed"
    dead_letter_reason = None
    if terminal:
        dead_letter_reason = f"Exceeded {MAX_ATTEMPTS} attempts: {trimmed}"[:1000]

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """UPDATE ingestion_events
                      SET status = %s,
                          error_message = %s,
                          dead_letter_reason = %s
                    WHERE id = %s""",
                (status, trimmed, dead_letter_reason, event_id),
            )
    return status


def _mark_review(event_id: str, detail: str) -> str:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """UPDATE ingestion_events
                      SET status = 'review',
                          error_message = %s,
                          dead_letter_reason = NULL
                    WHERE id = %s""",
                (detail[:1000], event_id),
            )
    return "review"


def process_ingestion_event(event_id: str) -> str:
    """
    Process one ingestion_events row.

    Returns one of: processed, failed, dead_letter, duplicate, skipped.
    """
    existing = _load_event(event_id)
    if existing is None:
        raise RuntimeError(f"ingestion_events row not found: {event_id}")
    if existing["status"] == "processed":
        return "duplicate"
    if existing["status"] == "dead_letter":
        return "dead_letter"

    event = _start_attempt(event_id)
    if event is None:
        return "skipped"

    try:
        source = event.get("source") or "email"
        if source == "bolcom_api":
            _process_bol_event(event)
        elif source == "email":
            _process_email_event(event)
        else:
            raise RuntimeError(f"Unsupported ingestion source: {source}")

        _mark_processed(event_id)
        return "processed"
    except DraftBuildPendingError as exc:
        status = _mark_review(event_id, str(exc))
        logger.warning("Ingestion processing moved %s to review: %s", event_id, exc)
        return status
    except Exception as exc:
        if source == "email" and _is_stock_blocker_message(str(exc)):
            status = _mark_review(event_id, str(exc))
            logger.warning(
                "Ingestion processing moved %s to review for stock blocker: %s",
                event_id,
                exc,
            )
            return status
        status = _mark_failure(event_id, int(event["attempt_count"]), str(exc))
        logger.error("Ingestion processing failed for %s: %s", event_id, exc)
        return status
