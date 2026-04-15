# Interwall — Agent "Done" Report Schema

Every T-### task ends with a structured report. YAML format. Prose
reports are rejected; agent is asked to resubmit as schema.

Purpose: turn review from prose-parsing into diff-checking. Verifier
(human or script) confirms required fields are present and values are
green.

---

## Schema

    task_id: T-XXX                           # required, matches TODO.md
    tier: 1 | 2 | 3                          # required
    status: done | blocked | deviated        # required

    commits:
      - sha: <7-40 char git sha>
        purpose: implementation | test | doc | chore
        paths:
          - <repo-relative path>
        message: <first line of commit message>

    tests:                                     # one object OR array of objects
      # Single-test form (most tasks):
      file: <repo-relative path, or null if doc-only task>
      runner: <exact command to re-run>
      cases_total: <int>
      cases_passed: <int>
      cases_failed: <int>
      final_line: <literal final line of test output>
      # Array form (task produces multiple test files, e.g. SQL + pytest):
      # tests:
      #   - kind: sql
      #     file: apps/api/tests/t_XXX.sql
      #     runner: "docker compose exec -T postgres psql ..."
      #     cases_total: 4
      #     cases_passed: 4
      #     cases_failed: 0
      #     final_line: "T-XXX ALL TESTS PASSED"
      #   - kind: pytest
      #     file: apps/api/tests/t_XXX_router.py
      #     runner: "docker compose exec -T api python -m pytest ..."
      #     cases_total: 8
      #     cases_passed: 8
      #     cases_failed: 0
      #     final_line: "8 passed in 0.33s"
      # Aggregate rule: all cases_failed across all test entries must be 0.

    decisions_cited:
      - D-XXX                                # every D-### the primer named
    decisions_added:
      - id: D-XXX                            # new decisions drafted
        title: <one line>
        section: <which DECISIONS.md section>
        body: <full paste-ready entry>
    decisions_challenged:
      - id: D-XXX
        reason: <why agent thinks it conflicts with task reality>

    scope_boundary_checks:
      touched_legacy: true | false           # ean_compositions, process_sale, etc.
      touched_adjacent_tasks: true | false
      introduced_runtime_deps: true | false  # deps that land in a production image
      introduced_test_deps: true | false     # deps used only by test/lint tooling
      files_outside_scope: []                # list, empty on clean run

    cold_rebuild_survival:                   # required when task adds deps,
                                             # new SQL files, or new routers;
                                             # otherwise set all to null
      verified: true | false | null
      command: <exact command sequence that proved it, or null>
      result: <one-line outcome, or null>

    adversarial_review:
      - <bullet 1: failure mode considered>
      - <bullet 2: ...>
      - <bullet 3: ...>
      addressed:
        - <which bullets drove a code or test change, or "none">

    protocol_deviations: []                  # empty on clean run; each entry is
                                             # a short string naming what deviated
                                             # and why

    notes_to_human:                          # free-form, small; triage items
      - <e.g. "P-NEW: noticed X during Y, worth a parking-lot entry">

    next_ready: true | false                 # false blocks next task

---

## Verification rules

A report is ACCEPTED when:
- All required fields present and non-null
- `status == done`
- Sum of `cases_failed` across all test entries == 0
- `touched_legacy == false`
- `touched_adjacent_tasks == false`
- `files_outside_scope == []`
- `introduced_runtime_deps` / `introduced_test_deps` values match reality
  (reviewer spot-checks the diff — agent truthfulness is required, not verified)
- If the task added deps, new SQL files, or new routers:
  `cold_rebuild_survival.verified == true` with concrete command + result
- `protocol_deviations == []`
- `next_ready == true`
- Every commit SHA resolves on the working branch (human check)

A report is REJECTED when:
- Any required field missing → agent resubmits
- `touched_legacy` or `touched_adjacent_tasks` is `true` with no deviation
  entry → agent resubmits
- Any case failed → task is not done; agent fixes and re-reports
- Decisions added but no body → agent resubmits with full entries
- `cold_rebuild_survival` required but `verified != true` → agent runs
  the cold rebuild, captures output, resubmits

A report is DEVIATED when:
- Agent genuinely hit a blocker requiring a decision the primer didn't
  cover. `status: deviated`, `next_ready: false`. Goes back to human
  for decision entry, then primer is amended and re-run.

---

## Exemplar — T-A05 actual report, schemafied

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
