# Omiximo Inventory System Analysis

## Overview

The existing inventory system is built on **InvenTree**, an open-source inventory management system with a Django REST API backend.

## Technology Stack

| Component | Technology |
|-----------|------------|
| Backend | InvenTree (Django) |
| Database | PostgreSQL 15 |
| Cache | Redis 7 |
| Frontend | Custom HTML/JS Kiosk UI |
| Container | Docker Compose |

## Database Configuration

```
Host: inventree-db (Docker network)
Port: 5432
Database: inventree
User: inventree
Password: inventree_secret_2024
```

## API Configuration

- **Base URL**: `http://localhost:8000/api` (or `http://inventree-server:8000/api` from Docker network)
- **Authentication**: Token-based (`Authorization: Token <token>`)
- **Token Endpoint**: `POST /api/user/token/` with Basic Auth

## Key API Endpoints

### Parts (Products)

```
GET    /api/part/                    # List all parts
GET    /api/part/{id}/               # Get part details
GET    /api/part/?search={query}     # Search parts by name/SKU
POST   /api/part/                    # Create new part
PATCH  /api/part/{id}/               # Update part
```

### Stock Management

```
GET    /api/stock/                   # List all stock items
GET    /api/stock/?part={id}         # Get stock for specific part
GET    /api/stock/?location={id}     # Get stock at location
POST   /api/stock/                   # Add new stock
PATCH  /api/stock/{id}/              # Update stock quantity
POST   /api/stock/remove/            # Remove stock (with notes)
```

### Locations

```
GET    /api/stock/location/          # List locations
POST   /api/stock/location/          # Create location
```

## How Sales are Recorded

The system records sales through the `recordSale` module in the frontend:

1. **Components Selection**: User selects parts (components) to include in sale
2. **FIFO Cost Calculation**: System calculates cost using oldest stock first
3. **Stock Deduction**: Stock quantities are reduced via `PATCH /api/stock/{id}/`
4. **Transaction Storage**: Sale record stored in localStorage (not InvenTree DB)

### Stock Deduction Method

```javascript
// Current method in profit.js
api.request(`/stock/${stockItemId}/`, {
    method: 'PATCH',
    body: JSON.stringify({
        quantity: newQuantity  // Current quantity - sold quantity
    })
});
```

Alternatively, the API also supports:
```javascript
// Using stock removal endpoint
api.request('/stock/remove/', {
    method: 'POST',
    body: JSON.stringify({
        items: [{ pk: stockItemId, quantity: qtyToRemove }],
        notes: 'Sale via Marketplace'
    })
});
```

## Part/Product Structure

Each part in InvenTree has:
- `pk`: Primary key (ID)
- `name`: Product name
- `IPN`: Internal Part Number (SKU)
- `description`: Product description
- `category`: Category ID
- `in_stock`: Current stock count
- `minimum_stock`: Low stock alert threshold

## Stock Item Structure

Each stock item has:
- `pk`: Stock item ID
- `part`: Part ID (foreign key)
- `quantity`: Current quantity
- `location`: Location ID
- `purchase_price`: Unit cost
- `batch`: Batch/lot number
- `notes`: Additional notes

## RAM Stock Configuration

Based on the system design, RAM sticks should be stored as individual parts with SKUs like:
- `RAM-8GB-DDR4` - 8GB DDR4 RAM stick
- `RAM-16GB-DDR4` - 16GB DDR4 RAM stick

**Important**: When a PC with "RAM 16 GB" is sold, it means 16GB total which requires **2x 8GB sticks**.

### RAM Deduction Logic

| Sale Description | Total RAM | Deduct |
|-----------------|-----------|--------|
| RAM 16 GB | 16GB total | 2x 8GB sticks |
| RAM 32 GB | 32GB total | 2x 16GB sticks |
| RAM 64 GB | 64GB total | 4x 16GB sticks |

## Integration Points for Email Automation

### Authentication

```python
import requests

# Get API token
response = requests.get(
    'http://inventree-server:8000/api/user/token/',
    auth=('admin', 'admin123'),
    headers={'Accept': 'application/json'}
)
token = response.json()['token']

# Use token for subsequent requests
headers = {
    'Authorization': f'Token {token}',
    'Content-Type': 'application/json'
}
```

### Search Part by SKU

```python
def find_part_by_sku(sku):
    response = requests.get(
        f'{API_BASE}/part/',
        params={'search': sku, 'limit': 1},
        headers=headers
    )
    results = response.json().get('results', [])
    return results[0] if results else None
```

### Get Stock for Part (FIFO)

```python
def get_stock_fifo(part_id):
    response = requests.get(
        f'{API_BASE}/stock/',
        params={
            'part': part_id,
            'in_stock': 'true',
            'ordering': 'updated'  # Oldest first for FIFO
        },
        headers=headers
    )
    return response.json().get('results', [])
```

### Deduct Stock

```python
def deduct_stock(stock_id, quantity_to_remove):
    # Get current quantity
    response = requests.get(f'{API_BASE}/stock/{stock_id}/', headers=headers)
    current_qty = response.json()['quantity']

    # Update with new quantity
    new_qty = current_qty - quantity_to_remove
    response = requests.patch(
        f'{API_BASE}/stock/{stock_id}/',
        json={'quantity': new_qty},
        headers=headers
    )
    return response.json()
```

## Network Configuration

When running in Docker, the email automation container should connect to InvenTree via the Docker network:

```yaml
networks:
  - inventree_network

environment:
  INVENTREE_API_URL: http://inventree-server:8000/api
```

## Environment Variables Needed

```env
# InvenTree Connection
INVENTREE_API_URL=http://inventree-server:8000/api
INVENTREE_USERNAME=admin
INVENTREE_PASSWORD=admin123

# OR use token directly
INVENTREE_API_TOKEN=<token>

# RAM SKUs (configurable)
RAM_8GB_SKU=RAM-8GB-DDR4
RAM_16GB_SKU=RAM-16GB-DDR4
```

## Summary

The email automation system needs to:

1. **Authenticate** with InvenTree API using username/password or token
2. **Search parts** by SKU to find the correct part ID
3. **Get stock items** for the part, ordered by date (FIFO)
4. **Deduct stock** by updating the quantity via PATCH request
5. **Handle RAM specially**: Parse RAM amount from email and deduct correct number of sticks
6. **Record sale** (optional): Create a transaction record in the system
