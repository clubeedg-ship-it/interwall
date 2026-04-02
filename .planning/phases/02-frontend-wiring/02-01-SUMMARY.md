---
phase: 02-frontend-wiring
plan: "01"
subsystem: frontend
tags: [module-split, xss-fix, vanilla-js, refactor]
requires: []
provides: [split-frontend-modules, sanitize-utility, xss-hardening, compositions-view-placeholder]
affects: [inventory-omiximo/frontend]
tech-stack:
  added: [sanitize() XSS utility]
  patterns: [vanilla-js-module-pattern, window-global-exposure]
key-files:
  created:
    - inventory-omiximo/frontend/config.js (124 lines)
    - inventory-omiximo/frontend/api.js (299 lines)
    - inventory-omiximo/frontend/router.js (126 lines)
    - inventory-omiximo/frontend/settings.js (119 lines)
    - inventory-omiximo/frontend/zone-config.js (153 lines)
    - inventory-omiximo/frontend/zone-manager.js (258 lines)
    - inventory-omiximo/frontend/shelf-config.js (153 lines)
    - inventory-omiximo/frontend/bin-info-modal.js (241 lines)
    - inventory-omiximo/frontend/wall.js (478 lines)
    - inventory-omiximo/frontend/scanner.js (175 lines)
    - inventory-omiximo/frontend/handshake.js (393 lines)
    - inventory-omiximo/frontend/catalog-core.js (388 lines)
    - inventory-omiximo/frontend/catalog-detail.js (482 lines)
    - inventory-omiximo/frontend/part-manager.js (369 lines)
    - inventory-omiximo/frontend/bin-modal.js (36 lines)
    - inventory-omiximo/frontend/ui.js (227 lines)
    - inventory-omiximo/frontend/history.js (259 lines)
    - inventory-omiximo/frontend/auth.js (144 lines)
    - inventory-omiximo/frontend/app-init.js (202 lines)
  modified:
    - inventory-omiximo/frontend/index.html (script tags reordered, compositions nav + view added)
decisions:
  - bin-modal.js kept separate because merging into wall.js would have exceeded 500 lines (508)
  - updateClock() placed in app-init.js alongside other bare window-exposed functions
  - catalog split at categoryManager boundary: catalog-core.js (catalog module) + catalog-detail.js (categoryManager, batchDetail, batchEditor)
  - tenant.js script tag added before app-init.js since auth.onAuthSuccess references tenant.checkSuperAdmin
metrics:
  duration: continuous
  completed: 2026-04-02
  tasks_completed: 2
  files_created: 19
  files_modified: 1
---

# Phase 02 Plan 01: App.js Monolith Split Summary

Mechanically split the 4,485-line `inventory-omiximo/frontend/app.js` monolith into 19 focused modules (none exceeding 500 lines), added a `sanitize()` XSS utility, fixed 6 confirmed XSS vectors, and updated `index.html` to load all modules in correct dependency order with a compositions view placeholder.

## Tasks Completed

### Task 1: Split app.js into 19 Focused Modules

Split the 4,485-line monolith exactly along module boundaries (mechanical extraction, no refactoring). Created `sanitize()` XSS utility in config.js using `document.createTextNode` + `.innerHTML` read-back pattern.

**Files created and line counts:**

| File | Lines | Contents |
|------|-------|----------|
| config.js | 124 | CONFIG object, state, DOM helpers ($, $$), dom map, buildTenantQuery, sanitize() |
| api.js | 299 | Full api module with request(), authenticate(), all REST helpers |
| router.js | 126 | Router with warp transitions |
| settings.js | 119 | settings panel + theme module + legacy `theme` alias |
| zone-config.js | 153 | zoneConfig localStorage CRUD |
| zone-manager.js | 258 | zoneManager UI modals (add/configure/delete zone) |
| shelf-config.js | 153 | shelfConfig per-shelf FIFO configuration |
| bin-info-modal.js | 241 | binInfoModal stock display + FIFO config toggles |
| wall.js | 478 | Wall grid renderer, zone rendering, live data loading |
| scanner.js | 175 | Barcode scanner handler with audio feedback |
| handshake.js | 393 | Handshake modal (Receiving & Picking) with FIFO auto-rotation |
| catalog-core.js | 388 | Catalog module: load, render, pagination, card creation |
| catalog-detail.js | 482 | categoryManager + batchDetail + batchEditor |
| part-manager.js | 369 | partManager CRUD modal + JIT reorder point calculation |
| bin-modal.js | 36 | binModal (kept separate per plan conditional) |
| ui.js | 227 | notifications + toast + alerts + toggleLowStockDropdown |
| history.js | 259 | History & Archive System |
| auth.js | 144 | Auth module (InvenTree token pattern — to be rewired in 02-02) |
| app-init.js | 202 | DOMContentLoaded bootstrap, bare window-exposed functions, init() |

**Commit:** `86af860` — feat(02-01): split app.js into 19 focused modules with sanitize() XSS utility

### Task 2: Update index.html Script Tags

Replaced `<script src="app.js">` with 19 ordered module script tags. Added compositions nav button and view placeholder section for future plan work.

**Script load order:** env.js → config.js → api.js → router.js → settings.js → zone-config.js → zone-manager.js → shelf-config.js → bin-info-modal.js → wall.js → scanner.js → handshake.js → catalog-core.js → catalog-detail.js → part-manager.js → bin-modal.js → ui.js → history.js → auth.js → labels.js → profit.js → tenant.js → app-init.js

**Compositions additions:**
- Nav button with component-tree SVG icon, `data-view="compositions"`
- `<section class="view" id="view-compositions">` with page-header and empty `#compositions-content` div

**Commit:** `923a543` — feat(02-01): update index.html to load split modules in dependency order

## XSS Vectors Fixed

All 6 confirmed XSS vectors wrapped with `sanitize()` or converted to `textContent`:

| # | File | Location | Fix |
|---|------|----------|-----|
| 1 | wall.js | `renderZone()` zone badge | `${sanitize(zone.name)}` in innerHTML template |
| 2 | wall.js | `renderZone()` onclick attribute | `${sanitize(zone.name)}` in onclick handler string |
| 3 | catalog-core.js | `createPartCard()` SKU display | `${sanitize(sku)}` |
| 4 | catalog-core.js | `createPartCard()` part name | `${sanitize(part.name || 'Unnamed Part')}` |
| 5 | catalog-core.js | `createPartCard()` description | `${sanitize(part.description || 'No description')}` |
| 6 | auth.js | `handleLogin()` catch block | `errMsg.textContent = ...` instead of `innerHTML += e.message` |

Bonus fix applied during research: `ui.js` alerts.updateCatalogCard() wraps `item.name` with `${sanitize(item.name)}`.

## Bare Function References Resolved

Functions called via bare name from other modules (not via object method):

| Function | Location in app-init.js | window exposure |
|----------|--------------------------|-----------------|
| `loadLocations()` | Defined + exposed | `window.loadLocations` |
| `loadParts()` | Defined + exposed | `window.loadParts` |
| `checkConnection()` | Defined + exposed | `window.checkConnection` |
| `updateClock()` | Defined + exposed | `window.updateClock` |
| `checkDuplicateParts()` | Defined + exposed | `window.checkDuplicateParts` |

Also re-exposed for inline onclick compatibility: `window.zoneConfig = zoneConfig`, `window.zoneManager = zoneManager`.

## Deviations from Plan

### Auto-resolved Issues

**1. [Rule 1 - Plan Conditional] bin-modal.js kept separate (not merged into wall.js)**
- **Found during:** Task 1 — wall.js line count check
- **Issue:** The plan said "merge binModal into wall.js unless wall.js would exceed 500 lines with the merge". After initial creation with merged binModal, wall.js was 508 lines.
- **Fix:** Removed merged binModal code from wall.js (bringing it to 478 lines), kept bin-modal.js as a separate 36-line file per the plan's conditional clause.
- **Files modified:** wall.js, bin-modal.js
- **Commit:** 86af860 (both files in same commit)

**2. [Rule 2 - Missing Critical] alerts.updateCatalogCard() XSS fix added beyond the 6 specified vectors**
- **Found during:** Task 1 — reviewing ui.js alerts module
- **Issue:** The 6 XSS vectors in the plan didn't include the `item.name` interpolation in alerts.updateCatalogCard(), which uses the same vulnerable pattern.
- **Fix:** Applied `${sanitize(item.name)}` in the same commit as the other XSS fixes.
- **Files modified:** ui.js

**3. [Rule 3 - Missing Script Tag] tenant.js script tag added to index.html**
- **Found during:** Task 2 — reviewing index.html script load order
- **Issue:** auth.onAuthSuccess() calls `tenant.checkSuperAdmin()` but the original index.html did not have an explicit `<script src="tenant.js">` tag (tenant.js must have been a recent addition loaded via app.js import).
- **Fix:** Added `<script src="tenant.js?v=4"></script>` before app-init.js so the `tenant` global is available when app-init.js bootstraps.
- **Files modified:** index.html

## Known Stubs

None — this plan is a mechanical code split with no new business logic. All modules are wired as they were in app.js. The compositions view is intentionally a placeholder (stub) for future plan work; this is documented in the plan and will be populated by a subsequent compositions.js module.

## Self-Check: PASSED

All 19 module files confirmed present. Both commits confirmed in inventory-omiximo sub-repo git history (86af860, 923a543). No file exceeds 500 lines (max: catalog-detail.js at 482 lines). sanitize() defined and exposed in config.js. All 6+ XSS vectors wrapped.
