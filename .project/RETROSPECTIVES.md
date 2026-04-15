# Interwall — Stream-End Retrospectives

Every stream ends with one retrospective session before the Tier 3
acceptance test. Purpose: patch PROCESS.md / PRIMER-TEMPLATE.md /
REPORT-SCHEMA.md based on what actually broke, not what we guessed
would break.

Format per entry: 4 sections, short.

---

## Template

    ### Stream <A|B|C> retrospective — YYYY-MM-DD

    Tasks covered: T-AXX through T-AYY

    What held
    - <protocol element that worked as designed>
    - <...>

    What broke
    - <friction, drift, defect class, near-miss>
    - <...>

    Patches landed
    - <file> — <what changed, which commit>
    - <...>

    New decisions
    - D-XXX — <title>

---

## Entries

### Stream A retrospective — 2026-04-15

Tasks covered: T-A00 through T-A09 (+ T-A03a, T-A07a, T-X06 through T-X08)

What held
- Three-tier gating. Tier 1 pauses for T-A04 and T-A05 caught zero
  correctness bugs — meaning the agents were well-primed — but the
  pause kept review discipline tight.
- Read-once manifest and D-### citations inline in primers. Agents
  did not re-read files mid-task. No evidence of drift from
  decisions during implementation.
- Adversarial self-review. T-A07's agent flagged its own test-harness
  fragility (httpx/pytest not persisted, tests not in image) in
  notes_to_human; this became T-A07a instead of shipping broken.
- REPORT-SCHEMA YAML. Reports became diff-checkable. Verification
  took seconds, not minutes.
- CLAUDE.md auto-imports. Fresh sessions loaded full state without
  re-priming.

What broke
- Test harness durability blind spot. T-A07 shipped code with tests
  that only passed in a transient container state (pip-installed
  deps, docker-cp'd test file). Cold rebuild broke them. Caught by
  post-rebuild verification, remediated as T-A07a. Root cause: no
  primer section asks "does this survive cold rebuild".
- REPORT-SCHEMA shape limit. T-A09 had two test files (SQL + router
  pytest). Agent duplicated the `tests:` key at same level — invalid
  YAML per schema. Schema currently assumes one test file per task.
- `introduced_new_deps` ambiguity. T-A07a added httpx / pytest /
  pytest-asyncio and marked the field false. Agent read "deps" as
  runtime-only. Field is underspecified.
- Migration-wiring blind spot. T-A09 added `10_v_health.sql` to disk
  but didn't verify it auto-loads on cold rebuild. Happened to work
  because the postgres volume persisted. A fresh volume would have
  broken the health router silently. Parallel to the T-A07 harness
  gap — tasks that add files outside the docker-entrypoint-initdb.d
  path need to declare and verify the load mechanism.
- Test runner drift. T-A09 report showed pytest final_line as
  `"8 passed, 1 warning in 0.36s"` instead of `T-A09 ALL TESTS PASSED`.
  PROCESS.md §2 requires a single-line pass assertion. pytest's
  summary line satisfies the spirit, not the letter.
- Port confusion near the finish line. External curl to `localhost/`
  hit the system nginx (Ubuntu), not the Docker stack (on 1441). Five
  minutes of false-alarm investigation. Not a code defect, but the
  port mapping is project-specific infra knowledge worth documenting.
- `introduced_new_deps` and `touched_legacy` pass/fail fields are
  trust-based. No agent-side or reviewer-side mechanism verifies them.
  A malicious or confused agent could lie. Out of scope for this
  retro to fully fix, but worth noting.

Patches landed
- `.project/REPORT-SCHEMA.md` — allow `tests:` as array OR object
  keyed by test kind; split `introduced_new_deps` into
  `introduced_runtime_deps` and `introduced_test_deps`. Commit TBD.
- `.project/PRIMER-TEMPLATE.md` — new section §8 "Cold-rebuild
  survival declaration"; mandatory for any task adding deps, new
  SQL files, new routers, or new volumes. Commit TBD.
- `.project/PROCESS.md` — new §11 "Post-merge cold-rebuild
  sanity check"; mandatory reviewer-side step for any task that
  touches requirements.txt, Dockerfile, docker-compose.yml, or
  apps/api/sql/ (new files). Commit TBD.
- `CLAUDE.md` — under Dev commands, note the port 1441 vs system
  nginx split. Commit TBD.
- pytest final_line drift: not patched — acceptable as-is. The
  `cases_passed / cases_failed / cases_total` fields are
  authoritative; `final_line` is diagnostic.

New decisions
- none (all patches are to existing process files, not decisions)

Open for Stream B retro
- Consider adding a post-commit CI hook that runs the cold-rebuild
  check automatically when `requirements.txt` or `docker-compose.yml`
  change. Too much ceremony for Stream A volume, maybe worth it at
  Stream C volume.
- Consider an agent-side hard check: before reporting done, run
  `docker compose down && up -d && re-run tests`. Catches the
  T-A07 class at source. Cost: every Tier 2 task adds ~30s
  rebuild time. Decide at Stream B retro with real data.
