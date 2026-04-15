# Interwall — universal rules

Loaded for every agent regardless of task. Keep minimal.

## Money-safety

- Never modify `transactions.cogs` / `transactions.profit` after
  initial write (D-025)
- Every sale row has at least one `stock_ledger_entries` row (D-017)
- FIFO pools across `item_groups`, never pinned to an EAN
- Use `SELECT FOR UPDATE`, never `SKIP LOCKED` (D-020, D-021)
- `process_bom_sale` is atomic; partial fulfilment is invalid (D-022)
- Keep `ean_compositions` + `process_sale()` during migration (D-010)

## Locked vocabulary

`products` = Parts · `stock_lots` = Batches · `item_groups` = Models ·
`builds` + `build_components` = Builds (`build_code`) ·
`external_item_xref` = SKU mapping · `stock_ledger_entries` = batch
history · shelf address = `Zone-Column-Level-Bin`

## Branch discipline

- Work only in `/Users/ottogen/interwall`
- Work only on `v2`
- Do not create `.claude/worktrees/`
- Do not create side branches

## Workflow

- `AGENTS.md` defines the coach/operator model.
- Coach-side carryover lives only in `.project/COACH-HANDOFF.md`.
- Operator tasks are driven by `.project/operator-runs/T-XXX/PROMPT.md`.
- Operators write reports to `REPORT.yaml` files, not chat.

## Local runtime

- Host port: `http://localhost:1441/`
- DB shell:
  `docker compose exec -T postgres psql -U interwall -d interwall`
