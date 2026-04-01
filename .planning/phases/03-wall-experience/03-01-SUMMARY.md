---
phase: 03-wall-experience
plan: 01
subsystem: ui
tags: [react, nextjs, vitest, wall-ui, shared-contracts]
requires:
  - phase: 02-inventory-core-model
    provides: tenant-safe inventory contracts, repositories, and stock mutation entrypoints
provides:
  - typed wall view-model contracts for shelves, zones, shelf detail, and scanner state
  - wall-first workspace route composition with a responsive shell
  - reusable wall shell navigation for desktop orb rail and mobile action bar
affects: [03-02, 03-03, apps/web workspace route, packages/ui shell patterns]
tech-stack:
  added: []
  patterns: [explicit wall view-model contracts, shell-plus-screen route composition, split vitest app/server configs]
key-files:
  created:
    - packages/shared/src/inventory-wall.ts
    - packages/ui/src/components/wall-shell.tsx
    - apps/web/src/components/wall/wall-experience-screen.tsx
    - apps/web/src/components/wall/wall-canvas-section.tsx
    - apps/web/src/components/wall/scanner-command-surface.tsx
    - apps/web/vitest.app.config.ts
    - apps/web/vitest.server.config.ts
    - apps/web/vitest.shared.ts
  modified:
    - packages/shared/src/index.ts
    - packages/ui/src/index.ts
    - apps/web/src/app/(app)/workspace/page.tsx
    - apps/web/src/app/(app)/workspace/page.test.tsx
    - apps/web/src/components/wall/wall-experience-screen.test.tsx
    - apps/web/package.json
key-decisions:
  - "Keep Phase 3 wall data in shared contracts so later plans can implement wall and scanner features without changing the workspace route surface."
  - "Introduce a dedicated WallShell instead of mutating the earlier auth shell so wall navigation can evolve independently from Phase 1 auth chrome."
  - "Split Vitest into explicit app and server configs because the existing multi-project setup was not discovering app tests."
patterns-established:
  - "Wall route composition: workspace pages pass a typed wall model and scanner state into WallExperienceScreen, which delegates wall and scanner regions to explicit child components."
  - "Responsive shell pattern: desktop uses icon-first orb navigation while narrow screens use a bottom action bar with visible labels."
requirements-completed: [UI-01]
duration: 6min
completed: 2026-04-01
---

# Phase 3 Plan 1: Wall Experience Summary

**Wall-first workspace routing with typed wall/scanner contracts, responsive orb navigation, and executable app tests for downstream wall work**

## Performance

- **Duration:** 6 min
- **Started:** 2026-04-01T17:27:35Z
- **Completed:** 2026-04-01T17:33:32Z
- **Tasks:** 2
- **Files modified:** 14

## Accomplishments
- Established a canonical `@interwall/shared` wall contract surface for shelves, zones, shelf detail, stock drafts, and scanner state.
- Replaced the Phase 1 workspace placeholder with a wall-first route that keeps tenant selection guards intact.
- Added a reusable `WallShell` that preserves the Omiximo-inspired wall hierarchy across desktop and mobile navigation.

## Task Commits

Each task was committed atomically:

1. **Task 1: Define wall view-model contracts and page composition skeleton** - `91fbc9b`, `5077bfb`
2. **Task 2: Replace the workspace placeholder with a wall-first shell and route** - `f2aef44`, `9715828`

## Files Created/Modified
- `packages/shared/src/inventory-wall.ts` - Shared wall browsing and scanner contracts for Phase 3.
- `packages/shared/src/index.ts` - Re-export surface for the new wall types.
- `packages/ui/src/components/wall-shell.tsx` - Responsive wall shell with desktop orb rail and mobile action bar.
- `packages/ui/src/index.ts` - Package export for `WallShell`.
- `apps/web/src/components/wall/wall-experience-screen.tsx` - Screen-level composition of wall and scanner regions.
- `apps/web/src/components/wall/wall-canvas-section.tsx` - Primary wall canvas region scaffold.
- `apps/web/src/components/wall/scanner-command-surface.tsx` - Scanner command region scaffold.
- `apps/web/src/components/wall/wall-experience-screen.test.tsx` - Contract test for wall/screen composition.
- `apps/web/src/app/(app)/workspace/page.tsx` - Wall-first authenticated workspace route.
- `apps/web/src/app/(app)/workspace/page.test.tsx` - Route test covering tenant guard retention and wall-first rendering.
- `apps/web/package.json` - App test scripts pointing at executable Vitest configs.
- `apps/web/vitest.app.config.ts` - App-test config.
- `apps/web/vitest.server.config.ts` - Server-test config.
- `apps/web/vitest.shared.ts` - Shared alias/plugin config for Vitest.

## Decisions Made
- Kept the initial wall and scanner surfaces data-backed rather than empty placeholders so Plans `03-02` and `03-03` can extend stable props without reworking route composition.
- Used a shell-local navigation component instead of changing the global auth shell to avoid coupling wall UX to unrelated authenticated settings surfaces.
- Treated the broken app-test discovery as a blocking infrastructure issue for this plan and repaired it inline to preserve real TDD verification.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Repaired app-test discovery so plan verification executed real tests**
- **Found during:** Task 1
- **Issue:** `npm run test:app --workspace @interwall/web` passed with "No test files found", which blocked meaningful TDD for the new wall route and screen tests.
- **Fix:** Replaced the broken multi-project Vitest setup with explicit `vitest.app.config.ts` and `vitest.server.config.ts` configs plus updated package scripts.
- **Files modified:** `apps/web/package.json`, `apps/web/vitest.app.config.ts`, `apps/web/vitest.server.config.ts`, `apps/web/vitest.shared.ts`, `apps/web/vitest.config.ts`
- **Verification:** `npm run test:app --workspace @interwall/web -- --run "src/components/wall/wall-experience-screen.test.tsx"` and `npm run test:app --workspace @interwall/web -- --run "src/app/(app)/workspace/page.test.tsx" "src/components/wall/wall-experience-screen.test.tsx"`
- **Committed in:** `5077bfb`

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** The deviation was required to make the plan's own TDD and verification commands meaningful. No product-scope creep.

## Issues Encountered
- Hidden desktop and mobile navigation are both visible to Testing Library in jsdom, so the route test asserts navigation presence via `getAllByRole(...)` rather than single-element queries.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Plan `03-02` can implement the real wall grid and shelf-detail behavior against the established shared contracts and `WallExperienceScreen` composition.
- Plan `03-03` can add scanner-first workflows without changing the workspace route or shell API.

## Known Stubs

None.

## Self-Check: PASSED

- Verified required summary and implementation files exist.
- Verified task commits `91fbc9b`, `5077bfb`, `f2aef44`, and `9715828` exist in git history.

---
*Phase: 03-wall-experience*
*Completed: 2026-04-01*
