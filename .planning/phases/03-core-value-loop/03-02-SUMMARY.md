---
phase: 03-core-value-loop
plan: "02"
subsystem: api
tags: [fastapi, apscheduler, profit, fifo, stock-lots, fixed-costs, docker]

requires:
  - phase: 03-01
    provides: "email_poller package (poll_once, write_purchase, write_sale, parsers)"
  - phase: 01-foundation
    provides: "PostgreSQL schema (transactions, fixed_costs, stock_lots tables), db.py, auth.py"
provides:
  - "GET /api/fixed-costs and PUT /api/fixed-costs/{id} for cost config"
  - "GET /api/profit/summary, /valuation, /transactions for dashboard data"
  - "POST /api/stock-lots for manual purchase stock-IN"
  - "APScheduler email poller running every 60s in FastAPI lifespan"
  - "docker-compose.yml IMAP env vars for email poller"
affects: [03-03, frontend-wiring]

tech-stack:
  added: [APScheduler]
  patterns: [apscheduler-lifespan-integration, aggregation-router-pattern]

key-files:
  created:
    - apps/api/routers/fixed_costs.py
    - apps/api/routers/profit.py
    - apps/api/routers/stock_lots.py
  modified:
    - apps/api/main.py
    - docker-compose.yml

key-decisions:
  - "Transactions endpoint nested under /api/profit/transactions rather than separate /api/transactions router for simplicity"
  - "APScheduler BackgroundScheduler (threaded) with max_instances=1 and coalesce=True prevents overlapping polls"
  - "IMAP env vars default to empty string so container starts without crashing when not configured"

patterns-established:
  - "Aggregation router pattern: raw SQL with DATE_TRUNC and GROUP BY, returning RealDictRow lists"
  - "APScheduler lifespan pattern: scheduler.start() in yield-based lifespan, scheduler.shutdown(wait=False) on teardown"

requirements-completed: [MAIL-01, MAIL-04, PROF-01, PROF-02, PROF-03, PROF-04, PROF-05, PROF-06]

duration: 2min
completed: 2026-04-03
---

# Phase 03 Plan 02: API Routers + Email Poller Wiring Summary

**Three FastAPI routers (fixed_costs, profit, stock_lots) with APScheduler email poller integration and IMAP env var passthrough in docker-compose**

## Performance

- **Duration:** 2 min
- **Started:** 2026-04-03T13:48:31Z
- **Completed:** 2026-04-03T13:50:16Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Fixed costs CRUD endpoints (GET list, PUT update) for dashboard cost configuration
- Profit dashboard endpoints: summary by period/marketplace, stock valuation, transaction list with pagination
- Manual stock-IN endpoint via POST /api/stock-lots calling write_purchase from email_poller
- APScheduler BackgroundScheduler wired into FastAPI lifespan polling every 60s
- docker-compose.yml updated with IMAP env vars defaulting to empty for safe startup

## Task Commits

Each task was committed atomically:

1. **Task 1: New FastAPI routers** - `3aaa0a4` (feat)
2. **Task 2: Wire APScheduler + docker-compose** - `3ab8a15` (feat)

## Files Created/Modified
- `apps/api/routers/fixed_costs.py` - CRUD endpoints for fixed_costs table
- `apps/api/routers/profit.py` - Dashboard aggregation: profit summary + valuation + transactions list
- `apps/api/routers/stock_lots.py` - Manual stock-IN endpoint via write_purchase
- `apps/api/main.py` - APScheduler lifespan + three new routers registered
- `docker-compose.yml` - IMAP env vars added to api service

## Decisions Made
- Transactions endpoint nested under /api/profit/transactions rather than a separate router -- keeps related dashboard data co-located
- APScheduler BackgroundScheduler (threaded) chosen over AsyncIOScheduler since poll_once is synchronous
- IMAP env vars default to empty string so container starts without crashing when not configured; poller logs warning and skips

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None - psycopg2 not available locally for import verification, used AST parsing to confirm syntax correctness instead.

## User Setup Required
None - no external service configuration required. IMAP vars are optional and the poller gracefully degrades.

## Next Phase Readiness
- All profit dashboard API endpoints ready for frontend wiring (profit.js can now fetch from /api/profit/*)
- Email poller will start automatically when IMAP env vars are provided
- Manual stock-IN available for testing without email integration

---
*Phase: 03-core-value-loop*
*Completed: 2026-04-03*
