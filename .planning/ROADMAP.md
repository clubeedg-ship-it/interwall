# Roadmap: interwall

## Overview

This roadmap rebuilds the Omiximo prototype into `interwall`, a unified multi-tenant inventory platform with its own backend, modern frontend, built-in email automation, durable stock and order workflows, and analytics that stay consistent with FIFO and kit-cost rules.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Tenant-Safe Foundation** - Establish the new stack, authentication, tenant model, and row-level security. (completed 2026-04-01)
- [x] **Phase 2: Inventory Core Model** - Build the core product, warehouse, zone, shelf, and stock data model. (completed 2026-04-01)
- [ ] **Phase 3: Wall Experience** - Recreate the warehouse UI and scanning-oriented workflows in the new frontend.
- [ ] **Phase 4: Orders & FIFO Ledger** - Implement durable purchase/sales order flows and FIFO-backed stock movement.
- [ ] **Phase 5: Kits & Costing** - Add bill-of-materials logic and profit-aware kit consumption.
- [ ] **Phase 6: Email Automation** - Internalize mailbox ingestion, parsing, review, and order creation.
- [ ] **Phase 7: Reorder, Reporting & Admin** - Add reorder-point automation, dashboards, audit visibility, and tenant settings.
- [ ] **Phase 8: Quality, Migration & Launch Readiness** - Finish verification, migration guidance, and production readiness work.

## Phase Details

### Phase 1: Tenant-Safe Foundation
**Goal**: The new platform has a secure multi-tenant foundation with authenticated users, memberships, and tenant-isolated data access.
**Depends on**: Nothing (first phase)
**Requirements**: TEN-01, TEN-02, TEN-03
**Success Criteria** (what must be TRUE):
  1. User can sign in and operate within an active organization context.
  2. Admin can manage memberships and roles for a tenant.
  3. Tenant-scoped records are protected by row-level security and cannot leak across organizations.
  4. The codebase has a clear `apps/web` frontend, `packages/*` shared layer, and `supabase/` backend structure for the rebuild.
**Plans**: 7 plans
Plans:
- [x] `01-01-PLAN.md` — Bootstrap the monorepo workspace and package manifests.
- [x] `01-02-PLAN.md` — Create the web app shell, shared tenancy contracts, and shared UI baseline.
- [x] `01-03-PLAN.md` — Add the `@interwall/web` app test harness and Vitest/jsdom setup.
- [x] `01-07-PLAN.md` — Establish the explicit `supabase/functions` backend boundary for privileged tenant/auth logic.
- [x] `01-04-PLAN.md` — Create the Supabase tenancy schema, RLS policies, and active-tenant server helpers.
- [x] `01-05-PLAN.md` — Implement sign-in, middleware gating, organization selection, and workspace landing.
- [x] `01-06-PLAN.md` — Implement membership administration UI and admin-only actions.
**UI hint**: yes

### Phase 2: Inventory Core Model
**Goal**: Products, warehouses, zones, shelves, and stock exist in the new schema with durable persistence and operational APIs.
**Depends on**: Phase 1
**Requirements**: INV-01, INV-02
**Success Criteria** (what must be TRUE):
  1. User can create and manage products with identifiers, reorder settings, and stock metadata.
  2. User can define warehouses, zones, and shelves without relying on localStorage.
  3. The backend persists all inventory structure and stock records in the new tenant-aware schema.
**Plans**: 3 plans
Plans:
- [x] `02-01-PLAN.md` — Define the shared inventory contracts for products, warehouse topology, and stock operations.
- [x] `02-02-PLAN.md` — Create the tenant-safe Supabase schema, lineage guards, and RLS policies for the inventory core model.
- [x] `02-03-PLAN.md` — Implement tenant-scoped inventory repositories and the trusted stock mutation backend surface.

### Phase 3: Wall Experience
**Goal**: The new frontend reproduces the recognizable Omiximo wall UI and barcode-friendly workflows on the modern stack.
**Depends on**: Phase 2
**Requirements**: INV-03, UI-01, UI-02
**Success Criteria** (what must be TRUE):
  1. User can browse the wall-style warehouse UI with shelf-level stock and reorder-state visibility.
  2. User can use responsive pages across desktop, tablet, and mobile form factors.
  3. User can use barcode-driven lookup or stock actions on supported devices.
  4. The interface preserves the intended Omiximo visual identity while using maintainable React components.
**Plans**: TBD
**UI hint**: yes

### Phase 4: Orders & FIFO Ledger
**Goal**: Purchase and sales orders drive durable stock movement and FIFO-backed inventory accounting.
**Depends on**: Phase 3
**Requirements**: INV-04, ORD-01, ORD-02, ORD-03
**Success Criteria** (what must be TRUE):
  1. User can create and update purchase and sales orders with line items and statuses.
  2. Receiving a purchase order increases stock in the correct warehouse context.
  3. Shipping or confirming a sale reduces stock through durable transaction records.
  4. FIFO stock consumption is used for inventory valuation and order-cost accounting.
**Plans**: TBD
**UI hint**: yes

### Phase 5: Kits & Costing
**Goal**: Kits/BOMs work as first-class entities and their sales correctly affect component stock and profitability.
**Depends on**: Phase 4
**Requirements**: KIT-01, KIT-02, KIT-03
**Success Criteria** (what must be TRUE):
  1. User can define kits with component lines and fixed costs.
  2. Selling a kit automatically consumes the correct component quantities.
  3. Profit calculations include FIFO component costs plus fixed kit costs.
**Plans**: TBD
**UI hint**: yes

### Phase 6: Email Automation
**Goal**: Email ingestion is built into the platform and can reliably create traceable orders with review for uncertain cases.
**Depends on**: Phase 5
**Requirements**: MAIL-01, MAIL-02, MAIL-03, MAIL-04
**Success Criteria** (what must be TRUE):
  1. Tenant can configure mailbox connections and mapping rules in the product.
  2. Incoming emails can create purchase or sales orders linked back to the source message.
  3. Low-confidence parses enter a review queue instead of silently generating bad records.
  4. Reprocessing the same message does not create duplicate orders.
**Plans**: TBD
**UI hint**: yes

### Phase 7: Reorder, Reporting & Admin
**Goal**: The platform provides reorder-point logic, operational reporting, dashboards, and admin visibility.
**Depends on**: Phase 6
**Requirements**: ROP-01, ROP-02, REP-01, REP-02, ADM-01
**Success Criteria** (what must be TRUE):
  1. System calculates reorder points and flags replenishment candidates correctly.
  2. User can view profitability, stock value, and reorder dashboards with useful filters.
  3. Reported profit and stock value remain consistent with FIFO and kit costing.
  4. Admin can inspect audit logs and tenant-level operational settings.
**Plans**: TBD
**UI hint**: yes

### Phase 8: Quality, Migration & Launch Readiness
**Goal**: The system is tested, documented, and ready for production rollout from the prototype ecosystem.
**Depends on**: Phase 7
**Requirements**: QLT-01
**Success Criteria** (what must be TRUE):
  1. Critical business logic is covered by automated unit, integration, and end-to-end tests.
  2. Deployment and development documentation exist for the new platform.
  3. Migration guidance exists for users moving from the prototype environment.
  4. Production rollout risks are documented and reduced to an acceptable level.
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Tenant-Safe Foundation | 7/7 | Complete    | 2026-04-01 |
| 2. Inventory Core Model | 3/3 | Complete | 2026-04-01 |
| 3. Wall Experience | 0/0 | Not started | - |
| 4. Orders & FIFO Ledger | 0/0 | Not started | - |
| 5. Kits & Costing | 0/0 | Not started | - |
| 6. Email Automation | 0/0 | Not started | - |
| 7. Reorder, Reporting & Admin | 0/0 | Not started | - |
| 8. Quality, Migration & Launch Readiness | 0/0 | Not started | - |
