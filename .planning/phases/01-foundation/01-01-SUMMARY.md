---
phase: 01-foundation
plan: 01
subsystem: database
tags: [postgresql, sql, ddl, fifo, ean-compositions, schema]

# Dependency graph
requires: []
provides:
  - PostgreSQL DDL for all nine business tables (warehouses, products, ean_compositions, zones, shelves, emails, stock_lots, transactions, fixed_costs)
  - users table for single-user session auth
  - FIFO index on stock_lots(product_id, received_at ASC)
  - stock_lots.quantity >= 0 CHECK constraint (DB-05)
  - ean_compositions self-reference guard CHECK (parent_ean <> component_ean)
  - Atomic DDL wrapped in BEGIN/COMMIT for postgres:15-alpine first-start init
  - Default 'Main Warehouse' seed row
affects: [01-02, 01-03, 02-api, 03-email-rewire, 04-frontend-wiring]

# Tech tracking
tech-stack:
  added: [postgresql-15-alpine, pgcrypto]
  patterns:
    - PostgreSQL init via /docker-entrypoint-initdb.d/ volume mount
    - UUID primary keys with gen_random_uuid() via pgcrypto
    - FIFO tracking via received_at ASC index on stock_lots
    - Self-reference guard via table-level CHECK on ean_compositions

key-files:
  created:
    - apps/api/sql/init.sql
  modified: []

key-decisions:
  - "Fresh schema from scratch per D-10 (SPECS-MVP.md data model, no RLS, no multi-tenant)"
  - "UUID primary keys on all tables using gen_random_uuid() from pgcrypto extension"
  - "FIFO sort key is received_at ASC on stock_lots — index idx_stock_lots_product_received optimizes FIFO queries"
  - "ean_compositions uses TEXT FK to products.ean (not UUID FK to products.id) to enable EAN-driven composition resolution without joins"

patterns-established:
  - "Pattern 1: All DDL wrapped in BEGIN/COMMIT for atomic init"
  - "Pattern 2: UUID PKs on all tables via DEFAULT gen_random_uuid()"
  - "Pattern 3: TIMESTAMPTZ for all timestamps (timezone-aware)"
  - "Pattern 4: NUMERIC(12,4) for all monetary values (4 decimal places)"

requirements-completed: [DB-01, DB-05]

# Metrics
duration: 5min
completed: 2026-04-02
---

# Phase 01 Plan 01: Foundation Schema Summary

**PostgreSQL DDL with 10 tables (9 business + users), FIFO index on stock_lots(product_id, received_at ASC), and CHECK constraints for quantity >= 0 and EAN self-reference prevention**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-04-02T19:48:32Z
- **Completed:** 2026-04-02T19:53:00Z
- **Tasks:** 1
- **Files modified:** 1 (created)

## Accomplishments
- Created complete PostgreSQL DDL for all 9 business tables in SPECS-MVP.md plus users table for auth
- DB-05 enforced: `stock_lots.quantity >= 0` CHECK constraint prevents negative stock via direct SQL
- Self-reference guard on `ean_compositions`: `CHECK (parent_ean <> component_ean)` prevents trivial circular refs
- FIFO-optimized partial index `idx_stock_lots_shelf` (WHERE shelf_id IS NOT NULL) for shelf-based queries
- Default 'Main Warehouse' seed enables immediate zone creation without manual setup

## Task Commits

Each task was committed atomically:

1. **Task 1: Create apps/api/sql/init.sql with all nine business tables** - `8281a88` (feat)

**Plan metadata:** _(docs commit follows)_

## Files Created/Modified
- `apps/api/sql/init.sql` - Complete PostgreSQL DDL: 10 CREATE TABLE statements, 6 indexes, pgcrypto extension, BEGIN/COMMIT wrapper, default warehouse seed

## Decisions Made
- Used TEXT foreign keys on `ean_compositions` (referencing `products.ean`) rather than UUID FKs to `products.id` — this matches the EAN-centric business logic where compositions are looked up by scanned EAN, not internal UUID
- Added `users` table (10th table, not in original 9) per plan action spec, required for INFRA-03 auth
- Followed plan exactly for all column types, constraints, and index definitions

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `apps/api/sql/init.sql` is ready to be mounted into the postgres:15-alpine container via Docker Compose volume (Plan 01-03)
- All table definitions are available for FastAPI Pydantic model generation (Plan 01-02)
- Schema supports all FIFO operations, EAN composition resolution, and email processing workflows

---
*Phase: 01-foundation*
*Completed: 2026-04-02*
