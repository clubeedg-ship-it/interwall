"""
Database-backed email deduplication and logging.
Uses the emails table to track processed message_ids and store parsed data.
"""

import json
import logging
from db import get_conn

logger = logging.getLogger("email_poller.email_log")


def is_already_processed(message_id: str) -> bool:
    """Check if message_id already in emails table."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT 1 FROM emails WHERE message_id = %s", (message_id,))
            return cur.fetchone() is not None


def log_email(message_id: str, sender: str, subject: str,
              marketplace: str, parsed_type: str, raw_body: str,
              parsed_data: dict, confidence: float, status: str) -> str:
    """Insert email log row. Returns the new email UUID string."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO emails
                   (message_id, sender, subject, marketplace, parsed_type,
                    raw_body, parsed_data, confidence, status, processed_at)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
                   RETURNING id""",
                (message_id, sender, subject, marketplace, parsed_type,
                 raw_body, json.dumps(parsed_data), confidence, status)
            )
            return str(cur.fetchone()['id'])


def update_email_status(email_id: str, status: str) -> None:
    """Update status of an already-logged email (e.g. 'failed')."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE emails SET status=%s WHERE id=%s",
                (status, email_id)
            )
