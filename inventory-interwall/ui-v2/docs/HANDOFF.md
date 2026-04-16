# ui-v2 session handoff

Last updated: `2026-04-16` (Profitability engine ported)
Branch: `v2`
Stack live at: `http://localhost:1441` (legacy + backend api behind nginx)
Dev server: `http://localhost:1442` (Vite, proxies `/api` → `:1441`)
Auth: session cookie; dev creds `admin / admin123`

---

## Port status

| View            | Path        | Status       | Notes                                                                                   |
|-----------------|-------------|--------------|-----------------------------------------------------------------------------------------|
| Wall            | `#/wall`    | **shipped**  | grid + drawer + Manage Zones popover (rename / grow / archive / hard-delete); shelf delete in drawer |
| Parts Catalog   | `#/catalog` | stub         | `ViewStub` only; awaiting port                                                          |
| Profitability   | `#/profit`  | **shipped**  | KPI hero, line-only SVG trend chart, tx ledger with breakdown chips, inline Cost Config side panel; inventory drill lives at `#/profit/inventory` |
| Health          | `#/health`  | stub         | `ViewStub` only; watch for legacy neon-border bug (do not copy)                        |
| Builds          | `#/builds`  | **shipped**  | read-only workspace modal + mixed-source lines; create/edit flow still TODO             |
| Batch History   | `#/history` | stub         | reachable from settings panel; awaiting port                                            |
| Login           | `/login`-ish | **shipped** | dedicated page (not modal); AuthProvider drives redirect                                |
| Settings panel  | —           | **shipped**  | inline popover (not modal): user, history link, theme toggle, logout                    |

Shell foundation (orb rail, HUD header, Ready/Clock pills, HashRouter) is done.

---

## Architecture snapshot

- **Stack:** Vite 6 + React 19 + TypeScript + Tailwind v4 + React Router v7 (HashRouter).
- **Auth:** `src/lib/auth.tsx` — `AuthProvider` checks `GET /api/auth/me` on mount; renders `LoginPage` when anonymous.
- **API client:** `src/lib/api.ts` — typed wrappers over `/api/*`. `credentials: "include"` everywhere.
- **Views config:** `src/config/views.tsx` — single source of truth for view titles, paths, icons, rail order. **Do not inline nav items elsewhere.**
- **Wall config:** `src/config/wall.ts` — zone-template presets, capacity-derived `fillFor()` (no absolute thresholds).
- **Build readiness config:** `src/config/builds.ts` — readiness states + LED tokens.
- **Modal policy:** only `BuildWorkspace` is a centered modal. Everything else inline (drawer / popover / panel). See `CLAUDE.md`.
- **Theme:** `[data-theme="light"]` overrides CSS vars in `src/index.css`. `SettingsPanel` persists to localStorage.
- **Corner radii:** tight — 6–8px panels, 4–6px controls. Pills only fully rounded.
- **Accent:** `#005066` everywhere. No `--color-accent-hi`; the legacy loader's `#00d4aa` is a one-off, not brand.

---

## Backend work outstanding

All asks live in `ui-v2/docs/backend-asks/`. Hand the paths to another chat and a backend engineer implements them.

| File                                       | Status             | What it unblocks                                         |
|-------------------------------------------|--------------------|----------------------------------------------------------|
| `01-zone-template-create.md`              | **shipped + wired** | Zone wizard with template + cols/levels                  |
| `02-zone-shelf-lifecycle.md`              | **shipped + wired** | Hard-delete zone, add shelf, delete shelf (PATCH move not picked up — marked non-goal) |

All backend asks are currently consumed. The next blocking gap will need a new `03-*.md`.

---

## What not to replicate from legacy

Captured already in `CLAUDE.md` / `AGENTS.md`. Reminders:

- **Health neon border glow** — flat panels instead.
- **Zone Configure modal's cols/levels inputs** — legacy shows them and ignores them. Do not port the false affordance; the wizard submits real values now.
- **`POWER_SUPPLY_COLUMN = 'B-4'` constant** — dropped. Solid bins come only from the `single_bin` backend flag.
- **Absolute `STOCK_WARNING` / `STOCK_CRITICAL` thresholds** — dropped. Fill is `qty / capacity` ratios.
- **Inline `prompt()` for capacity editing** — replaced with in-drawer text field, auto-save on blur.

---

## Dev loop

Run the interwall stack + Vite dev:

```bash
# backend stack (postgres + api + nginx on :1441)
cd /Users/ottogen/interwall && docker compose up -d

# ui-v2 dev server on :1442
cd inventory-interwall/ui-v2 && npm run dev
```

If `http://localhost:1441/api/health/ping` returns `000`, the stack is down — `docker compose up -d` in repo root restores it.

Common checks:
```bash
npm run typecheck
npm run build   # ~85 KB gzipped JS on this branch
```

Playwright MCP is useful for visual verification. Screenshots dropped to `ui-v2-*.png` should be cleaned up before committing (`.gitignore` covers them).

---

## Open UX threads (not backend-blocked)

- **Builds workspace — create/edit flow:** `+ New Build` button has a TODO. Needs composition editor for mixed-source lines and SKU mapping editor.
- **Builds workspace — replace components:** existing lines are read-only. `PUT /api/builds/{code}` already supports replace; UI missing.
- **Catalog port:** next likely view — legacy has search/category filter/inline part detail/batch editor. All need to become inline per modal policy.
- **Profit — manual Record Sale flow:** intentionally dropped on first pass. Sales arrive via the email-ingestion pipeline (`transactions` table is canonical, D-025/D-040). The legacy "Record Sale" modal mutated stock via InvenTree/FIFO — that path is obsolete. If a manual record flow is needed again, it should POST to `/api/transactions` (not yet exposed) and live as an inline bottom sheet.
- **Profit — `PATCH /api/profit/transactions/{id}`:** backend accepts marketplace + order_reference edits; not wired yet. No user pull for it currently.
- **Profit — per-marketplace VAT "add new row":** `POST /api/vat-rates` is wrapped in the API client but not surfaced in Cost Config (rates currently auto-create from email ingestion).
- **Health port:** grouped queue sections, flat panels. No neon borders.
- **History port:** stock_ledger_entries list; linkable from settings panel + per-batch context.
- **Scanner / handshake:** explicitly out of scope for the frontend port per user direction.

---

## Known loose ends

- Old test zones (`TCAPTEST`, `TOCCTEST`, `TOCCTEST-a763f189`) still render on the Wall. User can Archive or Delete them via the Manage Zones popover now (Delete will 409 on the two TOCCTEST zones that still hold 7 units each — drain first).
- The `interwall-web-1` orphan container occasionally shows up from earlier compose experiments — safe to `docker rm -f` if it lingers.
- `apps/api/tests/t_A07_routers.py` is noted in prior handoffs as flaky due to shared dev-db pollution. Not a ui-v2 concern but worth knowing.

---

## Resume steps for the next session

1. `pwd && git branch --show-current` — confirm `v2`.
2. `docker compose ps` — confirm `interwall-api` + `interwall-nginx` are `healthy`. If not, `docker compose up -d`.
3. `cd inventory-interwall/ui-v2 && npm run dev`.
4. Open `http://localhost:1442`, log in with `admin / admin123`.
5. Check `docs/backend-asks/*.md` for any `shipped` files not yet wired in the UI.
6. Pick the next view (Catalog is the natural next one) and follow the pattern established by Wall / Builds: read legacy JS + backend router, port layout + behavior, no hardcoded strings, one real modal max.
