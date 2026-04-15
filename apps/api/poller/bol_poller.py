"""
Bol.com Retailer API v10 order poller (T-B01, D-097).

Polls GET /retailer/orders every BOL_POLL_INTERVAL_MINUTES (default 10).
For each new FBR order item:
  1. INSERT into ingestion_events with dedupe on (source, external_id)
  2. Resolve build_code via external_item_xref or EAN fallback
  3. Call process_bom_sale with commission override (D-098)
  4. Update ingestion_events status to processed or failed

Config via environment:
  BOL_CLIENT_ID, BOL_CLIENT_SECRET  -- OAuth2 credentials
  BOL_POLL_INTERVAL_MINUTES         -- polling frequency (default 10)
  BOL_CHANGE_INTERVAL_MINUTES       -- API window (default 15, > poll)

References:
  .project/BOL-CONTRACT.md §5 -- field mapping, endpoint shapes
  D-022: process_bom_sale is single-transaction atomic
  D-033: external_item_xref is authoritative; missing xref -> RAISE
  D-097: API polling, not webhooks, for new orders
  D-098: per-item commission override from API
  D-099: sale_price = totalPrice / quantity (post-discount)
"""

import json
import logging
import os

from db import get_conn
from poller.bol_client import BolClient

logger = logging.getLogger("poller.bol_poller")

# Marketplace name must match existing external_item_xref and vat_rates entries.
# Email parser uses 'BolCom'; vat_rates seed uses 'bolcom'; process_bom_sale
# does LOWER() comparison for VAT lookup. Case-sensitive for xref lookups.
MARKETPLACE = "BolCom"


def _resolve_build_code(marketplace: str, offer_reference: str | None, ean: str) -> str:
    """
    Resolve a Bol.com order item to a build_code.

    Resolution order (mirrors sale_writer.py but self-contained):
      1. offer.reference via external_item_xref
      2. product.ean via external_item_xref
      3. product.ean as direct build_code (T-A03 backfill, D-018)
      4. RAISE if none found (D-033)
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            # Step 1: offer.reference via xref
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

            # Step 2: EAN via xref
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

            # Step 3: direct build lookup by EAN (backfill convention)
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


def _process_order_item(item: dict, order_id: str) -> str:
    """
    Process a single Bol.com order item.

    Returns: 'new', 'duplicate', or 'failed'.
    """
    order_item_id = item["orderItemId"]
    external_id = f"bol-{order_id}-{order_item_id}"

    # Phase 1: Record the event (committed independently for durability).
    # ON CONFLICT skips if already inserted by a prior poll cycle.
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO ingestion_events
                       (message_id, source, external_id, marketplace,
                        parsed_type, parsed_data, confidence, status)
                   VALUES (%s, 'bolcom_api', %s, %s, 'sale', %s, 1.00, 'pending')
                   ON CONFLICT (source, external_id) DO NOTHING
                   RETURNING id""",
                (external_id, external_id, MARKETPLACE, json.dumps(item)),
            )
            row = cur.fetchone()
            if row is None:
                return "duplicate"
            event_id = str(row["id"])

    # Phase 2: Resolve build and process sale
    try:
        offer = item.get("offer") or {}
        product = item.get("product") or {}
        offer_reference = offer.get("reference")
        ean = product.get("ean", "")
        quantity = item.get("quantity", 1)
        total_price = item.get("totalPrice", 0)
        commission = item.get("commission")

        # D-099: sale_price = totalPrice / quantity (post-discount effective price)
        sale_price = total_price / quantity if quantity > 0 else 0

        build_code = _resolve_build_code(MARKETPLACE, offer_reference, ean)

        # Call process_bom_sale (D-022: atomic, D-098: commission override)
        # and update ingestion_events status in the same transaction.
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT process_bom_sale(%s, %s, %s, %s, %s, %s, %s) AS txn_id",
                    (
                        build_code,
                        quantity,
                        sale_price,
                        MARKETPLACE,
                        external_id,
                        event_id,
                        commission,
                    ),
                )
                cur.fetchone()
                cur.execute(
                    "UPDATE ingestion_events SET status = 'processed', "
                    "processed_at = NOW() WHERE id = %s",
                    (event_id,),
                )
        return "new"

    except Exception as e:
        logger.error("Failed to process %s: %s", external_id, e)
        try:
            with get_conn() as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        "UPDATE ingestion_events SET status = 'failed', "
                        "error_message = %s WHERE id = %s",
                        (str(e)[:1000], event_id),
                    )
        except Exception as update_err:
            logger.error("Status update failed for %s: %s", external_id, update_err)
        return "failed"


def poll_bol_once(client: "BolClient | None" = None):
    """
    Poll Bol.com API for new FBR orders. Called by APScheduler.

    Never raises out of the job -- APScheduler doesn't stop cleanly on
    unhandled exceptions from BackgroundScheduler jobs.
    """
    try:
        if client is None:
            client_id = os.environ.get("BOL_CLIENT_ID", "")
            if not client_id:
                logger.debug("BOL_CLIENT_ID not configured, skipping")
                return
            client = BolClient()

        change_interval = int(os.environ.get("BOL_CHANGE_INTERVAL_MINUTES", "15"))
        orders = client.get_orders(change_interval_minute=change_interval)

        stats = {"new": 0, "duplicate": 0, "failed": 0}

        for order_summary in orders:
            order_id = order_summary["orderId"]
            try:
                order_detail = client.get_order_detail(order_id)
            except Exception as e:
                logger.error("Failed to fetch detail for order %s: %s", order_id, e)
                stats["failed"] += 1
                continue

            for item in order_detail.get("orderItems", []):
                # Skip cancelled items
                if item.get("cancellationRequest", False):
                    continue

                # Skip FBB items (P-14: FBB not processed)
                fulfilment = item.get("fulfilment") or {}
                if fulfilment.get("method") != "FBR":
                    continue

                result = _process_order_item(item, order_id)
                stats[result] += 1

        logger.info(
            "Bol.com poll complete: %d new, %d duplicates, %d failed",
            stats["new"],
            stats["duplicate"],
            stats["failed"],
        )

    except Exception as e:
        logger.error("Bol.com poll job failed: %s", e, exc_info=True)
