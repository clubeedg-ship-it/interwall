# Omiximo Inventory - Issues Analysis
**Date:** 2026-01-28

## Summary of Issues

Otto reported:
1. Fixed component/price changes don't persist across computers
2. Sales automation doesn't use fixed components
3. Stock not returned when deleting sales orders
4. Only 5 orders showing (actually **0** in InvenTree)

---

## Issue 1: Fixed Components Not Persisting

### Root Cause
Frontend saves fixed components with `{partId, partName, quantity, enabled}` but **NOT `sku`**.
Email automation's `config_loader.py` expects `sku` field to deduct stock.

### Evidence
```json
// shared_config/fixed_elements.json
{
  "fixed_components": []  // Empty!
}
```

Frontend code (profit.js line ~509):
```javascript
fixedComponentsConfig.add({ partId, partName, quantity, enabled });
// Missing: sku
```

### Fix Required
1. Add `sku` field when saving fixed components
2. Lookup SKU from part data when adding component

---

## Issue 2: Sales Automation Not Using Fixed Components

### Root Cause
The `fixed_components` array in config is **empty**. Even if populated, the SKU field is missing.

### Evidence
From `stock_manager.py`:
```python
def deduct_fixed_components(self, quantity, order_ref):
    for fixed_comp in self.fixed_elements.components:  # Empty list!
        result = self.deduct_stock_by_sku(
            sku=fixed_comp.sku,  # Would fail - no sku saved
            ...
        )
```

### Fix Required
1. User needs to configure fixed components in UI
2. Frontend must save SKU with each component
3. Backend must reload config before each order

---

## Issue 3: Stock Not Returned on Delete

### Root Cause
When importing orders from InvenTree, `batchesUsed` is set to empty array:
```javascript
// profit.js line ~1451
batchesUsed: []  // Not tracked for InvenTree imports
```

Delete logic only restores stock if `batchesUsed` has data:
```javascript
if (component.batchesUsed && component.batchesUsed.length > 0) {
    // Restore stock
}
```

### Fix Options
**Option A:** Query InvenTree for SO line items, get part IDs, add stock back
**Option B:** Track batchesUsed when importing from InvenTree
**Option C:** Use InvenTree's "cancel order" API which auto-restores stock

---

## Issue 4: Zero Orders in InvenTree

### Root Cause
Sales orders are **NOT being created**. InvenTree API shows `count: 0`.

Email automation logs show stock deductions work, but no SO creation log entries.

### Evidence
```bash
$ curl ... "http://localhost:8000/api/order/so/?limit=5"
Count: 0
```

The `sales_order_manager.create_sales_order()` may be failing silently or not being called.

### Fix Required
1. Verify `create_sales_order=True` is passed to `process_order()`
2. Add better error logging in `sales_order_manager.py`
3. Check InvenTree permissions for SO creation

---

## Architecture Issues

### Current Flow (Broken)
```
Email Received → Parse Order → Deduct Stock → (Sales Order SKIPPED)
                                    ↓
                               No record created
```

### Expected Flow
```
Email Received → Parse Order → Create Sales Order → Deduct Stock via SO
                                    ↓
                               InvenTree tracks everything
```

### Config Sync Flow (Broken)
```
Frontend localStorage → Backend /api/config → shared_config/fixed_elements.json
        ↓                                              ↓
  Missing SKU field                        Automation reads but no SKU
```

---

## Recommended Fixes

### Phase 1: Critical (Do Now)

1. **Add SKU to fixed components** (profit.js)
   - When adding fixed component, lookup part's IPN/SKU
   - Save `{partId, partName, sku, quantity, enabled}`

2. **Debug Sales Order creation**
   - Add logging to `create_sales_order()` call
   - Check InvenTree user permissions

3. **Verify config reload**
   - Ensure automation reloads config before each order

### Phase 2: Stock Restoration

4. **Fix delete stock restoration**
   - For InvenTree orders: query SO line items, get parts, add stock
   - Use InvenTree stock adjustment API

### Phase 3: Make Server-Side

5. **Consider backend-first architecture**
   - Store transactions in InvenTree (already doing SO)
   - Frontend becomes read-only display
   - All business logic in Python backend
   - Eliminates localStorage sync issues

---

## Files to Modify

| File | Change |
|------|--------|
| `frontend/profit.js` | Add SKU to fixedComponentsConfig |
| `src/inventory/stock_manager.py` | Add logging for SO creation |
| `src/main.py` | Verify create_sales_order=True |
| `frontend/profit.js` | Fix delete to restore stock via API |

---

## Testing Plan

1. Add a fixed component (case) in UI
2. Verify config file includes SKU
3. Trigger email automation manually
4. Verify Sales Order created in InvenTree
5. Delete order from UI
6. Verify stock restored
