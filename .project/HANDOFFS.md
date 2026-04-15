# Interwall — Operator Packet Protocol

Use this when the coach prepares work for an external sequential
operator session.

This file defines the active protocol. The packet replaces ad-hoc chat
primers.

---

## 1. Purpose

The coach's job is to pre-digest context so the operator can spend its
context window on implementation, not repo archaeology.

The packet must:
- minimize operator reading
- fence scope tightly
- carry only the decisions and code facts needed for the task
- define exact tests and exact stop conditions

---

## 2. Sequential model

- One active operator packet at a time.
- No parallel operator runs.
- Coach prepares the next packet only after reviewing the previous
  packet's `REPORT.yaml` and diff.

---

## 3. Packet directory

Create one directory per task:

` .project/operator-runs/T-XXX/ `

Required files:
- `PLAN.md`
- `PROMPT.md`
- `REPORT.yaml`

Optional:
- `REVIEW.md` — only when the coach sends the operator back for a fix
- `ARTIFACTS.md` — only when the task produces a non-code artifact the
  coach wants to review directly

---

## 4. PLAN.md

`PLAN.md` is coach-authored and concise.

Keep it to:
1. task objective
2. in-scope files
3. out-of-scope files
4. exact symbols / seams to inspect
5. cherry-picked decision snippets
6. exact acceptance checks
7. exact test commands

Do not turn `PLAN.md` into a second `TODO.md` or `DECISIONS.md`.

---

## 5. PROMPT.md

`PROMPT.md` is the exact text the user pastes into the operator
session.

It should:
- point the operator at `CLAUDE.md`
- point the operator at this task's `PLAN.md`
- state the report file path
- explicitly forbid scope expansion
- explicitly forbid commits
- explicitly forbid reading broad planning docs unless the packet says
  so

The operator prompt should read like a command, not a conversation.

---

## 6. REPORT.yaml

The operator writes the report file defined by
`.project/REPORT-SCHEMA.md`.

Rules:
- file-based only; do not rely on chat summary
- one report per packet
- if blocked, the report still gets written
- if the task adds new tests, they belong in the source tree, not in
  the packet directory

---

## 7. Facts manifest rule

Every packet must include a facts manifest in `PLAN.md`.

Format:

    - <path> → extract: <specific symbols / constraints / fields>

Good:
- `inventory-interwall/frontend/profit.js` → extract:
  `recordSale.showEdit`, `recordSale.submit`, `profitEngine.mapApiTransaction`
- `apps/api/routers/profit.py` → extract:
  PATCH route semantics for sale transactions

Bad:
- "read DECISIONS.md"
- "understand the codebase first"
- "inspect the frontend"

---

## 8. Scope fence rules

Every packet must say:
- files allowed to change
- files forbidden to change
- legacy surfaces that must stay untouched
- whether a cold rebuild is required

Scope is the main anti-error mechanism.

---

## 9. Recovery

### Operator failed a check

Coach writes `REVIEW.md` with:
- failing check
- exact correction
- unchanged scope

Then coach updates `PROMPT.md` or creates `PROMPT-v2.md`.

### Operator got blocked on a real decision

The operator writes `status: deviated` in `REPORT.yaml`.

Coach then:
- decides the issue
- updates `DECISIONS.md` if needed
- revises the packet

---

## 10. Practical bias for this repo

- Coach should own planning, narrowing, and cross-system reasoning.
- Operators should own narrow implementation packets.
- UI packets must be especially distilled so the operator reads only the
  active runtime files, not duplicate or historical JS bundles.
