# Interwall — Codex Agent Guide

This file is for fresh Codex sessions working in the active rebuild
worktree.

Active worktree:

    /Users/ottogen/interwall/.claude/worktrees/gracious-dewdney

Active branch:

    v2

Do not orchestrate from repo-root `main` unless explicitly asked.

---

## Role

You are the main orchestrator for this rebuild.

Default posture:

- resolve design and sequencing locally
- inspect code with CLI first
- implement directly when the task is small or judgment-heavy
- delegate only bounded execution work to server Sonnet via
  `.project/handoffs/`

Do not recreate a coach/operator hierarchy inside Codex. One strong main
agent is the default.

---

## First files to read

At session start, read only:

1. `CLAUDE.md`
2. `.project/ORCHESTRATOR.md`
3. `.project/TODO.md`

Then load only the file needed for the task:

- `.project/DECISIONS.md` for design locks
- `.project/HANDOFFS.md` for server delegation
- `.project/PROCESS.md` for gating / verification
- `.project/PLAN.md` only for high-level direction

Do not dump the full `.project/` tree into context.

---

## Current project state

- Stream A backend foundation is largely defined / landed
- Stream B ingestion is the active execution track
- Stream C UI rebuild is the next major track
- The most important durable context is in `DECISIONS.md`
- The most important execution context is in `TODO.md`

Near-term priority:

- prepare and/or execute `T-B02` + `T-B05`
- keep workflow docs and handoffs lean
- reduce context rot before large Stream C work begins

---

## Working rules

- Work only inside the active `v2` worktree unless explicitly told otherwise.
- Use CLI search (`rg`, `sed`, `wc`, `git log -S`) to recover context.
- Treat `DECISIONS.md` as the design lockfile.
- Treat `TODO.md` as the next-action queue.
- Keep `PLAN.md` high-level; do not reintroduce stale open-question logs there.
- Keep primers short and factual.
- Never push to `main`.

---

## Delegation rule

Delegate to server Sonnet only when the task is already designed and
benefits from:

- real server execution
- long-running test / rebuild loops
- bounded multi-file coding with clear acceptance checks

Do not delegate unresolved design.

---

## When editing workflow docs

Keep the stack simple:

- `CLAUDE.md` = minimal invariants
- `.project/ORCHESTRATOR.md` = how the main agent works
- `.project/HANDOFFS.md` = how server delegation works
- `.project/PROCESS.md` = gates and review standards
- `.project/TODO.md` = current work
- `.project/DECISIONS.md` = design history

Avoid adding new meta-docs unless one replaces confusion with clarity.

---

## Session objective

Preserve momentum without rebuilding context every turn.

The correct shape for this repo is:

- design here
- execute here when cheap
- execute on server when bounded and worth it
- verify here

If a workflow change increases ceremony more than speed or clarity, do
not adopt it.
