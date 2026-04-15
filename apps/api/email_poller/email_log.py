"""
Database-backed email deduplication and logging.
Uses the ingestion_events table to track processed message_ids and store parsed data.
"""

import json
import logging
from db import get_conn

logger = logging.getLogger("email_poller.email_log")


def is_already_processed(message_id: str) -> bool:
    """Check if message_id already processed (status='processed').
    'pending' and 'failed' rows are retryable — return False for those."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT status FROM ingestion_events WHERE message_id = %s",
                (message_id,)
            )
            row = cur.fetchone()
            if row is None:
                return False  # Never seen
            return row['status'] == 'processed'  # Only skip if fully processed


def get_existing_email_id(message_id: str) -> str | None:
    """Get email UUID for an existing pending/failed row (for retry)."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id FROM ingestion_events WHERE message_id = %s AND status IN ('pending', 'failed')",
                (message_id,)
            )
            row = cur.fetchone()
            return str(row['id']) if row else None


def log_email(message_id: str, sender: str, subject: str,
              marketplace: str, parsed_type: str, raw_body: str,
              parsed_data: dict, confidence: float, status: str) -> str:
    """Insert email log row. Returns the new email UUID string."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO ingestion_events
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
                "UPDATE ingestion_events SET status=%s WHERE id=%s",
                (status, email_id)
            )
