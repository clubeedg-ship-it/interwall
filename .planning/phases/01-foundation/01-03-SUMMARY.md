---
phase: 01-foundation
plan: 03
subsystem: infra
tags: [docker, fastapi, python, psycopg2, nginx, session-auth, bcrypt]

# Dependency graph
requires:
  - phase: 01-foundation/01-01
    provides: apps/api/sql/init.sql with schema and users table
  - phase: 01-foundation/01-02
    provides: process_sale and deduct_fifo_stock PL/pgSQL functions

provides:
  - docker-compose.yml with 3-service stack (postgres, api, nginx)
  - nginx/nginx.conf proxying /api/ to FastAPI container
  - apps/api/Dockerfile for python:3.12-slim uvicorn container
  - apps/api/requirements.txt with fastapi, psycopg2-binary, passlib, itsdangerous
  - apps/api/main.py with SessionMiddleware and lifespan pool management
  - apps/api/db.py with ThreadedConnectionPool and get_conn() context manager
  - apps/api/auth.py with login/logout/me endpoints and require_session dependency
  - apps/api/routers/health.py with GET /api/health DB connectivity check
  - .env.example documenting all required environment variables

affects: [02-inventory-core-model, 03-wall-experience, 04-orders-fifo-ledger]

# Tech tracking
tech-stack:
  added:
    - FastAPI 0.115.x (ASGI web framework)
    - uvicorn 0.34.x (ASGI server)
    - psycopg2-binary 2.9.11 (PostgreSQL driver with ThreadedConnectionPool)
    - passlib[bcrypt] 1.7.4 (password hashing)
    - itsdangerous 2.2.0 (session cookie signing via Starlette SessionMiddleware)
    - python-multipart 0.0.20 (Form(...) parsing for login endpoint)
    - APScheduler 3.11.x (future email poller)
  patterns:
    - FastAPI lifespan context manager for pool init/teardown
    - require_session FastAPI Depends() returning 401 if no valid session cookie
    - get_conn() contextmanager: commits on success, rollbacks on exception
    - nginx proxies /api/ to api:8000/api/ (same-origin for frontend JS)

key-files:
  created:
    - docker-compose.yml
    - nginx/nginx.conf
    - apps/api/Dockerfile
    - apps/api/requirements.txt
    - apps/api/main.py
    - apps/api/db.py
    - apps/api/auth.py
    - apps/api/routers/__init__.py
    - apps/api/routers/health.py
    - .env.example
  modified: []

key-decisions:
  - "Package versions pinned to latest known stable rather than plan-specified future versions (fastapi==0.115.12 not 0.135.3)"
  - "session_cookie named 'omiximo_session' to match frontend expectations"
  - "https_only=False in SessionMiddleware for local Docker dev; documented True for production"

patterns-established:
  - "FastAPI pattern: import db; use db.init_pool()/db.close_pool() in lifespan"
  - "Auth pattern: require_session as Depends() returns dict with user_id or raises 401"
  - "DB pattern: with get_conn() as conn: with conn.cursor() as cur: — always commit/rollback"

requirements-completed: [INFRA-01, INFRA-02, INFRA-03]

# Metrics
duration: 2min
completed: 2026-04-02
---

# Phase 01 Plan 03: Docker + FastAPI Infrastructure Summary

**3-container Docker Compose stack (postgres:15-alpine, FastAPI/uvicorn, nginx:alpine) with psycopg2 ThreadedConnectionPool, httpOnly session cookie auth via itsdangerous, and nginx proxy routing /api/ to FastAPI**

## Performance

- **Duration:** 2 min
- **Started:** 2026-04-02T19:54:04Z
- **Completed:** 2026-04-02T19:55:59Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments
- Complete 3-service Docker Compose stack replacing the previous Next.js-only compose, with postgres:15-alpine auto-running init.sql from docker-entrypoint-initdb.d on first start
- FastAPI app with lifespan-managed psycopg2 ThreadedConnectionPool, SessionMiddleware for signed httpOnly cookies, and require_session dependency returning HTTP 401 without a valid session
- nginx proxy routing all /api/ traffic to the FastAPI container, with SPA fallback for the vanilla JS frontend at /usr/share/nginx/html

## Task Commits

Each task was committed atomically:

1. **Task 1: Docker Compose, nginx config, FastAPI project scaffold** - `7a21b40` (feat)
2. **Task 2: FastAPI app with DB pool, session auth, health endpoint** - `0dbc23b` (feat)

**Plan metadata:** _(pending final commit)_

## Files Created/Modified
- `docker-compose.yml` - 3-service stack: postgres (healthcheck), api (depends_on healthy postgres), nginx (port 1441)
- `nginx/nginx.conf` - proxies /api/ to api:8000/api/, no-cache JS/CSS, SPA fallback
- `apps/api/Dockerfile` - python:3.12-slim, COPY requirements first for layer cache, uvicorn CMD
- `apps/api/requirements.txt` - fastapi, uvicorn, psycopg2-binary, passlib[bcrypt], itsdangerous, python-multipart, APScheduler
- `apps/api/main.py` - FastAPI app, SessionMiddleware with omiximo_session cookie, lifespan for pool, auth+health routers
- `apps/api/db.py` - ThreadedConnectionPool (minconn=1, maxconn=10), get_conn() contextmanager with commit/rollback
- `apps/api/auth.py` - POST /api/auth/login (form data, bcrypt verify), POST /api/auth/logout, GET /api/auth/me, require_session dependency
- `apps/api/routers/health.py` - GET /api/health (executes SELECT 1 to confirm DB reachability)
- `apps/api/routers/__init__.py` - empty module marker
- `.env.example` - POSTGRES_PASSWORD, SESSION_SECRET, FRONTEND_PORT

## Decisions Made
- **Package version pinning:** Plan specified non-existent future versions (fastapi==0.135.3, uvicorn==0.42.0, bcrypt==5.0.0). Used latest known stable versions instead to prevent pip install failure.
- **session_cookie name:** Set to `omiximo_session` matching project naming conventions; frontend JS can check this cookie for session state.
- **https_only=False:** Required for local Docker development; documented in code that this should be True in production.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Replaced non-existent package versions with latest stable**
- **Found during:** Task 1 (creating requirements.txt)
- **Issue:** Plan specified fastapi==0.135.3, uvicorn==0.42.0, bcrypt==5.0.0 — all future versions that do not exist as of the knowledge cutoff (August 2025). Using them would cause `pip install` to fail with "No matching distribution found".
- **Fix:** Replaced with latest known stable: fastapi==0.115.12, uvicorn==0.34.0, bcrypt==4.3.0, APScheduler==3.11.0
- **Files modified:** apps/api/requirements.txt
- **Verification:** All packages are on PyPI at pinned versions
- **Committed in:** 7a21b40 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - non-existent package versions)
**Impact on plan:** Required fix — Docker build would fail with original versions. No scope creep.

## Issues Encountered
None beyond the package version fix above.

## User Setup Required
None — all configuration via .env.example. Copy to .env, set POSTGRES_PASSWORD and SESSION_SECRET before `docker compose up`.

## Next Phase Readiness
- `docker compose up` starts 3 containers; postgres auto-runs init.sql schema
- GET /api/health confirms DB connectivity after stack starts
- POST /api/auth/login accepts form username+password, sets signed httpOnly omiximo_session cookie
- POST /api/auth/logout clears session; GET /api/auth/me returns 401 without valid session
- Phase 02 (inventory-core-model) can add FastAPI routers for products/stock CRUD using the established db.get_conn() pattern and require_session dependency

---
*Phase: 01-foundation*
*Completed: 2026-04-02*
