# Interwall — Primer Template

Every T-### task starts with a primer pasted into a fresh Claude Code
session. This file defines the canonical shape. Deviations from this
shape are themselves a protocol issue.

A good primer is specific, fenced, and self-contained. It never says
"see X.md" when it could paste the 3-line extract from X.md.

---

## Anatomy (8 sections, in order)

### 1. Context
One paragraph. What shipped immediately before, what's next, which tier.
No history lesson — just enough to orient a fresh agent.

### 2. Scope fence
Explicit in/out. Name the files the agent may modify. Name the files or
modules the agent may NOT touch. This is the anti-scope-creep lever.

### 3. Read-once manifest
Files to read AND facts to extract from each, pinned into a scratch
comment at the top of the working file. No re-reads.

Format:
    - <path> → extract: <specific columns / signatures / constants>
    - <path> → extract: <...>

### 4. Decision citations (inline)
Every D-### that constrains this task, with its one-line rationale
copied in. Agent does not navigate to DECISIONS.md — it reads the
primer and has everything.

Format:
    - D-022: process_bom_sale is single-transaction atomic; any RAISE
      rolls back the shell row, ledger, and deductions.
    - D-025: cogs and profit written once at sale time, never recomputed.
    - ...

### 5. Test plan
Enumerate 5-8 specific cases. Each with: pre-state, action, expected
post-state. Invariant-first wording preferred over example-first.

Format per case:
    Case N — <name>
    Pre: <seeded state>
    Act: <function call or operation>
    Post: <exact assertion, including invariants>

### 6. Done report schema
Reference REPORT-SCHEMA.md. State that the report MUST be YAML per
that schema. Prose reports are rejected.

### 7. Cold-rebuild survival declaration
Mandatory when the task touches ANY of:
- `apps/api/requirements.txt` (new runtime or test deps)
- `apps/api/Dockerfile` or `docker-compose.yml`
- A new SQL file under `apps/api/sql/` that must be loaded at DB init
  (i.e. not manually applied)
- A new router registered in `main.py`
- A new volume mount or bind mount

Primer MUST state:
- The EXACT command the agent will run to prove cold-rebuild survival,
  e.g. `docker compose down && docker compose build api && docker compose up -d && <re-run tests>`
- The expected result (all prior tests + new tests pass)
- Instruction to record both in `cold_rebuild_survival` block of the
  YAML report per REPORT-SCHEMA.md

Not applicable (leave the section with `not required — task adds no
deps, no loaded files, no registered routers`) when the task is pure
refactor, pure docs, or confined to files that never leave the host.

### 8. Stop conditions
Explicit line: "Pause after report. Do not begin T-<next>."
Name the next task by ID so the agent doesn't guess.

---

## Adversarial directive (paste verbatim into every primer)

Include this block exactly, in every primer, after section 5:

    Before submitting your report, write a 3-bullet "how would
    this fail in production" section. If any bullet names a real
    failure mode, address it in code or tests, then re-run.
    Include the 3 bullets in the report under adversarial_review.

---

## Worked example

A full retrofitted T-A05 primer lives in `.project/PRIMER-EXEMPLARS.md`
alongside the matching done-report. Load on demand when drafting a new
primer.
