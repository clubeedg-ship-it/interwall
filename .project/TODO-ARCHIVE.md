# Interwall — TODO Archive

Completed T-### tasks and closed open questions. NOT auto-imported;
grep here when a past task's scope or DONE reference is needed.

Moved from TODO.md 2026-04-15 to trim the auto-load footprint.

---

## Cross-cutting / prerequisites — completed

### `T-X04` — Validate local Claude Code can push → DONE 2026-04-15
- Verified by direct push of commits df737aa, f3b203d, 1ec5663 on v2
- Local CLI has full write access; coaching session (desktop) remains read-only per D-090

### `T-X06` — Land protocol substrate → DONE 2026-04-15
- Commits f3b203d (.project/ files) and 1ec5663 (CLAUDE.md rewire)
- PROCESS.md, PRIMER-TEMPLATE.md, REPORT-SCHEMA.md, RETROSPECTIVES.md,
  COMPONENTS.md (stub) all live on v2
- CLAUDE.md imports now include PROCESS / PRIMER-TEMPLATE / REPORT-SCHEMA

### `T-X07` — Relocate T-A04 test file → DONE 2026-04-15 (f3b848c)
- `git mv apps/api/sql/07_test_deduct_fifo.sql apps/api/tests/t_A04_deduct_fifo_for_group.sql`
- Ensure final line prints `T-A04 ALL TESTS PASSED`
- Re-run to confirm green
- Commit: `chore(tests): relocate T-A04 test per new discipline`
- deps: T-X06

### `T-X08` — Verify 3b65501 contains full deduct_fifo_for_group body → DONE 2026-04-15
- Confirmed commit 3b65501 has `CREATE OR REPLACE FUNCTION` with full body
- Unblocked T-A06

### `T-X10` — Stream A retrospective → DONE 2026-04-15 (b0c8e07)
- RETROSPECTIVES.md entry + patches to REPORT-SCHEMA (tests array
  form, split deps fields, cold_rebuild_survival block) +
  PRIMER-TEMPLATE (§7 cold-rebuild declaration) +
  PROCESS (§11 post-merge cold-rebuild sanity check) +
  CLAUDE.md (port 1441 note).

### `T-A07a` — Durable test harness for T-A07 → DONE 2026-04-15 (a53156b)
- Added httpx + pytest + pytest-asyncio to requirements.txt
- Added bind mount for apps/api → /app in api service
- Cold-rebuild verification green (all prior tests pass)

---

## Stream A — Backend rework (completed)

### `T-A00` — Schema audit session → DONE 2026-04-15
- Subagent reads `apps/api/sql/init.sql` table-by-table
- Output: structured audit per table (keep / rename / add / deprecate), column-level notes, integrity gaps (missing CHECK / FK / index)
- Review with user; lock decisions in DECISIONS.md before execution
- deps: none

### `T-A01` — Add AVL + Build schema → DONE 2026-04-15
- DDL: `item_groups`, `item_group_members`, `builds`, `build_components`, `external_item_xref`, `stock_ledger_entries` (D-012, D-013, D-017)
- Forward-compat columns unwired: `item_group_members.priority`, `build_components.valid_from/valid_to`, `stock_lots.serial_number` (D-015, D-085, D-086, D-087)
- Idempotent: `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`
- Do NOT touch `ean_compositions` or `process_sale()` (D-010)
- deps: `T-A00`

### `T-A02` — Normalize shelf addressing → DONE 2026-04-15
- Rename schema columns to Zone / Column / Level / Bin where they aren't already (D-050)
- Update indexes and FK names
- Migration script: keep reversible for one release window
- deps: `T-A00` (audit first), `T-A01` (same migration file)

### `T-A03` — Backfill from legacy `ean_compositions` + trivial builds for all sellable products → DONE 2026-04-15
- One-shot idempotent script: `apps/api/sql/05_item_groups_backfill.sql`
- Each `component_ean` → singleton `item_group` + `item_group_member`
- Each `parent_ean` → `build` + `build_components` rows
- **Every sellable product without an existing build** gets a trivial auto-generated build (`is_auto_generated = TRUE`) with one component pointing at a singleton item_group containing just that product (D-018)
- **Migrate `sku_aliases`** rows: for each (marketplace_sku, product_ean, marketplace), ensure a trivial build exists for the target EAN (via D-018), then insert a matching `external_item_xref` row (D-019)
- `ON CONFLICT DO NOTHING` throughout
- Verify: every product with stock_lots has a reachable build; count(sku_aliases) == count(new external_item_xref rows from migration); count(distinct parent_ean) + count(auto-generated builds) == count(builds)
- deps: `T-A01`

### `T-A03a` — Retire `sku_aliases` writes → DONE 2026-04-15 (7669ffa)
- Poller never wrote to sku_aliases; test guards the invariant going forward
- sku_aliases reads remain in place per D-010

### `T-A04` — `deduct_fifo_for_group` PL/pgSQL function → DONE 2026-04-15 (3b65501)
- Signature: `(item_group_id UUID, qty INT) RETURNS TABLE (stock_lot_id, product_id, qty_taken, unit_cost)`
- `SELECT FOR UPDATE` ordered by `received_at ASC, id ASC` (D-021, D-023)
- Raises on insufficient stock
- Pools across all `item_group_members` (D-020)
- Tests: two-product group, oldest-wins scenario; overflow RAISE
- deps: `T-A01`

### `T-A05` — `process_bom_sale` PL/pgSQL function → DONE 2026-04-15 (665be4e, 147f512)
- Single-transaction atomic (D-022)
- Flow: lookup build → insert txn shell → loop build_components (filtered by valid_from/valid_to) → call deduct_fifo_for_group per line → write stock_ledger_entries row per lot consumed → apply fixed_costs → update cogs + profit (D-017, D-025)
- Raises on any error; rolls back entire transaction
- Tests: happy path, stock-out rollback, multi-line build, fixed-cost math
- deps: `T-A04`

### `T-A06` — `v_part_stock` canonical stock view → DONE 2026-04-15 (90604be)
- One SQL view returning `(product_id, ean, name, total_qty, total_value, last_received_at)`
- Filtered by `quantity > 0`, joined through `stock_lots`
- Used by Parts page AND Profit/Valuation page (D-041)
- deps: `T-A01`

### `T-A07` — FastAPI routers → DONE 2026-04-15 (b649018, 4ef7eca; durability a53156b)
- `/api/item-groups` — CRUD + member attach/detach; 409 on detach if orphan risk
- `/api/builds` — CRUD + full-replace PUT for components; auto-assign BLD-NNN if no code provided (D-014)
- `/api/external-xref` — CRUD + `/resolve?marketplace=&sku=` utility
- All behind `require_session`; RealDictCursor
- Register in `main.py`
- deps: `T-A01`, `T-A05`

### `T-A08` — Email poller BOM-first routing → DONE 2026-04-15 (504977e)
- Extend `email_poller/sale_writer.py` with `resolve_build_code(marketplace, external_sku)`
- Prefer `process_bom_sale`; fall back to legacy `process_sale` only when no xref AND no build match (D-024)
- If xref exists for (marketplace, sku) but build inactive → raise (D-033)
- Log path taken at INFO
- deps: `T-A05`, `T-A07`

### `T-A09` — Health page invariant queries → DONE 2026-04-15 (e5015ae)
- 4 SQL views (v_health_parts_without_shelf, _parts_without_reorder,
  _builds_without_xref, _sales_without_ledger)
- /api/health router with roll-up + drill-downs
- /api/health/ping unauthenticated for monitoring

### Stream A Tier 3 acceptance → DONE 2026-04-15 (f095131)
- Single e2e scenario, 7 steps, ~20 assertions (t_A_acceptance.py)
- All 11 cited decisions verified in practice
- Retrospective: see RETROSPECTIVES.md Stream A entry

---

## Stream B — Marketplace ingestion (completed to date)

### `T-B00` — Bol.com Retailer API v10 catalogue audit → DONE 2026-04-15
- Research session produced `.project/BOL-CONTRACT.md` (pending commit
  on server — agent reported SHA as "pending", protocol deviation)
- Key finding: D-030 was materially wrong. Webhooks carry only
  PROCESS_STATUS + SHIPMENT. New orders require API polling.
  Signature is RSA-SHA256, not HMAC. Logged as D-097 superseding D-030.
- Open questions Q2-Q7 closed 2026-04-15:
  - Q2: offer.reference primary, product.ean fallback.
  - Q3: .env file for OAuth2 creds (BOL_CLIENT_ID, BOL_CLIENT_SECRET).
  - Q4: per-item commission from API overrides percentage → D-098.
  - Q5: sale_price = totalPrice/quantity (discounts absorbed) → D-099.
  - Q6: order_ref = "bol-{orderId}-{orderItemId}", one txn row per item.
  - Q7: FBB skipped entirely, P-14 parked.
- P-13 parked for optional shipment-webhook receiver.

### `T-B01` — Bol.com order poller → DONE 2026-04-15 (f58b85e, 7cfa987)
- APScheduler job + OAuth2 client-credentials flow
- 10-case pytest suite covering full pipeline
- Per-item commission override (D-098) + discount absorption (D-099)
- Commits: f58b85e (poller), 7cfa987 (tests)

---

## Closed questions

### `T-Q01` — Direct-sale products path confirmation → CLOSED 2026-04-15
- Answer: **No** — legacy `process_sale` silently records zero COGS and no stock deduction for non-composite products. Fixed by D-018: every sellable product gets a trivial auto-generated build, making `process_bom_sale` the only sale code path. Scope absorbed into T-A03.

### `T-Q02` — Bol.com Subscription event catalog → CLOSED 2026-04-15
- Resolved by T-B00 research. Webhooks carry only PROCESS_STATUS + SHIPMENT; new orders require API polling. See D-097.

### `T-Q03` — Shelf-setup flow — mandatory vs pending allowed → CLOSED 2026-04-15
- Answer: allow pending with explicit "needs setup" badge. Logged as D-088.

### `T-Q04` — JIT colour gradient breakpoints → CLOSED 2026-04-15
- Answer: 5 bands (critical/low/at/healthy/over) as fraction of reorder point, user-editable hex. Logged as D-089.

### `T-Q05` — InvenTree v1.2 FIFO-to-COGS smoke test → CLOSED 2026-04-15
- Answer: skipped. Stay-custom decision stands. Logged as D-093.
