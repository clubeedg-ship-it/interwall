# T-C08 — Builds Page Frontend Implementation

## Objective

Implement the `Builds` frontend page and floating workspace on `v2`
using the current backend surfaces for:
- `builds`
- `item_groups` (`Models`)
- `external_item_xref` (`SKU mapping`)

This packet is a frontend-first implementation packet for Opus.
It should land a real, usable `Builds` page, not just a static mock.

Use the wireframes as follows:
- primary layout reference:
  `.project/T-C08-BUILDS-WIREFRAME-V2.md`
- secondary fallback/reference:
  `.project/T-C08-BUILDS-WIREFRAME.md`

The floating workspace concept from `V2` is the target.

Pricing controls are included in this packet only as UI scaffolding
inside the workspace:
- fixed overhead
- commission %
- guided formula tokens / preview

Do not introduce pricing persistence, backend writes, or new API design
for those controls in this packet.

## Files Allowed To Change

- `inventory-interwall/frontend/index.html`
- `inventory-interwall/frontend/style.css`
- `inventory-interwall/frontend/router.js`
- `inventory-interwall/frontend/app-init.js`
- `inventory-interwall/frontend/api.js`
- `inventory-interwall/frontend/builds.js`
- `inventory-interwall/frontend/t_c08_builds_verify.mjs`
- `inventory-interwall/e2e/playwright.config.ts`
- `inventory-interwall/e2e/tests/builds-truth.spec.ts`
- `.project/operator-runs/T-C08/REPORT.yaml`

## Files Forbidden To Change

- `inventory-interwall/frontend/compositions.js`
- `inventory-interwall/frontend/health.js`
- all backend files under `apps/api/`
- `.project/TODO.md`
- `.project/PLAN.md`
- `.project/DECISIONS.md`
- `.project/COACH-HANDOFF.md`
- `.project/HANDOFFS.md`

## Cold Rebuild

- not required

## Facts Manifest

- `.project/T-C08-BUILDS-WIREFRAME-V2.md` → extract:
  centered floating workspace, left/center/right rail behavior, pricing
  rail as guided UI, mobile tabbed fallback
- `.project/T-C08-BUILDS-WIREFRAME.md` → extract:
  baseline list/detail requirements and simpler fallback structure
- `inventory-interwall/frontend/index.html` → extract:
  current nav structure, current view shells, current script load order
- `inventory-interwall/frontend/style.css` → extract:
  existing visual language tokens and component patterns
- `inventory-interwall/frontend/router.js` → extract:
  view registration and per-view init hooks
- `inventory-interwall/frontend/app-init.js` → extract:
  module init sequence and any cold-start hooks
- `inventory-interwall/frontend/api.js` → extend with frontend helpers
  for:
  - `/api/builds`
  - `/api/item-groups`
  - `/api/external-xref`
- `apps/api/routers/builds.py` → extract:
  list/get/create/put/patch/delete shapes and `is_auto_generated`
  protection
- `apps/api/routers/item_groups.py` → extract:
  list/get shapes for `Models`
- `apps/api/routers/external_xref.py` → extract:
  list/create/delete shapes for `SKU mapping`

## Decisions To Apply

- `D-013` — Builds are `builds` + `build_components`, keyed by
  `build_code`
- `D-014` — `build_code` can be auto-assigned; UI may allow blank code
  on create
- `D-018` — auto-generated builds are protected; do not offer mutation
  affordances for them if they surface
- `D-019` — `external_item_xref` is the active `SKU mapping` table
- `D-060` — client-facing page label is `Builds`

## Required Implementation Shape

### 1. Route and page shell

- Add a user-facing `Builds` entry to the SPA navigation.
- Register a `#builds` view and page title `Builds`.
- Load a new `builds.js` module without breaking existing views.

### 2. Default page state

- Show a Builds page with:
  - title/subtitle
  - top-level search/filter area
  - saved Builds list
  - `New Build` action
- Keep the normal page visible when no workspace is open.

### 3. Floating workspace

- Opening `New Build` or `Manage` must open a centered floating
  workspace aligned with the `V2` wireframe intent.
- Desktop target:
  - left context rail
  - center selected-Build box
  - right utility rail
- Mobile target:
  - same mental model collapsed into a tabbed single-column workspace

### 4. Build data flows

- Use real frontend API calls for:
  - list builds
  - get build detail
  - create build
  - replace components
  - patch build metadata if needed
  - list item groups (`Models`)
  - list/create/delete external xrefs filtered by `build_code`
- Use `Models` from `item_groups`; do not source the picker from stock
  availability only.

### 5. Components interaction

- Right rail shows searchable selectable `Models`.
- Adding a `Model` inserts it into the center composition area.
- Center area supports:
  - quantity editing
  - remove line
  - obvious empty state
- If a selected `Model` already exists in the Build, do not silently
  duplicate confusing rows; either bump/focus the existing line or make
  the state explicit and coherent.

### 6. SKU mapping interaction

- Show marketplace mapping readiness in summary form and detail form.
- Include the marketplaces already used in the current product:
  - `bol.com`
  - `mediamarkt`
  - `boulanger`
  - `manual`
- The workspace must let the operator:
  - see whether a marketplace mapping exists
  - add a mapping
  - remove a mapping
- Missing mappings must be visually explicit.

### 7. Pricing rail

- Implement the pricing controls as UI-only scaffolding:
  - fixed overhead field
  - commission % field
  - token chips / operators
  - read-only preview area
- No backend writes for pricing controls.
- No new API contract for pricing controls.
- Keep this area visibly non-authoritative if needed, but do not make it
  look broken.

### 8. Existing-pattern discipline

- Preserve Interwall visual language.
- Do not turn the page into a node editor or graph UI.
- Keep motion restrained and operational.
- Do not widen into backend router changes.

## Acceptance Checks

- `Builds` is visible as a user-facing page/route
- opening a Build uses a centered floating workspace rather than a
  plain stacked form
- saved Builds load from real `/api/builds` data
- `Models` library loads from real `/api/item-groups` data
- `SKU mapping` rows load from real `/api/external-xref?build_code=...`
  data
- component edits and save flow write through the allowed build/xref
  APIs
- pricing area is present as UI scaffolding only and does not invent new
  persistence
- no backend files changed
- `compositions.js` remains untouched
- a source verifier exists and passes
- an authenticated Playwright truth test exists and passes

## Verification Commands

Run these before writing `REPORT.yaml`:

```bash
node inventory-interwall/frontend/t_c08_builds_verify.mjs
cd inventory-interwall/e2e && INTERWALL_E2E_USER=admin INTERWALL_E2E_PASS=admin123 npx playwright test tests/builds-truth.spec.ts
git diff --name-only -- . ':(exclude).project/operator-runs/T-C08/*'
```

Expected diff names:
- `inventory-interwall/frontend/index.html`
- `inventory-interwall/frontend/style.css`
- `inventory-interwall/frontend/router.js`
- `inventory-interwall/frontend/app-init.js`
- `inventory-interwall/frontend/api.js`
- `inventory-interwall/frontend/builds.js`
- `inventory-interwall/frontend/t_c08_builds_verify.mjs`
- `inventory-interwall/e2e/playwright.config.ts`
- `inventory-interwall/e2e/tests/builds-truth.spec.ts`

## Stop Condition

Stop after:
- the scoped `Builds` frontend implementation is done
- the verifier script is green
- the Playwright truth test is green
- `.project/operator-runs/T-C08/REPORT.yaml` is filled in

Do not commit.
