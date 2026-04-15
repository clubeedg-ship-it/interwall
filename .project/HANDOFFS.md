# Interwall — Handoff Protocol

Read this only when dispatching bounded operator work or resuming from a
returned report.

This file is intentionally narrower than `.project/COACH-HANDOFF.md`.

---

## 1. Purpose

Handoffs exist for one thing:

- move a bounded execution task from the coach to the operator
  with minimal context loss

Handoffs are not the place to restate the whole rebuild.

---

## 2. When to create a handoff

Create a primer only when all three are true:

1. the task is already designed well enough to execute
2. the task benefits from delegation
3. the task has a clear finish line you can verify from a returned report

If design is still moving, do not hand off yet.

---

## 3. Primer shape

Each primer should fit this structure:

### Header

Always include:

    You are the operator for Interwall in `/Users/ottogen/interwall` on branch `v2`.
    Task group:
    - T-XXX
    ...
    Report:
    - Return only YAML per `.project/REPORT-SCHEMA.md`
    Stop rule:
    - After report, stop

### Body

Keep to five short sections:

1. Task
2. Scope fence
3. Facts to extract
4. Acceptance checks
5. Report requirements

Optional sixth section:

6. Cold-rebuild check

Only include it when the task changes startup wiring, docker, SQL init,
or router registration.

---

## 4. What to include

Include only the facts the operator actually needs:

- exact file paths
- function names and signatures
- table / column names
- status enums
- relevant D-### one-liners
- exact tests or commands to run

Good:

- "extract `ingestion_events.status`, `retry_count`, and source values"
- "D-034: failed ingestion must surface, not disappear"

Bad:

- full `DECISIONS.md`
- full `TODO.md`
- long narrative history
- generic instructions like "understand the system first"

---

## 5. Facts manifest, not read-once novel

Use a facts manifest, not a giant reading list.

Format:

    - <path> → extract: <specific symbols / columns / constraints>

If you cannot say what to extract from a file, that file probably does
not belong in the primer.

---

## 6. Scope fence rules

Use explicit path lists.

Primer must say:

- files allowed to change
- files forbidden to change
- legacy surfaces that must stay untouched

This matters more than background prose.

---

## 7. Report contract

Every dispatched task returns YAML in chat following
`.project/REPORT-SCHEMA.md`.

The report must be structured enough to verify:

- status
- files changed
- tests run
- failures or deviations
- next-ready note if relevant

Do not accept prose-only "done" messages.

---

## 8. Recommended task size

Best handoff size:

- one coherent task
- or one tightly related batch where scope and invariants overlap

Examples of good batching:

- T-B02 + T-B05
- one API router + its tests
- one view + the page that consumes it, if tightly coupled

Examples of bad batching:

- backend ingestion + unrelated UI work
- three tasks that touch different subsystems
- anything where success depends on unresolved design choices

---

## 9. Recovery

### Operator session ran out of context, diff still exists

Write a finisher primer:

- no new research
- only remaining steps
- same report path

### Returned report is red or deviated

Write `T-XXX-primer-v2.md`.

- cite the failed check
- state the correction
- keep original primer for audit trail

### Session ended mid-design

Do not create a fake primer.

Instead:

- update `TODO.md`
- append any new design locks to `DECISIONS.md`
- resume later from those files

---

## 10. Branch discipline

- All active Interwall work happens in:
  - `/Users/ottogen/interwall`
- All active Interwall work happens on:
  - `v2`
- Do not create, use, or recommend `.claude/worktrees/`
- Do not split operator work onto side branches

## 11. Practical guidance for this repo

- Stream B backend execution is a good handoff candidate.
- Stream C design prep is mostly a main-agent job.
- Large UI rebuilds should not be delegated until the main agent has
  narrowed the design enough that the operator is implementing,
  not inventing.

That is the line between useful delegation and expensive confusion.
