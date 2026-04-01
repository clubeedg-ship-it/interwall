---
phase: 02-inventory-core-model
plan: 01
subsystem: api
tags: [typescript, shared-contracts, inventory, warehouse, stock]
requires:
  - phase: 01-tenant-safe-foundation
    provides: tenant-scoped shared contracts and authenticated backend boundaries
provides:
  - canonical inventory row contracts for products, warehouses, zones, shelves, and stock lots
  - shared inventory mutation payload contracts for CRUD, adjustments, and relocations
  - root package exports for downstream web and backend consumers
affects: [inventory-core-model, wall-experience, orders-fifo-ledger, kits-costing]
tech-stack:
  added: []
  patterns: [shared TypeScript domain contracts, database row plus mutation payload split]
key-files:
  created: [packages/shared/src/inventory.ts]
  modified: [packages/shared/src/database.ts, packages/shared/src/index.ts]
key-decisions:
  - "Keep inventory row types in a dedicated shared module and re-export them through both database.ts and the package root."
  - "Separate immutable stock acquisition metadata from adjustment and relocation payloads so FIFO work can layer on later without contract churn."
patterns-established:
  - "Inventory domain contracts live in @interwall/shared before schema and repository implementation."
  - "Operational payloads use concrete field names shared across web, repositories, and edge functions."
requirements-completed: [INV-01, INV-02]
duration: 3min
completed: 2026-04-01
---

# Phase 2 Plan 1: Inventory Contract Surface Summary

**Shared TypeScript contracts now define tenant-scoped products, warehouse topology, stock lots, and inventory mutation payloads for the rebuild.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-01T16:02:00Z
- **Completed:** 2026-04-01T16:05:09Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Added a canonical `packages/shared/src/inventory.ts` module for product, warehouse, zone, shelf, and stock lot row contracts.
- Re-exported inventory row contracts through `packages/shared/src/database.ts` and the shared package root.
- Added explicit product, topology, stock lot, adjustment, and relocation payload contracts for downstream API work.

## Task Commits

Each task was committed atomically:

1. **Task 1: Create shared row contracts for products, warehouse topology, and stock lots** - `0db2f95` (feat)
2. **Task 2: Define shared create/update payload contracts for inventory operations** - `a0d7fb0` (feat)

## Files Created/Modified

- `packages/shared/src/inventory.ts` - Canonical inventory row and mutation payload contracts.
- `packages/shared/src/database.ts` - Database contract surface now re-exports inventory row types.
- `packages/shared/src/index.ts` - Root shared exports now expose inventory contracts for downstream consumers.

## Decisions Made

- Kept the inventory model in a dedicated shared module instead of scattering row and payload types across app code.
- Preserved stock acquisition metadata on the row contract while excluding it from adjustment and relocation inputs.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed duplicate inventory exports from the shared root**
- **Found during:** Task 1
- **Issue:** `packages/shared/src/index.ts` exported the same inventory types from both `./database` and `./inventory`, causing TypeScript duplicate identifier errors.
- **Fix:** Narrowed `index.ts` so tenant contracts still come from `./database` while inventory contracts export directly from `./inventory`.
- **Files modified:** `packages/shared/src/index.ts`
- **Verification:** `npm run typecheck --workspace @interwall/shared`
- **Committed in:** `0db2f95`

---

**Total deviations:** 1 auto-fixed (Rule 1: 1)
**Impact on plan:** Kept the contract surface aligned with the plan and restored a clean shared package export graph.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Phase 2 schema and repository work can now implement against stable shared field names for products, warehouse hierarchy, stock lots, and stock mutations.

## Self-Check: PASSED

- Found summary file `.planning/phases/02-inventory-core-model/02-01-SUMMARY.md`
- Found commit `0db2f95`
- Found commit `a0d7fb0`

---
*Phase: 02-inventory-core-model*
*Completed: 2026-04-01*
