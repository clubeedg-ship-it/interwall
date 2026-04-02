# Phase 1: Foundation - Context

**Gathered:** 2026-04-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver a working PostgreSQL database with the MVP schema, atomic business logic as DB functions, a FastAPI REST API, and a simplified Docker Compose stack that replaces InvenTree entirely. After this phase, the backend is ready for frontend wiring and email service integration.

</domain>

<decisions>
## Implementation Decisions

### Database Hosting
- **D-01:** Self-hosted PostgreSQL 15 in Docker (fresh container, new volume, new database name). No Supabase.
- **D-02:** Fresh `docker-compose.yml` — no InvenTree, Celery, or Redis containers. Clean slate.

### API Layer
- **D-03:** FastAPI (Python) as the REST API between frontend and PostgreSQL. No Node.js, no PostgREST, no Supabase client.
- **D-04:** Single container runs both FastAPI (HTTP server) and the email poller (background thread/scheduler). One Python process.
- **D-05:** Frontend calls API via nginx reverse proxy at `/api/` (same pattern as current InvenTree setup). No CORS needed.
- **D-06:** Python email service connects directly to PostgreSQL via psycopg2 (same process as FastAPI, shared connection pool).

### Business Logic Location
- **D-07:** FIFO stock deduction implemented as PostgreSQL function with SELECT FOR UPDATE. Called from both API and email service via RPC. Atomic by nature.
- **D-08:** EAN composition resolution as PostgreSQL function.
- **D-09:** Sale processing workflow as PostgreSQL function (resolve composition → deduct FIFO → compute COGS → record transaction).

### Schema Strategy
- **D-10:** Fresh schema from scratch based on SPECS-MVP.md data model. Do NOT reuse greenfield Supabase migrations. No multi-tenant, no RLS, no organizations/memberships.

### Auth Strategy
- **D-11:** Simple username/password login. Password hashed in DB. FastAPI session cookie (httpOnly). Login page. Single user.

### Claude's Discretion
- Migration tooling (Alembic vs raw SQL) — pick what's simplest for MVP
- Docker Compose port assignments — use sensible defaults
- FastAPI project structure — follow standard Python project layout
- Email poller integration method (background thread, APScheduler, etc.)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Specifications
- `SPECS-MVP.md` — Authoritative MVP scope, data model, acceptance criteria
- `.planning/PROJECT.md` — Project context, constraints, key decisions
- `.planning/REQUIREMENTS.md` — v1 requirements with REQ-IDs (DB-01 through DB-05, INFRA-01 through INFRA-03)

### Research
- `.planning/research/STACK.md` — Stack recommendations (note: Supabase was recommended but user chose self-hosted + FastAPI instead)
- `.planning/research/ARCHITECTURE.md` — Architecture patterns, data flow diagrams
- `.planning/research/PITFALLS.md` — Critical pitfalls (P1: FIFO race condition, P4: schema mismatch, P5: circular EAN refs, P9: auth gap)

### Legacy Reference (read-only, do not reuse code)
- `inventory-omiximo/docker-compose.yml` — Current InvenTree Docker stack (being replaced)
- `inventory-omiximo/frontend/nginx.conf` — Current nginx proxy config (pattern to preserve)
- `omiximo-email-automation/src/inventory/stock_manager.py` — Existing FIFO deduction logic (reference for DB function)
- `omiximo-email-automation/src/config_api.py` — Existing config API (being replaced by FastAPI endpoints)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `inventory-omiximo/frontend/nginx.conf` — Proxy pattern for `/api/` → backend. Adapt to point to FastAPI instead of InvenTree.
- `omiximo-email-automation/src/` — Email parsers, stock manager, FIFO logic. Will be integrated into the single Python container in Phase 3.

### Established Patterns
- nginx reverse proxy fronts everything on port 1441
- `/api/` prefix for all backend calls
- Token-based auth in `Authorization` header (will change to session cookie)
- Docker Compose with named volumes for data persistence

### Integration Points
- Frontend `api.request()` calls will eventually target FastAPI endpoints (Phase 2 work)
- Email service stock writes will call the same PostgreSQL functions the API exposes
- Docker network connects all containers

</code_context>

<specifics>
## Specific Ideas

- Keep everything Python — API and email service in one language, one container
- PostgreSQL functions for all atomic business logic (FIFO, compositions, sales)
- nginx proxy preserved as the frontend→API gateway

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-foundation*
*Context gathered: 2026-04-02*
