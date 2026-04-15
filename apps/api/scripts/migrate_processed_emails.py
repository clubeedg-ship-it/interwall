#!/usr/bin/env python3
"""
One-time migration: processed_emails.json -> emails table.
Run once before first email poller deployment to avoid reprocessing old emails.

Usage: python -m scripts.migrate_processed_emails

Reads from PROCESSED_EMAILS_FILE env var or defaults to
../../interwall-email-automation/data/processed_emails.json
"""

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
import db


def run():
    db.init_pool()
    data_file = os.environ.get(
        "PROCESSED_EMAILS_FILE",
        "../../interwall-email-automation/data/processed_emails.json"
    )
    if not os.path.exists(data_file):
        print(f"No file at {data_file}, skipping migration")
        return

    with open(data_file) as f:
        records = json.load(f)

    migrated = 0
    with db.get_conn() as conn:
        with conn.cursor() as cur:
            for msg_id in records:
                try:
                    cur.execute(
                        """INSERT INTO ingestion_events (message_id, status, processed_at)
                           VALUES (%s, 'processed', NOW())
                           ON CONFLICT (message_id) DO NOTHING""",
                        (msg_id,)
                    )
                    migrated += 1
                except Exception as e:
                    print(f"Skip {msg_id}: {e}")

    print(f"Migrated {migrated} processed email records")


if __name__ == "__main__":
    run()
