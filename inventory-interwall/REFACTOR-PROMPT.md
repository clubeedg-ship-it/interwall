# Omiximo Inventory OS - Refactoring Task

## Context

You are refactoring a warehouse inventory management system. The codebase is a single-page application with:

- **Frontend:** Vanilla JS (app.js ~4500 lines, profit.js ~2500 lines)
- **Backend:** InvenTree (Django REST API) + Config API (Flask)
- **Storage:** Mix of localStorage (device-local) and API (synced)

## Current Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        FRONTEND                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐          │
│  │   app.js    │  │  profit.js  │  │   style.css │          │
│  │  - Router   │  │  - Sales    │  │  - 5000+    │          │
│  │  - Wall     │  │  - FIFO     │  │    lines    │          │
│  │  - Catalog  │  │  - Config   │  │             │          │
│  │  - Scanner  │  │  - Charts   │  │             │          │
│  └─────────────┘  └─────────────┘  └─────────────┘          │
└─────────────────────────────────────────────────────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        ▼                  ▼                  ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ localStorage │  │ InvenTree    │  │ Config API   │
│ (NOT SYNCED) │  │ (SYNCED)     │  │ (SYNCED)     │
│              │  │              │  │              │
│ - zones      │  │ - parts      │  │ - fixed_costs│
│ - shelves    │  │ - stock      │  │ - fixed_comp │
│ - JIT config │  │ - locations  │  │              │
│ - txns cache │  │ - orders     │  │              │
│ - view state │  │              │  │              │
└──────────────┘  └──────────────┘  └──────────────┘
```

## Critical Issues to Fix

### Issue 1: Transaction Sync
**Current:** Transactions stored in localStorage, partially synced to InvenTree Sales Orders
**Problem:** Different devices show different sales history
**Files:** `profit.js` lines 1474-1530

**Required Changes:**
1. Make InvenTree Sales Orders the ONLY source of truth
2. Remove localStorage transaction storage
3. Always load transactions from `/api/order/so/`
4. Implement proper merge logic for existing transactions

```javascript
// CURRENT (broken):
saveTransactions() {
    localStorage.setItem('omiximo_transactions', JSON.stringify(profitState.transactions));
}

// SHOULD BE:
async saveTransaction(transaction) {
    // Create/update Sales Order in InvenTree
    const so = await api.request('/order/so/', { method: 'POST', body: {...} });
    // Create line items
    for (const comp of transaction.components) {
        await api.request('/order/so-line/', { method: 'POST', body: {...} });
    }
    // Reload transactions from server
    await this.loadTransactionsFromServer();
}
```

### Issue 2: Zone/Shelf Config Sync
**Current:** Zone layouts in localStorage
**Problem:** User configures zones on laptop, phone shows different layout
**Files:** `app.js` lines 660-716, 1056-1068

**Required Changes:**
1. Store zone config in Config API (extend `/api/config` endpoint)
2. Add `zones` and `shelf_config` to config payload
3. Load on startup, sync on changes

```javascript
// Config API payload should include:
{
  "fixed_costs": [...],
  "fixed_components": [...],
  "zones": [
    { "name": "A", "columns": 4, "levels": 7 },
    { "name": "B", "columns": 4, "levels": 7 }
  ],
  "shelf_config": {
    "A-1-7": { "splitFifo": true },
    "B-2-3": { "singleBin": true }
  }
}
```

### Issue 3: Component Deduplication
**Current:** Dropdowns show parts by name only
**Problem:** Parts with same name look identical, wrong one gets selected
**Files:** `profit.js` `populatePartSelect()`, `populatePartsDropdown()`

**Required Changes:**
1. ✅ Already fixed - Show `[SKU] Name (X in stock)`
2. Add deduplication warning when saving parts with same name
3. Use part PK as key everywhere, never match by name

### Issue 4: FIFO Race Condition  
**Current:** Stock deducted with sequential PATCH calls
**Problem:** Two users can consume same stock simultaneously
**Files:** `profit.js` lines 1276-1300

**Required Changes:**
1. Use InvenTree's stock removal API with quantity validation
2. Check stock quantity before and after deduction
3. Show error if stock was modified by another user

```javascript
// Use stock/remove/ endpoint instead of PATCH
await api.request('/stock/remove/', {
    method: 'POST',
    body: JSON.stringify({
        items: [{ pk: stockId, quantity: qty }],
        notes: 'Sale: ' + orderId
    })
});
```

### Issue 5: Error Handling
**Current:** console.warn for most errors
**Problem:** Users don't know when operations fail
**Files:** Throughout both files

**Required Changes:**
1. Create error toast for all user-initiated operations
2. Add retry mechanism for network failures
3. Show specific error messages from API responses

```javascript
// Instead of:
} catch (e) {
    console.warn('Failed to sync:', e);
}

// Do:
} catch (e) {
    toast.show(`Sync failed: ${e.message}. Tap to retry.`, 'error', {
        action: () => this.syncAll()
    });
}
```

## Backend Changes Required

### Config API (`~/omiximo-email-automation/src/config_api.py`)

Add endpoints for:
1. `GET/POST /api/zones` - Zone configuration
2. `GET/POST /api/shelf-config` - Per-shelf settings
3. `GET/POST /api/jit-config` - JIT reorder settings

Or extend existing `/api/config` to include all settings.

### File Structure After Refactor

```
frontend/
├── index.html
├── css/
│   ├── base.css
│   ├── wall.css
│   ├── catalog.css
│   ├── profit.css
│   └── modals.css
├── js/
│   ├── app.js          (core, router, state)
│   ├── api.js          (all API calls)
│   ├── wall.js         (wall view logic)
│   ├── catalog.js      (catalog view)
│   ├── profit.js       (profitability)
│   ├── sync.js         (all sync logic)
│   └── utils.js        (helpers)
└── tests/
    └── browser-test.js
```

## Testing Checklist

After refactoring, verify:

- [ ] Record sale on Device A → Appears on Device B after refresh
- [ ] Edit sale on Device A → Updates on Device B
- [ ] Delete sale on Device A → Removed from Device B
- [ ] Add zone on Device A → Visible on Device B
- [ ] Change shelf config on A → Synced to B
- [ ] Two users can't consume same stock
- [ ] Network error shows user-friendly message
- [ ] Offline mode shows cached data (bonus)

## Priority Order

1. **Transaction sync** - Most critical, users losing data
2. **Zone/shelf sync** - Users confused by different layouts
3. **FIFO race condition** - Can cause inventory discrepancies
4. **Error handling** - Users need feedback
5. **Code splitting** - Nice to have for maintainability

## Estimated Effort

| Task | Hours | Risk |
|------|-------|------|
| Transaction sync | 8-12h | High |
| Zone/shelf sync | 4-6h | Medium |
| FIFO race fix | 2-4h | Medium |
| Error handling | 4-6h | Low |
| Code splitting | 8-12h | Low |
| **Total** | **26-40h** | |

---

## How to Start

1. Read `ARCHITECTURE.md` and `DATA-FLOW.md` for context
2. Run the app locally: `cd ~/omiximo-inventory && docker compose up`
3. Open https://inventory.zenithcred.com (or localhost:1441)
4. Make a change on one device, check if it appears on another
5. Start with Issue 1 (Transaction sync) as it's most impactful

Good luck! 🚀
