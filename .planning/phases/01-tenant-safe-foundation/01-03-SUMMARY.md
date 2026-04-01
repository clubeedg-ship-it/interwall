---
phase: 01-tenant-safe-foundation
plan: 03
subsystem: testing
tags: [vitest, jsdom, react-testing-library, nextjs, tenancy]
requires:
  - phase: 01-01
    provides: npm workspace registration for the new apps and packages
provides:
  - explicit `test:app` and `test:server` commands for `@interwall/web`
  - shared Vitest configuration for jsdom app tests and node server tests
  - reusable React Testing Library helpers and `next/navigation` mocks
affects: [phase-01-auth, phase-01-middleware, phase-01-memberships, testing]
tech-stack:
  added: [vitest, jsdom, @testing-library/react, @testing-library/jest-dom, @vitejs/plugin-react]
  patterns: [dual vitest projects, shared jsdom setup, reusable framework mock modules]
key-files:
  created: [apps/web/vitest.config.ts, apps/web/src/test/setup.ts, apps/web/src/test/render.tsx, apps/web/src/test/mocks/next-navigation.ts]
  modified: [apps/web/package.json, package-lock.json]
key-decisions:
  - "Defined separate `app` and `server` Vitest projects in one config so Phase 1 can verify browser-like and server-only behavior with stable commands."
  - "Enabled `--passWithNoTests` on both package scripts so the empty Phase 1 harness verifies cleanly before downstream plans add coverage."
patterns-established:
  - "Package-level test entrypoints: `npm run test:app --workspace @interwall/web` and `npm run test:server --workspace @interwall/web` are the stable verification surface."
  - "Framework mocks live under `apps/web/src/test/mocks` and are reset centrally from `src/test/setup.ts`."
requirements-completed: [TEN-01, TEN-02, TEN-03]
duration: 14min
completed: 2026-04-01
---

# Phase 01 Plan 03: App Test Harness Summary

**Vitest app/server test entrypoints with shared jsdom setup, React render helpers, and reusable Next navigation mocks for tenant-safe Phase 1 coverage**

## Performance

- **Duration:** 14 min
- **Started:** 2026-04-01T10:29:45Z
- **Completed:** 2026-04-01T10:43:45Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Added explicit `test:app` and `test:server` scripts plus the supporting test dependencies to `@interwall/web`.
- Created a reusable Vitest config with separate jsdom and node projects so later page, middleware, and server helper tests share one harness.
- Added common test setup primitives: DOM cleanup, jest-dom matchers, a shared render helper, and a resettable `next/navigation` mock module.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add app and server test scripts to the web package** - `93a9690` (chore)
2. **Task 2: Create a reusable Vitest/jsdom setup for app-shell tests** - `3e56fe8` (feat)

## Files Created/Modified

- `apps/web/package.json` - Adds the stable package-level test commands and the minimal app-test dependencies.
- `package-lock.json` - Captures the installed Vitest, jsdom, and Testing Library dependency graph.
- `apps/web/vitest.config.ts` - Defines shared alias resolution and separate `app` and `server` Vitest projects.
- `apps/web/src/test/setup.ts` - Centralizes jsdom test setup, DOM cleanup, and `next/navigation` mocking.
- `apps/web/src/test/render.tsx` - Exposes a shared React Testing Library wrapper for app tests.
- `apps/web/src/test/mocks/next-navigation.ts` - Provides reusable router, pathname, params, search param, redirect, and not-found mocks.

## Decisions Made

- Used one Vitest config with named `app` and `server` projects instead of separate config files to keep later Phase 1 verification commands simple and consistent.
- Added `--passWithNoTests` to both package scripts because this plan establishes the harness before downstream plans add actual coverage.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- `npm install` produced a root `node_modules/` directory that was untracked in this workspace, so a local `.git/info/exclude` entry was added to keep generated dependency output out of plan commits.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 1 can now verify app-shell, middleware, and server-helper work against explicit `test:app` and `test:server` commands.
- Future auth and tenancy plans can add tests under `apps/web/src` without rebuilding basic jsdom wiring or framework mocks.

## Self-Check: PASSED

- FOUND: `.planning/phases/01-tenant-safe-foundation/01-03-SUMMARY.md`
- FOUND: `93a9690`
- FOUND: `3e56fe8`
