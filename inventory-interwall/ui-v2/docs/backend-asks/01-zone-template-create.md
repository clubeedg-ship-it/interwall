# Backend ask — zone creation with shelf template

Status: **requested**
Requester: `ui-v2` (Wall / Manage Zones wizard)
Target: `apps/api/routers/zones.py`
Depends on: nothing; additive to existing schema

---

## Why

The `ui-v2` Wall has a **Manage Zones** panel with an **"+ Add New Zone"** wizard. The
operator picks a **name**, **columns**, **levels**, and optionally a **template**
(Small / Standard / Large / Custom). We need a single atomic call that creates the
zone **and** materializes the full grid of shelves for it.

Today `POST /api/zones` accepts only `name + is_active` and stores placeholder
`columns=1, levels=1` on the row itself, because T-C03 derives the grid from the
`shelves` table. That leaves a freshly-created zone with zero shelves — the Wall
renders nothing for it until someone adds shelves one by one, and there is no
endpoint to do that.

We do **not** want the UI to fake it by showing editable columns/levels that the
server silently ignores (the legacy frontend does this and it's a known false
affordance). We want the wizard's inputs to be real.

---

## Endpoint

Extend `POST /api/zones`. Do **not** add a new path. Keep the existing
name-only behaviour when `template` is absent, so nothing else breaks.

```
POST /api/zones
Auth:  session required
Body:  ZoneCreate
Status on success: 201 Created
```

### Request body — `ZoneCreate`

```jsonc
{
  "name": "C",                  // required, min_length 1, unique across zones
  "is_active": true,            // optional, default true  (existing behaviour)
  "template": {                 // optional; when omitted, no shelves are materialized
    "cols": 4,                  // required, int, >= 1, <= 26
    "levels": 7,                // required, int, >= 1, <= 26
    "split_bins": true,         // required; true -> every cell gets A + B rows
                                //           false -> every cell gets a single row (bin = NULL)
    "single_bin_cols": [4]      // optional, default []; column numbers (1-based)
                                // that must be solid regardless of split_bins.
                                // `single_bin = TRUE` on the base shelf for those columns,
                                // and no A/B rows are emitted for them.
    "default_capacity": null    // optional, default null; applied to every shelf
                                // created by this request. Must be > 0 if provided.
  }
}
```

Validation rules (return `422` on violation):

- `template.cols` and `template.levels` must be in `[1, 26]`.
- `template.single_bin_cols` entries must be unique, each in `[1, cols]`.
- If `template.split_bins == false`, `template.single_bin_cols` must be empty
  (it's already solid everywhere; the flag would be meaningless).
- `template.default_capacity`, when provided, must be `> 0`.

### Response body (success)

```jsonc
{
  "id": "uuid",
  "name": "C",
  "is_active": true,
  "cols": 4,                    // derived from shelves.max(col) — matches GET /api/zones
  "levels": 7,
  "shelves_count": 56,          // total shelf rows created (base + A/B)
  "template_applied": {         // echo of what actually got materialized, for UI confirmation
    "cols": 4,
    "levels": 7,
    "split_bins": true,
    "single_bin_cols": [4],
    "default_capacity": null
  }
}
```

When `template` is absent, the response is identical to today:

```jsonc
{ "id": "...", "name": "C", "cols": 0, "levels": 0, "shelves_count": 0, "is_active": true }
```

No `template_applied` field in that case.

---

## Shelf materialization — exact semantics

For every `col` in `1..template.cols`, for every `level` in `1..template.levels`:

- If `col` is in `template.single_bin_cols`  **OR**  `template.split_bins == false`:
  - Emit **one** shelf row: `bin = NULL`, `single_bin = TRUE` when the column is in
    `single_bin_cols`, else `single_bin = FALSE`.
  - `label = "{name}-{col:02d}-{level}"`   (D-051 format — col zero-padded to 2 digits)
- Else (split cell):
  - Emit **two** shelf rows, `bin = 'A'` and `bin = 'B'`. `single_bin = FALSE` on both.
  - `label = "{name}-{col:02d}-{level}-A"`  and  `"-B"` respectively.

Every shelf inherits:
- `zone_id` — the zone just created.
- `capacity` — `template.default_capacity` (or `NULL`).
- `split_fifo` — `FALSE`.

Shelf table constraint to respect:
`UNIQUE NULLS NOT DISTINCT (zone_id, col, level, bin)`
(see `apps/api/sql/04_shelf_addressing.sql`). The materialization above
satisfies it by construction.

---

## Error cases

| Condition                                   | Status | Detail                                        |
|--------------------------------------------|--------|-----------------------------------------------|
| `name` already exists                      | 409    | `"zone 'C' already exists"` (unchanged)       |
| `template.cols` or `levels` out of range   | 422    | `"cols must be in [1, 26]"` (pydantic-style)  |
| `template.single_bin_cols` out of range    | 422    | `"single_bin_cols[0]=9 exceeds cols=4"`       |
| `template.single_bin_cols` with `split_bins=false` | 422 | `"single_bin_cols requires split_bins=true"` |
| `template.default_capacity <= 0`           | 422    | `"default_capacity must be > 0 or null"`      |
| No warehouse configured                    | 500    | `"no warehouse configured"` (unchanged)       |

---

## Atomicity

The zone INSERT and the shelf INSERTs must be in **one transaction**.
If any shelf INSERT fails (constraint violation, anything), the zone row must
roll back too. Leaving a zone with a partial grid would be worse than the
current state.

Use a single `get_conn()` block for both.

---

## Database impact

Only INSERTs into existing tables:

- `zones` — same `INSERT INTO zones (warehouse_id, name, columns, levels, is_active)`
  as today. Keep `columns=1, levels=1` placeholders; the derived `cols/levels` in the
  response comes from the shelves, not from these columns.
- `shelves` — one row per cell (or two, when split). Label format per D-051.

No schema change. No new tables. No migrations.

---

## Tests the backend engineer should add

New file under `apps/api/tests/`. Suggested: `t_zones_template_create.py`.

Cases:

1. **name only, no template** — existing behaviour, 201 with `shelves_count=0` and no `template_applied` field.
2. **template with `split_bins=true`, no `single_bin_cols`** — asserts `shelves_count = cols*levels*2`, every shelf has `bin IN ('A','B')`, labels match D-051.
3. **template with `split_bins=true`, `single_bin_cols=[4]`, cols=4, levels=3** — asserts
   - `shelves_count = (3*2)*3 + 1*3 = 21`
   - shelves in cols 1..3 all have `bin IN ('A','B')` and `single_bin = FALSE`
   - shelves in col 4 have `bin IS NULL` and `single_bin = TRUE`
4. **template with `split_bins=false`** — every shelf has `bin IS NULL`, all `single_bin = FALSE`, `shelves_count = cols*levels`.
5. **`default_capacity=100`** — every created shelf has `capacity=100`.
6. **409 on duplicate name** — no shelves left behind (query `shelves` count for the would-be zone is 0).
7. **422 on `single_bin_cols=[9]` with `cols=4`**.
8. **422 on `single_bin_cols=[1]` with `split_bins=false`**.
9. **Rollback on mid-insert failure** — mock a shelf insert to fail, assert the zone row doesn't exist.

---

## UI contract the frontend will wire against

Once this endpoint ships, the Wall's **Manage Zones → + Add New Zone** wizard
submits exactly this body:

```jsonc
{
  "name": "<user input>",
  "template": {
    "cols": <user input>,
    "levels": <user input>,
    "split_bins": true,                 // fixed to true for now; wizard has no toggle
    "single_bin_cols": [],              // empty for now; wizard has no per-column editor yet
    "default_capacity": null
  }
}
```

Templates in the dropdown map to `{cols, levels}` pairs:

| Template     | cols | levels |
|--------------|------|--------|
| Small        | 3    | 5      |
| Standard     | 4    | 7      |
| Large        | 6    | 10     |
| Custom       | (user-entered) | (user-entered) |

These template values live in a single frontend config module, not hardcoded in
components.

On 201, the UI refetches `GET /api/zones` + `GET /api/shelves/occupancy` to
repaint the grid. On 409, the wizard shows the error inline and keeps the form open.

---

## Out of scope for this ask

- DELETE `/api/zones/{id}` / cascade design — still blocked (legacy comment already notes this).
- Editing zone geometry after creation — not handled here. If an operator wants a
  different grid, they create a new zone.
- `POST /api/shelves` for incremental single-shelf creation — not needed by the
  wizard. Skip for now.
- `single_bin_cols` per-row editing from the wizard UI — the endpoint supports it
  so we can expose per-column solid toggles later without a second backend change.
