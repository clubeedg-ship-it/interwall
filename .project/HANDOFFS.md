# Reports ledger

## 2026-04-16

- scope: orchestration protocol cleanup
- landed:
  - `AGENTS.md` compressed into the main summarized operating file
  - `CLAUDE.md` reduced to a tiny runtime note
  - `.project/COACH-HANDOFF.md` reduced to pure current state
- verified:
  - stable rules, active state, and summaries are separated cleanly
- open_risks:
  - ledger-write policy is still unresolved
  - old external operator packet artifacts still exist in `.project/operator-runs/`
- next:
  - handle `T-C10`, then move to `T-C08` or the ledger decision

## 2026-04-16

- scope: `T-D05` sale-routing audit
- landed:
  - `.project/T-D05-SALE-ROUTING-AUDIT.md`
  - `apps/api/tests/t_D05_sale_routing_audit.py`
  - `D-105` clarifying that `process_sale()` is SQL-only migration compatibility, not a live Python/runtime sale path
- verified:
  - `docker compose exec -T api python -m pytest /app/tests/t_D05_sale_routing_audit.py -q`
  - `docker compose exec -T api python -m pytest /app/tests/t_A08_poller_routing.py -q`
  - `rg -n "process_sale\\(" apps/api` showed only SQL definition/migration commentary
- open_risks:
  - `T-D04` live overlap proof still needs real traffic
  - broader ingestion suites on the live dev stack can contend with the running scheduler/background jobs
- next:
  - run the real `T-D04` overlap window
  - then move to `T-D06` production soak / release signoff

## 2026-04-16

- scope: execution mode / handoff refresh
- landed:
  - `.project/COACH-HANDOFF.md` now records the user's current preference for end-to-end bounded backend packets with proof bundles
- verified:
  - current handoff, reports ledger, and TODO backend phases agree that `T-D04` is the next backend gate and `T-D05` is closed
- open_risks:
  - `T-D04` still depends on real overlap traffic, not local synthetic evidence
- next:
  - keep closing backend packets end-to-end; next real target is the live `T-D04` overlap window
