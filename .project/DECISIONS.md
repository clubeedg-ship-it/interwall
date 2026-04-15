# Interwall — Decisions Log

**Format:** Append-only. Each entry has an ID, date, one-line decision, one-line rationale, rejected alternatives, and a reversibility note. Entries are never edited; a reversal creates a new entry that supersedes the old one by ID reference.

**How to use:** Ctrl-F any keyword to find the call and the reason. If you're about to re-open a settled question, search here first.

---

## Index

- [Architecture & stack](#architecture--stack)
- [Schema — tables & naming](#schema--tables--naming)
- [Engine — FIFO & sale processing](#engine--fifo--sale-processing)
- [Ingestion — email & webhooks](#ingestion--email--webhooks)
- [UI & state](#ui--state)
- [Shelf addressing](#shelf-addressing)
- [Vocabulary — UI labels](#vocabulary--ui-labels)
- [Process & planning](#process--planning)
- [Scope & deferrals](#scope--deferrals)
- [Environment & operational](#environment--operational)

---

## Architecture & stack

### D-001 — Keep FastAPI + PostgreSQL + vanilla JS stack
- **Date:** 2026-04-15
- **Decision:** Continue with the existing stack. No adoption of ERPNext, Odoo, InvenTree, or any other OSS ERP as runtime.
- **Rationale:** Solo maintainer; every adopted runtime becomes operational weight. AVL+FIFO-across-group is absent or manual in every candidate, so custom code is required regardless — adopting a runtime only adds a dependency, not a shortcut.
- **Rejected alternatives:**
  - ERPNext — heavy Frappe+MariaDB+Redis+Node stack; loses Postgres; Item Alternative is manual substitution only
  - Odoo CE — no AVL in core; requires paid Apps Store module or Enterprise; XML-RPC deprecating by 2028
  - InvenTree 1.x — original migration reason (no FIFO-to-COGS) still unresolved post-v1.0
  - Dolibarr — BOM and FIFO both weak
  - Tryton — no AVL at BOM line level
  - Saleor / Medusa / Vendure — no BOM, no lot costing (wrong domain)
  - iDempiere / Metasfresh / Axelor — Java-heavy, overkill for 1–2 users
- **Reversibility:** Low (stack change is months of work).

### D-002 — Lift OSS shapes, don't adopt runtimes
- **Date:** 2026-04-15
- **Decision:** Read ERPNext DocType JSONs, Tryton's `product_cost_fifo`, and Bol.com's OpenAPI spec for design reference; translate their shapes into our own code.
- **Rationale:** Capture 15 years of battle-tested design without taking on the maintenance burden.
- **Reversibility:** High (design references don't create dependencies).

### D-003 — Single-tenant forever (in this product)
- **Date:** 2026-04-15
- **Decision:** Interwall remains single-tenant. No `tenant_id`, no RLS policies.
- **Rationale:** Client is one business; multi-tenancy adds schema and permissions complexity with zero value.
- **Reversibility:** Medium (retrofit is possible but painful).

---

## Schema — tables & naming

### D-010 — Additive schema migrations only
- **Date:** 2026-04-15
- **Decision:** New structures (item_groups, builds, build_components, stock_ledger_entries, external_item_xref) are added alongside legacy structures (ean_compositions, process_sale). Legacy is not dropped until the new path is proven in production.
- **Rationale:** Non-destructive rollout; legacy sale path keeps working during migration.
- **Reversibility:** High during migration window; low after legacy drop.

### D-011 — Keep `products` as the table name
- **Date:** 2026-04-15
- **Decision:** Do not rename `products` to `items`.
- **Rationale:** ERPNext-aligned name would be `items`, but the rename cost (all references in code, API, SQL, docs) outweighs the clarity gain at this scale.
- **Rejected alternative:** `items` (ERPNext-standard).
- **Reversibility:** Medium.

### D-012 — Use `item_groups` for the AVL substitute-group concept
- **Date:** 2026-04-15
- **Decision:** Table is named `item_groups`; members are `item_group_members`.
- **Rationale:** Industry-recognizable; already drafted in design artifacts; differentiates from categories.
- **Rejected alternatives:**
  - `sku_groups` — user-friendly but non-standard
  - `avl_groups` — EMS-industry precise but unfamiliar
  - `item_alternatives` — ERPNext-exact but implies pairwise not group
- **Reversibility:** Medium.

### D-013 — Rename `boms` → `builds`, `bom_lines` → `build_components`, `order_code` → `build_code`
- **Date:** 2026-04-15
- **Decision:** Finished-product entity is `builds`; its recipe rows are `build_components`; the primary key is `build_code`.
- **Rationale:** Reflects that the entity IS the finished product, not merely a bill-of-materials abstraction. Plain English. Matches PC-assembly vernacular.
- **Rejected alternatives:**
  - Keep `boms` + `bom_lines` (ERPNext-exact but conflates recipe and product)
  - `assemblies` / `assembly_items` (ERPNext-exact, more jargon)
  - `build_bom_lines` (consistent but verbose)
- **Reversibility:** Medium.

### D-014 — Auto-generated sequential `build_code` with optional override
- **Date:** 2026-04-15
- **Decision:** New builds get `BLD-NNN` by default; user may override at creation. Build code is permanent after creation (referenced by external_item_xref, ledger, transactions).
- **Rationale:** Removes "what code do I pick?" friction; allows human-readable codes (HVM-001) when meaningful.
- **Reversibility:** High (only affects future builds).

### D-015 — Forward-compatibility columns ship schema-only, unwired
- **Date:** 2026-04-15
- **Decision:** Ship `item_group_members.priority`, `build_components.valid_from/valid_to`, `stock_lots.serial_number` in the schema but do not wire them into logic this rebuild.
- **Rationale:** Retrofitting these later costs a migration; shipping them now costs nothing. Logic can adopt them when needed without schema change.
- **Reversibility:** High (unwired columns can be dropped if never used).

### D-016 — UUID primary keys via `gen_random_uuid()` (pgcrypto)
- **Date:** 2026-04-02 *(carried from Phase 01)*
- **Decision:** All primary keys are `UUID DEFAULT gen_random_uuid()`.
- **Rationale:** Already standard in the project; avoids sequence-leak across environments.
- **Reversibility:** Low.

### D-018 — Every sellable product gets a trivial build (single code path)
- **Date:** 2026-04-15
- **Decision:** Direct-sale products (monitors, mini-PCs, anything without an `ean_compositions` entry) each get an auto-generated build with one component line pointing at a singleton item_group containing just that product. `process_bom_sale` becomes the only sale code path — no branching between "build sale" and "direct sale". Auto-generated builds carry `is_auto_generated = TRUE` so the Builds UI can collapse them. `T-A03` (backfill) covers all sellable products, not just those with existing compositions.
- **Rationale:** Eliminates the silent bug where `process_sale` records zero COGS and no stock deduction for non-composite products. One code path is easier to audit, test, and maintain.
- **Rejected alternative:** Explicit direct-sale branch in `sale_writer.py` — adds a second code path that would need its own COGS/ledger logic, doubling the correctness surface.
- **Reversibility:** High (auto-generated builds can be deleted if the approach changes).

### D-019 — `sku_aliases` retires; `external_item_xref` is the single SKU resolution table
- **Date:** 2026-04-15
- **Decision:** `external_item_xref` (marketplace, external_sku → build_code) replaces `sku_aliases` (marketplace_sku → product_ean) for all new writes. `sku_aliases` is kept readable during migration (not dropped per D-010) but receives no new inserts. The backfill (T-A03) migrates existing `sku_aliases` rows by creating trivial builds for their target EANs (via D-018) and inserting corresponding `external_item_xref` rows.
- **Rationale:** Two SKU-resolution tables with different semantics (EAN vs build_code) is a class of bugs waiting to happen. Single table, single lookup path.
- **Rejected alternative:** Keep both tables active with a fallback chain (check xref first, then sku_aliases) — adds maintenance burden and hides misconfiguration.
- **Reversibility:** Medium (reactivating sku_aliases is possible but requires re-syncing).

### D-017 — Stock ledger is mandatory for every sale
- **Date:** 2026-04-15
- **Decision:** Every row in `transactions` where type='sale' must have ≥1 corresponding row in `stock_ledger_entries`. Enforced as an invariant checked on the Health page; a violation is treated as a bug, not a data condition.
- **Rationale:** Without the ledger, FIFO traceability is lost — which specific lot was consumed becomes unknowable. Double-entry for inventory is non-negotiable.
- **Reversibility:** Low (removing it loses audit trail forever).

---

## Engine — FIFO & sale processing

### D-020 — FIFO pools across an item group, not per EAN
- **Date:** 2026-04-15
- **Decision:** `deduct_fifo_for_group(item_group_id, qty)` selects the oldest `stock_lots` row where the product is a member of the group, regardless of which specific EAN within the group it is.
- **Rationale:** Models the business reality: "pick any RTX 3050 in stock", not "pick this specific MSI 3050".
- **Rejected alternative:** Per-product FIFO (what legacy `process_sale` does) — forces manual recipe edits every time supplier changes.
- **Reversibility:** Medium (legacy path still exists).

### D-021 — `SELECT FOR UPDATE`, not `SKIP LOCKED`
- **Date:** 2026-04-02 *(carried from Phase 01, reaffirmed 2026-04-15)*
- **Decision:** FIFO deduction uses strict row locking; concurrent sales serialize on the same group.
- **Rationale:** Correctness over throughput. At ~5 orders/day, throughput is irrelevant. Strict serialization eliminates a class of concurrency bugs.
- **Reversibility:** High (function change).

### D-022 — `process_bom_sale` is single-transaction atomic
- **Date:** 2026-04-15
- **Decision:** The entire sale (shell insert + all component deductions + all ledger writes + COGS update + profit computation) runs in one transaction. `RAISE` rolls back everything including the transaction shell row.
- **Rationale:** Partial fulfilment is never a valid state for a PC build. Either the entire recipe deducts or nothing does.
- **Reversibility:** Low (changing this would redefine what "a sale" means).

### D-023 — Deterministic FIFO tiebreaker
- **Date:** 2026-04-15
- **Decision:** When two lots share `received_at`, tie-break by `stock_lots.id` ASC.
- **Rationale:** Reproducibility across environments and test runs.
- **Reversibility:** High.

### D-024 — `process_sale` legacy path retained during migration
- **Date:** 2026-04-15
- **Decision:** The legacy `process_sale(ean, ...)` function and `ean_compositions` table remain callable. The email poller uses it as a fallback when no marketplace SKU mapping exists for a sale.
- **Rationale:** Non-destructive migration (D-010). Also handles direct-sale products (monitors, mini-PCs) with no special-casing — they simply have no build, so the fallback path fires.
- **Reversibility:** Decided per D-010 retirement window.

### D-026 — `transactions.type` stays `'sale'` for all sales; `build_code` distinguishes routing
- **Date:** 2026-04-15
- **Decision:** All sales use `type = 'sale'` regardless of processing path. A nullable `build_code` column on `transactions` records which build was used. Once D-018 is fully live and all sales are BOM-routed, every sale will have a `build_code`. No new type value is introduced.
- **Rationale:** A sale is a sale from the operator's perspective. The processing path is an implementation detail, not a domain concept.
- **Rejected alternative:** Introduce `'bom_sale'` type — splits queries, reports, and UI logic for no domain benefit.
- **Reversibility:** High.

### D-027 — `process_bom_sale` RAISE on missing `vat_rates` row (no silent default)
- **Date:** 2026-04-15
- **Decision:** When `process_bom_sale` cannot find a `vat_rates` row for the sale's marketplace, it raises an exception and rolls back. No fallback to 21%. A seed check in `init.sql` asserts every active marketplace has a `vat_rates` row.
- **Rationale:** The legacy `process_sale` silently defaults to 21% VAT — this hides misconfiguration (e.g. a new marketplace added without a VAT row). Failing loudly is correct for money calculations.
- **Rejected alternative:** Default to 21% (legacy behavior) — silent misconfiguration in profit calculations.
- **Reversibility:** High.

### D-025 — Profit and COGS are stored, not recomputed
- **Date:** 2026-04-15
- **Decision:** `transactions.cogs` and `transactions.profit` are written by `process_bom_sale` at sale time, from the actual lots consumed and the fixed costs in effect at that moment, and are never recomputed.
- **Rationale:** Fixes the class of bugs where re-saving a sale changes its margin. Historical sales reflect their actual economic outcome, not a recomputation against current VAT / commission.
- **Rejected alternative:** Compute-on-read (what causes the X→Y bug).
- **Reversibility:** High (re-derivation is possible if ever wanted).

---

## Ingestion — email & webhooks

### D-030 — Bol.com migrates to Retailer API webhooks
- **Date:** 2026-04-15
- **Decision:** Bol.com sales ingest via the Retailer API Subscription (HMAC-signed webhooks, GA since 2025). Email parser for Bol.com is retired but kept as fallback for a transition window.
- **Rationale:** Free API, event-driven, retries on 5xx, signed — closes the reliability gap that email parsing cannot. Biggest-ROI ingestion change.
- **Reversibility:** High.

### D-031 — Email parser remains for Mirakl marketplaces (MediaMarktSaturn, Boulanger)
- **Date:** 2026-04-15
- **Decision:** Keep the IMAP + parser pipeline for the two Mirakl-based marketplaces.
- **Rationale:** Mirakl API subscription is €700/mo. At current volume (~5 orders/day total across 3 marketplaces), the cost-per-order to access the API exceeds the profit-per-order. Email parsing is fragile but free.
- **Reversibility:** High (can switch when volume justifies).

### D-032 — Unified ingestion table with `source` column
- **Date:** 2026-04-15
- **Decision:** All ingest events (webhook + email + future sources) land in the same pipeline and table, distinguished by a `source` column. Downstream processing is source-agnostic.
- **Rationale:** Enables reliability comparison, unified Health view, easier addition of future sources.
- **Reversibility:** Medium.

### D-033 — External xref is authoritative
- **Date:** 2026-04-15
- **Decision:** If a row in `external_item_xref` exists for (marketplace, external_sku) but its `build_code` no longer resolves to an active build, the sale writer raises — does not silently fall back to legacy `process_sale`.
- **Rationale:** Silent fallback hides misconfiguration. A mapped SKU with a broken target is a bug to surface, not to route around.
- **Reversibility:** High.

### D-035 — Rename `emails` table to `ingestion_events`
- **Date:** 2026-04-15
- **Decision:** The `emails` table is renamed to `ingestion_events` in T-A01 as its own commit. All code references updated in the same commit. The table already has the right shape for unified ingestion (D-032); the name is the only thing wrong.
- **Rationale:** Webhooks are not emails. The table name should reflect its actual role as the unified ingestion surface. Renaming now (before new code is written against it) is cheaper than aliasing with a view and renaming later.
- **Rejected alternative:** Add a view `v_ingestion_events` over `emails` during migration — adds an abstraction layer; the rename still happens eventually; net more work.
- **Reversibility:** Medium (rename touches all references).

### D-034 — Dead-letter state for unprocessable ingestion
- **Date:** 2026-04-15
- **Decision:** Emails/webhook events that cannot be parsed or that raise during processing enter a `pending`/`failed` state, visible on the Health page. Never silently dropped.
- **Rationale:** Ingestion failures must be recoverable and visible to the operator.
- **Reversibility:** High.

---

## UI & state

### D-040 — Database is the single source of truth
- **Date:** 2026-04-15
- **Decision:** No business data is authoritative in the frontend. `localStorage` holds only pure UI preferences (dark mode, last-viewed tab). All stock counts, margins, statuses render from canonical endpoints.
- **Rationale:** Root cause of the margin-X→Y bug and the Parts-vs-Valuation disagreement. Eliminating divergence sources eliminates the class of bugs.
- **Reversibility:** Low (reverting would reintroduce the bug class).

### D-041 — One canonical stock-count view
- **Date:** 2026-04-15
- **Decision:** A single SQL view (`v_part_stock` or equivalent) is the sole source of stock quantity per product. Every page that displays stock uses it.
- **Rationale:** Eliminates the Parts-Catalog-shows-0 / Valuation-shows-stock class of disagreements.
- **Reversibility:** High.

### D-042 — Wall is the primary shelf interface (forward and reverse)
- **Date:** 2026-04-15
- **Decision:** The Wall page is both the browsing surface and the picker. Clicking a bin shows its contents; assigning a batch to a shelf uses a mini-Wall wizard that drills down Zone → Column → Level → Bin. The shelf dropdown is removed entirely.
- **Rationale:** One mental model for "where is this?" and "put this here". Removes the massive-dropdown UX problem.
- **Reversibility:** High (UI pattern).

### D-043 — Batches view shows full history with colour semantics
- **Date:** 2026-04-15
- **Decision:** The batches view for a Part shows all batches (active and depleted). Active batches carry a JIT-health gradient colour badge; depleted batches fade to grey. Default view shows newest N; a toggle reveals full history.
- **Rationale:** Operator sees current health AND traceability in one place; stock cycles become visible.
- **Reversibility:** High.

### D-044 — Product setup wizard for new Parts
- **Date:** 2026-04-15
- **Decision:** Creating a Part is a guided wizard: Section 1 Basic info (name, SKU, category, etc.) → Section 2 JIT Reorder Point (avg delivery days, avg sold/day, computed reorder point, minimum stock) → Section 3 Initial Stock (shelf via Wall mini-wizard, quantity, unit cost).
- **Rationale:** Reduces trial-and-error; minimum-stock lives in JIT section because they're conceptually linked.
- **Reversibility:** High.

### D-045 — No hardcoded business values anywhere
- **Date:** 2026-04-15
- **Decision:** JIT gradient breakpoints, shelf sizes, VAT rates, marketplace senders, category lists — all configurable via database or settings surface. Code ships with defaults that are themselves seeded into the database.
- **Rationale:** Configurability is a client-facing need and a maintenance necessity.
- **Reversibility:** High.

### D-046 — Render-safe DOM via `sanitize()`
- **Date:** 2026-04-02 *(carried from Phase 02, reaffirmed 2026-04-15)*
- **Decision:** Every `innerHTML` assignment with user-provided data routes through the `sanitize()` utility (createTextNode-based).
- **Rationale:** XSS prevention. Client data includes marketplace SKUs and product names from untrusted sources.
- **Reversibility:** Low (removing would reintroduce XSS class).

### D-048 — Product setup status is a view, not a stored boolean
- **Date:** 2026-04-15
- **Decision:** `setup_complete` is NOT a column on `products`. Instead, a view `v_product_setup_status(product_id, setup_complete BOOLEAN, missing_fields TEXT[])` computes completeness from underlying state: reorder point configured (`minimum_stock > 0` OR JIT inputs set), category assigned, and at least one shelf-assigned stock_lot. The "needs setup" badge renders from this view.
- **Rationale:** Stored booleans drift from reality. A view always reflects the actual state — if a product's last shelf-assigned lot is consumed, setup_complete automatically becomes false. No sync bugs possible.
- **Rejected alternative:** `products.setup_complete BOOLEAN` column — requires triggers or application code to keep in sync with stock_lots, categories, and reorder config; guaranteed to drift.
- **Reversibility:** High.

### D-049 — JIT bands stored in dedicated `jit_bands` table, not generic app_config
- **Date:** 2026-04-15
- **Decision:** JIT colour bands (D-089) are stored in a dedicated `jit_bands` table with columns: `(id, name, min_pct NUMERIC, max_pct NUMERIC, hex_colour TEXT, sort_order INT)`. Not in a generic key-value `app_config` table.
- **Rationale:** JIT bands have relational shape (ordered rows with typed columns). `fixed_costs` and `vat_rates` already establish the "config per domain" pattern. A generic `app_config` would contradict that pattern and age badly — typed columns catch errors that key-value strings cannot.
- **Rejected alternative:** Generic `app_config(key TEXT, value TEXT)` table — loses type safety, invites stringly-typed bugs, contradicts established config-per-domain pattern.
- **Reversibility:** High.

### D-047 — Health page as first-class observability surface
- **Date:** 2026-04-15
- **Decision:** A dedicated page surfaces: ingestion status per marketplace, parts without shelf, parts without reorder point, batches without receipts, builds missing marketplace mappings, invariant check (every sale has ≥1 ledger row).
- **Rationale:** Trust is built through observability; the operator needs one place to answer "is everything OK?".
- **Reversibility:** High.

---

## Shelf addressing

### D-050 — Zone / Column / Level / Bin
- **Date:** 2026-04-15
- **Decision:** Shelf addressing standardizes to Zone (area, e.g. A) / Column (e.g. 02) / Level (e.g. 3) / Bin (optional A/B split). Applies to UI labels AND database column names where the existing schema doesn't already match.
- **Rationale:** Industry-standard WMS vocabulary (Warehouse > Zone > Aisle/Column > Level > Bin). Future maintainers recognize it.
- **Reversibility:** Medium (column renames).

### D-052 — Shelf bin column is nullable; NULL means unsplit
- **Date:** 2026-04-15
- **Decision:** `shelves.bin` is added as a nullable TEXT column. NULL means the shelf is not split. Display logic renders `A-02-3` when bin is NULL, `A-02-3-A` / `A-02-3-B` when populated.
- **Rationale:** Most shelves are not split; forcing a bin value on every shelf adds noise. Nullable cleanly expresses "this shelf has no sub-divisions".
- **Rejected alternative:** Default bin to 'A' for all shelves (treat every shelf as split with one bin) — misrepresents physical reality and confuses the operator.
- **Reversibility:** High.

### D-053 — `shelves.split_fifo` and `shelves.single_bin` deprecated
- **Date:** 2026-04-15
- **Decision:** `split_fifo` and `single_bin` columns on `shelves` are deprecated. No new code reads or writes them. Columns are kept (not dropped) per D-010; drop in a dedicated cleanup commit after the new shelf/bin model (D-052) is proven in production.
- **Rationale:** `split_fifo` is superseded by the explicit `bin` column (D-052). `single_bin` was a UI hint that the new Wall rendering doesn't need. Keeping the columns avoids a breaking migration; ignoring them avoids confusion.
- **Rejected alternative:** Drop columns now — risks breaking any legacy code path still referencing them during migration.
- **Reversibility:** High (can re-wire if needed).

### D-051 — Shelf display format `A-02-3-B`
- **Date:** 2026-04-15
- **Decision:** Human-readable shelf address is `Zone-Column-Level-Bin` (e.g. `A-02-3-B`). Column is zero-padded to 2 digits.
- **Rationale:** Scannable, sortable, matches printed labels.
- **Reversibility:** High.

---

## Vocabulary — UI labels

### D-060 — Client-facing page labels locked
- **Date:** 2026-04-15
- **Decision:** The client sees: Parts, Batches, Models, Builds, Wall, Sales, Purchases, Profit, Settings, Health. No other names surface to the client.
- **Rationale:** Consistency across navigation, documentation, and support.
- **Reversibility:** High.

### D-061 — "wall" (not "the wall") in all code references
- **Date:** 2026-04-15
- **Decision:** Code identifiers, routes, filenames use `wall`. The UI label displayed to the user is "Wall".
- **Rationale:** Consistency; articles shouldn't appear in identifiers.
- **Reversibility:** High.

---

## Process & planning

### D-070 — Drop GSD; use three-file flat planning
- **Date:** 2026-04-15
- **Decision:** Remove all GSD artifacts (`.planning/`, `.claude/worktrees/`, phase YAML files). Replace with `.project/PLAN.md`, `.project/DECISIONS.md`, `.project/TODO.md`.
- **Rationale:** GSD's ceremony doesn't pay off for a solo maintainer. The user has repeatedly said they don't remember what GSD was doing. Three files cover the real need: direction, history, next actions.
- **Reversibility:** High (can reintroduce later).

### D-071 — Design sessions happen in chat, artifacts copied to files
- **Date:** 2026-04-15
- **Decision:** While the current Claude session is read-only on GitHub, design is produced as chat artifacts and the user copies them into the repo. Execution happens via a local Claude Code instance on the production machine.
- **Rationale:** Environmental constraint (session cannot push); no workaround available.
- **Reversibility:** High (future sessions may have write access).

### D-072 — No phase numbering in casual language
- **Date:** 2026-04-15
- **Decision:** Conversations and internal docs refer to the three work streams by name (backend rework / marketplace ingestion / UI rebuild), not by phase numbers.
- **Rationale:** Phase numbers implied a tracking system that wasn't active; dropping them removes false structure.
- **Reversibility:** High.

---

## Scope & deferrals

### D-080 — PC-assembly only; no food-franchise generalization
- **Date:** 2026-04-15
- **Decision:** All design optimizes for PC assembly. Food-franchise generalization (FEFO, shelf-life, multi-location delivery) is explicitly out of scope.
- **Rationale:** Avoid premature generalization; focus beats breadth.
- **Reversibility:** High.

### D-081 — Mirakl paid API not migrated
- **Date:** 2026-04-15
- **Decision:** €700/mo Mirakl API subscription is not justified at current volume. Email parser stays for MMS and Boulanger.
- **Rationale:** Cost-per-order vs. profit-per-order math does not close.
- **Reversibility:** High (decide again at higher volume).

### D-082 — AI-assisted email mapping deferred
- **Date:** 2026-04-15
- **Decision:** "Give me this email, I'll tell you what it means" AI workflow is tracked as a future Unique Selling Point but is out of the current rebuild scope.
- **Rationale:** Distinct, significant feature; deserves its own sprint, not a partial inclusion.
- **Reversibility:** High.

### D-083 — No React/Next.js rewrite
- **Date:** 2026-04-02 *(carried, reaffirmed 2026-04-15)*
- **Decision:** Vanilla JS SPA stays. The `apps/web/` Next.js scaffold is not activated.
- **Rationale:** Client is familiar with the UI; rewrite risk/cost not justified.
- **Reversibility:** Medium.

### D-084 — Reservation / allocation / WIP states not modeled
- **Date:** 2026-04-15
- **Decision:** Stock moves directly from "in stock" to "consumed" at sale time. No intermediate "reserved", "allocated", "in-transit", or "built-but-unshipped" states.
- **Rationale:** Overhead not justified at current scale.
- **Reversibility:** Medium.

### D-085 — Serial number tracking schema-ready, unwired
- **Date:** 2026-04-15
- **Decision:** `stock_lots.serial_number` column exists; no logic uses it. Future work when RMAs become an operational concern.
- **Rationale:** Cheap to add schema; retrofitting a serial column to 100k rows of stock_lots later is painful.
- **Reversibility:** High.

### D-086 — AVL preferred-vendor priority schema-ready, unwired
- **Date:** 2026-04-15
- **Decision:** `item_group_members.priority` column exists; FIFO ignores it today.
- **Rationale:** When business introduces vendor preferences, logic change is small; schema retrofit would be painful.
- **Reversibility:** High.

### D-087 — BOM versioning via `valid_from/valid_to`, no versioning UI
- **Date:** 2026-04-15
- **Decision:** `build_components.valid_from/valid_to` default to (-infinity, +infinity); `process_bom_sale` filters by `NOW()`. No UI to edit effectivity windows in this rebuild.
- **Rationale:** Historical correctness preserved (sales reference the recipe active at their timestamp); editing flow deferred until actually needed.
- **Reversibility:** High.

---

## Environment & operational

### D-090 — This session is read-only on GitHub
- **Date:** 2026-04-15
- **Decision:** Stop attempting push/branch creation from this Claude session. All artifacts are produced in chat for manual transfer.
- **Rationale:** GitHub App backing the MCP integration has no write scope; user's PAT is not used by the integration; no user-side toggle exists to grant write.
- **Reversibility:** High (future sessions may have a differently-scoped integration).

### D-091 — Docker Compose deployment (postgres + api + nginx)
- **Date:** 2026-04-02 *(carried from Phase 01, reaffirmed 2026-04-15)*
- **Decision:** Three containers. No Celery, no Redis, no separate email service.
- **Rationale:** APScheduler inside the api process is sufficient for single-tenant email polling.
- **Reversibility:** Medium.

### D-092 — Session cookie auth, single user
- **Date:** 2026-04-02 *(carried, reaffirmed 2026-04-15)*
- **Decision:** SessionMiddleware with bcrypt-hashed password; one user.
- **Rationale:** No multi-tenant; no need for roles.
- **Reversibility:** High.

### D-088 — Shelf assignment at Part creation is optional (pending-setup badge)
- **Date:** 2026-04-15
- **Decision:** When creating a new Part, the user may skip shelf assignment. The Part is saved with a visible "needs setup" badge that appears on every view mentioning the part. Shelf can be assigned later via the Wall mini-wizard.
- **Rationale:** Mandatory shelf assignment at creation time adds friction that slows real onboarding. The operator often receives parts before deciding where they go.
- **Rejected alternative:** Mandatory shelf at creation (blocks save until shelf is picked) — too much friction; operator may not know the shelf yet.
- **Reversibility:** High.

### D-089 — JIT colour gradient: 5 bands, seeded in config table, user-editable hex
- **Date:** 2026-04-15
- **Decision:** JIT health uses 5 bands as fraction of reorder point: critical (<25%, red `#DC2626`), low (25–75%, orange `#F97316`), at (75–125%, yellow `#EAB308`), healthy (125–200%, green `#16A34A`), over (>200%, blue `#2563EB`). Band thresholds and hex colours are stored in a config table (not hardcoded), user-editable via Settings.
- **Rationale:** Continuous gradient is harder to read at a glance than discrete bands. 5 bands cover the meaningful operational states. Config table satisfies D-045.
- **Rejected alternative:** 3-band traffic light (red/yellow/green) — too coarse; can't distinguish "healthy buffer" from "overstocked".
- **Reversibility:** High.

### D-094 — Reorder point: user-input columns + computed view; `minimum_stock` as override floor
- **Date:** 2026-04-15
- **Decision:** `products` stores three columns: `avg_delivery_days NUMERIC(5,1)`, `avg_sold_per_day NUMERIC(8,2)`, and `minimum_stock INTEGER DEFAULT 0` (renamed from `default_reorder_point`). The computed reorder point `CEIL(avg_delivery_days * avg_sold_per_day)` lives in a view `v_product_reorder(product_id, computed_reorder_point, minimum_stock, effective_reorder_point)` where `effective_reorder_point = GREATEST(computed, minimum_stock)`. The product setup wizard (D-044) shows computed and override side-by-side.
- **Rationale:** The computed value is derived — storing it would create a sync obligation. The override floor is a user decision — storing it is correct. The view always reflects reality. Aligns with D-048 (setup_complete as view) philosophy.
- **Rejected alternative:** Store only a single `reorder_point` column (either computed or manual) — loses the ability to show both values and explain the effective result to the operator.
- **Reversibility:** High.

### D-095 — `products.is_composite` kept during migration, flagged for deprecation
- **Date:** 2026-04-15
- **Decision:** The `is_composite` column on `products` is kept and not modified during migration. After D-018 is fully live (every sellable product has a build), `is_composite` becomes redundant — a product is "composite" if its build has >1 component line. Flag for removal in a post-migration cleanup, not during this rebuild.
- **Rationale:** Removing now risks breaking legacy code paths. After migration, the concept is expressible via the builds table. Additive-only principle (D-010).
- **Reversibility:** High (column can be dropped when no code references it).

### D-096 — T-A01 schema migration is one atomic commit
- **Date:** 2026-04-15
- **Decision:** The `03_avl_build_schema.sql` migration (table rename, column renames, new tables, views, seeds) lands as a single git commit. The SQL `BEGIN/COMMIT` wrapper provides database-level atomicity. Code reference updates (Python, JS) land in the same commit.
- **Rationale:** D-035 originally said "own commit" for the emails→ingestion_events rename, but splitting the migration into multiple commits creates an intermediate state where the table is renamed but code still references the old name — a guaranteed breakage window. One commit, one transaction, no broken intermediate state.
- **Rejected alternative:** Multiple commits per rename — creates breakage windows between commits where table/column names and code references are out of sync.
- **Reversibility:** High.

### D-093 — InvenTree FIFO-to-COGS not re-verified; stay custom
- **Date:** 2026-04-15
- **Decision:** Skip the InvenTree v1.2 smoke test (T-Q05). The stay-custom decision (D-001) stands without re-verification.
- **Rationale:** Even if InvenTree added lot-level COGS, it still lacks AVL-across-group FIFO (our core differentiator). Re-checking would not change the decision.
- **Reversibility:** High (can re-evaluate anytime).

### D-097 — Bol.com ingestion is API order polling, not webhook (supersedes D-030)
- **Date:** 2026-04-15
- **Decision:** Bol.com new orders are ingested by polling
  `GET /retailer/orders?change-interval-minute=N` every 10 minutes via
  APScheduler, not via webhook push notifications. Webhooks in the
  Bol.com Retailer API v10 are available only for PROCESS_STATUS and
  SHIPMENT events, which do not include new orders. A webhook receiver
  for shipment tracking is optional and lower priority (parked as P-13).
- **Rationale:** The Bol.com Retailer API v10 subscription system does
  NOT support order-arrival events over webhooks — only GCP Pub/Sub and
  AWS SQS carry the full event catalogue; webhooks are limited to
  PROCESS_STATUS and SHIPMENT. The signature scheme is RSA-SHA256 (not
  HMAC as D-030 asserted). API polling is the documented recommended
  approach for order retrieval, and is strictly more reliable than the
  current IMAP email parser.
- **Rejected alternatives:**
  - GCP Pub/Sub / AWS SQS — adds cloud infrastructure dependency for a
    solo-maintainer project; contradicts D-091 (minimal process count).
  - Keep email parsing as primary — D-030's original motivation (IMAP
    reliability gap) still holds; API polling closes that gap without
    a webhook receiver.
  - Webhook receiver for PROCESS_STATUS/SHIPMENT as primary ingestion —
    misses the critical new-order event entirely.
- **Reversibility:** High (can add a shipment webhook receiver later
  for richer event coverage without undoing the polling path).
- **Source:** T-B00 research session, 2026-04-15. See
  `.project/BOL-CONTRACT.md` for the full event catalogue, signature
  scheme details, and open questions.

### D-098 — Per-marketplace commission overrides the configured percentage
- **Date:** 2026-04-15
- **Decision:** When ingestion provides an exact commission value per
  order item (as the Bol.com API does), `process_bom_sale` uses that
  value directly. The `fixed_costs.commission_pct` lookup remains as
  the fallback for paths that don't provide an exact value (the
  Mirakl email parser, which only gets a net figure).
- **Rationale:** Bol.com reports the exact commission charged per
  order item. Computing it from a configured percentage would double
  the work and risk drift from bol.com's actual deduction. Per-item
  accuracy trumps uniformity.
- **Implementation:** add an optional `p_commission_override NUMERIC`
  parameter to `process_bom_sale`. When non-null, skip the percentage
  lookup and use the override. When null, use `fixed_costs` as today.
- **Rejected alternative:** ignore the API value and always use the
  percentage — masks the real per-item economics.
- **Reversibility:** High (parameter is additive; callers that don't
  pass it get old behaviour).

### D-099 — Discounts absorbed into effective `sale_price`
- **Date:** 2026-04-15
- **Decision:** When an ingestion source reports a line-item discount
  (Bol.com `orderItems[].discounts[]`), the poller computes
  `sale_price = totalPrice / quantity` (post-discount effective per-unit
  price) and writes that to `transactions.sale_price`. The discount
  detail is retained in `ingestion_events.raw_payload` for audit but
  does not get its own column in `transactions`.
- **Rationale:** Profit must reflect actual revenue received. Pre-discount
  price overstates revenue. Storing discounts as a separate column adds
  schema surface for an edge case the operator doesn't report on today.
  If discount analytics become a requirement later, they can be computed
  from raw_payload without a migration.
- **Rejected alternatives:**
  - Store `unitPrice` unchanged — overstates profit by the discount
    amount.
  - Add `transactions.discount_amount` column — premature generalization;
    wire when needed.
- **Reversibility:** High (can add a discount column later; historical
  data stays in raw_payload).

### D-100 — shelves.capacity is canonical SoT (2026-04-15)
- **Date:** 2026-04-15
- **Decision:** Per-shelf integer `shelves.capacity` in DB replaces the
  per-product/per-bin localStorage map from `shelfConfig`. Set via
  `PATCH /api/shelves/{id}`. Read via `v_shelf_occupancy.capacity` (T-C02b).
- **Rationale:** Capacity is a property of the physical shelf, not a
  per-product setting. The localStorage path was lossy (browser-only,
  per-device) and structurally wrong (keyed by partId+bin). A single
  DB integer is authoritative across all clients.
- **Rejected alternatives:**
  - Keep localStorage — lossy across devices, not queryable.
  - Per-product or per-bin granularity — over-models reality; a shelf
    holds whatever fits regardless of product.
- **Reversibility:** Low impact; the only lossy part is dropping
  per-product granularity, which was accepted as unnecessary.

---

### D-101 — Shelf settings SoT migration complete (2026-04-15)
- **Date:** 2026-04-15
- **Decision:** `capacity`, `split_fifo`, and `single_bin` all live in the `shelves` table. Reads via `v_shelf_occupancy` (which now SELECTs all three columns). Writes via `PATCH /api/shelves/{id}` (accepts any subset of the three fields). `shelf-config.js` (localStorage) retired and deleted. D-053's deferral of `split_fifo`/`single_bin` wiring is superseded — both columns are now actively used.
- **Rationale:** localStorage is lossy across devices and not queryable. DB columns are the correct SoT for physical shelf properties. T-C02e completes the migration begun in T-C02d.
- **Reversibility:** Low (localStorage data is gone; columns remain in DB).

---

## Superseded decisions

- D-097 supersedes D-030 (webhooks do not deliver new orders; RSA-SHA256 not HMAC)
- D-101 supersedes D-053 (split_fifo and single_bin are now actively wired, not deprecated)

---

## How to add a new decision

1. Pick the next free ID in the right section (D-0NN).
2. Append. Do not edit existing entries.
3. If reversing a prior decision, create a new entry and add it here, then append to the "Superseded" section with the form: `D-NNN supersedes D-MMM (reason)`.
4. One-line decision, one-line rationale. If it takes more than one line, the decision isn't locked yet — move it to an open question in `TODO.md`.
