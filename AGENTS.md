# Interwall — Agent Guide

Active repo:
`/Users/ottogen/interwall`

Single allowed checkout:
`/Users/ottogen/interwall`

Single allowed write branch:
`v2`

## Branch discipline

- All agents working on Interwall use exactly one branch: `v2`
- All agents work from exactly one checkout: `/Users/ottogen/interwall`
- Do not create, use, or recommend `.claude/worktrees/`
- Do not create side branches for task work
- Do not spread concurrent agent work across multiple checkouts
- Before starting substantive work, confirm:
  - `pwd` is `/Users/ottogen/interwall`
  - `git branch --show-current` is `v2`

## Roles

Two-session model:

- `coach`
  - owns context, sequencing, and design
  - loads only task-relevant docs and code
  - decides direct execution vs delegation
  - prepares the operator's first message
  - reviews returned reports
  - updates planning files and commits meaningful progress
  - after accepting a task report, updates `.project/TODO.md` status and
    the "Now (next up)" pointer before closing the task

- `operator`
  - receives a bounded task group
  - implements only that task group
  - runs required tests
  - returns a structured report
  - stops after reporting

## Startup

Read only:
1. `AGENTS.md`
2. `.project/TODO.md`

Then load only what the task needs:
- `.project/DECISIONS.md` for relevant design locks
- `.project/HANDOFFS.md` for delegation rules
- `.project/REPORT-SCHEMA.md` for return format
- `.project/COACH-HANDOFF.md` for coach workflow state, session carryover,
  and close-session notes
- `.project/PLAN.md` only for high-level direction

Do not dump the full `.project/` tree into context.

## CLI-first discovery

Before broad reading, prefer:
- `rg`
- `rg --files`
- `wc -l`
- `sed -n`
- `git log -S`

Use docs selectively after locating the exact files and symbols involved.

## Task unit

Default execution unit:
- one `T-XXX`

Allowed exception:
- one tightly coupled task pair like `T-B02 + T-B05`

Never use:
- "continue Stream B"
- "keep going until blocked"
- open-ended execution scopes

## Documentation usage

- `TODO.md`: next-action queue
- `DECISIONS.md`: design lockfile
- `PLAN.md`: high-level direction only
- `COACH-HANDOFF.md`: single coach-side workflow/state/hygiene file
- `HANDOFFS.md`: delegation protocol only
- `REPORT-SCHEMA.md`: operator return contract

## Task closure

Coach closes a task only after all of the following are true:
- returned report reviewed and accepted
- `.project/TODO.md` updated to reflect the accepted task status
- "Now (next up)" updated if the accepted task changes the queue head
- any task-required planning/report artifact is written or verified

## Handoff health

A healthy handoff has:
- one bounded task group
- explicit scope fence
- exact files/symbols to inspect
- exact tests to run
- explicit stop-after-report rule
- no duplication of stable `AGENTS.md` content
- no full project-history dump

## Stop condition

Coach:
- stop after context-state summary, execution decision, and operator first message

Operator:
- stop after implementation, tests, and structured report
