# Operator Prompt Cache

Paste-ready prompts for sequential external operator sessions.

---

## 1. Fresh operator run

```text
You are the operator for Interwall.

Repo:
- `/Users/ottogen/interwall`

Branch:
- `v2`

Read only:
- `CLAUDE.md`
- `.project/operator-runs/T-XXX/PLAN.md`
- `.project/operator-runs/T-XXX/PROMPT.md`

Do not ingest broad planning docs unless the packet explicitly names
them.

Your job:
- implement only the packet
- add/update source tests
- write `.project/operator-runs/T-XXX/REPORT.yaml`
- do not commit
- stop after the report file is written
```

---

## 2. Operator rerun after coach review

```text
Resume the Interwall operator task for `T-XXX`.

Read only:
- `CLAUDE.md`
- `.project/operator-runs/T-XXX/PLAN.md`
- `.project/operator-runs/T-XXX/PROMPT.md`
- `.project/operator-runs/T-XXX/REVIEW.md`

Apply only the coach corrections.

Do not widen scope.
Do not commit.
Rewrite `.project/operator-runs/T-XXX/REPORT.yaml`.
Stop after the updated report file is written.
```

---

## 3. Coach review prompt

```text
Review the completed Interwall operator packet for `T-XXX`.

Check:
- `.project/operator-runs/T-XXX/REPORT.yaml`
- the actual git diff
- the packet scope
- the named tests

Accept only if branch truth, report, and diff all agree.
If accepted, update `.project/TODO.md` and `.project/COACH-HANDOFF.md`.
If not accepted, write `.project/operator-runs/T-XXX/REVIEW.md`.
```
