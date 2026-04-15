# Interwall — Agent Context

## Project

Interwall is the operational backbone of a single-tenant PC-assembly
business. Solo engineer. Production runs one client's daily operations.

Core value: marketplace sale → automatic FIFO-across-item-group
component deduction → real-cost profit recorded in the DB with an
audit trail.

## Stack & paths

- `apps/api/` — FastAPI + psycopg2 + APScheduler (single process)
- `apps/api/sql/init.sql` — PostgreSQL schema + PL/pgSQL functions
- `apps/api/email_poller/` — IMAP poller + marketplace parsers
- `inventory-interwall/frontend/` — vanilla JS SPA (no build step)
- `nginx/` — reverse proxy, static host
- `docker-compose.yml` — 3 containers: postgres, api, nginx

Not used (do not revive without asking): `apps/web/` (deprecated
Next.js scaffold), `supabase/` (speculative multi-tenant schema).

## Dev commands

- `docker compose up -d` — start the stack
- `docker compose logs -f api` — tail backend logs
- `./reset-data.sh` — reset DB and reload stock checkpoint (destructive)

The Docker stack binds nginx to host port **1441**, not 80. Port 80
on the host is a system nginx (apt-installed) which proxies
`interwall.abbamarkt.nl → 127.0.0.1:1441`. For local testing use
`http://localhost:1441/...`. Hitting `localhost` without the port
will hit the system nginx and can return 404 for routes the system
nginx doesn't know about.

DB shell and file-run commands live in `.project/PROCESS.md` §4.

## Domain vocabulary (locked)

Do not invent synonyms. Full table and rationale in DECISIONS.md D-060.

| Code | UI label | Meaning |
|---|---|---|
| `products` | Parts | Catalog of real physical things with EANs |
| `stock_lots` | Batches | Physical received lots (unit cost, date, shelf) |
| `item_groups` | Models | Substitute pool ("any RTX 3050") |
| `builds` + `build_components` | Builds | Finished-product recipes, keyed by `build_code` |
| `external_item_xref` | SKU mapping | Marketplace SKU → `build_code` |
| `stock_ledger_entries` | (Batch history) | Per-movement audit rows |
| `shelves` / `zones` / `warehouses` | Wall | Physical location hierarchy |

Shelf addressing is always `Zone-Column-Level-Bin` (e.g. `A-02-3-B`).
Never "aisle", "row", "stack", or "area" in new code.

## Critical invariants

Expensive mistakes. Breaking any of these misleads the operator or
corrupts data. Rationale for each is in DECISIONS.md — referenced by ID.

- **NEVER** modify `transactions.cogs` or `transactions.profit` after
  initial write — written once by `process_bom_sale` at sale time
  from real lot costs. (D-025)
- **Every sale has ≥1 `stock_ledger_entries` row.** The ledger is
  the audit trail; a sale without ledger rows is a bug. (D-017)
- **AVL-FIFO pools across item groups.** `deduct_fifo_for_group`
  picks the oldest lot from any product in the group; never pins to
  a specific EAN. (D-020)
- **Strict serialization** via `SELECT FOR UPDATE`, never
  `SKIP LOCKED`. Correctness over throughput. (D-021)
- **Atomic sale processing.** `process_bom_sale` is one transaction;
  a failed deduction rolls back everything. Partial fulfilment is not
  a valid state. (D-022)
- **Database is the single source of truth.** Frontend renders stored
  values; it never recomputes business numbers. `localStorage` is
  allowed only for pure UI prefs. (D-040, D-041)
- **Additive migrations only.** Legacy structures
  (`ean_compositions`, `process_sale()`) stay until the new path is
  proven. (D-010, D-024)
- **Sanitize all user-data rendering.** Every `innerHTML` with
  dynamic content routes through `sanitize()`. (D-046)
- **No hardcoded business values.** Thresholds, gradient breakpoints,
  VAT / commission / overhead rates — all in the DB or named config
  tables. (D-045)
- **Forward-compatibility columns ship unwired.** `priority`,
  `valid_from`, `valid_to`, `serial_number` exist in schema but do
  not drive logic today. (D-015)

## Tool usage

- **Search code**: Grep (NEVER `bash grep` / `rg`). Glob for filename
  patterns. **Read files**: Read with absolute paths. **Edit**: Edit
  for targeted changes; Write for new files. **Shell**: Bash only
  when no dedicated tool exists.
- **Read-once rule** (PROCESS.md §3): re-reading a file already read
  this session is wasted tool calls. On first read, extract what you
  need into a scratch comment at the top of your working file.
- **Context7 MCP** before writing code against FastAPI internals,
  psycopg, Bol.com Retailer API v10, IMAP libs, APScheduler —
  training data lags these APIs. Resolve library ID first, then
  query-docs.
- **GitHub**: `gh` CLI for reads; GitHub MCP for writes.
- Never WebFetch a URL you invented. Only fetch URLs the user
  provided or that came from a search result.

## Subagents

Spawn when the task needs reading >10 files, running >2 independent
subtasks, or research you don't want in main context. Do NOT spawn
for 1–3 file reads — overhead isn't worth it.

Every subagent brief contains: (a) the concrete question, (b) files
or paths to start from, (c) what a good answer looks like, (d)
critical constraints from this file (subagents don't see CLAUDE.md
the same way).

## Research vs act

Research first when touching an external API, an unfamiliar library,
or a Postgres/FIFO pattern with correctness implications. Skip
research when the diff is describable in one sentence or mirrors an
existing pattern in the same file. Correctness beats speed on stock
movement, COGS, and ledger writes.

## Plan / execute workflow

Work is tracked across `.project/` files — all auto-imported below.
Rules in PROCESS.md. Primer shape in PRIMER-TEMPLATE.md. Done-report
shape in REPORT-SCHEMA.md. Worked examples (primer + report) live
on-demand in `.project/PRIMER-EXEMPLARS.md`. External design refs
(ERPNext / Tryton / Bol.com / GS1) in `.project/REFERENCES.md`.

Before non-trivial work (>1 file or >30 lines), confirm the target
is in TODO.md. If not, add it and tell the user. Every architectural
choice appends a new `D-NNN` to DECISIONS.md with one-line rationale
— append-only; reversals create new entries that cite the superseded
ID.

## Commit & branch discipline

- Commit messages: present tense, imperative mood. Stream prefix:
  `feat(backend): …`, `fix(frontend): …`, `chore(repo): …`.
- One logical change per commit. Cleanup and feature work never in
  the same commit.
- **Do not push to `main` without an explicit user request.** Feature
  branches OK without asking.
- Never push with `--force`. Never `--no-verify`. Never open a PR
  unless the user asks.

## Safety & reversibility

- For destructive operations (`rm -rf`, `DROP`, `git reset --hard`,
  file deletion), show the plan and wait for confirmation unless
  pre-authorised this session.
- If you encounter files you don't recognise, investigate before
  deleting — they may be in-progress work.
- When a hook or lint step fails, fix the underlying cause. Never
  bypass with `--no-verify`.

## Self-modification

Propose diffs to this file when conventions change. Do NOT silently
edit it. Silent drift is worse than staleness.

## Imports

@.project/PLAN.md
@.project/DECISIONS.md
@.project/TODO.md
@.project/PROCESS.md
@.project/PRIMER-TEMPLATE.md
@.project/REPORT-SCHEMA.md
