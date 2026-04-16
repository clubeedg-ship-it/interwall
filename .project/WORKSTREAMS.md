# Interwall Lane Memory

Use one lane at a time. Read only the lane you are working in.

## Backend lane

### Scope

- Primary roots:
  - `apps/api/`
  - `.project/`
  - `scripts/`
  - `docker-compose.yml`
- Treat frontend directories as read-only unless the task explicitly changes an API contract used by the frontend

### Search order

1. Read `.project/SESSION.md`
2. Read this backend section
3. Read `AGENTS.md`
4. If the task touches an existing invariant or settled architecture choice, search `.project/DECISIONS.md`
5. Read the smallest relevant router, SQL file, worker, or test

### Search map

- Routing and endpoint shape:
  - `apps/api/routers/*.py`
- DB bootstrap and runtime SQL:
  - `apps/api/sql/*.sql`
- Shared DB/runtime helpers:
  - `apps/api/db.py`
  - `apps/api/main.py`
- Ingestion:
  - `apps/api/email_poller/*`
  - `apps/api/ingestion/*`
  - `apps/api/ingestion_worker.py`
- Tests:
  - `apps/api/tests/*`

### When searching for X

- FIFO, COGS, immutable profit:
  - search `process_bom_sale`, `deduct_fifo_for_group`, `deduct_fifo_for_product`
- marketplace routing, SKU mapping, draft review:
  - search `external_item_xref`, `sale_writer`, `process_ingestion_event`, `review`, `dead_letter`
- health or invariant surfaces:
  - search `v_health`, `health.py`, `v_part_stock`, `v_shelf_occupancy`
- builds or mixed-source lines:
  - search `source_type`, `item_group_id`, `product_id`, `build_components`

### Delivery contract

- Keep backend tasks bounded to one behavior or one contract packet
- Attach proof from the narrowest relevant tests first
- Do not rewrite planning docs unless the current backend truth actually changed

## Frontend lane

### Scope

- Primary roots:
  - `inventory-interwall/ui-v2/`
  - `inventory-interwall/frontend/` as legacy reference
  - `.project/`
- Treat backend code as contract reference unless the task explicitly requires a backend change

### Search order

1. Read `.project/SESSION.md`
2. Read this frontend section
3. Read `AGENTS.md`
4. Read the smallest relevant `ui-v2` page/component
5. Read the matching legacy frontend file and backend router before wiring

### Search map

- App shell and routes:
  - `inventory-interwall/ui-v2/src/App.tsx`
  - `inventory-interwall/ui-v2/src/components/Shell.tsx`
  - `inventory-interwall/ui-v2/src/config/views.tsx`
- Pages:
  - `inventory-interwall/ui-v2/src/pages/*`
- Shared components:
  - `inventory-interwall/ui-v2/src/components/*`
- API and types:
  - `inventory-interwall/ui-v2/src/lib/api.ts`
  - `inventory-interwall/ui-v2/src/lib/types.ts`
- Legacy truth:
  - `inventory-interwall/frontend/*.js`
- Contract truth:
  - `apps/api/routers/*.py`

### Product rules

- `ui-v2` is a rebuild, not a redesign
- Preserve Interwall’s operator-console character
- Only one modal exists in the rebuild: the Build workspace
- Do not invent backend behavior or hardcode domain data
- Prefer inline flows over floating dialogs

### When searching for X

- top-level view routing or view state:
  - search `ALL_VIEWS`, `ported`, page names in `src/config/views.tsx`
- Wall behavior:
  - search `WallPage`, `ZoneGrid`, `BinDrawer`, legacy `wall.js`
- Catalog behavior:
  - search `CatalogPage`, `LocationPicker`, `CategoryManager`, legacy `catalog-core.js`
- Profit behavior:
  - search `ProfitPage`, `TrendChart`, `InventoryTable`, router `profit.py`
- Builds behavior:
  - search `BuildsPage`, `BuildWorkspace`, router `builds.py`, router `external_xref.py`
- Health or review queues:
  - search `HealthPage`, router `health.py`, `.project/CRITICAL-PATH-AGENTS.md`

### Delivery contract

- Keep tasks view-scoped or component-scoped
- Verify behavior against both the backend router and the legacy screen before calling it done
- If the backend contract is missing, report the exact missing field or endpoint instead of mocking it

## References

- `.project/DECISIONS.md` for settled rules
- `.project/TODO.md` for queue/sequence state
- `.project/CODEBASE-ANALYSIS.md` and `.project/CRITICAL-PATH-AGENTS.md` for deeper audits only when the lane summary above is not enough
