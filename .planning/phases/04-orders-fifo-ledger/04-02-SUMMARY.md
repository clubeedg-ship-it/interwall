---
phase: 04-orders-fifo-ledger
plan: 02
subsystem: database
tags: [supabase, postgres, rls, fifo, orders]
requires:
  - phase: 04-01
    provides: Shared Phase 4 order, ledger, and FIFO contracts used by this migration
  - phase: 02-inventory-core-model
    provides: Tenant-safe warehouses, shelves, products, and stock_lots schema referenced by order workflows
provides:
  - Phase 4 order headers and line-item tables for purchase and sales workflows
  - Immutable stock ledger entries tied to receipt and shipment order lines
  - Server-only SQL helpers for order numbering, status sync, FIFO shipment, and PO receiving
  - Tenant-member read-only RLS for orders and ledger history
affects: [phase-04-backend-workflows, inventory-orders-function, fifo-ledger-ui]
tech-stack:
  added: [Supabase SQL migration, PostgreSQL RPC functions, RLS policies]
  patterns: [security definer stock mutation RPCs, immutable append-only ledger, trigger-based tenant lineage enforcement]
key-files:
  created: [supabase/migrations/202604010003_orders_fifo_ledger.sql]
  modified: [supabase/migrations/202604010003_orders_fifo_ledger.sql]
key-decisions:
  - "Keep order and ledger tables read-only to tenant members and route all stock-affecting writes through security-definer SQL helpers."
  - "Enforce tenant and parent-record lineage in triggers so RLS remains focused on visibility instead of business correctness."
patterns-established:
  - "Order status derives from aggregated line fulfillment, not ad hoc client state."
  - "FIFO shipment consumes locked stock_lots in received_at ascending order and appends one ledger row per consumed slice."
requirements-completed: [INV-04, ORD-01, ORD-02, ORD-03]
duration: 4m
completed: 2026-04-01
---

# Phase 4 Plan 2: Orders FIFO Ledger Summary

**Supabase Phase 4 schema with purchase and sales orders, immutable stock ledger history, and atomic receipt and FIFO shipment RPCs**

## Performance

- **Duration:** 4m
- **Started:** 2026-04-01T21:52:32Z
- **Completed:** 2026-04-01T21:56:58Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- Added the durable Phase 4 order schema: enums, sequences, purchase/sales headers, line items, and stock ledger tables.
- Added server-only SQL helpers for order numbering, status synchronization, purchase receipts, and FIFO shipments.
- Locked down orders and ledger data with immutable-history triggers and tenant-member read-only RLS policies.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add the order, line-item, and immutable ledger schema** - `c38a844` (feat)
2. **Task 2: Add order-number, status-sync, atomic workflow RPCs, ledger-immutability, and RLS rules** - `4377469` (feat)

## Files Created/Modified
- `supabase/migrations/202604010003_orders_fifo_ledger.sql` - Defines the Phase 4 order schema, lineage triggers, workflow RPCs, and ledger/RLS protections.

## Decisions Made
- Kept member access on the new order and ledger tables to `select` only, with trusted write paths implemented as `security definer` SQL functions.
- Added trigger-based tenant and parent lineage checks for order headers, lines, and ledger rows so cross-tenant references fail before data is written.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added tenant-lineage enforcement for new order and ledger records**
- **Found during:** Task 2
- **Issue:** The plan required tenant-safe persistence, but plain foreign keys did not prevent cross-tenant header, line, warehouse, and ledger references.
- **Fix:** Added trigger functions validating warehouse, order, product, stock-lot, and line-parent tenant lineage before writes.
- **Files modified:** `supabase/migrations/202604010003_orders_fifo_ledger.sql`
- **Verification:** Reviewed trigger coverage and static acceptance grep after the fix.
- **Committed in:** `4377469`

**2. [Rule 1 - Bug] Reworked FIFO stock locking to use row-lockable lot queries**
- **Found during:** Task 2
- **Issue:** The initial shipment implementation attempted to lock aggregated availability directly, which is not a safe row-locking pattern for FIFO consumption.
- **Fix:** Changed the availability check to sum over a locked lot subquery and kept the actual FIFO consumption loop ordered by `received_at asc` with `for update`.
- **Files modified:** `supabase/migrations/202604010003_orders_fifo_ledger.sql`
- **Verification:** Static acceptance grep confirmed `for update` usage in the shipment workflow after the fix.
- **Committed in:** `4377469`

---

**Total deviations:** 2 auto-fixed (1 missing critical, 1 bug)
**Impact on plan:** Both fixes were necessary for correctness and tenant safety. No scope creep beyond the migration.

## Issues Encountered
- `npx --yes supabase db lint` could not run because no local Supabase/Postgres instance was listening on `127.0.0.1:54322`. Static acceptance checks ran successfully, but runtime lint remains outstanding.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- The database now exposes the durable order and ledger primitives needed for the Phase 4 repository and edge-function work.
- Next work should execute the migration against a running local Supabase stack and use these RPCs from the trusted backend surface.

## Known Stubs

None.

## Self-Check: PASSED

- Found `.planning/phases/04-orders-fifo-ledger/04-02-SUMMARY.md`
- Found task commit `c38a844`
- Found task commit `4377469`

---
*Phase: 04-orders-fifo-ledger*
*Completed: 2026-04-01*
