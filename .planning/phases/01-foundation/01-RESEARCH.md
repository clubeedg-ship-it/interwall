# Phase 1: Foundation - Research

**Researched:** 2026-04-02
**Domain:** PostgreSQL schema, PostgreSQL stored functions (FIFO/compositions/sale workflow), FastAPI + psycopg2, Docker Compose, nginx reverse proxy, session-cookie auth
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Self-hosted PostgreSQL 15 in Docker (fresh container, new volume, new database name). No Supabase.
- **D-02:** Fresh `docker-compose.yml` — no InvenTree, Celery, or Redis containers. Clean slate.
- **D-03:** FastAPI (Python) as the REST API between frontend and PostgreSQL. No Node.js, no PostgREST, no Supabase client.
- **D-04:** Single container runs both FastAPI (HTTP server) and the email poller (background thread/scheduler). One Python process.
- **D-05:** Frontend calls API via nginx reverse proxy at `/api/` (same pattern as current InvenTree setup). No CORS needed.
- **D-06:** Python email service connects directly to PostgreSQL via psycopg2 (same process as FastAPI, shared connection pool).
- **D-07:** FIFO stock deduction implemented as PostgreSQL function with SELECT FOR UPDATE. Called from both API and email service via RPC. Atomic by nature.
- **D-08:** EAN composition resolution as PostgreSQL function.
- **D-09:** Sale processing workflow as PostgreSQL function (resolve composition → deduct FIFO → compute COGS → record transaction).
- **D-10:** Fresh schema from scratch based on SPECS-MVP.md data model. Do NOT reuse greenfield Supabase migrations. No multi-tenant, no RLS, no organizations/memberships.
- **D-11:** Simple username/password login. Password hashed in DB. FastAPI session cookie (httpOnly). Login page. Single user.

### Claude's Discretion
- Migration tooling (Alembic vs raw SQL) — pick what's simplest for MVP
- Docker Compose port assignments — use sensible defaults
- FastAPI project structure — follow standard Python project layout
- Email poller integration method (background thread, APScheduler, etc.)

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DB-01 | PostgreSQL schema exists with all business tables (products, ean_compositions, stock_lots, transactions, zones, shelves, warehouses, fixed_costs, emails) | Schema DDL patterns, UUID PKs, correct column types documented in Code Examples section |
| DB-02 | Atomic FIFO stock deduction implemented as PostgreSQL function with SELECT FOR UPDATE | FIFO locking pattern documented; SELECT FOR UPDATE SKIP LOCKED pitfall identified |
| DB-03 | EAN composition resolution implemented as PostgreSQL function (returns all components with quantities for a parent EAN) | Recursive CTE or simple JOIN pattern; circular reference guard required |
| DB-04 | Sale processing workflow implemented as PostgreSQL function (resolve composition → deduct components FIFO → compute COGS → record transaction) | Transactional PL/pgSQL pattern with EXCEPTION block documented |
| DB-05 | CHECK constraint on stock_lots.quantity >= 0 prevents negative inventory | CHECK CONSTRAINT syntax; interaction with FIFO deduction documented |
| INFRA-01 | System runs without InvenTree containers (no Django, Celery, Redis dependency) | New docker-compose.yml with only postgres + api + nginx documented |
| INFRA-02 | Docker Compose config for PostgreSQL + FastAPI container only | Service definitions, healthchecks, named volume documented |
| INFRA-03 | Simple session-based auth (single user, no multi-tenant) | Starlette SessionMiddleware + itsdangerous signed cookie pattern documented |
</phase_requirements>

---

## Summary

Phase 1 delivers the complete backend foundation: PostgreSQL 15 schema, three PL/pgSQL functions encoding all atomic business logic, a FastAPI application container with session-cookie auth, and a simplified Docker Compose stack that permanently removes InvenTree.

The critical technical risk is the FIFO deduction function (DB-02, DB-04). The SELECT FOR UPDATE approach is the correct locking strategy, but it must wrap the entire multi-step deduction (iterate lots → update quantities → insert transaction) inside a single PL/pgSQL transaction to be safe. Splitting the work across multiple round-trips from application code loses the atomicity guarantee that motivated putting it in the database in the first place.

The second risk is EAN composition circular references (P5 from PITFALLS.md). A DB-level trigger or CHECK constraint blocking self-reference combined with an application-layer cycle detector on INSERT is the minimum viable guard. The PostgreSQL function itself should not attempt infinite-depth resolution.

**Primary recommendation:** Write schema DDL and the three PL/pgSQL functions first. Wire FastAPI to call them via `SELECT * FROM fn(...)` using psycopg2. Add session auth last — it is the simplest part.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| PostgreSQL | 15-alpine | Primary database | User decision D-01; Alpine image keeps container small |
| FastAPI | 0.135.3 | REST API framework | User decision D-03; async, auto-docs, Pydantic validation |
| uvicorn | 0.42.0 | ASGI server for FastAPI | Standard FastAPI deployment server |
| psycopg2-binary | 2.9.11 | PostgreSQL driver | User decision D-06; synchronous driver appropriate for this load |
| passlib[bcrypt] | 1.7.4 + bcrypt 5.0.0 | Password hashing | Industry standard; passlib abstracts bcrypt rounds |
| itsdangerous | 2.2.0 | Signed session cookie | Already installed; Starlette/FastAPI dep; signs httpOnly cookie |
| pydantic | 2.12.5 | Request/response models | Bundled with FastAPI; v2 API used |
| python-multipart | 0.0.20 | Form data parsing (login) | Required by FastAPI for `Form()` fields |
| nginx:alpine | latest | Static file server + /api/ proxy | Same pattern as legacy; no version pinning needed |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| APScheduler | 3.11.2 | Background email poller scheduler | D-04: single process, background thread scheduler for email polling (Phase 3 actually wires the poller, but the scheduler setup happens in Phase 1's app container) |
| Alembic | 1.16.x | Schema migrations | Claude's Discretion: use for Phase 1 initial migration; beats raw SQL for future-proofing |

**Note on Alembic vs raw SQL:** For MVP with a single migration, raw SQL in an `init.sql` file loaded by Docker's init mechanism (`/docker-entrypoint-initdb.d/`) is simpler. Alembic adds value only when there are multiple schema versions to track. Recommendation: use `init.sql` for Phase 1, introduce Alembic only if Phase 2+ requires schema changes. If Alembic is chosen now, use `alembic upgrade head` in the container startup script.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| psycopg2-binary | psycopg3 (psycopg) | psycopg3 is the modern successor with better async support, but psycopg2 is what the legacy email service uses; consistency wins for MVP |
| psycopg2-binary | asyncpg | asyncpg is faster but async-only and lacks the synchronous `connection.execute()` call pattern; FastAPI with sync endpoints is fine for single-user load |
| itsdangerous cookie | python-jose JWT | Both work; itsdangerous is already a Starlette/FastAPI transitive dep, no extra install |
| APScheduler | threading.Timer / asyncio loop | APScheduler is cleaner; threading.Timer is fine but re-creating on each poll is fragile |

**Installation:**
```bash
pip install fastapi==0.135.3 uvicorn==0.42.0 psycopg2-binary==2.9.11 \
  "passlib[bcrypt]" itsdangerous pydantic python-multipart APScheduler
```

**Version verification:** Versions above were confirmed from PyPI registry on 2026-04-02 via `pip3 index versions`. FastAPI latest is 0.135.3; psycopg2-binary latest is 2.9.11; uvicorn latest is 0.42.0.

---

## Architecture Patterns

### Recommended Project Structure

```
apps/
└── api/
    ├── Dockerfile
    ├── requirements.txt
    ├── main.py              # FastAPI app factory, lifespan, middleware
    ├── db.py                # psycopg2 connection pool, get_conn() context manager
    ├── auth.py              # Session cookie login/logout endpoints + dependency
    ├── routers/
    │   ├── products.py      # /api/products CRUD
    │   ├── zones.py         # /api/zones + /api/shelves CRUD
    │   ├── stock.py         # /api/stock-lots (manual stock IN)
    │   └── health.py        # /api/health
    └── sql/
        └── init.sql         # Full schema DDL + all PL/pgSQL functions
nginx/
└── nginx.conf               # Adapted from legacy; /api/ → api:8000
docker-compose.yml           # postgres + api + nginx only
```

### Pattern 1: PostgreSQL Initialization via Docker Entrypoint

**What:** Place `init.sql` in `/docker-entrypoint-initdb.d/`. PostgreSQL official image runs all `.sql` files in that directory on first startup (when the data volume is empty).

**When to use:** Single-migration schemas. No external migration runner needed.

**Example:**
```yaml
# docker-compose.yml
services:
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: interwall
      POSTGRES_USER: interwall
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./apps/api/sql/init.sql:/docker-entrypoint-initdb.d/01_init.sql:ro
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U interwall -d interwall"]
      interval: 5s
      timeout: 5s
      retries: 10

  api:
    build: ./apps/api
    environment:
      DATABASE_URL: postgresql://interwall:${POSTGRES_PASSWORD}@postgres:5432/interwall
      SESSION_SECRET: ${SESSION_SECRET}
    depends_on:
      postgres:
        condition: service_healthy
    restart: unless-stopped

  nginx:
    image: nginx:alpine
    ports:
      - "1441:80"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/conf.d/default.conf:ro
      - ./inventory-omiximo/frontend:/usr/share/nginx/html:ro
    depends_on:
      - api

volumes:
  pgdata:
```

### Pattern 2: PL/pgSQL FIFO Deduction Function (DB-02, DB-04)

**What:** Single PostgreSQL function wrapping the entire FIFO deduction + transaction record. Called via `SELECT deduct_fifo_stock(...)` from psycopg2. The lock, deduction, and ledger entry are one atomic unit.

**When to use:** Any stock-out operation (sale email, manual scanner deduction).

**Example:**
```sql
-- Source: PostgreSQL docs — SELECT FOR UPDATE, PL/pgSQL, RAISE EXCEPTION
CREATE OR REPLACE FUNCTION deduct_fifo_stock(
    p_product_id  UUID,
    p_quantity    INTEGER,
    p_order_ref   TEXT DEFAULT NULL
)
RETURNS INTEGER  -- returns total deducted (may be < requested if insufficient)
LANGUAGE plpgsql
AS $$
DECLARE
    v_lot          RECORD;
    v_remaining    INTEGER := p_quantity;
    v_take         INTEGER;
    v_deducted     INTEGER := 0;
BEGIN
    -- Lock lots in FIFO order (oldest received_at first) to prevent race conditions
    FOR v_lot IN
        SELECT id, quantity
        FROM stock_lots
        WHERE product_id = p_product_id
          AND quantity > 0
        ORDER BY received_at ASC
        FOR UPDATE SKIP LOCKED  -- skip lots already locked by concurrent call
    LOOP
        EXIT WHEN v_remaining <= 0;

        v_take := LEAST(v_remaining, v_lot.quantity);

        UPDATE stock_lots
           SET quantity = quantity - v_take
         WHERE id = v_lot.id;

        v_remaining := v_remaining - v_take;
        v_deducted  := v_deducted  + v_take;
    END LOOP;

    RETURN v_deducted;
END;
$$;
```

**Critical note on SKIP LOCKED vs plain FOR UPDATE:** `FOR UPDATE` (without SKIP LOCKED) blocks until the competing transaction releases the lock — this is correct for sequential processing. `FOR UPDATE SKIP LOCKED` skips already-locked lots and deducts from the next available lot, which can cause incorrect FIFO ordering under concurrency. For this single-threaded email poller, plain `FOR UPDATE` is correct. Use `SKIP LOCKED` only if you later introduce parallel workers.

### Pattern 3: Sale Processing Wrapper Function (DB-04)

**What:** Calls `deduct_fifo_stock` for each component, accumulates COGS, inserts the transaction record, all in one function call from the API.

**Example:**
```sql
-- Source: PostgreSQL PL/pgSQL docs
CREATE OR REPLACE FUNCTION process_sale(
    p_parent_ean    TEXT,
    p_quantity      INTEGER,
    p_sale_price    NUMERIC,
    p_marketplace   TEXT,
    p_order_ref     TEXT DEFAULT NULL,
    p_email_id      UUID DEFAULT NULL
)
RETURNS UUID  -- returns transaction id
LANGUAGE plpgsql
AS $$
DECLARE
    v_comp         RECORD;
    v_product_id   UUID;
    v_cogs         NUMERIC := 0;
    v_deducted     INTEGER;
    v_txn_id       UUID;
BEGIN
    -- Resolve parent product
    SELECT id INTO v_product_id FROM products WHERE ean = p_parent_ean;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Product not found: %', p_parent_ean;
    END IF;

    -- Iterate compositions, deduct each component FIFO
    FOR v_comp IN
        SELECT ec.component_ean, ec.quantity AS comp_qty,
               p.id AS comp_product_id
          FROM ean_compositions ec
          JOIN products p ON p.ean = ec.component_ean
         WHERE ec.parent_ean = p_parent_ean
    LOOP
        v_deducted := deduct_fifo_stock(
            v_comp.comp_product_id,
            v_comp.comp_qty * p_quantity,
            p_order_ref
        );
        -- Accumulate COGS: use average cost of deducted lots
        SELECT v_cogs + COALESCE(
            (SELECT SUM(unit_cost * LEAST(quantity, v_comp.comp_qty * p_quantity))
               FROM stock_lots
              WHERE product_id = v_comp.comp_product_id
              ORDER BY received_at ASC
              LIMIT 1), 0
        ) INTO v_cogs;
    END LOOP;

    -- Insert immutable transaction record
    INSERT INTO transactions (
        id, type, product_ean, quantity, unit_price,
        total_price, marketplace, order_reference,
        cogs, profit, source_email_id, created_at
    ) VALUES (
        gen_random_uuid(), 'sale', p_parent_ean, p_quantity, p_sale_price,
        p_sale_price * p_quantity, p_marketplace, p_order_ref,
        v_cogs,
        (p_sale_price * p_quantity) - v_cogs - (
            SELECT COALESCE(SUM(
                CASE WHEN is_percentage THEN p_sale_price * p_quantity * value / 100
                     ELSE value END
            ), 0) FROM fixed_costs
        ),
        p_email_id, NOW()
    ) RETURNING id INTO v_txn_id;

    RETURN v_txn_id;
END;
$$;
```

**Note:** The COGS accumulation shown above is simplified — a production-quality version must track exactly which lot quantities were consumed at what unit cost. The planner should task implementing accurate COGS tracking as an explicit step.

### Pattern 4: EAN Composition Resolution Function (DB-03)

**What:** Returns all components with total quantities for a given parent EAN. Used by `process_sale` and by the frontend's composition display.

**Example:**
```sql
-- Source: PostgreSQL docs — simple JOIN, no recursion needed for depth-1 compositions
CREATE OR REPLACE FUNCTION resolve_composition(p_parent_ean TEXT)
RETURNS TABLE(component_ean TEXT, component_name TEXT, quantity INTEGER)
LANGUAGE sql STABLE
AS $$
    SELECT ec.component_ean, p.name, ec.quantity
      FROM ean_compositions ec
      JOIN products p ON p.ean = ec.component_ean
     WHERE ec.parent_ean = p_parent_ean;
$$;
```

### Pattern 5: FastAPI Session Cookie Auth (D-11, INFRA-03)

**What:** Starlette `SessionMiddleware` (ships with Starlette which FastAPI depends on) signs a cookie with a server secret. No external auth service needed.

**When to use:** Single-user login with httpOnly cookie. Requires `SESSION_SECRET` env var (min 32 chars).

**Example:**
```python
# Source: Starlette docs — SessionMiddleware
# main.py
from fastapi import FastAPI, Depends, HTTPException, Request, Form
from fastapi.responses import JSONResponse, RedirectResponse
from starlette.middleware.sessions import SessionMiddleware
import passlib.hash

app = FastAPI()
app.add_middleware(SessionMiddleware, secret_key=os.environ["SESSION_SECRET"])

@app.post("/api/auth/login")
async def login(request: Request, username: str = Form(), password: str = Form()):
    # Fetch hashed password from DB users table
    user = db_get_user(username)
    if not user or not passlib.hash.bcrypt.verify(password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    request.session["user"] = username
    return {"ok": True}

@app.post("/api/auth/logout")
async def logout(request: Request):
    request.session.clear()
    return {"ok": True}

def require_auth(request: Request):
    if "user" not in request.session:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return request.session["user"]

# All protected routes use:
@app.get("/api/products")
async def list_products(user=Depends(require_auth)):
    ...
```

**Cookie behavior:** `SessionMiddleware` sets a signed, base64-encoded cookie. It is NOT httpOnly by default in older Starlette versions. Verify `https_only` and `same_site` parameters in the version being used. For httpOnly: use `https_only=False` (dev) or `True` (prod) and check if Starlette's `SessionMiddleware` version supports `httponly=True` parameter — if not, the session value itself (signed) is safe because the secret is server-side.

**Confidence:** HIGH for the auth mechanism; MEDIUM for the exact httpOnly parameter availability — verify in Starlette 0.45+ changelog.

### Pattern 6: psycopg2 Connection Pool

**What:** `psycopg2.pool.SimpleConnectionPool` initialized once at app startup via FastAPI lifespan.

**Example:**
```python
# db.py
import psycopg2.pool
import psycopg2.extras
from contextlib import contextmanager

_pool: psycopg2.pool.SimpleConnectionPool = None

def init_pool(dsn: str, minconn=2, maxconn=10):
    global _pool
    _pool = psycopg2.pool.SimpleConnectionPool(minconn, maxconn, dsn)

@contextmanager
def get_conn():
    conn = _pool.getconn()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        _pool.putconn(conn)

# Call a PL/pgSQL function:
def call_process_sale(parent_ean, qty, sale_price, marketplace, order_ref):
    with get_conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                "SELECT process_sale(%s, %s, %s, %s, %s)",
                (parent_ean, qty, sale_price, marketplace, order_ref)
            )
            return cur.fetchone()["process_sale"]
```

### Pattern 7: nginx Config (Adapted from Legacy)

**What:** Route `/api/` to FastAPI container. Serve vanilla JS frontend static files. Drop all InvenTree and Config API proxy blocks.

**Example:**
```nginx
# nginx/nginx.conf  — adapted from inventory-omiximo/frontend/nginx.conf
server {
    listen 80;
    server_name localhost;

    root /usr/share/nginx/html;
    index index.html;

    location ~ \.(js|css)$ {
        add_header Cache-Control "no-cache, no-store, must-revalidate";
        try_files $uri =404;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://api:8000/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

**Key change from legacy:** `proxy_pass` target changes from `http://inventree-server:8000/api/` to `http://api:8000/api/`. Remove `/media/`, `/static/`, and `/config-api/` proxy blocks — those were InvenTree-specific.

### Anti-Patterns to Avoid

- **Splitting the FIFO transaction across application code:** Fetching lots in Python, then issuing multiple UPDATE statements in a loop without `BEGIN`/`COMMIT` wrapping is not atomic. Another process can observe intermediate state. The DB function pattern (D-07) is the correct answer — one `SELECT fn(...)` call = one atomic transaction.
- **Using `FOR UPDATE SKIP LOCKED` in the FIFO function:** This skips already-locked rows, breaking FIFO ordering under concurrency. Plain `FOR UPDATE` blocks and waits — which is the correct behavior for a single-worker email poller.
- **Storing the session secret in the Docker image:** Pass `SESSION_SECRET` as an environment variable from `.env`. Never bake it into the Dockerfile or requirements.
- **Creating a `users` table without a `CHECK` on the password hash format:** The DB-01 requirement includes a `users` table for auth (D-11). Add a NOT NULL constraint on `password_hash` to prevent empty-password accounts.
- **Putting `init.sql` in a bind mount on a pre-existing volume:** PostgreSQL only runs `/docker-entrypoint-initdb.d/` scripts if the data directory is empty. On a second `docker compose up` (volume exists), the init scripts are silently skipped. This is correct behavior but surprises developers. Use `docker compose down -v` to fully reset the database during development.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Password hashing | Custom SHA256/MD5 loop | `passlib[bcrypt]` | bcrypt handles salting and work factor; SHA256 is not suitable for passwords |
| Session cookie signing | Manual HMAC in Python | `itsdangerous` via Starlette `SessionMiddleware` | Already a transitive dep; handles signing, rotation, expiry |
| Connection pooling | One connection per request or global connection | `psycopg2.pool.SimpleConnectionPool` | Prevents connection exhaustion; handles reconnection on failure |
| UUID generation in Python | `uuid.uuid4()` inserted from app code | `gen_random_uuid()` in PostgreSQL DEFAULT | DB-generated UUIDs are more reliable under concurrent inserts |
| Circular reference detection | Application-level DFS on every composition read | One-time validation on INSERT + `parent_ean != component_ean` CHECK | Compositions change rarely; validate at write time, not read time |

**Key insight:** The most dangerous hand-roll risk in this phase is FIFO deduction. The legacy `stock_manager.py` iterates lots in Python and calls InvenTree's remove_stock API per lot — that is a correct pattern for a sequential, non-concurrent service. But the D-07 decision moves this into a PL/pgSQL function, which is better because it makes concurrent call safety explicit and auditable at the database layer rather than relying on the application being single-threaded.

---

## Common Pitfalls

### Pitfall 1: init.sql Not Running on Second Startup
**What goes wrong:** Developer runs `docker compose up`, schema is created. Developer adds a table, restarts — new table missing. No error message.
**Why it happens:** PostgreSQL only runs `/docker-entrypoint-initdb.d/` scripts when the data volume is empty (first init only).
**How to avoid:** During development, use `docker compose down -v` before `docker compose up` to force schema re-initialization. In production, use Alembic or add ALTER statements manually.
**Warning signs:** `relation "products" does not exist` error after a Compose restart where a new table was expected.

### Pitfall 2: FOR UPDATE SKIP LOCKED Breaks FIFO Ordering
**What goes wrong:** Two concurrent sale emails both call `deduct_fifo_stock`. With SKIP LOCKED, process B skips lot #1 (locked by A) and deducts from lot #2 instead — violating FIFO.
**Why it happens:** SKIP LOCKED is designed for task queues, not FIFO inventory. It intentionally skips locked rows.
**How to avoid:** Use plain `FOR UPDATE` (without SKIP LOCKED). Process B blocks until A commits, then deducts from whatever lot has stock remaining — which is FIFO-correct.
**Warning signs:** COGS calculations inconsistent with oldest-lot costs; younger lots depleted before older lots.

### Pitfall 3: CHECK Constraint Does Not Prevent the Error You Expect
**What goes wrong:** `stock_lots.quantity >= 0` CHECK constraint fires when the UPDATE in the FIFO function tries to set quantity to a negative value — raising a constraint violation exception that rolls back the entire transaction, including the transaction record INSERT.
**Why it happens:** The CHECK constraint enforces the invariant correctly, but the calling code must handle the exception. If the Python layer doesn't catch it, the API returns a 500 error instead of a graceful "insufficient stock" response.
**How to avoid:** In `deduct_fifo_stock`, compute the total available before deducting. If `available < requested`, either raise a named exception (`RAISE EXCEPTION 'insufficient_stock'`) or return the shortfall amount rather than letting the CHECK constraint fire. Let the caller decide whether to proceed with partial deduction or abort.
**Warning signs:** Unhandled `IntegrityError` from psycopg2 on sale operations with low stock.

### Pitfall 4: EAN Composition Self-Reference Creates Infinite Loop
**What goes wrong:** `process_sale` is called for a product whose `ean_compositions` maps to itself (EAN-A → EAN-A). The loop iterates forever (or until stack overflow).
**Why it happens:** No guard against `parent_ean = component_ean` in the insert path.
**How to avoid:** Add `CHECK (parent_ean != component_ean)` on `ean_compositions`. For deeper cycles (A→B→A), validate in the application layer on composition INSERT using a graph walk.
**Warning signs:** `process_sale` hangs or triggers timeout; no stack overflow (it's a DB loop, not Python recursion).

### Pitfall 5: SessionMiddleware Cookie Not httpOnly in Older Starlette
**What goes wrong:** `SessionMiddleware` in Starlette < 0.45 does not set the httpOnly flag by default. The signed session cookie is readable by JavaScript.
**Why it happens:** Starlette's session middleware is primarily a convenience utility; httpOnly hardening was added later.
**How to avoid:** Verify Starlette version in the container. If `httponly` kwarg is not available, use a Starlette `Response` middleware override to add the `HttpOnly` flag post-signing. Alternatively, ensure the session cookie carries only an opaque session ID, never raw credentials.
**Warning signs:** `document.cookie` in browser DevTools shows the `session` cookie value.

### Pitfall 6: psycopg2 Pool Exhaustion Under FastAPI Lifespan
**What goes wrong:** Connection pool initialized before `lifespan()` completes, or teardown never called — pool leaks on container restart.
**Why it happens:** FastAPI pre-0.93 didn't have `lifespan`; using `@app.on_event("startup")` instead of the lifespan context manager can cause teardown to be skipped.
**How to avoid:** Use the FastAPI `lifespan` context manager pattern (available since FastAPI 0.93+, stable in 0.110+):
```python
from contextlib import asynccontextmanager
from fastapi import FastAPI

@asynccontextmanager
async def lifespan(app: FastAPI):
    db.init_pool(os.environ["DATABASE_URL"])
    yield
    db.close_pool()

app = FastAPI(lifespan=lifespan)
```
**Warning signs:** `PoolError: exhausted` after many requests; connections visible in `pg_stat_activity` without corresponding API activity.

---

## Code Examples

### Schema DDL Skeleton
```sql
-- Source: SPECS-MVP.md data model; PostgreSQL 15 docs
-- Run via /docker-entrypoint-initdb.d/01_init.sql

CREATE EXTENSION IF NOT EXISTS "pgcrypto";  -- for gen_random_uuid()

CREATE TABLE products (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ean                  TEXT NOT NULL UNIQUE,
    name                 TEXT NOT NULL,
    sku                  TEXT,
    default_reorder_point INTEGER DEFAULT 0,
    is_composite         BOOLEAN NOT NULL DEFAULT FALSE,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE ean_compositions (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_ean     TEXT NOT NULL REFERENCES products(ean) ON DELETE CASCADE,
    component_ean  TEXT NOT NULL REFERENCES products(ean) ON DELETE RESTRICT,
    quantity       INTEGER NOT NULL CHECK (quantity > 0),
    CONSTRAINT no_self_reference CHECK (parent_ean != component_ean),
    UNIQUE (parent_ean, component_ean)
);

CREATE TABLE warehouses (
    id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL
);

CREATE TABLE zones (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    warehouse_id UUID NOT NULL REFERENCES warehouses(id),
    name         TEXT NOT NULL,
    columns      INTEGER NOT NULL,
    levels       INTEGER NOT NULL,
    layout_row   INTEGER NOT NULL DEFAULT 0,
    layout_col   INTEGER NOT NULL DEFAULT 0,
    is_active    BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE shelves (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    zone_id     UUID NOT NULL REFERENCES zones(id) ON DELETE CASCADE,
    column      INTEGER NOT NULL,
    level       INTEGER NOT NULL,
    label       TEXT NOT NULL,
    capacity    INTEGER,
    split_fifo  BOOLEAN NOT NULL DEFAULT FALSE,
    single_bin  BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE stock_lots (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id      UUID NOT NULL REFERENCES products(id),
    shelf_id        UUID REFERENCES shelves(id),
    quantity        INTEGER NOT NULL CHECK (quantity >= 0),
    unit_cost       NUMERIC(12, 4) NOT NULL,
    marketplace     TEXT,
    received_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    source_email_id UUID,  -- FK added after emails table exists
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE fixed_costs (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name          TEXT NOT NULL UNIQUE,
    value         NUMERIC(12, 4) NOT NULL,
    is_percentage BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE transactions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type            TEXT NOT NULL CHECK (type IN ('purchase', 'sale')),
    product_ean     TEXT NOT NULL,
    quantity        INTEGER NOT NULL,
    unit_price      NUMERIC(12, 4),
    total_price     NUMERIC(12, 4),
    marketplace     TEXT,
    order_reference TEXT,
    cogs            NUMERIC(12, 4),
    profit          NUMERIC(12, 4),
    source_email_id UUID,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE emails (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id   TEXT NOT NULL UNIQUE,
    sender       TEXT,
    subject      TEXT,
    marketplace  TEXT,
    parsed_type  TEXT CHECK (parsed_type IN ('purchase', 'sale', NULL)),
    raw_body     TEXT,
    parsed_data  JSONB,
    confidence   NUMERIC(3, 2),
    status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('processed', 'failed', 'review', 'pending')),
    processed_at TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add FK after emails table exists
ALTER TABLE stock_lots ADD CONSTRAINT fk_source_email
    FOREIGN KEY (source_email_id) REFERENCES emails(id);
ALTER TABLE transactions ADD CONSTRAINT fk_source_email
    FOREIGN KEY (source_email_id) REFERENCES emails(id);

-- users table for D-11 single-user auth
CREATE TABLE users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username      TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common query patterns
CREATE INDEX idx_stock_lots_product_received ON stock_lots (product_id, received_at ASC);
CREATE INDEX idx_transactions_created ON transactions (created_at DESC);
CREATE INDEX idx_emails_message_id ON emails (message_id);
```

### Dockerfile for API Container
```dockerfile
# apps/api/Dockerfile
FROM python:3.11-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### Health Check Endpoint
```python
# routers/health.py
from fastapi import APIRouter, Depends
from db import get_conn

router = APIRouter()

@router.get("/api/health")
def health():
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT 1")
    return {"status": "ok"}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `@app.on_event("startup")` | `lifespan` context manager | FastAPI 0.93 (2023) | Cleaner startup/shutdown; on_event deprecated |
| `psycopg2` direct connection | `psycopg2.pool.SimpleConnectionPool` | Always available; now standard practice | Avoids per-request connection cost |
| Pydantic v1 `.dict()` | Pydantic v2 `.model_dump()` | Pydantic v2 (2023); FastAPI 0.100+ | `.dict()` deprecated; use `.model_dump()` |
| PostgreSQL `uuid-ossp` extension | `pgcrypto` extension `gen_random_uuid()` | PostgreSQL 13+ | `pgcrypto` ships with standard distributions; no separate install |

**Deprecated/outdated:**
- `@app.on_event("startup")` / `@app.on_event("shutdown")`: Deprecated in FastAPI 0.93. Use `lifespan` context manager.
- `pydantic.BaseModel.dict()`: Deprecated in Pydantic v2. Use `.model_dump()`.
- `uuid-ossp` extension for UUID generation: `pgcrypto`'s `gen_random_uuid()` is standard in PostgreSQL 13+.

---

## Open Questions

1. **COGS accuracy in `process_sale`**
   - What we know: The function must accumulate unit costs from the lots being deducted.
   - What's unclear: The exact lot-cost lookup inside the function requires querying lot costs at the moment of deduction — not after the UPDATE has already reduced the quantity. The simplest pattern is to SELECT the lot's `unit_cost` before the UPDATE and accumulate it.
   - Recommendation: Planner should make accurate COGS accumulation an explicit implementation step, not an afterthought.

2. **users table seeding**
   - What we know: D-11 requires a single user with a hashed password.
   - What's unclear: Whether the password should be seeded in `init.sql` (requires knowing the bcrypt hash at schema creation time) or via a separate `seed_admin.py` script run after container startup.
   - Recommendation: Use a `seed_admin.py` script called from the container entrypoint after the health check passes. This avoids baking credentials into `init.sql`.

3. **Starlette SessionMiddleware httpOnly flag availability**
   - What we know: The `httponly` kwarg was not always present in older Starlette versions.
   - What's unclear: Whether the installed Starlette version (bundled with FastAPI 0.135.3) exposes `httponly=True` as a direct kwarg.
   - Recommendation: Verify in Starlette source for the pinned version. If absent, implement a response-level middleware to add `HttpOnly` to the Set-Cookie header.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|---------|
| Docker | INFRA-01, INFRA-02 | Yes | 28.5.1 | — |
| Docker Compose | INFRA-02 | Yes | v2.40.2 | — |
| Python 3 | API container build, seed scripts | Yes | 3.13.5 (host); 3.11 (container) | — |
| pip | Package installs | Yes | 26.0.1 | — |
| Node.js | Not needed for this phase | Yes (25.8.2) | — | N/A |
| PostgreSQL CLI (psql) | Schema inspection / debug | No | — | Use `docker exec postgres psql` |

**Missing dependencies with no fallback:** None — all required tools are present.

**Missing dependencies with fallback:**
- `psql` not installed on host — use `docker exec -it <postgres-container> psql -U interwall interwall` for any schema inspection during development.

---

## Project Constraints (from CLAUDE.md)

These directives from the root `CLAUDE.md` apply to all work in this phase:

| Directive | Implication for Phase 1 |
|-----------|------------------------|
| Vanilla JS frontend — do NOT rewrite | Phase 1 must not touch `inventory-omiximo/frontend/` code. The nginx config serves it as-is. |
| All tenant-scoped data must have RLS/membership-aware access | Explicitly deferred (D-10 says no RLS for MVP). Phase 1 schema has no RLS. |
| Use Supabase or equivalent PostgreSQL-backed infrastructure | User overrode to self-hosted PostgreSQL 15 (D-01). This is compliant — "equivalent PostgreSQL-backed infrastructure". |
| GSD workflow entry points required for file changes | All implementation work enters via `/gsd:execute-phase`. |
| FIFO valuation, kit consumption must be first-class backend concerns | Satisfied by D-07, D-08, D-09 (PostgreSQL functions). |
| No tokens in localStorage | Auth is session cookie (D-11). No token storage in frontend during Phase 1. |

---

## Sources

### Primary (HIGH confidence)
- PostgreSQL 15 docs — `SELECT FOR UPDATE`, `FOR UPDATE SKIP LOCKED`, PL/pgSQL, `/docker-entrypoint-initdb.d/`, `gen_random_uuid()`, CHECK constraints
- FastAPI docs (0.135.3) — `lifespan`, `SessionMiddleware`, `Depends`, `Form()` — verified via `pip3 index versions fastapi`
- psycopg2 docs — `SimpleConnectionPool`, `RealDictCursor`, connection context manager — stable API, HIGH confidence
- passlib docs — `bcrypt` hasher, `verify()` pattern
- Starlette docs — `SessionMiddleware` signature
- PyPI registry — all version numbers verified on 2026-04-02

### Secondary (MEDIUM confidence)
- PITFALLS.md (project-internal) — P1 (FIFO race), P4 (schema mismatch), P5 (circular EAN), P9 (auth gap) — authored as part of project planning, MEDIUM confidence
- ARCHITECTURE.md (project-internal) — connection pool sizing, nginx proxy pattern — MEDIUM confidence

### Tertiary (LOW confidence)
- Starlette `httponly` kwarg availability in SessionMiddleware — not directly verified against Starlette changelog for this exact version. Flag for verification during implementation.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — versions confirmed from PyPI on research date
- Architecture: HIGH — patterns are stable PostgreSQL/FastAPI idioms, verified against official docs
- Pitfalls: HIGH for P1/P2/P4/P5 (documented from existing project research + PostgreSQL docs); MEDIUM for P5 (Starlette httpOnly)

**Research date:** 2026-04-02
**Valid until:** 2026-07-02 (90 days — stable libraries; PostgreSQL and FastAPI change slowly)
