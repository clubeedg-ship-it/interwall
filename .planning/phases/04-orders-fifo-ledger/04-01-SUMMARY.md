---
phase: 04-orders-fifo-ledger
plan: 01
subsystem: api
tags: [fifo, orders, ledger, shared-types, vitest]
requires:
  - phase: 03-wall-experience
    provides: shared wall workspace contracts and tenant-scoped inventory data surfaces
provides:
  - canonical purchase-order, sales-order, and stock-ledger contracts in `@interwall/shared`
  - UI-facing order workspace and FIFO preview view models
  - pure FIFO consumption helper with server-side unit coverage
affects: [phase-04-schema, phase-04-repositories, phase-04-ui, orders, ledger, fifo]
tech-stack:
  added: []
  patterns:
    - shared root exports for Phase 4 order and ledger contracts
    - pure oldest-first FIFO helper for preview and shipment workflows
key-files:
  created:
    - packages/shared/src/inventory-orders.ts
    - apps/web/src/lib/server/fifo.ts
    - apps/web/src/lib/server/fifo.test.ts
  modified:
    - packages/shared/src/inventory.ts
    - packages/shared/src/index.ts
key-decisions:
  - "Kept all order, ledger, and mutation payload contracts in `packages/shared/src/inventory.ts` so schema, functions, and UI can import one canonical Phase 4 surface."
  - "Separated UI-facing order workspace projections into `packages/shared/src/inventory-orders.ts` and re-exported them from the package root."
  - "Implemented FIFO as a pure helper that sorts a copied lot array by `received_at` and returns deterministic consumed slices, total cost, and remaining demand."
patterns-established:
  - "Order and ledger semantics are fixed in shared contracts before database and UI implementation."
  - "Shipment preview and shipment execution must share the same FIFO slice shape and oldest-first helper."
requirements-completed: [INV-04, ORD-01, ORD-02, ORD-03]
duration: 4min
completed: 2026-04-01
---

# Phase 4 Plan 1: Orders Contract Surface Summary

**Canonical order, ledger, and FIFO contracts plus a deterministic shipment-consumption helper for downstream Phase 4 schema, backend, and UI work**

## Performance

- **Duration:** 4 min
- **Started:** 2026-04-01T21:46:00Z
- **Completed:** 2026-04-01T21:50:09Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Added shared purchase-order, sales-order, line-item, stock-ledger, and mutation payload contracts to `@interwall/shared`.
- Added order workspace, order detail, ledger projection, and FIFO preview view models for the approved Phase 4 UI.
- Added a pure FIFO helper with oldest-first multi-lot coverage, insufficient-stock behavior, and total-cost assertions.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add canonical order, line, ledger, and order-workspace contracts** - `2aecbca` (feat)
2. **Task 2: Add the pure FIFO consumption helper used by preview and shipment flows** - `99bc4e7` (test), `c53faee` (feat)

## Files Created/Modified

- `packages/shared/src/inventory.ts` - Phase 4 order rows, ledger rows, and mutation payload contracts.
- `packages/shared/src/inventory-orders.ts` - UI-facing order list, detail, ledger, and FIFO preview projections.
- `packages/shared/src/index.ts` - Root exports for the new Phase 4 shared types.
- `apps/web/src/lib/server/fifo.ts` - Pure oldest-first FIFO consumption helper.
- `apps/web/src/lib/server/fifo.test.ts` - Unit coverage for preview and shipment consumption rules.

## Decisions Made

- Kept row contracts and mutation payloads together in `inventory.ts` so later schema, function, and repository plans do not drift on field names.
- Split order workspace projections into `inventory-orders.ts` because they are UI-facing compositions rather than persistence rows.
- Kept FIFO side-effect free and input-immutable so preview flows and shipment execution can reuse one deterministic algorithm.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrected the mixed-cost FIFO total assertion**
- **Found during:** Task 2 (Add the pure FIFO consumption helper used by preview and shipment flows)
- **Issue:** The initial red test expected `7.5`, but the specified demand only consumed one unit from the final priced lot.
- **Fix:** Updated the test assertion to the correct `5.25` total cost.
- **Files modified:** `apps/web/src/lib/server/fifo.test.ts`
- **Verification:** `npm run test:server --workspace @interwall/web -- --run "src/lib/server/fifo.test.ts"`
- **Committed in:** `c53faee`

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** The fix kept the FIFO contract accurate without changing scope.

## Issues Encountered

- Parallel `git` metadata polling returned stale hashes during concurrent commit execution, so final commit hashes were confirmed from a fresh `git log --oneline -5` pass before summary creation.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 4 now has a stable contract surface for schema, repository, edge-function, and UI work.
- Downstream plans can implement receiving, shipping, and ledger persistence against fixed field names and one shared FIFO algorithm.

## Self-Check: PASSED

- Found `.planning/phases/04-orders-fifo-ledger/04-01-SUMMARY.md`
- Found commit `2aecbca`
- Found commit `99bc4e7`
- Found commit `c53faee`

---
*Phase: 04-orders-fifo-ledger*
*Completed: 2026-04-01*
