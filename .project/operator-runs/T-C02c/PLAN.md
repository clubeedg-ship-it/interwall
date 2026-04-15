# T-C02c — Handshake Off Browser FIFO Authority

## Objective

Land the next `T-C02` slice by removing the active-runtime handshake
dependence on browser-authored FIFO / broken legacy stock-location
helpers.

This packet is intentionally narrow:
- fix the live break where `handshake.js` calls
  `api.getStockAtLocation(...)` even though current `api.js` no longer
  exports it
- remove browser-authored FIFO ordering logic from handshake pick flow
- remove browser-authored receive auto-rotation logic from handshake
- move stock-transfer calls onto a session-authenticated shared API
  helper instead of raw `fetch` + `CONFIG.API_TOKEN`

Do not design a new backend workflow in this packet. Use the server
surfaces that already exist.

## Files Allowed To Change

- `inventory-interwall/frontend/api.js`
- `inventory-interwall/frontend/handshake.js`
- `inventory-interwall/frontend/catalog-detail.js`
- `inventory-interwall/frontend/t_c02c_handshake_verify.mjs`
- `.project/operator-runs/T-C02c/REPORT.yaml`

## Files Forbidden To Change

- all backend files under `apps/api/`
- `inventory-interwall/frontend/wall.js`
- `inventory-interwall/frontend/bin-info-modal.js`
- `inventory-interwall/frontend/profit.js`
- `.project/TODO.md`
- `.project/PLAN.md`
- `.project/DECISIONS.md`
- `.project/COACH-HANDOFF.md`
- `.project/HANDOFFS.md`

## Cold Rebuild

- not required

## Facts Manifest

- `.project/C00-UI-STATE-AUDIT.md` → extract: `T-C02c` routing notes,
  especially handshake/browser stock authority findings
- `inventory-interwall/frontend/handshake.js` → extract:
  `showForPicking`, `populateSourceBins`, `submitReceive`,
  `moveStock`, `submitPick`
- `inventory-interwall/frontend/api.js` → extract: `request`,
  `createStock`, `getStockForPart`, `removeStock`
- `inventory-interwall/frontend/catalog-detail.js` → extract:
  `batchEditor.submit`, current `handshake.moveStock(...)` call
- `apps/api/routers/stock_lots.py` → extract:
  `GET /api/stock-lots/by-product/{ean}` FIFO order contract
- `apps/api/routers/shelves.py` → extract:
  `PATCH /api/shelves/{shelf_id}` already exists but is out of scope

## Decisions To Apply

- `D-040`: browser must not be authoritative for business state
- `D-041`: stock truth should come from canonical server surfaces
- `D-046`: no new unsafe HTML/render work should be introduced

## Required Implementation Shape

Implement the smallest coherent handshake cleanup that matches current
server truth:

1. Add a shared API helper for canonical lot order by product:
   `api.getStockLotsByProduct(ean)` → `GET /api/stock-lots/by-product/{ean}`
2. Add a shared session-authenticated transfer helper in `api.js`
   instead of raw `fetch` with `CONFIG.API_TOKEN`
3. In `handshake.js`:
   - picking mode should load canonical FIFO lot order from the new API
     helper
   - remove the client-authored Bin-B-first / `stocktake_date` sort
   - remove the receive-time auto-rotation that inspects Bin A stock via
     the retired `getStockAtLocation`
   - keep receive behavior simple: create the new stock and refresh UI
4. In `catalog-detail.js`, use the shared transfer helper instead of
   reaching into handshake internals if needed

The packet should prefer deletion over replacement when the deleted
logic was browser authority.

## Acceptance Checks

- `handshake.js` has no `getStockAtLocation(` reference
- `handshake.js` has no raw `fetch(`${CONFIG.API_BASE}/stock/transfer/``
  path and no `CONFIG.API_TOKEN` usage
- `api.js` exports both:
  - `getStockLotsByProduct(`
  - `transferStock(`
- `handshake.js` uses `getStockLotsByProduct` for picking
- `handshake.js` no longer contains the receive auto-rotation branch
  that moves Bin A stock to Bin B before create-stock
- `catalog-detail.js` no longer calls `handshake.moveStock(`
- a source verification script exists and passes

## Verification Commands

Run these before writing `REPORT.yaml`:

```bash
node inventory-interwall/frontend/t_c02c_handshake_verify.mjs
git diff --name-only -- . ':(exclude).project/operator-runs/T-C02c/*'
```

Expected diff names:
- `inventory-interwall/frontend/api.js`
- `inventory-interwall/frontend/handshake.js`
- `inventory-interwall/frontend/catalog-detail.js`
- `inventory-interwall/frontend/t_c02c_handshake_verify.mjs`

## Stop Condition

Stop after:
- the scoped frontend changes are done
- the verification script is green
- `.project/operator-runs/T-C02c/REPORT.yaml` is filled in

Do not commit.
