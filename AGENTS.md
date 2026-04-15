# Interwall — Coach / Operator Guide

Active repo:
`/Users/ottogen/interwall`

Single allowed checkout:
`/Users/ottogen/interwall`

Single allowed write branch:
`v2`

## Branch discipline

- All active work happens in `/Users/ottogen/interwall`.
- All active work happens on `v2`.
- Do not create, use, or recommend `.claude/worktrees/`.
- Do not create side branches for task work.
- Before substantive work, confirm:
  - `pwd` is `/Users/ottogen/interwall`
  - `git branch --show-current` is `v2`

## Roles

### Coach

Default Codex role.

Responsibilities:
- read the active planning docs
- inspect the codebase and decide the next bounded task
- distill only the task-relevant facts the operator needs
- create the operator packet under `.project/operator-runs/T-XXX/`
- review the operator's file-based report and actual diff
- update `.project/TODO.md` and `.project/COACH-HANDOFF.md`
- commit accepted work

Coach does not offload planning authority.

### Operator

External Claude / Opus session, run sequentially by the user.

Responsibilities:
- start from the same repo and same branch
- read `CLAUDE.md` plus the assigned operator packet only
- implement only the bounded task in the packet
- add or update source tests
- write the report file named by the packet
- stop after the report is written

Operator does not commit, does not reprioritize, and does not expand scope.

## Startup

For a fresh coach session, read:
1. `AGENTS.md`
2. `.project/TODO.md`

Then load:
- `.project/PLAN.md`
- `.project/DECISIONS.md`
- `.project/COACH-HANDOFF.md`
- `.project/HANDOFFS.md`
- `.project/REPORT-SCHEMA.md`

Do not dump the full repo or full `.project/` tree into context.

## Task unit

Default execution unit:
- one `T-XXX`

Allowed exception:
- one tightly coupled pair such as `T-B02 + T-B05`

Never use:
- "continue stream"
- "keep going until blocked"
- open-ended operator scopes

## Operator packet

Every delegated task gets one packet directory:

` .project/operator-runs/T-XXX/ `

Required files:
- `PLAN.md` — coach's distilled implementation plan
- `PROMPT.md` — paste-ready operator prompt
- `REPORT.yaml` — operator writes this file, not chat

Optional files:
- `REVIEW.md` — coach's follow-up correction note

The operator should not need to read `TODO.md`, `PLAN.md`, or `DECISIONS.md`
in full if the packet is prepared correctly.

## Stop conditions

Coach:
- stop after protocol/design cleanup, packet prep, or review/acceptance

Operator:
- stop after code, tests, and `REPORT.yaml`
