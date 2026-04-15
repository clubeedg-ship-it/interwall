# Interwall — Coach Handoff

Single carryover file for coach sessions.

---

## 1. Working model

- checkout: `/Users/ottogen/interwall`
- branch: `v2`
- coach runs in Codex
- operators run sequentially in external Claude / Opus sessions
- operators do not commit
- operators write `REPORT.yaml` files under `.project/operator-runs/`

---

## 2. Current branch truth

As of 2026-04-15 on `origin/v2`:

- Stream A is complete.
- `T-B02 + T-B05` are landed.
- `T-B03` historical local artifact is landed:
  `.project/B03-RELIABILITY.md`
- `T-B04` is landed and verified.
- `T-C01` is landed and verified.
- `T-C00` is still preserved off-branch and stale:
  `/Users/ottogen/interwall-preserve-2026-04-15/live-tree/.project/C00-UI-STATE-AUDIT.md`

Current next real task:
- refresh `T-C00` against current `v2`
- then move into Playwright-backed E2E/browser truthing

---

## 3. Active planning docs

Coach should care about:
- `AGENTS.md`
- `.project/TODO.md`
- `.project/PLAN.md`
- `.project/DECISIONS.md`
- `.project/HANDOFFS.md`
- `.project/REPORT-SCHEMA.md`

Everything else is task-specific or historical.

---

## 4. Deployment bar

Do not call the system trusted or deploy-ready just because the stack
boots.

Required proof before that claim:
- sell / edit / delete flows keep stored money values coherent
- receive / pick / stock movement flows stay FIFO-correct
- parts / wall / profit / valuation agree on the same numbers
- JIT / reorder / location / builds / build_components behave
  consistently across pages
- browser/E2E truthing via local Playwright, not only unit / router
  tests

Login is explicitly lower priority than operational correctness.

---

## 5. Session close ritual

Before ending a coach session:
1. confirm `pwd` and branch
2. update `.project/TODO.md`
3. update this file with branch-truth changes
4. make sure the next coach can resume without chat archaeology

---

## 6. Latest notes

### 2026-04-15

- Branch discipline was collapsed to one checkout / one branch.
- Stale `.claude/worktrees/` were removed from the active repo after
  preservation.
- `T-B04` replay exposed a missing shared-worker dependency on cold
  rebuild; the repo now includes:
  - `apps/api/ingestion_worker.py`
  - `apps/api/sql/12_ingestion_event_attempts.sql`
  - `apps/api/tests/t_B02_B05_ingestion_worker.py`
- `T-C01` replay is landed and verified with both backend and frontend
  checks.
- `T-B03` historical local artifact and helper scripts are now on
  branch.
- Remaining pre-E2E branch fix is to refresh `T-C00`.
- Coach/operator workflow is now reset around file-based operator
  packets:
  - fresh coach entrypoint: `.project/COACH-START-PROMPT.md`
  - operator packet root: `.project/operator-runs/`
  - prompt cache: `.project/OPERATOR-PROMPT-CACHE.md`
  - old primer/process markdown was removed as stale
