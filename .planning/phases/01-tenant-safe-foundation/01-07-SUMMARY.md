---
phase: 01-tenant-safe-foundation
plan: 07
subsystem: api
tags: [supabase, edge-functions, deno, auth, tenancy]
requires:
  - phase: 01-tenant-safe-foundation
    provides: monorepo workspace scaffolding for apps/web and shared packages
provides:
  - documented Supabase backend ownership for privileged tenant and auth behavior
  - reusable edge-function auth, tenant-context, and JSON error helpers
  - tenant membership edge function contract for later app handoff
affects: [apps/web, supabase/functions, tenant-admin, auth, rls]
tech-stack:
  added: [Supabase Edge Functions, Deno.serve]
  patterns: [shared edge-function guards, backend-only membership mutations, request-scoped tenant validation]
key-files:
  created:
    [
      supabase/functions/README.md,
      supabase/functions/_shared/auth.ts,
      supabase/functions/_shared/errors.ts,
      supabase/functions/_shared/tenant-context.ts,
      supabase/functions/tenant-memberships/index.ts
    ]
  modified: []
key-decisions:
  - "Keep privileged tenant and auth rules under supabase/functions and treat apps/web as a thin handoff layer."
  - "Use shared request-scoped auth and tenant guard helpers so later edge functions inherit the same backend checks."
  - "Expose tenant membership operations as action-routed Deno.serve handlers for Phase 1 app actions to target."
patterns-established:
  - "Edge functions resolve the caller through requireBackendUser before any tenant-aware work."
  - "Tenant-aware operations validate x-active-tenant or explicit tenantId through shared guard helpers."
  - "Privileged membership writes use a service-role client while caller authorization is checked with the request-scoped client."
requirements-completed: [TEN-01, TEN-02, TEN-03]
duration: 5min
completed: 2026-04-01
---

# Phase 1 Plan 7: Backend Boundary Summary

**Supabase edge-function guards and a tenant-memberships backend endpoint for privileged Phase 1 tenant administration**

## Performance

- **Duration:** 5 min
- **Started:** 2026-04-01T10:39:00Z
- **Completed:** 2026-04-01T10:44:18Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Established `supabase/functions` as the explicit backend home for privileged tenant and auth behavior.
- Added reusable auth, tenant-context, and JSON error helpers for future edge functions.
- Created a concrete `tenant-memberships` function with list, role update, removal, and existing-user membership creation handlers.

## Task Commits

Each task was committed atomically:

1. **Task 1: Define the backend ownership boundary and shared function guards** - `080d19c` (feat)
2. **Task 2: Create the first concrete tenant-memberships backend entrypoint** - `3e15d2b` (feat)

## Files Created/Modified

- `supabase/functions/README.md` - documents the backend ownership contract for privileged tenant and auth logic.
- `supabase/functions/_shared/auth.ts` - creates request-scoped and service-role Supabase clients and resolves the backend user.
- `supabase/functions/_shared/errors.ts` - standardizes JSON success/error responses and request validation failures.
- `supabase/functions/_shared/tenant-context.ts` - enforces active-tenant, membership, and tenant-admin requirements.
- `supabase/functions/tenant-memberships/index.ts` - provides the first action-routed Phase 1 edge function for tenant membership reads and admin mutations.

## Decisions Made

- Privileged tenant and auth rules now live under `supabase/functions`, not inside `apps/web` actions.
- Shared edge-function helpers own caller resolution and tenant guard logic so later functions reuse one contract.
- Membership administration is exposed as a single backend entrypoint with named actions rather than spreading logic across multiple app-owned handlers.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Switched Supabase imports to Deno-friendly URL imports**
- **Found during:** Task 1 (Define the backend ownership boundary and shared function guards)
- **Issue:** `deno check` could not resolve `npm:@supabase/supabase-js@2` without a Deno config and local node module bridging.
- **Fix:** Replaced npm-specifier imports with `https://esm.sh/@supabase/supabase-js@2.49.8` URL imports in the new edge-function files.
- **Files modified:** `supabase/functions/_shared/auth.ts`, `supabase/functions/_shared/tenant-context.ts`, `supabase/functions/tenant-memberships/index.ts`
- **Verification:** `npx --yes deno check supabase/functions/_shared/auth.ts supabase/functions/_shared/tenant-context.ts supabase/functions/_shared/errors.ts` and `npx --yes deno check supabase/functions/tenant-memberships/index.ts`
- **Committed in:** `080d19c`, `3e15d2b`

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** The import change was required to make the new Deno edge-function surface verifiable in this workspace. No scope creep.

## Issues Encountered

- The workspace does not have a global `deno` binary installed. Verification ran successfully with `npx --yes deno ...` instead.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Later Phase 1 work can call `supabase/functions/tenant-memberships` instead of owning privileged membership logic in `apps/web`.
- The shared guard files are ready for follow-on RLS, active-tenant, and sign-in plans.

## Self-Check: PASSED

- Found `.planning/phases/01-tenant-safe-foundation/01-07-SUMMARY.md`
- Found commit `080d19c`
- Found commit `3e15d2b`

---
*Phase: 01-tenant-safe-foundation*
*Completed: 2026-04-01*
