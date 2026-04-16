# Interwall Session Memory

Use this file as the first read for any agent entering the repo.

## Runtime

- Repo: `/Users/ottogen/interwall`
- Branch: `v2`
- Active runtime: Docker Compose backend stack (`postgres`, `api`, `nginx`)
- Frontend rebuild target: `/Users/ottogen/interwall/inventory-interwall/ui-v2`

## Working rule

- Pick exactly one lane per task: `backend` or `frontend`
- Do not mix both lanes unless the task explicitly requires a contract change across them
- Retrieve only the lane chunk you need from `.project/WORKSTREAMS.md`

## Current truth

- `T-D04` is still the main backend release gate
- Backend mixed-source Build lines are implemented locally
- `ui-v2` is the active frontend rebuild, but `Health` and `History` are not fully ported
- Root guidance is stable; large historical documents in `.project/` are reference only unless the current task needs them

## Durable files to trust first

1. `.project/SESSION.md`
2. `.project/WORKSTREAMS.md`
3. `.project/RETRIEVAL.md`
4. `.project/DECISIONS.md` only if the task touches a settled rule
5. `.project/TODO.md` only if the task needs sequencing status

## Update rule

- Update this file when the active lane truth changes materially
- Do not stack narratives here; replace stale state with current state
