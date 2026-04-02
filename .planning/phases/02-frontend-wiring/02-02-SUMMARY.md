---
phase: 02-frontend-wiring
plan: "02"
subsystem: api
tags: [fastapi, products, compositions, ean, crud, session-auth]
dependency_graph:
  requires: [apps/api/auth.py, apps/api/db.py, apps/api/sql/init.sql]
  provides: [GET /api/products, POST /api/products, GET /api/products/{ean}, GET /api/compositions/{parent_ean}, PUT /api/compositions/{parent_ean}]
  affects: [apps/api/main.py]
tech_stack:
  added: []
  patterns: [FastAPI APIRouter with prefix, RealDictCursor dict rows, full-replace PUT pattern, Depends(require_session) on all endpoints]
key_files:
  created:
    - apps/api/routers/products.py
    - apps/api/routers/compositions.py
  modified:
    - apps/api/main.py
decisions:
  - "RealDictCursor in db.py returns dicts natively — no tuple-to-dict conversion needed in any router"
  - "Full-replace PUT pattern for compositions: DELETE all rows for parent then INSERT new set in one transaction"
  - "parent product existence verified before DELETE+INSERT in replace_composition to return clear 404 vs silent no-op"
metrics:
  duration: "1 minute"
  completed: "2026-04-02"
  tasks_completed: 2
  files_changed: 3
---

# Phase 02 Plan 02: Products and Compositions API Endpoints Summary

**One-liner:** FastAPI products CRUD and EAN composition full-replace endpoints with session auth and DB constraint error mapping.

## Endpoints Created

| Method | Path | Handler | Auth |
|--------|------|---------|------|
| GET | `/api/products` | `list_products(q="")` | require_session |
| GET | `/api/products/{ean}` | `get_product(ean)` | require_session |
| POST | `/api/products` | `create_product(ProductCreate)` | require_session |
| GET | `/api/compositions/{parent_ean}` | `get_composition(parent_ean)` | require_session |
| PUT | `/api/compositions/{parent_ean}` | `replace_composition(parent_ean, list[ComponentRow])` | require_session |

## Cursor Type — Dict vs Tuple Adaptation

`apps/api/db.py` initializes the connection pool with `cursor_factory=psycopg2.extras.RealDictCursor`. This means all `cur.fetchone()` and `cur.fetchall()` calls return `RealDictRow` objects (dict-like), not plain tuples. FastAPI serializes these directly via `jsonable_encoder`. No column-index tuple conversion was needed — rows are returned as-is from cursor calls.

## Full-Replace PUT Pattern

The `PUT /api/compositions/{parent_ean}` endpoint implements atomic full-replace:
1. Verify parent EAN exists in `products` table (404 if not found)
2. `DELETE FROM ean_compositions WHERE parent_ean = %s` (removes all existing rows)
3. INSERT each row from the provided `components` list
4. `UPDATE products SET is_composite = (len > 0) WHERE ean = parent_ean`

All steps execute in the same `get_conn()` context manager transaction. On any error, psycopg2 rolls back the entire transaction.

## DB Constraint Error Handling

| DB Error | Code | HTTP Response |
|----------|------|---------------|
| FK violation — component EAN not in products | 23503 | 422 "Component EAN '...' does not exist in products table" |
| CHECK violation — parent_ean = component_ean | 23514 | 422 "Component EAN cannot equal parent EAN (circular reference)" |
| UNIQUE violation — duplicate EAN on product create | unique | 409 "Product EAN '...' already exists" |

## Schema Differences Found

No differences between `init.sql` and the plan. The `ean_compositions` table has:
- `CHECK (parent_ean <> component_ean)` — maps to error code 23514
- `UNIQUE (parent_ean, component_ean)` — handled by transaction rollback
- FK `component_ean REFERENCES products(ean) ON DELETE RESTRICT` — maps to 23503

The `products` table has all expected columns: `id`, `ean`, `name`, `sku`, `is_composite`, `default_reorder_point`.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. Both routers wire directly to PostgreSQL via `get_conn()`. No hardcoded empty values or placeholder data.

## Self-Check: PASSED

Files exist:
- apps/api/routers/products.py: FOUND
- apps/api/routers/compositions.py: FOUND
- apps/api/main.py: modified with both include_router calls

Commits:
- 2a97c6e: feat(02-frontend-wiring-02): add products and compositions FastAPI routers
- e9e58aa: feat(02-frontend-wiring-02): register products and compositions routers in main.py
