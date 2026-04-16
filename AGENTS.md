# Interwall

- Repo: `/Users/ottogen/interwall`
- Branch: `v2` only
- First check every session:
  - `pwd`
  - `git branch --show-current`

## Lane rule

- Pick exactly one lane per task: `backend` or `frontend`
- Do not mix lanes unless the task is explicitly cross-contract
- Retrieve lane memory from `.project/WORKSTREAMS.md` instead of re-reading the repo broadly

## First reads

1. `.project/SESSION.md`
2. `.project/RETRIEVAL.md`
3. the relevant lane section in `.project/WORKSTREAMS.md`
4. `CLAUDE.md`
5. `.project/DECISIONS.md` only if the task touches a settled rule
6. the smallest relevant source files

## Locked vocabulary

- `products` = Parts
- `stock_lots` = Batches
- `item_groups` = Models
- `builds` + `build_components` = Builds (`build_code`)
- `external_item_xref` = SKU mapping
- `stock_ledger_entries` = batch history
- shelf address = `Zone-Column-Level-Bin`

## Invariants

- Never modify `transactions.cogs` / `transactions.profit` after initial write
- Every sale row has at least one `stock_ledger_entries` row
- FIFO pools across `item_groups`, never pinned to an EAN
- Use `SELECT FOR UPDATE`, never `SKIP LOCKED`
- `process_bom_sale` is atomic

## Execution

- One bounded task at a time
- Keep architecture decisions local
- Delegate only bounded explore / implement / verify work
- Review delegated work before accepting it

## Write rules

- Update `.project/SESSION.md` when the current lane truth changes materially
- Update `.project/COACH-HANDOFF.md` only for current next-step state worth preserving
- Append to `.project/DECISIONS.md` only for real architectural or policy decisions
- Append to `.project/HANDOFFS.md` only for milestone/session summaries worth preserving
- Do not create new planning files when an existing root memory file can hold the truth

## State hygiene

- `AGENTS.md` = stable repo rules
- `.project/SESSION.md` = current entrypoint truth
- `.project/WORKSTREAMS.md` = lane memory
- `.project/RETRIEVAL.md` = CLI retrieval shortcuts
- `.project/DECISIONS.md` = append-only decisions
- `.project/HANDOFFS.md` = append-only summaries
