---
phase: 01-tenant-safe-foundation
plan: 01
subsystem: workspace
tags:
  - monorepo
  - typescript
  - nextjs
dependency_graph:
  requires: []
  provides:
    - Root npm workspace registration for apps and packages
    - Shared strict TypeScript baseline
    - Addressable @interwall/web, @interwall/shared, and @interwall/ui packages
  affects:
    - package.json
    - tsconfig.base.json
    - apps/web/package.json
    - apps/web/tsconfig.json
    - packages/shared/package.json
    - packages/shared/tsconfig.json
    - packages/ui/package.json
    - packages/ui/tsconfig.json
tech_stack:
  added:
    - npm workspaces
    - TypeScript
    - Next.js
    - React
  patterns:
    - Shared tsconfig inheritance from repository root
    - Workspace-local scripts for app and package verification
key_files:
  created:
    - package.json
    - tsconfig.base.json
    - apps/web/package.json
    - apps/web/tsconfig.json
    - apps/web/next-env.d.ts
    - packages/shared/package.json
    - packages/shared/tsconfig.json
    - packages/shared/src/index.ts
    - packages/ui/package.json
    - packages/ui/tsconfig.json
    - packages/ui/src/index.tsx
    - package-lock.json
  modified: []
decisions:
  - Use a root npm workspace with apps/* and packages/* while keeping the legacy reference directories outside the workspace graph.
  - Keep package verification script-only for now and avoid emitting build artifacts during workspace typechecks.
metrics:
  duration: 270s
  completed_at: 2026-04-01T01:58:40Z
  tasks_completed: 2
---

# Phase 01 Plan 01: Monorepo Scaffold Summary

Bootstrapped the greenfield interwall monorepo with a root npm workspace, a shared strict TypeScript baseline, and first-class `@interwall/web`, `@interwall/shared`, and `@interwall/ui` packages.

## Completed Tasks

1. Added the root `package.json` and `tsconfig.base.json` so the rebuild installs and verifies from the repository root instead of coordinating the legacy repos manually.
2. Registered the web, shared, and UI workspace packages with local scripts and minimal typed entry files so root workspace install and typecheck commands succeed.

## Verification

- `npm install`
- `npm run lint --workspaces --if-present`
- `npm run typecheck --workspaces --if-present`

## Decisions Made

- The new workspace graph is restricted to `apps/*` and `packages/*`, which keeps `inventory-omiximo` and `omiximo-email-automation` available as reference inputs without making them part of the rebuild runtime.
- Package-level `typecheck` scripts use `--noEmit` so verification remains clean and does not generate dist output or TypeScript incremental metadata.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking Issue] Replaced `workspace:*` dependency specifiers with matching local versions**
- **Found during:** Task 2 verification
- **Issue:** `npm install` in this workspace rejected the `workspace:` protocol even though the packages were valid workspaces.
- **Fix:** Set the internal `@interwall/shared` and `@interwall/ui` dependencies in `apps/web/package.json` to `0.0.0`, which still links the local workspace packages because their package versions match.
- **Files modified:** `apps/web/package.json`
- **Commit:** `4544fc1`

**2. [Rule 3 - Blocking Issue] Added minimal typed entry files required for workspace typechecking**
- **Found during:** Task 2 implementation
- **Issue:** The shared and UI packages needed actual source inputs, and the web package needed a `next-env.d.ts`, or the package `typecheck` scripts would not be runnable.
- **Fix:** Added minimal `src` entry files for `@interwall/shared` and `@interwall/ui`, plus `apps/web/next-env.d.ts`.
- **Files modified:** `apps/web/next-env.d.ts`, `packages/shared/src/index.ts`, `packages/ui/src/index.tsx`
- **Commit:** `4544fc1`

**3. [Rule 3 - Blocking Issue] Removed verification side effects from workspace typechecks**
- **Found during:** Final verification
- **Issue:** The original package `typecheck` commands emitted `dist/` outputs and a `tsconfig.tsbuildinfo` file, leaving the worktree dirty after verification.
- **Fix:** Updated package `typecheck` scripts to use `--noEmit` and removed `incremental` from the web package tsconfig.
- **Files modified:** `apps/web/package.json`, `apps/web/tsconfig.json`, `packages/shared/package.json`, `packages/ui/package.json`
- **Commit:** `2e4c67b`

## Known Stubs

None.

## Self-Check: PASSED

- Found summary file: `.planning/phases/01-tenant-safe-foundation/01-01-SUMMARY.md`
- Found commit: `2c4e464`
- Found commit: `4544fc1`
- Found commit: `2e4c67b`
