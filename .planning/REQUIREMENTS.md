# Requirements: Omiximo Inventory MVP

**Defined:** 2026-04-02
**Core Value:** When a sale email arrives, the system auto-deducts component stock via EAN compositions, computes FIFO-based profit including fixed costs, and records everything durably in the database.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Database & Schema

- [x] **DB-01**: PostgreSQL schema exists with all business tables (products, ean_compositions, stock_lots, transactions, zones, shelves, warehouses, fixed_costs, emails)
- [x] **DB-02**: Atomic FIFO stock deduction implemented as PostgreSQL function with SELECT FOR UPDATE to prevent race conditions
- [x] **DB-03**: EAN composition resolution implemented as PostgreSQL function (returns all components with quantities for a parent EAN)
- [x] **DB-04**: Sale processing workflow implemented as PostgreSQL function (resolve composition → deduct components FIFO → compute COGS → record transaction)
- [x] **DB-05**: CHECK constraint on stock_lots.quantity >= 0 prevents negative inventory

### EAN Compositions

- [ ] **EAN-01**: User can create EAN composition mapping a parent product to component products with quantities
- [ ] **EAN-02**: User can edit and delete existing EAN compositions
- [ ] **EAN-03**: System prevents circular references in EAN compositions (A→B→A)
- [ ] **EAN-04**: System validates that component EANs exist as products before saving composition

### Email Automation

- [ ] **MAIL-01**: Purchase emails from MediaMarktSaturn, Bol.com, and Boulanger are parsed and create stock lots with correct EAN, quantity, unit cost, marketplace, and date
- [ ] **MAIL-02**: Sale emails trigger FIFO component deduction via EAN composition lookup and record transaction with accurate COGS and profit
- [ ] **MAIL-03**: Duplicate emails are rejected via unique message_id constraint (no double-processing)
- [ ] **MAIL-04**: Email service writes directly to PostgreSQL (not InvenTree API)
- [ ] **MAIL-05**: Processed emails are logged in emails table with parsed data and confidence score

### Profit Engine

- [ ] **PROF-01**: COGS calculated from FIFO component lot costs at point of sale deduction
- [ ] **PROF-02**: Fixed costs configurable in database (VAT as %, commission as %, overhead as fixed amount)
- [ ] **PROF-03**: Profit = sale price − COGS − fixed costs, stored on each sale transaction
- [ ] **PROF-04**: Profit dashboard shows profit over time (daily/weekly/monthly) from database transactions
- [ ] **PROF-05**: Profit dashboard shows breakdown by marketplace
- [ ] **PROF-06**: Inventory valuation report shows total stock value (sum of quantity × unit cost)

### Wall UI & Warehouse

- [ ] **WALL-01**: Wall UI renders zones and shelves from database (not localStorage)
- [ ] **WALL-02**: Stock levels displayed via batch query (1-2 queries, not N+1)
- [ ] **WALL-03**: Shelf health color coded (green/yellow/red based on reorder point)
- [ ] **WALL-04**: Zone and shelf configuration persisted in database and survives browser clear
- [ ] **WALL-05**: User can add/remove zones with column/level configuration

### Scanner

- [ ] **SCAN-01**: Barcode scan looks up product by EAN in database
- [ ] **SCAN-02**: User can assign scanned product to a shelf location (updates stock lot in database)

### Frontend Cleanup

- [ ] **FE-01**: app.js split into modules (no file >500 lines)
- [ ] **FE-02**: All innerHTML with user data sanitized (XSS prevention)
- [ ] **FE-03**: All InvenTree API calls replaced with database queries
- [ ] **FE-04**: Zero localStorage for business data (theme and last-view only)
- [ ] **FE-05**: Frontend loads supabase-js via CDN (no build step)

### Infrastructure

- [ ] **INFRA-01**: System runs without InvenTree containers (no Django, Celery, Redis dependency)
- [ ] **INFRA-02**: Docker Compose config for PostgreSQL (or Supabase) + email service only
- [ ] **INFRA-03**: Simple session-based auth (single user, no multi-tenant)

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Enhanced Email

- **MAIL-V2-01**: Low-confidence email review queue UI for manual approval
- **MAIL-V2-02**: Additional marketplace parser support (Amazon, eBay)

### Advanced Warehouse

- **WALL-V2-01**: Drag-and-drop shelf rearrangement
- **WALL-V2-02**: Camera-based barcode scanning (mobile)

### Reporting

- **REP-V2-01**: Reorder point automation (auto-generate draft purchase orders)
- **REP-V2-02**: Export reports to CSV/PDF

### Platform

- **PLAT-V2-01**: Multi-tenant support with RLS
- **PLAT-V2-02**: CI/CD pipeline
- **PLAT-V2-03**: React/Next.js frontend rewrite

## Out of Scope

| Feature | Reason |
|---------|--------|
| Multi-tenant / organizations | Single business, single user — complexity not justified |
| User roles and permissions | Single operator — no access control needed |
| Label/barcode printing | Not needed for core workflow |
| Real-time WebSocket updates | Polling is sufficient for single user |
| Migration from old InvenTree data | Fresh start — old data not worth migrating |
| Internationalization | Single business in Netherlands — Dutch/English only |
| Mobile app | Web SPA is sufficient for warehouse use |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| DB-01 | Phase 1 | Complete |
| DB-02 | Phase 1 | Complete |
| DB-03 | Phase 1 | Complete |
| DB-04 | Phase 1 | Complete |
| DB-05 | Phase 1 | Complete |
| INFRA-01 | Phase 1 | Pending |
| INFRA-02 | Phase 1 | Pending |
| INFRA-03 | Phase 1 | Pending |
| FE-01 | Phase 2 | Pending |
| FE-02 | Phase 2 | Pending |
| FE-03 | Phase 2 | Pending |
| FE-04 | Phase 2 | Pending |
| FE-05 | Phase 2 | Pending |
| EAN-01 | Phase 2 | Pending |
| EAN-02 | Phase 2 | Pending |
| EAN-03 | Phase 2 | Pending |
| EAN-04 | Phase 2 | Pending |
| MAIL-01 | Phase 3 | Pending |
| MAIL-02 | Phase 3 | Pending |
| MAIL-03 | Phase 3 | Pending |
| MAIL-04 | Phase 3 | Pending |
| MAIL-05 | Phase 3 | Pending |
| PROF-01 | Phase 3 | Pending |
| PROF-02 | Phase 3 | Pending |
| PROF-03 | Phase 3 | Pending |
| PROF-04 | Phase 3 | Pending |
| PROF-05 | Phase 3 | Pending |
| PROF-06 | Phase 3 | Pending |
| WALL-01 | Phase 4 | Pending |
| WALL-02 | Phase 4 | Pending |
| WALL-03 | Phase 4 | Pending |
| WALL-04 | Phase 4 | Pending |
| WALL-05 | Phase 4 | Pending |
| SCAN-01 | Phase 4 | Pending |
| SCAN-02 | Phase 4 | Pending |

**Coverage:**
- v1 requirements: 35 total
- Mapped to phases: 35
- Unmapped: 0 ✓

---
*Requirements defined: 2026-04-02*
*Last updated: 2026-04-02 after roadmap creation*
