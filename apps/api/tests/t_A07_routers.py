"""
T-A07 — FastAPI routers for item-groups, builds, external-xref.
10 test cases covering CRUD, integrity guards, auto-generation, and auth.

Runner:
  docker compose exec -T api python -m pytest /app/tests/t_A07_routers.py -v --tb=short

DB pool is initialized once via a session fixture. Cleanup deletes
test-created rows by predictable prefixes.
"""
import uuid
import pytest
import sys
sys.path.insert(0, "/app")

import db
from main import app
from auth import require_session

# Override auth: always return a fake session
app.dependency_overrides[require_session] = lambda: {"user_id": "test-user"}

TAG = uuid.uuid4().hex[:8]


def _name(name: str) -> str:
    return f"TEST-A07-{TAG}-{name}"


# ── Fixtures ─────────────────────────────────────────────────────────

@pytest.fixture(scope="session", autouse=True)
def init_pool():
    """Initialize the DB connection pool once for the entire test session.
    Don't close — TestClient lifespan also calls close_pool on exit."""
    db.init_pool()
    yield


@pytest.fixture(scope="session")
def client(init_pool):
    """Starlette TestClient — session scope so lifespan runs once."""
    from starlette.testclient import TestClient
    with TestClient(app, raise_server_exceptions=False) as c:
        yield c


@pytest.fixture(autouse=True)
def clean_db():
    """Delete only rows created by this module after each test."""
    created = {
        "build_codes": set(),
        "item_group_ids": set(),
        "product_ids": set(),
        "product_eans": set(),
    }
    yield created
    with db.get_conn() as conn:
        with conn.cursor() as cur:
            build_codes = sorted(created["build_codes"])
            item_group_ids = sorted(created["item_group_ids"])
            product_ids = sorted(created["product_ids"])
            product_eans = sorted(created["product_eans"])

            if build_codes:
                cur.execute(
                    """DELETE FROM stock_ledger_entries
                       WHERE transaction_id IN (
                           SELECT id FROM transactions WHERE build_code = ANY(%s)
                       )""",
                    (build_codes,),
                )
                cur.execute(
                    "DELETE FROM transactions WHERE build_code = ANY(%s)",
                    (build_codes,),
                )
                cur.execute(
                    "DELETE FROM external_item_xref WHERE build_code = ANY(%s)",
                    (build_codes,),
                )
                cur.execute(
                    """DELETE FROM build_components
                       WHERE build_id IN (
                           SELECT id FROM builds WHERE build_code = ANY(%s)
                       )""",
                    (build_codes,),
                )
                cur.execute(
                    "DELETE FROM builds WHERE build_code = ANY(%s)",
                    (build_codes,),
                )

            if item_group_ids:
                cur.execute(
                    "DELETE FROM item_group_members WHERE item_group_id = ANY(%s::uuid[])",
                    (item_group_ids,),
                )
                cur.execute(
                    "DELETE FROM item_groups WHERE id = ANY(%s::uuid[])",
                    (item_group_ids,),
                )

            if product_ids:
                cur.execute(
                    "DELETE FROM stock_lots WHERE product_id = ANY(%s::uuid[])",
                    (product_ids,),
                )
                cur.execute(
                    "DELETE FROM products WHERE id = ANY(%s::uuid[])",
                    (product_ids,),
                )
            elif product_eans:
                cur.execute(
                    "DELETE FROM products WHERE ean = ANY(%s)",
                    (product_eans,),
                )


# ── Helpers ──────────────────────────────────────────────────────────

def _create_test_product(cur, ean: str, name: str) -> str:
    cur.execute(
        """INSERT INTO products (ean, name) VALUES (%s, %s)
           ON CONFLICT (ean) DO UPDATE SET name = EXCLUDED.name
           RETURNING id""",
        (ean, name),
    )
    return str(cur.fetchone()["id"])


def _create_test_group(cur, code: str, name: str) -> str:
    cur.execute(
        """INSERT INTO item_groups (code, name) VALUES (%s, %s)
           ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name
           RETURNING id""",
        (code, name),
    )
    return str(cur.fetchone()["id"])


def _seed_group_with_product(created: dict, suffix: str = "") -> tuple[str, str]:
    tag = uuid.uuid4().hex[:8]
    with db.get_conn() as conn:
        with conn.cursor() as cur:
            ean = _name(f"EAN-{tag}")
            pid = _create_test_product(cur, ean, f"Test Product {tag}")
            gid = _create_test_group(cur, f"test_a07_grp_{TAG}_{tag}{suffix}", f"Test Group {tag}")
            cur.execute(
                """INSERT INTO item_group_members (item_group_id, product_id)
                   VALUES (%s, %s)
                   ON CONFLICT DO NOTHING""",
                (gid, pid),
            )
    created["product_ids"].add(pid)
    created["product_eans"].add(ean)
    created["item_group_ids"].add(gid)
    return gid, pid


# ── Test Cases ───────────────────────────────────────────────────────

class TestCase1_ItemGroupsCRUD:
    """Case 1 — item_groups CRUD round-trip."""

    def test_crud_round_trip(self, client, clean_db):
        group_name = f"Test GPU Pool {TAG}"
        # CREATE
        r = client.post("/api/item-groups", json={"name": group_name, "description": "RTX pool"})
        assert r.status_code == 201, r.text
        data = r.json()
        gid = data["id"]
        clean_db["item_group_ids"].add(gid)
        assert data["name"] == group_name
        assert data["code"] == f"test_gpu_pool_{TAG}"

        # LIST — group exists (may not be on page 1 due to alpha sort)
        r = client.get("/api/item-groups", params={"per_page": 200})
        assert r.status_code == 200
        assert r.json()["total"] > 0
        # Verify our group is findable via detail (list may span many pages)
        r = client.get(f"/api/item-groups/{gid}")
        assert r.status_code == 200

        # GET detail
        r = client.get(f"/api/item-groups/{gid}")
        assert r.status_code == 200
        assert r.json()["name"] == group_name
        assert r.json()["members"] == []

        # PATCH
        r = client.patch(f"/api/item-groups/{gid}", json={"name": "Updated GPU Pool"})
        assert r.status_code == 200
        assert r.json()["name"] == "Updated GPU Pool"

        # DELETE (no references)
        r = client.delete(f"/api/item-groups/{gid}")
        assert r.status_code == 200

        # Confirm gone
        r = client.get(f"/api/item-groups/{gid}")
        assert r.status_code == 404


class TestCase2_ItemGroupDeleteBlocked:
    """Case 2 — item_groups DELETE blocked by build_component reference."""

    def test_delete_blocked_by_build_component(self, client, clean_db):
        gid, _ = _seed_group_with_product(clean_db, "_c2")
        build_code = _name("BLD-C2")

        # Create a build that references this group
        r = client.post("/api/builds", json={
            "build_code": build_code,
            "description": "test build",
            "components": [{"item_group_id": gid, "quantity": 1}],
        })
        assert r.status_code == 201, r.text
        clean_db["build_codes"].add(build_code)

        # DELETE should be blocked
        r = client.delete(f"/api/item-groups/{gid}")
        assert r.status_code == 409
        assert "build components" in r.json()["detail"].lower()


class TestCase3_MembersAttachDetach:
    """Case 3 — item_group_members attach/detach with priority."""

    def test_attach_detach_with_priority(self, client, clean_db):
        tag = uuid.uuid4().hex[:6]
        with db.get_conn() as conn:
            with conn.cursor() as cur:
                gid = _create_test_group(cur, f"test_a07_mbr_{TAG}_{tag}", f"Member Group {tag}")
                p1 = _create_test_product(cur, _name(f"M1-{tag}"), f"Prod M1 {tag}")
                p2 = _create_test_product(cur, _name(f"M2-{tag}"), f"Prod M2 {tag}")
                p3 = _create_test_product(cur, _name(f"M3-{tag}"), f"Prod M3 {tag}")
        clean_db["item_group_ids"].add(gid)
        clean_db["product_ids"].update([p1, p2, p3])

        # Attach 3 products with priorities
        for pid, prio in [(p1, 10), (p2, 20), (p3, 30)]:
            r = client.post(f"/api/item-groups/{gid}/members", json={"product_id": pid, "priority": prio})
            assert r.status_code == 201, r.text

        # GET detail — members present
        r = client.get(f"/api/item-groups/{gid}")
        assert r.status_code == 200
        members = r.json()["members"]
        assert len(members) == 3
        priorities = [m["priority"] for m in members]
        assert priorities == sorted(priorities)  # ordered by priority

        # Detach one
        r = client.delete(f"/api/item-groups/{gid}/members/{p2}")
        assert r.status_code == 200

        # Confirm 2 remain
        r = client.get(f"/api/item-groups/{gid}")
        assert len(r.json()["members"]) == 2


class TestCase4_BuildsAutoAssign:
    """Case 4 — builds auto-assign BLD-NNN."""

    def test_auto_assign_build_code(self, client, clean_db):
        import re
        r1 = client.post("/api/builds", json={"description": _name("auto test 1")})
        assert r1.status_code == 201, r1.text
        code1 = r1.json()["build_code"]
        clean_db["build_codes"].add(code1)
        assert re.match(r"^BLD-\d+$", code1), f"Expected BLD-NNN, got {code1}"

        r2 = client.post("/api/builds", json={"description": _name("auto test 2")})
        assert r2.status_code == 201, r2.text
        code2 = r2.json()["build_code"]
        clean_db["build_codes"].add(code2)
        assert re.match(r"^BLD-\d+$", code2)
        # Second should have a higher number
        n1 = int(code1.split("-")[1])
        n2 = int(code2.split("-")[1])
        assert n2 > n1, f"Expected incrementing: {code1} < {code2}"


class TestCase5_BuildsPutFullReplace:
    """Case 5 — builds PUT full-replace atomic."""

    def test_put_full_replace(self, client, clean_db):
        gid1, _ = _seed_group_with_product(clean_db, "_c5a")
        gid2, _ = _seed_group_with_product(clean_db, "_c5b")
        _, pid4 = _seed_group_with_product(clean_db, "_c5d")
        build_code = _name("REPLACE")

        r = client.post("/api/builds", json={
            "build_code": build_code,
            "components": [
                {"source_type": "item_group", "item_group_id": gid1, "quantity": 1},
                {"source_type": "item_group", "item_group_id": gid2, "quantity": 2},
            ],
        })
        assert r.status_code == 201
        clean_db["build_codes"].add(build_code)
        assert len(r.json()["components"]) == 2

        r = client.put(f"/api/builds/{build_code}", json={
            "components": [
                {"source_type": "item_group", "item_group_id": gid1, "quantity": 3},
                {"source_type": "item_group", "item_group_id": gid2, "quantity": 1},
                {"source_type": "product", "product_id": pid4, "quantity": 5},
            ],
        })
        assert r.status_code == 200
        assert len(r.json()["components"]) == 3

        r = client.get(f"/api/builds/{build_code}")
        assert r.status_code == 200
        components = r.json()["components"]
        assert len(components) == 3
        quantities = sorted([c["quantity"] for c in components])
        assert quantities == [1, 3, 5]
        product_components = [c for c in components if c["source_type"] == "product"]
        assert len(product_components) == 1
        assert product_components[0]["product_id"] == pid4
        assert product_components[0]["product_name"].startswith("Test Product")


class TestCase6_AutoGeneratedProtection:
    """Case 6 — builds auto-generated protection (D-018)."""

    def test_auto_generated_reject_mutation(self, client):
        # Find an auto-generated build from T-A03 backfill
        with db.get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT build_code FROM builds WHERE is_auto_generated = TRUE LIMIT 1"
                )
                row = cur.fetchone()
        assert row is not None, "No auto-generated builds found (T-A03 backfill missing?)"
        bc = row["build_code"]

        # PUT → 409
        r = client.put(f"/api/builds/{bc}", json={"components": []})
        assert r.status_code == 409, f"PUT on auto-gen should be 409, got {r.status_code}"

        # PATCH description → 409
        r = client.patch(f"/api/builds/{bc}", json={"description": "hack"})
        assert r.status_code == 409

        # DELETE → 409
        r = client.delete(f"/api/builds/{bc}")
        assert r.status_code == 409


class TestCase7_XrefResolveHappy:
    """Case 7 — external-xref resolve happy path."""

    def test_resolve_happy(self, client, clean_db):
        build_code = _name("XREF-H")
        marketplace = _name("mp")
        external_sku = _name("sku")
        # Create a build for the xref
        r = client.post("/api/builds", json={"build_code": build_code, "description": "xref test"})
        assert r.status_code == 201
        clean_db["build_codes"].add(build_code)

        # Create xref
        r = client.post("/api/external-xref", json={
            "marketplace": marketplace,
            "external_sku": external_sku,
            "build_code": build_code,
        })
        assert r.status_code == 201

        # Resolve
        r = client.get("/api/external-xref/resolve", params={"marketplace": marketplace, "sku": external_sku})
        assert r.status_code == 200
        assert r.json()["build_code"] == build_code


class TestCase8_XrefResolveMissing:
    """Case 8 — external-xref resolve missing → 404."""

    def test_resolve_missing(self, client):
        r = client.get("/api/external-xref/resolve", params={
            "marketplace": "nonexistent",
            "sku": "NOSKU",
        })
        assert r.status_code == 404


class TestCase9_XrefResolveInactiveBuild:
    """Case 9 — external-xref resolve against inactive build → 404 (D-033)."""

    def test_resolve_inactive_build(self, client, clean_db):
        build_code = _name("INACTIVE")
        marketplace = _name("inactive-mp")
        external_sku = _name("inactive-sku")
        # Create build
        r = client.post("/api/builds", json={"build_code": build_code, "description": "will deactivate"})
        assert r.status_code == 201
        clean_db["build_codes"].add(build_code)

        # Create xref
        r = client.post("/api/external-xref", json={
            "marketplace": marketplace,
            "external_sku": external_sku,
            "build_code": build_code,
        })
        assert r.status_code == 201

        # Deactivate the build directly in DB
        with db.get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("UPDATE builds SET is_active = FALSE WHERE build_code = %s", (build_code,))

        # Resolve → 404 because build is inactive
        r = client.get("/api/external-xref/resolve", params={
            "marketplace": marketplace,
            "sku": external_sku,
        })
        assert r.status_code == 404
        assert "inactive" in r.json()["detail"].lower()


class TestCase10_AuthGate:
    """Case 10 — auth gate: unauthenticated requests rejected."""

    def test_unauthenticated_rejected(self, client):
        # Remove the override temporarily
        original = app.dependency_overrides.pop(require_session)
        try:
            r = client.get("/api/item-groups")
            assert r.status_code == 401, f"Expected 401, got {r.status_code}"

            r = client.get("/api/builds")
            assert r.status_code == 401

            r = client.get("/api/external-xref")
            assert r.status_code == 401
        finally:
            # Restore override for other tests
            app.dependency_overrides[require_session] = original


# ── Final pass/fail line ─────────────────────────────────────────────
if __name__ == "__main__":
    exit_code = pytest.main([__file__, "-v", "--tb=short"])
    if exit_code == 0:
        print("\nT-A07 ALL TESTS PASSED")
    else:
        print("\nT-A07 TESTS FAILED")
    raise SystemExit(exit_code)
