# Requirements: interwall

**Defined:** 2026-04-01
**Core Value:** Businesses can manage inventory, orders, kits, email-driven automation, and profitability in one durable multi-tenant system without the sync failures and architectural fragmentation of the prototype.

## v1 Requirements

### Tenancy & Access

- [x] **TEN-01**: User can belong to one or more organizations and only access data for the active tenant
- [x] **TEN-02**: Admin can manage memberships and roles for a tenant
- [x] **TEN-03**: Tenant-scoped data access is enforced through row-level security and membership-aware policies

### Inventory Model

- [x] **INV-01**: User can create and manage products with SKU/EAN, barcode, reorder settings, and stock metadata
- [x] **INV-02**: User can manage warehouses, zones, and shelves with persistent database-backed configuration
- [ ] **INV-03**: User can view shelf status with color-coded reorder indicators based on stock versus reorder thresholds
- [ ] **INV-04**: System values stock and consumes inventory using FIFO rules

### Orders

- [ ] **ORD-01**: User can create and manage purchase orders with line items and receiving workflows
- [ ] **ORD-02**: User can create and manage sales orders with line items, statuses, and manual editing
- [ ] **ORD-03**: Purchase orders increase stock and sales orders decrease stock through durable transaction records

### Kits & BOM

- [ ] **KIT-01**: User can define kits with component products, quantities, and fixed costs
- [ ] **KIT-02**: System automatically decrements component stock when a kit is sold
- [ ] **KIT-03**: Profit calculations for kits include both FIFO component costs and fixed kit costs

### Email Automation

- [ ] **MAIL-01**: Tenant can configure mailbox connections and mapping rules for email ingestion
- [ ] **MAIL-02**: System can parse incoming emails into purchase or sales orders with traceability to the source email
- [ ] **MAIL-03**: Low-confidence email parses are routed to a review queue instead of silently creating bad data
- [ ] **MAIL-04**: Email ingestion is idempotent so repeated polling does not create duplicate orders

### Reorder & Analytics

- [ ] **ROP-01**: System calculates reorder points from demand during lead time and safety stock
- [ ] **ROP-02**: System flags items below reorder point and can support replenishment workflows
- [ ] **REP-01**: User can view dashboards for profitability, stock value, reorder status, and date-filtered reporting
- [ ] **REP-02**: Profit and stock value reports stay consistent with FIFO and kit cost calculations

### UX & Platform

- [x] **UI-01**: User can operate the system through a responsive Next.js interface that preserves the Omiximo wall aesthetic
- [ ] **UI-02**: User can use barcode-driven product lookup and stock workflows on supported devices
- [ ] **ADM-01**: Admin can access audit logs, email automation settings, and tenant-level system settings
- [ ] **QLT-01**: Critical business logic is covered by automated unit, integration, and end-to-end tests

## v2 Requirements

### Expansion

- **ROP-03**: System can auto-generate draft purchase orders for replenishment candidates
- **I18N-01**: User can switch locale/language for internationalized workflows
- **MIG-01**: Existing prototype users can run assisted migration tooling for products, configuration, and historical orders

## Out of Scope

| Feature | Reason |
|---------|--------|
| Keeping the old dual-storage prototype architecture | Conflicts with the rebuild objective and single-source-of-truth requirement |
| Exposing privileged backend credentials to the client | Violates the security requirements in the spec |
| Treating legacy code as the final architecture | The old repos are reference material, not the target platform |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| TEN-01 | Phase 1 | Complete |
| TEN-02 | Phase 1 | Complete |
| TEN-03 | Phase 1 | Complete |
| INV-01 | Phase 2 | Complete |
| INV-02 | Phase 2 | Complete |
| INV-03 | Phase 3 | Pending |
| INV-04 | Phase 4 | Pending |
| ORD-01 | Phase 4 | Pending |
| ORD-02 | Phase 4 | Pending |
| ORD-03 | Phase 4 | Pending |
| KIT-01 | Phase 5 | Pending |
| KIT-02 | Phase 5 | Pending |
| KIT-03 | Phase 5 | Pending |
| MAIL-01 | Phase 6 | Pending |
| MAIL-02 | Phase 6 | Pending |
| MAIL-03 | Phase 6 | Pending |
| MAIL-04 | Phase 6 | Pending |
| ROP-01 | Phase 7 | Pending |
| ROP-02 | Phase 7 | Pending |
| REP-01 | Phase 7 | Pending |
| REP-02 | Phase 7 | Pending |
| UI-01 | Phase 3 | Complete |
| UI-02 | Phase 3 | Pending |
| ADM-01 | Phase 7 | Pending |
| QLT-01 | Phase 8 | Pending |

**Coverage:**
- v1 requirements: 25 total
- Mapped to phases: 25
- Unmapped: 0

---
*Requirements defined: 2026-04-01*
*Last updated: 2026-04-01 after reading SPECS.md*
