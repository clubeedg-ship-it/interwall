# Roadmap: Omiximo Inventory MVP

## Overview

Four phases deliver the brownfield cleanup. Phase 1 lays the PostgreSQL foundation and removes InvenTree. Phase 2 splits the app.js monolith and wires the DB client with EAN composition CRUD. Phase 3 rewires email automation and the profit engine — the core value loop. Phase 4 makes the wall UI and scanner read from the database, completing the reliability story.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Foundation** - PostgreSQL schema, DB functions, and InvenTree removal (completed 2026-04-02)
- [ ] **Phase 2: Frontend Wiring** - app.js split + supabase-js client + EAN composition CRUD
- [ ] **Phase 3: Core Value Loop** - Email automation rewired to DB + profit engine
- [ ] **Phase 4: Wall & Scanner** - Wall UI and scanner reading from database

## Phase Details

### Phase 1: Foundation
**Goal**: The system runs on PostgreSQL without InvenTree, and all atomic business logic is encoded as database functions
**Depends on**: Nothing (first phase)
**Requirements**: DB-01, DB-02, DB-03, DB-04, DB-05, INFRA-01, INFRA-02, INFRA-03
**Success Criteria** (what must be TRUE):
  1. Docker Compose starts the system with no InvenTree, Celery, or Redis containers
  2. PostgreSQL has all business tables (products, ean_compositions, stock_lots, transactions, zones, shelves, fixed_costs, emails) with correct constraints
  3. FIFO deduction DB function processes a sale without negative stock, even with concurrent calls
  4. Single user can authenticate and access the app (session-based, no multi-tenant)
**Plans**: 3 plans

Plans:
- [x] 01-01-PLAN.md — PostgreSQL schema DDL (all tables, constraints, CHECK on quantity >= 0)
- [x] 01-02-PLAN.md — DB functions (FIFO deduction, EAN composition resolution, sale processing workflow)
- [x] 01-03-PLAN.md — Infrastructure: Docker Compose (3 containers), FastAPI skeleton, session auth, nginx proxy

### Phase 2: Frontend Wiring
**Goal**: The frontend loads the supabase-js client via CDN, app.js is split into manageable modules, and EAN compositions can be created and managed from the UI
**Depends on**: Phase 1
**Requirements**: FE-01, FE-02, FE-03, FE-04, FE-05, EAN-01, EAN-02, EAN-03, EAN-04
**Success Criteria** (what must be TRUE):
  1. No single frontend JS file exceeds 500 lines
  2. All innerHTML assignments with user data are sanitized (no raw interpolation)
  3. User can create, edit, and delete EAN compositions from the UI, with compositions persisted in the database
  4. System rejects circular composition references and missing component EANs before saving
  5. Browser localStorage holds only theme and last-view preferences — no business data
**Plans**: 3 plans
**UI hint**: yes

Plans:
- [x] 02-01-PLAN.md — app.js mechanical split into 19 modules + sanitize() XSS utility (FE-01, FE-02)
- [x] 02-02-PLAN.md — FastAPI products + compositions endpoints + auth session cookie rewire (FE-03, FE-04, FE-05, EAN-01..04)
- [x] 02-03-PLAN.md — EAN Compositions CRUD view in browser + end-to-end checkpoint (EAN-01..04, FE-03, FE-04)

### Phase 3: Core Value Loop
**Goal**: Purchase and sale emails are processed automatically — stock IN from purchases, FIFO component deduction from sales, and accurate profit recorded in the database
**Depends on**: Phase 2
**Requirements**: MAIL-01, MAIL-02, MAIL-03, MAIL-04, MAIL-05, PROF-01, PROF-02, PROF-03, PROF-04, PROF-05, PROF-06
**Success Criteria** (what must be TRUE):
  1. A purchase email from MediaMarktSaturn, Bol.com, or Boulanger creates a stock lot with correct EAN, quantity, unit cost, marketplace, and date
  2. A sale email triggers FIFO component deduction via EAN composition and records a transaction with accurate COGS and profit
  3. Sending the same email twice does not create duplicate stock or transactions
  4. Profit dashboard shows profit over time and breakdown by marketplace, sourced from database transactions
  5. Inventory valuation report shows total stock value (quantity × unit cost per lot)
**Plans**: 3 plans

Plans:
- [x] 03-01-PLAN.md — Email poller package (parsers copied, sale_writer, purchase_writer, email_log, poller with APScheduler)
- [ ] 03-02-PLAN.md — FastAPI routers (fixed_costs, profit summary/valuation/transactions, stock_lots) + APScheduler lifespan + docker-compose IMAP vars
- [ ] 03-03-PLAN.md — profit.js rewire to /api/fixed-costs + /api/profit/summary; init.sql fixed_costs seed; human-verify checkpoint

### Phase 4: Wall & Scanner
**Goal**: The wall UI renders zones, shelves, and stock health from the database, scanner assigns products to shelves in the database, and zero browser state is needed to operate the warehouse
**Depends on**: Phase 3
**Requirements**: WALL-01, WALL-02, WALL-03, WALL-04, WALL-05, SCAN-01, SCAN-02
**Success Criteria** (what must be TRUE):
  1. Wall UI loads zones and shelves from the database on every page load — clearing browser data does not change what is displayed
  2. Stock levels across all shelves load in 1-2 queries (no N+1)
  3. Shelf cells are color-coded green/yellow/red based on stock level relative to reorder point
  4. User can add and remove zones with column and level configuration, persisted in the database
  5. Barcode scan looks up product by EAN and lets user assign it to a shelf, updating the stock lot in the database
**Plans**: 3 plans
**UI hint**: yes

Plans:
- [ ] 04-01: Zone and shelf config from DB (replace localStorage zone/shelf state)
- [ ] 04-02: Wall rendering from DB with batch stock query and health color coding
- [ ] 04-03: Scanner shelf assignment from DB

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 3/3 | Complete   | 2026-04-02 |
| 2. Frontend Wiring | 1/3 | In Progress|  |
| 3. Core Value Loop | 1/3 | In Progress|  |
| 4. Wall & Scanner | 0/3 | Not started | - |
