---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
stopped_at: Completed 03-02-PLAN.md
last_updated: "2026-04-03T13:51:07.459Z"
last_activity: 2026-04-03
progress:
  total_phases: 4
  completed_phases: 2
  total_plans: 9
  completed_plans: 8
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-02)

**Core value:** When a sale email arrives, the system auto-deducts component stock via EAN compositions, computes FIFO-based profit including fixed costs, and records everything durably in the database — no manual intervention, no browser cache dependency.
**Current focus:** Phase 03 — core-value-loop

## Current Position

Phase: 03 (core-value-loop) — EXECUTING
Plan: 2 of 3
Status: Ready to execute
Last activity: 2026-04-03

Progress: [░░░░░░░░░░] 0%

## Performance Metrics

**Velocity:**

- Total plans completed: 0
- Average duration: —
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

**Recent Trend:**

- Last 5 plans: —
- Trend: —

*Updated after each plan completion*
| Phase 01-foundation P01 | 5 | 1 tasks | 1 files |
| Phase 01-foundation P02 | 3 | 2 tasks | 1 files |
| Phase 01-foundation P03 | 2 | 2 tasks | 10 files |
| Phase 02-frontend-wiring P02 | 1 | 2 tasks | 3 files |
| Phase 02-frontend-wiring P01 | 60 | 2 tasks | 20 files |
| Phase 02-frontend-wiring P03 | 156 | 2 tasks | 5 files |
| Phase 03 P02 | 2 | 2 tasks | 5 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Init: Keep vanilla JS frontend — only touch localStorage→DB wiring, XSS fixes, code organization
- Init: Supabase client direct (CDN) for CRUD; PostgreSQL RPC functions for atomic ops (FIFO, sale processing)
- Init: Python email service kept, rewired from InvenTree API to direct PostgreSQL writes
- [Phase 01-foundation]: UUID primary keys on all tables using gen_random_uuid() from pgcrypto extension
- [Phase 01-foundation]: ean_compositions uses TEXT FK to products.ean for EAN-driven composition resolution without joins
- [Phase 01-foundation]: Plain FOR UPDATE (not SKIP LOCKED) in deduct_fifo_stock for strict FIFO serialization
- [Phase 01-foundation]: COGS computed from lot unit_costs pre-deduction in process_sale for accuracy
- [Phase 01-foundation]: Package versions pinned to latest known stable rather than plan-specified future versions (fastapi==0.115.12)
- [Phase 01-foundation]: require_session as FastAPI Depends() pattern established for all protected endpoints
- [Phase 02-frontend-wiring]: RealDictCursor in db.py returns dicts natively — no tuple-to-dict conversion needed in routers
- [Phase 02-frontend-wiring]: Full-replace PUT pattern for compositions: DELETE all rows then INSERT new set in one transaction
- [Phase 02-frontend-wiring]: bin-modal.js kept separate (not merged into wall.js) because merge would exceed 500-line limit
- [Phase 02-frontend-wiring]: catalog split at categoryManager boundary: catalog-core.js (catalog) + catalog-detail.js (categoryManager, batchDetail, batchEditor)
- [Phase 02-frontend-wiring]: sanitize() XSS utility added to config.js using createTextNode pattern; applied to 6+ XSS vectors in wall.js, catalog-core.js, ui.js, auth.js
- [Phase 02-frontend-wiring]: auth.getHeaders() kept as legacy shim for tenant.js compatibility — returns only Content-Type/Accept (no Authorization)
- [Phase 02-frontend-wiring]: api.request() surfaces FastAPI detail message on 4xx for meaningful error toasts in compositions CRUD
- [Phase 03]: Transactions endpoint nested under /api/profit/transactions for co-location with dashboard data
- [Phase 03]: APScheduler BackgroundScheduler (threaded) with max_instances=1 for sync poll_once; IMAP vars default empty for safe startup

### Pending Todos

None yet.

### Blockers/Concerns

- Open: Supabase hosted vs self-hosted — must decide before Phase 1 plan execution
- Open: Thin REST API vs Supabase direct browser client — affects Phase 2 wiring approach

## Session Continuity

Last session: 2026-04-03T13:51:07.457Z
Stopped at: Completed 03-02-PLAN.md
Resume file: None
