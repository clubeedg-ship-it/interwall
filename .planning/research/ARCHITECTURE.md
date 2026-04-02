# Architecture Patterns

**Domain:** Inventory management — brownfield rewire (vanilla JS SPA + Python email service → PostgreSQL)
**Researched:** 2026-04-02
**Confidence:** HIGH (core architectural decisions), MEDIUM (Supabase-specific tradeoffs)

---

## Recommended Architecture

### Central Answer: One Thin API, Two Clients

The vanilla JS frontend and the Python email service should both talk to a **single thin REST API server**, not to PostgreSQL directly. The API owns all database connections, all business logic (FIFO deduction, composition resolution, profit calculation), and all auth. Both clients are consumers.

```
┌─────────────────────────────────────────────────┐
│                  Browser                         │
│   Vanilla JS SPA (port 1441)                     │
│   - Wall UI                                      │
│   - Scanner                                      │
│   - Catalog, Compositions, Profit dashboard      │
└────────────────┬────────────────────────────────┘
                 │  HTTP (same-origin, httpOnly cookie auth)
                 ▼
┌─────────────────────────────────────────────────┐
│              Thin REST API                       │
│   Node.js/Fastify or Python/FastAPI              │
│   - Auth (session or JWT in httpOnly cookie)     │
│   - Business logic: FIFO, EAN composition        │
│   - Profit calculation                           │
│   - Connection pool to PostgreSQL                │
└──────────┬───────────────────┬──────────────────┘
           │  SQL (pgclient)   │  SQL (pgclient)
           ▼                   │
┌──────────────────────┐       │
│      PostgreSQL      │◄──────┘
│  (Supabase or self-  │
│  hosted)             │
│  - products          │
│  - ean_compositions  │
│  - zones/shelves     │
│  - stock_lots        │
│  - transactions      │
│  - emails            │
│  - fixed_costs       │
└──────────────────────┘
           ▲
           │  SQL (psycopg2/psycopg3, direct)
           │
┌──────────────────────┐
│  Python Email Service │
│  - IMAP polling       │
│  - Marketplace parsers│
│  - FIFO write logic   │
│  - Dedup via message_id│
└──────────────────────┘
```

**The Python email service is the one exception: it connects directly to PostgreSQL.** This is safe and correct because it is a trusted background service — not user-facing, not exposed, not browser-visible. It uses psycopg2/psycopg3 with a direct connection string. It does not need to go through the REST API. Shared API is for clients that need auth mediation (the browser). The email service IS the authenticated backend.

---

## Why Not Direct Supabase Client from Browser

Supabase's JavaScript client can query PostgreSQL directly from the browser using the anon key. This is only safe when Row Level Security (RLS) is enabled on every table. This project is explicitly single-tenant, single-user, with no RLS planned. Using the anon key from the browser without RLS means any user with DevTools access can read and write all tables — including dropping stock, forging transactions, or reading business margins.

**Verdict:** Do not use the Supabase JS client directly in the browser for this project. The single-user design removes the social contract that makes anon-key exposure safe. A thin API that checks a session cookie is the correct gate.

---

## Why Not Direct PostgreSQL from Browser

PostgreSQL does not serve HTTP. The browser cannot connect to it directly. An API intermediary is always required for browser clients. This is not a tradeoff — it is a constraint.

---

## Component Boundaries

| Component | Responsibility | Communicates With | Auth Boundary |
|-----------|---------------|-------------------|---------------|
| Vanilla JS SPA | UI rendering, user interaction, barcode scan input | REST API (same-origin HTTP) | httpOnly session cookie set by REST API |
| REST API | Business logic, FIFO, profit calc, EAN resolution, connection pool | PostgreSQL (SQL) | Validates cookie; rejects unauthenticated requests |
| Python Email Service | IMAP polling, email parsing, stock writes, dedup | PostgreSQL (direct SQL) | No HTTP auth — runs server-side, trusted process |
| PostgreSQL | Durable storage, single source of truth | REST API, Python service | Network-level isolation (not exposed to internet) |
| nginx | Static file serving, reverse proxy | SPA (static files), REST API (proxy /api/*) | Terminate TLS, route traffic |

---

## Data Flow

### Purchase Email Flow

```
IMAP inbox
  → Python parser (MediaMarktSaturn / Bol.com / Boulanger)
  → check emails.message_id (dedup)
  → INSERT into emails (status='processed')
  → INSERT into stock_lots (product_id, qty, unit_cost, marketplace, received_at)
  → INSERT into transactions (type='purchase', ...)
```

### Sale Email Flow

```
IMAP inbox
  → Python parser
  → check emails.message_id (dedup)
  → SELECT ean_compositions WHERE parent_ean = sold_ean
  → for each component:
      SELECT stock_lots WHERE product_id = component ORDER BY received_at ASC  (FIFO)
      UPDATE stock_lots (decrement qty, consume oldest first)
      accumulate COGS
  → SELECT fixed_costs
  → compute profit = sale_price - COGS - fixed_costs
  → INSERT into transactions (type='sale', cogs, profit, ...)
  → INSERT into emails (status='processed')
```

### Wall UI Load Flow

```
Browser page load
  → GET /api/wall  (single endpoint)
  → REST API executes:
      SELECT zones + shelves + stock_counts in one query (JOIN)
  → returns JSON: zones[{shelves[{stock_count, health_color}]}]
  → SPA renders grid
```
No N+1. One HTTP call. One SQL query.

### Scanner Flow

```
USB barcode scan → browser keypress event
  → GET /api/products/:ean
  → returns product + current stock lots + shelf assignments
  → user confirms/assigns shelf
  → PATCH /api/stock-lots/:id  { shelf_id }
```

### Config Changes (zones, fixed costs)

```
User edits zone/shelf config in UI
  → POST /api/zones or PATCH /api/shelves/:id
  → REST API writes to PostgreSQL
  → next page load reads from database (not localStorage)
```

---

## REST API Design Decisions

### Language: Node.js (Fastify) — Recommended

The existing codebase is JavaScript (vanilla JS frontend, existing nginx config). Using Node.js for the API server means:
- One language across the stack (JS frontend + JS API)
- Fastify has very low overhead and ships JSON fast
- `pg` (node-postgres) is a mature, well-tested driver with built-in connection pooling
- Easier for the same developer to maintain both frontend and API

**Alternative: Python/FastAPI.** Reasonable choice if the team prefers Python (given the email service is Python). FastAPI with psycopg3 and async connections performs well. The tradeoff is two runtimes in Docker Compose vs one.

**Recommendation:** Use Fastify if frontend developer is primary maintainer. Use FastAPI if backend/Python developer is primary maintainer. Pick one and commit — the interface is identical REST either way.

### Auth: httpOnly Cookie + Session

The SPECS-MVP.md requires no tokens in localStorage. The correct replacement is:
- Login endpoint sets a `Set-Cookie: session=...; HttpOnly; Secure; SameSite=Strict`
- All subsequent API calls include the cookie automatically (same-origin)
- No JS code can read or steal the session token
- Single user means no session database needed — a signed JWT in the httpOnly cookie (stateless session) is sufficient

This is a standard pattern supported by both Fastify (fastify-cookie + fastify-session) and FastAPI (python-jose for JWT, starlette middleware for cookies).

### FIFO Logic Location: Application Layer (API Server)

FIFO deduction requires a read-then-write sequence: read the oldest lots, consume them in order, update or delete exhausted lots. This is a transaction with conditional logic — awkward in pure SQL stored procedures, natural in application code.

**Pattern:**
```
BEGIN TRANSACTION
  SELECT stock_lots WHERE product_id = X ORDER BY received_at ASC FOR UPDATE
  iterate lots: consume qty until filled
  UPDATE/DELETE consumed lots
  INSERT transaction record with computed COGS
COMMIT
```

The `FOR UPDATE` row lock prevents concurrent FIFO deductions on the same product. This logic lives in the API server (or Python email service for email-triggered sales), not in a PostgreSQL stored procedure. Stored procedures add complexity without benefit at this scale.

**Exception:** Profit calculation can live in both places — computed in application code for new transactions, and computed via SQL aggregation for the dashboard (SUM over transactions table).

### Connection Pooling

- REST API: Use `pg` (node-postgres) with a pool of 5–10 connections for a single-user system. No need for PgBouncer at this scale.
- Python email service: psycopg2 with a simple connection (not pooled — it runs as a single-threaded polling loop, one connection is fine).

---

## Supabase vs Self-Hosted PostgreSQL

| Concern | Supabase | Self-Hosted |
|---------|----------|-------------|
| Setup speed | Fast — managed | Slower — Docker Compose volume |
| Cost | Free tier sufficient for single-tenant | Free (Docker) |
| Connection string | Standard `postgres://` URI | Standard `postgres://` URI |
| API layer used? | No — we build our own REST API on top | No difference |
| RLS needed? | No — our REST API is the auth layer | N/A |
| Supabase JS client used? | No — see security note above | N/A |
| Data ownership | Supabase-hosted | Self-owned |
| Docker Compose simplicity | Removes DB from Compose | DB stays in Compose |

**Recommendation:** Use Supabase free tier for the MVP to remove database ops from scope. The REST API connects via the standard `postgres://` connection string — no Supabase SDK required. If the project moves to self-hosted later, only the connection string changes.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Supabase JS Client Directly in Browser
**What:** Using `import { createClient } from '@supabase/supabase-js'` in the SPA, querying tables directly with the anon key.
**Why bad:** Without RLS, the anon key grants full table access from the browser. Any user with DevTools can read all transactions, margins, costs. Any malicious request can corrupt stock.
**Instead:** All database access goes through the REST API with cookie auth.

### Anti-Pattern 2: Splitting Business Logic Between Two Services
**What:** Python email service calls the REST API to write stock, instead of writing to PostgreSQL directly.
**Why bad:** Adds an HTTP hop for every email processed. Creates circular dependency. The REST API would need to expose internal write endpoints, complicating auth.
**Instead:** Python service connects directly to PostgreSQL. It is a trusted backend process. REST API is for browser clients only.

### Anti-Pattern 3: N+1 Queries in Wall UI
**What:** Fetching each shelf's stock count with a separate API call.
**Why bad:** A 10-zone × 8-column × 4-level wall = 320 separate HTTP requests on page load.
**Instead:** One endpoint `/api/wall` returns the full wall state in one denormalized query. The existing prototype had this problem — fix it in the first pass.

### Anti-Pattern 4: Business Logic in the Browser
**What:** Computing FIFO cost or profit in JavaScript before displaying in the UI.
**Why bad:** The browser cannot be trusted to hold authoritative calculations. Inconsistencies arise when the same product is sold from two browser sessions.
**Instead:** All FIFO deduction and profit calculation happens in the API server or Python service, stored in `transactions.cogs` and `transactions.profit`. The browser only reads and renders.

### Anti-Pattern 5: Storing Auth Token in localStorage
**What:** The current prototype stores the InvenTree token in localStorage. The spec explicitly bans this.
**Why bad:** XSS vulnerability — any injected script can steal the token and impersonate the user.
**Instead:** httpOnly cookie set by the REST API's login endpoint.

---

## Build Order (Phase Dependencies)

The architecture has a strict dependency order. Each phase unblocks the next.

```
Phase 1: Database Schema
  └── Creates tables: products, ean_compositions, zones, shelves,
      stock_lots, transactions, fixed_costs, emails, warehouses
  └── Unblocks: everything

Phase 2: REST API Skeleton
  └── Fastify/FastAPI server with cookie auth, health check, DB connection
  └── Unblocks: frontend wiring, email service rewiring

Phase 3: Core Data CRUD Endpoints
  └── /api/products, /api/zones, /api/shelves, /api/compositions
  └── /api/fixed-costs, /api/wall (batch query)
  └── Unblocks: frontend can render from DB

Phase 4: FIFO + Profit Logic
  └── /api/stock-lots (FIFO deduction, manual stock IN)
  └── /api/transactions (profit calc on write)
  └── Unblocks: email service rewiring, dashboard

Phase 5: Python Email Service Rewiring
  └── Replace InvenTree API calls with direct PostgreSQL writes
  └── Reuse Phase 4 FIFO logic (duplicate or share as library)
  └── Unblocks: email-driven stock flow

Phase 6: Frontend Wiring
  └── Replace all app.js InvenTree API calls with new REST API calls
  └── Remove localStorage business state
  └── Split app.js monolith
  └── Depends on: Phases 2-4 complete

Phase 7: Dashboard
  └── Profit charts from transactions table
  └── Depends on: Phase 4 transaction writes
```

**Critical dependency:** Phase 4 (FIFO logic) is needed by both Phase 5 (Python service) and Phase 6 (scanner/manual stock moves in frontend). If Phase 5 and Phase 6 run in parallel, FIFO logic must be finalized before either begins.

---

## Docker Compose Target

The target Compose file is significantly simpler than the legacy system:

```
Legacy (5 containers):   Target (3 containers):
  inventree-server          api-server (Fastify/FastAPI)
  inventree-worker          email-service (Python)
  inventree-db (PG 15)      nginx (static + proxy)
  redis
  frontend-nginx            + Supabase or external PG (no container needed)
```

If self-hosting PostgreSQL, add one `postgres:15-alpine` container. Still simpler than the legacy stack.

---

## Scalability Considerations

This is a single-tenant, single-user system. Scale concerns are irrelevant for the MVP. The architecture supports growth if needed:

| Concern | MVP (1 user) | If needed later |
|---------|--------------|-----------------|
| Connection pooling | pg pool size 5 | Add PgBouncer |
| API concurrency | Single Fastify process | Add worker processes |
| Email throughput | Single poller thread | Parallel workers per marketplace |
| Auth | Single session | Add multi-user, then RLS |

---

## Sources

- Supabase docs — anon key security and RLS requirement: https://supabase.com/docs/guides/api/api-keys
- Supabase docs — connecting to Postgres: https://supabase.com/docs/guides/database/connecting-to-postgres
- PostgREST documentation: https://postgrest.org/
- Fastify + PostgreSQL patterns: https://dev.to/hexshift/creating-a-high-performance-rest-api-with-fastify-and-postgresql-17gc
- FastAPI + PostgreSQL 2025 guide: https://medium.com/@gizmo.codes/building-a-scalable-api-with-fastapi-and-postgresql-a-2025-guide-ca5f3b9cb914
- psycopg3 vs asyncpg comparison: https://fernandoarteaga.dev/blog/psycopg-vs-asyncpg/
- FIFO SQL patterns: https://www.red-gate.com/simple-talk/databases/sql-server/performance-sql-server/set-based-speed-phreakery-the-fifo-stock-inventory-sql-problem/
- httpOnly cookie auth pattern: https://medium.com/multitude-it-labs/store-token-in-http-only-cookie-239a15ea121f
- Supabase anon key security audit: https://www.audityour.app/guides/supabase-anonymous-key-security-guide
