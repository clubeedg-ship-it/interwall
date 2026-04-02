# Phase 3: Core Value Loop - Research

**Researched:** 2026-04-02
**Domain:** Python email poller rewiring, FIFO profit engine, FastAPI new routers, vanilla JS dashboard
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MAIL-01 | Purchase emails parsed → stock_lots created (EAN, qty, unit_cost, marketplace, date) | `OrderData` model exists; parsers return price/SKU; new `StockInWriter` inserts into `stock_lots` via psycopg2 |
| MAIL-02 | Sale emails → FIFO component deduction + transaction with COGS/profit | `process_sale()` PostgreSQL function already exists and is tested; email service calls it with EAN, qty, price, marketplace, order_ref |
| MAIL-03 | Duplicate emails rejected via unique message_id constraint | `emails.message_id` UNIQUE constraint exists in schema; INSERT raises IntegrityError on duplicate |
| MAIL-04 | Email service writes directly to PostgreSQL (not InvenTree API) | `inventree_client.py` is entirely replaced; email service uses same `DATABASE_URL` env var as FastAPI |
| MAIL-05 | Processed emails logged in `emails` table with parsed_data and confidence | `emails` table exists with correct columns; email service inserts before processing |
| PROF-01 | COGS from FIFO component lot costs at point of sale | `process_sale()` computes COGS pre-deduction from locked lot rows — already implemented |
| PROF-02 | Fixed costs configurable in database (VAT %, commission %, overhead fixed) | `fixed_costs` table exists; new FastAPI router `/api/fixed-costs` provides CRUD |
| PROF-03 | Profit = sale price − COGS − fixed costs, stored on transaction | `process_sale()` reads `fixed_costs` table and writes `profit` column — already implemented |
| PROF-04 | Profit dashboard: profit over time (daily/weekly/monthly) from DB transactions | New FastAPI endpoint aggregates `transactions` table; frontend `profit.js` rewired to fetch from API |
| PROF-05 | Profit dashboard: breakdown by marketplace | Same aggregation endpoint adds GROUP BY marketplace |
| PROF-06 | Inventory valuation: sum(quantity × unit_cost) across stock_lots | New FastAPI endpoint with `SELECT SUM(quantity * unit_cost) FROM stock_lots GROUP BY product_id` |

</phase_requirements>

---

## Summary

Phase 3 has a clearly bounded scope: rewire the Python email automation service to write to PostgreSQL instead of the InvenTree API, and expose the profit/dashboard data through new FastAPI endpoints that the vanilla JS frontend can consume. The heavy lifting (FIFO deduction, sale processing, composition resolution) is already implemented as PostgreSQL functions from Phase 1. This phase is primarily plumbing.

The existing email automation service has three distinct responsibilities that need to change: (1) the `InvenTreeClient` class gets deleted entirely and replaced with direct psycopg2 calls, (2) the `ProcessedEmailTracker` (which writes to a local JSON file) gets replaced with a DB-backed dedup check against `emails.message_id`, and (3) the `StockManager` class gets replaced with two simple DB writers — one for purchase emails (insert into `stock_lots`) and one for sale emails (call `process_sale()`). Critically, the existing parsers (`MediaMarktSaturnParser`, `BolComParser`, `BoulangerParser`) are **preserved unchanged** — they already return the fields needed.

The profit dashboard currently reads from `localStorage` (transactions, components, stock cache) and syncs to the Config API sidecar. In this phase, `profit.js` is rewired to fetch from new FastAPI endpoints that aggregate `transactions` and `stock_lots`. The vanilla JS pattern (fetch + DOM update) is preserved exactly; only the data source changes.

**Primary recommendation:** Delete `inventory/` subdirectory entirely, write two new DB writers (`purchase_writer.py`, `sale_writer.py`), replace `ProcessedEmailTracker` with a DB-backed dedup class, then add three new FastAPI routers (`/api/fixed-costs`, `/api/profit`, `/api/stock-lots`).

---

## Standard Stack

### Core (already pinned in apps/api/requirements.txt)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| fastapi | 0.115.12 | HTTP API framework | Locked in Phase 1 |
| psycopg2-binary | 2.9.11 | PostgreSQL direct writes | Locked in Phase 1 |
| APScheduler | 3.11.0 | Email polling scheduler | Already in requirements.txt |
| python-dotenv | 1.0.0 | Environment config | Already used in email service |

### Email Service Dependencies (from omiximo-email-automation/requirements.txt)
| Library | Version | Purpose | Notes |
|---------|---------|---------|-------|
| imapclient | 2.3.1 | IMAP email fetching | Existing, keep as-is |
| requests | 2.31.0 | (can be removed after InvenTree removal) | No longer needed |
| flask | 3.0.0 | Config API sidecar | Remove — Config API dies in this phase |
| flask-cors | 4.0.0 | Config API CORS | Remove with flask |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| APScheduler (BackgroundScheduler) | threading.Timer loop | APScheduler is already in requirements.txt; cleaner lifecycle management |
| APScheduler (BackgroundScheduler) | asyncio polling in FastAPI lifespan | APScheduler is sync-friendly for blocking IMAP calls; avoids asyncio-blocking-sync pitfall |
| psycopg2 direct in email service | httpx calling FastAPI | Unnecessary network hop; FastAPI runs in same process; direct DB is faster and simpler |

**Installation:** No new packages needed — all dependencies are already in `apps/api/requirements.txt`. The email service code moves into the same Python process.

---

## Architecture Patterns

### Recommended Project Structure (after Phase 3)
```
apps/api/
├── main.py                    # FastAPI app + APScheduler startup
├── db.py                      # Shared psycopg2 connection pool (existing)
├── auth.py                    # Session auth (existing)
├── routers/
│   ├── health.py              # (existing)
│   ├── products.py            # (existing)
│   ├── compositions.py        # (existing)
│   ├── fixed_costs.py         # NEW: CRUD for fixed_costs table
│   ├── profit.py              # NEW: Dashboard aggregation endpoints
│   └── stock_lots.py          # NEW: Stock-in/valuation endpoints
├── email_poller/
│   ├── __init__.py
│   ├── poller.py              # NEW: Poll loop, scheduler integration
│   ├── purchase_writer.py     # NEW: Parse purchase email → insert stock_lot
│   ├── sale_writer.py         # NEW: Parse sale email → call process_sale()
│   ├── email_log.py           # NEW: DB-backed dedup + emails table logging
│   ├── imap_client.py         # COPIED from omiximo-email-automation (unchanged)
│   └── parsers/
│       ├── __init__.py
│       ├── base.py            # COPIED from omiximo-email-automation (unchanged)
│       ├── mediamarktsaturn.py # COPIED (unchanged)
│       ├── bolcom.py          # COPIED (unchanged)
│       └── boulanger.py       # COPIED (unchanged)
├── sql/
│   └── init.sql               # (existing)
└── requirements.txt           # Add: imapclient>=2.3.1
```

### Pattern 1: APScheduler BackgroundScheduler in FastAPI lifespan

APScheduler is already in `apps/api/requirements.txt` (version 3.11.0). The canonical pattern is to start and stop the scheduler in the FastAPI lifespan context manager.

**What:** Register a poll job in the lifespan; it runs on a separate thread while FastAPI handles HTTP.
**When to use:** Single-threaded background job that doesn't need asyncio.

```python
# Source: APScheduler 3.x docs + existing apps/api/main.py pattern
from apscheduler.schedulers.background import BackgroundScheduler
from contextlib import asynccontextmanager
from fastapi import FastAPI
import db
from email_poller.poller import poll_once

scheduler = BackgroundScheduler()

@asynccontextmanager
async def lifespan(app: FastAPI):
    db.init_pool()
    scheduler.add_job(poll_once, 'interval', seconds=60, id='email_poll')
    scheduler.start()
    yield
    scheduler.shutdown(wait=False)
    db.close_pool()

app = FastAPI(title="Omiximo Inventory OS", lifespan=lifespan)
```

**CRITICAL:** `poll_once()` must be a plain synchronous function — not async. APScheduler BackgroundScheduler runs jobs in threads, not the asyncio event loop. Mixing async + BackgroundScheduler causes deadlocks.

### Pattern 2: DB-Backed Email Dedup (replaces processed_emails.json)

**What:** Before processing any email, check `emails.message_id` for existence. If found, skip. If not found, insert a row with `status='processed'` (or `status='failed'` on error).
**When to use:** Every email processing cycle.

```python
# Source: Derived from init.sql emails table schema
def is_already_processed(conn, message_id: str) -> bool:
    with conn.cursor() as cur:
        cur.execute(
            "SELECT 1 FROM emails WHERE message_id = %s",
            (message_id,)
        )
        return cur.fetchone() is not None

def log_email(conn, message_id: str, sender: str, subject: str,
              marketplace: str, parsed_type: str, raw_body: str,
              parsed_data: dict, confidence: float, status: str) -> str:
    """Insert email log row. Returns the new email UUID."""
    with conn.cursor() as cur:
        cur.execute(
            """INSERT INTO emails
               (message_id, sender, subject, marketplace, parsed_type,
                raw_body, parsed_data, confidence, status, processed_at)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
               RETURNING id""",
            (message_id, sender, subject, marketplace, parsed_type,
             raw_body, json.dumps(parsed_data), confidence, status)
        )
        return str(cur.fetchone()['id'])
```

### Pattern 3: Purchase Email → stock_lots INSERT

**What:** A parsed purchase `OrderData` maps to a new `stock_lots` row. The EAN must be resolved to `products.id` first.
**When to use:** `parsed_type == 'purchase'`

```python
# Source: Derived from init.sql stock_lots schema + OrderData dataclass
def write_purchase(conn, order: OrderData, email_id: str) -> str:
    """Insert a stock lot for a purchase email. Returns stock_lot UUID."""
    with conn.cursor() as cur:
        # Resolve EAN → product_id (products table, keyed by EAN)
        cur.execute("SELECT id FROM products WHERE ean = %s", (order.sku or order.generated_sku,))
        row = cur.fetchone()
        if not row:
            raise ValueError(f"Product EAN not found: {order.sku}")
        product_id = row['id']

        cur.execute(
            """INSERT INTO stock_lots
               (product_id, quantity, unit_cost, marketplace, received_at, source_email_id)
               VALUES (%s, %s, %s, %s, NOW(), %s)
               RETURNING id""",
            (product_id, order.quantity, order.price, order.marketplace, email_id)
        )
        return str(cur.fetchone()['id'])
```

**Note:** For purchase emails, `order.price` is the **purchase unit cost** (what was paid per unit), not the sale price. The existing parsers set `order.price` to the email's listed price. For sale emails, the same field becomes the revenue. The poller must distinguish purchase vs sale by `parsed_type`.

### Pattern 4: Sale Email → process_sale() PostgreSQL function call

**What:** Call the existing `process_sale()` DB function with the EAN, quantity, sale price, marketplace, and order reference. The function atomically: resolves composition, deducts FIFO, computes COGS, writes transaction.
**When to use:** `parsed_type == 'sale'`

```python
# Source: Derived from init.sql process_sale() function signature
def write_sale(conn, order: OrderData, email_id: str) -> str:
    """Call process_sale() DB function. Returns transaction UUID."""
    with conn.cursor() as cur:
        cur.execute(
            "SELECT process_sale(%s, %s, %s, %s, %s, %s) AS txn_id",
            (
                order.sku or order.generated_sku,  # p_parent_ean
                order.quantity,                      # p_quantity
                order.price,                         # p_sale_price
                order.marketplace,                   # p_marketplace
                order.order_number,                  # p_order_ref
                email_id,                            # p_email_id
            )
        )
        return str(cur.fetchone()['txn_id'])
```

**CRITICAL:** `process_sale()` raises an exception (and rolls back) if any component has insufficient stock. The poller must catch this and set `emails.status = 'failed'` rather than crashing.

### Pattern 5: New FastAPI Routers — Profit Dashboard

**What:** Three aggregate query endpoints that replace localStorage-based profit state.
**When to use:** Frontend `profit.js` calls these on load.

```python
# Source: Derived from init.sql transactions + fixed_costs schema
# apps/api/routers/profit.py

@router.get("/summary")
def profit_summary(period: str = "monthly", session=Depends(require_session)):
    """Returns profit grouped by period and marketplace."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT
                     DATE_TRUNC(%s, created_at) AS period,
                     marketplace,
                     SUM(profit) AS total_profit,
                     SUM(total_price) AS total_revenue,
                     SUM(cogs) AS total_cogs,
                     COUNT(*) AS sale_count
                   FROM transactions
                   WHERE type = 'sale'
                   GROUP BY 1, 2
                   ORDER BY 1 DESC""",
                (period,)
            )
            return cur.fetchall()

@router.get("/valuation")
def inventory_valuation(session=Depends(require_session)):
    """Total stock value per product."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT p.ean, p.name,
                          SUM(sl.quantity) AS total_qty,
                          SUM(sl.quantity * sl.unit_cost) AS total_value
                   FROM stock_lots sl
                   JOIN products p ON p.id = sl.product_id
                   WHERE sl.quantity > 0
                   GROUP BY p.ean, p.name
                   ORDER BY total_value DESC"""
            )
            return cur.fetchall()
```

### Pattern 6: Fixed Costs CRUD Router

The `fixed_costs` table is the database replacement for `localStorage['omiximo_cost_config']` and the Config API sidecar. The frontend `profit.js` must be rewired to call `/api/fixed-costs` instead of `backendConfigSync.loadFromBackend()`.

```python
# apps/api/routers/fixed_costs.py
@router.get("")
def list_fixed_costs(session=Depends(require_session)):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id, name, value, is_percentage FROM fixed_costs ORDER BY name")
            return cur.fetchall()

@router.put("/{cost_id}")
def update_fixed_cost(cost_id: str, body: FixedCostUpdate, session=Depends(require_session)):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE fixed_costs SET value=%s, is_percentage=%s, updated_at=NOW() WHERE id=%s RETURNING id",
                (body.value, body.is_percentage, cost_id)
            )
            if not cur.fetchone():
                raise HTTPException(404, "Fixed cost not found")
    return {"ok": True}
```

### Pattern 7: Frontend profit.js Rewiring

`profit.js` currently reads from `localStorage['omiximo_cost_config']` and `backendConfigSync.loadFromBackend()`. After rewiring, it fetches from `/api/fixed-costs` and `/api/profit/summary`. The vanilla JS module pattern is preserved; only the data source changes.

```javascript
// Source: Existing profit.js patterns + new FastAPI endpoints
// Replace backendConfigSync.loadFromBackend() with:
async loadFromAPI() {
    const resp = await fetch('/api/fixed-costs', {
        headers: { 'Content-Type': 'application/json' }
    });
    if (resp.ok) {
        const costs = await resp.json();
        this.costs = costs.map(c => ({
            id: c.id,
            name: c.name,
            value: parseFloat(c.value),
            is_percentage: c.is_percentage,
            enabled: true
        }));
        return true;
    }
    return false;
}

// Replace profitEngine.loadTransactions() localStorage read with:
async loadTransactions() {
    const resp = await fetch('/api/profit/summary?period=day');
    if (resp.ok) {
        profitState.summaryData = await resp.json();
        this.renderCharts();
    }
}
```

### Anti-Patterns to Avoid

- **Parsing purchase vs sale from email subject alone:** The existing parsers do not set `parsed_type`. The poller must determine type from sender address + email content (purchases come from supplier, sales from marketplace). For this MVP: all three marketplace senders (MediaMarktSaturn, BolCom, Boulanger) only send sale emails. Purchase emails from suppliers are a separate, currently unhandled sender. Plan accordingly: MAIL-01 may require a new purchase email parser or manual EAN input for stock IN.
- **Calling process_sale() without checking product exists:** The function raises `EXCEPTION 'Product not found'`. The EAN in the email (via `order.sku` or `order.generated_sku`) must be registered in `products` before a sale can be processed.
- **Running the email poller with asyncio loop:** APScheduler `BackgroundScheduler` is threaded. Do not use `await` inside poll jobs. `db.get_conn()` is a synchronous context manager — compatible.
- **Reusing the email service Docker container:** The decision (D-04) is one container for both FastAPI and email polling. Do not add a separate container.
- **Config API sidecar still running:** After this phase, `backendConfigSync` in profit.js must point to `/api/fixed-costs`, not `localhost:8085`. The Config API Express container is removed.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| FIFO deduction | Python FIFO loop | `deduct_fifo_stock()` PostgreSQL function | Race condition prevention via SELECT FOR UPDATE; already in init.sql |
| Sale processing workflow | Python transaction manager | `process_sale()` PostgreSQL function | Atomically resolves composition, deducts, computes COGS, records transaction |
| Email scheduling | Custom `while True` loop | APScheduler BackgroundScheduler | Already in requirements.txt; handles jitter, error recovery, graceful shutdown |
| Profit aggregation | In-memory JS summation | PostgreSQL `DATE_TRUNC + GROUP BY` via FastAPI | Accurate, DB-computed; no stale localStorage state |
| Duplicate email detection | MD5 hash file | `emails.message_id UNIQUE` constraint + INSERT | Atomic dedup at DB level; UNIQUE constraint raises IntegrityError on duplicate |

**Key insight:** The critical business logic (FIFO, composition resolution, sale atomicity) is already implemented as battle-tested PostgreSQL functions. Phase 3 is a wiring phase, not a logic-writing phase.

---

## Runtime State Inventory

> This is a migration phase (rewiring InvenTree → PostgreSQL). The following runtime state items need attention.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `omiximo-email-automation/data/processed_emails.json` — tracks processed email Message-IDs | One-time migration: import existing message_ids into `emails` table as `status='processed'` rows; prevents reprocessing after switchover |
| Live service config | Config API sidecar (`localhost:8085`) — stores `fixed_costs` and `fixed_components` as JSON file | Migrate JSON to `fixed_costs` DB table; remove Config API container from docker-compose.yml |
| OS-registered state | None — no Task Scheduler, launchd, or pm2 tasks found | None |
| Secrets/env vars | `INVENTREE_API_URL`, `INVENTREE_API_TOKEN`, `INVENTREE_USERNAME`, `INVENTREE_PASSWORD` in email service `.env` | Remove from env; add `DATABASE_URL` (already in api container); add `IMAP_SERVER`, `IMAP_EMAIL`, `IMAP_PASSWORD` to api container env |
| Build artifacts | None — Python service runs from source, no compiled artifacts | None |

**The canonical question answered:** After all source files are updated, the `data/processed_emails.json` file and the Config API's JSON config file are the only runtime state that still carries the old system's data. Both need migration before the service is cut over.

---

## Common Pitfalls

### Pitfall 1: Purchase Emails — No Existing Parser Logic

**What goes wrong:** MAIL-01 requires purchase email parsing to create `stock_lots`. But the existing parsers only handle sale emails (shipment notifications from marketplaces). The current system has no purchase email parser at all.

**Why it happens:** The old system only handled sales (InvenTree's stock came from manual seed scripts). Purchase emails are a different format — typically from suppliers like Amazon Business, suppliers, or forwarding warehouses.

**How to avoid:** For MVP, MAIL-01 can be satisfied by a simple "supplier purchase" route: a `POST /api/stock-lots` endpoint that accepts `{ean, quantity, unit_cost, marketplace, received_at}` from the frontend (manual stock IN), rather than email parsing. OR, add a simple purchase email parser that handles the supplier format. Clarify with the user which approach is needed. Do not assume purchase email parsing is the same as sale email parsing.

**Warning signs:** The plan lists MAIL-01 as "purchase emails parsed" but all existing parsers only handle sale emails from marketplaces.

### Pitfall 2: EAN Mismatch Between Email and Products Table

**What goes wrong:** `process_sale()` raises `'Product not found: %'` when the EAN extracted from the email is not registered in the `products` table. The parsers extract `order.sku` (Interne referentie from email) or `order.generated_sku` (OMX-GHANA-2026-R7-5700X-... format). These may not match the `products.ean` column.

**Why it happens:** The `products` table uses EAN barcodes (numeric, 8-13 digits). Marketplace emails contain internal reference SKUs (OMX-...). These are fundamentally different identifiers.

**How to avoid:** The `products.sku` column exists for exactly this purpose (legacy compat). Lookup by `sku` field when `ean` lookup fails. Alternatively, add a `products.marketplace_sku` column. The safest path: resolve `order.sku → products.ean` via `SELECT ean FROM products WHERE sku = $1` before calling `process_sale()`.

**Warning signs:** `process_sale()` exceptions with "Product not found" in logs despite the product existing under a different identifier.

### Pitfall 3: P8 — Email Processed State Lost During Switchover (from PITFALLS.md)

**What goes wrong:** The email service currently tracks processed emails in `data/processed_emails.json`. If this file is not migrated before the DB-backed dedup goes live, all previously processed emails get reprocessed → duplicate stock lots and transactions.

**Why it happens:** The switchover point is when `InvenTreeClient` is replaced with DB writers. If old `processed_emails.json` data is not loaded into the `emails` table first, the new dedup check (which queries the `emails` table) has no history.

**How to avoid:** Include a one-time migration script in Wave 0 (or startup code) that reads `data/processed_emails.json` and bulk-inserts into the `emails` table with `status='processed'`. Run this before the first poll cycle with the new code.

**Warning signs:** Log shows "Processing: Bestelling XXXX" for an order that was processed weeks ago.

### Pitfall 4: P1 — FIFO Race Condition (from PITFALLS.md)

**What goes wrong:** Concurrent sale email processing depletes the same stock lot twice, causing negative inventory. The single-threaded poller eliminates most risk, but if APScheduler is misconfigured with multiple workers, it can happen.

**How to avoid:** APScheduler `BackgroundScheduler` with `max_instances=1` on the poll job ensures only one poll runs at a time. The PostgreSQL `process_sale()` function uses `SELECT FOR UPDATE` for additional protection. Never use `ThreadPoolExecutor` for poll jobs.

```python
scheduler.add_job(
    poll_once, 'interval', seconds=60,
    id='email_poll',
    max_instances=1,  # Prevents overlapping runs
    coalesce=True,    # If behind, run once not multiple times
)
```

### Pitfall 5: profit.js Chart Data — DB Aggregation vs Old localStorage Format

**What goes wrong:** The existing `profitEngine.render()` expects `profitState.transactions` as an array of transaction objects with fields like `{orderId, margin, sale, date, productName, components}`. The new `/api/profit/summary` returns aggregated data with different field names. Wiring them 1:1 breaks the chart rendering.

**Why it happens:** The old system stored individual raw transaction objects in localStorage. The new system aggregates in the DB. The chart rendering code needs updating.

**How to avoid:** The `/api/profit/summary` endpoint should return enough granularity for both time-series charts AND the transaction list. Add a second endpoint `/api/transactions` that returns individual transactions for the list view. Only aggregate for chart rendering.

### Pitfall 6: Config API Sidecar Still Active During Transition

**What goes wrong:** `profit.js` calls `backendConfigSync.loadFromBackend()` → `http://localhost:8085/api/config`. If the Config API container is removed before `profit.js` is rewired, the frontend silently falls back to stale `localStorage` fixed costs.

**Why it happens:** `backendConfigSync.loadFromBackend()` has a try/catch that silently falls back to localStorage on failure. The failure is invisible.

**How to avoid:** Rewire `profit.js` to call `/api/fixed-costs` before removing the Config API container. Verify the new endpoint works with the browser network tab. Then remove the Config API.

---

## Code Examples

### Email Poller Complete Flow

```python
# Source: Derived from omiximo-email-automation/src/main.py EmailAutomation.process_email()
# apps/api/email_poller/poller.py

import logging
import json
from db import get_conn
from email_poller.imap_client import IMAPClient
from email_poller.parsers import MediaMarktSaturnParser, BolComParser, BoulangerParser
from email_poller.email_log import is_already_processed, log_email
from email_poller.sale_writer import write_sale

logger = logging.getLogger("email_poller")

PARSERS = [MediaMarktSaturnParser(), BolComParser(), BoulangerParser()]
MARKETPLACE_SENDERS = {
    "mediamarktsaturn": "noreply@mmsmarketplace.mediamarktsaturn.com",
    "bolcom": "automail@bol.com",
    "boulanger": "marketplace.boulanger@boulanger.com",
}

def poll_once():
    """Called by APScheduler. Processes all new marketplace emails."""
    try:
        with IMAPClient() as client:
            client.select_inbox()
            for name, sender in MARKETPLACE_SENDERS.items():
                email_ids = client.search_from_sender(sender, unseen_only=True)
                for email_id in email_ids:
                    email_data = client.fetch_email(email_id)
                    if email_data:
                        _process_one(email_data)
                    client.mark_as_read(email_id)
    except Exception as e:
        logger.error(f"Poll cycle error: {e}", exc_info=True)


def _process_one(email_data: dict):
    message_id = email_data.get("message_id", "")
    with get_conn() as conn:
        if is_already_processed(conn, message_id):
            return

        # Find matching parser
        parser = next((p for p in PARSERS if p.can_parse(email_data)), None)
        if not parser:
            return

        order = parser.parse(email_data)
        if not order:
            log_email(conn, message_id, email_data.get("from",""),
                      email_data.get("subject",""), "unknown", "sale",
                      email_data.get("body",""), {}, 0.0, "failed")
            return

        # Log email to DB first (before processing, for dedup)
        email_id = log_email(
            conn, message_id, email_data.get("from",""),
            email_data.get("subject",""), order.marketplace, "sale",
            order.raw_email_body,
            {"order_number": order.order_number, "sku": order.get_sku(),
             "price": order.price, "quantity": order.quantity},
            0.9,  # confidence placeholder
            "processed"
        )

        # Process sale via DB function
        try:
            txn_id = write_sale(conn, order, email_id)
            logger.info(f"Sale processed: order={order.order_number} txn={txn_id}")
        except Exception as e:
            logger.error(f"Sale processing failed for {order.order_number}: {e}")
            # Update email status to failed
            with conn.cursor() as cur:
                cur.execute("UPDATE emails SET status='failed' WHERE id=%s", (email_id,))
```

### Migration Script: processed_emails.json → emails table

```python
# apps/api/scripts/migrate_processed_emails.py
# Run once before first email poller deployment

import json, os
from db import init_pool, get_conn

def run():
    init_pool()
    data_file = os.environ.get("PROCESSED_EMAILS_FILE", "/data/processed_emails.json")
    if not os.path.exists(data_file):
        print(f"No file at {data_file}, skipping migration")
        return

    with open(data_file) as f:
        records = json.load(f)

    with get_conn() as conn:
        with conn.cursor() as cur:
            migrated = 0
            for msg_id, meta in records.items():
                try:
                    cur.execute(
                        """INSERT INTO emails (message_id, status, processed_at)
                           VALUES (%s, 'processed', NOW())
                           ON CONFLICT (message_id) DO NOTHING""",
                        (msg_id,)
                    )
                    migrated += 1
                except Exception as e:
                    print(f"Skip {msg_id}: {e}")
    print(f"Migrated {migrated} processed email records")

if __name__ == "__main__":
    run()
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| FIFO in Python loop (stock_manager.py) | FIFO as PostgreSQL function with SELECT FOR UPDATE | Phase 1 | Race condition eliminated |
| Processed email tracking in JSON file | DB-backed dedup via emails.message_id UNIQUE | Phase 3 | Survives container restarts, no local file |
| Config API sidecar (Express, port 8085) | fixed_costs table + FastAPI router | Phase 3 | Single data store; no sidecar container |
| profit.js reads localStorage transactions | profit.js fetches from /api/profit/summary | Phase 3 | Accurate, persistent, cross-device |
| InvenTree API calls for stock deduction | process_sale() PostgreSQL function | Phase 3 | Atomic, no network hop, no InvenTree dependency |

**Deprecated/outdated:**
- `omiximo-email-automation/src/inventory/inventree_client.py` — replaced entirely by psycopg2 writes
- `omiximo-email-automation/src/inventory/stock_manager.py` — replaced by `sale_writer.py` + `purchase_writer.py`
- `omiximo-email-automation/src/inventory/sales_order_manager.py` — replaced by `process_sale()` DB function
- `omiximo-email-automation/src/utils/tracking.py` (ProcessedEmailTracker) — replaced by `email_log.py` DB dedup
- `omiximo-email-automation/src/config_api.py` — entire file removed; Config API dies in Phase 3

---

## Open Questions

1. **Purchase email parsing (MAIL-01)**
   - What we know: All three existing parsers only handle sale emails (marketplace order confirmations). No purchase email parser exists in the codebase.
   - What's unclear: Do purchase emails arrive from a separate supplier inbox? What format are they (Amazon Business order confirmation, direct supplier invoice, etc.)? Or is MAIL-01 satisfied by a manual "receive stock" UI action instead?
   - Recommendation: Plan for a `POST /api/stock-lots` endpoint (manual stock IN) as the MVP path for MAIL-01. Add supplier email parsing as a follow-on if needed. Flag this for clarification with the user before planning.

2. **SKU vs EAN — product lookup in email service**
   - What we know: `process_sale()` takes `p_parent_ean TEXT` and looks up `products.ean`. The parsers extract `order.sku` (Interne referentie, e.g., "OMX-GHANA-2026-R7-5700X-RTX5050-16G-1T") which is NOT an EAN barcode.
   - What's unclear: Are products already registered in the `products` table with their marketplace SKU stored in `products.sku`? The composition system (Phase 2) uses EANs throughout.
   - Recommendation: The sale_writer must do a two-step lookup: `SELECT ean FROM products WHERE sku = $1` to convert marketplace SKU → EAN before calling `process_sale()`. Add this lookup to the plan.

3. **Fixed costs seed data**
   - What we know: The `fixed_costs` table starts empty. The frontend `profit.js` DEFAULTS have `vat=21%, commission=6.2%, overhead=€95`.
   - What's unclear: Should the migration script seed these defaults, or should the user configure them via the frontend after Phase 3?
   - Recommendation: Include seed data in Wave 0 that inserts the three default fixed costs (matching the existing `profit.js` DEFAULTS). The user can edit them via the UI afterward.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Python 3 | Email poller, FastAPI | ✓ | 3.13.5 | — |
| Docker | Container orchestration | ✓ | 28.5.1 | — |
| APScheduler 3.x | Email polling scheduler | ✓ (in requirements.txt) | 3.11.0 pinned (3.11.2 latest) | — |
| psycopg2-binary | DB writes from email service | ✓ (in requirements.txt) | 2.9.11 | — |
| imapclient | IMAP email fetching | In email service requirements.txt | 2.3.1 | — |
| PostgreSQL | Data store | ✓ (Docker) | 15-alpine | — |
| IMAP server (Hostnet) | Live email polling | External | — | Test with offline email fixture |

**Missing dependencies with no fallback:** None — all required dependencies are available.

**Missing dependencies with fallback:** IMAP server access requires `IMAP_PASSWORD` env var. For development/testing, the poller should handle missing env gracefully and log a warning rather than crashing FastAPI startup.

---

## Validation Architecture

> `workflow.nyquist_validation` is `false` in .planning/config.json — this section is skipped.

---

## Sources

### Primary (HIGH confidence)
- `apps/api/sql/init.sql` — Authoritative source for `process_sale()`, `deduct_fifo_stock()`, `resolve_composition()` function signatures and behavior
- `apps/api/db.py` — Connection pool pattern, `get_conn()` context manager
- `apps/api/main.py` — APScheduler integration point, lifespan pattern
- `omiximo-email-automation/src/main.py` — Email polling loop to be preserved
- `omiximo-email-automation/src/marketplace_parsers/base.py` — `OrderData` dataclass fields
- `omiximo-email-automation/src/marketplace_parsers/mediamarktsaturn.py`, `bolcom.py`, `boulanger.py` — Parser implementations to be preserved
- `apps/api/requirements.txt` — APScheduler 3.11.0 already included
- `.planning/REQUIREMENTS.md` — MAIL-01 through MAIL-05, PROF-01 through PROF-06 definitions
- `.planning/research/PITFALLS.md` — P1 (FIFO race), P8 (processed state migration)
- `SPECS-MVP.md` — Core value loop definition, data model, acceptance criteria

### Secondary (MEDIUM confidence)
- APScheduler 3.x documentation — BackgroundScheduler + max_instances pattern (verified against existing requirements.txt version 3.11.0)
- `inventory-omiximo/frontend/profit.js` — Existing profit engine patterns for frontend rewiring

### Tertiary (LOW confidence)
- None

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries are already pinned in requirements.txt; no new dependencies
- Architecture: HIGH — derived directly from existing code in repo (init.sql, main.py, parsers)
- Pitfalls: HIGH — P1 and P8 from PITFALLS.md research; P2-P7 from code inspection

**Research date:** 2026-04-02
**Valid until:** 2026-05-02 (stable stack; no fast-moving dependencies)
