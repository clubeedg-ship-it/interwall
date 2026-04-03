"""
Email poller — the APScheduler job function.

poll_once() is called by APScheduler's BackgroundScheduler (threaded, synchronous).
It connects to the IMAP server, fetches unseen emails from known marketplace senders,
parses them, logs them to the emails table, and triggers sale processing.

APScheduler config (max_instances=1, coalesce=True) is set in main.py, not here.
"""

import os
import logging
from email_poller.parsers import MediaMarktSaturnParser, BolComParser, BoulangerParser
from email_poller.email_log import is_already_processed, log_email, update_email_status
from email_poller.sale_writer import write_sale
from email_poller.imap_client import IMAPClient

logger = logging.getLogger("email_poller")

PARSERS = [MediaMarktSaturnParser(), BolComParser(), BoulangerParser()]

MARKETPLACE_SENDERS = {
    "mediamarktsaturn": "noreply@mmsmarketplace.mediamarktsaturn.com",
    "bolcom": "automail@bol.com",
    "boulanger": "marketplace.boulanger@boulanger.com",
}


def poll_once():
    """
    Single poll cycle — fetch unseen emails from all marketplace senders,
    parse and process each one. Designed to be called by APScheduler.

    If IMAP_SERVER, IMAP_EMAIL, or IMAP_PASSWORD env vars are missing,
    logs a warning and returns early (does NOT crash).
    """
    required_env = ["IMAP_SERVER", "IMAP_EMAIL", "IMAP_PASSWORD"]
    missing = [k for k in required_env if not os.environ.get(k)]
    if missing:
        logger.warning(f"Email poller disabled — missing env vars: {missing}")
        return

    try:
        with IMAPClient() as client:
            client.select_inbox()
            for name, sender in MARKETPLACE_SENDERS.items():
                try:
                    email_ids = client.search_from_sender(sender, unseen_only=True)
                    for eid in email_ids:
                        email_data = client.fetch_email(eid)
                        if email_data:
                            _process_one(email_data)
                        client.mark_as_read(eid)
                except Exception as e:
                    logger.error(f"Error processing {name} emails: {e}", exc_info=True)
    except Exception as e:
        logger.error(f"Poll cycle error: {e}", exc_info=True)


def _process_one(email_data: dict):
    """Process a single email: dedup, parse, log, and trigger sale processing."""
    message_id = email_data.get("message_id", "")
    if not message_id or is_already_processed(message_id):
        return

    parser = next((p for p in PARSERS if p.can_parse(email_data)), None)
    if not parser:
        return

    order = parser.parse(email_data)
    if not order or not order.is_valid():
        log_email(
            message_id, email_data.get("from", ""),
            email_data.get("subject", ""), "unknown", "sale",
            email_data.get("body", ""), {}, 0.0, "failed"
        )
        return

    email_id = log_email(
        message_id, email_data.get("from", ""), email_data.get("subject", ""),
        order.marketplace, "sale", order.raw_email_body,
        {"order_number": order.order_number, "sku": order.get_sku(),
         "price": order.price, "quantity": order.quantity},
        0.9, "processed"
    )

    try:
        txn_id = write_sale(order, email_id)
        logger.info(f"Sale processed: order={order.order_number} txn={txn_id}")
    except Exception as e:
        logger.error(f"Sale processing failed for {order.order_number}: {e}")
        update_email_status(email_id, "failed")
