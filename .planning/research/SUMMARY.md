# Research Summary: Omiximo Inventory MVP

**Project:** Brownfield cleanup of legacy Omiximo inventory system
**Researched:** 2026-04-02

---

## Key Findings

### Stack
- **Supabase (hosted or self-hosted PostgreSQL)** as the single database — replaces InvenTree entirely
- **supabase-js** loaded via CDN for vanilla JS frontend (no build step needed)
- **Python email service connects directly to PostgreSQL** via psycopg2/psycopg3 — it's a trusted backend process, no need for API mediation
- **PostgreSQL functions (RPC)** for atomic business logic: FIFO deduction, composition resolution, sale processing
- Architecture research recommends a **thin REST API** (Node.js/Fastify or Python/FastAPI) between browser and DB, with the Python email service connecting directly. Alternative: Supabase client direct from browser (simpler but less control).

### Table Stakes (Must Work or System is Broken)
1. **EAN composition management** — parent → component mappings
2. **Purchase email → stock IN** — existing parsers rewired to new DB
3. **Sale email → FIFO component deduction** — the core value loop, must be atomic
4. **Profit calculation** — COGS from FIFO + fixed costs (VAT, commission, overhead)
5. **Wall UI from database** — zones, shelves, stock levels (batch query, not N+1)
6. **All business data in PostgreSQL** — zero localStorage dependency
7. **app.js split** — unblocks all frontend modification work
8. **InvenTree removal** — eliminate dependency on second infrastructure stack

### Watch Out For (Top Pitfalls)
1. **FIFO race condition** (CRITICAL) — two concurrent sale emails depleting same stock lot. Fix: `SELECT FOR UPDATE` + single-transaction processing
2. **Premature localStorage removal** — removing reads before DB replacement is wired causes broken frontend. Fix: add DB reads first, then remove localStorage
3. **app.js split regressions** — breaking cross-module references during monolith split. Fix: mechanical extraction only, no logic changes, keep init order
4. **Schema mismatch JS/Python** — both clients must use identical column names and types. Fix: single schema migration as source of truth
5. **N+1 migrated not fixed** — replacing API calls 1:1 preserves the performance problem. Fix: batch queries from day one

### Architecture Decision: API Layer

Two viable approaches identified:

| Approach | Pros | Cons |
|----------|------|------|
| **Supabase client direct** | Zero API code, fastest to ship, CDN-loadable | Less control over business logic, RPC for complex ops |
| **Thin REST API** (Fastify/FastAPI) | Full control, custom auth, business logic in one place | More code to write and maintain |

**Recommendation:** Start with Supabase client direct for CRUD, use PostgreSQL functions (RPC) for atomic operations (FIFO deduction, sale processing). Add a thin API only if complexity demands it.

### Build Order (from dependency analysis)

```
1. PostgreSQL schema + DB functions (unblocks everything)
2. app.js split into modules (unblocks frontend work)
3. Frontend DB client (supabase-js wiring, replace api.request())
4. Products + EAN compositions CRUD
5. Email service rewired to new DB (purchases first)
6. Sale processing + FIFO deduction (core value loop)
7. Profit engine from DB transactions
8. Wall UI + zones/shelves from DB
9. Scanner shelf assignment
```

Steps 4-9 have some parallelism, but the schema and app.js split are strict prerequisites.

---

## Confidence Assessment

| Area | Level | Notes |
|------|-------|-------|
| Stack choice (Supabase) | HIGH | Well-suited for vanilla JS + PostgreSQL, CDN-loadable client |
| Feature scope | HIGH | Locked by SPECS-MVP.md, no ambiguity |
| Architecture | HIGH (core), MEDIUM (API layer choice) | Direct client vs thin API is a tradeoff, not a clear winner |
| Pitfalls | HIGH | Specific to this codebase, actionable prevention strategies |
| Build order | HIGH | Dependency chain is clear from code analysis |

---

## Open Questions for Planning

1. **Supabase hosted vs self-hosted?** — Hosted is faster to start; self-hosted gives full control
2. **Thin API vs Supabase direct?** — Affects how much server-side code we write
3. **Email service: keep hourly cron or switch to continuous?** — Hourly is fine for MVP

---
*Synthesized: 2026-04-02*
