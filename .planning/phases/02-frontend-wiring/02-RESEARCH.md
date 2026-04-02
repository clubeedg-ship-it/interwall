# Phase 2: Frontend Wiring - Research

**Researched:** 2026-04-02
**Domain:** Vanilla JS SPA wiring, module splitting, XSS hardening, FastAPI session auth, EAN composition CRUD
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md / Phase 1 decisions)

### Locked Decisions (Phase 1)
- **D-03:** FastAPI (Python) as REST API between frontend and PostgreSQL. No Node.js, no PostgREST, no Supabase client.
- **D-11:** Simple username/password login. Password hashed in DB. FastAPI session cookie (httpOnly). Login page. Single user.
- Frontend stays vanilla JS with module pattern (`const moduleName = { ... }`). No React/Vue/Angular.
- Frontend calls FastAPI via nginx proxy at `/api/`. No CORS complexity.
- No `supabase-js` client — FE-05 in requirements says "loads supabase-js via CDN" but this contradicts D-03. **Locked decision overrides: use FastAPI, not supabase-js.** FE-05 interpretation: frontend loads no new library dependencies — it calls `/api/` via plain `fetch()`.
- Session cookie auth (not token in localStorage). `omiximo_session` httpOnly cookie set by FastAPI.

### Constraints from SPECS-MVP.md
- No single frontend JS file exceeds 500 lines
- All innerHTML assignments with user data are sanitized (no raw interpolation)
- Browser localStorage holds only theme and last-view preferences — no business data
- User can create, edit, and delete EAN compositions persisted in the database
- System rejects circular composition references and missing component EANs before saving

### Deferred Ideas (OUT OF SCOPE for this phase)
- Wall UI wiring to DB (Phase 4)
- Scanner wiring to DB (Phase 4)
- Profit engine wiring to DB (Phase 3)
- Email automation (Phase 3)
- Multi-tenant support
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FE-01 | app.js split into modules (no file >500 lines) | Module extraction map below — 17 logical modules identified in app.js. Mechanical split with no logic changes. |
| FE-02 | All innerHTML with user data sanitized (XSS prevention) | 6 confirmed XSS vectors in app.js/profit.js. `sanitize()` utility pattern documented. |
| FE-03 | All InvenTree API calls replaced with database queries | `api.request()` calls target `/api/` via FastAPI. Auth rewire from token-in-localStorage to session cookie. |
| FE-04 | Zero localStorage for business data (theme and last-view only) | localStorage audit identifies zones, shelves, cost config, fixed components, transactions. All need DB endpoints. |
| FE-05 | Frontend loads supabase-js via CDN (no build step) | Reinterpreted: Phase 1 locked FastAPI. No supabase-js needed. Frontend continues using plain fetch(). |
| EAN-01 | User can create EAN composition mapping parent→components with quantities | New "Compositions" view in index.html + compositions module. FastAPI CRUD endpoints needed. |
| EAN-02 | User can edit and delete existing EAN compositions | Same module. Edit = re-POST full composition set for parent. Delete = DELETE /api/compositions/{id}. |
| EAN-03 | System prevents circular references (A→B→A) | DB already enforces `parent_ean <> component_ean` CHECK. FastAPI returns 422 on violation. Frontend shows user-friendly error. |
| EAN-04 | System validates component EANs exist before saving | DB FK constraint enforces this. FastAPI returns 422 if component EAN not in products. Frontend error display. |
</phase_requirements>

---

## Summary

Phase 2 has three parallel workstreams: (1) mechanical splitting of the 4,485-line `app.js` monolith into ≤500-line modules, (2) hardening all innerHTML assignments that interpolate database values (XSS), and (3) building the EAN Compositions CRUD feature end-to-end (new FastAPI endpoints + new frontend view).

The frontend wiring change (FE-03, FE-04) is the most structurally significant: the existing `api.request()` method targets InvenTree at `/api/` with `Authorization: Token` headers. After this phase it will target FastAPI at the same `/api/` proxy path, authenticated via session cookie automatically sent by the browser. This is a low-risk drop-in change because the nginx proxy path stays the same. The only code change is removing the `Authorization: Token` header and removing the token-storage/restore logic from `auth`.

The app.js split must be purely mechanical — no logic changes during extraction. Each extracted module keeps its `window.moduleName` global exposure and existing init order. This is the highest-risk task due to cross-module reference chains, but the risk is fully mitigated if the mechanical extraction rule is strictly followed.

**Primary recommendation:** Split app.js first (it unblocks parallel work), then add FastAPI endpoints, then wire the EAN UI. XSS fixes can be woven in during the split as a "free" pass.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| FastAPI | 0.115.12 (pinned, Phase 1) | REST API for all frontend calls | Already running from Phase 1 |
| psycopg2 | 2.9.x (Phase 1) | PostgreSQL driver | Already in requirements.txt |
| Starlette SessionMiddleware | (bundled with FastAPI) | httpOnly session cookies | Established in Phase 1 auth |
| Vanilla JS fetch() | Browser native | HTTP client for all API calls | No CDN addition needed |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| DOMPurify | 3.x (CDN) | HTML sanitization | IF any view requires HTML content from DB (not needed for text-only fields) |
| textContent / document.createElement | Browser native | XSS-safe DOM insertion | Preferred over innerHTML for all dynamic content |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Plain fetch() | supabase-js | supabase-js is unnecessary — Phase 1 locked FastAPI as the API layer |
| textContent / createTextNode | DOMPurify | DOMPurify adds a CDN dependency. For this app, all dynamic values are plain text (names, EANs, quantities) — textContent is sufficient |

**No new npm packages or CDN additions are required for this phase.** The existing stack handles everything.

---

## Architecture Patterns

### app.js Module Extraction Map

The 4,485-line app.js contains these logical modules. Each becomes its own file. Script load order in index.html must match this dependency order:

```
frontend/
├── config.js          # CONFIG, state, $, $$, dom, buildTenantQuery (~60 lines)
├── api.js             # api module (lines 112-400, ~290 lines)
├── router.js          # router module (lines 404-519, ~116 lines)
├── settings.js        # settings + theme modules (lines 523-642, ~120 lines)
├── zone-config.js     # zoneConfig module (lines 647-789, ~143 lines)
├── zone-manager.js    # zoneManager module (lines 793-1040, ~248 lines)
├── shelf-config.js    # shelfConfig module (lines 1044-1186, ~143 lines)
├── bin-info-modal.js  # binInfoModal module (lines 1190-1421, ~232 lines)
├── wall.js            # wall module (lines 1424-1891, ~468 lines) — just under limit
├── scanner.js         # scanner module (lines 1895-2059, ~165 lines)
├── handshake.js       # handshake module (lines 2063-2445, ~383 lines)
├── catalog.js         # catalog + categoryManager + batchDetail + batchEditor (lines 2449-3316, ~868 lines) — MUST split further
├── part-manager.js    # partManager module (lines 3320-3680, ~361 lines)
├── bin-modal.js       # binModal module (lines 3684-3709, ~26 lines) — merge into wall.js
├── ui.js              # notifications + toast + alerts modules (lines 3716-3911, ~196 lines)
├── history.js         # history module (lines 3930-4179, ~250 lines)
├── auth.js            # auth module (lines 4346-4472, ~127 lines)
├── compositions.js    # NEW — EAN compositions CRUD (lines ~400)
└── app-init.js        # DOMContentLoaded bootstrap + loadParts + checkConnection functions (~100 lines)
```

**catalog.js is 868 lines — must split into two files:**
```
catalog-core.js    # catalog module: load, render, pagination (~400 lines)
catalog-detail.js  # categoryManager + batchDetail + batchEditor (~450 lines)
```

**total modules after split: 19 files, none exceeding 500 lines**

### FastAPI Endpoint Design for Phase 2

New endpoints needed for EAN composition CRUD and product lookup:

```
GET    /api/products                 — list/search products (EAN, name)
POST   /api/products                 — create product
GET    /api/products/{ean}           — get single product by EAN

GET    /api/compositions/{parent_ean}  — list components for a parent EAN
POST   /api/compositions             — create single component mapping
DELETE /api/compositions/{id}         — delete a component row
PUT    /api/compositions/{parent_ean} — replace all components for a parent (full-replace pattern)
```

**Auth on all endpoints:** `Depends(require_session)` — established pattern from Phase 1.

**Error response pattern from Phase 1:**
```python
# Already established in auth.py:
raise HTTPException(status_code=422, detail="parent_ean <> component_ean constraint violated")
```

Frontend catches HTTP 4xx and displays via `toast.show(detail, 'error')`.

### Pattern 1: Session Cookie Auth Rewire

The existing `api.request()` sends `Authorization: Token` header and reads token from localStorage:

```javascript
// CURRENT (InvenTree token auth)
const headers = {
    'Content-Type': 'application/json',
};
if (CONFIG.API_TOKEN) {
    headers['Authorization'] = `Token ${CONFIG.API_TOKEN}`;
}
const response = await fetch(`${CONFIG.API_BASE}${endpoint}`, { ...options, headers });
```

**After rewire (session cookie auth):**
```javascript
// NEW: browser sends omiximo_session cookie automatically
// credentials: 'same-origin' ensures cookies are sent
const response = await fetch(`${CONFIG.API_BASE}${endpoint}`, {
    ...options,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...options.headers }
});
```

Session cookie is httpOnly so JS cannot read it. The browser attaches it automatically on same-origin requests with `credentials: 'same-origin'`.

**auth.js changes needed:**
- Remove `CONFIG.API_TOKEN` storage
- Replace `api.authenticate()` with POST to `/api/auth/login` (form data, already exists in FastAPI)
- Replace `auth.validateToken()` with GET to `/api/auth/me` (already exists in FastAPI)
- Remove `localStorage.setItem('inventree_token', ...)` and `localStorage.getItem('inventree_token')`
- Replace `auth.getHeaders()` helper (used in tenant.js) — remove since session cookie is automatic
- `auth.logout()` becomes POST to `/api/auth/logout` then `location.reload()`

**Login form change:** Current form sends Basic Auth. New form POSTs form-data to `/api/auth/login`:
```javascript
// POST with Content-Type: application/x-www-form-urlencoded
const body = new URLSearchParams({ username, password });
const resp = await fetch('/api/auth/login', { method: 'POST', body, credentials: 'same-origin' });
```

### Pattern 2: Mechanical Module Split

```javascript
// Each extracted module keeps its existing structure exactly.
// File: zone-config.js
const zoneConfig = {
    STORAGE_KEY: 'omiximo_zones',
    // ... all existing methods unchanged ...
};
window.zoneConfig = zoneConfig;  // keep existing global exposure
```

```html
<!-- index.html script tags — load order matters -->
<script src="config.js?v=1"></script>    <!-- CONFIG, state -->
<script src="api.js?v=1"></script>       <!-- depends on CONFIG -->
<script src="router.js?v=1"></script>    <!-- depends on $ -->
<script src="settings.js?v=1"></script>
<script src="zone-config.js?v=1"></script>
<script src="zone-manager.js?v=1"></script>
<script src="shelf-config.js?v=1"></script>
<script src="bin-info-modal.js?v=1"></script>
<script src="wall.js?v=1"></script>
<script src="scanner.js?v=1"></script>
<script src="handshake.js?v=1"></script>
<script src="catalog-core.js?v=1"></script>
<script src="catalog-detail.js?v=1"></script>
<script src="part-manager.js?v=1"></script>
<script src="ui.js?v=1"></script>
<script src="history.js?v=1"></script>
<script src="auth.js?v=1"></script>
<script src="compositions.js?v=1"></script>
<script src="profit.js?v=1"></script>    <!-- existing, unchanged this phase -->
<script src="tenant.js?v=1"></script>    <!-- existing, will be removed/simplified later -->
<script src="app-init.js?v=1"></script>  <!-- DOMContentLoaded bootstrap last -->
```

### Pattern 3: XSS Sanitization Utility

Add to `config.js` (globally available before all other modules):

```javascript
// XSS-safe text escaper. Use whenever inserting user/DB data into innerHTML.
function sanitize(str) {
    if (str === null || str === undefined) return '';
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(String(str)));
    return div.innerHTML;
}
window.sanitize = sanitize;
```

**Usage pattern — prefer textContent over innerHTML for pure text:**
```javascript
// PREFER: zero risk
el.textContent = part.name;

// USE WHEN structure is needed: wrap all dynamic values
element.innerHTML = `
    <div class="part-name">${sanitize(part.name)}</div>
    <div class="part-sku">${sanitize(part.ean)}</div>
`;
```

### Pattern 4: EAN Compositions CRUD Module

New `compositions.js` module — entirely new code, no legacy rewiring:

```javascript
const compositions = {
    currentParentEan: null,

    async loadForParent(parentEan) { /* GET /api/compositions/{parentEan} */ },
    async save(parentEan, componentRows) { /* PUT /api/compositions/{parentEan} */ },
    async deleteRow(rowId) { /* DELETE /api/compositions/{rowId} */ },

    render() { /* Render composition table in #view-compositions */ },
    showCreateModal() { /* Open parent-EAN input modal */ },
    handleFormSubmit(e) { /* Validate + call save() */ },
    init() { /* Attach event listeners */ }
};
window.compositions = compositions;
```

**New HTML view needed in index.html:**
```html
<section class="view" id="view-compositions">
  <!-- Parent EAN selector, component rows table, add-row form -->
</section>
```

**New nav item in sidebar** (icon: chain link or component tree).

### Anti-Patterns to Avoid

- **Refactoring logic during the split:** Extract code exactly as-is. No cleanup, no renaming, no logic changes. Those are separate tasks.
- **Removing localStorage calls before DB endpoint exists:** Always implement DB read first, verify it works, then remove localStorage read (P2 from PITFALLS.md).
- **Token in localStorage:** The `inventree_token` localStorage key must be removed. Do not replace it with a new key. Session cookie handles auth state.
- **Adding `defer` to split module script tags:** The existing modules use synchronous DOM access at load time. Keep scripts synchronous until a clear async refactor plan exists.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HTML escaping | Custom regex replacer | `document.createTextNode()` + `.innerHTML` read-back | Browser-native, handles all edge cases |
| Circular reference detection | Custom graph traversal | PostgreSQL CHECK constraint (`parent_ean <> component_ean`) already in schema | DB enforces at INSERT time, no app code needed |
| Component EAN validation | JS lookup table | PostgreSQL FK constraint on `ean_compositions.component_ean` → `products.ean` | DB rejects invalid EANs with 23503 FK violation, FastAPI returns 422 |
| Session management | Custom cookie parser | `credentials: 'same-origin'` in fetch + Starlette SessionMiddleware | Already implemented in Phase 1 |
| Form data encoding | JSON stringify | `new URLSearchParams()` for login form | FastAPI auth endpoint expects form data not JSON |

---

## XSS Audit: Confirmed Vectors

All 6 vectors are in app.js. None are in profit.js (profit.js uses textContent or numeric values only).

| Location | Variable | Risk | Fix |
|----------|----------|------|-----|
| `createCard()` line 2831 | `part.name` | HIGH — interpolated directly into innerHTML template | Wrap with `sanitize()` |
| `createCard()` line 2832 | `part.description` | HIGH | Wrap with `sanitize()` |
| `createCard()` line 2827 | `sku` (derived from `part.IPN`) | MEDIUM | Wrap with `sanitize()` |
| `alerts.render()` line 3891 | `item.name` | HIGH | Wrap with `sanitize()` |
| `catalog render()` line 2663 | `searchQuery` (user input) | HIGH — search query reflected into DOM | Wrap with `sanitize()` |
| `auth.handleLogin()` line 4397 | `e.message` | LOW — error message from fetch, not user data | Use textContent or sanitize() |

**zone.name** in wall.render() (lines 1493, 1496-1497) is also interpolated but zone names are internally-managed (A-Z), not user-entered from the new DB schema. Sanitize anyway as defensive measure.

---

## localStorage Audit: What Must Move to DB

| localStorage Key | Current Use | Phase 2 Action | Target Endpoint |
|-----------------|-------------|----------------|-----------------|
| `inventree_token` | InvenTree auth token | REMOVE — session cookie replaces it | `/api/auth/login` |
| `omiximo_zones` | Zone configuration | DEFER to Phase 4 — zones UI not wired until Phase 4 | `/api/zones` (Phase 4) |
| `omiximo_shelf_config` | Per-shelf FIFO config | DEFER to Phase 4 | `/api/shelves` (Phase 4) |
| `omiximo_cost_config` | Fixed costs config | DEFER to Phase 3 | `/api/fixed-costs` (Phase 3) |
| `omiximo_fixed_components` | Fixed components config | DEFER to Phase 3 | `/api/fixed-costs` (Phase 3) |
| `omiximo_transactions` | Transaction history | DEFER to Phase 3 | `/api/transactions` (Phase 3) |
| `omiximo_totalMargin` | Aggregate margin | DEFER to Phase 3 | computed from transactions |
| `omiximo_view` | Last-used view name | KEEP — explicitly allowed by SPECS-MVP.md | — |
| `theme` | Dark/light preference | KEEP — explicitly allowed by SPECS-MVP.md | — |
| `jit_config` | JIT config (history.js) | DEFER — this is dead code from InvenTree era | Remove dead code |

**For Phase 2:** Only `inventree_token` is actively removed. All other deferred localStorage keys remain in-place. The frontend must not break when those keys are absent (it already handles missing keys gracefully via `|| '[]'` / `|| '{}'`).

---

## Common Pitfalls

### Pitfall 1: Cross-Module Reference Breaks on Split (P3)

**What goes wrong:** After extracting a module to a new file, another module calls a function that was implicitly available because it was in the same file. The function is now `undefined` at call time.

**Why it happens:** app.js has several module-local functions (`loadParts`, `checkConnection`, `loadLocations`, `updateClock`) that are not attached to any module object but are called by other modules.

**How to avoid:**
- Before extracting any module, identify all bare function calls it makes (`loadLocations()`, `loadParts()`, etc.)
- Move these helpers to `app-init.js` or expose them as `window.loadParts = loadParts`
- app.js already does `window.zoneConfig = zoneConfig` — extend this pattern to ALL module-local functions called across files
- Test rule: after each file extraction, reload the app and verify the most-used path (wall loads, catalog searches)

**Warning signs:**
- `ReferenceError: loadParts is not defined`
- Functions that exist in one module but are referenced by name from another module's code

### Pitfall 2: Script Load Order Regression (P3)

**What goes wrong:** A module loads before its dependency, causing `undefined` errors on first access.

**Why it happens:** In a monolith, JS executes top-to-bottom so dependencies are always available. In separate files, load order depends on `<script>` tag order in index.html.

**How to avoid:**
- Load order: `config.js` → `api.js` → all UI modules → `auth.js` → `app-init.js`
- `profit.js` and `tenant.js` must load before `app-init.js` (they're initialized in `auth.onAuthSuccess()`)
- Do NOT use `defer` or `async` on module scripts — they break synchronous initialization order
- Verify: `window.CONFIG` and `window.state` must be set before any other module loads

### Pitfall 3: Login Form Uses Wrong Content-Type (Auth Rewire)

**What goes wrong:** The new login POST to `/api/auth/login` sends JSON, but FastAPI auth endpoint uses `Form(...)` not `Body(...)`. FastAPI returns 422 Unprocessable Entity.

**Why it happens:** The existing `api.request()` helper sets `Content-Type: application/json`. Login must use `application/x-www-form-urlencoded`.

**How to avoid:**
- Login call must bypass `api.request()` and call `fetch()` directly with `new URLSearchParams()`
- This is a one-off exception — all other API calls use `api.request()`
- Test: check the Network tab for the login POST, confirm `Content-Type` is `application/x-www-form-urlencoded`

### Pitfall 4: EAN Composition PUT vs PATCH Semantic (EAN-02)

**What goes wrong:** Editing a composition that replaces one component EAN with another leaves the old row in the database because the frontend only POSTed the new row.

**Why it happens:** Individual-row inserts don't know what to delete.

**How to avoid:**
- Use a full-replace PUT endpoint: `PUT /api/compositions/{parent_ean}` accepts the complete list of components and atomically deletes existing rows then inserts new ones
- Frontend sends the entire component array for a parent on every save — never partial updates
- The DB schema has a UNIQUE constraint on `(parent_ean, component_ean)` so partial inserts would also conflict

### Pitfall 5: Premature localStorage Removal (P2)

**What goes wrong:** Removing `inventree_token` from localStorage also breaks the `auth.logout()` method that currently calls `localStorage.removeItem('inventree_token')`. If the new session-based logout is not wired, logout leaves a dangling session.

**Why it happens:** The logout removes the token from storage, but the actual session invalidation now happens server-side via `/api/auth/logout`.

**How to avoid:**
- `auth.logout()` must POST to `/api/auth/logout` before `location.reload()`
- The server clears `request.session` (Starlette), which invalidates the httpOnly cookie
- Remove `localStorage.removeItem('inventree_token')` from logout — it's a no-op after migration

---

## Code Examples

### Session Cookie Fetch Pattern
```javascript
// Source: Starlette SessionMiddleware + browser fetch() spec
// In api.js — replace existing api.request()
const api = {
    async request(endpoint, options = {}) {
        const headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            ...options.headers
        };
        const response = await fetch(`${CONFIG.API_BASE}${endpoint}`, {
            ...options,
            credentials: 'same-origin',  // sends omiximo_session cookie automatically
            headers
        });
        if (response.status === 401) {
            // Session expired — redirect to login
            auth.showLoginModal();
            throw new Error('Not authenticated');
        }
        if (!response.ok) throw new Error(`API ${response.status}`);
        const text = await response.text();
        return text ? JSON.parse(text) : {};
    }
};
```

### Login POST (Form Data)
```javascript
// Source: FastAPI Form() parameter + URLSearchParams browser spec
// In auth.js
async handleLogin(username, password) {
    const body = new URLSearchParams({ username, password });
    const resp = await fetch('/api/auth/login', {
        method: 'POST',
        body,
        credentials: 'same-origin'
        // Do NOT set Content-Type — browser sets it correctly with URLSearchParams
    });
    if (resp.ok) {
        await this.onAuthSuccess();
    } else {
        // show error
    }
}
```

### FastAPI Products Router (new for Phase 2)
```python
# apps/api/routers/products.py
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from db import get_conn
from auth import require_session

router = APIRouter(prefix="/api/products", tags=["products"])

class ProductCreate(BaseModel):
    ean: str
    name: str
    sku: str | None = None
    default_reorder_point: int = 0
    is_composite: bool = False

@router.get("")
def list_products(q: str = "", session=Depends(require_session)):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, ean, name, sku, is_composite FROM products "
                "WHERE ean ILIKE %s OR name ILIKE %s ORDER BY name LIMIT 100",
                (f"%{q}%", f"%{q}%")
            )
            return cur.fetchall()
```

### FastAPI Compositions Router (new for Phase 2)
```python
# apps/api/routers/compositions.py
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from db import get_conn
from auth import require_session

router = APIRouter(prefix="/api/compositions", tags=["compositions"])

class ComponentRow(BaseModel):
    component_ean: str
    quantity: int

@router.get("/{parent_ean}")
def get_composition(parent_ean: str, session=Depends(require_session)):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT ec.id, ec.component_ean, p.name as component_name, ec.quantity "
                "FROM ean_compositions ec "
                "JOIN products p ON p.ean = ec.component_ean "
                "WHERE ec.parent_ean = %s",
                (parent_ean,)
            )
            return cur.fetchall()

@router.put("/{parent_ean}")
def replace_composition(parent_ean: str, components: list[ComponentRow], session=Depends(require_session)):
    """Full-replace: delete all existing rows for parent, insert new ones atomically."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM ean_compositions WHERE parent_ean = %s", (parent_ean,))
            for c in components:
                cur.execute(
                    "INSERT INTO ean_compositions (parent_ean, component_ean, quantity) "
                    "VALUES (%s, %s, %s)",
                    (parent_ean, c.component_ean, c.quantity)
                )
            # Update is_composite flag on parent product
            cur.execute(
                "UPDATE products SET is_composite = %s WHERE ean = %s",
                (len(components) > 0, parent_ean)
            )
    return {"ok": True}
```

### XSS Sanitization Utility
```javascript
// Source: MDN createTextNode pattern — no external library needed
// In config.js
function sanitize(str) {
    if (str === null || str === undefined) return '';
    const el = document.createElement('div');
    el.appendChild(document.createTextNode(String(str)));
    return el.innerHTML;  // Returns HTML-escaped string
}
window.sanitize = sanitize;

// Usage in createCard():
return `
    <div class="part-card" data-part-id="${sanitize(part.pk)}">
        <h3 class="part-name">${sanitize(part.name || 'Unnamed Part')}</h3>
        <p class="part-desc">${sanitize(part.description || 'No description')}</p>
    </div>
`;
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| InvenTree token in localStorage | Starlette httpOnly session cookie | Phase 1 (just built) | auth.js needs rewrite; localStorage key removed |
| InvenTree API at `/api/user/token/` | FastAPI at `/api/auth/login` | Phase 1 | Login form action changes |
| `Authorization: Token` header | `credentials: 'same-origin'` | Phase 2 | api.request() simplifies |
| Config API sidecar for cost sync | FastAPI `/api/fixed-costs` | Phase 3 (not yet) | backendConfigSync in profit.js stays localStorage for now |

**Deprecated patterns to remove this phase:**
- `CONFIG.API_TOKEN` — was the InvenTree token, no longer needed
- `localStorage.setItem('inventree_token', ...)` — token storage
- `api.authenticate()` — Basic auth to InvenTree `/user/token/` endpoint
- `auth.getHeaders()` — returned `{Authorization: 'Token ...'}`, no longer needed
- `tenant.js` functions that call InvenTree-specific user/group endpoints — tenant module is dead code in single-tenant MVP (DEFER removal to cleanup, keep module but disable InvenTree calls)

---

## Open Questions

1. **tenant.js fate in Phase 2**
   - What we know: tenant.js calls InvenTree-specific `/user/group/` endpoints that no longer exist. The MVP is single-tenant (SPECS-MVP.md explicitly says no multi-tenant).
   - What's unclear: Should tenant.js be removed entirely in Phase 2, or just disabled (making it a no-op that loads but does nothing)?
   - Recommendation: Disable but keep the file. Set `tenant.isSuperAdmin = false` and `tenant.current = null` hardcoded. Remove all InvenTree API calls from it. This prevents reference errors in app.js that check `typeof tenant !== 'undefined'`.

2. **FE-05 interpretation (supabase-js)**
   - What we know: REQUIREMENTS.md says "FE-05: Frontend loads supabase-js via CDN (no build step)". Phase 1 locked decision D-03 says "FastAPI, not Supabase".
   - What's unclear: Is FE-05 stale and should be deleted, or does it mean something else?
   - Recommendation: Mark FE-05 as superseded by D-03. No supabase-js needed. The intent (no build step) is satisfied by keeping vanilla JS + plain fetch().

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Dev tools (optional) | Yes | v25.8.2 | — |
| Python 3 | FastAPI backend | Yes | 3.13.5 | — |
| Docker | Run FastAPI + PostgreSQL | Yes | 28.5.1 | — |
| Browser fetch() | Frontend API calls | Yes (native) | Browser native | — |

No blocking missing dependencies. Phase 2 is purely code work on files that already exist.

---

## Sources

### Primary (HIGH confidence)
- Direct code audit of `/Users/ottogen/interwall/inventory-omiximo/frontend/app.js` (4,485 lines) — module boundaries, localStorage keys, innerHTML vectors
- Direct code audit of `/Users/ottogen/interwall/apps/api/auth.py` — session cookie pattern established in Phase 1
- Direct code audit of `/Users/ottogen/interwall/apps/api/sql/init.sql` — DB schema, constraints, functions
- `.planning/phases/01-foundation/01-CONTEXT.md` — locked decisions D-03 through D-11
- `.planning/research/PITFALLS.md` — P2, P3, P6, P7 directly apply to this phase

### Secondary (MEDIUM confidence)
- MDN `createTextNode` + `innerHTML` read-back pattern for XSS-safe text escaping (well-established browser API)
- Starlette `SessionMiddleware` cookie behavior — same-origin fetch with `credentials: 'same-origin'`
- FastAPI `Form()` parameter behavior for `application/x-www-form-urlencoded`

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — FastAPI + vanilla JS + Phase 1 session auth are all confirmed running
- Architecture (module split map): HIGH — derived from direct line-count audit of app.js
- Architecture (new FastAPI endpoints): HIGH — follows established pattern from auth.py
- XSS audit: HIGH — confirmed by code inspection, not inference
- Auth rewire pattern: HIGH — session cookie is standard browser behavior
- Pitfalls: HIGH — sourced from PITFALLS.md + direct code analysis

**Research date:** 2026-04-02
**Valid until:** 2026-05-02 (stable domain — no external APIs or fast-moving libraries)
