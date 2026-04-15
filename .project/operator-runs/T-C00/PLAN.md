# T-C00 — Refresh UI State Audit

## Objective

Refresh the `T-C00` audit on current `v2` branch truth and land it as
`.project/C00-UI-STATE-AUDIT.md`.

This is an audit-artifact packet, not a product-code packet.

The refreshed audit must:
- inventory current active-runtime `localStorage` / `sessionStorage`
  reads and writes
- inventory current active-runtime client-side recomputation of
  business numbers
- inventory current active-runtime dynamic HTML sinks relevant to
  `sanitize()` coverage
- explicitly explain why the preserved off-branch audit is stale

## Files Allowed To Change

- `.project/C00-UI-STATE-AUDIT.md`
- `.project/operator-runs/T-C00/REPORT.yaml`

## Files Forbidden To Change

- all product code under `inventory-interwall/frontend/`
- all backend code under `apps/`
- `.project/TODO.md`
- `.project/PLAN.md`
- `.project/DECISIONS.md`
- `.project/COACH-HANDOFF.md`
- `.project/HANDOFFS.md`

## Cold Rebuild

- not required

## Facts Manifest

- `inventory-interwall/frontend/index.html` → extract: live `<script>`
  load order; confirm active runtime files; confirm inactive bundles are
  not loaded
- `/Users/ottogen/interwall-preserve-2026-04-15/live-tree/.project/C00-UI-STATE-AUDIT.md`
  → extract: stale assumptions to correct, especially `shelf-config.js`
  being treated as active runtime
- `inventory-interwall/frontend/config.js` → extract: `sanitize`,
  comments around dynamic zone state, global `state`
- `inventory-interwall/frontend/router.js` → extract: `navigate`,
  `restoreView`
- `inventory-interwall/frontend/settings.js` → extract: theme storage
  paths
- `inventory-interwall/frontend/app-init.js` → extract:
  `checkDuplicateParts`, legacy token cleanup
- `inventory-interwall/frontend/auth.js` → extract: logout cleanup,
  any active dynamic HTML sinks
- `inventory-interwall/frontend/tenant.js` → extract: tenant-context
  storage and selector rendering path
- `inventory-interwall/frontend/zone-config.js` → extract:
  `STORAGE_KEY`, `load`, `save`, any local wall-topology authority
- `inventory-interwall/frontend/wall.js` → extract: occupancy rendering,
  browser-side quantity/status recomputation, `getStatusClass`
- `inventory-interwall/frontend/bin-info-modal.js` → extract: value /
  fill recomputation, shelf-setting mutation path
- `inventory-interwall/frontend/handshake.js` → extract: browser-side
  FIFO sort / pick / receive logic
- `inventory-interwall/frontend/catalog-core.js` → extract:
  product normalization, stock badges, batch total rendering
- `inventory-interwall/frontend/part-manager.js` → extract: JIT config
  storage and reorder-point calculation
- `inventory-interwall/frontend/ui.js` → extract: low-stock
  recomputation and rendering
- `inventory-interwall/frontend/catalog-detail.js` → extract: supplier
  URL render path and batch-detail value logic
- `inventory-interwall/frontend/labels.js` → extract:
  `createLabelHTML`, print-preview HTML path
- `inventory-interwall/frontend/profit.js` → extract:
  `backendConfigSync`, `fixedComponentsConfig`, `recordSale`,
  `profitEngine.mapApiTransaction`, dashboard / valuation render paths
- `inventory-interwall/frontend/api.js` → extract:
  `getAvailableStock`, `getProductsWithStock`

## Decision Snippets To Apply

- `D-040`: business data must not be authoritative in the browser
- `D-041`: stock count should come from one canonical source
- `D-045`: hardcoded thresholds / business values are debt to call out
- `D-046`: every dynamic `innerHTML` path with untrusted data must
  route through `sanitize()`

## Required Output Shape

Write `.project/C00-UI-STATE-AUDIT.md` as a concise audit artifact with
at least these sections:

1. runtime map
2. storage inventory
3. client-side business-number recomputation inventory
4. dynamic HTML / sanitize coverage inventory
5. stale preserved-artifact corrections
6. task-routing notes

For each relevant file or subsystem, state:
- what the current branch truth is
- why it matters
- which follow-up task it feeds

Use follow-up task routing only where it is clear from current planning:
- `T-C02c` for handshake/browser stock authority
- `T-C11` for sanitize / hardcoded-value debt
- `T-C03` if a wall rendering issue is clearly about DB-driven layout

## Acceptance Checks

- `.project/C00-UI-STATE-AUDIT.md` exists and reflects current `v2`
  runtime instead of preserved-branch runtime
- the audit explicitly states that `index.html` loads the split-module
  runtime and does not load `app.js`, `app-1770129675.js`, or
  `profit-1770129675.js`
- the audit explicitly states that `shelf-config.js` is not present in
  the current active runtime and that the preserved off-branch audit is
  stale on that point
- the audit cites `D-040`, `D-041`, `D-045`, and `D-046` where relevant
- no product code changed

## Verification Commands

Run these before writing `REPORT.yaml`:

```bash
test -f .project/C00-UI-STATE-AUDIT.md
rg -n "app-1770129675|profit-1770129675|app\\.js|shelf-config\\.js|D-040|D-041|D-045|D-046|T-C02c|T-C11" .project/C00-UI-STATE-AUDIT.md
git diff --name-only -- . ':(exclude).project/operator-runs/T-C00/*'
```

Expected result:
- first two commands succeed
- the `git diff --name-only` output is exactly:
  `.project/C00-UI-STATE-AUDIT.md`

## Stop Condition

Stop after:
- the audit artifact is written
- the verification commands are run
- `.project/operator-runs/T-C00/REPORT.yaml` is fully filled in

Do not commit.
