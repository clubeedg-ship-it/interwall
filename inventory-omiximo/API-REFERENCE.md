# Omiximo Inventory OS - API Reference

## Overview

The application interacts with two APIs:
1. **InvenTree API** (Port 8000) - Core inventory management
2. **Config API** (Port 8085) - Cross-device configuration sync

---

## InvenTree API

Base URL: `http://localhost:8000/api` (configurable via `ENV.API_BASE`)

### Authentication

All requests require token authentication:
```http
Authorization: Token <token>
```

#### Get Token
```http
POST /user/token/
Authorization: Basic <base64(username:password)>
Accept: application/json

Response:
{
  "token": "abc123..."
}
```

#### Get Current User
```http
GET /user/me/

Response:
{
  "pk": 1,
  "username": "admin",
  "is_superuser": true,
  "is_staff": true
}
```

---

### Parts

#### List Parts
```http
GET /part/?limit=50&offset=0&search=<query>&category=<id>

Response:
{
  "count": 150,
  "next": "/api/part/?limit=50&offset=50",
  "previous": null,
  "results": [
    {
      "pk": 1,
      "name": "Intel Core i5",
      "IPN": "CPU-001",
      "description": "10th gen processor",
      "category": 5,
      "in_stock": 25,
      "minimum_stock": 10,
      "active": true
    }
  ]
}
```

#### Get Single Part
```http
GET /part/{id}/

Response:
{
  "pk": 1,
  "name": "Intel Core i5",
  "IPN": "CPU-001",
  "description": "10th gen processor",
  "category": 5,
  "in_stock": 25,
  "minimum_stock": 10,
  "active": true,
  "default_location": 42
}
```

#### Create Part
```http
POST /part/
Content-Type: application/json

{
  "name": "New Part",
  "IPN": "PART-001",
  "description": "Description",
  "category": 5,
  "minimum_stock": 10,
  "component": true,
  "purchaseable": true,
  "salable": false,
  "active": true
}

Response: Created part object
```

#### Update Part
```http
PATCH /part/{id}/
Content-Type: application/json

{
  "name": "Updated Name",
  "minimum_stock": 15
}
```

#### Delete Part
```http
DELETE /part/{id}/

Note: Part must be inactive (active: false) before deletion
```

#### Search Parts
```http
GET /part/?search=<query>&limit=10

Used by: scanner.handlePart(), recordSale.populatePartsDropdown()
```

---

### Part Categories

#### List Categories
```http
GET /part/category/?limit=100

Response:
{
  "results": [
    { "pk": 1, "name": "CPUs", "description": "Processors", "parent": null }
  ]
}
```

#### Create Category
```http
POST /part/category/
Content-Type: application/json

{
  "name": "New Category",
  "description": "Description",
  "parent": null
}
```

---

### Stock Items

#### List Stock
```http
GET /stock/?limit=100&in_stock=true&part=<id>&location=<id>

Response:
{
  "results": [
    {
      "pk": 123,
      "part": 1,
      "part_detail": { "pk": 1, "name": "Intel Core i5" },
      "quantity": 10,
      "location": 42,
      "location_detail": { "pk": 42, "name": "A-1-3-A" },
      "purchase_price": "299.99",
      "batch": "BATCH001",
      "allocated": 2,
      "notes": "Source: https://supplier.com/order/123"
    }
  ]
}
```

#### Get Single Stock Item
```http
GET /stock/{id}/?part_detail=true&location_detail=true

Used by: batchDetail.show(), batchEditor.showById()
```

#### Create Stock
```http
POST /stock/
Content-Type: application/json

{
  "part": 1,
  "location": 42,
  "quantity": 10,
  "purchase_price": "299.99",
  "notes": "Source: https://supplier.com"
}
```

#### Update Stock
```http
PATCH /stock/{id}/
Content-Type: application/json

{
  "quantity": 8,
  "purchase_price": "289.99"
}

Used by: recordSale.submit() (consume stock)
         batchEditor.submit()
```

#### Delete Stock
```http
DELETE /stock/{id}/

Used by: batchDetail.deleteBatch()
```

#### Transfer Stock (Move Location)
```http
POST /stock/transfer/
Content-Type: application/json

{
  "items": [
    { "pk": 123, "quantity": 10 }
  ],
  "location": 43,
  "notes": "FIFO Auto-Rotation: Old → Bin B"
}

Used by: handshake.moveStock() for FIFO rotation
```

#### Remove Stock
```http
POST /stock/remove/
Content-Type: application/json

{
  "items": [
    { "pk": 123, "quantity": 5 }
  ],
  "notes": "Picked via Omiximo OS"
}

Used by: api.removeStock() for picking operations
```

#### Get Stock for FIFO
```http
GET /stock/?part={id}&in_stock=true&ordering=updated

Returns stock items sorted by date (oldest first) for FIFO picking
Used by: recordSale.calculateFifoCost()
```

---

### Stock Locations

#### List Locations
```http
GET /stock/location/?limit=500

Response:
{
  "results": [
    {
      "pk": 42,
      "name": "A-1-3-A",
      "description": "IN - New Stock (FIFO: Use Last)",
      "parent": 41
    }
  ]
}
```

#### Get Location by Name
```http
GET /stock/location/?name=<name>&limit=1

Used by: api.getLocationByName()
```

#### Create Location
```http
POST /stock/location/
Content-Type: application/json

{
  "name": "A-1-3-A",
  "description": "IN - New Stock (FIFO: Use Last)",
  "parent": 41
}

Used by: zoneManager.createZoneLocations() when adding new zones
```

#### Get Stock at Location
```http
GET /stock/?location={id}&limit=100

Used by: wall.loadBinContents()
```

---

### Sales Orders

#### List Sales Orders
```http
GET /order/so/?limit=100

Response:
{
  "results": [
    {
      "pk": 1,
      "reference": "SO-0001",
      "customer_reference": "ORD-ABC123",
      "description": "PC Build | John Doe",
      "creation_date": "2026-02-03",
      "target_date": "2026-02-03",
      "total_price": "599.00",
      "status_text": "Pending"
    }
  ]
}
```

#### Create Sales Order
```http
POST /order/so/
Content-Type: application/json

{
  "customer_reference": "ORD-ABC123",
  "description": "PC Build | Customer Name",
  "target_date": "2026-02-03"
}

Used by: recordSale.syncToInvenTree()
```

#### List SO Line Items
```http
GET /order/so-line/?order={so_id}&limit=50

Response:
{
  "results": [
    {
      "pk": 1,
      "order": 1,
      "part": 42,
      "quantity": 1,
      "sale_price": "299.00",
      "notes": "FIFO_COST:275.00"
    }
  ]
}
```

#### Create SO Line Item
```http
POST /order/so-line/
Content-Type: application/json

{
  "order": 1,
  "part": 42,
  "quantity": 1,
  "sale_price": "299.00",
  "notes": "FIFO_COST:275.00 | FIXED"
}

Used by: recordSale.syncToInvenTree()
```

---

### Stock Tracking (History)

#### List Stock Movements
```http
GET /stock/track/?limit=100&ordering=-date

Query Parameters:
- tracking_type: ADD, REMOVE, MOVE, UPDATE
- min_date: YYYY-MM-DD
- max_date: YYYY-MM-DD

Response:
{
  "results": [
    {
      "pk": 1,
      "item": 123,
      "item_detail": { "part_detail": { "name": "Intel Core i5" } },
      "tracking_type": "ADD",
      "quantity": 10,
      "date": "2026-02-03T15:30:00Z",
      "location_detail": { "name": "A-1-3-A" },
      "user_detail": { "username": "admin" },
      "notes": "Received shipment"
    }
  ]
}

Used by: history.loadMovements()
```

---

### Internal Pricing

#### Set Part Internal Price
```http
POST /part/internal-price/
Content-Type: application/json

{
  "part": 1,
  "quantity": 1,
  "price": 299.99
}

Used by: partManager.submit() when creating parts with initial stock
```

#### Get Part Internal Price
```http
GET /part/internal-price/?part={id}

Used by: profitEngine.fetchInvenTreeSalesOrders() as cost fallback
```

---

## Config API

Base URL: `http://localhost:8085/api` (configurable via `ENV.CONFIG_API_BASE`)

### Get Configuration
```http
GET /config

Response:
{
  "fixed_costs": [
    {
      "id": "vat",
      "name": "BTW/VAT",
      "type": "vat",
      "basis": "salePrice",
      "value": 21,
      "country": "NL",
      "enabled": true
    },
    {
      "id": "commission",
      "name": "Commission",
      "type": "percentage",
      "basis": "salePrice",
      "value": 6.2,
      "enabled": true
    },
    {
      "id": "overhead",
      "name": "Fixed Overhead",
      "type": "fixed",
      "basis": null,
      "value": 95.00,
      "enabled": true
    }
  ],
  "fixed_components": [
    {
      "id": "fixcomp_abc123",
      "partId": 42,
      "partName": "PC Case",
      "sku": "CASE-001",
      "quantity": 1,
      "enabled": true
    }
  ],
  "_updated": "2026-02-03T15:00:00.000Z"
}

Used by: costConfig.loadFromBackend(), fixedComponentsConfig.loadFromBackend()
```

### Save Configuration
```http
POST /config
Content-Type: application/json

{
  "fixed_costs": [...],
  "fixed_components": [...]
}

Response:
{
  "success": true,
  "_updated": "2026-02-03T15:30:00.000Z"
}

Used by: backendConfigSync.syncAll()
```

---

## Error Handling

All API errors follow this pattern:
```javascript
try {
  const response = await api.request(endpoint, options);
  // Handle success
} catch (e) {
  // e.message contains HTTP status or error description
  toast.show(`Error: ${e.message}`, 'error');
}
```

Common HTTP Status Codes:
- `200` - Success
- `201` - Created
- `204` - No Content (DELETE success)
- `400` - Bad Request (validation error)
- `401` - Unauthorized (invalid/expired token)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found
- `500` - Server Error

---

## Rate Limiting Notes

- **Bulk Loading**: Use `getAllStock()` and `getParts({limit: 2000})` to minimize requests
- **Refresh Interval**: 30 seconds (configurable via `CONFIG.REFRESH_INTERVAL`)
- **Debouncing**: Catalog search debounced at 400ms, config sync at 500ms
- **Caching**: Inventory value cached for 5 minutes
