# Critical Path to "No Caveats" — Agent-Assignable Workstreams

> Reference document. Do not read this first in a cold start.
> Start with `.project/SESSION.md`, `.project/WORKSTREAMS.md`, and `.project/RETRIEVAL.md`.
> Use this file only when a task needs deeper workstream or contract detail beyond the lane summary.

*Snapshot: 2026-04-16 · Branch: `v2` · Companion to `.project/CODEBASE-ANALYSIS.md`*

## What "done" means

**"Works without caveats"** is defined here as:
1. Every incoming sale email produces either a completed sale **or** an actionable operator alert — no silent failures, no SQL-only recovery paths.
2. Operator has self-serve UI for every queue that accumulates (review, dead-letter, stock-blocked).
3. Parsers, mapping, and the end-to-end pipeline are verified against **real email samples**, not synthetic fixtures.
4. One frontend (ui-v2), one deployment path, one runbook.

Explicit non-goals for this milestone: multi-tenant, RBAC, CI/CD, metrics/tracing, external scheduler. Those are enterprise concerns, tracked in `CODEBASE-ANALYSIS.md`.

---

## Verified backend truth (as of this write-up)

| Surface | Status | Proof |
|---|---|---|
| FIFO deduction + sale engine (`process_bom_sale`) | **100%** | `apps/api/sql/08_process_bom_sale.sql`; tests `t_A05`, `t_D05` |
| Immutable COGS/profit (D-025) | **100%** | `apps/api/routers/profit.py`; test `t_C01_profit_immutability.py` |
| Ingestion state machine + retry + dead-letter | **100%** | `apps/api/ingestion/worker.py`; tests `t_B02_B05` |
| **Draft-build on unknown SKU** | **100%** | `apps/api/email_poller/sale_writer.py` creates draft + xref + marks event `review` |
| **Draft completion + auto-replay of blocked events** | **100%** | `apps/api/routers/builds.py:355-507`; test `t_D08_draft_completion.py` |
| Parser coverage on live data | **~70%** | MMS 245 review, BolCom 73 review, Boulanger 90 dead-letter still stuck |
| Dead-letter requeue/discard endpoint | **0%** | No endpoint; requires SQL `UPDATE` today |
| Stock-shortage operator workflow | **0%** | Events sit in `review` forever; no policy |
| Frontend for any of the above | **0%** (ui-v2) / partial (legacy) | No draft-review UI, no dead-letter UI |

---

## Shared contract — Unknown-SKU → Review → Resolve

This is the flow you described. **Backend already honors it end-to-end.** Documenting the exact endpoints so the frontend agent and backend agent can't drift.

### Flow
1. Email arrives with `external_sku = X` that has no `external_item_xref` mapping.
2. `sale_writer` creates: an inactive `builds` row (`BLD-NNN`, description starts with `[DRAFT-UNRESOLVED-SKU]`) + an `external_item_xref` row mapping `(marketplace, X) → BLD-NNN`.
3. The ingestion event moves to `status='review'` (not retried).
4. **Every subsequent email with the same `external_sku`** already routes through the xref, creates its own review event against the same draft BLD-NNN (because `is_active=false` blocks sale processing).
5. Operator opens Builds UI, sees the draft, picks components, hits "Complete draft".
6. Backend: atomically replaces components, activates the build, **replays every review-status event for this (marketplace, external_sku)** via `process_ingestion_event` — returns counts of processed / failed / dead-letter.
7. From this point, any future email with that SKU processes directly (xref already exists, build is active).

### Endpoint contract

| Method | Path | Request | Response (relevant fields) |
|---|---|---|---|
| `GET` | `/api/builds?draft_only=true&include_auto=false&page=1&per_page=50` | — | `{items: [{build_code, name, description, is_draft, draft_marketplace, draft_external_sku, …}], total, draft_count}` |
| `GET` | `/api/builds/{build_code}` | — | `{..., components: [...], draft_metadata: {marketplace, external_sku, parsed_descriptions: [up to 5 sample descriptions], pending_review_count}}` |
| `POST` | `/api/builds/{build_code}/complete-draft` | `{name?, description?, components: [{source_type, item_group_id\|product_id, quantity}], replay: true}` | `{build_code, name, description, is_active: true, replay: {candidates, processed, review, failed, dead_letter, skipped}}` |
| `GET` | `/api/external-xref?marketplace=X&build_code=Y` | — | xref rows (used for "which SKUs point at this build") |

**UX mapping for the frontend agent**:
- Badge on the Builds sidebar: `draft_count` from list response.
- List filter: "Pending verification" → `draft_only=true`.
- Card content: show `draft_marketplace` + `draft_external_sku` + `parsed_descriptions[]` as hint text ("The last 5 emails described this as…"), plus `pending_review_count` ("N sales blocked waiting on this").
- Resolve modal: component picker (reuse `BuildWorkspace` composition editor) + optional name/description fields.
- On success: toast `"Completed BLD-NNN. Replayed N blocked sales: {processed} processed, {review} still blocked, {failed} errored."` — if any landed in `failed` or `dead_letter`, link to Health dead-letter view.

---

## Agent workstreams

Each workstream is sized for **one specialized agent in isolation**. Prerequisites and definition-of-done are measurable so the agent knows when to stop.

### A1 — Email Parser 100% (backend)

**Goal**: for every email currently in the live mailbox, the parser returns either a valid `parsed_data` dict **or** an explicit `cannot_parse` reason — never an unhandled exception, never a silent drop.

**Corpus**: pull the full set of real emails from IMAP into a fixture tree. Observed count: `9630` in INBOX (`COACH-HANDOFF.md`). At minimum: 200 MMS + 200 Boulanger + 200 Bol samples spanning different order types.

**Backend changes**:
- New harness: `apps/api/tests/t_parser_corpus.py` — iterates the fixture tree, asserts 100% parse coverage.
- Extend parsers in `apps/api/email_poller/parsers/{mediamarktsaturn,boulanger,bolcom}.py` until the corpus passes.
- "Parsed but unknown SKU" is a **success**, not a failure — it flows into the draft-build path.
- "Cannot parse at all" must raise a structured `ParseFailure(reason=...)` so the worker can route it to dead-letter with a meaningful reason.

**Definition of done**:
- `pytest apps/api/tests/t_parser_corpus.py` exits 0.
- Report: per-marketplace parse-success percentage, count of `cannot_parse` outcomes with distinct reasons.
- Live verification: `docker compose exec api python -m email_poller.poller.retry_pending` → the Boulanger 90 dead-letter and remaining BolCom dead-letter counts drop to zero (modulo rows that legitimately can't be parsed).

**Not in scope**: SKU-to-build mapping. Parsing ends when `parsed_data` is produced.

---

### A2 — Draft-Review Frontend (full-stack, frontend-dominant)

**Goal**: operator can see every pending draft build, resolve it in ≤3 clicks, and see the replay result. Ships on `ui-v2`.

**Backend work**: **none**. The contract above is live.

**Frontend work** (`inventory-interwall/ui-v2/`):
- New view or tab inside `BuildsPage` — "Pending verification" filter that calls `GET /api/builds?draft_only=true`.
- Badge on the nav rail (`src/config/views.tsx`) showing `draft_count`.
- Draft card component showing marketplace + SKU + sample descriptions + blocked-sale count.
- Resolve modal — adapt `BuildWorkspace.tsx` composition editor with a "Complete draft" action wired to `POST /api/builds/{code}/complete-draft`.
- Result toast with the `replay` summary; on non-zero `failed`/`dead_letter`, link to Health.

**Definition of done**:
- Playwright test: log in → land on Builds → see draft badge → click a draft → fill components → submit → assert the build is now active and the draft_count decreased.
- Manual verification with one of the 73 real BolCom review rows: resolve it → confirm the blocked event transitions to `processed` and a real `transactions` row appears with correct COGS/profit.
- Zero new backend endpoints introduced.

**Dependency note**: A1 feeds A2 — the more reliable parsing gets, the more meaningful descriptions land in `parsed_descriptions` for the operator to recognize. But A2 can start today; parse coverage improvements make the UX sharper later.

---

### A3 — Dead-Letter Console (full-stack, backend + frontend)

**Goal**: every row in `dead_letter` (today 28 BolCom + 90 Boulanger + whatever A1 trims) has a one-click path to either **requeue** (reset to `failed` for another pass) or **discard** (mark resolved, never retry). No SQL.

**Backend work needed** (does not exist):
- `POST /api/ingestion-events/{id}/requeue` — sets `status='failed'`, `attempt_count=0`, `error_message=NULL`, `dead_letter_reason=NULL`. Returns the updated row.
- `POST /api/ingestion-events/{id}/discard` — sets `status='discarded'` (new state — add to CHECK constraint and state machine diagram). Accepts optional `{reason: string}` stored on the row. Does **not** delete.
- Bulk versions: `POST /api/ingestion-events/requeue` and `/discard` with `{ids: [uuid]}` body.
- Extend `GET /api/health/ingestion/dead-letter` response to include the `id` + `parsed_data` excerpt so the UI can render an actionable list.

**Frontend work** (`ui-v2` Health page — currently a stub; this is the porting work):
- Health dashboard: per-marketplace counters for `pending`, `review`, `failed`, `dead_letter`.
- Dead-letter list with inline "Requeue" and "Discard" buttons per row, + bulk selection.
- Review list (separate tab) — these point mostly at drafts handled by A2, but should also show the stock-blocked ones so the operator knows what's stuck.

**Definition of done**:
- Backend tests for requeue/discard endpoints (add to `t_B02_ingestion_worker.py` or new file).
- Frontend Playwright: navigate to Health → see dead-letter list → requeue one → assert it moves to `failed` in the list.
- Zero dead-letter rows left in the live DB after operator runs through the UI.

---

### A4 — Stock-Shortage Workflow (decision first, then full-stack)

**Blocked on a product decision before agent work starts.** 197 MMS + 28 BolCom rows sit in `review` with `deduct_fifo_for_group: insufficient stock`. Today there is no path out except:
1. Receive more stock, requeue event manually.
2. Discard as lost sale.

**Decision needed from you**:
- **Option A** (recommended): `review` stays as the holding state. Add an operator-visible reason chip ("Waiting on stock: COMP-CPU-R5-3400 short by 3"). When operator writes new `stock_lots` that satisfy the shortage, **auto-requeue** eligible review events (a short cron inside the worker, every 5 min). Manual "Discard as lost sale" remains available.
- **Option B**: accept the sale, flag it as `stock_shortfall`, book negative-stock. This breaks the `stock_lots.quantity >= 0` CHECK — would need schema and D-022 rewrite. Probably not worth it.
- **Option C**: treat stock-insufficient as dead-letter, not review. Matches current UI affordances but loses the "will resolve automatically" property.

**Downstream work once decided**: if Option A, backend adds a `GET /api/ingestion-events?status=review&blocker_type=stock` and a worker hook that requeues on `stock_lots` insert. Frontend adds a "Waiting on stock" section to Health. ~3 days full-stack.

---

### A5 — Bol API vs Email Overlap (T-D04) — decision, not agent work

Live data: 50-order window, 49 email-only, 1 API-only, 0 overlap. Email is catching everything; the API isn't.

Two clean paths, both ~1 day of implementation:
- **Retire Bol API as primary**. Set `BOL_CLIENT_ID` empty or gate the scheduler job off. Keep email as the source of truth for Bol. Close T-D04 as "resolved — email is primary".
- **Invest in Bol API fixes**. `poller/bol_poller.py` filters on `fulfilment-method=FBR` and uses `changeIntervalMinutes=15`. Investigate whether the 49 missing orders are filtered out (FBB?), or whether the change window is wrong, or whether OAuth has per-environment quirks.

Honest read given the current 4-week cutline: **retire the API**. Revisit only if volume passes the threshold in D-081 (~20 orders/day).

---

### A6 — ui-v2 Feature Parity & Legacy Sunset (frontend)

**Goal**: ui-v2 reaches feature parity so legacy can be retired from the nginx mount.

**Remaining work** after A2 and A3 land:
- **History view** (stock_ledger_entries list) — 1–2 days.
- **Wall picker flows** (T-C04/C05 from TODO.md) — optional for parity; legacy has shelf dropdowns that work.
- **Catalog cross-references** — already mostly done in ui-v2; audit against legacy.
- **Deployment swap**: change `docker-compose.yml` nginx volume from `./inventory-interwall/frontend` to `./inventory-interwall/ui-v2/dist`, add Vite build step in `deploy-server.sh`.

**Definition of done**:
- All 7 existing Playwright specs in `inventory-interwall/e2e/` pass against the ui-v2 build.
- Legacy frontend directory moved to `inventory-interwall/frontend.legacy/` (kept for reference, not served).

---

### A7 — Operator Runbook (documentation, ~1 day)

**Goal**: one page, five failure modes, click path to fix each.

Modes to cover:
1. "I see a pending verification alert" → A2 flow.
2. "I see dead-letter growing" → A3 flow.
3. "I see 'waiting on stock' events" → A4 flow (once decided).
4. "The overnight email poll didn't run" → `/api/poll-now` + how to read scheduler logs.
5. "Numbers on the Profit page look wrong" → invariant check via `/api/health/invariants/sales-without-ledger`.

Outcome: `.project/OPERATOR-RUNBOOK.md`, distinct from `BACKEND-DEPLOY-RUNBOOK.md`.

---

## Parallelization & dependency graph

```
A1 (parser 100%)        ─┐
A2 (draft-review UI)    ─┼─ can start in parallel today (no cross-deps)
A6 (Health port, History port) ─┘

A3 (dead-letter console) ── needs ~1 day of new backend endpoints + worker tests
                              → then frontend merges into A6's Health page

A4 (stock-shortage)      ── BLOCKED on policy decision (you)
A5 (Bol API)             ── BLOCKED on policy decision (you) — implementation ~1 day either way

A7 (runbook)             ── starts after A2 + A3 ship (content depends on final UX)
```

**Recommended kickoff**: launch A1, A2, A3 in parallel. A2 is the highest leverage — it converts 300+ stuck rows into real sales once the mapping UI exists.

---

## Success metric

The single number to track: `COUNT(*) FROM ingestion_events WHERE status IN ('review','failed','dead_letter')`.

Today that number is ~400 across the three marketplaces. "No caveats" = that number trends to zero and stays there — not because of SQL intervention, but because the operator can drain any accumulation using the UI in under 5 minutes per event.
