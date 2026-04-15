# Interwall — universal rules

Loaded for every agent regardless of task. Keep minimal. Per-task
identity, stack, and context come from the first message.

## Money-safety (data-corruption triggers)

- Never modify `transactions.cogs` / `transactions.profit` after
  initial write (D-025)
- Every sale row has ≥1 `stock_ledger_entries` row (D-017)
- FIFO pools across `item_groups`, never pinned to an EAN; use
  `SELECT FOR UPDATE`, never `SKIP LOCKED` (D-020, D-021)
- `process_bom_sale` is one transaction; partial fulfilment is not a
  valid state (D-022)
- `ean_compositions` + `process_sale()` stay during migration (D-010)

## Locked vocabulary (no synonyms in code, comments, or commits)

`products` = Parts · `stock_lots` = Batches · `item_groups` = Models ·
`builds` + `build_components` = Builds (key `build_code`) ·
`external_item_xref` = SKU mapping · `stock_ledger_entries` = batch
history · shelf address = `Zone-Column-Level-Bin` (e.g. `A-02-3-B`)

## Push / safety

- Never push to `main` without explicit ask. Never `--force`, never
  `--no-verify`. Never open a PR unless asked.
- Host port **1441** (system nginx fronts the domain); use
  `http://localhost:1441/...` not bare `localhost`.
- DB shell: `docker compose exec -T postgres psql -U interwall -d interwall`

## Workflow

- `AGENTS.md` defines the coach/operator workflow and task-unit rules.
- Use efficient CLI discovery first: `rg`, `rg --files`, `wc -l`,
  `sed -n`, `git log -S`.
- Load `.project/` docs on demand only when the task needs them.
- Use `.project/COACH-HANDOFF.md` as the single coach-side handoff /
  workflow-state file when saving session findings or resuming coach
  work.
- When coach work accepts a task as done, update `.project/TODO.md`
  immediately before considering the task closed. This includes the
  task status line and the "Now (next up)" pointer when the queue head
  changes.

## Branch discipline

- All Interwall work happens on exactly one branch: `v2`
- All Interwall work happens in exactly one checkout:
  `/Users/ottogen/interwall`
- Do not create, use, or recommend `.claude/worktrees/`
- Do not split agents across multiple local branches or checkouts
- Before substantive work, confirm `pwd` is `/Users/ottogen/interwall`
  and `git branch --show-current` is `v2`

Full context (plan, decisions, process, templates) lives under
`.project/` — load on demand only when the task needs it.
