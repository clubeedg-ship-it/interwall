# Feature Landscape

**Domain:** Single-tenant PC assembly inventory — email-driven stock management with FIFO profit calculation
**Researched:** 2026-04-02
**Scope:** Omiximo MVP cleanup, not greenfield SaaS

---

## Context

This is NOT a general inventory system. It is a purpose-built tool for one PC assembly business that:
- Buys components from European marketplaces (MediaMarktSaturn, Bol.com, Boulanger)
- Assembles PCs from those components
- Sells assembled PCs on the same marketplaces
- Processes stock changes primarily through email parsing, not manual data entry
- Needs FIFO-accurate profit calculation including VAT, commission, and overhead fixed costs

The feature set is locked by SPECS-MVP.md. This document categorizes and clarifies complexity/dependencies — it does not expand scope.

---

## Table Stakes

Features where the system is broken without them. These are the reasons the MVP exists.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| FIFO stock lot tracking | Core valuation method; COGS must be calculated from oldest purchase lots first | Medium | `stock_lots` table with `received_at` sort key; depletion must be atomic to prevent double-spend |
| EAN composition ("piece builder") | Without this, a sale email cannot deduct the right components — system is fundamentally broken | Medium | Parent-to-component mapping with quantities; validates no circular refs; components must exist |
| Purchase email → stock IN | Primary input mechanism; all component inventory comes in via email | High | Existing Python parsers for 3 marketplaces; rewire output from InvenTree API to PostgreSQL direct |
| Sale email → FIFO component deduction | Core value loop: sale triggers composition lookup then FIFO depletion across all components | High | Most complex path; must be atomic; must compute COGS at point of deduction |
| Profit calculation (COGS + fixed costs) | Without this, there is no financial visibility — the whole reason for tracking stock accurately | Medium | COGS from FIFO lot costs; fixed costs as percentage (VAT 21%, commission ~6.2%) + fixed amount (~€95 overhead) |
| Email deduplication | Without message_id dedup, reprocessed emails would double-count stock | Low | `emails.message_id` unique constraint; check before processing |
| Product catalog CRUD | Can't define compositions or track stock without a product registry | Low | EAN as primary identifier; name, SKU, is_composite flag |
| Wall UI from database | Current system loses zone/shelf config on browser clear — this is the reported reliability failure | Medium | Batch query: all zones + shelves + stock counts in one round trip; replace N+1 InvenTree calls |
| Zone/shelf config in database | localStorage config loss is a primary user pain point | Low | Zones, shelves, capacity, split_fifo flag — all persisted server-side |
| Scanner → shelf assignment | Physical sync layer; without it, stock lot location data is useless | Low | Scan EAN, look up product, show lots, assign/move to shelf |
| app.js split into modules | Current 4,485-line monolith is unmaintainable and blocks all other work | High | Split into ≤500 line modules; prerequisite for safe modification of any frontend logic |
| Remove InvenTree dependency | System cannot run portably while requiring Django/Celery/Redis | High | Replaces all `api.request()` calls; major rewiring effort |
| Eliminate localStorage for business data | Cross-device data loss is the core reliability failure this MVP fixes | Medium | Theme and last-view are acceptable; everything else to DB |

---

## Differentiators

Features that go beyond the baseline and add specific value for this use case. Not expected by default, but worth building for this domain.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Per-shelf FIFO bin rotation (A/B bins) | Physical warehouse layout encodes FIFO rotation — prevents manual reordering of physical stock | Low | `split_fifo` boolean on shelf; existing naming convention `{Zone}-{Col}-{Level}-A/B` carries over |
| Email parse confidence scoring | Prevents silent data corruption from misread emails | Medium | `emails.confidence` score; emails below threshold go to 'review' status for manual inspection |
| Profit dashboard per marketplace | Bol.com vs MediaMarktSaturn commission rates differ; per-marketplace margin breakdown reveals true profitability by channel | Medium | Aggregate from `transactions` table grouped by marketplace |
| Inventory valuation report | Sum of (stock_lots.quantity × unit_cost) gives current asset value; useful for financial reporting | Low | Single aggregation query over `stock_lots` |
| Order reference traceability | Linking `transactions` to source email via `source_email_id` enables auditing individual sales | Low | Already in schema; mostly about surfacing it in UI |
| Stock health color coding on wall | Visual at-a-glance low stock warning reduces out-of-stock risk during assembly | Low | Compare current stock to `default_reorder_point`; color thresholds green/amber/red |
| Batch query wall load | Replacing N+1 InvenTree API calls with a single join query; currently the wall is slow and hammers the backend | Medium | One query: zones → shelves → stock_lots aggregated by shelf |

---

## Anti-Features

Things to deliberately NOT build in the MVP. Each one would add complexity without payoff at this scale.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Multi-tenant / RLS | Single business, single user; adds schema complexity, policy layers, and onboarding friction for zero benefit | Single schema, no tenant_id columns |
| User roles and permissions | One person runs this system; role machinery is overhead | Single session-based auth; no role checks |
| Review queue UI for low-confidence emails | Building a UI for this is significant work; emails needing review are rare | Log to `emails` table with status='review'; fix manually via DB or future phase |
| Reorder point automation (auto-PO) | Purchase decisions require human judgment about pricing and supplier availability | Show warning indicator when stock < reorder_point; manual action from there |
| Label printing | Not needed for this workflow; EAN codes come from supplier barcodes | Skip entirely |
| Camera-based barcode scanning | USB scanner is already working and sufficient for a warehouse with one operator | USB scanner input only |
| Real-time WebSocket updates | Single user; no concurrent editing conflict; polling is fine | Poll every N seconds if needed; no WebSocket complexity |
| Drag-and-drop shelf rearrangement | Zone/shelf config changes rarely; form-based config is adequate | Simple CRUD form for zone/shelf settings |
| Internationalization | Single business, Dutch and French emails are parsed by existing Python code; UI is internal | Hard-code UI language; parser handles NL/FR input already |
| Migration from InvenTree data | Fresh start is lower risk than data migration; existing data has quality issues | Start with empty database; re-enter current stock manually or via email reprocessing |
| Kit fixed costs as separate entity | Global fixed costs (VAT, commission, overhead) are uniform across all products for this business | Single `fixed_costs` table; apply globally |
| CI/CD pipeline | Manual deploy is acceptable for a single-operator internal tool | Document manual deploy steps; no pipeline complexity |
| Work-in-progress (WIP) tracking | This business assembles on demand, not in production batches; no WIP inventory exists | Assembly happens at sale time via composition lookup; no intermediate WIP state |
| Purchase order generation | Buying is done externally on marketplaces; system only needs to receive the purchase email confirmation | Inbound email parsing only; no PO creation |

---

## Feature Dependencies

The following dependency chain governs phase ordering:

```
products (catalog)
    └── ean_compositions (piece builder)
            └── sale email processing (FIFO deduction via compositions)
                        └── profit calculation (COGS from FIFO lots)

stock_lots (FIFO tracking)
    └── purchase email processing (creates lots)
    └── sale email processing (depletes lots)
    └── scanner (assigns lots to shelves)

zones + shelves (warehouse config)
    └── wall UI (renders from zones/shelves + stock_lots)
    └── stock_lots.shelf_id (physical location)

app.js split
    └── all frontend feature work (can't safely edit monolith)
    └── localStorage elimination (localStorage reads scattered across monolith)
```

**Critical path:** `app.js split` → `products` → `ean_compositions` → `email purchase processing` → `email sale processing` → `profit calculation` → `wall UI`

The wall UI and scanner are independent of the email/profit path and can be built in parallel once the schema and API layer exist.

---

## MVP Recommendation

### Prioritize (in order)

1. **Schema + API layer** — PostgreSQL schema from SPECS-MVP.md, thin REST or Supabase client; this unblocks everything
2. **app.js split** — split the monolith before touching any frontend logic; non-negotiable prerequisite
3. **Product catalog + EAN compositions** — the data model that makes all email processing possible
4. **Email service rewiring** — keep existing Python parsers; just change the output target from InvenTree API to new DB; purchase flow first, then sale flow
5. **FIFO deduction + profit engine** — the core value loop; needs compositions + stock lots in place
6. **Wall UI + zone config from DB** — replaces the localStorage reliability failure; batch query replaces N+1
7. **Scanner** — simplest feature; just needs EAN lookup + shelf assignment write

### Defer to Post-MVP

- **Review queue UI** — log status in DB; fix manually for now
- **Per-marketplace profit breakdown** — data is already recorded; just needs a report UI; low urgency
- **Reorder warning UI** — reorder_point is in schema; color coding can come later

---

## Complexity Assessment

| Feature | Estimated Complexity | Risk Factor | Notes |
|---------|---------------------|-------------|-------|
| app.js split | High | Medium | Safe if done module-by-module with manual testing at each step |
| Purchase email → stock IN | High | Low | Existing parsers work; risk is in DB write logic and dedup |
| Sale email → FIFO deduction | High | High | Must be atomic transaction; composition lookup + multi-lot depletion in one DB transaction |
| EAN compositions CRUD | Medium | Low | Standard CRUD with circular reference validation |
| Profit calculation | Medium | Medium | Fixed cost config must be correct; FIFO lot costs must be accurate before this is meaningful |
| Wall UI from DB | Medium | Low | Main work is batch query and mapping DB rows to existing render logic |
| Zone/shelf config in DB | Low | Low | Simple CRUD; existing UI can be rewired |
| Scanner shelf assignment | Low | Low | Lookup + write; existing scan input handling stays |
| Product catalog CRUD | Low | Low | Straightforward; EAN as natural key |
| Email deduplication | Low | Low | Unique constraint + check before processing |
| localStorage elimination | Medium | Medium | Scattered reads across 4,485-line monolith; requires app.js split first |

---

## Sources

- SPECS-MVP.md — authoritative scope document (primary source, overrides all external research)
- .planning/PROJECT.md — project constraints and decisions
- [Manufacturing Inventory Management Guide | NetSuite](https://www.netsuite.com/portal/resource/articles/erp/manufacturing-inventory-management.shtml)
- [FIFO method for small businesses | Xero](https://www.xero.com/us/guides/fifo-method/)
- [FIFO Inventory lot tracking | Zoho Inventory](https://www.zoho.com/de-de/inventory/kb/reports/inventory-fifo-report.html)
- [FIFO impact on COGS and margins | Sage](https://www.sage.com/en-us/blog/fifo/)
- [Manufacturing inventory for makers | Craftybase](https://craftybase.com/blog/manufacturing-inventory-management)
