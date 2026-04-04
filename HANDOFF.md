# Interwall / Omiximo Inventory OS — Development Handoff

## Project Status

A PC assembly business inventory system. Legacy vanilla JS frontend + FastAPI backend + PostgreSQL. Email-driven stock management with FIFO profit calculation.

**What works right now:**
- Login (user: `omiximo` / pass: `admin123`)
- Product catalog CRUD (`/api/products`, `/api/categories`)
- EAN Compositions — wizard to map assembled products to component parts
- Stock lots — manual stock-IN via `/api/stock-lots`
- Shelf/bin management — 56 shelves across 2 zones (A, B)
- Profit dashboard — `/api/profit/summary`, `/api/profit/valuation`, `/api/fixed-costs`
- Email poller skeleton — APScheduler runs `poll_once()` every 60s, but IMAP creds not configured yet

**What's NOT working yet:**
- Email poller has no IMAP credentials — logs "disabled" warning and skips
- Wall view — zones/shelves read from DB but wall grid rendering still uses localStorage patterns
- Scanner — still wired to InvenTree stock endpoints
- Some catalog features — batch editing, stock transfer between shelves

---

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌────────────┐
│   Nginx     │────▶│  FastAPI     │────▶│ PostgreSQL │
│  port 1441  │     │  port 8000   │     │  port 5432 │
│  (frontend  │     │  (API +      │     │            │
│   + proxy)  │     │  email poll) │     │            │
└─────────────┘     └──────────────┘     └────────────┘

Frontend: inventory-omiximo/frontend/ (vanilla JS, served by nginx)
Backend:  apps/api/ (FastAPI + APScheduler email poller)
Database: PostgreSQL 15 (via docker-compose)
```

### Running

```bash
cd /Users/ottogen/interwall
docker compose up -d          # Start all 3 containers
docker compose logs api -f    # Watch API logs
docker compose build api && docker compose up -d api  # Rebuild after code changes
```

Frontend changes are live (nginx volume mount) — just hard-refresh browser.
API changes require `docker compose build api && docker compose up -d api`.

---

## Key Files

### Backend (apps/api/)
| File | Purpose |
|------|---------|
| `main.py` | FastAPI app, SessionMiddleware, APScheduler lifespan, router registration |
| `auth.py` | Session-based login (bcrypt), `require_session` dependency |
| `db.py` | psycopg2 ThreadedConnectionPool, `get_conn()` context manager |
| `sql/init.sql` | Full schema: 11 tables, 3 PL/pgSQL functions, seed data |
| `routers/products.py` | GET/POST/PATCH/DELETE products with category join |
| `routers/compositions.py` | GET all, GET by parent, PUT full-replace |
| `routers/stock_lots.py` | POST (create lot), GET by-product/{ean} |
| `routers/categories.py` | GET/POST categories |
| `routers/shelves.py` | GET all shelves with zone name |
| `routers/fixed_costs.py` | GET/PUT fixed costs (VAT, commission, overhead) |
| `routers/profit.py` | GET summary, valuation, transactions |
| `email_poller/poller.py` | `poll_once()` — the APScheduler job |
| `email_poller/email_log.py` | crash-safe pending→processed dedup |
| `email_poller/sale_writer.py` | SKU→EAN resolution + `process_sale()` call |
| `email_poller/purchase_writer.py` | manual stock-IN (v2: purchase email parsing) |
| `email_poller/parsers/` | 3 marketplace parsers (copied from legacy) |

### Database Functions (in init.sql)
| Function | Purpose |
|----------|---------|
| `deduct_fifo_stock(product_id, qty)` | FIFO stock deduction with SELECT FOR UPDATE |
| `resolve_composition(parent_ean)` | Returns component list for a composite product |
| `process_sale(ean, qty, price, marketplace)` | Full sale workflow: resolve composition → FIFO deduct each component → compute COGS + fixed costs → record transaction |

### Frontend (inventory-omiximo/frontend/)
| File | Purpose |
|------|---------|
| `config.js` | CONFIG.API_BASE (empty = same-origin proxy), state, sanitize() |
| `api.js` | `api.request()` wrapper with credentials: 'same-origin' |
| `auth.js` | Session cookie auth, `onAuthSuccess()` init chain |
| `compositions.js` | 3-step wizard + saved compositions list |
| `catalog-core.js` | Product grid, card expand/collapse, batch loading |
| `part-manager.js` | Create/edit/delete product modal |
| `catalog-detail.js` | Category manager, batch detail/editor |
| `profit.js` | Profit dashboard — fetches from /api/fixed-costs + /api/profit/* |
| `app-init.js` | DOMContentLoaded → init() → auth flow |
| `env.js` | Runtime config override (API_BASE, CONFIG_API_BASE — both empty now) |

---

## Email Automation — Current State

### What's Built
The email poller (`apps/api/email_poller/`) is fully implemented:
- `poller.py` — APScheduler job that runs every 60s
- `imap_client.py` — IMAP connection (copied from legacy `omiximo-email-automation`)
- 3 parsers — MediaMarktSaturn, Bol.com, Boulanger (all handle SALES only)
- `sale_writer.py` — resolves SKU→EAN, calls `process_sale()` DB function
- `email_log.py` — crash-safe dedup (pending→processed flow)
- `purchase_writer.py` — manual stock-IN only (v2: purchase email parsing)

### What's Missing
1. **IMAP credentials** — need `.env` file with:
   ```
   IMAP_SERVER=imap.hostnet.nl
   IMAP_EMAIL=info@omiximo.nl
   IMAP_PASSWORD=<actual password>
   ```

2. **SKU→EAN mapping** — the parsers extract marketplace SKUs (e.g., `OMX-GHANA-2026-R7-5700X-RTX5050-16G-1T`), but `sale_writer.py` needs to resolve these to product EANs via the `products` table. Products need a `sku` field matching the marketplace SKU format.

3. **Purchase email parsing** — currently deferred to v2. Stock-IN is manual via `/api/stock-lots`. The legacy system had no purchase parsers either.

### How the Sale Flow Works End-to-End
```
1. Sale email arrives (e.g., Bol.com: "Nieuwe bestelling: OMX-GHANA...")
2. APScheduler triggers poll_once() every 60s
3. IMAP client fetches unseen emails from known marketplace senders
4. Parser extracts: SKU, price, quantity, marketplace, order_number
5. email_log.py checks dedup (message_id) — skip if already processed
6. email_log.py inserts email row with status='pending'
7. sale_writer.py resolves SKU → EAN via products table
8. sale_writer.py calls process_sale(EAN, qty, price, marketplace)
9. process_sale() DB function:
   a. Looks up ean_compositions for this EAN
   b. For each component: FIFO deducts stock_lots (oldest first)
   c. Computes COGS from actual lot costs consumed
   d. Applies fixed_costs (VAT 21%, commission 6.2%, overhead €95)
   e. Records transaction (sale_price - COGS - fixed_costs = profit)
10. email_log.py marks email as 'processed' (or 'failed' on error)
```

### Legacy Email System Reference
The original system lives at `omiximo-email-automation/` with:
- Same 3 parsers (source of truth — copied into `apps/api/email_poller/parsers/`)
- Component extraction logic (`src/utils/component_extractor.py`) — parses CPU/GPU/RAM/SSD from SKU strings
- RAM stick mapping (16GB → 2x 8GB sticks)
- SKU generator (`src/utils/sku_generator.py`)
- InvenTree client (replaced by direct PostgreSQL)
- `.env.example` with IMAP server details (imap.hostnet.nl, info@omiximo.nl)
- `shared_config/fixed_elements.json` — commission rates, fixed components

---

## Database Schema Summary

```sql
categories(id, name, description, parent_id)
products(id, ean UNIQUE, name, sku, category_id, description, default_reorder_point, is_composite)
ean_compositions(id, parent_ean→products, component_ean→products, quantity)
warehouses(id, name)
zones(id, warehouse_id, name, columns, levels, layout_row, layout_col, is_active)
shelves(id, zone_id, col, level, label, capacity, split_fifo, single_bin)
stock_lots(id, product_id, shelf_id, quantity CHECK≥0, unit_cost, marketplace, received_at, source_email_id)
emails(id, message_id UNIQUE, sender, subject, marketplace, parsed_type, raw_body, parsed_data, confidence, status, processed_at)
transactions(id, type, product_ean, quantity, unit_price, total_price, marketplace, order_reference, cogs, profit, source_email_id)
fixed_costs(id, name UNIQUE, value, is_percentage)
users(id, username UNIQUE, password_hash)
```

---

## Next Steps (Priority Order)

### 1. Activate Email Poller
- Create `.env` with IMAP credentials
- Restart docker: `docker compose up -d`
- Verify: `docker compose logs api -f` should show poll cycles

### 2. Wire Wall View to Database
- `wall.js` and `zone-manager.js` still read zones from localStorage
- Need to rewire to `GET /api/shelves` and a new zones endpoint
- The wall grid renders shelf cells — each needs stock count from DB

### 3. Add Stock Receiving UI
- Frontend needs a "Receive Stock" button/modal
- Select product (EAN dropdown), enter qty + unit cost + shelf
- Calls `POST /api/stock-lots`

### 4. Purchase Email Parsing (v2)
- Write parsers for supplier purchase confirmation emails
- On match: auto-create stock lot via `purchase_writer.py`
- No existing parsers for purchases — all 3 handle sales only

### 5. Scanner Integration
- `scanner.js` handles barcode input from USB scanner
- Currently calls InvenTree endpoints — needs rewiring to `/api/products/{ean}`
- On scan: show product details + stock levels + composition

---

## Environment Setup

```bash
# 1. Clone and start
cd /Users/ottogen/interwall
docker compose up -d

# 2. Create .env for email poller (when ready)
cat > .env << 'EOF'
IMAP_SERVER=imap.hostnet.nl
IMAP_EMAIL=info@omiximo.nl
IMAP_PASSWORD=<password>
IMAP_FOLDER=INBOX
POSTGRES_PASSWORD=interwall_dev_secret
SESSION_SECRET=change-me-in-production-min-32-chars-long
EOF

# 3. Restart with IMAP creds
docker compose up -d

# 4. Access
# Frontend: http://localhost:1441
# API docs: http://localhost:1441/api/docs (FastAPI auto-docs, proxied by nginx)
```

---

## Conventions
- Frontend: `const moduleName = {...}; window.moduleName = moduleName;` pattern
- All API calls use `credentials: 'same-origin'` (session cookies)
- Cache busting: `<script src="file.js?v=N">` — increment on changes
- API routers: `APIRouter(prefix="/api/...", tags=[...])` with `require_session`
- DB access: `with get_conn() as conn: with conn.cursor() as cur:` (RealDictCursor)
- Git: conventional commits — `feat(phase):`, `fix(phase):`, `docs(phase):`
