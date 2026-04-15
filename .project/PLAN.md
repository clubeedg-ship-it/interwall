# Interwall — Rebuild Plan

**Owner:** solo engineer
**Client:** single-tenant PC-assembly business
**Last updated:** 2026-04-15

---

## 1. Mission

Interwall is the operational backbone of a PC-assembly business. Its job:

- When a sale happens on a marketplace, **automatically deduct the correct components from stock via FIFO**, compute **real profit from real lot costs**, and **record everything durably** with a full audit trail.
- When a purchase arrives, **receive stock into a known shelf** with a known unit cost and date.
- Show the operator, at a glance, **what's on the wall, what's selling, and where the money is**, with **no reason to distrust any number on screen**.

Everything else is a means to that.

---

## 2. Why a rebuild (not a refactor)

The current system works, but three structural problems have accumulated:

1. **Data model can't express reality.** Recipes pin specific EANs, but the business sells "any RTX 3050 in stock" — the actual EAN (MSI / Gigabyte / Asus) varies per sale. Every workaround for this has bent the schema further out of shape.
2. **No single source of truth in the UI.** Different views compute the same number from different inputs; `localStorage` silently diverges from the database; numbers change on re-save with no edits. Trust is broken.
3. **Ingestion is a hack.** Email parsing was a workaround for Mirakl's €700/mo API. It's fragile, silent on failure, and has no integrity surface. Meanwhile Bol.com offers a free webhook API we aren't using.

A clean rebuild is cheaper than continuing to patch. The existing UI shell and the FastAPI/Postgres stack both survive; the **schema, the FIFO engine, the ingestion layer, and the UI's state architecture** do not.

---

## 3. Architecture — kept vs. rebuilt

**Kept** (proven, right-sized):

- FastAPI + PostgreSQL backend (no ERPNext, no Odoo adoption)
- Vanilla JS SPA shell (UI is rebuilt *within* this shell, not replaced)
- APScheduler email polling process (kept for Mirakl marketplaces that charge for API access)
- Docker Compose deployment (postgres + api + nginx)
- nginx as reverse proxy + static host
- Session-cookie auth (single user, no multi-tenant)

**Rebuilt**:

- Database schema — adopts the **AVL + BOM** layer (item groups as substitute pools; builds as finished-product recipes; stock ledger entries as audit trail)
- FIFO engine — pools across an item group (oldest lot wins regardless of specific EAN), writes per-lot ledger rows
- Ingestion — Bol.com migrated to webhooks; email poller kept as fallback + for Mirakl marketplaces
- UI state model — database is the single source of truth; `localStorage` holds only pure UI preferences; transactions store computed values immutably and the frontend renders them, never recomputes
- Shelf addressing — normalized to industry-standard Zone / Column / Level / Bin
- Health/observability surface — new page that surfaces ingestion status, orphan state, invariant violations

**Lifted from existing OSS without adopting the runtime**:

- Schema shapes from ERPNext (`Item`, `BOM`, `BOM Item`, `Item Alternative`, `Stock Ledger Entry`) — translated to our Postgres DDL
- FIFO edge-case handling informed by Tryton's `product_cost_fifo` module
- Bol.com Retailer API via the official OpenAPI spec

---

## 4. Vocabulary (locked)

**Database / code / API**:

| Table | Purpose |
|---|---|
| `products` | Physical catalog — real parts with EANs |
| `item_groups` | Substitute pools (AVL) — "any RTX 3050" |
| `item_group_members` | Which products belong to which group |
| `builds` | Finished-product recipes (keyed by `build_code`) |
| `build_components` | Lines of a build: `(item_group_id, quantity)` |
| `stock_lots` | Physical received lots (unit cost, date, shelf, optional serial) |
| `stock_ledger_entries` | Per-movement audit rows (signed qty_delta, unit_cost, txn_id) |
| `external_item_xref` | Marketplace SKU → build_code mapping |
| `warehouses`, `zones`, `shelves` | Physical location hierarchy (Zone / Column / Level / Bin) |
| `transactions` | Sale or purchase events (with immutable cogs + profit) |
| `fixed_costs` | VAT %, commission %, overhead € |

**UI labels** (what the client reads):

| Page | Data behind it |
|---|---|
| Parts | `products` + aggregated stock |
| Batches (inside Part) | `stock_lots` + `stock_ledger_entries` history |
| Models | `item_groups` |
| Builds | `builds` + `build_components` + `external_item_xref` |
| Wall | `shelves` + batch occupancy |
| Sales | `transactions` where type='sale' |
| Purchases | `transactions` where type='purchase' + stock-in events |
| Profit | aggregates over `transactions` |
| Settings | `fixed_costs` + configs + marketplace credentials |
| Health | diagnostics queries (no single table) |

---

## 5. Work streams

Three streams, sequenced. Each has a clean start and a measurable finish.

### Stream A — Backend rework

Replace the schema and the sale-processing engine.

**Scope**:

- Additive DDL: `item_groups`, `item_group_members`, `builds`, `build_components`, `external_item_xref`, `stock_ledger_entries`; rename/normalize shelf addressing columns; add forward-compat columns (`priority`, `valid_from/valid_to`, `serial_number`) without wiring them
- Backfill from existing `ean_compositions` into the new tables (idempotent, non-destructive)
- PL/pgSQL functions: `deduct_fifo_for_group`, `process_bom_sale` — both single-transaction atomic, both using `SELECT FOR UPDATE`
- FastAPI routers: `/api/item-groups`, `/api/builds`, `/api/external-xref`; extend `/api/stock-lots` with shelf assignment
- Email poller update: resolve marketplace SKU → `build_code`, prefer `process_bom_sale`, fall back to legacy `process_sale` when no mapping exists
- Keep legacy `ean_compositions` + `process_sale()` functional until the new path is stable

**Done when**:

- A seeded end-to-end test passes: create group → attach 3 EANs → create build → map marketplace SKU → receive stock for all 3 at different dates → simulate sale → oldest lot across the group decrements, ledger rows written, COGS correct, legacy tests still pass
- Direct-sale products (monitors, mini-PCs) work through the fallback path without special-casing

### Stream B — Marketplace ingestion

Fix the reliability gap the email parser hides.

**Scope**:

- Bol.com Retailer API webhook receiver (free, HMAC-signed, out of beta)
- Unified ingestion table: all events (webhook + email) land in the same pipeline with a `source` column
- Keep email poller for MediaMarktSaturn and Boulanger (Mirakl — paid API not justified at current volume)
- Dead-letter / pending state for anything that fails to parse or fails to process; surfaced on the Health page
- Reliability comparison: Bol.com webhook vs. existing email parser, run in parallel for a window, log discrepancies

**Explicitly deferred** to a future stream (not this rebuild):

- AI-assisted email-mapping workflow — tracked as a Unique Selling Point, not scoped here
- Paid Mirakl API migration — not worth it at current volume

**Done when**:

- Bol.com sales arrive via webhook and are processed without the email poller touching them
- Parallel-run report shows webhook and email agree for a one-week overlap window
- Health page shows ingestion status per marketplace at a glance

### Stream C — UI rebuild

Rebuild the frontend's state architecture and every view that depends on it.

**Scope**:

- Single-source-of-truth refactor: every view fetches from canonical endpoints, no recomputation at render time, no `localStorage` for business data (only pure UI prefs like dark mode)
- `transactions.cogs` and `transactions.profit` stored immutably; rendered verbatim
- Wall page: primary interface for shelf-related interactions — browsing AND assignment; progressive zoom (Zone → Column → Level → Bin) replaces the shelf dropdown
- Parts page → Part detail → Batches view: full batch history with colour semantics (active lots coloured by JIT health gradient; depleted lots faded grey; default shows newest, toggle reveals all)
- Product setup wizard: new Part creation flow with Basic info → JIT Reorder Point (with computed minimum stock) → Initial Stock (shelf via Wall mini-wizard, quantity, unit cost)
- Builds page: create/edit builds, see marketplace mapping coverage per build, flag missing mappings per marketplace
- Purchases feed: "feeding the machine" visualization — mirror of the Sales feed for stock-in events
- Health page: ingestion status, orphan state (products without shelf, batches without receipts), invariant checks (every sale has ≥1 ledger entry)
- No hardcoded values anywhere: JIT colour gradient breakpoints, shelf sizes, marketplace senders, VAT rates, etc. — all configurable
- XSS-safe DOM rendering: `sanitize()` on every user-data render path

**Done when**:

- The margin X→Y render bug cannot reproduce (identical input → identical output, always)
- Parts view and Profit/Valuation view show the same stock count for every part
- Wall renders reliably with no hardcoded grid dimensions; gradient colour works for all JIT levels
- Shelf dropdown is gone entirely
- Every page the client uses shows only stored values (no client-side recomputation of business numbers)

---

## 6. Principles (locked)

Non-negotiable for this rebuild. Every decision in DECISIONS.md derives from these.

1. **Database is the single source of truth.** Always. No client-side authoritative state.
2. **Computed business values are stored, not re-derived.** `cogs`, `profit`, stock counts at checkpoints — all persisted. Frontend renders, never recomputes.
3. **No hardcoded values.** Every threshold, gradient breakpoint, category, code is in the database or an explicit config surface.
4. **Industry-standard schema vocabulary** (ERPNext-aligned where sensible). Future maintainers and consultants should recognize the shape.
5. **Stock ledger is sacred.** Every stock movement emits a ledger row. Every sale transaction has ≥1 ledger row. This is double-entry for inventory.
6. **Atomic sale processing.** `process_bom_sale` is one transaction; partial fulfilment does not exist. Stock-out raises and rolls back.
7. **Strict FIFO serialization** via `SELECT FOR UPDATE`. Not `SKIP LOCKED`. Correctness over throughput at current volume.
8. **Additive migrations preferred.** Legacy structures stay until the new path is proven. No big-bang drops.
9. **Forward-compatibility columns over retrofits.** Schema-ready columns (priority, valid_from/valid_to, serial_number) cost nothing today and avoid migrations later.
10. **Lift shapes, don't adopt runtimes.** Read ERPNext / Tryton / Bol.com APIs; translate their shapes into our code; don't run their stacks.
11. **Solo-maintainer operational weight.** Every new service is 2am pages. Keep the process count minimal.
12. **Decisions are append-only and have rationale.** Every lock in `DECISIONS.md` has a one-line reason that future-you can audit.

---

## 7. Success criteria for the whole rebuild

The rebuild is "done" when all three are true simultaneously:

- **AVL-FIFO works in production for 30 consecutive days**, with every sale showing an auditable ledger trail and matching COGS
- **At least one marketplace (Bol.com) is ingesting via webhook**, with a measured reliability lift over email parsing
- **No UI bug from the April 2026 inventory reproduces** on the rebuilt frontend; the client trusts the numbers

---

## 8. Out of scope

Explicit "not this rebuild" list so we don't drift:

- Multi-tenant (single-tenant only)
- ERPNext / Odoo / InvenTree adoption as runtime (only as design reference)
- React / Next.js rewrite (vanilla JS stays)
- Food franchise use case (pure PC-assembly focus)
- Mirakl paid API migration (email parsing stays for MMS/Boulanger)
- AI-assisted email mapping (tracked as future USP)
- Serial number tracking at row level (schema-ready, not wired)
- Preferred-vendor priority on AVL (schema-ready, not wired)
- BOM versioning UI (schema-ready via valid_from/valid_to, UI later)
- Reservation / allocation / WIP states (not needed at current scale)
- Accounting / VAT-return integration (not needed)
- Label printing, camera scanning, manufacturing shop-floor, POS

---

## 9. Current execution focus

Open design questions do not live here anymore. They belong in
`TODO.md` until closed, then in `DECISIONS.md`.

Current focus:

- Stream A is substantially complete at the planning level; remaining
  work is execution and verification, not architecture discovery.
- Stream B is the active execution track, with `T-B02` + `T-B05`
  next: unified ingestion worker + dead-letter handling.
- Stream C remains the next major stream, but should be narrowed via
  design decisions before large execution handoffs.

Use this file for direction and scope. Use `TODO.md` for next actions.
Use `DECISIONS.md` for design locks.

---

## 10. How this plan is used

- **PLAN.md** (this file) — direction and scope. Updated when direction changes, not when tasks are done.
- **DECISIONS.md** — append-only log of every locked decision with rationale. Searchable in a year.
- **TODO.md** — sequenced next actions across the three streams. Living document.
