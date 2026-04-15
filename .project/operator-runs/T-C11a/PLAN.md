# T-C11a — Render-Safety Fix Pass

## Objective

Execute the first bounded slice of `T-C11`: fix the highest-signal
active-runtime `sanitize()` gaps identified by `T-C00`.

This packet is only the render-safety half of `T-C11`.
Do not widen into general config-surface design or inactive-file
cleanup.

## Files Allowed To Change

- `inventory-interwall/frontend/history.js`
- `inventory-interwall/frontend/labels.js`
- `inventory-interwall/frontend/tenant.js`
- `inventory-interwall/frontend/catalog-detail.js`
- `inventory-interwall/frontend/profit.js`
- `inventory-interwall/frontend/t_c11a_sanitize_verify.mjs`
- `.project/operator-runs/T-C11a/REPORT.yaml`

## Files Forbidden To Change

- `inventory-interwall/frontend/wall.js`
- `inventory-interwall/frontend/bin-info-modal.js`
- `inventory-interwall/frontend/catalog-core.js`
- `inventory-interwall/frontend/handshake.js`
- `inventory-interwall/frontend/app.js`
- `inventory-interwall/frontend/app-1770129675.js`
- `inventory-interwall/frontend/profit-1770129675.js`
- all backend files under `apps/api/`
- `.project/TODO.md`
- `.project/PLAN.md`
- `.project/DECISIONS.md`
- `.project/COACH-HANDOFF.md`
- `.project/HANDOFFS.md`

## Cold Rebuild

- not required

## Facts Manifest

- `.project/C00-UI-STATE-AUDIT.md` → extract:
  section 4 unsafe `innerHTML` sinks and `T-C11` routing notes
- `inventory-interwall/frontend/config.js` → extract: `sanitize`
- `inventory-interwall/frontend/history.js` → extract:
  `render`, `renderMovement`, `renderDetails`
- `inventory-interwall/frontend/labels.js` → extract:
  `createLabelHTML`, `showPreview`
- `inventory-interwall/frontend/tenant.js` → extract:
  tenant selector render path
- `inventory-interwall/frontend/catalog-detail.js` → extract:
  supplier URL rendering path
- `inventory-interwall/frontend/profit.js` → extract:
  inventory breakdown render, transaction list render, and the
  highest-signal dynamic `innerHTML` sinks reachable in normal runtime

## Decisions To Apply

- `D-046`: every dynamic `innerHTML` path with untrusted data must
  route through `sanitize()`
- `D-045`: do not introduce new hardcoded business values while fixing
  render safety

## Required Implementation Shape

Fix the active unsanitized render paths identified in `T-C00`:

1. `history.js`
   - sanitize dynamic fields in `renderMovement` and `renderDetails`
2. `labels.js`
   - sanitize dynamic label content before HTML assembly
3. `tenant.js`
   - sanitize tenant IDs / names in selector rendering
4. `catalog-detail.js`
   - sanitize supplier URL text
   - avoid writing raw URL into `innerHTML` without escaping
   - if needed, prefer DOM APIs for the anchor element over raw string
     interpolation
5. `profit.js`
   - fix the highest-signal live sinks from `T-C00`, specifically:
     inventory breakdown rows
     transaction cards
     transaction breakdown render paths

You do not need to eliminate every single `innerHTML` in `profit.js`.
You do need to make the normal transaction / valuation views compliant
with `D-046` and document any residual sink you intentionally leave.

## Acceptance Checks

- targeted files no longer interpolate raw user/server strings into
  `innerHTML` without `sanitize()` or equivalent safe DOM APIs
- `history.js`, `labels.js`, `tenant.js`, `catalog-detail.js`
  are covered
- `profit.js` transaction-list and inventory-breakdown paths are covered
- no inactive bundles (`app.js`, `app-1770129675.js`,
  `profit-1770129675.js`) were edited
- a source verification script exists and passes

## Verification Commands

Run these before writing `REPORT.yaml`:

```bash
node inventory-interwall/frontend/t_c11a_sanitize_verify.mjs
git diff --name-only -- . ':(exclude).project/operator-runs/T-C11a/*'
```

Expected diff names:
- `inventory-interwall/frontend/history.js`
- `inventory-interwall/frontend/labels.js`
- `inventory-interwall/frontend/tenant.js`
- `inventory-interwall/frontend/catalog-detail.js`
- `inventory-interwall/frontend/profit.js`
- `inventory-interwall/frontend/t_c11a_sanitize_verify.mjs`

## Stop Condition

Stop after:
- the scoped render-safety fixes are done
- the verification script is green
- `.project/operator-runs/T-C11a/REPORT.yaml` is filled in

Do not commit.
