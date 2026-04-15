# Interwall — Primer & Report Exemplars

Worked examples for reference when drafting new primers and verifying
reports. NOT auto-imported; load when authoring either artifact.

---

## Exemplar primer — T-A05 retrofitted to PRIMER-TEMPLATE

Use this as the few-shot reference when drafting future primers. Shows
how the 8-section anatomy and the adversarial directive actually fill
out for a Tier 1 SQL/PLPGSQL task.

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

[Adversarial directive block here — see PRIMER-TEMPLATE]

### 6. Done report schema
Report MUST be YAML per .project/REPORT-SCHEMA.md. Prose will be
rejected.

### 7. Cold-rebuild survival declaration
Not required — task adds no deps, no loaded files, no registered routers.

### 8. Stop conditions
Pause after report. Do not begin T-A06.
----------------------------------------------------------------

---

## Exemplar report — T-A05 actual report, schemafied per REPORT-SCHEMA

    task_id: T-A05
    tier: 1
    status: done

    commits:
      - sha: 665be4e
        purpose: implementation
        paths:
          - apps/api/sql/08_process_bom_sale.sql
        message: "feat(backend): add process_bom_sale atomic sale function"
      - sha: 147f512
        purpose: test
        paths:
          - apps/api/tests/t_A05_process_bom_sale.sql
        message: "test(backend): 6 cases for process_bom_sale"
      - sha: 3b65501
        purpose: chore
        paths:
          - apps/api/sql/07_deduct_fifo_for_group.sql
        message: "chore(backend): commit T-A04 function that was uncommitted"
      - sha: df737aa
        purpose: doc
        paths:
          - CLAUDE.md
        message: "chore(repo): enforce test-commit discipline and document DB access"

    tests:
      file: apps/api/tests/t_A05_process_bom_sale.sql
      runner: "docker compose exec -T postgres psql -U interwall -d interwall -f /app/tests/t_A05_process_bom_sale.sql"
      cases_total: 6
      cases_passed: 6
      cases_failed: 0
      final_line: "T-A05 ALL TESTS PASSED"

    decisions_cited: [D-018, D-019, D-022, D-025, D-026, D-027, D-087]
    decisions_added: []
    decisions_challenged: []

    scope_boundary_checks:
      touched_legacy: false
      touched_adjacent_tasks: false
      introduced_runtime_deps: false
      introduced_test_deps: false
      files_outside_scope: []

    cold_rebuild_survival:
      verified: null                       # T-A05 added no deps, no new loaded files
      command: null
      result: null

    adversarial_review:
      - "Concurrent sales on the same item_group — deduct_fifo_for_group uses SELECT FOR UPDATE so strict serialization holds (D-021)."
      - "Floating-point drift in cogs computation — used NUMERIC throughout, no cast to DOUBLE PRECISION."
      - "Partially-successful multi-line sale — covered by Case 2; rollback verified."
      addressed:
        - none — all three were already handled by design

    protocol_deviations: []

    notes_to_human:
      - "T-A04 function was uncommitted until this session; committed as 3b65501."
      - "T-A04 test file remains at apps/api/sql/07_test_deduct_fifo.sql — pre-discipline location. Relocation tracked as cleanup before T-A06."

    next_ready: true
