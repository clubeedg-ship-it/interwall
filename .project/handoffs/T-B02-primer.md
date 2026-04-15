# T-B02 + T-B05 primer (historical example)
# Desktop-dispatched 2026-04-15
# Historical note:
# - do not reuse this header as workflow authority
# - active workflow now uses exactly one checkout: /Users/ottogen/interwall
# - active workflow now uses exactly one branch: v2
# - operators return YAML in chat; they do not create side branches or
#   separate report files by default

## Identity

You are the Interwall operator. You write code and run tests in the
single canonical checkout. You have no prior context beyond this primer
plus files you choose to read. This primer dispatches a single batched
pair: T-B02 and T-B05.

Repo root: `/Users/ottogen/interwall`. Branch: `v2`.

## Task

Build the unified ingestion pipeline worker (T-B02) and its dead-letter
handling surface (T-B05) as one coherent change. Two TODO entries,
one design, one commit sequence.

**What exists now** (confirmed — do not re-verify in broad greps):
- `ingestion_events` table holds pending/processed/failed/review/
  dead_letter rows across `source IN ('email', 'bolcom_api')`.
- Bol.com API poller (`apps/api/poller/bol_poller.py`) enqueues +
  inline-processes — sets `processed` on success, `failed` with
  `error_message` on exception.
- Email IMAP poller (`apps/api/email_poller/poller.py`) enqueues +
  inline-processes — sets `processed` at log time, downgrades to
  `failed` if sale write raises. Has a `retry_pending()` helper
  that re-tries `pending`/`failed` rows on each poll.
- No `retry_count` column. No bounded retries. No `dead_letter`
  transitions fire anywhere today.
- No health view over `ingestion_events` yet. T-A09 added
  `v_health_sales_without_ledger` etc. but none touch ingestion.

**What T-B02 delivers** (per D-032):
- A single worker `process_pending_events()` that picks `pending` and
  `failed` rows with `retry_count < MAX_RETRIES`, dispatches by `source`
  to the correct reprocessor, updates status + `retry_count` atomically.
- Source dispatch table: `bolcom_api` → existing bol reprocess path,
  `email` → existing email reprocess path. Extract a thin reprocess
  callable per source from what the pollers already do inline; the
  worker calls it. DO NOT duplicate the parse/resolve logic — import
  it.
- APScheduler job registered in `main.py` with `max_instances=1,
  coalesce=True`, interval from env var `INGESTION_WORKER_INTERVAL_MINUTES`
  (default 5). Startup companion job (`'date'` trigger) mirrors the
  existing pattern.

**What T-B05 delivers** (per D-034):
- `retry_count INTEGER NOT NULL DEFAULT 0` column on `ingestion_events`
  via new migration file `apps/api/sql/12_ingestion_events_retry_count.sql`
  (idempotent `ADD COLUMN IF NOT EXISTS`).
- `MAX_RETRIES` constant in the worker module. When a retry would push
  `retry_count >= MAX_RETRIES`, set `status='dead_letter'` and write
  `dead_letter_reason` = the truncated exception text. Do NOT delete
  or re-queue automatically.
- Health views:
  - `v_health_ingestion_failed` — rows with `status='failed'`,
    `retry_count < MAX` (still retryable; surfaces "this is eating
    retries"). Columns: `id, source, marketplace, external_id,
    retry_count, error_message, created_at`.
  - `v_health_ingestion_dead_letter` — rows with `status='dead_letter'`.
    Same columns plus `dead_letter_reason`.
- Extend `apps/api/routers/health.py` (if it exists under that name;
  locate via init.sql or main.py) to expose both views. Keep the
  existing health router shape — do not rewrite.

**What T-B02 does NOT do** (out of scope; tracked elsewhere):
- Manual retry / resolve UI — that's T-C10 in Stream C.
- Parallel-run comparison of email vs API ingestion — that's T-B03.
- Retiring the email path for Bol.com — that's T-B04.
- Touching `ean_compositions`, `process_sale()`, `sku_aliases` writes
  (all legacy, frozen per D-010 / D-019).

## Read-once manifest

Read these files ONCE each at the start of the session. Extract the
specific facts named into a scratch comment at the top of your new
worker module. No re-reads unless a test failure forces one.

- `.project/CLAUDE.md` → invariants only (already minimal).
- `.project/DECISIONS.md` → extract full bodies of **D-032, D-034,
  D-010, D-019, D-020, D-021, D-022, D-025, D-027, D-033**. Paste
  relevant ones as comments above the worker function they constrain.
- `.project/PROCESS.md` → §2 test/commit discipline, §5 scope rules,
  §7 adversarial review, §11 cold-rebuild. These bind you.
- `.project/REPORT-SCHEMA.md` → the YAML shape your report must match.
- `.project/TODO.md` → entries for T-B02 and T-B05 (status, deps, the
  "Now" section for the batching context).
- `apps/api/sql/init.sql` → confirm `ingestion_events` base shape,
  index names, status CHECK constraint.
- `apps/api/sql/03_avl_build_schema.sql` → the rename + added
  columns (`source`, `dead_letter_reason`).
- `apps/api/sql/11_ingestion_events_dedupe.sql` → `external_id`,
  `error_message`, the unique dedupe index.
- `apps/api/sql/10_v_health.sql` → exact DDL style for existing
  v_health_* views — match indentation, column casing, COMMENT ON.
- `apps/api/sql/08_process_bom_sale.sql` → signature + every RAISE
  message (you must not catch and swallow; you re-raise as
  `error_message` on the ingestion row).
- `apps/api/poller/bol_poller.py` → `_resolve_build_code`,
  `poll_bol_once`, the insert + status-update pattern, the
  `process_bom_sale` call site.
- `apps/api/email_poller/poller.py` + `email_poller/sale_writer.py`
  + `email_poller/email_log.py` → `_resolve_via_xref`, `write_sale`,
  `log_email`, `update_email_status`, `retry_pending`.
- `apps/api/main.py` → scheduler wiring, how existing jobs are
  registered, env var loading pattern.
- `apps/api/tests/t_B01_bol_poller.py` → pytest conventions
  (fixtures, cleanup, MockTransport, `_seed_full_stack`).
- `apps/api/tests/t_A09_health.sql` → SQL test style (BEGIN/ROLLBACK,
  DO $$ blocks, ASSERT, final `RAISE NOTICE`).

If any of those files don't exist at the listed path, stop and
report via `protocol_deviations`. Do not invent paths.

## Scope fence

**In scope** — files you MAY create or modify:
- `apps/api/sql/12_ingestion_events_retry_count.sql` (new)
- `apps/api/sql/13_v_health_ingestion.sql` (new — the two new views)
- `apps/api/ingestion/__init__.py` (new, empty ok)
- `apps/api/ingestion/worker.py` (new — the unified worker)
- `apps/api/main.py` (add scheduler job + startup job; import worker)
- `apps/api/routers/health.py` (or wherever T-A09 landed; extend with
  two new endpoints)
- `apps/api/tests/t_B02_ingestion_worker.py` (new pytest)
- `apps/api/tests/t_B05_dead_letter.sql` (new SQL test for the views)
- `.project/TODO.md` (mark T-B02 and T-B05 `→ DONE 2026-04-15` inline
  only — do NOT move to archive yet; that happens at stream end)

**Out of scope** — files you MUST NOT touch:
- `apps/api/sql/init.sql`, `03_avl_build_schema.sql`,
  `11_ingestion_events_dedupe.sql` (ingestion_events structural
  history — additive new file instead)
- `apps/api/poller/bol_poller.py` structural rewrite (you may extract
  a reprocess callable ONLY if the existing `poll_bol_once` can
  import and reuse it with no behaviour change — if that's not clean,
  keep the worker's reprocessor parallel and note the duplication
  in `notes_to_human` for a future dedup task)
- `apps/api/email_poller/*` structural rewrite (same rule as above)
- Anything under `inventory-interwall/frontend/`
- Anything under `.claude/`, `.planning/`, `supabase/`
- `ean_compositions`, `process_sale()`, `deduct_fifo_stock`,
  `sku_aliases` — per D-010 / D-019, legacy frozen

## Design decisions locked

- **Lock strategy**: single api process → plain `SELECT ... FOR UPDATE`
  with `LIMIT N` batch ordered by `created_at ASC`. Do NOT use
  `SKIP LOCKED` (D-021 generalizes: correctness over throughput at
  this volume). No `FOR UPDATE OF` games — entire row lock is fine.
- **Atomicity**: each event is its own transaction. `BEGIN;
  SELECT ... FOR UPDATE; <reprocess which calls process_bom_sale>;
  UPDATE ingestion_events SET status=...; COMMIT;`. If reprocess
  raises, ROLLBACK, then in a fresh tx update status/retry_count/
  error_message. (`process_bom_sale` has its own inner tx boundary
  per D-022; don't nest savepoints.)
- **Retry budget**: `MAX_RETRIES = 5`. Constant in `worker.py`; not
  env-configurable in this task (config tunability is tracked as a
  follow-up note if you feel strongly).
- **Batch size**: process at most `WORKER_BATCH_SIZE = 25` rows per
  tick. Constant, same rationale.
- **Status transition table**:
  - `pending` + success → `processed` (retry_count unchanged)
  - `pending` + raise, retry_count < MAX-1 → `failed`, retry_count++,
    error_message set
  - `pending` + raise, retry_count == MAX-1 → `dead_letter`,
    retry_count++, dead_letter_reason set, error_message cleared
    or kept (your call — document in worker docstring)
  - `failed` (picked up again) + success → `processed`
  - `failed` + raise with retry_count at MAX-1 → `dead_letter` (as above)
  - `dead_letter` / `processed` / `review` → never picked up
- **Dispatch**: `SOURCE_HANDLERS = {"bolcom_api": reprocess_bolcom,
  "email": reprocess_email}`. Unknown source → log warning, set
  status='review' with `dead_letter_reason="unknown source: <name>"`,
  retry_count unchanged (operator attention, not a retry scenario).
- **Observability**: log each processed id + status transition at
  INFO; log failures at WARNING with exception class; log dead_letter
  transitions at ERROR. Use the stdlib logger configured elsewhere
  in the codebase — do not add a new logger library.

## Test plan

Produce TWO test files. Both must finish green before you report.

### `apps/api/tests/t_B02_ingestion_worker.py` (pytest)

Follow the `t_B01_bol_poller.py` conventions exactly — session-scoped
`init_pool`, autouse `cleanup_test_data`, `TAG` suffix, `_seed_full_stack`
helper (import it or copy its pattern verbatim, don't redesign).

Cases (minimum):

1. **Happy path bolcom_api** — Seed build + stock + xref. Insert one
   `ingestion_events` row with `source='bolcom_api'`, `status='pending'`,
   valid `parsed_data`. Run `process_pending_events()`. Assert:
   - Row status == `processed`, `processed_at` not null, `retry_count` == 0
   - Exactly 1 row in `transactions`, type='sale'
   - ≥1 row in `stock_ledger_entries` (D-017 invariant)
   - `transactions.cogs`, `transactions.profit` not null, > 0 (D-025)

2. **Happy path email** — Same but `source='email'`, `parsed_data`
   shaped like the email poller produces. Assert same invariants.

3. **Transient failure, retry recovers** — Seed a row that fails on
   first call (stock_out). Run worker → row is `failed`, retry_count=1.
   Seed stock, run worker again → row is `processed`, retry_count=1
   (not reset; carry-through).

4. **Hard failure → dead_letter after MAX_RETRIES** — Seed a row
   that will always raise (e.g. unresolvable sku, no xref, no build).
   Run worker 5 times. Assert:
   - After iterations 1-4: `status='failed'`, retry_count incrementing
   - After iteration 5: `status='dead_letter'`, retry_count=5,
     `dead_letter_reason` populated
   - No `transactions` row exists (D-022 rollback held)

5. **Unknown source → review** — Insert row with `source='mystery'`.
   Assert status becomes `'review'`, retry_count unchanged,
   `dead_letter_reason` explains the unknown source.

6. **Batch size respected** — Insert 30 pending rows. Assert at most
   25 flip state after a single worker call (WORKER_BATCH_SIZE).

7. **Terminal states untouched** — Insert rows in `processed`,
   `dead_letter`, `review`. Run worker. Assert none of them changed
   (columns, status, retry_count).

8. **D-022 atomicity** — Seed a row whose sale would succeed stock
   deduction but then fail VAT lookup (delete the vat_rates row for
   its marketplace). Worker runs. Assert: row becomes `failed` with
   error_message mentioning vat_rates, NO transactions row, NO
   stock_ledger_entries rows, NO stock_lots quantity change.

### `apps/api/tests/t_B05_dead_letter.sql` (psql, BEGIN/ROLLBACK)

Follow `t_A09_health.sql` style. Cases:

1. `v_health_ingestion_failed` returns seeded failed row with
   retry_count=2, does NOT return dead_letter row.
2. `v_health_ingestion_failed` does NOT return a row with retry_count
   >= MAX_RETRIES (those should be dead_letter anyway, but defensive).
3. `v_health_ingestion_dead_letter` returns seeded dead_letter row
   with dead_letter_reason, does NOT return failed or processed rows.
4. Both views include `source` and `marketplace` columns so the
   operator can see at a glance which pipeline is bleeding.

Final line of each test file must print `T-B02 ALL TESTS PASSED` or
`T-B05 ALL TESTS PASSED` respectively (or pytest's standard green summary).

## Adversarial directive

Before submitting your report, write a 3-bullet "how would this fail
in production" section. If any bullet names a real failure mode,
address it in code or tests, then re-run. Include the 3 bullets in
the report under `adversarial_review`.

Likely candidates to stress-test your thinking:
- Clock skew / `processed_at` ordering across retries
- Row locked by poller's inline path at the same instant worker
  picks it up
- A `parsed_data` shape the reprocessor panics on (not a RuntimeError)

## Cold-rebuild survival (REQUIRED for this task)

This task adds new SQL files (`12_*.sql`, `13_*.sql`) and registers a
new APScheduler job in `main.py`. Per PROCESS.md §11 and
PRIMER-TEMPLATE.md §7, you MUST prove cold-rebuild survival.

Exact command sequence to run after your implementation commits and
before you write the report:

    docker compose down
    docker compose build api
    docker compose up -d
    # Give db a few seconds then re-run every pre-existing test plus new ones:
    sleep 5
    docker compose exec -T postgres psql -U interwall -d interwall -f /app/tests/t_A09_health.sql
    docker compose exec -T postgres psql -U interwall -d interwall -f /app/tests/t_B05_dead_letter.sql
    docker compose exec -T api python -m pytest /app/tests/t_B01_bol_poller.py -v
    docker compose exec -T api python -m pytest /app/tests/t_B02_ingestion_worker.py -v

Expected result: all pass, final line of each SQL test is its
`ALL TESTS PASSED` marker, pytest reports `N passed in Xs`.

Record both the exact command and the one-line outcome in the
`cold_rebuild_survival` block of the YAML report.

**P-12 note**: full-suite pytest runs hit a known APScheduler
`ConflictingIdError` on lifespan restart. Run the new pytest file in
isolation (single `-v` invocation as shown above). If you find the
existing router tests must also pass in the same process, apply the
`replace_existing=True` fix AS A SIDE TASK only if it's 2 lines —
otherwise note it in `notes_to_human`.

## Scheduler registration example

In `main.py`, inside the existing `lifespan()`, after the bol_poll
block:

    interval = int(os.getenv("INGESTION_WORKER_INTERVAL_MINUTES", "5"))
    scheduler.add_job(
        process_pending_events,
        "interval",
        minutes=interval,
        id="ingestion_worker",
        max_instances=1,
        coalesce=True,
    )
    scheduler.add_job(
        process_pending_events,
        "date",
        id="ingestion_worker_startup",
    )

Import: `from apps.api.ingestion.worker import process_pending_events`
(adjust to match existing import style — check how `bol_poller` is
imported in `main.py` and mirror exactly).

## Report

Write your report to `.project/handoffs/T-B02-report.yaml` per
REPORT-SCHEMA.md. Key fields to get right:

- `task_id: T-B02` (the batch primary; mention T-B05 in `notes_to_human`
  and mark it `→ DONE` in TODO.md alongside T-B02)
- `tier: 2`
- `tests:` — ARRAY form (pytest + sql), both entries present
- `scope_boundary_checks.touched_legacy: false` — MUST be false
- `cold_rebuild_survival.verified: true` with the exact command block
- `decisions_cited: [D-032, D-034, D-017, D-020, D-021, D-022, D-025, D-033]`
- `decisions_added: []` (this task should not require new decisions;
  if you think one is warranted, STOP and report via
  `decisions_challenged` instead)
- `next_ready: true` only if every test green and cold rebuild clean

Commit sequence (suggested, one logical change each):

1. `feat(backend): T-B05 retry_count + dead-letter health views`
   → SQL migration 12 + 13
2. `feat(backend): T-B02 unified ingestion worker`
   → `apps/api/ingestion/worker.py`, main.py scheduler job
3. `feat(backend): T-B02/B05 endpoints for failed + dead-letter health`
   → router extension
4. `test(backend): T-B02 worker + T-B05 dead-letter coverage`
   → both test files
5. `chore(process): mark T-B02 and T-B05 DONE 2026-04-15`
   → TODO.md edits only
6. `chore(handoff): T-B02 report`
   → the YAML

Final command:

    # historical only; do not use side-branch or separate-report workflow

## Stop conditions

Pause after report. Do not begin T-B03 (parallel-run email vs API) —
that task needs a separate primer after T-B02 soaks for a week or
~50 orders per the dev-milestone principle in TODO.md.

If ANY case fails that you cannot fix within scope, stop, write the
report with `status: deviated`, `next_ready: false`, and leave the
codebase in a committed-but-red state (do not ship red code, but
report honestly what broke).
