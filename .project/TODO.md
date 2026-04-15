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

Pick one and start:

- `T-X01` — Resolve clean-state cleanup (bash command + deletion list) — blocks nothing technically but unblocks peace of mind
- `T-A00` — Session B: schema audit of current `init.sql` — blocks all of Stream A
- `T-Q01 … T-Q05` — Answer the five open questions below — blocks A and C design confirmation

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

### `T-X04` — Validate local Claude Code can push (TODO)
- On production machine: verify git credentials push to `clubeedg-ship-it/interwall`
- Verify GitHub App permissions on the local install (if different from sandbox)
- Output: green/red confirmation; if red, escalate before committing to next steps
- deps: none

### `T-X05` — Evaluate full-stack-orchestration plugin (TODO)
- Look at https://github.com/wshobson/agents specifically `full-stack-orchestration`
- Decide: adopt as sub-agent helper, adopt partially, or skip
- Output: decision logged in DECISIONS.md
- deps: `T-X02` (we're not using it if the kickoff prompt doesn't reference it)

---

## Stream A — Backend rework

### `T-A00` — Schema audit session (TODO)
- Subagent reads `apps/api/sql/init.sql` table-by-table
- Output: structured audit per table (keep / rename / add / deprecate), column-level notes, integrity gaps (missing CHECK / FK / index)
- Review with user; lock decisions in DECISIONS.md before execution
- deps: none

### `T-A01` — Add AVL + Build schema (TODO)
- DDL: `item_groups`, `item_group_members`, `builds`, `build_components`, `external_item_xref`, `stock_ledger_entries` (D-012, D-013, D-017)
- Forward-compat columns unwired: `item_group_members.priority`, `build_components.valid_from/valid_to`, `stock_lots.serial_number` (D-015, D-085, D-086, D-087)
- Idempotent: `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`
- Do NOT touch `ean_compositions` or `process_sale()` (D-010)
- deps: `T-A00`

### `T-A02` — Normalize shelf addressing (TODO)
- Rename schema columns to Zone / Column / Level / Bin where they aren't already (D-050)
- Update indexes and FK names
- Migration script: keep reversible for one release window
- deps: `T-A00` (audit first), `T-A01` (same migration file)

### `T-A03` — Backfill from legacy `ean_compositions` (TODO)
- One-shot idempotent script: `apps/api/sql/05_item_groups_backfill.sql`
- Each `component_ean` → singleton `item_group` + `item_group_member`
- Each `parent_ean` → `build` + `build_components` rows
- `ON CONFLICT DO NOTHING` throughout
- Verify: count(distinct parent_ean) == count(builds); count(distinct component_ean) == count(item_groups); count(ean_compositions) == count(build_components)
- deps: `T-A01`

### `T-A04` — `deduct_fifo_for_group` PL/pgSQL function (TODO)
- Signature: `(item_group_id UUID, qty INT) RETURNS TABLE (stock_lot_id, product_id, qty_taken, unit_cost)`
- `SELECT FOR UPDATE` ordered by `received_at ASC, id ASC` (D-021, D-023)
- Raises on insufficient stock
- Pools across all `item_group_members` (D-020)
- Tests: two-product group, oldest-wins scenario; overflow RAISE
- deps: `T-A01`

### `T-A05` — `process_bom_sale` PL/pgSQL function (TODO)
- Single-transaction atomic (D-022)
- Flow: lookup build → insert txn shell → loop build_components (filtered by valid_from/valid_to) → call deduct_fifo_for_group per line → write stock_ledger_entries row per lot consumed → apply fixed_costs → update cogs + profit (D-017, D-025)
- Raises on any error; rolls back entire transaction
- Tests: happy path, stock-out rollback, multi-line build, fixed-cost math
- deps: `T-A04`

### `T-A06` — `v_part_stock` canonical stock view (TODO)
- One SQL view returning `(product_id, ean, name, total_qty, total_value, last_received_at)`
- Filtered by `quantity > 0`, joined through `stock_lots`
- Used by Parts page AND Profit/Valuation page (D-041)
- deps: `T-A01`

### `T-A07` — FastAPI routers (TODO)
- `/api/item-groups` — CRUD + member attach/detach; 409 on detach if orphan risk
- `/api/builds` — CRUD + full-replace PUT for components; auto-assign BLD-NNN if no code provided (D-014)
- `/api/external-xref` — CRUD + `/resolve?marketplace=&sku=` utility
- All behind `require_session`; RealDictCursor
- Register in `main.py`
- deps: `T-A01`, `T-A05`

### `T-A08` — Email poller BOM-first routing (TODO)
- Extend `email_poller/sale_writer.py` with `resolve_build_code(marketplace, external_sku)`
- Prefer `process_bom_sale`; fall back to legacy `process_sale` only when no xref AND no build match (D-024)
- If xref exists for (marketplace, sku) but build inactive → raise (D-033)
- Log path taken at INFO
- deps: `T-A05`, `T-A07`

### `T-A09` — Health page invariant queries (TODO)
- SQL views for: parts without shelf, parts without reorder point, batches without receipts, builds without marketplace mappings, sale txns with zero ledger rows
- Expose via `/api/health/*` endpoints
- deps: `T-A01`

---

## Stream B — Marketplace ingestion

### `T-B00` — Bol.com Subscription API catalog audit (TODO)
- Subagent fetches current Bol.com Retailer API v10 Subscription docs
- Confirm event types: new order, shipment, cancellation, payment
- Confirm HMAC signature scheme
- Output: contract doc for the webhook receiver
- deps: none (parallel with A)

### `T-B01` — Webhook receiver endpoint (TODO)
- FastAPI `/api/webhooks/bolcom` POST
- HMAC signature verification
- Persist raw payload to unified ingestion table with `source='webhook'` (D-032)
- Return 200 quickly; process asynchronously
- deps: `T-B00`, `T-A07`

### `T-B02` — Unified ingestion pipeline (TODO)
- Single worker consumes rows from the unified ingest table regardless of source (D-032)
- Parser selection by `source` + `marketplace`
- Status states: `pending` / `processed` / `failed` / `dead_letter` (D-034)
- deps: `T-B01`

### `T-B03` — Parallel-run Bol.com email vs webhook (TODO)
- Run both for one week overlap
- Log discrepancies (count, missing events, timing differences)
- Output: reliability report
- deps: `T-B02`

### `T-B04` — Retire Bol.com email path (TODO)
- After parallel-run shows webhook is reliable
- Email poller stops picking Bol.com senders
- Keep code path available as emergency fallback (feature-flag disabled by default)
- deps: `T-B03`

### `T-B05` — Dead-letter handling (TODO)
- Webhook / email events that fail repeatedly move to `dead_letter`
- Health page surfaces count + reasons
- Manual retry / resolve action from the Health UI (part of Stream C)
- deps: `T-B02`

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

## Open questions (must be closed before the dependent task)

### `T-Q01` — Direct-sale products path confirmation
- Question: do monitors / mini-PCs / anything sold as a single product work via the legacy `process_sale` fallback without special-casing?
- Expected answer: yes
- Needed before: `T-A08`
- How to verify: end-to-end test after A-08; if broken, decide "create one-line trivial build per direct-sellable product" vs. "extend sale_writer with an explicit direct-sale branch"

### `T-Q02` — Bol.com Subscription event catalog
- Question: does the v10 Subscription API cover new order, shipment, cancellation, payment?
- Needed before: `T-B01`
- How to verify: `T-B00` subagent research

### `T-Q03` — Shelf-setup flow — mandatory vs pending allowed
- Question: when creating a new Part, can the user skip shelf assignment (with a pending-setup badge) or is it mandatory?
- Recommendation: allow pending with explicit visual state; mandatory friction too high for realistic onboarding
- Needed before: `T-C07`
- Decide: confirm recommendation, log as D-1XX

### `T-Q04` — JIT colour gradient breakpoints
- Question: exact breakpoints (as fraction of reorder point?) and colours
- Needed before: `T-C03`
- Suggestion: 5 bands (far-above, above, at, below, critical) with user-editable hex
- Decide: confirm band count + colours, log in DECISIONS

### `T-Q05` — InvenTree v1.2 FIFO-to-COGS smoke test
- Question: has FIFO-per-lot-COGS quietly improved post-1.0?
- Not a blocker for any task
- Output: one note that the stay-custom decision is still right, or reopen if InvenTree now does the full loop

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

---

## How to update this file

- New task: append to the right stream with next free `T-XNN` ID
- Task done: mark `→ DONE YYYY-MM-DD` inline; move to an end-of-stream "Completed" section if the stream gets crowded
- Task blocked: move to Blocked section with one-line reason
- New open question: add `T-QNN` entry with expected answer if known
- New parked item: add `P-NN` entry; do not delete parked items (they're evidence that a path was considered and rejected)
