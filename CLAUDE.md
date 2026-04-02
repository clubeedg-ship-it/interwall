<!-- GSD:project-start source:PROJECT.md -->
## Project

**Omiximo Inventory OS — Minimal MVP**

A cleanup and rewiring of the existing Omiximo inventory management system for a small PC assembly business. The legacy vanilla JS frontend stays as-is; the backend moves from InvenTree API + localStorage to a direct PostgreSQL database. Email-driven stock management and FIFO profit calculation are the core value loop.

**Core Value:** When a sale email arrives, the system auto-deducts component stock via EAN compositions, computes FIFO-based profit including fixed costs, and records everything durably in the database — no manual intervention, no browser cache dependency.

### Constraints

- **Frontend**: Keep existing vanilla JS SPA — only touch localStorage→DB wiring, XSS fixes, and code organization
- **Database**: PostgreSQL (Supabase or self-hosted) — single source of truth for all business data
- **Email service**: Keep existing Python IMAP service — rewire output to new database
- **No InvenTree**: System must run without InvenTree containers (no Django, Celery, Redis dependency)
- **Single tenant**: No multi-tenant complexity — one business, one database
- **Spec**: SPECS-MVP.md is the authoritative scope document
<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->
## Technology Stack

## Context
## Recommendation: Supabase (Hosted or Self-Hosted)
### Why Supabase
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
- PostgreSQL 15 (self-hosted via Docker)
- Express.js thin REST API (or Deno/Hono)
- pg npm package for Node.js DB access
- psycopg2 for Python DB access
- Custom auth middleware (session cookies)
## Frontend Integration Pattern
## Python Integration Pattern
# Replace: InvenTreeClient.get_part_by_sku(sku)
# With:
# For atomic FIFO deduction — use RPC (database function):
## Database Functions for Business Logic
## Migration Path from InvenTree
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd:quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd:debug` for investigation and bug fixing
- `/gsd:execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd:profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
