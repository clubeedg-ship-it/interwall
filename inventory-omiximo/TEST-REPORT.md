# Omiximo Inventory OS - Code Analysis & Test Report

**Generated:** 2026-02-03
**Analysis Type:** Static Code Analysis + Architecture Review

---

## Executive Summary

The application has **significant sync issues** due to heavy reliance on `localStorage` for data that should be shared across devices. While some components sync via the Config API and InvenTree, critical data remains device-local.

| Issue Category | Severity | Count |
|----------------|----------|-------|
| Sync Issues | HIGH | 6 |
| Data Integrity | HIGH | 3 |
| UX Issues | MEDIUM | 4 |
| Code Quality | LOW | 5 |

---

## Critical Sync Issues

### 1. Transactions NOT Synced Properly
**File:** `profit.js` lines 1474-1480
**Problem:** Transactions saved to `localStorage` only. The `syncToInvenTree()` function creates Sales Orders but:
- Only runs for NEW sales, not edits
- Doesn't update local transactions when InvenTree data changes
- Different devices have different transaction histories

**Evidence:**
```javascript
localStorage.setItem('omiximo_transactions', JSON.stringify(profitState.transactions));
```

### 2. Zone Configuration NOT Synced
**File:** `app.js` lines 660-716
**Problem:** Zone layouts (A, B, C zones with columns/levels) stored in `localStorage`. Each device has independent zone config.

**Evidence:**
```javascript
localStorage.setItem(this.STORAGE_KEY, JSON.stringify(state.zones));
```

### 3. Shelf Configuration NOT Synced  
**File:** `app.js` lines 1056-1068
**Problem:** Per-shelf settings (split FIFO, single bin) stored locally.

### 4. JIT Configuration NOT Synced
**File:** `app.js` lines 3514-3528
**Problem:** Just-In-Time reorder settings stored locally.

### 5. View State NOT Synced (Minor)
**File:** `app.js` line 440
**Problem:** Last viewed tab stored locally (acceptable for UX).

### 6. Duplicate Transactions on Merge
**File:** `profit.js` `fetchInvenTreeSalesOrders()`
**Problem:** When loading from InvenTree, transactions may be duplicated if:
- Same order exists in localStorage with different orderId
- Customer reference matching fails

---

## Data Integrity Issues

### 1. Component Matching by Name (Not ID)
**Problem:** Parts with same name but different IDs can cause confusion. The dropdown shows names but saves by ID, leading to wrong component selection.

**Fixed in recent commit:** SKU now shown in dropdown

### 2. FIFO Cost Calculation Race Condition
**File:** `profit.js` `calculateFifoCost()`
**Problem:** If two users record sales simultaneously, FIFO batches may be double-counted before stock is updated.

### 3. Stock Deduction Not Atomic
**File:** `profit.js` lines 1276-1300
**Problem:** Stock PATCH calls are sequential, not transactional. A failure mid-way leaves partial deductions.

---

## UX Issues

### 1. Slow Initial Load
**Problem:** Page can take 10+ seconds on first load due to:
- Multiple sequential API calls
- No skeleton loading states
- Large JS bundles

### 2. No Offline Support
**Problem:** App completely fails without network. No cached data available offline.

### 3. No Conflict Resolution
**Problem:** When sync conflicts occur (different data on devices), there's no UI to resolve them.

### 4. Hidden Console Errors
**Problem:** Many operations fail silently with only console.warn, not user-visible errors.

---

## Code Quality Issues

### 1. Mixed Async Patterns
- Some functions use async/await
- Some use .then() chains
- Some use callbacks
- Inconsistent error handling

### 2. Global State Pollution
- `window.state`, `window.profitState` used
- Multiple singletons (`costConfig`, `fixedComponentsConfig`)
- Hard to track state changes

### 3. No TypeScript
- No type safety
- Runtime errors from undefined properties
- Hard to refactor safely

### 4. Duplicate Code
- Multiple implementations of similar dropdown population
- Repeated API call patterns without abstraction

### 5. CSS Not Modular
- Single 5000+ line CSS file
- No CSS modules or scoping
- Specificity conflicts

---

## Recommended Fixes (Priority Order)

### P0 - Critical (Fix Immediately)
1. **Store all config in backend** - Zone config, shelf config, JIT config
2. **Proper transaction sync** - Use InvenTree SO as source of truth, merge properly
3. **Atomic stock operations** - Use InvenTree's bulk operations

### P1 - High (Fix This Week)  
4. **Add conflict resolution UI** - Show when data differs across devices
5. **Fix FIFO race condition** - Lock mechanism or optimistic concurrency
6. **Better error handling** - User-visible errors with retry options

### P2 - Medium (Fix This Month)
7. **Add TypeScript** - Gradual migration
8. **Modular CSS** - Split into component files
9. **Add loading skeletons** - Better perceived performance
10. **Add offline mode** - Service worker with cached data

---

## Screenshots Directory

Screenshots would be in: `~/omiximo-inventory/tests/screenshots/`
(Browser tests failed to run due to Playwright installation timeout)

---

## Files Changed in This Analysis

- `~/omiximo-inventory/TEST-REPORT.md` (this file)
- `~/omiximo-inventory/REFACTOR-PROMPT.md` (coding assistant prompt)
