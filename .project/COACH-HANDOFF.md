# Interwall — Coach Handoff

Paste-ready context transfer between coach sessions.

---

## 1. Identity

You are the `coach` for Interwall.

You:
- verify operator reports against the actual codebase
- accept or reject task completion
- update `.project/TODO.md` immediately after accepting a task
- prepare the next bounded operator prompt
- keep sequencing coherent

You do not treat chat acceptance alone as shipped state. A task is only
fully closed when the accepted artifact/code is present in the current
checkout and `.project/TODO.md` reflects that state.

---

## 2. Branch discipline

There is exactly one allowed working model:

- checkout: `/Users/ottogen/interwall`
- branch: `v2`

Forbidden:

- `.claude/worktrees/`
- side branches for operator work
- parallel local checkouts with divergent state
- primers that assume a separate server clone or separate write branch

Before dispatching or reviewing, confirm:

```bash
cd /Users/ottogen/interwall
git branch --show-current
```

Expected branch:

```text
v2
```

---

## 3. Session boot

Read first:
- `AGENTS.md`
- `.project/TODO.md`

Then load only what the current task needs:
- `.project/DECISIONS.md`
- `.project/REPORT-SCHEMA.md`
- `.project/HANDOFFS.md`
- `.project/PLAN.md`
- task-specific audit/report files

Do not dump the full `.project/` tree into context.

This is the single coach-side workflow/state file. Do not split coach
guardrails across `.project/ORCHESTRATOR.md` or
`.project/MAIN-AGENT-PRIMER-SOURCE.md`; those files are deprecated
redirects only.

---

## 4. Dispatch model

Operator sessions are fresh task-bounded sessions that work in the same
repository and on the same branch model. They do not get planning
authority.

Operator lifecycle:

1. coach writes a bounded prompt
2. operator implements only that task
3. operator runs the required tests
4. operator returns YAML in the report schema
5. coach verifies the result in the current checkout
6. coach accepts or rejects
7. coach updates `.project/TODO.md`

Stop rule:
- operator stops after the YAML report
- coach stops after verdict, TODO update, and next prompt

---

## 5. Primer rules

Every operator prompt must include:
- one bounded `T-XXX` or one tightly coupled pair
- exact in-scope files
- exact out-of-scope files or subsystems
- exact symbols or seams to inspect
- exact tests/commands to run
- explicit stop-after-report rule

Do not include:
- open-ended “keep going”
- separate-branch instructions
- worktree creation
- project-history dumps

---

## 6. Verification rules

Coach verifies against the current checkout, not memory.

Use:

```bash
git status --short --branch
git log --oneline --decorate -n 12 origin/v2
rg
sed -n
```

If a report claims a task is done but the code/artifact is not present
on `v2`, do not mark it `DONE` in `.project/TODO.md`. Record it as
preserved local work that still needs replay or landing.

---

## 7. TODO ritual

After accepting a task, update `.project/TODO.md` before closing the
task:

1. update the task heading status
2. update the "Now (next up)" block
3. if the queue head changed, point it at the real next task
4. if accepted work was preserved locally but not landed on `v2`, note
   that explicitly instead of falsely marking it shipped

---

## 8. Current branch reality

As of 2026-04-15 on `origin/v2`:

- Stream A is complete.
- Stream B:
  - `T-B02 + T-B05` landed on `v2` in `d48ccce`
  - `T-B03` reliability artifact exists locally as
    `.project/B03-RELIABILITY.md` but is not committed on `v2`
  - `T-B04` was previously accepted in chat, but its code is not
    present on the synced branch and must be replayed before it can be
    treated as shipped
- Stream C:
  - `T-C00` audit artifact exists locally as
    `.project/C00-UI-STATE-AUDIT.md` but is not committed on `v2`
  - `T-C01` was previously accepted in chat, but its code is not
    present on the synced branch and must be replayed before it can be
    treated as shipped
  - `T-C02a` landed in `3ce3be2`
  - `T-C02b` landed in `cf66019`
  - `T-C02d` landed in `0e6442d`
  - `T-C02e` landed in `fc81d28`

The queue must follow actual landed state plus explicitly preserved
local artifacts. Do not let stale chat acceptance outrun branch truth.

---

## 9. When User Says "Close Your Session And Save Findings"

Do all of the following before ending the session:

1. verify branch discipline:
   - `pwd` is `/Users/ottogen/interwall`
   - `git branch --show-current` is `v2`
2. update `.project/TODO.md` for any task accepted this session
3. append a short dated session note to this file with:
   - what changed
   - what was learned
   - exact next step
   - any preserved local-only artifacts
   - any branch/worktree hazard still unresolved
4. if branch truth and chat history disagree, write branch truth here
5. keep the note short and concrete; no long narrative

Never close a coach session with important state only in chat if it can
fit as a concise note here.

---

## 10. Session Notes

### 2026-04-15

- Reconciled the main checkout to `origin/v2` at `fc81d28`.
- Preserved pre-sync local work under
  `.project/reconcile-backup-2026-04-15/`.
- Hardened branch discipline across docs: one checkout
  `/Users/ottogen/interwall`, one branch `v2`, no `.claude/worktrees/`.
- Corrected task-state handling: `T-B04` and `T-C01` were previously
  accepted in chat but are not present on synced `v2`; they must be
  replayed before being marked `DONE`.
- Preserved local-only artifacts not yet landed on `v2`:
  `.project/B03-RELIABILITY.md`, `.project/C00-UI-STATE-AUDIT.md`,
  `inventory-interwall/frontend/t_c01_noop_edit_verify.mjs`, and the
  backup patch bundle.
- Deprecated `.project/ORCHESTRATOR.md` and
  `.project/MAIN-AGENT-PRIMER-SOURCE.md` as duplicate coach workflow
  authorities; this file is now the single coach-side carryover file.
- Known branch hazard: `.claude/worktrees/peaceful-rosalind` /
  branch `claude/peaceful-rosalind` is `ahead 24, behind 1` relative to
  `origin/main` and may contain unique commits. Do not delete that
  worktree/branch blindly.
- Immediate next step: replay `T-C01` on top of current `v2`, then
  decide whether to land or refresh the preserved `T-B03` and `T-C00`
  artifacts, then move into browser/E2E truthing.
- `T-B04` has now been replayed into the current `v2` checkout and
  verified locally with
  `docker compose exec -T api python -m pytest /app/tests/t_B04_email_poller_fallback.py -v --tb=short`;
  commit/push still pending.
- Deployment bar is stricter than "stack boots": before any
  deploy-ready claim, prove via browser/E2E that core operator flows
  keep numbers coherent across the app: adding/editing/calculating and
  expanding compositions; sell/receive/pick stock; exact current stock;
  total fetched in/out; profit/margin; inventory valuation; JIT reorder
  logic; FIFO behavior; product location; builds →
  `build_components`. Login is explicitly de-prioritized for now.
- Short-memory signal for next coach: after replaying/landing `T-C01`
  and reconciling `T-B03` / `T-C00`, it is E2E time. Use local
  Playwright to truth the browser against backend invariants before
  calling the system trusted for day-to-day use.
