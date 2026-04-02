---
phase: 04-orders-fifo-ledger
plan: 03
subsystem: api
tags: [supabase, deno, fifo, orders, ledger, repositories, vitest]
requires:
  - phase: 04-01
    provides: shared order contracts and the pure FIFO helper
  - phase: 04-02
    provides: order tables, immutable ledger schema, and SQL shipment/receipt RPCs
provides:
  - tenant-scoped order repository queries for list, detail, ledger, and shipment preview
  - typed web mutation wrappers for the inventory-orders backend surface
  - trusted inventory-orders edge function for order CRUD, receipt, shipment, and cancellation workflows
affects: [04-04, 04-05, orders-ui, fifo-preview, backend-functions]
tech-stack:
  added: []
  patterns:
    - repository-backed order workspace reads in apps/web
    - typed action wrappers over Supabase edge functions
    - service-role edge functions delegating atomic stock movement to SQL RPCs
key-files:
  created:
    - apps/web/src/lib/server/repositories/orders.ts
    - apps/web/src/lib/server/order-mutations.ts
    - supabase/functions/inventory-orders/index.ts
  modified:
    - apps/web/src/lib/server/repositories/orders.test.ts
    - apps/web/src/lib/server/order-mutations.test.ts
    - supabase/functions/README.md
key-decisions:
  - "Kept order workspace reads in tenant-scoped repositories with in-memory projections instead of direct UI Supabase calls."
  - "Used the inventory-orders edge function as the only privileged order mutation boundary, with receipt and shipment commits delegated to SQL RPCs."
  - "Handled the shared SalesOrder row contract drift locally in server code so Phase 4 could proceed without blocking on an additional shared-contract migration."
patterns-established:
  - "Order list/detail data loads through repository helpers that assemble UI view models from tenant-scoped table reads."
  - "Receive and ship flows validate the active tenant in the edge function, precompute FIFO previews, then call apply_* SQL RPCs for atomic writes."
requirements-completed: [INV-04, ORD-01, ORD-02, ORD-03]
duration: 10min
completed: 2026-04-02
---

# Phase 4 Plan 3: Orders Backend Summary

**Tenant-scoped order repositories plus a trusted inventory-orders edge function for FIFO shipment previews, purchase receipts, and ledger-backed order mutations**

## Performance

- **Duration:** 10 min
- **Started:** 2026-04-02T09:20:47Z
- **Completed:** 2026-04-02T09:30:49Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Added `listOrders`, order-detail loaders, ledger reads, and warehouse-scoped FIFO shipment previews for the orders workspace.
- Added typed web-side wrappers for every approved `inventory-orders` action with explicit `x-active-tenant` forwarding.
- Implemented the `inventory-orders` edge function so order mutations validate tenant membership, block unsafe line removal after receipts or shipments, and route durable stock changes through `apply_purchase_order_receipt` and `apply_sales_order_shipment`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add tenant-scoped order repositories, shipment preview loading, and ledger queries**
2. `ff2170f` `test(04-03): add failing order repository coverage`
3. `3ac9348` `feat(04-03): add tenant-scoped order repositories`
4. **Task 2: Add typed order-mutation wrappers and the trusted inventory-orders edge function**
5. `eb8cc86` `test(04-03): add failing order mutation wrapper coverage`
6. `fbcf317` `feat(04-03): add trusted order mutation surface`

**Plan metadata:** pending final docs commit

## Files Created/Modified

- `apps/web/src/lib/server/repositories/orders.ts` - Tenant-scoped order list/detail/ledger queries and FIFO shipment preview loading.
- `apps/web/src/lib/server/repositories/orders.test.ts` - Repository tests for tenant scoping, warehouse-scoped FIFO, and exact shortfall messaging.
- `apps/web/src/lib/server/order-mutations.ts` - Typed `inventory-orders` function wrappers used by the web app.
- `apps/web/src/lib/server/order-mutations.test.ts` - Wrapper tests for exact action names and active-tenant headers.
- `supabase/functions/inventory-orders/index.ts` - Trusted order mutation surface with active-tenant validation, line-change guards, and RPC-backed receipt/shipment workflows.
- `supabase/functions/README.md` - Backend boundary documentation for the new order workflow function.

## Decisions Made

- Kept order workspace reads in repositories that project shared UI view models from tenant-scoped tables, matching the Phase 2 inventory repository pattern.
- Returned shipment preview metadata from the edge function before commit so the UI can render exact FIFO lots, total cost, and insufficient-stock detail using one trusted backend surface.
- Let the SQL helpers stay authoritative for ledger inserts, quantity updates, and status sync so FIFO stock movement commits atomically under row locking.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Worked around shared sales-order row drift locally**
- **Found during:** Task 1 and Task 2 implementation
- **Issue:** The plan and database schema reference `expected_date` on sales orders, but the shared row contract available to the app omitted that field.
- **Fix:** Added local server-side sales-order row types in the repository and edge-function code so order reads and mutations could compile against the actual Phase 4 schema without changing shared contracts mid-plan.
- **Files modified:** `apps/web/src/lib/server/repositories/orders.ts`, `apps/web/src/lib/server/repositories/orders.test.ts`, `supabase/functions/inventory-orders/index.ts`
- **Verification:** `npm run test:server --workspace @interwall/web -- --run "src/lib/server/order-mutations.test.ts" "src/lib/server/repositories/orders.test.ts"`, `npx --yes deno check supabase/functions/inventory-orders/index.ts`, `npm run typecheck --workspaces --if-present`
- **Committed in:** `3ac9348`, `fbcf317`

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** The workaround kept Phase 4 execution unblocked without changing the approved scope.

## Issues Encountered

- A nullable ledger order-number projection caused one typecheck failure after Task 1; tightening the local helper signature resolved it before the task commit.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase `04-04` can build the Orders workspace UI against stable repository reads and typed mutation wrappers.
- Phase `04-05` can reuse both repository FIFO preview payloads and the trusted `inventory-orders` backend workflow for receive and ship task surfaces.

## Known Stubs

None.

## Self-Check: PASSED

- Found `apps/web/src/lib/server/repositories/orders.ts`
- Found `apps/web/src/lib/server/repositories/orders.test.ts`
- Found `apps/web/src/lib/server/order-mutations.ts`
- Found `apps/web/src/lib/server/order-mutations.test.ts`
- Found `supabase/functions/inventory-orders/index.ts`
- Found `supabase/functions/README.md`
- Found commit `ff2170f`
- Found commit `3ac9348`
- Found commit `eb8cc86`
- Found commit `fbcf317`

---
*Phase: 04-orders-fifo-ledger*
*Completed: 2026-04-02*
