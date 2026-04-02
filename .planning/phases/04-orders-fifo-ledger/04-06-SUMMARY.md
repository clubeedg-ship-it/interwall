---
phase: 04-orders-fifo-ledger
plan: 06
subsystem: api
tags: [types, orders, fifo, ledger, repositories, shared, nextjs, vitest]
requires:
  - phase: 04-01
    provides: shared Phase 4 order and ledger contracts
  - phase: 04-03
    provides: tenant-scoped order repositories that needed contract realignment
provides:
  - schema-aligned shared Phase 4 purchase, sales, and ledger row contracts
  - orders repository reads that import canonical shared order and ledger rows directly
  - green verification across affected server tests, workspace typecheck, and web build
affects: [04-03, 04-04, 04-05, orders-ui, fifo-preview, shared-contracts]
tech-stack:
  added: []
  patterns:
    - shared row contracts mirror SQL column names exactly
    - repository table queries consume shared row types without local compatibility aliases
key-files:
  created: []
  modified:
    - packages/shared/src/inventory.ts
    - apps/web/src/lib/server/repositories/orders.ts
    - apps/web/src/lib/server/repositories/orders.test.ts
key-decisions:
  - "Removed the repository-local workaround types instead of preserving compatibility aliases so the shared contracts remain the only authoritative Phase 4 row surface."
  - "Kept UI-facing detail view models unchanged while mapping row-level notes fields to existing note properties at the repository boundary."
patterns-established:
  - "Phase 4 schema-backed row interfaces in @interwall/shared should use the exact SQL column names, including plural notes fields and ledger foreign-key columns."
  - "Repository fixtures and table maps should import shared row contracts directly so type drift is caught by workspace typecheck."
requirements-completed: [INV-04, ORD-01, ORD-02, ORD-03]
duration: 3min
completed: 2026-04-02
---

# Phase 4 Plan 6: Orders Contract Gap Closure Summary

**Canonical shared Phase 4 order and ledger row contracts now match the SQL schema, and the orders repository consumes them directly without local workaround types**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-02T11:43:23Z
- **Completed:** 2026-04-02T11:46:55Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Realigned the shared Phase 4 purchase, sales, and ledger row interfaces to the current SQL schema, including plural `notes` fields and the ledger foreign-key columns used by repository queries.
- Removed the orders repository’s local duplicate sales and ledger row types and switched it to import the canonical shared contracts directly.
- Updated repository fixtures to the schema-backed shared shape and re-verified the affected server tests, workspace typecheck, and production web build.

## Task Commits

Each task was committed atomically:

1. **Task 1: Align the shared Phase 4 row contracts to the real SQL schema** - `24a13c8` (fix)
2. **Task 2: Remove repository-local workaround row types and re-verify the orders surface** - `1c87cb0` (fix)

**Plan metadata:** pending final docs commit

## Files Created/Modified

- `packages/shared/src/inventory.ts` - Realigned Phase 4 purchase, sales, and ledger row interfaces with the SQL column set.
- `apps/web/src/lib/server/repositories/orders.ts` - Imports shared sales and ledger rows directly and maps `notes` into existing view-model fields.
- `apps/web/src/lib/server/repositories/orders.test.ts` - Uses the shared row contracts in test fixtures so schema drift fails typecheck immediately.

## Decisions Made

- Removed the repository-local workaround types rather than adding compatibility aliases because the plan’s goal was to restore one canonical shared contract surface.
- Preserved existing UI-facing detail models by translating row-level `notes` fields to the repository view-model `note` fields instead of changing downstream UI contracts in this gap-closure plan.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Updated repository fixtures after the shared row contract rename**
- **Found during:** Task 2 (Remove repository-local workaround row types and re-verify the orders surface)
- **Issue:** Workspace typecheck failed because repository tests still created purchase and sales fixtures with the old row-level `note` fields and sales-order `expected_date`.
- **Fix:** Switched the test file to import the shared sales and ledger row contracts directly and updated fixtures to the schema-backed `notes` shape.
- **Files modified:** `apps/web/src/lib/server/repositories/orders.test.ts`
- **Verification:** `npm run test:server --workspace @interwall/web -- --run "src/lib/server/fifo.test.ts" "src/lib/server/repositories/orders.test.ts" "src/lib/server/order-mutations.test.ts"`, `npm run typecheck --workspaces --if-present`, `npm run build --workspace @interwall/web`
- **Committed in:** `1c87cb0`

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** The follow-on fixture update was required for the shared-contract change to verify cleanly end to end. No scope creep.

## Issues Encountered

- The plan’s canned Task 1 grep checked for `expected_date` anywhere in `packages/shared/src/inventory.ts`, but non-row input and view-model contracts still legitimately use that field. Row-interface inspection and the Task 2 verification runs confirmed the intended gap closure.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 4 now has the canonical shared order and ledger row surface that `04-03`, `04-04`, and `04-05` can rely on without local repository remapping.
- Future order-related tests should keep importing shared row contracts directly so schema drift is caught during typecheck instead of being worked around locally.

## Known Stubs

None.

## Self-Check: PASSED

- Found `.planning/phases/04-orders-fifo-ledger/04-06-SUMMARY.md`
- Found commit `24a13c8`
- Found commit `1c87cb0`
