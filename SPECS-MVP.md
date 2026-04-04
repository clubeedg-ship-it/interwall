# Omiximo Inventory OS — Minimal MVP Specification

## Purpose

Strip the existing Omiximo system down to its core value loop and make it work reliably with real persistence. The current prototype runs on InvenTree as a headless backend and stores critical business data in browser localStorage. This MVP removes both dependencies: InvenTree goes away, localStorage is eliminated for all business data, and the system talks directly to its own PostgreSQL database.

**Single sentence:** Emails drive stock in and out via EAN compositions; the profit engine calculates margins from FIFO purchase costs plus fixed costs; the wall and scanner are the physical sync layer.

## What This Is NOT

- Not a greenfield rewrite on a new stack (we keep the vanilla JS frontend)
- Not multi-tenant (single tenant, single business)
- Not a feature expansion (no new capabilities beyond what's listed here)
- Not a migration to React/Next.js (that's a future milestone if needed)

---

## Core Value Loop

```
Purchase Email ──→ Parse ──→ Stock IN (EAN, qty, unit cost, marketplace, date)
                                          │
                                          ▼
                              ┌─── EAN Composition Table ───┐
                              │  EAN1 = EAN2 + EAN3 + EAN4  │
                              └──────────────────────────────┘
                                          │
Sale Email ──→ Parse ──→ Stock OUT ───────┘
                  │         (deduct components via composition)
                  ▼
            Profit Engine
            (FIFO component costs + fixed costs → margin)
                  │
                  ▼
         Wall UI / Scanner
         (physical shelf ↔ EAN sync)
```

---

## Architecture

### Database (Source of Truth)

A single PostgreSQL database (Supabase, self-hosted, or managed — decided during implementation). All business data lives here. Zero localStorage for business state.

**localStorage is ONLY allowed for:**
- UI theme preference (dark/light)
- Last-used view (cosmetic, not business data)

Everything else — zones, shelves, stock, transactions, compositions, config — is in the database.

### Frontend

Keep the existing vanilla JS SPA. Clean it up, split the monolith, but do not rewrite it in a framework. The frontend talks to the database via a thin API layer (REST endpoints or Supabase client direct).

### Email Automation

Keep the existing Python service. Rewire it to write directly to the new database instead of calling InvenTree API. Same IMAP polling, same marketplace parsers, but the output target changes.

### What Gets Removed

- **InvenTree** — the entire Django/Celery/Redis backend stack. Gone.
- **Config API sidecar** — the Express service for fixed costs/components. Config moves to the database.
- **localStorage business data** — zones, transactions, shelf config, cost config, fixed components. All of it.
- **InvenTree API calls** — every `api.request()` call in the frontend gets replaced with direct database queries.

---

## Data Model

### `products`
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | PK |
| ean | text | Primary EAN/barcode identifier (unique) |
| name | text | Human-readable product name |
| sku | text | Internal SKU (optional, for legacy compat) |
| default_reorder_point | integer | Minimum stock before warning |
| is_composite | boolean | True if this product is a "built" product (has components) |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### `ean_compositions` (the "piece builder")
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | PK |
| parent_ean | text | FK → products.ean (the assembled/sold product) |
| component_ean | text | FK → products.ean (a required part) |
| quantity | integer | How many of this component per parent |

**Example:** Gaming PC (EAN1) = CPU (EAN2) ×1 + RAM (EAN3) ×2 + GPU (EAN4) ×1 + SSD (EAN5) ×1

### `warehouses`
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | PK |
| name | text | Warehouse name |

### `zones`
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | PK |
| warehouse_id | uuid | FK → warehouses |
| name | text | Zone letter (A, B, C...) |
| columns | integer | Number of columns |
| levels | integer | Number of levels |
| layout_row | integer | Display position |
| layout_col | integer | Display position |
| is_active | boolean | |

### `shelves`
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | PK |
| zone_id | uuid | FK → zones |
| column | integer | Column number |
| level | integer | Level number |
| label | text | e.g. "A-1-3" |
| capacity | integer | Max units (optional) |
| split_fifo | boolean | Whether shelf uses A/B bin rotation |
| single_bin | boolean | Whether shelf is single-bin mode |

### `stock_lots` (FIFO tracking)
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | PK |
| product_id | uuid | FK → products |
| shelf_id | uuid | FK → shelves (nullable — unassigned stock) |
| quantity | integer | Current quantity in this lot |
| unit_cost | numeric(12,4) | Purchase price per unit |
| marketplace | text | Where purchased (supplier/marketplace name) |
| received_at | timestamptz | When this lot arrived (FIFO sort key) |
| source_email_id | uuid | FK → emails (nullable, for traceability) |
| created_at | timestamptz | |

### `transactions` (immutable ledger)
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | PK |
| type | text | 'purchase' or 'sale' |
| product_ean | text | The product bought or sold |
| quantity | integer | Units transacted |
| unit_price | numeric(12,4) | Price per unit (purchase cost or sale price) |
| total_price | numeric(12,4) | Total transaction amount |
| marketplace | text | Source marketplace |
| order_reference | text | External order ID from email |
| cogs | numeric(12,4) | Cost of goods sold (for sales, computed via FIFO) |
| profit | numeric(12,4) | Revenue minus COGS minus fixed costs (for sales) |
| source_email_id | uuid | FK → emails (traceability) |
| created_at | timestamptz | Transaction date |

### `fixed_costs`
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | PK |
| name | text | e.g. 'vat', 'commission', 'overhead' |
| value | numeric(12,4) | Amount or percentage |
| is_percentage | boolean | True = percentage of sale price, False = fixed amount |
| updated_at | timestamptz | |

### `emails` (processed email log)
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | PK |
| message_id | text | Email Message-ID (dedup key, unique) |
| sender | text | From address |
| subject | text | |
| marketplace | text | Detected marketplace |
| parsed_type | text | 'purchase' or 'sale' |
| raw_body | text | Original email content |
| parsed_data | jsonb | Extracted fields |
| confidence | numeric(3,2) | Parse confidence score |
| status | text | 'processed', 'failed', 'review' |
| processed_at | timestamptz | |
| created_at | timestamptz | |

---

## Features (Scope-Locked)

### 1. EAN Composition Management ("Piece Builder")

**What:** Define that product EAN1 is composed of EAN2 + EAN3 + EAN4 with quantities.

**Why:** This is the core mapping that lets the system auto-deduct components when a composite product is sold.

**UI:** Simple table/form in a "Compositions" or "Products" view. Add parent EAN, add component EANs with quantities. Edit, delete.

**Backend:** CRUD on `ean_compositions` table. Validation: no circular references, components must exist as products.

### 2. Email-Driven Stock Management

**What:** The email automation service polls the inbox, parses marketplace emails, and writes stock changes directly to the database.

**Purchase emails →** Create `stock_lots` entries (stock IN). Record in `transactions` as type='purchase'.

**Sale emails →** Look up `ean_compositions` for the sold product. For each component, consume stock via FIFO (oldest `stock_lots` first). Record in `transactions` as type='sale' with computed COGS.

**Marketplaces in scope:** MediaMarktSaturn, Bol.com, Boulanger (existing parsers).

**Dedup:** Use email `message_id` to prevent duplicate processing.

**Review queue:** Emails with confidence < threshold go to 'review' status for manual approval.

### 3. Profit Engine

**What:** For each sale, compute:
- **COGS** = sum of (component quantity × FIFO unit cost) for all components
- **Fixed costs** = VAT (% of sale price) + commission (% of sale price) + overhead (fixed amount)
- **Profit** = sale price − COGS − fixed costs

**Dashboard:** Charts showing profit over time (daily/weekly/monthly), broken down by product, marketplace. Inventory valuation (sum of stock × unit cost).

**Data source:** `transactions` table, not localStorage.

### 4. Wall UI

**What:** Visual grid of warehouse zones/shelves showing stock levels with color-coded health.

**Changes from current:**
- Data comes from database, not InvenTree API
- Zone/shelf config persisted in database, not localStorage
- Batch API queries instead of N+1 (single query: all shelves + stock counts)
- Keep the visual identity: glassmorphism, orbball sidebar, color coding

### 5. Scanner

**What:** Barcode scanner input that maps a scanned EAN to a shelf location.

**Workflow:** Scan EAN → system looks up product → shows current stock lots → user assigns/moves to shelf.

**Purpose:** Physical sync layer. The email automation handles most stock in/out; scanning is for physically placing items on shelves and verifying stock.

### 6. Catalog

**What:** Product CRUD. List, search, create, edit products. See stock levels per product.

**Changes:** Data from database. No InvenTree dependency.

---

## Out of Scope (Deferred)

- Multi-tenant / organizations / memberships / RLS
- User roles and permissions (single user is fine)
- Reorder point automation (auto-generate purchase orders)
- Drag-and-drop shelf rearrangement
- Camera-based barcode scanning
- Internationalization / localization
- Label printing
- Kit fixed costs as separate entity (use `fixed_costs` table for global costs)
- Review queue UI for low-confidence emails (log them, fix later)
- Real-time WebSocket updates
- CI/CD pipeline
- Migration from old InvenTree data

---

## Non-Functional Requirements

- **No localStorage for business data.** Theme and last-view only.
- **Single source of truth.** The database. Period.
- **No InvenTree dependency.** The system must run without InvenTree containers.
- **Code quality:** Split `app.js` (4,485 lines) into focused modules (≤500 lines each). Fix XSS vulnerabilities (no raw innerHTML with user data). Remove dead code.
- **Performance:** Replace N+1 API calls with batch queries. Wall load should be a single query.
- **Security:** No tokens in localStorage (use httpOnly cookies or session-based auth). Sanitize all user input rendered to DOM.
- **Tests:** Backend logic (FIFO consumption, EAN composition resolution, profit calculation) must have automated tests.

---

## Technology Decisions

| Concern | Decision |
|---------|----------|
| Database | PostgreSQL (via Supabase or direct) |
| Frontend | Vanilla JS SPA (cleaned up, no framework change) |
| API layer | TBD — Supabase client direct, or thin REST API (Express/Deno) |
| Email service | Existing Python service, rewired to new DB |
| Auth | Simple session-based (single user, no Clerk/OAuth needed) |
| Hosting | Docker Compose (simplified — no InvenTree/Redis/Celery) |

---

## Acceptance Criteria

1. **Purchase email processed → stock lot created** with correct EAN, quantity, unit cost, marketplace, date
2. **Sale email processed → components deducted via FIFO** using EAN composition lookup, transaction recorded with accurate COGS and profit
3. **EAN composition CRUD** works — can define, edit, delete parent→component mappings
4. **Profit dashboard** shows accurate margins calculated from database transactions, not localStorage
5. **Wall UI** renders from database, shows correct stock levels, zone/shelf config survives browser clear
6. **Scanner** maps EAN to shelf and updates stock lot location in database
7. **Zero localStorage** for business data — clear localStorage and the app still works (minus theme preference)
8. **No InvenTree containers** required to run the system
9. **app.js split** into modules, no file >500 lines, no raw innerHTML with user data
10. **FIFO, composition resolution, and profit calculation** have passing automated tests
