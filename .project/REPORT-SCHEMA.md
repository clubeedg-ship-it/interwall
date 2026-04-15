# Interwall — Operator Report Schema

Every operator run writes one YAML file:

` .project/operator-runs/T-XXX/REPORT.yaml `

The report is for coach review. It is intentionally smaller than the
old chat report shape.

---

## Schema

    task_id: T-XXX
    status: done | blocked | deviated

    summary: |
      1-4 short lines describing what changed.

    files_changed:
      - <repo-relative path>

    tests:
      - file: <repo-relative path or null>
        runner: <exact command>
        result: pass | fail | not_run
        final_line: <literal final output line or short outcome>

    decisions_cited:
      - D-XXX

    scope_check:
      touched_out_of_scope: true | false
      touched_legacy: true | false
      new_dependencies: none | runtime | test

    cold_rebuild:
      required: true | false
      command: <exact command or null>
      result: <short outcome or null>

    adversarial_review:
      - <failure mode 1>
      - <failure mode 2>
      - <failure mode 3>

    open_questions:
      - <optional, short>

    next_ready: true | false

---

## Rules

- `status: done` requires every listed test result to be `pass`
- `touched_out_of_scope` must be `false` unless `status: deviated`
- `touched_legacy` must be `false` unless the packet explicitly allowed
  it
- `new_dependencies` must match reality
- if `cold_rebuild.required` is `true`, the command and result must be
  filled in
- if the operator is blocked, write the report anyway

---

## Coach acceptance checklist

Accept only when:
- report file exists
- diff matches the packet scope
- listed tests are green
- any required cold rebuild is green
- `next_ready` is true

Reject and rewrite packet when:
- report is missing required fields
- operator widened scope
- tests are missing or failed
- the report hides an unresolved design choice
