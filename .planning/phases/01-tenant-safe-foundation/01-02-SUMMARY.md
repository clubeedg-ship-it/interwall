---
phase: 01-tenant-safe-foundation
plan: 02
subsystem: ui
tags: [nextjs, react, tailwindcss, shadcn, tenancy]
requires:
  - phase: 01-tenant-safe-foundation
    provides: monorepo workspace manifests and package boundaries from plan 01
provides:
  - shared tenancy role and membership contracts in `@interwall/shared`
  - reusable shell primitives in `@interwall/ui`
  - Next.js app-router foundation shell with Tailwind baseline in `apps/web`
affects: [auth, memberships, app-shell, design-system]
tech-stack:
  added: [tailwindcss, postcss, autoprefixer, clsx, tailwind-merge, class-variance-authority]
  patterns: [shared tenancy contracts package, shared UI shell wrapper, Next.js app-router phase handoff shell]
key-files:
  created:
    - packages/shared/src/tenancy.ts
    - packages/ui/src/components/app-shell-frame.tsx
    - packages/ui/src/lib/utils.ts
    - apps/web/src/app/layout.tsx
    - apps/web/src/app/page.tsx
    - apps/web/tailwind.config.ts
  modified:
    - packages/shared/src/index.ts
    - packages/ui/package.json
    - apps/web/package.json
    - apps/web/tsconfig.json
    - package-lock.json
key-decisions:
  - "Shared role and membership contracts now live in `@interwall/shared` so auth and database code can import one canonical tenancy surface."
  - "The Phase 1 web entrypoint stops at sign-in and organization handoff messaging to avoid leaking premature inventory UI."
  - "Next.js config uses `next.config.mjs` instead of `next.config.ts` because the installed Next 14 build does not support TypeScript config files."
patterns-established:
  - "Shared package imports: app shell and utility helpers flow through `@interwall/ui` exports instead of local app-only components."
  - "Foundation-first pages: early app routes can preview tenancy context with typed sample contracts while deferring real auth flow wiring."
requirements-completed: [TEN-01]
duration: 1min
completed: 2026-04-01
---

# Phase 01 Plan 02: Tenant Shell Summary

**Next.js App Router foundation shell with shared tenancy contracts, shared UI shell exports, and a Tailwind baseline for the Phase 1 sign-in handoff surface**

## Performance

- **Duration:** 1 min
- **Started:** 2026-04-01T10:46:07Z
- **Completed:** 2026-04-01T10:46:45Z
- **Tasks:** 2
- **Files modified:** 18

## Accomplishments
- Added canonical `owner | admin | member` tenancy contracts plus membership and active-tenant summaries in `@interwall/shared`.
- Introduced `@interwall/ui` shell exports with a `cn()` helper and reusable `AppShellFrame` component.
- Scaffolded `apps/web` as a Next.js App Router shell with Tailwind/postcss baseline config and a branded sign-in plus organization-handoff landing page.

## Task Commits

Each task was committed atomically:

1. **Task 1: Define shared tenancy contracts and shared UI exports** - `6c3a70b` (feat)
2. **Task 2: Scaffold the Next.js foundation shell with Tailwind and shadcn config** - `0b49e56` (feat)

## Files Created/Modified
- `packages/shared/src/tenancy.ts` - Shared app role, membership summary, and active tenant summary contracts.
- `packages/ui/src/components/app-shell-frame.tsx` - Reusable foundation shell wrapper for the web app.
- `packages/ui/src/lib/utils.ts` - Shared `cn()` helper for shadcn-style class composition.
- `apps/web/src/app/layout.tsx` - Root App Router layout importing global styles and the shared shell frame.
- `apps/web/src/app/page.tsx` - Phase 1 branded landing page constrained to sign-in and organization selection handoff messaging.
- `apps/web/tailwind.config.ts` - Tailwind content configuration covering app and shared UI source files.

## Decisions Made
- Shared tenancy contracts were centralized in `@interwall/shared` instead of redefining role types inside app code.
- The first visible route intentionally previews tenant context without implementing auth redirects or inventory views yet.
- Tailwind utilities are allowed to consume classes from `packages/ui/src/**/*` so shared shell components stay styled when imported into `apps/web`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Switched the Next config filename to `next.config.mjs`**
- **Found during:** Task 2 (Scaffold the Next.js foundation shell with Tailwind and shadcn config)
- **Issue:** The installed Next.js 14 build failed on `next.config.ts`, which made the planned filename non-buildable in this workspace.
- **Fix:** Replaced the config file with `apps/web/next.config.mjs` using the same `transpilePackages` behavior.
- **Files modified:** `apps/web/next.config.mjs`
- **Verification:** `npm run build --workspace @interwall/web`
- **Committed in:** `0b49e56`

**2. [Rule 2 - Missing Critical] Added Tailwind content configuration**
- **Found during:** Task 2 (Scaffold the Next.js foundation shell with Tailwind and shadcn config)
- **Issue:** The initial build warned that Tailwind content sources were empty, which would prevent the shell’s utility classes from rendering.
- **Fix:** Added `apps/web/tailwind.config.ts` and wired `components.json` to the config so Tailwind scans both app and shared UI source files.
- **Files modified:** `apps/web/tailwind.config.ts`, `apps/web/components.json`
- **Verification:** `npm run build --workspace @interwall/web`
- **Committed in:** `0b49e56`

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 missing critical)
**Impact on plan:** Both changes were required to deliver a buildable and visibly styled shell without changing the plan’s functional scope.

## Issues Encountered
- Next.js rewrote `apps/web/tsconfig.json` and `apps/web/next-env.d.ts` during the first build; those generated adjustments were kept because they align the app scaffold with Next’s expected TypeScript baseline.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `apps/web` now has a shared shell path and typed tenancy contracts ready for auth, middleware, and organization selection work.
- Future UI plans can extend the shell without refactoring package boundaries or reintroducing local role type definitions.

## Self-Check: PASSED

---
*Phase: 01-tenant-safe-foundation*
*Completed: 2026-04-01*
