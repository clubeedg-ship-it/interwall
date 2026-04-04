# Omiximo Inventory OS - Data Flow Documentation

## Storage Layers Overview

The application uses **three distinct storage layers**, each with different purposes:

```
┌─────────────────────────────────────────────────────────────────┐
│                    STORAGE ARCHITECTURE                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐         │
│  │ localStorage │    │ Config API  │    │ InvenTree   │         │
│  │   (Browser)  │    │  (Express)  │    │  (Django)   │         │
│  └──────┬──────┘    └──────┬──────┘    └──────┬──────┘         │
│         │                  │                   │                 │
│    DEVICE-LOCAL        CROSS-DEVICE       AUTHORITATIVE         │
│    Fast/Offline        Config Sync        Inventory Data        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 1. localStorage (Device-Local)

### Keys & Data Stored

| Key | Description | Sync Status |
|-----|-------------|-------------|
| `inventree_token` | Auth token | None (per-device) |
| `omiximo_view` | Current view (wall/catalog/profit) | None |
| `omiximo_zones` | Zone configuration | None ⚠️ |
| `omiximo_zone_version` | Zone format version | None |
| `omiximo_shelf_config` | Per-shelf FIFO settings | None ⚠️ |
| `omiximo_transactions` | Sales history | Partial → InvenTree SO |
| `omiximo_totalMargin` | Cumulative margin | Calculated from transactions |
| `omiximo_cost_config` | Fixed costs (VAT, commission) | Synced → Config API |
| `omiximo_fixed_components` | Auto-included parts | Synced → Config API |
| `omiximo_inventory_cache` | Cached inventory value | Cache only (5min TTL) |
| `jit_config` | JIT reorder point settings | None ⚠️ |
| `theme` | UI theme preference | None |

### ⚠️ NOT SYNCED Items (Potential Issues)
- **Zone configuration** - Each device has its own wall layout
- **Shelf config** - FIFO settings are device-local
- **JIT config** - Reorder points are device-local

---

## 2. Config API (Cross-Device Sync)

### Endpoint: `/api/config`

**Data Stored:**
```json
{
  "fixed_costs": [
    { "id": "vat", "name": "BTW/VAT", "type": "vat", "value": 21, "enabled": true },
    { "id": "commission", "name": "Commission", "type": "percentage", "value": 6.2, "enabled": true },
    { "id": "overhead", "name": "Fixed Overhead", "type": "fixed", "value": 95.00, "enabled": true }
  ],
  "fixed_components": [
    { "id": "fixcomp_abc123", "partId": 42, "partName": "PC Case", "sku": "CASE-001", "quantity": 1, "enabled": true }
  ],
  "_updated": "2026-02-03T15:00:00Z"
}
```

### Sync Flow

```
Frontend Save                     Backend Store
     │                                 │
     ▼                                 ▼
localStorage.setItem()          JSON file on disk
     │                                 │
     ▼                                 │
backendConfigSync._scheduleSync()      │
     │ (500ms debounce)                │
     ▼                                 │
POST /api/config ─────────────────────►│
                                       │
Frontend Load                          │
     │                                 │
     ▼                                 │
await loadFromBackend() ◄──────────────│
     │                            GET /api/config
     ▼                                 │
If success: use backend data           │
If fail: fallback to localStorage      │
```

---

## 3. InvenTree API (Authoritative)

### Entities & Endpoints

| Entity | Endpoint | Usage |
|--------|----------|-------|
| Parts | `/api/part/` | Product definitions |
| Stock Items | `/api/stock/` | Inventory batches |
| Locations | `/api/stock/location/` | Warehouse bins |
| Categories | `/api/part/category/` | Part classification |
| Sales Orders | `/api/order/so/` | Recorded sales |
| SO Line Items | `/api/order/so-line/` | Sale components |
| Stock Tracking | `/api/stock/track/` | Movement history |

### Key Data Flows

#### Receiving Stock (Handshake Modal)
```
Scan barcode → Part lookup
     │
     ▼
Enter: Qty, Price, Bin
     │
     ▼
FIFO Auto-Rotation:
├── Check if Bin A has stock
├── If yes: Transfer A → B (POST /api/stock/transfer/)
└── Then: Create stock in A (POST /api/stock/)
```

#### Recording a Sale
```
Add components from dropdown
     │
     ▼
For each component:
├── GET /api/stock/?part={id}&in_stock=true
├── Sort by date (FIFO)
├── Calculate cost from purchase_price
└── Cache in profitState.stockCache
     │
     ▼
User clicks "Save"
     │
     ▼
Consume stock:
├── For each batch used:
│   └── PATCH /api/stock/{id}/ (reduce quantity)
     │
     ▼
Create transaction locally:
├── Push to profitState.transactions
├── localStorage.setItem('omiximo_transactions')
     │
     ▼
Sync to InvenTree:
├── POST /api/order/so/ (create Sales Order)
├── For each component:
│   └── POST /api/order/so-line/ (add line item)
└── Store soId in transaction
```

---

## Identified Sync Issues & Root Causes

### Issue 1: Different Sales Data on Different Devices

**Root Cause:**
- Transactions are stored in `localStorage` → **device-local**
- Sync to InvenTree Sales Orders exists but:
  - Only NEW sales get synced
  - Loading from InvenTree happens via `fetchInvenTreeSalesOrders()`
  - Merging logic skips orders if `orderId` already exists locally

**Flow Problem:**
```
Device A: Records sale → localStorage + InvenTree SO
Device B: Loads page  → localStorage (empty) + fetch InvenTree SO
                       ↓
Device B sees InvenTree orders but NOT Device A's localStorage data
Device A has both, Device B only has InvenTree-fetched orders
```

**Fix Required:**
- Make InvenTree Sales Orders the **sole source of truth**
- Remove localStorage for transactions entirely
- OR: Always merge InvenTree data OVER localStorage data

---

### Issue 2: Duplicate Components in Dropdowns

**Root Cause Investigation:**
- `state.parts` is a `Map<pk, part>` - should deduplicate by PK
- Dropdown populated from `state.parts.forEach()`
- Multiple functions update `state.parts`:
  - `loadParts()` - clears and rebuilds
  - `alerts.checkLowStock()` - adds without clearing
  - `populatePartSelect()` - adds without clearing

**Potential Causes:**
1. InvenTree has duplicate parts (different PKs, same name)
2. Race condition: Multiple API calls return overlapping results
3. Dropdown rebuilt without clearing (unlikely - code shows clear)

**Investigation Steps:**
```javascript
// Check for duplicate names in InvenTree
const names = [...state.parts.values()].map(p => p.name);
const duplicates = names.filter((n, i) => names.indexOf(n) !== i);
console.log('Duplicate part names:', duplicates);
```

---

### Issue 3: Wrong Components Retrieved for Some Sales

**Root Cause Investigation:**
- Component selection uses `partId` from dropdown (correct)
- FIFO calculation uses `partId` to fetch stock (correct)
- BUT: If user selects wrong part (duplicate names), wrong stock consumed

**Potential Causes:**
1. Parts with identical names but different PKs
2. Stock items associated with wrong part in InvenTree
3. `state.parts` cache stale - shows old data while API has new

**Fix Required:**
- Show SKU/IPN in dropdown alongside name: `"PC Case (SKU: CASE-001)"`
- Add deduplication check on app load
- Clear and reload `state.parts` before showing Record Sale modal

---

## Data Consistency Matrix

| Data Type | localStorage | Config API | InvenTree | Source of Truth |
|-----------|--------------|------------|-----------|-----------------|
| Auth token | ✅ | ❌ | ✅ | localStorage |
| Fixed costs | ✅ (cache) | ✅ | ❌ | **Config API** |
| Fixed components | ✅ (cache) | ✅ | ❌ | **Config API** |
| Zone layout | ✅ | ❌ | ❌ | localStorage ⚠️ |
| Shelf config | ✅ | ❌ | ❌ | localStorage ⚠️ |
| Sales transactions | ✅ | ❌ | ✅ (SO) | **Should be InvenTree** |
| Parts catalog | ❌ | ❌ | ✅ | **InvenTree** |
| Stock items | ❌ | ❌ | ✅ | **InvenTree** |
| Locations | ❌ | ❌ | ✅ | **InvenTree** |

---

## Recommended Architectural Changes

### Short-term Fixes

1. **Transaction Sync**: Always load transactions from InvenTree first, merge with localStorage, prefer InvenTree data for conflicts

2. **Component Deduplication**: Add uniqueness check and warning on app load

3. **Dropdown Clarity**: Show `name (SKU)` format to distinguish similar parts

### Long-term Improvements

1. **Zone/Shelf Config Sync**: Move to Config API or InvenTree custom fields

2. **Remove localStorage Transactions**: Use InvenTree Sales Orders as sole source

3. **Real-time Sync**: Implement WebSocket or polling for multi-device updates
