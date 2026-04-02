# Stack Research: Omiximo Inventory MVP

## Context

Brownfield cleanup. Vanilla JS SPA frontend stays. InvenTree backend removed. Need a thin API layer to PostgreSQL that both the JS frontend and Python email service can use.

## Recommendation: Supabase (Hosted or Self-Hosted)

**Confidence: HIGH**

### Why Supabase

1. **supabase-js client works from vanilla JS** — no framework required, loads via CDN or script tag
2. **Python client exists** (`supabase-py`) — email service can use same database with same auth model
3. **PostgREST built-in** — auto-generates REST API from PostgreSQL schema, no custom API code needed
4. **Row-level security** — even though single tenant now, RLS is free insurance
5. **Realtime subscriptions** — future upgrade path for live wall updates (not MVP, but free)
6. **Auth built-in** — simple session-based auth without building a custom auth layer
7. **Edge Functions (Deno)** — for any server-side logic that can't be a direct DB call (FIFO atomicity)

### Specific Stack

| Layer | Choice | Version | Rationale |
|-------|--------|---------|-----------|
| **Database** | PostgreSQL (via Supabase) | 15+ | Supabase manages this; FIFO queries, JSONB, transactions |
| **API Layer** | PostgREST (via Supabase) | Built-in | Auto-REST from schema — zero custom API code for CRUD |
| **Frontend DB Client** | @supabase/supabase-js | 2.x | CDN-loadable, works in vanilla JS, handles auth + queries |
| **Python DB Client** | supabase-py | 2.x | Same query interface as JS client |
| **Python DB Alternative** | psycopg2 / asyncpg | 3.x / 0.29+ | Direct PostgreSQL for complex transactions (FIFO deduction) |
| **Server Functions** | Supabase Edge Functions (Deno) | — | Atomic FIFO deduction, composition resolution |
| **Auth** | Supabase Auth | Built-in | Simple email/password, session cookies |
| **Frontend** | Vanilla ES6+ JS | — | **No change** — existing SPA stays |
| **Email Service** | Python 3.11 | 3.11 | **No change** — existing IMAP poller stays |
| **Container** | Docker Compose | v2 | Simplified — just Supabase + email service |

### What NOT to Use

| Avoided | Why |
|---------|-----|
| **Express/Fastify custom API** | PostgREST covers CRUD; custom API is unnecessary code to maintain |
| **Django/Flask for API** | Adding another Python web framework when PostgREST exists is overengineering |
| **React/Next.js** | Frontend works, rewrite is out of scope |
| **Prisma/Drizzle ORM** | These are Node.js ORMs — we don't have a Node.js backend |
| **Firebase/MongoDB** | Relational data (compositions, FIFO lots) needs PostgreSQL |
| **Redis** | No caching layer needed for single-tenant with batch queries |

### Alternative: Self-Hosted PostgreSQL + Express API

**Confidence: MEDIUM** — viable but more work

If Supabase is rejected (cost, preference), the fallback is:
- PostgreSQL 15 (self-hosted via Docker)
- Express.js thin REST API (or Deno/Hono)
- pg npm package for Node.js DB access
- psycopg2 for Python DB access
- Custom auth middleware (session cookies)

This requires writing ~500-800 lines of API route code that Supabase gives for free.

## Frontend Integration Pattern

```javascript
// Load via CDN (no build step)
// <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Replace: api.request('/part/?limit=50')
// With:
const { data, error } = await supabase
  .from('products')
  .select('*')
  .limit(50);

// Replace: api.request('/stock/', { method: 'POST', body: ... })
// With:
const { data, error } = await supabase
  .from('stock_lots')
  .insert({ product_id, quantity, unit_cost, shelf_id });
```

## Python Integration Pattern

```python
# Replace: InvenTreeClient.get_part_by_sku(sku)
# With:
from supabase import create_client
supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

result = supabase.table('products').select('*').eq('ean', ean).execute()

# For atomic FIFO deduction — use RPC (database function):
result = supabase.rpc('deduct_fifo_stock', {
    'p_product_ean': ean,
    'p_quantity': qty
}).execute()
```

## Database Functions for Business Logic

Complex operations (FIFO deduction, composition resolution) should be PostgreSQL functions called via RPC, not client-side logic:

1. **`deduct_fifo_stock(ean, quantity)`** — atomic FIFO consumption with `SELECT FOR UPDATE`
2. **`resolve_composition(parent_ean)`** — returns all components with quantities
3. **`process_sale(parent_ean, quantity, sale_price, marketplace)`** — full sale workflow: resolve composition → deduct each component FIFO → compute COGS → record transaction

This keeps business logic atomic and prevents race conditions between concurrent email processing.

## Migration Path from InvenTree

The frontend currently calls `api.request()` which wraps `fetch()` to InvenTree. The migration:

1. Create `db.js` module that wraps `supabase.from()` calls
2. Replace `api.request()` calls one-by-one with `db.query()` equivalents
3. Remove `api` module when all calls migrated
4. Remove InvenTree Docker containers

---
*Researched: 2026-04-02*
