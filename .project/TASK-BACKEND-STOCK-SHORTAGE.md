# Backend Task — Stock Shortage Obligation Tracking

**Single self-contained brief for the backend agent. Read `.project/STOCK-SHORTAGE-DESIGN.md` once for the UX rationale; do not re-read the rest of `.project/` unless a step says to.**

---

## Goal

When a sale email arrives that can't book due to insufficient stock, record it as a **first-class pending obligation** (not a string in an error column). When matching stock is added later, auto-book the oldest obligations FIFO. Give the frontend a real API surface to query the backlog.

## Pre-decided defaults

The design doc lists four open checkpoints. Ship with these defaults. Operator may override before dispatch; otherwise they stand.

| # | Decision | Default | Reason |
|---|---|---|---|
| 1 | Build this or discard-as-lost-sale? | **Build it** | 241 pending sales exist today — this is real deferred revenue, not noise |
| 2 | Per-sale or per-component granularity? | **Per-sale** | Marketplace contract is "ship the whole order"; matches UX concept |
| 3 | Price snapshot basis | **Email price (gross)** | Final COGS/profit still derive from the real `transactions` row when it books; this value is just the obligation face |
| 4 | Partial fulfillment allowed? | **No, all-or-nothing** | Simpler model; one obligation = one future transaction |

## Data model

Two new tables. Migration file: `apps/api/sql/15_pending_fulfillments.sql`. Idempotent, like the others (`CREATE TABLE IF NOT EXISTS`, safe re-apply at startup).

```sql
CREATE TABLE IF NOT EXISTS pending_fulfillments (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ingestion_event_id      UUID NOT NULL REFERENCES ingestion_events(id) ON DELETE CASCADE,
    marketplace             TEXT NOT NULL,
    external_sku            TEXT NOT NULL,
    build_code              TEXT NOT NULL REFERENCES builds(build_code),
    quantity                INT  NOT NULL CHECK (quantity > 0),
    unit_price              NUMERIC(12,2) NOT NULL DEFAULT 0,
    required_components     JSONB NOT NULL,          -- snapshot of per-unit composition + qty_short at block time
    blocked_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status                  TEXT NOT NULL DEFAULT 'waiting'
                            CHECK (status IN ('waiting','resolving','resolved','cancelled')),
    resolved_at             TIMESTAMPTZ,
    resolved_transaction_id UUID REFERENCES transactions(id),
    cancelled_reason        TEXT,
    UNIQUE (ingestion_event_id)                      -- one obligation per email event
);

CREATE INDEX IF NOT EXISTS idx_pf_status_blocked_at
    ON pending_fulfillments (status, blocked_at)
    WHERE status = 'waiting';

CREATE INDEX IF NOT EXISTS idx_pf_build_status
    ON pending_fulfillments (build_code, status);

CREATE TABLE IF NOT EXISTS pending_fulfillment_events (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fulfillment_id UUID NOT NULL REFERENCES pending_fulfillments(id) ON DELETE CASCADE,
    event_type     TEXT NOT NULL                   -- 'blocked','attempted','resolved','cancelled'
                   CHECK (event_type IN ('blocked','attempted','resolved','cancelled')),
    payload        JSONB,                          -- per-event detail (e.g. which stock_lot triggered the retry)
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pfe_fulfillment
    ON pending_fulfillment_events (fulfillment_id, created_at);
```

Also extend the ingestion-event state check:

```sql
ALTER TABLE ingestion_events DROP CONSTRAINT IF EXISTS ingestion_events_status_check;
ALTER TABLE ingestion_events ADD CONSTRAINT ingestion_events_status_check
  CHECK (status IN ('pending','processed','failed','review','dead_letter','backlog','discarded'));
```

New value: `backlog` — ingestion event whose sale is now tracked by an obligation. Distinct from `review` so the two operator queues never mix.

## Flow — blocked path (replaces current behavior)

Today (see `apps/api/ingestion/worker.py` `_reprocess_email`): a `deduct_fifo_for_group: insufficient stock` error puts the ingestion event in `review` with the raw error message.

New behavior (worker only — do **not** modify `process_bom_sale`):

1. Call `process_bom_sale` inside a savepoint.
2. On `insufficient stock` RAISE:
   a. Roll back the savepoint.
   b. Look up the build's current components (`build_components` × `quantity`).
   c. For each component, compute `qty_needed` and `qty_short` given current `stock_lots`.
   d. `INSERT INTO pending_fulfillments` with `required_components` snapshot.
   e. `INSERT INTO pending_fulfillment_events (event_type='blocked', payload={error, required_components})`.
   f. `UPDATE ingestion_events SET status='backlog'`.
3. On any **other** RAISE: existing behavior unchanged (retry → dead_letter, or DraftBuildPendingError → review).

Atomicity: all of step 2 happens in one outer transaction. If the obligation insert fails, the event stays `failed` and retry continues.

## Flow — resolver worker (new)

New module: `apps/api/ingestion/resolver.py`. Scheduled job on 1-minute tick (new entry in `apps/api/main.py` APScheduler wiring next to `ingestion_worker`). Also triggered inline from the stock-lot create endpoint for immediate feedback.

Per tick:
```
FOR each pending_fulfillments row WHERE status='waiting' ORDER BY blocked_at ASC FOR UPDATE SKIP LOCKED:
    check if current stock satisfies required_components × quantity
    if yes:
        UPDATE status='resolving'
        try: call process_bom_sale(build_code, quantity, unit_price, marketplace, order_ref, ingestion_event_id)
            on success:
                UPDATE status='resolved', resolved_at=NOW(), resolved_transaction_id=txn
                UPDATE ingestion_events SET status='processed'
                INSERT pending_fulfillment_events (event_type='resolved', payload={transaction_id})
            on failure (stock vanished between check and call, etc.):
                UPDATE status='waiting'
                INSERT pending_fulfillment_events (event_type='attempted', payload={error})
    if no: skip; next tick re-checks
```

Use `SELECT ... FOR UPDATE SKIP LOCKED` so concurrent resolver ticks don't fight. Batch size: process up to 50 per tick to keep tick latency bounded.

## Endpoint contract

New router: `apps/api/routers/backlog.py`, mounted at `/api/backlog`.

### List

```
GET /api/backlog?status=waiting&marketplace=X&build_code=Y&page=1&per_page=50
```

Response:
```jsonc
{
  "items": [
    {
      "id": "uuid",
      "marketplace": "BolCom",
      "external_sku": "…",
      "build_code": "BLD-042",
      "build_name": "PC Gamer R5 16GB",
      "quantity": 1,
      "unit_price": 649.00,
      "obligation_value": 649.00,               // quantity × unit_price
      "required_components": [
        { "source_type": "item_group",
          "item_group_id": "uuid",
          "item_group_code": "COMP-CPU-R5-3400",
          "qty_needed": 1,
          "qty_short_at_block": 1,
          "qty_short_now": 1 }                  // computed fresh at list time
      ],
      "blocked_at": "2026-04-12T…",
      "age_days": 4,
      "status": "waiting"
    }
  ],
  "total": 241,
  "summary": {
    "total_value": 12840.00,
    "by_marketplace": { "BolCom": 28, "Boulanger": 16, "MediaMarktSaturn": 197 },
    "oldest_blocked_at": "2026-04-12T…"
  }
}
```

### Component rollup

```
GET /api/backlog/blockers
```

Response: top blocking components — join `required_components` JSONB across all `waiting` rows, sum `qty_short_now`, sort desc.

```jsonc
{
  "items": [
    { "component_code": "COMP-CPU-R5-3400", "item_group_id": "uuid", "qty_short_total": 34, "sales_blocked": 32, "obligation_value": 6890.00, "last_stocked_at": "2026-03-29T…" }
  ]
}
```

### Detail

```
GET /api/backlog/{id}
```

Returns the `pending_fulfillments` row + full event log from `pending_fulfillment_events`.

### Cancel

```
POST /api/backlog/{id}/cancel
Body: { "reason": "string" }
```

Guards: only allowed when `status='waiting'`. Sets `status='cancelled'`, writes event log row, updates ingestion event to `discarded`.

### Trend

```
GET /api/backlog/trend?days=30
```

Response: per-day counts `{date, new_blocked, new_resolved}` for the UX chart.

All routes behind `Depends(require_session)` — same auth as every other router.

## Worker wiring

In `apps/api/main.py`:

```python
scheduler.add_job(
    resolver.resolve_once,
    trigger="interval",
    minutes=1,
    id="backlog_resolver",
    max_instances=1,
    replace_existing=True,
)
```

Also inline call in the stock-lot creation path (`apps/api/routers/stock_lots.py` POST handler) after the new lot is inserted — do a best-effort `resolver.resolve_once()` so the operator sees immediate backlog drawdown. Log any errors, don't fail the stock-lot insert.

## Tests

New file: `apps/api/tests/t_E01_backlog.py`. Must cover:

1. **Block path**: simulate a sale email for a build whose components have zero stock → assert a `pending_fulfillments` row is created with correct `required_components` snapshot, ingestion event moves to `backlog`.
2. **Resolve path — full satisfy**: block a sale, then insert a matching `stock_lot`, run `resolver.resolve_once()`, assert the obligation moves to `resolved`, a real `transactions` row exists with correct COGS, and FIFO used the newly-arrived lot.
3. **Resolve path — still short**: block a sale needing 2, insert a lot with qty 1, run resolver → obligation stays `waiting` with an `attempted` event in the log.
4. **FIFO on obligation order**: create two obligations 10 minutes apart for the same build, then insert stock that only satisfies one → assert the older obligation resolves, the newer one stays waiting.
5. **Cancel path**: cancel a waiting obligation → status changes, event log row written, ingestion event moves to `discarded`.
6. **Concurrency**: simulate two resolver ticks in parallel (use `pytest-asyncio` or thread-based) → `SELECT ... FOR UPDATE SKIP LOCKED` prevents double-booking; no duplicate transactions created.
7. **API smoke**: list, blockers, detail, cancel, trend all return expected shapes with auth.

## Live-data smoke after ship

Once tests pass, rebuild `api` and run:

```bash
docker compose exec -T api python -m ingestion.resolver --once
```

Expected: of the current 241 rows in `ingestion_events.status='review'` with stock-insufficient error, a migration pass should **convert them to `pending_fulfillments` rows** with `status='waiting'`. One-shot migration script at `apps/api/scripts/migrate_stock_review_to_backlog.py` — run once, then delete.

Then call `GET /api/backlog` and verify counts match the dashboard math:
- BolCom 28, Boulanger ~16, MediaMarktSaturn 197
- Total ~241
- `by_marketplace` rollup matches

## Not in scope

- Frontend Backlog view — separate UI task file (`TASK-BACKLOG-VIEW.md`, not yet written).
- Changes to `process_bom_sale` PL/pgSQL. Do not touch it.
- Auto-cancellation by age. Nothing auto-cancels. Operator only.
- Reservation / allocation semantics. The obligation does not reserve stock.
- Multi-component partial fulfillment. All-or-nothing per obligation.
- Purchase-order integration. Separate feature.
- Rewriting the ingestion worker's other paths (draft, dead-letter). Only the stock-insufficient branch changes.

## Success metric

Before: `SELECT COUNT(*) FROM ingestion_events WHERE status='review' AND error_message LIKE '%insufficient stock%'` = 241.

After ship + migration:
- That count goes to 0.
- `SELECT COUNT(*) FROM pending_fulfillments WHERE status='waiting'` = 241.
- `GET /api/backlog` returns the same 241 with per-component rollup available for the UI.
- Adding a new `stock_lot` for any top-blocker component triggers obligations to resolve (visible via `pending_fulfillment_events` rows with `event_type='resolved'` and a new `transactions` row).

## Dev environment

- Stack running: `docker compose ps` → all healthy. Backend at `:1441`.
- Rebuild after code change: `docker compose up -d --build api` (the api container does not mount `./apps/api`).
- Apply SQL migration manually once during dev: `docker compose exec -T postgres psql -U interwall -d interwall -f /app/sql/15_pending_fulfillments.sql` — or rely on `db.apply_runtime_sql_files()` which already picks up new files matching the numeric prefix.
- Test run: `docker compose exec -T api python -m pytest /app/tests/t_E01_backlog.py -v`.
