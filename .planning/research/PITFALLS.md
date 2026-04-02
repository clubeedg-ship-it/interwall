# Pitfalls Research: Omiximo Inventory MVP

## Context

Brownfield cleanup: replacing InvenTree API with direct PostgreSQL, removing localStorage for business data, rewiring Python email service. Known issues: N+1 queries, XSS, monolithic 4485-line app.js, cross-device localStorage sync failures.

---

## P1: FIFO Race Condition on Concurrent Sales (CRITICAL)

**Risk:** Two sale emails processed simultaneously deplete the same stock lot, causing negative inventory or incorrect COGS.

**Warning signs:**
- Stock quantities go negative
- Two transactions reference the same lot with overlapping quantities
- COGS calculations don't match expected values

**Prevention:**
- Use `SELECT FOR UPDATE` in PostgreSQL FIFO deduction function
- Process sales sequentially in the email service (single worker, no parallelism)
- Add CHECK constraint: `stock_lots.quantity >= 0`
- Wrap full sale workflow (composition lookup → all component deductions → transaction record) in a single database transaction

**Phase:** Database schema + server functions (Phase 1)

---

## P2: Premature localStorage Removal Breaks Frontend (HIGH)

**Risk:** Removing localStorage calls before the database replacement is wired up leaves the frontend in a broken state where neither data source works.

**Warning signs:**
- Wall shows empty after removing localStorage reads
- Zone config lost but DB queries not yet connected
- "Cannot read property of null" errors from missing localStorage data

**Prevention:**
- **Migration pattern:** Add DB reads FIRST, verify they work, THEN remove localStorage reads
- Never delete a localStorage read without a working DB read in its place
- Keep a compatibility layer: `getData(key)` that tries DB first, falls back to localStorage during migration
- Test each module independently: wall, zones, shelves, transactions, cost config

**Phase:** Frontend rewiring (Phase 2-3, after DB and API exist)

---

## P3: app.js Split Introduces Regressions (HIGH)

**Risk:** Splitting a 4,485-line monolith into modules breaks cross-module references, event handlers, or initialization order.

**Warning signs:**
- Functions become undefined after split
- Event listeners fire before their handler module loads
- `window.state` references break when state module loads after dependent modules

**Prevention:**
- Split is mechanical: extract modules, keep `window.moduleName` pattern, keep same init order
- Do NOT refactor logic during the split — only move code between files
- Add script tags in dependency order in index.html
- Run manual smoke test after each module extraction (wall loads, scanner works, catalog searches)
- Keep a checklist: wall, scanner, catalog, profit, zones, shelves, auth, router, settings, theme

**Phase:** Frontend cleanup (should be early — unblocks all other frontend work)

---

## P4: Schema Mismatch Between JS and Python Clients (HIGH)

**Risk:** Frontend JS and Python email service use different column names, types, or query patterns against the same database, causing silent data inconsistency.

**Warning signs:**
- Python inserts a stock lot but frontend can't read it (wrong column name)
- Frontend updates a field Python doesn't know about
- Timestamps stored in different formats (ISO vs Unix)

**Prevention:**
- Single schema migration file is the source of truth
- Both clients use Supabase client library (same query interface)
- For complex operations, use PostgreSQL functions (RPC) — same function called from both clients
- Test: Python creates a stock lot → frontend reads it → quantities match

**Phase:** Schema creation (Phase 1) + integration testing

---

## P5: EAN Composition Circular References (MEDIUM)

**Risk:** Product A composed of B, B composed of A — infinite loop during sale processing.

**Warning signs:**
- Sale processing hangs or crashes
- Stack overflow in composition resolution
- Database function runs forever

**Prevention:**
- Add a PostgreSQL trigger or CHECK on `ean_compositions`: parent_ean != component_ean
- Composition resolution function has max depth (2 levels is enough for PC assembly)
- Validate on insert: walk the composition tree and reject if cycle detected

**Phase:** Schema creation (Phase 1)

---

## P6: N+1 Query Pattern Migrated Instead of Fixed (MEDIUM)

**Risk:** Replacing InvenTree API calls 1:1 with Supabase queries preserves the N+1 problem — wall still makes 56+ queries.

**Warning signs:**
- Wall load time doesn't improve after migration
- Network tab shows dozens of Supabase requests
- Each cell triggers its own stock query

**Prevention:**
- Replace the wall loading pattern entirely: ONE query that joins shelves + stock_lots + products
- Return aggregated data: `SELECT shelf_id, SUM(quantity), ... GROUP BY shelf_id`
- Use Supabase `.select('*, stock_lots(*)')` for eager loading where needed
- Target: wall loads in 1-2 queries, not 56+

**Phase:** Wall UI rewiring (when frontend connects to DB)

---

## P7: XSS Vectors Persist Through Migration (MEDIUM)

**Risk:** Replacing the data source doesn't fix innerHTML injection — user-controlled data (product names, marketplace names) from the database is just as dangerous as from InvenTree.

**Warning signs:**
- Product names with `<script>` tags render and execute
- Marketplace names with HTML entities break layout

**Prevention:**
- Add a `sanitize(text)` utility that escapes HTML entities
- Apply it to every `innerHTML` assignment that includes dynamic data
- Audit all `innerHTML`, `insertAdjacentHTML`, and template literal HTML in app.js (and split modules)
- Consider: `textContent` for pure text, `innerHTML` only for structural HTML

**Phase:** Frontend cleanup (during or after app.js split)

---

## P8: Email Service Loses Processed State During Migration (MEDIUM)

**Risk:** The email service currently tracks processed emails in `data/processed_emails.json`. During migration to DB, if this file is lost or not migrated, emails get reprocessed → duplicate stock entries.

**Warning signs:**
- Stock quantities suddenly double
- Duplicate transactions with same order reference
- Email service processes old emails again

**Prevention:**
- UNIQUE constraint on `emails.message_id` — duplicate inserts fail gracefully
- Migrate `processed_emails.json` → `emails` table as part of email service rewiring
- Email service checks DB `emails` table before processing (not local file)
- Idempotent processing: if order_reference already exists in transactions, skip

**Phase:** Email service rewiring

---

## P9: Auth Token Migration Gap (LOW)

**Risk:** Current auth uses InvenTree token in localStorage. Removing InvenTree removes auth. If new auth isn't ready, frontend is locked out.

**Warning signs:**
- Login page redirects to InvenTree endpoint that no longer exists
- 401 errors everywhere because no valid token exists
- Users can't access the app during migration

**Prevention:**
- Implement new auth (Supabase Auth or simple session) BEFORE removing InvenTree
- Or: temporarily disable auth for development, add it back as a dedicated step
- Single tenant + single user = auth can be very simple (email/password, session cookie)

**Phase:** Early — part of foundation/schema phase

---

## Summary: Phase Mapping

| Pitfall | Severity | Phase |
|---------|----------|-------|
| P1: FIFO race condition | CRITICAL | Schema + DB functions |
| P2: Premature localStorage removal | HIGH | Frontend rewiring |
| P3: app.js split regressions | HIGH | Frontend cleanup (early) |
| P4: Schema mismatch JS/Python | HIGH | Schema + integration tests |
| P5: Circular EAN compositions | MEDIUM | Schema creation |
| P6: N+1 migrated not fixed | MEDIUM | Wall UI rewiring |
| P7: XSS persists | MEDIUM | Frontend cleanup |
| P8: Email processed state lost | MEDIUM | Email service rewiring |
| P9: Auth token gap | LOW | Foundation |

---
*Researched: 2026-04-02*
