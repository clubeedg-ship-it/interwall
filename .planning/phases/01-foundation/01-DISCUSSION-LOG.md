# Phase 1: Foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-02
**Phase:** 01-foundation
**Areas discussed:** Database hosting, Greenfield schema reuse, API layer approach, Auth strategy

---

## Database Hosting

| Option | Description | Selected |
|--------|-------------|----------|
| Supabase hosted (Recommended) | Free tier, managed PostgreSQL, built-in auth + PostgREST + JS client | |
| Self-hosted PostgreSQL | Docker Compose with postgres:15-alpine. Full control. | ✓ |
| Reuse InvenTree's PostgreSQL | Keep existing container, drop InvenTree tables | |

**User's choice:** Self-hosted PostgreSQL
**Notes:** None

### Follow-up: Fresh vs reuse container

| Option | Description | Selected |
|--------|-------------|----------|
| Fresh container | Clean docker-compose, new volume, new DB name | ✓ |
| Reuse existing container | Keep inventree-db, create new database alongside | |

**User's choice:** Fresh container

### Follow-up: Frontend API layer

| Option | Description | Selected |
|--------|-------------|----------|
| Express/Fastify in Node.js | Thin REST API in JS | |
| FastAPI in Python | Keep everything Python — API + email service share codebase | ✓ |
| Nginx + PostgREST | Auto-generates REST from schema | |

**User's choice:** FastAPI in Python
**Notes:** "ah idk keep everything python"

### Follow-up: Container strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Single container (Recommended) | One Python process runs FastAPI + email poller | ✓ |
| Two containers | Separate FastAPI and email service containers | |

**User's choice:** Single container

---

## Greenfield Schema Reuse

| Option | Description | Selected |
|--------|-------------|----------|
| Fresh schema (Recommended) | Write new migrations from scratch for MVP | ✓ |
| Strip and adapt | Take inventory/orders SQL, remove tenant columns | |
| Keep as reference only | Don't use SQL files, just look at them for ideas | |

**User's choice:** Fresh schema
**Notes:** None

---

## API Layer Approach

| Option | Description | Selected |
|--------|-------------|----------|
| PostgreSQL function (Recommended) | Atomic FIFO via SELECT FOR UPDATE. Called from both API and email. | ✓ |
| Python in FastAPI | Business logic in Python, DB transactions from app code | |
| You decide | Claude's discretion | |

**User's choice:** PostgreSQL function

### Follow-up: Frontend→API pattern

| Option | Description | Selected |
|--------|-------------|----------|
| Keep nginx proxy pattern | /api/ proxied to FastAPI. Same-origin. | ✓ |
| Direct FastAPI calls | Frontend calls FastAPI port directly. Need CORS. | |

**User's choice:** Keep nginx proxy pattern

---

## Auth Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Simple login (Recommended) | Username/password, hashed, session cookie, login page | ✓ |
| No auth for MVP | Skip auth entirely | |
| API key only | Hardcoded API key in env var | |

**User's choice:** Simple login

---

## Claude's Discretion

- Migration tooling (Alembic vs raw SQL)
- Docker Compose port assignments
- FastAPI project structure
- Email poller integration method

## Deferred Ideas

None
