# Omiximo Inventory OS - Architecture

## System Overview

Omiximo Inventory OS is a **hybrid inventory management system** that combines:
- **Frontend**: Single-page web application (vanilla JavaScript)
- **Backend**: InvenTree API (inventory management system)
- **Config API**: Lightweight Express server for syncing configuration across devices
- **Email Automation**: Python scripts that process incoming emails and create sales orders

```
┌─────────────────────────────────────────────────────────────────────┐
│                          FRONTEND (SPA)                             │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐     │
│  │   Wall View     │  │  Catalog View   │  │  Profit View    │     │
│  │   (Zone Grid)   │  │  (Parts CRUD)   │  │  (Sales Tracking)│    │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘     │
│                              │                     │                │
│                              ▼                     ▼                │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                    localStorage Layer                         │  │
│  │  • omiximo_transactions (sales history)                       │  │
│  │  • omiximo_cost_config (commission, VAT, overhead)            │  │
│  │  • omiximo_fixed_components (auto-included parts)             │  │
│  │  • omiximo_zones (wall configuration)                         │  │
│  │  • inventree_token (auth)                                     │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   │ HTTP/REST
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                           BACKEND APIS                              │
│                                                                     │
│  ┌──────────────────────┐      ┌──────────────────────┐            │
│  │    InvenTree API     │      │    Config API        │            │
│  │    (Port 8000)       │      │    (Port 8085)       │            │
│  │                      │      │                      │            │
│  │  • Parts CRUD        │      │  • GET /api/config   │            │
│  │  • Stock tracking    │      │  • POST /api/config  │            │
│  │  • Locations         │      │                      │            │
│  │  • Sales Orders      │      │  Syncs:              │            │
│  │  • Categories        │      │  • fixed_costs       │            │
│  │                      │      │  • fixed_components  │            │
│  └──────────────────────┘      └──────────────────────┘            │
└─────────────────────────────────────────────────────────────────────┘
```

## File Structure

```
omiximo-inventory/
├── frontend/
│   ├── index.html          # Main HTML (login, views, modals)
│   ├── app.js              # Core app: router, wall, catalog, scanner
│   ├── profit.js           # Profitability engine: sales, FIFO, charts
│   ├── style.css           # All CSS (glass morphism, dark/light themes)
│   ├── labels.js           # Label printing functionality
│   ├── tenant.js           # Multi-tenant support (super admin)
│   ├── env.js              # Runtime configuration (API URLs)
│   ├── nginx.conf          # Nginx config for Docker deployment
│   └── Dockerfile          # Frontend container definition
├── docker-compose.yml      # Full stack deployment
├── install.sh             # Installation script
├── refresh.sh             # Container refresh script
└── *.py                   # Python seed scripts for InvenTree
```

## Module Architecture

### app.js - Core Application (~4400 lines)

| Module | Purpose | Key Functions |
|--------|---------|---------------|
| `CONFIG` | Global configuration | API_BASE, token, refresh intervals |
| `state` | Application state | locations Map, parts Map, zones array |
| `api` | InvenTree API client | CRUD operations, authentication |
| `router` | View navigation | warp transitions, state persistence |
| `wall` | Zone grid renderer | dynamic zones, cell status, FIFO bins |
| `zoneConfig` | Zone management | add/edit/delete zones in localStorage |
| `shelfConfig` | Per-shelf settings | split FIFO, single bin mode, capacities |
| `scanner` | Barcode handler | buffer, audio feedback, part lookup |
| `handshake` | Receiving/Picking | FIFO auto-rotation, stock consumption |
| `catalog` | Parts CRUD | search, pagination, batch expansion |
| `partManager` | Part editor | create/edit/delete parts, JIT config |
| `batchEditor` | Stock editor | quantity, price, location changes |
| `batchDetail` | Batch viewer | supplier URL, cost breakdown |
| `alerts` | Low stock | minimum stock monitoring |
| `history` | Audit trail | stock movement tracking |
| `auth` | Authentication | login, token management |

### profit.js - Profitability Engine (~2500 lines)

| Module | Purpose | Key Functions |
|--------|---------|---------------|
| `backendConfigSync` | Config synchronization | POST to config API |
| `costConfig` | Fixed costs | VAT, commission, overhead management |
| `fixedComponentsConfig` | Auto-included parts | PC case, RAM, etc. |
| `recordSale` | Sale recording | component selection, FIFO cost calc |
| `profitEngine` | Dashboard | charts, transactions, inventory value |
| `profitState` | Profit state | transactions, margins, stock cache |
| `costEditor` | Cost CRUD | add/edit/delete fixed costs |
| `fixedComponentsEditor` | Component CRUD | add/edit/delete fixed components |

## Data Flows

### Authentication Flow
```
User enters credentials
    ↓
api.authenticate() → POST /api/user/token/
    ↓
Receive token → Store in localStorage
    ↓
auth.onAuthSuccess() → Load locations, parts, wall data
    ↓
App ready
```

### Sale Recording Flow
```
User clicks "Record Sale"
    ↓
Select components from dropdown (state.parts)
    ↓
For each component: calculateFifoCost()
    ↓
Fetch stock items: GET /api/stock/?part={id}
    ↓
Sort by date (oldest first) → FIFO
    ↓
Calculate total cost from batch prices
    ↓
On submit: Consume stock via PATCH /api/stock/{id}
    ↓
Create transaction in profitState.transactions
    ↓
Sync to InvenTree: POST /api/order/so/
    ↓
Save to localStorage: omiximo_transactions
```

### Config Sync Flow (Cross-Device)
```
User changes fixed costs or components
    ↓
costConfig.save() / fixedComponentsConfig.save()
    ↓
Store in localStorage (local cache)
    ↓
backendConfigSync._scheduleSync() (500ms debounce)
    ↓
POST /api/config with {fixed_costs, fixed_components}
    ↓
Config API saves to JSON file
    ↓
Other device loads page
    ↓
costConfig.init() → await loadFromBackend()
    ↓
GET /api/config → Apply to app
```

## Key Design Patterns

### 1. Dual Storage Strategy
- **localStorage**: Fast, offline-capable, device-local
- **Backend API**: Authoritative, cross-device, persistent

### 2. Cache-First with Background Sync
- Load from localStorage immediately for fast UX
- Fetch from backend and merge/update
- Sync changes to backend in background

### 3. FIFO Inventory Management
- Bin A = New stock (FIFO IN)
- Bin B = Old stock (FIFO OUT)
- Auto-rotation on receive: A → B → consume

### 4. Optimistic UI Updates
- Update UI immediately on user action
- API calls run in background
- Show toast on success/failure

## Security Model

- Token-based auth (InvenTree native)
- Token stored in localStorage (vulnerable to XSS)
- No CORS restrictions (same-origin deployment)
- Super admin can view all tenants

## Performance Optimizations

1. **Bulk Stock Loading**: `api.getAllStock()` fetches all stock in one call
2. **Stock Cache**: `profitState.stockCache` prevents duplicate API calls
3. **Pagination**: Catalog uses offset/limit with load-more
4. **Debounced Search**: 400ms debounce on catalog search
5. **Inventory Cache**: 5-minute TTL for inventory valuation
6. **Background Refresh**: 30-second interval for wall data
