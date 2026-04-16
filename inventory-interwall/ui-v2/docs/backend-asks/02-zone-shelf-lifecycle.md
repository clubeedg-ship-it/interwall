# Backend ask — zone & shelf lifecycle (edit / delete / grow)

Status: **shipped + wired** (sections 1–3 only; section 4 "move" remained a non-goal)
Requester: `ui-v2` (Wall · Manage Zones · Bin drawer)
Target files: `apps/api/routers/zones.py`, `apps/api/routers/shelves.py`, new tests under `apps/api/tests/`
Depends on: nothing. Additive to the schema already shipped with ask #01.

---

## Why

The Wall in `ui-v2` needs four missing lifecycle operations before the operator can actually manage rack topology end-to-end:

1. **Delete a zone** (cascade-safe).
2. **Create a single shelf** inside an existing zone (to grow a rack).
3. **Delete a single shelf** (cascade-safe).
4. **Relocate a shelf** — change its `col` / `level` / `bin` (optional; see section 5).

Today you can create zones with a template and patch shelf settings, but you can't remove or extend existing racks. Operators want to evolve the layout without redoing the whole zone.

`PATCH /api/zones/{id}` already supports rename and `is_active`; that stays as-is.

---

## 1. `DELETE /api/zones/{id}`

```
DELETE /api/zones/{id}
Auth: session required
```

### Semantics

Zone removal cascades into its shelves. Any `stock_lots` referencing a shelf in the zone must either (a) be zero-qty or (b) be blocked. Pick one of these two strategies and implement it; I'll wire the UI to match.

**Option A — Strict (recommended default).** Refuse the delete if any shelf in the zone has **any** stock lot with `quantity > 0`, active or historical. Operators must drain stock first. Simpler cascade, zero risk of losing audit trail.

**Option B — Soft delete via `is_active`.** `DELETE` becomes equivalent to `PATCH { is_active: false }`. Nothing is physically removed. Downstream views already filter `is_active`. Reversible. Keeps ledger intact.

I lean **Option A** (hard delete + cascade). Rationale: zones are cheap to recreate via the template endpoint we just shipped, and history lives in `stock_ledger_entries`, not on the zone row. If you disagree or the schema forces your hand, pick B and mention it in the response.

### Request body

None.

### Response

| Outcome                                 | Status | Body                                            |
|-----------------------------------------|--------|-------------------------------------------------|
| Deleted successfully                    | 200    | `{ "ok": true, "deleted_shelves": 28 }`         |
| Zone not found                          | 404    | `{ "detail": "zone not found" }`                |
| Stock still on a shelf in the zone      | 409    | `{ "detail": "zone has stock; drain first", "shelves_with_stock": ["A-03-2-A", ...] }` |

Implementation notes:

- Use a single transaction. Grab `SELECT ... FOR UPDATE` on the zone row, then the shelf rows, then count non-zero lots.
- The existing `shelves.zone_id` FK already has `ON DELETE CASCADE`, so deleting the zone row handles the shelf rows. You still want the stock-lots pre-check to return 409 before touching anything.
- `external_item_xref`, `transactions` — unrelated to zone removal. Skip.

### Tests

- 200 on a freshly-created test zone with 0 stock (use the template endpoint to seed).
- 200 deletes all child shelves (verify `SELECT count(*) FROM shelves WHERE zone_id = ...` returns 0 after).
- 409 when any shelf has a non-zero `stock_lots` row; no rows deleted.
- 404 on an unknown `zone_id`.

---

## 2. `POST /api/zones/{id}/shelves`

Add a single shelf to an existing zone. Used when the operator extends a rack without rebuilding the whole grid.

```
POST /api/zones/{id}/shelves
Auth: session required
```

### Request body

```jsonc
{
  "col": 5,                   // required, int, >= 1, <= 26
  "level": 3,                 // required, int, >= 1, <= 26
  "bin": "A",                 // optional: "A" | "B" | null; null = solid / unsplit
  "capacity": null,           // optional, > 0 if provided
  "split_fifo": false,        // optional, defaults to false
  "single_bin": false         // optional, defaults to false; MUST be true when bin is null and this shelf is intended as a solid bin, else false
}
```

Label is derived server-side exactly like in ask #01: `"{zone.name}-{col:02d}-{level}[-{bin}]"`.

### Validation

- `col` / `level` in `[1, 26]`.
- `bin` must be one of `"A"`, `"B"`, or `null`.
- `capacity > 0` when provided.
- The combination `(zone_id, col, level, bin)` is already `UNIQUE NULLS NOT DISTINCT`. Return 409 on conflict.
- If `single_bin = true`, `bin` must be `null`. Otherwise 422.

### Response

| Outcome                                 | Status | Body                                           |
|-----------------------------------------|--------|-----------------------------------------------|
| Created                                 | 201    | full shelf row including id, label, settings  |
| Zone not found                          | 404    | `{ "detail": "zone not found" }`              |
| Position already occupied               | 409    | `{ "detail": "shelf A-05-3-A already exists" }` |
| Any validation failure                  | 422    | pydantic-style detail                          |

### Tests

- 201 creates shelf with correct derived label (`A-05-3-A`, `A-05-3` for solid).
- 409 when replaying the same request.
- 422 when `single_bin=true` with `bin="A"`.
- 404 when `zone_id` is unknown.

---

## 3. `DELETE /api/shelves/{id}`

Remove a single shelf. Useful for fixing a mistaken layout.

```
DELETE /api/shelves/{id}
Auth: session required
```

### Semantics

Strict. Refuse if there's **any** stock lot with `quantity > 0` on the shelf. Same rationale as zone delete.

### Response

| Outcome                                 | Status | Body                                           |
|-----------------------------------------|--------|-----------------------------------------------|
| Deleted                                 | 200    | `{ "ok": true }`                               |
| Shelf not found                         | 404    | `{ "detail": "shelf not found" }`              |
| Stock still on the shelf                | 409    | `{ "detail": "shelf has stock; drain first" }` |

Implementation notes:

- Pre-check `SELECT 1 FROM stock_lots WHERE shelf_id = %s AND quantity > 0 LIMIT 1`.
- `stock_lots.shelf_id` FK behaviour matters — if it's `ON DELETE RESTRICT` (likely), the DB will already block delete when zero-qty historical lots exist. That would be over-strict. If you see the 409 mis-firing on drained historical lots, relax: only `quantity > 0` should block.

### Tests

- 200 on a freshly-created empty shelf.
- 409 when a `quantity > 0` lot references the shelf.
- 200 when only historical zero-qty lots exist (if schema allows — confirm).
- 404 on unknown id.

---

## 4. `PATCH /api/shelves/{id}` extension — `bin` (optional, section stands alone)

Currently `PATCH /api/shelves/{id}` accepts `capacity`, `split_fifo`, `single_bin`. It does **not** allow moving a shelf (changing `col` / `level` / `bin`). That's by design for safety. If implementing "move" is cheap, it would unlock a nicer UI; if not, skip this section entirely — the UI has no strong need for it.

If you do pick this up:

- Accept `col`, `level`, `bin` as optional fields on the existing PATCH.
- Re-derive `label` atomically on change.
- Respect the `UNIQUE NULLS NOT DISTINCT (zone_id, col, level, bin)` constraint.
- Refuse (409) if the new position conflicts with an existing shelf.

### Tests

- Move A-01-1-A to A-02-1-A when target is free → 200, label updated.
- Move to occupied position → 409, no change.

---

## 5. What the frontend will wire

Once 1–3 ship, the Wall will expose:

| UI affordance                        | Endpoint                         |
|--------------------------------------|----------------------------------|
| Zone header "Rename"                 | existing `PATCH /api/zones/{id}` |
| Zone header "Delete"                 | new `DELETE /api/zones/{id}`     |
| Bin drawer "Delete this shelf"       | new `DELETE /api/shelves/{id}`   |
| "Grow rack" — add shelf at a new position inside a zone | new `POST /api/zones/{id}/shelves` |

All four flows show a confirm step (inline sidebar confirm — no modal) before destructive ops. Failures surface inline with the 409/422 detail strings verbatim, so copy them cleanly.

---

## Non-goals

- Shelf move / bulk edits — defer.
- Cascade "drain stock then delete" — the UI won't offer this yet. Operators drain first, then delete. Keeps the lifecycle endpoints simple.
- Warehouse-level anything — we have a single warehouse today; when we add multi-warehouse, revisit zone lifecycle.
- Soft-delete restore endpoint — if you pick Option B for zone delete, we'll ask for an undo later; not now.

---

## Summary for the backend engineer

Four new endpoints, all strict, all transaction-wrapped:

```
DELETE  /api/zones/{id}                 # cascade, 409 on stock, 200 on success
POST    /api/zones/{id}/shelves         # single shelf create
DELETE  /api/shelves/{id}                # 409 on stock, 200 on success
PATCH   /api/shelves/{id}  (extend)     # optional: also accept col/level/bin for move
```

Add targeted tests per the cases listed in each section. Reuse the patterns from `t_zones_template_create.py` and `t_C03_zones_endpoints.py`.

Ping the frontend once merged. I'll wire the UI in the same turn.
