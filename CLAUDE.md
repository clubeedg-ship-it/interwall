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

Full context (plan, decisions, process, templates) lives under
`.project/` — load on demand only when the task needs it.
