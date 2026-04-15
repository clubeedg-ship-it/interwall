"""
T-B04 — Bol.com email fallback gating tests.

Runner:
  docker compose exec -T api python -m pytest /app/tests/t_B04_email_poller_fallback.py -v --tb=short
"""

import sys

sys.path.insert(0, "/app")

from email_poller import poller


class FakeIMAPClient:
    def __init__(self):
        self.selected = False
        self.search_calls = []

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def select_inbox(self):
        self.selected = True

    def search_from_sender(self, sender, unseen_only=True):
        self.search_calls.append((sender, unseen_only))
        return []


def _configure_poller(monkeypatch, fallback_value=None):
    fake_client = FakeIMAPClient()
    monkeypatch.setattr(poller, "retry_pending", lambda: None)
    monkeypatch.setattr(poller, "IMAPClient", lambda: fake_client)
    monkeypatch.setenv("IMAP_SERVER", "imap.test")
    monkeypatch.setenv("IMAP_EMAIL", "user@test.invalid")
    monkeypatch.setenv("IMAP_PASSWORD", "secret")
    if fallback_value is None:
        monkeypatch.delenv(poller.ENABLE_BOL_EMAIL_FALLBACK, raising=False)
    else:
        monkeypatch.setenv(poller.ENABLE_BOL_EMAIL_FALLBACK, fallback_value)
    return fake_client


def _bol_email():
    return {
        "message_id": "b04-bol-message",
        "from": "automail@bol.com",
        "subject": "Nieuwe bestelling: OMX-B04-LOCAL (bestelnummer: A000E71TN6)",
        "body": "EUR 299,00\nAantal: 1\n15 april 2026\n",
    }


def test_default_mode_excludes_bol_sender(monkeypatch):
    fake_client = _configure_poller(monkeypatch)

    poller.poll_once()

    searched = [sender for sender, _ in fake_client.search_calls]
    assert poller.MARKETPLACE_SENDERS["bolcom"] not in searched
    assert poller.MARKETPLACE_SENDERS["mediamarktsaturn"] in searched
    assert poller.MARKETPLACE_SENDERS["boulanger"] in searched


def test_fallback_enabled_restores_bol_sender(monkeypatch):
    fake_client = _configure_poller(monkeypatch, "true")

    poller.poll_once()

    searched = [sender for sender, _ in fake_client.search_calls]
    assert poller.MARKETPLACE_SENDERS["bolcom"] in searched
    assert poller.MARKETPLACE_SENDERS["mediamarktsaturn"] in searched
    assert poller.MARKETPLACE_SENDERS["boulanger"] in searched


def test_default_mode_ignores_bol_email_in_direct_processing(monkeypatch):
    monkeypatch.delenv(poller.ENABLE_BOL_EMAIL_FALLBACK, raising=False)
    monkeypatch.setattr(poller, "is_already_processed", lambda message_id: False)

    inserted = []
    processed = []
    monkeypatch.setattr(
        poller,
        "_insert_email_event",
        lambda *args, **kwargs: inserted.append((args, kwargs)) or "evt-1",
    )
    monkeypatch.setattr(
        poller,
        "process_ingestion_event",
        lambda event_id: processed.append(event_id) or "processed",
    )

    poller._process_one(_bol_email())

    assert inserted == []
    assert processed == []


def test_fallback_enabled_restores_bol_direct_processing(monkeypatch):
    monkeypatch.setenv(poller.ENABLE_BOL_EMAIL_FALLBACK, "1")
    monkeypatch.setattr(poller, "is_already_processed", lambda message_id: False)

    inserted = []
    processed = []

    def fake_insert(*args, **kwargs):
        inserted.append((args, kwargs))
        return "evt-1"

    monkeypatch.setattr(poller, "_insert_email_event", fake_insert)
    monkeypatch.setattr(
        poller,
        "process_ingestion_event",
        lambda event_id: processed.append(event_id) or "processed",
    )

    poller._process_one(_bol_email())

    assert len(inserted) == 1
    assert inserted[0][0][2] == "BolCom"
    assert inserted[0][0][3]["order_number"] == "A000E71TN6"
    assert processed == ["evt-1"]
