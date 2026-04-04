# Omiximo Inventory - Fixes Applied

## Fix 1: Add SKU to Fixed Components ✅

**File:** `frontend/profit.js` (line ~500)

**Change:** When adding fixed components, now includes SKU field for email automation.

```javascript
// Before
fixedComponentsConfig.add({ partId, partName, quantity, enabled });

// After  
const sku = part?.IPN || part?.name || partName;
fixedComponentsConfig.add({ partId, partName, sku, quantity, enabled });
```

## Fix 2: Sales Orders Display

**Issue:** Frontend shows 0/5 orders when InvenTree has 16.

**Root Cause:** Frontend depends on `CONFIG.API_TOKEN` being set before `fetchInvenTreeSalesOrders()` runs.

**Debug Steps:**
1. Open browser console on profit view
2. Check for "❌ No API token, skipping InvenTree SO fetch" message
3. If present, auth is happening after fetch attempt

**Solution:** The fetch is called from `profitEngine.init()`, which should be called after auth in `app.js`.
Check `onAuthSuccess()` in app.js to ensure proper order.

## Fix 3: Stock Restoration on Delete

**Issue:** Imported orders have empty `batchesUsed` array.

**Solution:** Modify `deleteSale()` to query InvenTree SO line items and use stock add API.

```javascript
// In deleteSale(), add fallback for InvenTree orders:
if (tx.source === 'inventree' && tx.soId) {
    // Fetch line items from InvenTree
    const lines = await api.request(`/order/so-line/?order=${tx.soId}`);
    for (const line of lines.results || []) {
        // Add stock back using stock adjustment API
        await api.request(`/stock/add/`, {
            method: 'POST',
            body: JSON.stringify({
                part: line.part,
                quantity: line.quantity,
                notes: `Restored from cancelled order ${tx.orderId}`
            })
        });
    }
}
```

## Fix 4: Fixed Components Config Sync

**Current State:**
- `shared_config/fixed_elements.json` has `"fixed_components": []`
- User needs to add components via UI

**Action Required:**
User must configure fixed components in the Profit Engine view:
1. Go to Profit Engine
2. Click "Add Fixed Component" 
3. Select part (e.g., "PC Case"), set quantity
4. Config will sync to backend for email automation

## Verification Commands

```bash
# Check InvenTree has SOs
curl -s -H "Authorization: Token inv-..." "http://localhost:8000/api/order/so/?limit=5"

# Check shared config
cat ~/omiximo-email-automation/shared_config/fixed_elements.json

# Check frontend is loading config from backend
curl -s http://localhost:8085/api/config
```
