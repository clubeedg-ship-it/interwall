"""
Regression — IMAP poller must skip already-seen message_ids instead of
crashing on the `ingestion_events.message_id` UNIQUE constraint.

Prod outage 2026-04-13 → 2026-04-20: scheduled and manual polls aborted
because `_process_one` only checked status='processed' for dedup.
Pending/failed rows from prior polls caused fresh INSERT attempts that
violated `emails_message_id_key`, killing the entire marketplace batch.

This test pins the fix: an existing row in any status causes the
poller to skip cleanly.

Runner:
  docker compose exec -T api python -m pytest /app/tests/t_HOTFIX_poller_dedup.py -q
"""

from __future__ import annotations

import sys
import uuid

import pytest

sys.path.insert(0, "/app")

import db
from email_poller.email_log import is_already_seen
from email_poller import poller as poller_mod


TAG = uuid.uuid4().hex[:6]


@pytest.fixture(scope="session", autouse=True)
def init_pool():
    db.init_pool()
    yield


@pytest.fixture(autouse=True)
def cleanup():
    yield
    with db.get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            "DELETE FROM ingestion_events WHERE message_id LIKE %s",
            (f"hotfix-{TAG}-%",),
        )


def _seed_row(message_id: str, status: str) -> str:
    with db.get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """INSERT INTO ingestion_events
                   (message_id, source, marketplace, parsed_type,
                    parsed_data, confidence, status)
               VALUES (%s, 'email', 'BolCom', 'sale', '{}', 0.5, %s)
               RETURNING id""",
            (message_id, status),
        )
        return str(cur.fetchone()["id"])


def test_is_already_seen_returns_true_for_any_status():
    for status in ("pending", "failed", "review", "dead_letter", "processed"):
        msg = f"hotfix-{TAG}-seen-{status}"
        _seed_row(msg, status)
        assert is_already_seen(msg) is True, f"status={status} should be seen"


def test_is_already_seen_false_when_no_row():
    assert is_already_seen(f"hotfix-{TAG}-never-existed") is False


def test_process_one_skips_when_message_id_pending_in_db(monkeypatch):
    """The original prod bug: a pending row caused _process_one to try
    a fresh INSERT, hitting the UNIQUE constraint and aborting the
    whole batch. The fix returns 'skipped' instead."""
    msg = f"hotfix-{TAG}-bug-repro"
    _seed_row(msg, "pending")

    # If the bug were back, _process_one would call _insert_email_event
    # and raise psycopg.errors.UniqueViolation. Spy it to make sure the
    # dedup short-circuits before any insert path runs.
    insert_called = []
    monkeypatch.setattr(
        poller_mod,
        "_insert_email_event",
        lambda *a, **k: insert_called.append(True) or "should-not-run",
    )

    outcome = poller_mod._process_one(
        {
            "message_id": msg,
            "from": "automail@bol.com",
            "subject": "fake",
            "body": "fake",
        }
    )

    assert outcome == "skipped"
    assert not insert_called, "must not attempt INSERT for an already-seen message"


def test_process_one_skips_failed_rows_too():
    msg = f"hotfix-{TAG}-bug-failed"
    _seed_row(msg, "failed")
    outcome = poller_mod._process_one(
        {
            "message_id": msg,
            "from": "automail@bol.com",
            "subject": "fake",
            "body": "fake",
        }
    )
    assert outcome == "skipped"


def test_process_one_skips_when_message_id_missing():
    outcome = poller_mod._process_one({"message_id": "", "from": "x", "subject": "y"})
    assert outcome == "skipped"


def test_process_one_skips_when_no_parser_matches():
    msg = f"hotfix-{TAG}-no-parser"
    outcome = poller_mod._process_one(
        {
            "message_id": msg,
            "from": "random@example.com",
            "subject": "not a marketplace email",
            "body": "blah",
        }
    )
    assert outcome == "skipped"
    # Did not insert a row either
    assert is_already_seen(msg) is False
