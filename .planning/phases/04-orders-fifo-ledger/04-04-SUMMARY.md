---
phase: 04-orders-fifo-ledger
plan: 04
subsystem: ui
tags: [nextjs, react, server-actions, orders, vitest]
requires:
  - phase: 04-orders-fifo-ledger
    provides: typed order detail repositories and mutation wrappers from 04-03
provides:
  - orders workspace shell navigation and authenticated routes
  - split-pane order list/detail surface for purchase and sales orders
  - tenant-resolved draft order create, update, confirm, and cancel actions
  - draft-safe header and line editing components for order workflows
affects: [04-05, orders-ui, order-actions]
tech-stack:
  added: []
  patterns:
    - tenant-resolved Next.js server actions for order mutations
    - client-side draft editing state that submits typed server action payloads
key-files:
  created:
    - apps/web/src/app/(app)/orders/page.tsx
    - apps/web/src/app/(app)/orders/[orderId]/page.tsx
    - apps/web/src/app/(app)/orders/actions.ts
    - apps/web/src/components/orders/order-header-form.tsx
    - apps/web/src/components/orders/order-line-editor.tsx
  modified:
    - packages/ui/src/components/wall-shell.tsx
    - apps/web/src/components/orders/order-workspace-screen.tsx
    - apps/web/src/components/orders/order-detail-panel.tsx
    - apps/web/src/lib/server/repositories/orders.ts
    - packages/shared/src/inventory-orders.ts
key-decisions:
  - "Kept order draft editing in client state and routed persistence through tenant-resolved server actions."
  - "Extended the shared order detail view model with warehouseId and counterpartyReference so existing draft headers can prefill correctly."
patterns-established:
  - "Orders routes mirror /workspace tenant resolution and always render inside WallShell with activeItem='orders'."
  - "Order lifecycle buttons stay singular and verb-first, with stock-moving actions deferred to the next plan."
requirements-completed: [ORD-01, ORD-02]
duration: 25min
completed: 2026-04-02
---

# Phase 04 Plan 04: Orders Workspace Summary

**Orders workspace routes, wall-shell navigation, and draft-safe purchase and sales order editing via tenant-resolved Next.js server actions**

## Performance

- **Duration:** 25 min
- **Started:** 2026-04-02T09:36:00Z
- **Completed:** 2026-04-02T10:01:58Z
- **Tasks:** 2
- **Files modified:** 16

## Accomplishments

- Added `/orders` and `/orders/[orderId]` routes inside the existing wall shell, including the new Orders rail and mobile navigation destination.
- Built the browse-first split-pane orders workspace with list rows, status badges, read-only detail, and responsive shell-aligned layout.
- Added tenant-resolved server actions plus concrete header and line-edit components so draft purchase and sales orders can be created, updated, confirmed, and cancelled without stock movement flows.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add the Orders workspace route, shell navigation entry, and browse-first list-detail screen**
   `cd585d6` (test), `ab40efa` (feat)
2. **Task 2: Add order header create or update forms, draft-safe line editing, and non-stock lifecycle actions**
   `b3f2416` (test), `f84752b` (feat), `2ad754d` (fix)

## Files Created/Modified

- `packages/ui/src/components/wall-shell.tsx` - adds the Orders destination to desktop and mobile shell navigation.
- `apps/web/src/app/(app)/orders/page.tsx` - loads the default orders workspace route inside `WallShell`.
- `apps/web/src/app/(app)/orders/[orderId]/page.tsx` - loads a selected order route inside the same shell.
- `apps/web/src/app/(app)/orders/actions.ts` - resolves active tenant scope and delegates order mutations through typed wrappers.
- `apps/web/src/components/orders/order-workspace-screen.tsx` - owns list/detail orchestration plus local draft editing state.
- `apps/web/src/components/orders/order-detail-panel.tsx` - renders singular primary actions, read-only detail, and editable draft surfaces.
- `apps/web/src/components/orders/order-header-form.tsx` - provides purchase and sales header inputs with verb-first action copy.
- `apps/web/src/components/orders/order-line-editor.tsx` - provides draft-safe add/remove line editing and non-draft fulfilled quantity display.
- `apps/web/src/lib/server/repositories/orders.ts` - exposes draft-prefill metadata in the order detail projection.
- `packages/shared/src/inventory-orders.ts` - adds shared detail fields needed by the editing surface.

## Decisions Made

- Kept the new Orders workspace inside the existing wall-first shell instead of introducing a detached admin surface.
- Routed all order mutations through server actions that resolve the active tenant on the server and then call the Phase 4 mutation wrappers.
- Treated draft line editing as local client state in this plan so the later receive/ship plan can layer stock movement flows onto the same workspace without reworking routing or shell composition.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed WallShell active-nav fallback typing during Task 1 verification**
- **Found during:** Task 1
- **Issue:** the initial Orders nav change compiled in tests but failed the production build because the active nav fallback could be inferred as `undefined`.
- **Fix:** replaced the fallback with an explicit `WallNavItem`-satisfying object so the header state pill stays type-safe.
- **Files modified:** `packages/ui/src/components/wall-shell.tsx`
- **Verification:** targeted orders tests and `npm run build --workspace @interwall/web`
- **Committed in:** `ab40efa`

**2. [Rule 2 - Missing Critical] Prefilled existing draft metadata for update flows**
- **Found during:** Task 2 follow-up verification
- **Issue:** existing draft headers did not restore `warehouseId` or counterparty reference values, making update flows incomplete for real orders.
- **Fix:** extended the shared order detail projection and repository mapping with `warehouseId` and `counterpartyReference`, then restored those values into the draft editor state.
- **Files modified:** `packages/shared/src/inventory-orders.ts`, `apps/web/src/lib/server/repositories/orders.ts`, `apps/web/src/components/orders/order-workspace-screen.tsx`
- **Verification:** targeted orders tests and `npm run build --workspace @interwall/web`
- **Committed in:** `2ad754d`

---

**Total deviations:** 2 auto-fixed (1 bug, 1 missing critical)
**Impact on plan:** Both fixes were required for a shippable Orders workspace and did not expand scope beyond the approved plan.

## Issues Encountered

- `revalidatePath` throws outside the Next.js server-action runtime, so the actions test suite needed an explicit `next/cache` mock.
- The workspace renders both desktop and mobile shell navigation in JSDOM, so route tests had to assert the active Orders destination without assuming a single matching node.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The Orders workspace now exposes stable routes, list/detail composition, and draft-safe lifecycle surfaces for purchase and sales orders.
- Phase `04-05` can add receive/ship drawers, FIFO preview, and the read-only ledger UI on top of the current workspace and server-action boundary.

## Self-Check

PASSED

---
*Phase: 04-orders-fifo-ledger*
*Completed: 2026-04-02*
