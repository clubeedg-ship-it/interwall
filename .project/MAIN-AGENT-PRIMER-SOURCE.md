# Interwall — Agent Context

Single-tenant PC-assembly operations backbone. Solo engineer. Core
value: marketplace sale → FIFO-across-item-group deduction → real
profit in DB with audit trail.

## Stack & paths

- `apps/api/` — FastAPI + psycopg2 + APScheduler (single process)
- `apps/api/sql/init.sql` — Postgres schema + PL/pgSQL
- `apps/api/email_poller/` — IMAP poller
- `inventory-interwall/frontend/` — vanilla JS SPA
- `nginx/`, `docker-compose.yml` — 3 containers: postgres, api, nginx
- Not used without asking: `apps/web/`, `supabase/`

## Dev

- `docker compose up -d` — start
- Host port **1441** (system nginx fronts `interwall.abbamarkt.nl`);
  use `http://localhost:1441/...` — `localhost` alone hits system nginx
- DB: `docker compose exec -T postgres psql -U interwall -d interwall`

## Vocabulary (locked — do not invent synonyms)

| Code | UI label | Meaning |
|---|---|---|
| `products` | Parts | Catalog with EANs |
| `stock_lots` | Batches | Physical received lots |
| `item_groups` | Models | Substitute pool ("any RTX 3050") |
| `builds` + `build_components` | Builds | Recipes, keyed by `build_code` |
| `external_item_xref` | SKU mapping | Marketplace SKU → `build_code` |
| `stock_ledger_entries` | Batch history | Per-movement audit |
| `shelves` / `zones` / `warehouses` | Wall | `Zone-Column-Level-Bin` |

## Critical invariants (break these → data corruption)

- NEVER modify `transactions.cogs` / `transactions.profit` after initial write (D-025)
- Every sale has ≥1 `stock_ledger_entries` row (D-017)
- FIFO pools across item_group, not EAN (D-020)
- `SELECT FOR UPDATE`, never `SKIP LOCKED` (D-021)
- `process_bom_sale` is single-transaction atomic (D-022)
- DB is single source of truth; frontend renders, never recomputes (D-040, D-041)
- Additive migrations; `ean_compositions` + `process_sale()` stay (D-010, D-024)
- `sanitize()` on every `innerHTML` with user data (D-046)
- No hardcoded business values — DB or named config table (D-045)
- Forward-compat columns ship unwired (D-015)

## Operating model

You are coach + executor. Develop in sandbox; push directly to `v2`.
Delegate heavy work (multi-file implementation, test suites, docker
exec chains, deep research) to Sonnet 4.6 on the server via files in
`.project/handoffs/` — protocol in `.project/HANDOFFS.md`, read once
per session when dispatching.

Per-task context lives in the first user message of the session or
in the dispatched primer file. Do NOT dump `.project/*.md` into
context proactively — load on demand, one file at a time, only when
the task needs it.

## Context files (load on demand, never auto-import)

`.project/TODO.md` (next actions) · `DECISIONS.md` (D-### log,
append-only) · `PROCESS.md` (gating tiers) · `PRIMER-TEMPLATE.md` ·
`REPORT-SCHEMA.md` · `PLAN.md` · `REFERENCES.md` (ERPNext / Tryton /
Bol / GS1) · `PRIMER-EXEMPLARS.md` · `BOL-CONTRACT.md` ·
`TODO-ARCHIVE.md` · `RETROSPECTIVES.md` · `HANDOFFS.md`

## Commit & safety

- Imperative commit messages, stream prefix (`feat(backend):`,
  `chore(process):`). One logical change per commit.
- Never push to `main` without explicit ask. Never `--force`. Never
  `--no-verify`. Never open a PR unless asked.
- Destructive ops (`rm -rf`, `DROP`, `reset --hard`) — confirm first
  unless pre-authorised this session.
- Append-only DECISIONS.md; reversals cite superseded ID.
- Read-once per file per session; extract needed facts into scratch
  at top of working file.
