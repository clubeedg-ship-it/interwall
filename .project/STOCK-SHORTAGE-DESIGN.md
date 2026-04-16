# Stock Shortage Tracking — Design Concept

*Concept document, not an implementation spec. For decision before build.*

## Do we have this today?

**No.** Not really.

What exists:
- `transactions` — immutable record of sales that **did** happen (FIFO deducted, COGS locked, profit written).
- `stock_ledger_entries` — per-lot consumption log of those sales. Bound to `transactions.id`.
- `stock_lots` — current on-hand, decremented as sales book.

What's missing:
- Anything that records sales that **should** happen but haven't yet because of insufficient stock.

Today those events live in `ingestion_events.status='review'` with `error_message='deduct_fifo_for_group: insufficient stock for group …'`. That is:
- a text string, not state,
- parseable only by humans,
- has no aggregate rollup ("how much do we owe in total"),
- has no trigger on stock arrival,
- has no connection to the `stock_lots` or `transactions` tables,
- vanishes the moment someone clears the error column.

For a single-digit backlog you could ignore this. The current backlog is **241 sales short on components** (€X,XXX in obligations if we had the price data). At that volume, string-matching error messages is not a system — it's a guess.

## Concept: negative credit

A stock shortage = a **pending obligation** the business has taken on. The customer paid, the marketplace expects shipment, the stock isn't there yet. Treat it like a credit: record it as state, let incoming stock draw it down FIFO, settle when it reaches zero.

Two invariants to preserve:
1. Nothing in the existing ledger (`transactions`, `stock_ledger_entries`) is ever lied to. A sale is only written when it can be written correctly. The obligation is a **separate** table; it does not fake partial sales.
2. FIFO correctness in the final transaction is preserved — the `received_at` of the new lot is used when the obligation settles, not the email's arrival time.

## Data model

New table: **`pending_fulfillments`** (one row per blocked sale).

| Column | Type | Purpose |
|---|---|---|
| `id` | UUID PK | |
| `ingestion_event_id` | UUID FK → ingestion_events | the original sale email |
| `marketplace` | TEXT | denormalized for fast rollup |
| `external_sku` | TEXT | for grouping in UI |
| `build_code` | TEXT | the resolved build (must be active by the time this row exists) |
| `quantity` | INT | units of the build owed |
| `unit_price` | NUMERIC | snapshotted at the time of the email |
| `blocked_at` | TIMESTAMPTZ | when the shortage was detected |
| `required_components` | JSONB | snapshot of what components were short at block time: `[{source_type, item_group_id\|product_id, qty_needed, qty_short}]` |
| `status` | TEXT | `waiting` \| `resolving` \| `resolved` \| `cancelled` |
| `resolved_at` | TIMESTAMPTZ NULL | |
| `resolved_transaction_id` | UUID FK → transactions NULL | the real sale that eventually booked |
| `cancelled_reason` | TEXT NULL | if operator manually cancels |

**Why snapshot `required_components` as JSONB?** Build definitions can change between when the email arrives and when the stock lands. The obligation is against the components needed *at the time*, not whatever the build looks like later.

**Why keep `quantity` separate from the components?** A build might need 1 CPU + 1 RAM + 1 SSD. If the customer ordered 3 units, the obligation is 3× each component. The components JSONB stores per-unit composition; `quantity` is the multiplier.

## Flow

### When a sale is blocked (replaces today's "goes to review")

Sale email arrives → `process_bom_sale` is called → `deduct_fifo_for_group` RAISES insufficient stock → **atomic failure rolls back the transaction attempt**.

New behavior: before re-raising to the worker, the worker:
1. Reads the build's current components.
2. Computes what was short (per component, how many units missing).
3. Inserts a `pending_fulfillments` row with `status='waiting'`.
4. Marks the ingestion event `status='backlog'` (new state — distinct from 'review' so the two operator queues don't mix).

Important: no fake transaction, no partial ledger. The ledger stays honest.

### When stock arrives

Trigger point: `INSERT INTO stock_lots`. Either a DB trigger or a worker tick — I'd lean worker tick for observability.

Flow:
1. A worker wakes up on a short interval (or is notified).
2. For each active `pending_fulfillments` row (oldest `blocked_at` first — FIFO on the obligation itself):
   - Check if current stock now satisfies all components listed in `required_components` × `quantity`.
   - If yes → set `status='resolving'` (lock), call `process_bom_sale` atomically. On success, write back `resolved_transaction_id`, `resolved_at`, `status='resolved'`, update the ingestion event to `status='processed'`.
   - If no → move on. Future stock arrivals will re-check.
3. Log every resolution action to an **event log** (`pending_fulfillment_events` — a second table, append-only), so the UI has a real history feed, not just current state.

FIFO correctness: `process_bom_sale` sees the current `stock_lots`. It will deduct from the **newly arrived lot** if that's what FIFO dictates. The COGS reflects the actual lot cost. That's correct — the sale really did consume the new stock.

### When the operator cancels

Explicit action: "mark this sale as lost / cancel obligation". Sets `status='cancelled'`, records the reason. Ingestion event moves to `status='discarded'`. No transaction ever writes.

## UX concept

### New top-level view: **Backlog**

Nav rail gets a new entry between Profit and Health. Badge shows total pending count. Colored subtly — not alarming, but persistent.

```
┌ Backlog · 241 sales waiting · €12,840 in obligations ────────────────┐
│                                                                       │
│  ┌ Trend (last 30 days) ────────────────────────────────────────┐    │
│  │    ╱╲                    ╱─╲                                 │    │
│  │   ╱  ╲    ╱╲            ╱   ╲____                            │    │
│  │  ╱    ╲__╱  ╲__╱╲      ╱         ╲___                        │    │
│  │ ╱                ╲____╱              ╲___                    │    │
│  │  incoming shortages  ▬▬▬  resolved  ─ ─                      │    │
│  └──────────────────────────────────────────────────────────────┘    │
│                                                                       │
│  ┌ Top blocking components ─────────────────────────────────────┐    │
│  │  COMP-CPU-R5-3400   need 34   last stocked 18 days ago   [i] │    │
│  │  COMP-N95-4GB       need 12   last stocked  3 days ago   [i] │    │
│  │  COMP-CPU-R7-5700   need  9   never stocked             [!] │    │
│  │  COMP-SSD-512       need  7   last stocked  7 days ago   [i] │    │
│  │  …                                                           │    │
│  └──────────────────────────────────────────────────────────────┘    │
│                                                                       │
│  ┌ Queue (oldest first) ────────────────────────────────────────┐    │
│  │  MMS   / OR-4521   · 12 days  · 2× R5-3400 short             │    │
│  │        BLD-042 "PC Gamer R5 16GB 512GB"  €649   [Cancel]    │    │
│  │  ─────────────────────────────────────────────────────────   │    │
│  │  Boul. / F905MS48  ·  9 days  · 1× N95 short                 │    │
│  │        BLD-103 "PC Bureau N95"           €299   [Cancel]    │    │
│  │  …                                                           │    │
│  └──────────────────────────────────────────────────────────────┘    │
└───────────────────────────────────────────────────────────────────────┘
```

Three bands: the **trend** gives the operator confidence that the backlog is shrinking or a warning that it's growing; the **top blockers** tell them what to buy; the **queue** is the per-sale detail for spot-checking or cancelling.

### On stock arrival

When the operator creates a new `stock_lot` (batch-in), and the background resolver picks up obligations:

- Toast on whatever page they're on: **"Stock arrival cleared 7 backlog sales — €3,420 booked. 5 still waiting."**
- The Batches view (existing) shows the new lot with a small annotation: "resolved 7 pending sales".
- The Backlog view refreshes counts in real time (or on next poll).
- Profit view reflects the newly booked transactions immediately — same-day revenue jumps.

### Integration with existing views

- **Builds page** — each build card shows a small "N pending sales" chip if backlog exists for that build. Clicking jumps to the Backlog view filtered to that build.
- **Catalog** — each component that's a top blocker shows a red outline + "N backorders" pill.
- **Profit** — a separate row in the summary: "Realized from backlog this period: €X". Keeps the operator from thinking today's profit is "real new demand" when it's actually backlog draining.
- **Purchases feed** (T-C09 future view) — incoming purchase orders show "will clear N backlog sales worth €X" as a priority signal.
- **Health** — existing ingestion counts stay. The backlog is its own thing, not a "failure" — don't mix it into ingestion health.

### Operator safety-valves

- **Cancel** per obligation (with reason). Row goes to `cancelled`. Marketplace refund is out of scope for this system — the operator handles that externally.
- **Reassign build** — if the operator realizes the draft was completed with the wrong components and the obligation is now "against the wrong build", they can re-resolve. Probably: cancel the obligation, re-trigger replay on the ingestion event, new obligation (or success) is written.
- **Nothing auto-cancels.** A 60-day-old obligation doesn't just disappear. Only explicit operator action removes an obligation.

## Scale considerations

Per-sale row count: one row per blocked sale. 241 today, growth bounded by marketplace volume × stock reliability. Even at 10× today's volume (2,400 open) this is trivial — Postgres handles it without indexing effort.

Resolver worker pass: on a 5-minute tick, re-scans all `waiting` rows. At 10k rows this is still sub-second if `status` is indexed. Optimization only if it becomes measurable.

Event log (`pending_fulfillment_events`): append-only, one row per state change. Can be auto-pruned after 12 months. Gives the operator a real audit trail — "what happened to this order between blocked_at and resolved_at".

## What this design deliberately does NOT do

- **Does not pre-allocate stock.** A pending obligation doesn't reserve anything against incoming lots; it's tested against current stock at resolve time. Two obligations can be waiting on the same component — whichever settles first wins by `blocked_at` FIFO. This keeps the data model simple and reflects the reality that we don't make reservation promises to marketplaces anyway.
- **Does not change `process_bom_sale`** — the atomic sale engine stays exactly as it is. The obligation table wraps around it, it doesn't alter it.
- **Does not break existing invariants.** D-017 (every sale has ≥1 ledger row) still holds: an obligation isn't a sale. The sale writes when stock is there, and at that point the ledger is complete.
- **Does not introduce partial/phantom transactions.** There is no "this sale is 60% done" state. Either it's waiting or it's booked.

## Effort estimate (rough, for planning)

Backend:
- Schema + migration (one new SQL file, one new JSONB column): 0.5 day
- Worker hook for blocked sales (write obligation instead of just marking review): 1 day
- Resolver worker on stock_lots insert: 1–2 days
- Event log table + writes: 0.5 day
- Endpoints: `GET /api/backlog`, `GET /api/backlog/{id}`, `POST /api/backlog/{id}/cancel`, `POST /api/backlog/{id}/reassign`: 1 day
- Tests: 1–2 days

Frontend (separate task file when ready):
- Backlog view (trend chart + top blockers + queue): 2–3 days
- Cross-page integrations (Builds chip, Catalog pill, Profit row, Batches annotation, resolve toasts): 1–2 days

Total: about **8–12 dev-days** across backend + frontend.

## Decision checkpoints before build

Before spinning up an agent on this, decide:
1. Is this worth the investment vs. simpler "discard all shortages as lost sales"? (My read: yes, because the business clearly has a cash-flow pattern where the backlog is a real asset, not noise.)
2. Should obligations be per-sale or per-component? (Design above = per-sale. Simpler UX, matches the marketplace contract.)
3. Currency/price display: use the email's price or the marketplace-adjusted price? (Design above = email price, which is gross; profit view still uses the real final COGS from the transaction once booked.)
4. Is partial fulfillment ever allowed? (Design above = no. A sale either fully fulfills or keeps waiting. Simpler and matches "we ship the full order or we don't ship".)

Once those are decided, the backend schema is concrete and a single backend agent can ship it in one packet.
