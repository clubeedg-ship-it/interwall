# Interwall — TODO

> Sequencing reference. Do not read this first in a cold start.
> Start with `.project/SESSION.md`, `.project/WORKSTREAMS.md`, and `.project/RETRIEVAL.md`.
> Use this file only for queue status, dependency order, or deciding the next bounded task.

**Conventions:**
- `T-AXX` = Stream A (Backend rework) tasks
- `T-BXX` = Stream B (Marketplace ingestion) tasks
- `T-CXX` = Stream C (UI rebuild) tasks
- `T-DXX` = Backend deployment / reliability-hardening tasks
- `T-XXX` = Cross-cutting / prerequisite tasks
- Status values: `TODO` → `DOING` → `BLOCKED` → `DONE` → `PARKED`
- Refs like `(D-013)` point to entries in `DECISIONS.md`
- `deps:` names the tasks that must be done first

**How to use:** work top-down within a stream. Don't skip ahead unless
`deps` are green. When a task is done, append `→ DONE YYYY-MM-DD`
inline; move the full entry to `TODO-ARCHIVE.md` at stream end.
When a task is blocked, move it to the Blocked section with a reason.

Completed tasks and closed questions live in `TODO-ARCHIVE.md`
(not auto-imported).

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
- Margin bug (T-C01) is the only UI fix inside the backend work;
  everything else waits for the full UI rebuild

---

## Now (next up)

Stream A: COMPLETE 2026-04-15 (f095131). Retrospective landed (b0c8e07).

Stream B: T-B00 + T-B01 DONE.

Stream B: T-B02 + T-B05 DONE 2026-04-15 (`d48ccce`).

Stream B: `T-B03` local reliability artifact landed on `v2` as a
historical local report, but the task still needs real-world validation
before it can be treated as production-complete.

Stream B: `T-B04` DONE 2026-04-15 (`b103920`).

Stream C: `T-C00` local audit artifact preserved under
`/Users/ottogen/interwall-preserve-2026-04-15/live-tree/.project/C00-UI-STATE-AUDIT.md`,
but not yet landed on `v2`.

Stream C: `T-C01` DONE 2026-04-15 (`123490f`).

Stream C: `T-C02` is already sliced on `v2`:
- `T-C02a` DONE 2026-04-15 (`3ce3be2`)
- `T-C02b` DONE 2026-04-15 (`cf66019`)
- `T-C02d` DONE 2026-04-15 (`0e6442d`)
- `T-C02e` DONE 2026-04-15 (`fc81d28`)

Next: **Resolve the remaining preserved branch-truth artifact**.
`T-C00` is still preserved off-branch and stale against current `v2`,
so it needs a refresh rather than an as-is landing. After that, move
into Playwright-backed E2E/browser truthing for cross-page numeric
coherence before any deployment-readiness signoff.

## Backend deployment phases

### `T-D01` — Pytest harness hardening (DONE 2026-04-16)
- Make backend router/integration tests trustworthy as a combined
  deployment gate.
- Scope:
  - disable APScheduler jobs during pytest `TestClient(app)` lifespan
  - make the current `main`-importing endpoint tests pass in one pytest
    process
  - stop per-file ad hoc runtime-SQL self-healing where production
    startup should be the canonical source
- Acceptance:
  - one combined pytest command for current API endpoint/integration
    files runs without `ConflictingIdError`
  - `t_A07_routers.py` and `t_A09_health_router.py` pass together
  - current endpoint suite passes together:
    - `t_A07_routers.py`
    - `t_A09_health_router.py`
    - `t_C01_profit_immutability.py`
    - `t_C02c_handshake_endpoints.py`
    - `t_C03_zones_endpoints.py`
    - `t_C06_batches_endpoints.py`
    - `t_shelves_occupancy.py`
    - `t_shelves_capacity_patch.py`
    - `t_shelves_settings_patch.py`
- deps: none

### `T-D02` — Production ops contract hardening (DONE 2026-04-16)
- Remove unsafe secret/default behavior and make runtime fail fast when
  production config is incomplete or unsafe.
- Scope:
  - remove production-secret fallbacks from Compose/runtime
  - enforce production-safe cookie settings
  - stop checked-in deploy/setup scripts from behaving like wipe-and-seed flows
  - add `api` and `nginx` healthchecks tied to the real runtime
- Acceptance:
  - no production-looking default secrets in repo scripts or Compose
  - production startup fails clearly on missing required env vars
  - `api` and `nginx` have healthchecks; `api` uses `/api/health/ping`
- deps: `T-D01`

### `T-D03` — Deploy / rollback / backup runbook (DONE 2026-04-16)
- Produce the serious-deployment operating contract for this backend.
- Scope:
  - exact deploy sequence
  - exact smoke checks
  - exact rollback decision path
  - exact backup and restore commands
  - isolated backup/restore rehearsal against a throwaway Postgres instance
- Acceptance:
  - runbook lives in repo and matches this Compose stack
  - one full backup/restore rehearsal succeeds against the current stack
  - after rehearsal restore, backend smoke queries match source counts for
    core tables and restored critical runtime objects exist before API startup
- deps: `T-D02`

### `T-D04` — Live ingestion overlap proof (TODO)
- Replace the synthetic local Bol.com reliability artifact with a real
  production-like overlap window.
- Scope:
  - run Bol.com API polling alongside the retired email path for a real window
  - measure missed orders, timing drift, and field mismatches
  - decide whether emergency email fallback remains necessary
- Acceptance:
  - a live reliability report exists
  - the report is strong enough to treat `T-B03` as production-complete
- deps: `T-D01`, `T-D02`, `T-D03`

### `T-D05` — Migration-exit sale routing audit (DONE 2026-04-16)
- Close the remaining caveat around migration compatibility.
- Scope:
  - enumerate every sale-ingestion write path
  - prove all new sales route through `process_bom_sale()`
  - decide the exact retirement policy for legacy `process_sale()`
- Acceptance:
  - every production sale path is documented and tested
  - remaining legacy fallback is either removed or explicitly time-bounded
- Delivered:
  - `.project/T-D05-SALE-ROUTING-AUDIT.md`
  - `apps/api/tests/t_D05_sale_routing_audit.py`
  - `D-105` superseding `D-024`
- deps: `T-D04`

### `T-D06` — Production soak and release signoff (TODO)
- Final backend readiness gate before calling the deployment serious and caveat-free.
- Scope:
  - 7-day deploy/runbook/stability check
  - 14-day ingestion/dead-letter/invariant review
  - 30-day AVL-FIFO correctness soak aligned with PLAN success criteria
- Acceptance:
  - no unexplained ledger gaps
  - no unresolved dead-letter growth
  - no rollback-class incidents from deploy or config drift
  - a real release has been executed via this runbook and rollback remains rehearsed
- deps: `T-D03`, `T-D04`, `T-D05`

---

## Cross-cutting / prerequisites

### `T-X01` — Clean-state cleanup (TODO)
- Identify files/directories to delete; produce a single bash command
- Preserve only: source code under `apps/`, `inventory-interwall/`,
  `supabase/migrations/` (if kept), `docker-compose.yml`,
  `.env.example`, license, readme
- Remove: `.planning/`, `.claude/worktrees/` (GSD artifacts per D-070),
  obsolete SPECS-MVP.md if superseded by new PLAN.md, orphan design docs
- Output: commit on the rebuild branch with a clean slate

### `T-X02` — Rewrite `CLAUDE.md` (TODO)
- Audit current CLAUDE.md; update against the new PLAN.md and DECISIONS.md
- Research best-practice CLAUDE.md patterns before rewriting
- Target: concise, vocabulary-locked, reference to `.project/` files
- deps: `T-X01` (clean slate first)

### `T-X03` — Draft initial kickoff prompt for local Claude Code (TODO)
- Research well-formed "kickoff" prompts (master-prompt patterns)
- Output: one paste-ready message the user gives to local Claude Code
  to begin executing the rebuild
- deps: `T-X01`, `T-X02`

### `T-X05` — Evaluate full-stack-orchestration plugin (TODO)
- Look at https://github.com/wshobson/agents specifically
  `full-stack-orchestration`
- Decide: adopt as sub-agent helper, adopt partially, or skip
- Defer evaluation until end of Stream A — decide with real data on
  whether the primer-per-task model cracks at Stream C volume
- Output: decision logged in DECISIONS.md
- deps: T-A09 (end of Stream A)

### `T-X09` — Retrofit T-A01 through T-A05 reports into schema (TODO, optional)
- For audit continuity, convert past reports to REPORT-SCHEMA.md format
- Append to `.project/REPORTS-ARCHIVE.md`
- Low priority — do only if future session has idle capacity

---

## Stream B — Marketplace ingestion

### `T-B02` — Unified ingestion pipeline (DONE 2026-04-15, d48ccce)
- Single worker consumes rows from `ingestion_events` regardless of
  source (email / bolcom_api / future webhook) per D-032.
- Status states: `pending` / `processed` / `failed` / `dead_letter`
  per D-034.
- deps: `T-B01`

### `T-B03` — Parallel-run Bol.com email vs API polling (TODO, local artifact preserved)
- Run both for one week (or a volume-based threshold of ~50 orders,
  whichever first — calendar duration is not the gate per
  development-milestone principle).
- Log discrepancies: orders seen by one path and not the other,
  timing differences, field mismatches.
- Output: reliability report as `.project/B03-RELIABILITY.md`.
- Historical local development report is now landed at
  `.project/B03-RELIABILITY.md`, together with helper scripts
  `apps/api/scripts/bol_reliability_local_run.py` and
  `apps/api/scripts/bol_reliability_report.py`.
- It is still not sufficient to mark `T-B03` production-complete,
  because the report is synthetic local validation rather than a live
  overlap window.
- deps: `T-B02`

### `T-B04` — Retire Bol.com email path (DONE 2026-04-15, b103920)
- After T-B03 shows API polling is reliable (zero missed orders over
  the comparison window).
- Email poller stops matching Bol.com senders; IMAP remains for
  MediaMarktSaturn and Boulanger (D-031).
- Keep the code path for emergency fallback behind a feature flag
  (disabled by default).
- Replayed into the current `v2` checkout and verified with
  `docker compose exec -T api python -m pytest /app/tests/t_B04_email_poller_fallback.py -v --tb=short`.
- deps: `T-B03`

### `T-B05` — Dead-letter handling (DONE 2026-04-15, d48ccce)
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

### `T-C00` — UI state audit (TODO, local artifact preserved)
- Inventory every `localStorage` read/write in `inventory-interwall/frontend/`
- Inventory every client-side recomputation of a business number
  (margin, stock, profit)
- Inventory every `innerHTML` assignment with dynamic data (for
  sanitize() coverage)
- Output: audit doc with bug origin per page
- Local audit file exists at
  `/Users/ottogen/interwall-preserve-2026-04-15/live-tree/.project/C00-UI-STATE-AUDIT.md`,
  but it has not been landed on `v2` after the branch sync.
- The preserved audit is stale against current `v2` because it still
  treats `shelf-config.js` as active runtime despite `T-C02e` removing
  it from active runtime.
- Can run in parallel with Stream A
- deps: none

### `T-C01` — Immutable transaction fields + margin-bug fix (DONE 2026-04-15, 123490f)
- Backend: confirm `transactions.cogs` / `transactions.profit` are
  written at sale time and never updated (D-025). Already the case
  after A-05 lands.
- Frontend: remove all client-side margin recomputation in profit.js,
  recorded-sale card, sale-edit view
- Test: open sale, edit, save without changes → margin identical to
  first render
- Replayed into the current `v2` checkout and verified with:
  - `docker compose exec -T api python -m pytest /app/tests/t_C01_profit_immutability.py -v --tb=short`
  - `node inventory-interwall/frontend/t_c01_noop_edit_verify.mjs`
- deps: `T-A05`, `T-C00`

### `T-C02` — Single-source-of-truth refactor (IN PROGRESS, sliced)
- Every stock/count/margin number rendered in the UI comes from a
  canonical endpoint
- Delete business-data use of localStorage; keep only UI prefs (D-040)
- Parts page uses `v_part_stock`; Profit/Valuation uses same view (D-041)
- deps: `T-A06`, `T-C00`, `T-C01`

#### `T-C02a` — Catalog + low-stock canonical stock (DONE 2026-04-15, 3ce3be2)
- `catalog-core.js` uses `getProductsWithStock`
- `ui.js` uses the same canonical snapshot for low-stock checks
- Legacy `getAvailableStock()` and `getStockWithAllocation()` retired

#### `T-C02b` — Wall + bin-info canonical shelf occupancy (DONE 2026-04-15, cf66019)
- `v_shelf_occupancy` + `GET /api/shelves/occupancy`
- `wall.js` and `bin-info-modal.js` consume canonical occupancy data

#### `T-C02c` — Handshake FIFO pick/receive (DONE 2026-04-15)
- `handshake.js` off browser-authored FIFO; `api.consumeLot` +
  `api.transferStock` hit canonical server endpoints
- Backend: `POST /api/stock-lots/{lot_id}/consume`,
  `POST /api/stock/transfer` (session auth, SELECT FOR UPDATE, atomic)
- Deviation: manual stock-out/relocation does not write
  `stock_ledger_entries` because the table's NOT NULL + qty_delta<>0
  constraints block ledger rows for non-sale movements. D-017 still
  holds on the sales path via `process_bom_sale`. Tracked as new
  parking-lot item for a future ledger-schema relax.
- Tests: `apps/api/tests/t_C02c_handshake_endpoints.py` 7/7 pass;
  `inventory-interwall/frontend/t_c02c_handshake_verify.mjs` 23/23.
- deps: `T-C02b`

#### `T-C02d` — Shelf capacity from DB (DONE 2026-04-15, 0e6442d)
- Capacity writes moved to `PATCH /api/shelves/{shelf_id}`
- `bin-info-modal.js` reads capacity from backend-backed shelf data

#### `T-C02e` — Shelf split_fifo/single_bin localStorage → DB (DONE 2026-04-15, fc81d28)
- Shelf settings now flow through DB + `PATCH /api/shelves/{shelf_id}`
- `shelf-config.js` removed from active runtime

### `T-C03` — Wall page: reliable rendering, no hardcoded grid (TODO)
- Remove all hardcoded shelf dimensions (D-045)
- Zone/Column/Level/Bin layout driven entirely by DB rows
- Gradient JIT colour (not traffic-light); breakpoints in config
  table (D-045)
- deps: `T-A02`

### `T-C04` — Wall as picker — forward direction (TODO)
- Click a bin in the Wall → opens a side panel / detail showing
  assigned product-batches as sorted cards (D-042)
- deps: `T-C03`

### `T-C05` — Wall as picker — reverse direction (mini-wall wizard) (TODO)
- When assigning a batch to a shelf, launch a progressive zoom wizard:
  Zone → Column → Level → Bin
- Each level's cards fill the container; feels like zoom-in
- Replaces the shelf dropdown entirely (D-042)
- deps: `T-C03`

### `T-C06` — Batches view with ledger-powered history (TODO)
- Show all batches (active + depleted) (D-043)
- Active: JIT-health gradient colour badge; depleted: grey fade
- Default: newest N visible, older fade to black; "full history"
  toggle reveals all
- Data: `stock_lots` + `stock_ledger_entries` joined
- deps: `T-A01`, `T-C03`

### `T-C07` — Product setup wizard (TODO)
- Section 1: Basic info (name, SKU, category, description)
- Section 2: JIT Reorder Point (avg delivery days, avg sold/day →
  computed reorder point; minimum stock HERE) (D-044)
- Section 3: Initial Stock (shelf via mini-wall wizard, quantity,
  unit cost)
- No silent "save pending" — either all set or explicit "pending
  setup" flag with visible badge everywhere
- deps: `T-C05`

### `T-C08` — Builds page (TODO)
- Create/edit builds with component lines (picks from Models/item_groups)
- Tab inside Build detail: marketplace SKU mappings (external_item_xref)
- Flag "missing mapping" per marketplace — surfaces the "do I have
  this build configured on X?" question directly
- deps: `T-A07`, `T-C02`

### `T-C09` — Purchases feed (feeding the machine) (TODO)
- Mirror of Sales feed, chronological
- Visual weight/colour for incoming stock
- Data: stock-in events from `stock_ledger_entries` where `qty_delta > 0`
- deps: `T-A01`

### `T-C10` — Health page (TODO)
- Ingestion status per marketplace (last run, last success, last failure)
- Orphan state: parts without shelf, parts without reorder point,
  batches without receipts, builds missing marketplace mappings
- Invariant check: every sale has ≥1 ledger row
- Dead-letter queue with manual retry
- deps: `T-A09`, `T-B05`

### `T-C11` — Hardcoded values audit + sanitize() audit (TODO)
- Grep codebase for hardcoded thresholds, URLs, lists, colours;
  move to configurable settings
- Every `innerHTML` with dynamic data routes through `sanitize()` (D-046)
- deps: `T-C00`

---

## Blocked

*(none)*

---

## Parking lot (tracked, not planned)

### `P-01` — AI-assisted email mapping (D-082)
- Future USP. When an email arrives that no parser handles, user
  clicks teach → AI suggests a mapping → user confirms → parser rule
  saved
- Distinct project; deserves its own sprint

### `P-02` — Paid Mirakl API migration (D-081)
- Re-evaluate at higher volume (~20+ orders/day) or when email parser
  maintenance cost crosses €700/mo of your time

### `P-03` — Serial-number tracking (D-085)
- Wire the existing `stock_lots.serial_number` column when RMAs
  become operational

### `P-04` — AVL preferred-vendor priority (D-086)
- Wire the existing `item_group_members.priority` column if a
  vendor-preference rule emerges

### `P-05` — BOM versioning UI (D-087)
- Build a recipe-history editor when the operator actually needs to
  change recipes over time

### `P-06` — Reservation / allocation / WIP states (D-084)
- Not modeled today. Revisit if the business introduces
  ordered-but-not-yet-shipped as a distinct state

### `P-07` — React / Next.js rewrite (D-083)
- `apps/web/` scaffold exists but unused. Re-evaluate only if vanilla
  JS SPA becomes unmaintainable

### `P-08` — Food-franchise generalization (D-080)
- Entirely separate product. If pursued, fork — don't fold into Interwall

### `P-09` — Full-stack-orchestration plugin evaluation
- See `T-X05`. Decision not yet logged

### `P-10` — Trivial-to-composite build conversion UX
- When operator wants to turn a direct-sale product into a
  multi-component build: create a new BLD-NNN build, don't mutate
  the trivial auto-generated one
- Pattern A: new build replaces the trivial; trivial is deactivated
  (not deleted, per D-010)
- Address in Stream C (Builds page, T-C08)

### `P-11` — Builds page search by composition fingerprint
- Users should filter builds by item_groups they contain, to attach
  new marketplace codes to existing builds quickly
- Address in Stream C

### `P-12` — pytest combined-run APScheduler conflict
- T-A09 health router tests ERROR when run in same pytest process
  as other test files (ConflictingIdError on app lifespan restart)
- Passes in isolation; only affects full-suite runs
- Fix options: app factory + per-test lifespan fixture, OR set
  SCHEDULER_JOB_DEFAULTS replace_existing=True for tests
- Address in Stream B retro or when pytest harness is hardened

### `P-13` — Bol.com shipment-tracking webhook receiver
- Optional feature for customer comms / SLA visibility
- Only PROCESS_STATUS + SHIPMENT events are webhook-eligible in
  Retailer API v10 (per T-B00 research, D-097)
- Deferred until T-B04 ships; not in Stream B critical path
- Tracked as T-B06

### `P-14` — FBB (Fulfilled by Bol) order ingestion
- Current poller filters `fulfilment-method=FBR` only (D-099 context)
- FBB orders are shipped from bol.com's warehouse; we don't hold that stock
- If the business adopts FBB: revenue tracking needed without stock deduction
- Revisit when actually required

---

## How to update this file

- New task: append to the right stream with next free `T-XNN` ID
- Task done: mark `→ DONE YYYY-MM-DD` inline; at end of stream, move
  the full entry to `TODO-ARCHIVE.md`
- Task blocked: move to Blocked section with one-line reason
- New open question: add `T-QNN` entry with expected answer if known;
  when closed, move to `TODO-ARCHIVE.md`
- New parked item: add `P-NN` entry; do not delete parked items
  (they're evidence that a path was considered and rejected)
