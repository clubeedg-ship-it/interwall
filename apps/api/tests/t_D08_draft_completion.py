"""
T-D08 — Draft Build completion flow.

Covers:
  * GET /api/builds?draft_only=true filters to draft Builds and reports draft_count
  * GET /api/builds/{code} exposes draft_metadata (marketplace, sku, pending count)
  * POST /api/builds/{code}/complete-draft activates the draft, replaces components,
    and replays linked review-status ingestion events
  * POST /api/external-xref displaces an existing draft xref + draft Build
    when an operator points the SKU at another Build

Runner:
  docker compose exec -T api python -m pytest /app/tests/t_D08_draft_completion.py -q
"""

import json
import sys
import uuid

import pytest

sys.path.insert(0, "/app")

import db
from main import app
from auth import require_session
from ingestion_worker import process_ingestion_event

app.dependency_overrides[require_session] = lambda: {"user_id": "test-user"}

TAG = uuid.uuid4().hex[:8]
MARKETPLACE = f"draft_d08_{TAG}_mp"
SKU = f"D08-SKU-{TAG}"
ORDER_NUMBER = f"D08-ORD-{TAG}"


@pytest.fixture(scope="session", autouse=True)
def init_pool():
    db.init_pool()
    yield


@pytest.fixture(scope="session")
def client(init_pool):
    from starlette.testclient import TestClient
    with TestClient(app, raise_server_exceptions=False) as c:
        yield c


@pytest.fixture(autouse=True)
def cleanup():
    yield
    with db.get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM stock_ledger_entries WHERE transaction_id IN (SELECT id FROM transactions WHERE marketplace = %s)",
                (MARKETPLACE,),
            )
            cur.execute("DELETE FROM transactions WHERE marketplace = %s", (MARKETPLACE,))
            cur.execute(
                "DELETE FROM external_item_xref WHERE marketplace = %s",
                (MARKETPLACE,),
            )
            cur.execute(
                "DELETE FROM ingestion_events WHERE marketplace = %s",
                (MARKETPLACE,),
            )
            cur.execute(
                """DELETE FROM build_components
                    WHERE build_id IN (
                        SELECT id FROM builds WHERE build_code LIKE %s OR build_code = %s
                    )""",
                (f"%{TAG}%", SKU),
            )
            cur.execute(
                "DELETE FROM builds WHERE build_code LIKE %s OR build_code = %s",
                (f"%{TAG}%", SKU),
            )
            cur.execute(
                "DELETE FROM products WHERE ean LIKE %s",
                (f"%{TAG}%",),
            )


def _seed_part(suffix: str = "p1") -> tuple[str, str]:
    ean = f"D08{TAG}{suffix}"
    with db.get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO products (ean, name)
                   VALUES (%s, %s)
                   ON CONFLICT (ean) DO UPDATE SET name = EXCLUDED.name
                   RETURNING id""",
                (ean, f"Part {ean}"),
            )
            pid = str(cur.fetchone()["id"])
    return pid, ean


def _seed_review_event() -> str:
    """Insert a review-status ingestion event linked to the (MARKETPLACE, SKU) pair."""
    with db.get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO ingestion_events (
                       message_id, sender, subject, marketplace, parsed_type,
                       raw_body, parsed_data, confidence, status, source, error_message
                   ) VALUES (
                       %s, %s, %s, %s, 'sale',
                       %s, %s, 0.9, 'review', 'email', 'Draft build pending'
                   )
                   RETURNING id""",
                (
                    f"d08-{TAG}-{uuid.uuid4().hex[:6]}",
                    "seller@test.invalid",
                    "Nieuwe bestelling: D08 product",
                    MARKETPLACE,
                    "raw body",
                    json.dumps(
                        {
                            "order_number": ORDER_NUMBER,
                            "sku": SKU,
                            "generated_sku": SKU,
                            "product_description": "D08 Test Product",
                            "price": 99.0,
                            "quantity": 1,
                        }
                    ),
                ),
            )
            return str(cur.fetchone()["id"])


def _seed_draft_for_unresolved() -> str:
    """Drive the email worker to create a draft Build + xref for the test SKU."""
    with db.get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO ingestion_events (
                       message_id, sender, subject, marketplace, parsed_type,
                       raw_body, parsed_data, confidence, status, source
                   ) VALUES (
                       %s, %s, %s, %s, 'sale',
                       %s, %s, 0.9, 'pending', 'email'
                   )
                   RETURNING id""",
                (
                    f"d08-seed-{TAG}",
                    "seller@test.invalid",
                    "Nieuwe bestelling: Seed",
                    MARKETPLACE,
                    "raw body",
                    json.dumps(
                        {
                            "order_number": ORDER_NUMBER,
                            "sku": SKU,
                            "generated_sku": SKU,
                            "product_description": "D08 Test Product",
                            "price": 99.0,
                            "quantity": 1,
                        }
                    ),
                ),
            )
            event_id = str(cur.fetchone()["id"])
    outcome = process_ingestion_event(event_id)
    assert outcome == "review", f"expected review, got {outcome}"
    with db.get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT build_code FROM external_item_xref WHERE marketplace = %s AND external_sku = %s",
                (MARKETPLACE, SKU),
            )
            row = cur.fetchone()
            assert row is not None, "draft xref not created"
            return row["build_code"]


# ── Tests ────────────────────────────────────────────────────────────


def test_draft_only_filter_lists_draft_builds_and_reports_count(client):
    draft_code = _seed_draft_for_unresolved()

    r = client.get("/api/builds", params={"draft_only": "true", "per_page": 200})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["draft_count"] >= 1
    codes = [it["build_code"] for it in body["items"]]
    assert draft_code in codes
    item = next(it for it in body["items"] if it["build_code"] == draft_code)
    assert item["is_draft"] is True
    assert item["draft_marketplace"] == MARKETPLACE
    assert item["draft_external_sku"] == SKU


def test_get_build_exposes_draft_metadata(client):
    draft_code = _seed_draft_for_unresolved()
    extra_event_id = _seed_review_event()

    r = client.get(f"/api/builds/{draft_code}")
    assert r.status_code == 200, r.text
    body = r.json()
    md = body.get("draft_metadata")
    assert md is not None
    assert md["marketplace"] == MARKETPLACE
    assert md["external_sku"] == SKU
    assert md["pending_review_count"] >= 1
    # parsed_descriptions includes the seeded product description
    assert any("D08 Test Product" in d for d in md["parsed_descriptions"])
    # quiet linter for unused id
    assert extra_event_id


def test_complete_draft_activates_replaces_components_and_replays_events(client):
    draft_code = _seed_draft_for_unresolved()
    review_event_id = _seed_review_event()
    pid, _ean = _seed_part("c1")

    r = client.post(
        f"/api/builds/{draft_code}/complete-draft",
        json={
            "name": "Completed D08 Build",
            "components": [
                {"source_type": "product", "product_id": pid, "quantity": 1},
            ],
            "replay": True,
        },
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["build_code"] == draft_code
    assert body["is_active"] is True
    assert body["replay"]["candidates"] >= 1
    # No real stock seeded → process_bom_sale will fail with insufficient stock,
    # which the worker classifies as 'review' (stock blocker), not 'failed'.
    # We just verify the row was reattempted: status should no longer be 'review'
    # ONLY when stock is present. Without stock the row remains/returns to review.
    # Either outcome proves replay touched the row.

    # The build should now be active with the new component
    r2 = client.get(f"/api/builds/{draft_code}")
    assert r2.status_code == 200
    detail = r2.json()
    assert detail["is_active"] is True
    assert len(detail["components"]) == 1
    assert detail["components"][0]["product_id"] == pid
    # Draft metadata gone now that build is active
    assert detail["draft_metadata"] is None
    # Description marker stripped
    assert "[DRAFT-UNRESOLVED-SKU]" not in (detail["description"] or "")

    # Confirm the review event was at least re-attempted (status changed away from
    # the original 'review' OR error_message updated by the worker)
    with db.get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT status, attempt_count FROM ingestion_events WHERE id = %s",
                (review_event_id,),
            )
            row = cur.fetchone()
            # Replay reset attempt_count to 0 then ran one attempt → 1
            assert row["attempt_count"] >= 1


def test_complete_draft_rejects_non_draft(client):
    """Cannot complete-draft a regular active build."""
    pid, _ean = _seed_part("nd")
    r = client.post(
        "/api/builds",
        json={
            "name": f"Non-draft {TAG}",
            "components": [
                {"source_type": "product", "product_id": pid, "quantity": 1},
            ],
        },
    )
    assert r.status_code == 201, r.text
    code = r.json()["build_code"]

    r2 = client.post(
        f"/api/builds/{code}/complete-draft",
        json={
            "components": [
                {"source_type": "product", "product_id": pid, "quantity": 2},
            ],
        },
    )
    assert r2.status_code == 409, r2.text


def test_xref_create_displaces_existing_draft_when_operator_remaps_to_existing_build(client):
    draft_code = _seed_draft_for_unresolved()
    pid, _ean = _seed_part("x1")

    # Operator creates a fresh, real Build elsewhere
    r = client.post(
        "/api/builds",
        json={
            "name": f"Real D08 Build {TAG}",
            "components": [
                {"source_type": "product", "product_id": pid, "quantity": 1},
            ],
        },
    )
    assert r.status_code == 201, r.text
    real_code = r.json()["build_code"]

    # Now the operator maps (MARKETPLACE, SKU) to the real Build.
    # The existing draft xref + draft Build should be displaced atomically.
    r2 = client.post(
        "/api/external-xref",
        json={
            "marketplace": MARKETPLACE,
            "external_sku": SKU,
            "build_code": real_code,
        },
    )
    assert r2.status_code == 201, r2.text
    new_xref = r2.json()
    assert new_xref["build_code"] == real_code

    # Draft Build is gone
    with db.get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM builds WHERE build_code = %s", (draft_code,))
            assert cur.fetchone() is None

            cur.execute(
                "SELECT build_code FROM external_item_xref WHERE marketplace = %s AND external_sku = %s",
                (MARKETPLACE, SKU),
            )
            row = cur.fetchone()
            assert row is not None
            assert row["build_code"] == real_code


def test_xref_create_409_when_existing_mapping_points_at_non_draft(client):
    pid, _ean = _seed_part("nd2")

    # Two real, non-draft Builds
    r1 = client.post(
        "/api/builds",
        json={
            "name": f"Real A {TAG}",
            "components": [{"source_type": "product", "product_id": pid, "quantity": 1}],
        },
    )
    assert r1.status_code == 201
    code_a = r1.json()["build_code"]

    r2 = client.post(
        "/api/builds",
        json={
            "name": f"Real B {TAG}",
            "components": [{"source_type": "product", "product_id": pid, "quantity": 1}],
        },
    )
    assert r2.status_code == 201
    code_b = r2.json()["build_code"]

    # First mapping wins
    sku = f"NDSKU-{TAG}"
    r3 = client.post(
        "/api/external-xref",
        json={"marketplace": MARKETPLACE, "external_sku": sku, "build_code": code_a},
    )
    assert r3.status_code == 201, r3.text

    # Trying to repoint at a non-draft → 409
    r4 = client.post(
        "/api/external-xref",
        json={"marketplace": MARKETPLACE, "external_sku": sku, "build_code": code_b},
    )
    assert r4.status_code == 409, r4.text
