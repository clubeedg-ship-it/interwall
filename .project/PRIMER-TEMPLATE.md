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

## Exemplar primer — T-A05 retrofitted to template

Use this as the few-shot reference when drafting future primers.

----------------------------------------------------------------
### 1. Context
Resuming Interwall rebuild. T-A01 through T-A04 landed on v2. Next:
T-A05 (process_bom_sale). Tier 1 gate. Fresh session.

### 2. Scope fence
You WILL modify:
- apps/api/sql/08_process_bom_sale.sql (new file)
- apps/api/tests/t_A05_process_bom_sale.sql (new file)
You WILL NOT touch:
- Any legacy path (process_sale, ean_compositions, deduct_fifo_stock)
- Any file under apps/api/email_poller/ or inventory-interwall/
- Any schema DDL — schema is frozen until T-A06

### 3. Read-once manifest
- apps/api/sql/init.sql → extract: transactions columns (id,
  marketplace, order_ref, build_code, cogs, profit, sale_price,
  source_id, created_at), stock_ledger_entries columns (all),
  fixed_costs columns, vat_rates columns, builds + build_components
  shapes including valid_from/valid_to.
- apps/api/sql/07_deduct_fifo_for_group.sql → extract: function
  signature and exact return TABLE shape.
- .project/DECISIONS.md → already cited inline below; do not re-open.

### 4. Decision citations
- D-018: every sellable product has a build, including trivial singletons.
- D-019: external_item_xref is the single xref; sku_aliases is read-only
  during migration.
- D-022: single transaction atomic; RAISE rolls back everything.
- D-025: cogs and profit written once, never recomputed.
- D-026: transactions.type stays 'sale'; build_code distinguishes path.
- D-027: RAISE on missing vat_rates — no silent 21% default.
- D-087: components filtered by valid_from <= NOW() AND valid_to > NOW().

### 5. Test plan
Case 1 — Happy path
Pre: seed 1 build with 2 component lines, both groups stocked.
Act: call process_bom_sale with matching marketplace + quantity.
Post: one transaction row with correct cogs and profit; one
stock_ledger_entries row per lot consumed; stock_lots.quantity
decremented by exact amounts.

Case 2 — Stock-out rollback
Pre: same seed, but line 2's group is short.
Act: call process_bom_sale.
Post: RAISE. Zero transaction rows for this order_ref. Zero
ledger rows. stock_lots unchanged.

Case 3 — Missing vat_rates
Pre: delete vat_rates row for the test marketplace.
Act: call process_bom_sale.
Post: RAISE with 'missing vat_rates' in message. Full rollback.

Case 4 — valid_to filter
Pre: UPDATE one build_components row to valid_to = NOW() - INTERVAL '1 day'.
Act: call process_bom_sale for that build.
Post: expired component is skipped OR RAISE on insufficient components
(document which behavior was chosen and why).

Case 5 — Multi-lot consumption
Pre: line spans 2 stock_lots at different unit_costs.
Act: call process_bom_sale.
Post: 2 ledger rows, correct qty splits, per-lot unit_cost preserved,
cogs = sum(qty_delta * unit_cost) exactly.

Case 6 — Trivial auto-generated build (D-018)
Pre: a product with is_auto_generated = TRUE build from T-A03.
Act: call process_bom_sale.
Post: full sale completes; ledger row written; cogs non-zero.

Invariant (must hold after every Case 1, 5, 6):
    SUM(ledger.qty_delta * ledger.unit_cost) WHERE txn_id = X
    == transactions.cogs WHERE id = X

[Adversarial directive block here — see §above]

### 6. Done report schema
Report MUST be YAML per .project/REPORT-SCHEMA.md. Prose will be
rejected.

### 7. Stop conditions
Pause after report. Do not begin T-A06.
----------------------------------------------------------------
