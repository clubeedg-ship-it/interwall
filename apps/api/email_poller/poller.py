"""
Email poller — the APScheduler job function.

poll_once() is called by APScheduler's BackgroundScheduler (threaded, synchronous).
It connects to the IMAP server, fetches unseen emails from known marketplace senders,
parses them, logs them to the emails table, and triggers sale processing.

APScheduler config (max_instances=1, coalesce=True) is set in main.py, not here.
"""

import json
import os
import logging
from email_poller.parsers import MediaMarktSaturnParser, BolComParser, BoulangerParser
from db import get_conn
from email_poller.email_log import is_already_processed
from ingestion_worker import process_ingestion_event
from email_poller.imap_client import IMAPClient

logger = logging.getLogger("email_poller")

ENABLE_BOL_EMAIL_FALLBACK = "ENABLE_BOL_EMAIL_FALLBACK"

PARSERS = [
    ("mediamarktsaturn", MediaMarktSaturnParser()),
    ("bolcom", BolComParser()),
    ("boulanger", BoulangerParser()),
]

MARKETPLACE_SENDERS = {
    "mediamarktsaturn": "noreply@mmsmarketplace.mediamarktsaturn.com",
    "bolcom": "automail@bol.com",
    "boulanger": "marketplace.boulanger@boulanger.com",
}


def _bol_email_fallback_enabled() -> bool:
    value = os.environ.get(ENABLE_BOL_EMAIL_FALLBACK, "")
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _active_marketplaces() -> list[str]:
    marketplaces = ["mediamarktsaturn", "boulanger"]
    if _bol_email_fallback_enabled():
        marketplaces.insert(1, "bolcom")
    return marketplaces


def _active_marketplace_senders() -> dict[str, str]:
    return {name: MARKETPLACE_SENDERS[name] for name in _active_marketplaces()}


def _active_parsers():
    active = set(_active_marketplaces())
    return [parser for name, parser in PARSERS if name in active]


def poll_once(fetch_all=False):
    """
    Single poll cycle — fetch emails from all marketplace senders,
    parse and process each one. Designed to be called by APScheduler.

    Args:
        fetch_all: If True, fetch ALL emails (not just unseen).
                   Use after a data reset when emails were already marked read.

    If IMAP_SERVER, IMAP_EMAIL, or IMAP_PASSWORD env vars are missing,
    logs a warning and returns early (does NOT crash).
    """
    # First, retry any pending/failed emails from previous cycles
    retry_pending()

    required_env = ["IMAP_SERVER", "IMAP_EMAIL", "IMAP_PASSWORD"]
    missing = [k for k in required_env if not os.environ.get(k)]
    if missing:
        logger.warning(f"Email poller disabled — missing env vars: {missing}")
        return

    unseen_only = not fetch_all
    logger.info(f"Poll starting (fetch_all={fetch_all})")

    try:
        with IMAPClient() as client:
            client.select_inbox()
            for name, sender in _active_marketplace_senders().items():
                try:
                    email_ids = client.search_from_sender(sender, unseen_only=unseen_only)
                    logger.info(f"{name}: {len(email_ids)} emails to process")
                    for eid in email_ids:
                        email_data = client.fetch_email(eid)
                        if email_data:
                            _process_one(email_data)
                        if unseen_only:
                            client.mark_as_read(eid)
                except Exception as e:
                    logger.error(f"Error processing {name} emails: {e}", exc_info=True)
    except Exception as e:
        logger.error(f"Poll cycle error: {e}", exc_info=True)

    logger.info("Poll complete")


def retry_pending():
    """Retry all pending/failed email ingestion rows through the shared worker."""
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """SELECT id
                       FROM ingestion_events
                       WHERE status IN ('pending', 'failed')
                         AND source = 'email'
                         AND parsed_data IS NOT NULL
                         AND (parsed_data->>'order_number') IS NOT NULL"""
                )
                rows = cur.fetchall()

        if not rows:
            return

        logger.info(f"Retrying {len(rows)} pending/failed emails")
        for row in rows:
            process_ingestion_event(str(row["id"]))
    except Exception as e:
        logger.error(f"Retry cycle error: {e}", exc_info=True)


def _insert_email_event(
    message_id: str,
    email_data: dict,
    marketplace: str,
    parsed_data: dict,
    status: str,
    error_message: str | None = None,
) -> str:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO ingestion_events (
                       message_id, sender, subject, marketplace, parsed_type,
                       raw_body, parsed_data, confidence, status, source,
                       processed_at, error_message
                   ) VALUES (
                       %s, %s, %s, %s, 'sale', %s, %s, %s, %s, 'email',
                       CASE WHEN %s = 'processed' THEN NOW() ELSE NULL END, %s
                   ) RETURNING id""",
                (
                    message_id,
                    email_data.get("from", ""),
                    email_data.get("subject", ""),
                    marketplace,
                    email_data.get("body", ""),
                    json.dumps(parsed_data),
                    0.9 if parsed_data else 0.0,
                    status,
                    status,
                    error_message,
                ),
            )
            return str(cur.fetchone()["id"])


def _process_one(email_data: dict):
    """Process a single email: dedup, parse, log, and trigger sale processing."""
    message_id = email_data.get("message_id", "")
    if not message_id or is_already_processed(message_id):
        return

    parser = next((p for p in _active_parsers() if p.can_parse(email_data)), None)
    if not parser:
        return

    order = parser.parse(email_data)
    if not order or not order.is_valid():
        _insert_email_event(
            message_id,
            email_data,
            "unknown",
            {},
            "failed",
            error_message="Email parser returned no valid order",
        )
        return

    email_id = _insert_email_event(
        message_id,
        {
            **email_data,
            "body": order.raw_email_body,
        },
        order.marketplace,
        {
            "order_number": order.order_number,
            "sku": order.sku,
            "generated_sku": order.generated_sku,
            "product_description": order.product_description,
            "price": order.price,
            "quantity": order.quantity,
        },
        "pending",
    )

    result = process_ingestion_event(email_id)
    if result == "processed":
        logger.info(f"Sale processed: order={order.order_number} event={email_id}")
    else:
        logger.error("Sale processing failed for %s: status=%s", order.order_number, result)
