# C00 UI State Audit (refreshed)

- Date: 2026-04-15
- Task: `T-C00`
- Branch: `v2`
- Scope: `inventory-interwall/frontend/` + this artifact only

## 1. Runtime map

Active runtime is the split-module bundle loaded at the bottom of
`inventory-interwall/frontend/index.html` (lines 1371-1396), in this
order:

1. `env.js` (Docker-generated)
2. `config.js`
3. `api.js`
4. `router.js`
5. `settings.js`
6. `zone-config.js`
7. `zone-manager.js`
8. `bin-info-modal.js`
9. `wall.js`
10. `scanner.js`
11. `handshake.js`
12. `catalog-core.js`
13. `catalog-detail.js`
14. `part-manager.js`
15. `bin-modal.js`
16. `ui.js`
17. `history.js`
18. `auth.js`
19. `compositions.js`
20. `labels.js`
21. `profit.js`
22. `tenant.js`
23. `app-init.js`

Explicit confirmations against `index.html`:
- `app.js` is **not** loaded.
- `app-1770129675.js` is **not** loaded.
- `profit-1770129675.js` is **not** loaded.
- `shelf-config.js` is **not** loaded and the file is not present in the
  current `inventory-interwall/frontend/` tree at all.

These files still sit on disk (`app.js`, `app-1770129675.js`,
`profit-1770129675.js`) and grep will surface them, but they are dead
runtime weight. Treat them as inactive drift noise.

## 2. Storage inventory (active runtime only)

`localStorage` / `sessionStorage` reads/writes in files that
`index.html` actually loads:

| Key | Written by | Read by | Category |
| --- | --- | --- | --- |
| `theme` | `settings.js:71` | `settings.js:50` | UI pref — OK under `D-040` |
| `interwall_view` | `router.js:46` | `router.js:85` | UI pref — OK under `D-040` |
| `interwall_tenant` | `tenant.js:121`, cleared `tenant.js:32,114` | `tenant.js:25` | session context |
| `duplicate_parts_warning` | `app-init.js:72` (sessionStorage) | `app-init.js:70` | UI guard |
| `inventree_token` | removed `app-init.js:168`, `auth.js:159` | — | legacy cleanup only |
| `interwall_zone_version` + `interwall_zones` | `zone-config.js:28,79` | `zone-config.js:23,67` | **wall topology in browser — `D-040` violation** |
| `jit_config` | `part-manager.js:180` | `part-manager.js:171,178` | **reorder business data — `D-040` violation**; feeds client-side ROP math |
| `interwall_cost_config` | `profit.js` `costConfig.loadFromLocalStorage()` (`profit.js:122`) | same | **fallback-only** after backend miss; DB is SoT (`profit.js:141-158`) |
| `interwall_fixed_components` | `profit.js:322,354` | `profit.js:333` | **still written on every `save()` even when DB succeeds**; `backendConfigSync.syncComponents` is a no-op (`profit.js:29-31`) — browser remains authoritative in practice |
| `interwall_transactions` | `profit.js:1529` (`saveTransactions`) | `profit.js:1534,1745` | **fallback + mutation path for manual sales** — `D-040` violation |
| `interwall_totalMargin` | `profit.js:1530` | `profit.js:1535,1541` | derived margin persisted in browser — `D-040` violation |

`config.js`, `api.js`, `wall.js`, `bin-info-modal.js`, `handshake.js`,
`scanner.js`, `catalog-core.js`, `catalog-detail.js`, `bin-modal.js`,
`ui.js`, `history.js`, `compositions.js`, `labels.js`, `zone-manager.js`
perform no direct storage reads/writes.

Routes: `zone-config.js` and the `profit.js` storage set feed `T-C02c`
along with `part-manager.js` `jit_config`. VAT / commission / overhead
DEFAULTS live in `profit.js:41-75` and feed `T-C11` (`D-045`).

## 3. Client-side business-number recomputation inventory

### Stock and wall (feeds `T-C02c`, wall drift also `T-C03` if layout)
- `wall.js:257-276` (`renderOccupancy`) folds `base-shelf + bin A` into
  one displayed quantity per shelf. Numbers themselves come from
  `api.getShelfOccupancy()` → `v_shelf_occupancy` (so the qty source is
  canonical), but the A/base merge is browser-side presentation math.
- `wall.js:369-388` (`processCellFromCache`) computes `totalQty =
  qtyA + qtyB + qtyBase` and feeds `getStatus`.
- `wall.js:400-408` (`getStatus`) maps qty to hardcoded bands
  `<=0 empty`, `<=5 critical`, `<=15 warning`, else `healthy`.
  Hardcoded thresholds → `T-C11` under `D-045`.
- `bin-info-modal.js:85-109` sums A+B+base totals (qty, value, batches,
  capacity) from `wall.occupancyByCell` when a shelf is in single-bin
  mode; otherwise passes through the view row.
- `bin-info-modal.js:128-139` computes `fillPercent = totalQty /
  capacity` and a `< 20%` "low" class. Hardcoded threshold → `T-C11`.

### Stock picking / receiving (feeds `T-C02c`)
- `handshake.js:44-58` sorts pickable stock client-side.
- `handshake.js:135-147` natural-sorts receive-bin options.
- `handshake.js:213-292` runs client-side FIFO auto-rotation (moves
  bin-A stock to bin B via patched API calls before receive).
- `handshake.js:305-390` runs client-side FIFO pick: bin-B first sort,
  per-item `Math.min(remaining, item.quantity)` decrement loop, direct
  `api.removeStock` / PATCH calls. Movement semantics live in browser.

### Catalog / parts (feeds `T-C02c`)
- `catalog-core.js:272-291` (`createCard`) derives stock status
  (`empty` / `critical` / `warning` / `healthy`) in the browser from
  `minimum_stock` and `in_stock`. `in_stock` itself now comes from
  canonical `v_part_stock` via `api.getProductsWithStock` (no more
  hardcoded `in_stock: 0`).
- `catalog-core.js:247-263` per-batch card computes
  `totalValue = quantity * unit_cost` and `price = parseFloat(unit_cost)`
  for display.
- `catalog-core.js:282,284` hardcoded low-stock threshold
  `inStock < minStock * 0.5`. `T-C11` under `D-045`.
- `catalog-detail.js:92` batch total value = `quantity * purchase_price`
  for display.
- `part-manager.js:156-167` (`updateJitDisplay`) computes ROP =
  `ceil(deliveryDays * avgSoldDay + minStock)` in browser. Paired with
  `getJitConfig` / `saveJitConfig` on `jit_config` localStorage.
- `ui.js:117-157` (`alerts.checkLowStock`) pulls canonical
  `getProductsWithStock`, but still derives low-stock state and
  `shortage = minStock - inStock` in the browser.

### Profit, valuation, margin (feeds `T-C02c` and `T-C01`)
- `costConfig.calculateCost` / `calculateAll` (`profit.js:220-261`)
  computes VAT / percentage / fixed costs in browser. VAT extraction
  formula `gross * rate / (1 + rate)` lives client-side.
- `recordSale.saveTransactions` / `loadTransactions`
  (`profit.js:1528-1543`) persists full transaction list + total
  margin to `localStorage`.
- `recordSale.deleteSale` (`profit.js:1578-1674`) mutates
  `profitState.totalMargin` and calls `saveTransactions`, so running
  totals drift into browser state.
- `profitEngine.mapApiTransaction` (`profit.js:1683-1723`) rebuilds
  `totalCost = sale - profit` and `marginPercent` from API payloads.
  Values come from DB, but the breakdown shape is re-derived in JS.
- `profitEngine.fetchInvenTreeSalesOrders` (`profit.js:1766-1898`)
  re-prices imported SOs using **current** `costConfig`
  (commission / overhead / VAT) rather than sale-time values. Direct
  `D-025` / `T-C01` risk surface if this path is still reachable.
- `profitEngine.init` (`profit.js:1740-1750`) falls back to
  `localStorage` transactions when the API returns empty, then
  recomputes `profitState.totalMargin` as a client-side reduce.
- `renderSummary` (`profit.js:2363+`) surfaces
  `profitState.totalMargin` as "Today's Margin" (see line 2371 comment
  "Simplified for MVP"). Labelled field is a browser aggregate, not a
  canonical today-scoped number.
- `renderChart` (`profit.js:2141+`) buckets revenue / cost / profit and
  cumulative profit entirely from `profitState.transactions`.
- `renderInventoryBreakdown` (`profit.js:2427-2442`) recomputes
  `unitCost = value / qty` per row from valuation API data.

## 4. Dynamic HTML / `sanitize()` coverage inventory

Active runtime only. `sanitize()` is defined in `config.js`.

### Safe — routes dynamic values through `sanitize()`
- `wall.js:78-83` zone header (zone name, columns, levels).
- `wall.js:270,273` `renderOccupancy` output (product name + euro).
- `catalog-core.js:137` empty search message sanitizes `searchQuery`.
- `catalog-core.js:255` batch list sanitizes `source` and `date`.
- `catalog-core.js` `createCard` sanitizes part fields (unchanged path
  from prior audit).
- `compositions.js:137,189,222,272+` saved / results / rows all
  sanitize the dynamic strings they render.
- `ui.js:75-76` notification title / message sanitized.
- `ui.js:182` low-stock item name sanitized (numeric qty / minimum are
  raw numbers — safe for text).

### Unsafe — dynamic values reach `innerHTML` without `sanitize()` (all `D-046` / `T-C11`)
- `tenant.js:169-181` tenant selector interpolates `t.id`,
  `t.displayName` from API rows straight into `innerHTML`.
- `labels.js:51-71` `createLabelHTML` interpolates raw `name`, `sku`,
  `location`, formatted price into HTML. Injected by:
  - `labels.js:90` bulk print container
  - `labels.js:121-139` preview modal (plus raw `items.length` in the
    title text — numeric, but still assembled via `innerHTML`).
- `history.js:88-105` `renderMovement` injects raw `partName`,
  `formattedDate`, `movement.notes`, `getTypeLabel(type)` (static), and
  the nested `renderDetails` output.
- `history.js:138-188` `renderDetails` injects raw `movement.quantity`,
  `movement.location_detail.name`, `movement.user_detail.username`,
  `movement.tracking_type`.
- `catalog-detail.js:102-114` supplier URL rendering writes
  `supplierURL` into an `href` and raw `shortenURL(supplierURL)` into
  link text via `innerHTML`. No sanitize and no URL allowlist.
- `profit.js` many transaction / valuation sinks:
  - `profit.js:2422,2434-2441` inventory breakdown table rows
    interpolate raw `item.name` and raw `e.message` in the error path.
  - `profit.js:2457-2514` transaction card header / product /
    breakdown interpolate raw `tx.orderId`, `tx.date`, `tx.productName`,
    and breakdown fields (`breakdown.vatCountry`, etc.) directly into
    `innerHTML`.
  - Additional dynamic writes in the profit-config / fixed-component
    list / record-sale forms render raw user-supplied names (search
    for `innerHTML` in `profit.js` shows 26 sites; at least the
    inventory, transactions, and breakdown sinks above are reachable
    and unsanitized).
- `wall.js:17,23,134` static placeholders (safe).
- `catalog-core.js:149-156` "Load More" button is built with safe
  `textContent`/`className` APIs plus an `innerHTML = 'Load More'`
  static literal (safe).

Primary unsafe sink density by file: `profit.js` > `history.js`,
`labels.js` > `tenant.js`, `catalog-detail.js`. All feed `T-C11` under
`D-046`. Hardcoded thresholds and VAT / commission DEFAULTS in
`profit.js:41-75` and `wall.js:404-407` feed `T-C11` under `D-045`.

## 5. Stale preserved-artifact corrections

The preserved off-branch audit at
`/Users/ottogen/interwall-preserve-2026-04-15/live-tree/.project/C00-UI-STATE-AUDIT.md`
is stale on current `v2`. Specifically:

- It lists `shelf-config.js` as part of the active runtime (preserved
  Runtime map; preserved "Wall And Stock Placement Surfaces" section).
  On current `v2`, `shelf-config.js` is not referenced by `index.html`
  and the file does not exist in `inventory-interwall/frontend/`.
  All `interwall_shelf_config` localStorage usage and all
  `shelfConfig` mutation paths described in the preserved audit are
  no longer part of the active runtime.
- It describes `wall.js` doing bulk per-location aggregation
  (`wall.js:333-370`, `wall.js:406-463`) and folding base-shelf qty
  into bin A visually. Current `wall.js` instead calls
  `api.getShelfOccupancy()` (backed by the `v_shelf_occupancy` view;
  see `api.js:99-101`) and only sums A+B+base per cell
  (`wall.js:369-388`). The A+base display merge still exists inside
  `renderOccupancy` (`wall.js:257-276`). The bulk-in-browser
  aggregation the preserved audit cited is gone.
- It claims `bin-info-modal.js:218-231` mutates bin capacity through
  `shelfConfig`. Current `bin-info-modal.js:193-240` calls
  `api.updateShelf(shelfId, { capacity })` and refreshes via
  `wall.loadLiveData()` — canonical server state, no localStorage.
- It claims `api.js:142-151` exposes `getAvailableStock()` returning
  `{ total, allocated, available }`. That helper no longer exists.
  `api.js` now exposes `getShelfOccupancy()`, `getPartStockSnapshot()`,
  `getProductsWithStock()`, and `updateShelf()`.
- It claims `catalog-core.js:107-116` hardcodes `in_stock: 0` at
  normalization time. Current `catalog-core.js` no longer normalizes
  products locally; `api.getProductsWithStock()` (`api.js:157-176`)
  merges each product with the canonical `v_part_stock` snapshot via
  `getPartStockSnapshot()`. Catalog cards now receive real
  `in_stock`. The preserved “Parts page shows 0 / Valuation shows
  stock” framing no longer applies.
- It treats `app.js`, `app-1770129675.js`, and `profit-1770129675.js`
  as ambiguous drift surfaces. On current `v2`, `index.html` does
  not load any of them; they remain on disk but are inert — relevant
  for housekeeping only.

Everything in the preserved audit about `router.js`, `settings.js`,
`tenant.js`, `zone-config.js`, `part-manager.js` (`jit_config`),
`handshake.js` FIFO rotation, `profit.js` localStorage for transactions
/ total margin / fixed components, `labels.js`, `history.js`,
`catalog-detail.js` supplier URL injection still matches current
`v2`.

## 6. Task-routing notes

- **`T-C02c` (browser stock authority and business storage)**
  - `zone-config.js` `interwall_zones` / `interwall_zone_version`.
  - `part-manager.js` `jit_config` + browser ROP calc.
  - `profit.js` `interwall_transactions` / `interwall_totalMargin` /
    `interwall_fixed_components` persistence and fallbacks.
  - `profit.js` `renderSummary` treating `totalMargin` as "Today's
    Margin".
  - `profit.js` `fetchInvenTreeSalesOrders` repricing imported SOs.
  - `handshake.js` client-authored FIFO rotation and pick logic.
  - `wall.js` A/base display merge in `renderOccupancy`.
  - `bin-info-modal.js` client-side `fillPercent` math.
- **`T-C11` (sanitize and hardcoded-value debt, `D-045` / `D-046`)**
  - Unsanitized `innerHTML`: `profit.js`, `history.js`, `labels.js`,
    `tenant.js`, `catalog-detail.js`.
  - Hardcoded thresholds / VAT / commission defaults: `wall.js:404-407`,
    `bin-info-modal.js:131`, `catalog-core.js:281-284`,
    `profit.js:41-75`.
  - Inactive-file cleanup (`app.js`, `app-1770129675.js`,
    `profit-1770129675.js`) as a secondary pass so grep stops
    surfacing duplicate logic.
- **`T-C03` (DB-driven wall layout)**
  - Moving wall topology off `zone-config.js` localStorage onto the
    backend is the only current wall-rendering concern that is clearly
    DB-layout-shaped. Everything else on the wall is already reading
    canonical `v_shelf_occupancy`.

Decision references applied throughout: `D-040` (no browser-authoritative
business data), `D-041` (single canonical stock source), `D-045`
(hardcoded thresholds / business constants are debt), `D-046` (dynamic
`innerHTML` must route untrusted data through `sanitize()`).
