---
phase: 02-inventory-core-model
plan: 02
subsystem: database
tags: [supabase, postgres, rls, inventory, warehouses]
requires:
  - phase: 01-tenant-safe-foundation
    provides: tenant membership predicates, shared updated-at trigger, and base tenant tables
  - phase: 02-inventory-core-model
    provides: shared inventory contracts for products, shelves, and stock lots
provides:
  - tenant-scoped inventory tables for products, warehouses, zones, shelves, and stock lots
  - lineage triggers that reject cross-tenant inventory hierarchy writes
  - member-scoped RLS policies for all phase 2 inventory tables
affects: [phase-03-wall-experience, phase-04-orders-fifo-ledger, inventory-repositories, stock-mutations]
tech-stack:
  added: []
  patterns: [inventory hierarchy in SQL, trigger-enforced tenant lineage, shelf display-code derivation]
key-files:
  created: []
  modified:
    [
      supabase/migrations/202604010002_inventory_core.sql
    ]
key-decisions:
  - "The inventory migration includes warehouse, zone, and shelf fields already present in the shared contracts so downstream phases do not need a contract-realignment migration."
  - "Tenant membership stays in RLS while parent-child correctness stays in trigger functions, keeping policies focused on access control instead of business semantics."
patterns-established:
  - "Inventory tables extend the phase 1 tenant foundation by carrying tenant_id on every row and validating lineage on write."
  - "Shelf display codes are derived in SQL from zone label plus sortable coordinates and persisted for future wall rendering."
requirements-completed: [INV-01, INV-02]
duration: 2min
completed: 2026-04-01
---

# Phase 2 Plan 2: Inventory Core Model Summary

**Supabase inventory tables with tenant-safe hierarchy checks, persisted shelf codes, and member-scoped RLS**

## Performance

- **Duration:** 2 min
- **Started:** 2026-04-01T16:14:22Z
- **Completed:** 2026-04-01T16:16:09Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments

- Added the phase 2 inventory schema for products, warehouses, inventory zones, shelves, and stock lots with the required indexes and constraints.
- Added trigger-backed lineage enforcement so zones, shelves, and stock lots cannot point across tenant boundaries or mismatched parents.
- Enabled RLS and member CRUD policies for every new inventory table using the phase 1 `public.is_tenant_member` predicate.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add inventory tables, enums, and indexes to Supabase** - `09ecc78` (feat)
2. **Task 2: Enforce tenant lineage, derived shelf codes, and RLS on the inventory tables** - `74a9ef9` (feat)

## Files Created/Modified

- `supabase/migrations/202604010002_inventory_core.sql` - creates the phase 2 inventory schema, indexes, lineage helpers, triggers, and RLS policies.

## Decisions Made

- Included `display_code`, `sort_order`, `warehouse_id`, and `label` fields that were already present in the shared inventory contracts so Phase 3 and repository work can consume one stable schema.
- Kept access control and lineage enforcement separate: RLS uses `public.is_tenant_member(tenant_id)` while triggers validate parent-child tenant consistency and derived shelf codes.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added contract-aligned warehouse, zone, and shelf columns to the migration**
- **Found during:** Task 1 (Add inventory tables, enums, and indexes to Supabase)
- **Issue:** The task list named the minimum required inventory columns, but the locked shared contracts from Plan `02-01` already depended on additional persisted fields such as `display_code`, `sort_order`, `warehouse_id`, and `label`.
- **Fix:** Added those contract-aligned columns directly in the initial migration instead of forcing a follow-up schema repair.
- **Files modified:** `supabase/migrations/202604010002_inventory_core.sql`
- **Verification:** The migration now covers both the task requirements and the existing `packages/shared/src/inventory.ts` row shapes.
- **Committed in:** `09ecc78`

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** The deviation prevented downstream contract drift. No architectural scope change.

## Issues Encountered

- `npx --yes supabase db lint` could not connect to the local Postgres instance at `127.0.0.1:54322`, so automated verification was limited to static content checks on the migration file.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 2 repository work can now target durable product, warehouse, zone, shelf, and stock-lot tables with stable field names.
- Phase 3 can render persisted shelf display codes without inventing client-owned warehouse structure.

## Self-Check: PASSED

---
*Phase: 02-inventory-core-model*
*Completed: 2026-04-01*
