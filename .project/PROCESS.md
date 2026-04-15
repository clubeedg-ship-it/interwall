# Interwall — Process & Gating Protocol

This file is the durable reference for HOW work gets done on this project.
PLAN.md = direction. DECISIONS.md = history. TODO.md = next actions.
PROCESS.md (this file) = protocol.

Sibling files:
- PRIMER-TEMPLATE.md — canonical primer shape for every T-### task
- REPORT-SCHEMA.md — exact shape of the "done" report an agent returns
- RETROSPECTIVES.md — end-of-stream protocol reviews

---

## 1. Gating tiers

Every task in TODO.md is one of three tiers. Tier is assigned when the task
is written, not when it's executed.

### Tier 1 — Manual gate
- Applies to: foundational schema, correctness-critical PL/pgSQL, data
  migrations, anything mutating production-equivalent data, anything with
  money implications (COGS, profit, VAT, commission).
- One task per session. Fresh Claude Code session each time.
- Agent pauses after report. Human reviews against the Tier 1 checklist
  (§6) before approving next action.
- Examples so far: T-A00, T-A01, T-A03, T-A04, T-A05.

### Tier 2 — Test-script gate
- Applies to: well-defined tasks with clear invariants — API routers,
  views, backfills with green baselines, ingestion scaffolding.
- Can batch 2-3 related tasks per session if invariants don't overlap.
- Agent pastes only the structured report (per REPORT-SCHEMA.md).
- Auto-proceeds to next Tier 2 task within the session on green.
- Stops and reports on first red.

### Tier 3 — Milestone acceptance
- Applies to: end-of-stream go/no-go gates.
- One session, end-to-end scenario. Seeded realistic data, no shortcuts.
- Blocks advancement to the next stream until green.

---

## 2. Test & commit discipline

Every T-### task's "done" requires three committed artifacts on the
working branch:

1. Implementation file(s) under the appropriate source tree
   (apps/api/sql/, apps/api/, inventory-interwall/frontend/)
2. Test file at apps/api/tests/t_<TaskID>_<slug>.{sql,py,spec.ts}
   - SQL tests wrap in BEGIN/ROLLBACK so they leave no side effects
   - Final line must print '<TaskID> ALL TESTS PASSED' or equivalent
   - Must be runnable standalone with one docker compose exec command
3. Both pushed to the working branch before reporting "done"

Inline psql runs do not count. Transient tests are invisible to future
sessions and to the reviewer.

The "done" report MUST conform to REPORT-SCHEMA.md. Prose reports are
rejected; agent is asked to resubmit as schema.

---

## 3. Read-once rule

Agents waste tool calls re-reading files they already opened. Every primer
includes a read-once manifest (see PRIMER-TEMPLATE.md §3). Rules:

- On first read, the agent extracts the specific facts named in the
  manifest into a scratch comment at the top of its working file.
- Re-reads are forbidden unless a specific failure requires re-checking
  a file that may have changed since first read.
- If the agent finds itself reaching for Read/Grep to "double-check"
  something, the rule is: either it's in the scratch comment already
  (scroll up), or it's a gap in the primer (report the gap, do not
  silently expand scope).

---

## 4. Database access

DB name: interwall. User: interwall (no superuser postgres role on this
instance).

Shell:
    docker compose exec -T postgres psql -U interwall -d interwall

Run a SQL file (mounted at /app/ in the api/postgres containers):
    docker compose exec -T postgres psql -U interwall -d interwall \
      -f /app/path/inside/container.sql

Host paths:
- apps/api/sql/ → container /app/sql/
- apps/api/tests/ → container /app/tests/

---

## 5. Scope boundary rules

Every primer names explicit in/out scope (see PRIMER-TEMPLATE.md §2).
Agents must:

- Not modify files outside the declared scope.
- Not introduce new dependencies, libraries, or config without a
  D-### entry drafted for DECISIONS.md.
- Not touch legacy structures in migration window
  (ean_compositions, process_sale, deduct_fifo_stock, sku_aliases reads).
- Report any scope-adjacent discovery as a note for the human to
  triage into TODO.md or DECISIONS.md — never silently expand.

Scope violations are protocol deviations (see REPORT-SCHEMA.md).

---

## 6. Tier 1 review checklist

Use this when reviewing a Tier 1 agent's pre-execution or post-execution
output. Nine rows, each pass/fail/uncertain.

1. Idempotency — IF NOT EXISTS / IF EXISTS / ON CONFLICT throughout
2. Forward-compat columns — present but unwired where specified
3. Indexes — all from the audit present with correct shape
4. Views over stored computeds — no booleans that can drift
5. Foreign keys — complete, especially on new cross-table columns
6. NULL handling — three-valued logic traps in views + CHECK
7. CHECK constraints — on enum-like fields, signed-quantity fields
8. Legacy untouched — ean_compositions, process_sale,
   deduct_fifo_stock, sku_aliases writes handled per D-010 / D-019
9. Scope respected — nothing smuggled in from adjacent tasks

Any "uncertain" row is treated as fail until resolved.

---

## 7. Adversarial self-review (agent side)

Every primer includes this directive:

    Before submitting your "done" report, write a 3-bullet
    "how would this fail in production" section. If any bullet
    names a real failure mode, address it in code or tests,
    then re-run. Include the 3 bullets in the report under
    adversarial_review.

This is chain-of-verification applied mechanically. Catches silent bugs
before review.

---

## 8. Session boundaries

- One task per session for Tier 1.
- Two to three Tier 2 tasks max per session, only if declared scopes
  do not overlap.
- 60% context watchline: stop adding new work, flush state into
  TODO/DECISIONS via draft entries, either /compact or close.
- Every fresh session auto-loads CLAUDE.md and .project/*.md — do not
  paste those in primers. Reference by path.
- Handoff between sessions: TODO.md "Now" section carries the next
  primer's pointer; last report's `next_ready` and `notes_to_human`
  fields drive the handoff.

---

## 9. Decision drift control

- Every new architectural choice gets a D-### entry before code lands.
- Decisions are append-only. Reversals create a new D-### that cites
  the superseded entry.
- If a primer cites a D-### that turns out wrong during execution, the
  agent STOPS, reports via the `decisions_challenged` field, and waits
  for human to append a new D-### or approve the deviation.

---

## 10. Protocol evolution

Every end-of-stream retrospective (see RETROSPECTIVES.md) may patch
PROCESS.md, PRIMER-TEMPLATE.md, or REPORT-SCHEMA.md. Patches:

- Land as their own commit with message:
  'chore(process): <what and why>'
- Get a D-### entry under "Process & planning" when the change is
  non-trivial (not a typo fix).
- Take effect for all tasks started AFTER the patch commit, not
  retroactively.
