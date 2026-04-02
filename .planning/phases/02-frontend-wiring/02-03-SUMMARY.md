---
phase: 02-frontend-wiring
plan: "03"
subsystem: frontend
tags: [compositions, auth, session-cookie, crud, ean, vanilla-js]
dependency_graph:
  requires: ["02-01", "02-02"]
  provides: ["compositions-crud-ui", "session-cookie-auth"]
  affects: ["frontend-auth-flow", "compositions-api"]
tech_stack:
  added: ["session-cookie-auth-pattern", "URLSearchParams-login"]
  patterns: ["module-pattern", "sanitize-xss", "credentials-same-origin"]
key_files:
  created:
    - inventory-omiximo/frontend/compositions.js
  modified:
    - inventory-omiximo/frontend/index.html
    - inventory-omiximo/frontend/app-init.js
    - inventory-omiximo/frontend/auth.js
    - inventory-omiximo/frontend/api.js
decisions:
  - "auth.getHeaders() kept as legacy compatibility shim for tenant.js — returns only Content-Type/Accept headers (no Authorization)"
  - "compositions.init() added with typeof guard in app-init.js for safe progressive loading"
  - "api.request() now surfaces FastAPI detail message on 4xx errors for meaningful user-facing toasts"
  - "auth.js authenticate() uses direct fetch (not api.request()) to avoid Content-Type: application/json on login form POST"
metrics:
  duration_seconds: 156
  completed_date: "2026-04-02"
  tasks_completed: 2
  tasks_total: 3
  files_created: 1
  files_modified: 4
---

# Phase 02 Plan 03: EAN Compositions CRUD + Session Cookie Auth Summary

**One-liner:** Compositions CRUD module with parent-search/component-rows/save-to-DB and auth rewired to session cookies replacing InvenTree token localStorage.

## What Was Built

### Task 1 — compositions.js CRUD Module

Created `inventory-omiximo/frontend/compositions.js` (194 lines) implementing the full EAN Compositions UI:

- **Parent search:** Debounced typeahead against `GET /api/products?q=...` — shows EAN and name in dropdown, click selects parent and loads its composition
- **Component rows table:** Each row has a Component EAN input, quantity input, resolved name label, and remove button
- **Add Row button:** Appends a blank row and focuses the EAN input
- **Save Composition:** PUT to `/api/compositions/{parent_ean}` with `[{component_ean, quantity}]` payload — on success shows "Saved N component(s)" toast and reloads rows to display server-resolved names
- **Error handling:** FastAPI 422 detail messages ("does not exist", "circular reference") surface directly in error toasts via improved `api.request()` error extraction
- **XSS safety:** All DB/user data inserted into innerHTML uses `sanitize()` (from config.js) — applied to EAN, name, quantity in renderRows() and handleParentSearch()

**index.html changes:** Replaced the placeholder `<div id="compositions-content">` with the full compositions view HTML — parent search section, component table with thead/tbody#comp-rows, and save button. Script tag `compositions.js?v=1` added after auth.js.

**app-init.js changes:** Replaced the legacy `localStorage.getItem('inventree_token')` startup check with a session-cookie-based `auth.validateToken()` call. Added `compositions.init()` call with typeof guard. Removed the `localStorage.removeItem('inventree_token')` from invalid-token flow (now done in logout instead).

### Task 2 — Auth Rewire to Session Cookies

**auth.js changes:**
- Removed `getHeaders()` returning `Authorization: Token` — replaced with legacy compatibility shim that returns only `Content-Type`/`Accept` headers (no auth) so `tenant.js` doesn't crash
- Added `showLoginModal()` method — called by `api.request()` on 401 to re-prompt login
- `authenticate(username, password)` now POSTs `URLSearchParams` to `/api/auth/login` with `credentials: 'same-origin'` — throws with FastAPI `detail` message on failure
- `validateToken()` now GETs `/api/auth/me` with `credentials: 'same-origin'` — returns `resp.ok`
- `handleLogin()` now calls `this.authenticate()` instead of `api.authenticate()` and no longer saves token to localStorage
- `logout()` now POSTs to `/api/auth/logout` with `credentials: 'same-origin'`, removes legacy `inventree_token` key, then reloads

**api.js changes:**
- Removed `CONFIG.API_TOKEN` check and `Authorization: Token` header from `request()`
- Added `credentials: 'same-origin'` to all fetch calls in `request()`
- Added 401 handler: calls `auth.showLoginModal()` and throws "Not authenticated"
- Improved non-OK error handling: reads response body, parses JSON `detail` field, throws with meaningful message
- Removed old `authenticate()` method (Basic auth to InvenTree `/user/token/`) entirely

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] Added `auth.getHeaders()` legacy compatibility shim**
- **Found during:** Task 2
- **Issue:** `tenant.js` calls `auth.getHeaders()` in 4 places — removing the method entirely would crash the tenant module on auth success
- **Fix:** Kept `getHeaders()` but returns only `Content-Type`/`Accept` headers (no Authorization) — makes tenant.js API calls use session cookie automatically
- **Files modified:** `inventory-omiximo/frontend/auth.js`
- **Commit:** 5286fd6

**2. [Rule 2 - Missing critical functionality] Added `auth.showLoginModal()` method**
- **Found during:** Task 2
- **Issue:** The plan references `auth.showLoginModal()` being called from `api.request()` on 401, but this method didn't exist in the extracted auth.js
- **Fix:** Added `showLoginModal()` that sets `not-authenticated` class and opens `loginModal`
- **Files modified:** `inventory-omiximo/frontend/auth.js`
- **Commit:** 5286fd6

**3. [Rule 1 - Bug] Removed `api.authenticate()` from api.js**
- **Found during:** Task 2
- **Issue:** `api.js` had an old InvenTree Basic-auth `authenticate()` method that was no longer needed and `auth.js handleLogin()` was calling it
- **Fix:** Removed `api.authenticate()` entirely; `auth.handleLogin()` now calls `this.authenticate()` directly (the new session cookie version)
- **Files modified:** `inventory-omiximo/frontend/api.js`, `inventory-omiximo/frontend/auth.js`
- **Commit:** 5286fd6

## Auth Gate

None — all endpoints are served locally.

## Checkpoint Status

**STOPPED at Task 3 (checkpoint:human-verify)** — Tasks 1 and 2 committed. Awaiting browser verification of:
1. Compositions CRUD persists to DB
2. No `inventree_token` in localStorage after login
3. Session cookie present
4. Existing views (Wall, Catalog) load without JS errors

## Known Stubs

None — all data is wired to the FastAPI backend (`/api/compositions`, `/api/products`).

## Self-Check: PASSED

- compositions.js: EXISTS (194 lines)
- index.html: view-compositions section with all required element IDs
- app-init.js: compositions.init() call present
- auth.js: URLSearchParams login, /api/auth/me, /api/auth/logout
- api.js: credentials: same-origin, no Authorization header
- Task 1 commit: 75b1a17
- Task 2 commit: 5286fd6
