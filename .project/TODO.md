# Interwall — TODO

**Conventions:**
- `T-AXX` = Stream A (Backend rework) tasks
- `T-BXX` = Stream B (Marketplace ingestion) tasks
- `T-CXX` = Stream C (UI rebuild) tasks
- `T-XXX` = Cross-cutting / prerequisite tasks
- Status values: `TODO` → `DOING` → `BLOCKED` → `DONE` → `PARKED`
- Refs like `(D-013)` point to entries in `DECISIONS.md`
- `deps:` names the tasks that must be done first

**How to use:** work top-down within a stream. Don't skip ahead unless `deps` are green. When a task is done, append `→ DONE YYYY-MM-DD` inline. When a task is blocked, move it to the Blocked section with a reason.

---

## Sequencing overview

    X-prereqs ──► A-schema ──► A-rpcs ──► A-api/poller ──┐
                      │                                    │
                      └──► backfill                        ├──► B-webhook ──► B-parallel-run
                                                           │
                                                           └──► C-sot (single source of truth)
                                                                      │
                                                                      ├──► margin-bug fix
                                                                      │
                                                                      └──► C-full-UI rebuild

- Stream A front-loads — every other stream depends on its schema
- UI state audit (T-C00) runs in parallel with A; no blocker
- Margin bug (T-C01) is the only UI fix inside the backend work; everything else waits for the full UI rebuild

---

## Now (next up)

Stream A: COMPLETE 2026-04-15. Tier 3 acceptance green (f095131).
All 11 cited decisions verified in practice (D-017, D-019, D-020,
D-021, D-022, D-023, D-025, D-026, D-027, D-033, D-041).
Stream A retrospective entry landed in RETROSPECTIVES.md (b0c8e07).

T-B00 DONE (research session, 2026-04-15) — major finding: D-030 was
materially wrong. Bol.com webhooks carry only PROCESS_STATUS + SHIPMENT;
new orders require API polling. Signature is RSA-SHA256, not HMAC.
D-097 supersedes D-030. Stream B rewritten as polling-first.

BOL-CONTRACT.md from T-B00 is pending commit on the server — agent
reported SHA as "pending". Needs manual commit + push before T-B01.

Blocking T-B01: close Q2-Q7 in BOL-CONTRACT.md §6 (offer.reference
null-handling, RSA key format, 299s token mid-run refresh, dedupe
key shape, change-interval overlap window).

Next session after blockers close: T-B01 — Bol.com order poller
(APScheduler + OAuth2 + ingestion_events INSERT + call process_bom_sale).

---

## Cross-cutting / prerequisites

### `T-X01` — Clean-state cleanup (TODO)
- Identify files/directories to delete; produce a single bash command
- Preserve only: source code under `apps/`, `inventory-interwall/`, `supabase/migrations/` (if kept), `docker-compose.yml`, `.env.example`, license, readme
- Remove: `.planning/`, `.claude/worktrees/` (GSD artifacts per D-070), obsolete SPECS-MVP.md if superseded by new PLAN.md, orphan design docs
- Output: commit on the rebuild branch with a clean slate

### `T-X02` — Rewrite `CLAUDE.md` (TODO)
- Audit current CLAUDE.md; update against the new PLAN.md and DECISIONS.md
- Research best-practice CLAUDE.md patterns (examples on GitHub, Anthropic docs) before rewriting
- Target: concise, vocabulary-locked, reference to `.project/` files instead of inline rules
- deps: `T-X01` (clean slate first)

### `T-X03` — Draft initial kickoff prompt for the local Claude Code instance (TODO)
- Research well-formed "kickoff" prompts (master-prompt patterns, prompt templates on GitHub)
- Output: one paste-ready message the user gives to local Claude Code to begin executing the rebuild
- deps: `T-X01`, `T-X02`

### `T-X04` — Validate local Claude Code can push → DONE 2026-04-15
- Verified by direct push of commits df737aa, f3b203d, 1ec5663 on v2
- Local CLI has full write access; coaching session (desktop) remains read-only per D-090

### `T-X05` — Evaluate full-stack-orchestration plugin (TODO)
- Look at https://github.com/wshobson/agents specifically `full-stack-orchestration`
- Decide: adopt as sub-agent helper, adopt partially, or skip
- Defer evaluation until end of Stream A — decide with real data on whether
  the primer-per-task model cracks at Stream C volume
- Output: decision logged in DECISIONS.md
- deps: T-A09 (end of Stream A)

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
- Confirm commit 3b65501 has `CREATE OR REPLACE FUNCTION` with full body,
  not a stub
- If stub, re-commit full body and report new SHA
- Blocking for T-A06

### `T-X09` — Retrofit T-A01 through T-A05 reports into schema (TODO, optional)
- For audit continuity, convert past reports to REPORT-SCHEMA.md format
- Append to `.project/REPORTS-ARCHIVE.md`
- Low priority — do only if future session has idle capacity
- deps: T-X06

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

## Stream A — Backend rework

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

## Stream B — Marketplace ingestion

### `T-B00` — Bol.com Retailer API v10 catalogue audit → DONE 2026-04-15
- Research session produced `.project/BOL-CONTRACT.md` (pending commit
  on server — agent reported SHA as "pending", protocol deviation)
- Key finding: D-030 was materially wrong. Webhooks carry only
  PROCESS_STATUS + SHIPMENT. New orders require API polling.
  Signature is RSA-SHA256, not HMAC. Logged as D-097 superseding D-030.
- Open questions Q2-Q7 in BOL-CONTRACT.md §6 need closure before
  T-B01 primer is written.
- P-13 parked for optional shipment-webhook receiver.

### `T-B01` — Bol.com order poller (TODO)
- APScheduler job in the api process (D-091): every 10 minutes call
  `GET /retailer/orders?change-interval-minute=15` (small overlap
  window for safety).
- OAuth2 client-credentials flow; 299s token TTL — refresh on 401.
- For each new order, INSERT into `ingestion_events` with
  `source='bolcom_api'`, raw payload, and the order-id as dedupe key.
- Use `ON CONFLICT DO NOTHING` on (source, external_id) for
  at-least-once safety.
- Resolve (marketplace='bol', external_sku=offer.reference) →
  `external_item_xref.build_code` (D-033 semantics apply) → call
  `process_bom_sale`.
- Log each polled batch at INFO with counts (new, duplicate, failed).
- deps: `T-B00` open questions closed; `T-A07` (external_item_xref
  endpoints exist); `T-A08` (BOM-first routing already live).

### `T-B02` — Unified ingestion pipeline (TODO)
- Single worker consumes rows from `ingestion_events` regardless of
  source (email / bolcom_api / future webhook) per D-032.
- Status states: `pending` / `processed` / `failed` / `dead_letter`
  per D-034.
- deps: `T-B01`

### `T-B03` — Parallel-run Bol.com email vs API polling (TODO)
- Run both for one week (or a volume-based threshold of ~50 orders,
  whichever first — calendar duration is not the gate per
  development-milestone principle).
- Log discrepancies: orders seen by one path and not the other,
  timing differences, field mismatches.
- Output: reliability report as `.project/B03-RELIABILITY.md`.
- deps: `T-B02`

### `T-B04` — Retire Bol.com email path (TODO)
- After T-B03 shows API polling is reliable (zero missed orders over
  the comparison window).
- Email poller stops matching Bol.com senders; IMAP remains for
  MediaMarktSaturn and Boulanger (D-031).
- Keep the code path for emergency fallback behind a feature flag
  (disabled by default).
- deps: `T-B03`

### `T-B05` — Dead-letter handling (TODO)
- Events that fail repeatedly move to `dead_letter` state (D-034).
- Health page surfaces count + reasons via the existing v_health_*
  views (extend if needed).
- Manual retry / resolve action wired in Stream C at T-C10.
- deps: `T-B02`

### `T-B06` — Bol.com shipment webhook receiver (optional, lower priority)
- After T-B04 ships, evaluate whether shipment-tracking webhooks add
  operator value (customer comms, SLA tracking).
- Out of Stream B critical path. Can be deferred to a later milestone.
- deps: `T-B04`; see P-13.

---

## Stream C — UI rebuild

### `T-C00` — UI state audit (TODO)
- Inventory every `localStorage` read/write in `inventory-interwall/frontend/`
- Inventory every client-side recomputation of a business number (margin, stock, profit)
- Inventory every `innerHTML` assignment with dynamic data (for sanitize() coverage)
- Output: audit doc with bug origin per page
- Can run in parallel with Stream A
- deps: none

### `T-C01` — Immutable transaction fields + margin-bug fix (TODO)
- Backend: confirm `transactions.cogs` / `transactions.profit` are written at sale time and never updated (D-025). Already the case after A-05 lands.
- Frontend: remove all client-side margin recomputation in profit.js, recorded-sale card, sale-edit view
- Test: open sale, edit, save without changes → margin identical to first render
- deps: `T-A05`, `T-C00`

### `T-C02` — Single-source-of-truth refactor (TODO)
- Every stock/count/margin number rendered in the UI comes from a canonical endpoint
- Delete business-data use of localStorage; keep only UI prefs (D-040)
- Parts page uses `v_part_stock`; Profit/Valuation uses same view (D-041)
- deps: `T-A06`, `T-C00`, `T-C01`

### `T-C03` — Wall page: reliable rendering, no hardcoded grid (TODO)
- Remove all hardcoded shelf dimensions (D-045)
- Zone/Column/Level/Bin layout driven entirely by DB rows
- Gradient JIT colour (not traffic-light); breakpoints in config table (D-045)
- deps: `T-A02`

### `T-C04` — Wall as picker — forward direction (TODO)
- Click a bin in the Wall → opens a side panel / detail showing assigned product-batches as sorted cards (D-042)
- deps: `T-C03`

### `T-C05` — Wall as picker — reverse direction (mini-wall wizard) (TODO)
- When assigning a batch to a shelf, launch a progressive zoom wizard: Zone → Column → Level → Bin
- Each level's cards fill the container; feels like zoom-in
- Replaces the shelf dropdown entirely (D-042)
- deps: `T-C03`

### `T-C06` — Batches view with ledger-powered history (TODO)
- Show all batches (active + depleted) (D-043)
- Active: JIT-health gradient colour badge; depleted: grey fade
- Default: newest N visible, older fade to black; "full history" toggle reveals all
- Data: `stock_lots` + `stock_ledger_entries` joined
- deps: `T-A01`, `T-C03`

### `T-C07` — Product setup wizard (TODO)
- Section 1: Basic info (name, SKU, category, description)
- Section 2: JIT Reorder Point (avg delivery days, avg sold/day → computed reorder point; minimum stock HERE) (D-044)
- Section 3: Initial Stock (shelf via mini-wall wizard, quantity, unit cost)
- No silent "save pending" — either all set or explicit "pending setup" flag with visible badge everywhere
- deps: `T-C05`

### `T-C08` — Builds page (TODO)
- Create/edit builds with component lines (picks from Models/item_groups)
- Tab inside Build detail: marketplace SKU mappings (external_item_xref)
- Flag "missing mapping" per marketplace — surfaces the "do I have this build configured on X?" question directly
- deps: `T-A07`, `T-C02`

### `T-C09` — Purchases feed (feeding the machine) (TODO)
- Mirror of Sales feed, chronological
- Visual weight/colour for incoming stock
- Data: stock-in events from `stock_ledger_entries` where `qty_delta > 0`
- deps: `T-A01`

### `T-C10` — Health page (TODO)
- Ingestion status per marketplace (last run, last success, last failure)
- Orphan state: parts without shelf, parts without reorder point, batches without receipts, builds missing marketplace mappings
- Invariant check: every sale has ≥1 ledger row
- Dead-letter queue with manual retry
- deps: `T-A09`, `T-B05`

### `T-C11` — Hardcoded values audit + sanitize() audit (TODO)
- Grep codebase for hardcoded thresholds, URLs, lists, colours; move to configurable settings
- Every `innerHTML` with dynamic data routes through `sanitize()` (D-046)
- deps: `T-C00`

---

## Closed questions

### `T-Q01` — Direct-sale products path confirmation → CLOSED 2026-04-15
- Answer: **No** — legacy `process_sale` silently records zero COGS and no stock deduction for non-composite products. Fixed by D-018: every sellable product gets a trivial auto-generated build, making `process_bom_sale` the only sale code path. Scope absorbed into T-A03.

### `T-Q02` — Bol.com Subscription event catalog → DEFERRED to T-B00
- Will be resolved by subagent research when Stream B starts. Not blocking Stream A.

### `T-Q03` — Shelf-setup flow — mandatory vs pending allowed → CLOSED 2026-04-15
- Answer: allow pending with explicit "needs setup" badge. Logged as D-088.

### `T-Q04` — JIT colour gradient breakpoints → CLOSED 2026-04-15
- Answer: 5 bands (critical/low/at/healthy/over) as fraction of reorder point, user-editable hex. Logged as D-089.

### `T-Q05` — InvenTree v1.2 FIFO-to-COGS smoke test → CLOSED 2026-04-15
- Answer: skipped. Stay-custom decision stands. Logged as D-093.

---

## Blocked

*(none yet)*

---

## Parking lot (tracked, not planned)

### `P-01` — AI-assisted email mapping (D-082)
- Future USP. When an email arrives that no parser handles, user clicks teach → AI suggests a mapping → user confirms → parser rule saved
- Distinct project; deserves its own sprint

### `P-02` — Paid Mirakl API migration (D-081)
- Re-evaluate at higher volume (~20+ orders/day) or when email parser maintenance cost crosses €700/mo of your time

### `P-03` — Serial-number tracking (D-085)
- Wire the existing `stock_lots.serial_number` column when RMAs become operational

### `P-04` — AVL preferred-vendor priority (D-086)
- Wire the existing `item_group_members.priority` column if a vendor-preference rule emerges

### `P-05` — BOM versioning UI (D-087)
- Build a recipe-history editor when the operator actually needs to change recipes over time

### `P-06` — Reservation / allocation / WIP states (D-084)
- Not modeled today. Revisit if the business introduces ordered-but-not-yet-shipped as a distinct state

### `P-07` — React / Next.js rewrite (D-083)
- `apps/web/` scaffold exists but unused. Re-evaluate only if vanilla JS SPA becomes unmaintainable

### `P-08` — Food-franchise generalization (D-080)
- Entirely separate product. If pursued, fork — don't fold into Interwall

### `P-09` — Full-stack-orchestration plugin evaluation
- See `T-X05`. Decision not yet logged

### `P-10` — Trivial-to-composite build conversion UX
- When operator wants to turn a direct-sale product into a multi-component build: create a new BLD-NNN build, don't mutate the trivial auto-generated one
- Pattern A: new build replaces the trivial; trivial is deactivated (not deleted, per D-010)
- Address in Stream C (Builds page, T-C08)

### `P-11` — Builds page search by composition fingerprint
- Users should filter builds by item_groups they contain, to attach new marketplace codes to existing builds quickly
- Address in Stream C

### `P-13` — Bol.com shipment-tracking webhook receiver
- Optional feature for customer comms / SLA visibility
- Only PROCESS_STATUS + SHIPMENT events are webhook-eligible in
  Retailer API v10 (per T-B00 research, D-097)
- Deferred until T-B04 ships; not in Stream B critical path
- Tracked as T-B06

### `P-12` — pytest combined-run APScheduler conflict
- T-A09 health router tests ERROR when run in same pytest process
  as other test files (ConflictingIdError on app lifespan restart)
- Passes in isolation; only affects full-suite runs
- Fix options: app factory + per-test lifespan fixture, OR set
  SCHEDULER_JOB_DEFAULTS replace_existing=True for tests
- Address in Stream B retro or when pytest harness is hardened

---

## How to update this file

- New task: append to the right stream with next free `T-XNN` ID
- Task done: mark `→ DONE YYYY-MM-DD` inline; move to an end-of-stream "Completed" section if the stream gets crowded
- Task blocked: move to Blocked section with one-line reason
- New open question: add `T-QNN` entry with expected answer if known
- New parked item: add `P-NN` entry; do not delete parked items (they're evidence that a path was considered and rejected)
