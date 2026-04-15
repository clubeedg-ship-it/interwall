# Interwall — Agent Context

## Project

Interwall is the operational backbone of a single-tenant PC-assembly business.
Solo engineer. Production runs one client's daily operations.

Core value: marketplace sale → automatic FIFO-across-item-group component
deduction → real-cost profit recorded in the DB with an audit trail.

## Stack & paths

- `apps/api/` — FastAPI + psycopg2 + APScheduler (single process)
- `apps/api/sql/init.sql` — PostgreSQL schema + PL/pgSQL functions
- `apps/api/email_poller/` — IMAP poller + marketplace parsers
- `inventory-interwall/frontend/` — vanilla JS SPA (no build step)
- `nginx/` — reverse proxy, static host
- `docker-compose.yml` — 3 containers: postgres, api, nginx

Not used (do not revive without asking): `apps/web/` (deprecated Next.js scaffold),
`supabase/` (speculative multi-tenant schema).

## Dev commands

- `docker compose up -d` — start the stack
- `docker compose logs -f api` — tail backend logs
- `docker compose exec -T postgres psql -U interwall -d interwall` — DB shell
- `docker compose exec -T postgres psql -U interwall -d interwall -f /app/path.sql` — run SQL file
- `./reset-data.sh` — reset DB and reload stock checkpoint (destructive)

See [Test & commit discipline](#test--commit-discipline) for how tests are
written, run, and committed. See [Database access](#database-access) for
connection details and mount paths.

## Domain vocabulary (locked)

Do not invent synonyms. Full table and rationale in `@.project/DECISIONS.md` D-060.

| Code | UI label | Meaning |
|---|---|---|
| `products` | Parts | Catalog of real physical things with EANs |
| `stock_lots` | Batches | Physical received lots (unit cost, date, shelf) |
| `item_groups` | Models | Substitute pool ("any RTX 3050") |
| `builds` + `build_components` | Builds | Finished-product recipes, keyed by `build_code` |
| `external_item_xref` | SKU mapping | Marketplace SKU → `build_code` |
| `stock_ledger_entries` | (Batch history) | Per-movement audit rows |
| `shelves` / `zones` / `warehouses` | Wall | Physical location hierarchy |

Shelf addressing is always `Zone-Column-Level-Bin` (e.g. `A-02-3-B`). Never
"aisle", "row", "stack", or "area" in new code.

## Design principles

These are the positive "always" rules. Violations compound silently until they
cause bugs. Rationale for each is in `@.project/DECISIONS.md` — referenced by ID.

- **No hardcoded business values.** Thresholds, gradient breakpoints, category
  lists, marketplace senders, VAT / commission / overhead rates, colour codes —
  all live in the database or a named config table. If you find yourself writing
  a magic number, stop and seed it. (D-045)
- **Database is the single source of truth.** The frontend renders stored
  values; it never recomputes business numbers. `localStorage` is allowed only
  for pure UI preferences (dark mode, last-viewed tab). (D-040, D-041)
- **Immutable transactions.** `transactions.cogs` and `transactions.profit` are
  written once by `process_bom_sale` at sale time, from real lot costs. Never
  recompute on read or re-save. (D-025)
- **Every sale has at least one `stock_ledger_entries` row.** The ledger is
  the audit trail; a sale without ledger rows is a bug. Add an invariant check
  to the Health page. (D-017)
- **AVL-FIFO pools across item groups.** `deduct_fifo_for_group` picks the
  oldest lot from any product in the group; it never pins to a specific EAN.
  (D-020)
- **Strict serialization.** Use `SELECT FOR UPDATE`, never `SKIP LOCKED`,
  for FIFO deduction. Correctness over throughput at current volume. (D-021)
- **Atomic sale processing.** `process_bom_sale` is one transaction. A failed
  deduction rolls back everything including the transaction shell row. Partial
  fulfilment is not a valid state. (D-022)
- **Additive migrations only.** Legacy structures (`ean_compositions`,
  `process_sale()`) stay until the new path is proven. Do not drop them in
  this rebuild. (D-010, D-024)
- **Forward-compatibility columns ship unwired.** `priority`, `valid_from`,
  `valid_to`, `serial_number` exist in the schema but do not drive logic
  today. Do not wire them without an explicit decision entry. (D-015)
- **Sanitize all user-data rendering.** Every frontend `innerHTML` with
  dynamic content routes through `sanitize()` (createTextNode pattern). (D-046)

## Reference before writing

Design leverage we've agreed to use. Before writing code in these areas, pull
the reference first — do NOT reason from first principles:

- **Database schema shapes** — read ERPNext's DocType JSONs before drafting
  any new table:
  https://github.com/frappe/erpnext/tree/version-15/erpnext/stock/doctype
  Specifically `item`, `bom`, `bom_item`, `item_alternative`, `stock_ledger_entry`.
  Translate shapes to our Postgres DDL; do not adopt their stack.
- **FIFO edge cases** — read Tryton's `product_cost_fifo` module (on PyPI as
  `trytond-product-cost-fifo`) before editing `deduct_fifo_for_group` or
  writing new cancellation / return / reversal logic. Catches partial-depletion
  and rollback edge cases.
- **Bol.com webhook ingestion** — read the official Retailer API v10 OpenAPI
  spec before implementing the webhook receiver. HMAC signature format and
  event catalog must come from the spec, not from examples.
- **GS1 EPCIS event model** — consult when designing new stock movement
  event types. Four canonical events: Object / Aggregation / Transaction /
  Transformation. If our event shape matches EPCIS, we stay compatible.

Rule: lift shapes and algorithms, never adopt the runtime. We will not run
ERPNext, Frappe, MariaDB, Tryton, or anything similar. (D-001, D-002)

## Tool usage

- **Search code**: Grep (NEVER `bash grep` / `rg`). Glob for filename patterns.
- **Read files**: Read with absolute paths; NEVER `cat`, `head`, `tail`.
- **Edit**: Edit for targeted changes; Write only for new files or full rewrites.
- **Shell**: Bash only for commands with no dedicated tool (git, docker, migrations).
- **Library docs**: query the docs MCP BEFORE writing code against FastAPI,
  psycopg, Bol.com Retailer API, Postgres FIFO patterns, IMAP libs. Training
  data lags real APIs.
- **Web research**: WebSearch only for non-library questions (IMAP quirks,
  "how do others solve X"). Prefer docs MCP for any library or SDK question.
- **GitHub**: use `gh` CLI for read operations; GitHub MCP for writes.

Never WebFetch a URL you invented. Only fetch URLs the user provided or that
came from a search result.

## Subagents

Spawn a subagent when the task requires reading >10 files, running >2
independent subtasks, or doing research you don't want in main context.

- **Explore subagent** — before planning any non-trivial change touching code
  you haven't read. Brief with a concrete question, not "look around".
- **General-purpose subagent** — external research (docs, benchmarks, OSS
  audits) or multi-file investigations.
- **Do NOT spawn for 1–3 file reads** — overhead isn't worth it.

Every subagent brief must contain: (a) the concrete question, (b) files or
paths to start from, (c) what a good answer looks like, (d) critical
constraints from this file (subagents don't see CLAUDE.md the same way).

## Research vs act

- **Research first** when touching an external API, a library you haven't
  used this session, or a Postgres/FIFO pattern with correctness implications.
- **Skip research** when the diff is describable in one sentence, or mirrors
  an existing pattern in the same file.
- Correctness beats speed on stock movement, COGS, and ledger writes.

## Plan / execute workflow

Work is tracked in three files under `.project/`, imported at the bottom.

- `@.project/PLAN.md` — direction, scope, success criteria
- `@.project/DECISIONS.md` — append-only log of every locked decision (D-###)
- `@.project/TODO.md` — sequenced next actions across work streams (T-###)

Rules:

- Before non-trivial work (>1 file or >30 lines), confirm the target is in
  `TODO.md`. If it isn't, add it and tell the user.
- For any architectural choice (schema shape, algorithm variant, new dependency,
  new library), append a new `D-NNN` entry to `DECISIONS.md` with one-line
  rationale. Never silently change direction.
- `DECISIONS.md` is append-only. To reverse, add a new entry that supersedes
  the old one by ID — do not edit past entries.

## Test & commit discipline

Every T-### task's "done" requires three committed artifacts on
the working branch:

1. Implementation file(s) under the appropriate source tree
   (`apps/api/sql/`, `apps/api/`, `inventory-interwall/frontend/`)
2. Test file at `apps/api/tests/t_<TaskID>_<slug>.{sql,py}`
   - SQL tests wrap in `BEGIN`/`ROLLBACK` so they leave no
     side effects on the dev DB
   - Final line must print `<TaskID> ALL TESTS PASSED` or
     equivalent single-line pass assertion
   - Must be runnable standalone with one `docker compose exec` command
3. Both pushed to the working branch before reporting "done"

The "done" report MUST include:
- Commit SHA containing the implementation
- Commit SHA containing the test file (may be same commit)
- Full path to the test file
- The exact command to re-run the test

A task is not done without all three artifacts and the full
report. Inline psql runs don't count — transient tests are
invisible to future sessions and to the reviewer.

## Database access

DB name: `interwall`. User: `interwall` (no superuser `postgres`
role exists on this instance).

Shell:

    docker compose exec -T postgres psql -U interwall -d interwall

Run SQL file (inside container):

    docker compose exec -T postgres psql -U interwall -d interwall \
      -f /app/path/inside/container.sql

Files under `apps/api/` are mounted at `/app/` in the postgres
container (read-only). Tests live at `/app/tests/` inside the
container, `apps/api/tests/` on the host.

## Critical invariants

Expensive mistakes. Breaking any of these misleads the operator or corrupts data.

- **NEVER** modify `transactions.cogs` or `transactions.profit` after initial write.
- **NEVER** drop `ean_compositions` or the `process_sale()` function during the
  migration window.
- **NEVER** use `SKIP LOCKED` in FIFO deduction.
- **NEVER** render business numbers recomputed in the frontend.

## Commit & branch discipline

- Commit messages: present tense, imperative mood. Stream prefix:
  `feat(backend): …`, `fix(frontend): …`, `chore(repo): …`.
- One logical change per commit. Cleanup and feature work never in the same commit.
- **Do not push to `main` without an explicit user request.** Feature branches
  OK without asking.
- Never push with `--force`. Never `--no-verify`.
- Never open a PR unless the user asks.

## Safety & reversibility

- For destructive operations (`rm -rf`, `DROP`, `git reset --hard`, file
  deletion), show the plan and wait for confirmation unless pre-authorised
  this session.
- If you encounter files you don't recognise, investigate before deleting —
  they may be in-progress work.
- When a hook or lint step fails, fix the underlying cause. Never bypass with
  `--no-verify`.

## Self-modification

Propose diffs to this file when conventions change. Do NOT silently edit it.
Silent drift is worse than staleness.

## Imports

@.project/PLAN.md
@.project/DECISIONS.md
@.project/TODO.md
