# UI Task — Draft-Review flow in Builds

**Single self-contained brief for the UI agent. Do not read other `.project/*` files unless a step explicitly tells you to.**

---

## Goal

Operator opens the Builds page, sees N pending "draft" builds (unresolved marketplace SKUs), clicks one, picks its components from existing item-groups or products, hits **Complete**, and sees a toast confirming how many historical blocked sales were auto-processed.

## Why this exists

Every time a marketplace email arrives with a SKU that has no build mapping, the backend:
1. extracts the SKU,
2. creates an **inactive draft build** with description prefix `[DRAFT-UNRESOLVED-SKU]`,
3. creates the `external_item_xref` so the next email with the same SKU routes to the same draft,
4. moves the ingestion event to `status='review'`.

Today: **195 drafts are sitting in the DB waiting for a UI**. 73 BolCom + 74 Boulanger + 48 MediaMarktSaturn. Until the UI exists, none of those sales can book. This task unblocks all of them in one push.

## Backend contract — already live

Three endpoints. Do not ask for new ones. Do not modify the backend.

### 1. List drafts

```
GET /api/builds?draft_only=true&include_auto=false&page=1&per_page=50
```

Response:

```jsonc
{
  "items": [
    {
      "id": "uuid",
      "build_code": "OMX-BOL-R5-16-0-009",
      "name": "… whatever the email described as product title …",
      "description": "[DRAFT-UNRESOLVED-SKU]\nmarketplace=BolCom\n…",
      "is_auto_generated": false,
      "is_active": false,
      "is_draft": true,
      "component_count": 0,
      "item_group_component_count": 0,
      "product_component_count": 0,
      "draft_marketplace": "BolCom",
      "draft_external_sku": "OMX-BOL-R5-16-0-009",
      "created_at": "2026-04-16T10:21:16Z"
    }
  ],
  "total": 195,
  "page": 1,
  "per_page": 50,
  "draft_count": 195
}
```

**Use `draft_count` for the nav-rail badge.** It's the total across pages.

### 2. Get one draft's context

```
GET /api/builds/{build_code}
```

Response (relevant fields for this task):

```jsonc
{
  "build_code": "OMX-BOL-R5-16-0-009",
  "name": "…",
  "description": "[DRAFT-UNRESOLVED-SKU]\n…",
  "is_active": false,
  "components": [],
  "draft_metadata": {
    "marketplace": "BolCom",
    "external_sku": "OMX-BOL-R5-16-0-009",
    "parsed_descriptions": [
      "PC Gamer Ryzen 5 5600G - 16GB RAM - 512GB SSD - RTX 3060",
      "PC Gaming AMD Ryzen 5 5600G 16Go 512Go SSD RTX 3060"
    ],
    "pending_review_count": 4
  }
}
```

`parsed_descriptions` = the last 5 **distinct** product descriptions that the parser extracted from emails with this SKU. Show them to the operator as hints — "the last 5 emails described this build as…".

`pending_review_count` = how many ingestion events are currently blocked waiting for this draft to be completed. Display it prominently: completing this draft will auto-process that many historical sales.

### 3. Complete the draft (and auto-replay)

```
POST /api/builds/{build_code}/complete-draft
```

Body:

```jsonc
{
  "name": "optional string — overrides name",
  "description": "optional string — overrides description, draft marker stripped automatically",
  "components": [
    { "source_type": "item_group", "item_group_id": "uuid", "quantity": 1 },
    { "source_type": "product",    "product_id":    "uuid", "quantity": 2 }
  ],
  "replay": true
}
```

Rules enforced by backend (will 400 / 409 if violated):
- `components` must be non-empty.
- Each component is **XOR**: `source_type=item_group` with `item_group_id` (no `product_id`) OR `source_type=product` with `product_id` (no `item_group_id`).
- `quantity > 0`.
- Build must still be inactive and still have draft marker.

Response:

```jsonc
{
  "build_code": "OMX-BOL-R5-16-0-009",
  "name": "…",
  "description": "…",
  "is_active": true,
  "replay": {
    "candidates": 4,
    "processed": 3,
    "review": 1,
    "failed": 0,
    "dead_letter": 0,
    "skipped": 0
  }
}
```

**The `replay` summary is the payload for the operator toast.** It says: we found 4 blocked sales for this SKU, 3 of them booked right now as real transactions (FIFO deducted, profit written), 1 is still blocked — probably on stock (see "Backlog" view if it exists). Zero errors.

## UX flow

### Navigation

- Add a `draft_count` badge to the existing **Builds** nav-rail entry (`src/config/views.tsx`). Pull it from `GET /api/builds?draft_only=true&per_page=1`. Refresh on mount + after any `complete-draft` success. Show nothing when count is zero.
- Inside **Builds** page, add a filter / tab: "Active" (current default, calls without `draft_only`) and "Pending verification" (calls with `draft_only=true`). Keep the "Pending verification" tab orange / attention-grabbing when its count > 0.

### Pending list

Each draft is a card — not a modal, not a row. Per card:
- Header: marketplace pill + `external_sku` in monospace.
- Sub-header: `pending_review_count > 0` → "**N blocked sales will process when completed**" in green text.
- Body: the `parsed_descriptions[]` list, each one as an italic line with a "copy" icon. These are the operator's only hint about what the build actually is. If the list is empty, show "No product descriptions captured" in muted text.
- Action: single **Resolve** button at the bottom of the card.

### Resolve flow

Click Resolve → reuse the **existing** `BuildWorkspace.tsx` composition editor. Do not write a new one. Open it in the same in-page slot that the existing "edit build" flow uses (not a floating modal).

Additions to the existing composition editor when invoked for a draft:
- Title changes from "Edit build" to `Complete draft · {external_sku}`.
- Above the component list, a persistent hint panel repeating the `parsed_descriptions[]`.
- Primary button says **Complete draft and replay** (not "Save").
- On submit → `POST /api/builds/{code}/complete-draft` with `replay: true`.
- On success → toast with the `replay` summary (see wording below). Return to the Pending list. Refresh `draft_count`.
- On 400/409 → inline error at the top of the workspace, button stays enabled.

### Toast wording

Derive from `replay` summary:

- All processed: `Build {code} complete · {processed} blocked sales booked as transactions.`
- Mixed: `Build {code} complete · {processed} sales booked, {review} still waiting on stock.` (Link the "still waiting" phrase to the Backlog view if/when it exists; for now, static text is fine.)
- Errors: `Build {code} complete · {processed} booked, {failed + dead_letter} errored — check Health.`

## Visual conventions

From project memory — do not rewrite the design system, just honor it:
- Corners: 6–8 px on cards and panels. 4–6 px on inputs. Pills stay fully rounded.
- No new modals. Use in-page panels / drawers already established in this codebase.
- Light + dark themes both work — test both.
- Do not hardcode thresholds or colors; derive from config if adding new categories.

## Files to reuse (do NOT recreate)

- `src/lib/api.ts` — add three typed methods: `listBuilds({ draft_only, page, per_page })`, `getBuild(build_code)`, `completeDraft(build_code, body)`.
- `src/components/BuildWorkspace.tsx` — the composition editor. Extend it, don't fork it.
- `src/pages/BuildsPage.tsx` — already ships the Active list. Add the tab / filter here.
- `src/config/views.tsx` — nav rail config. Badges already supported.
- `src/components/SettingsPanel.tsx` — popover pattern reference if you need one.

## Acceptance criteria

1. Nav rail shows a **Pending: N** badge on Builds when drafts exist; hidden when zero.
2. Builds page has two filters: Active (default) and Pending verification.
3. Pending list shows every draft from the live DB (195 currently). Each card shows marketplace + SKU + parsed descriptions + blocked-sale count.
4. Clicking Resolve opens the composition editor with draft context and a Complete-draft button.
5. Submitting with valid components calls `complete-draft`, shows the toast with replay summary, removes the card from the Pending list, decrements the badge.
6. Submitting with invalid components (empty, wrong XOR, quantity 0) shows the backend's 400/409 message inline — no form progression, no network spam.
7. One Playwright test: log in → Builds → Pending tab → first card → pick one real item_group with quantity 1 → submit → assert `is_active=true` via a follow-up `GET /api/builds/{code}` and that `draft_count` decreased by 1.

## Not in scope

- No backend changes. Not one line.
- No dead-letter console (separate task). Do not add a "Retry" button anywhere.
- No stock-shortage UI (separate task). If a replay returns `review > 0`, just say "still waiting on stock" in the toast and move on.
- No Health or History page work. Those are separate tasks.
- No new parser work. Parsers are backend-owned.
- No changes to `BuildWorkspace.tsx` behavior for *non-draft* edits.

## Success metric

Before: `SELECT COUNT(*) FROM builds WHERE is_active=FALSE AND description LIKE '[DRAFT-UNRESOLVED-SKU]%'` = 195.

After operator runs through the UI for 30 minutes: drafts cleared → multiples of blocked sales booked as real transactions. The number to watch: `SELECT COUNT(*) FROM ingestion_events WHERE status='review' AND error_message LIKE 'Draft build pending%'` drops from 195 toward 0.

## Dev environment

- Backend stack (already running): `docker compose ps` should show `api`, `nginx`, `postgres` all healthy. Frontend at `http://localhost:1441`. API proxied through nginx.
- Vite dev for ui-v2: `cd inventory-interwall/ui-v2 && npm run dev` → `http://localhost:1442`, proxies `/api` to `:1441`.
- Credentials: `admin / admin123` on the dev stack.
- Real draft data is live in the DB — you can verify visually against `GET /api/builds?draft_only=true`.
