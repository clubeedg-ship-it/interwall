---
phase: 02-inventory-core-model
plan: 03
subsystem: api
tags: [supabase, edge-functions, inventory, stock-lots, nextjs, vitest, deno]
requires:
  - phase: 02-inventory-core-model
    provides: shared inventory contracts plus tenant-safe schema and RLS policies
  - phase: 01-tenant-safe-foundation
    provides: request-scoped Supabase auth helpers and shared edge-function tenant guards
provides:
  - typed tenant-scoped inventory repositories for products, warehouse topology, and stock-lot reads
  - thin web-side wrappers for trusted stock mutation actions
  - an inventory-stock edge function for create, update, adjust, and relocate stock-lot operations
affects: [apps/web, supabase/functions, inventory, stock, warehouse-topology, phase-03]
tech-stack:
  added: [Supabase Edge Functions, Vitest server tests, Deno check]
  patterns: [tenant-scoped repositories, edge-function inventory mutations, immutable acquisition metadata preservation]
key-files:
  created:
    [
      apps/web/src/lib/server/repositories/inventory.ts,
      apps/web/src/lib/server/repositories/inventory.test.ts,
      apps/web/src/lib/server/inventory-mutations.ts,
      apps/web/src/lib/server/inventory-mutations.test.ts,
      supabase/functions/inventory-stock/index.ts
    ]
  modified:
    [
      supabase/functions/README.md
    ]
key-decisions:
  - "Keep normal inventory reads and straightforward CRUD in request-scoped repositories, while stock mutation semantics live behind the inventory-stock edge function."
  - "Use the validated x-active-tenant header as the only tenant selector for stock mutations instead of accepting client-owned tenant ids in the payload."
  - "Preserve stock-lot acquisition fields during update and adjustment flows so later FIFO logic can build on stable lot metadata."
patterns-established:
  - "Web-side inventory mutations call Supabase edge functions through thin typed wrappers that only forward action names, payloads, and the active-tenant header."
  - "Trusted stock writes validate membership with the caller-scoped client first, then use a service-role client only for the actual mutation."
  - "Inventory repository queries always scope by tenant_id and deterministic ordering before returning shared row contracts."
requirements-completed: [INV-01, INV-02]
duration: 10min
completed: 2026-04-01
---

# Phase 2 Plan 3: Inventory Backend Surface Summary

**Tenant-scoped inventory repositories plus an inventory-stock edge function for trusted stock create, update, adjust, and relocate flows**

## Performance

- **Duration:** 10 min
- **Started:** 2026-04-01T16:21:00Z
- **Completed:** 2026-04-01T16:31:01Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Added typed inventory repository helpers for products, warehouses, zones, shelves, and stock-lot reads under the active tenant scope.
- Added a thin web-side `inventory-mutations` layer that invokes the backend stock mutation surface with explicit action names and `x-active-tenant`.
- Implemented `supabase/functions/inventory-stock` so stock create, update, adjustment, and relocation behavior runs behind shared auth and tenant membership guards.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add tenant-scoped inventory repositories for products, topology, and stock queries** - `a198386` (feat)
2. **Task 2: Add the trusted stock mutation backend function and thin web-side invoker** - `4948fdd` (feat)

## Files Created/Modified

- `apps/web/src/lib/server/repositories/inventory.ts` - typed repository helpers for tenant-scoped product, topology, and stock-lot access.
- `apps/web/src/lib/server/repositories/inventory.test.ts` - server tests covering tenant scoping, deterministic ordering, and warehouse-tree upserts.
- `apps/web/src/lib/server/inventory-mutations.ts` - thin wrappers around the `inventory-stock` edge function.
- `apps/web/src/lib/server/inventory-mutations.test.ts` - server tests proving the invoke contract forwards active-tenant headers and typed payloads unchanged.
- `supabase/functions/inventory-stock/index.ts` - trusted backend stock mutation handler with membership checks and shelf validation.
- `supabase/functions/README.md` - documents `inventory-stock` as the backend home for stock mutation semantics.

## Decisions Made

- Kept the web layer focused on typed handoff and pushed stock mutation semantics into the edge-function boundary established in Phase 1.
- Reused the shared inventory contracts for repository inputs and mutation payloads so later UI work can call one stable backend surface.
- Treated stock adjustments and updates as quantity/shelf/note operations only, preserving `received_at`, `unit_cost`, `lot_reference`, and `supplier_reference` for FIFO readiness.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrected repository writes to match the actual shelf and warehouse schema**
- **Found during:** Task 2 (Add the trusted stock mutation backend function and thin web-side invoker)
- **Issue:** The initial repository implementation targeted a non-existent `inventory_shelves` table name and omitted the required `warehouses.code` field, which would have broken real warehouse/shelf writes despite passing the first test pass.
- **Fix:** Switched repository shelf access to `shelves`, added the derived warehouse `code` field on upsert, and updated the repository tests to match the actual schema.
- **Files modified:** `apps/web/src/lib/server/repositories/inventory.ts`, `apps/web/src/lib/server/repositories/inventory.test.ts`
- **Verification:** `npm run test:server --workspace @interwall/web -- --run src/lib/server/repositories/inventory.test.ts src/lib/server/inventory-mutations.test.ts` and `npm run typecheck --workspaces --if-present`
- **Committed in:** `4948fdd`

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** The auto-fix was required for schema correctness and kept the new repository surface aligned with the Phase 2 migration. No scope creep.

## Issues Encountered

- `deno` is not installed globally in the workspace. Verification used `npx --yes deno check ...`, consistent with earlier Supabase function work.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 3 can read products, shelves, and stock lots from one typed repository surface instead of inventing client-owned inventory data.
- Later order and FIFO phases can extend the `inventory-stock` backend contract without replacing the active-tenant validation or stock-lot invariants introduced here.

## Self-Check: PASSED

- Found `.planning/phases/02-inventory-core-model/02-03-SUMMARY.md`
- Found `apps/web/src/lib/server/repositories/inventory.ts`
- Found `apps/web/src/lib/server/inventory-mutations.ts`
- Found `supabase/functions/inventory-stock/index.ts`
- Found commit `a198386`
- Found commit `4948fdd`

---
*Phase: 02-inventory-core-model*
*Completed: 2026-04-01*
