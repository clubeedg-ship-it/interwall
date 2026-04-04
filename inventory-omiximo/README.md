# Omiximo Inventory OS

A modern, FIFO-based inventory management system with real-time profitability tracking.

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![InvenTree](https://img.shields.io/badge/backend-InvenTree-green)
![License](https://img.shields.io/badge/license-proprietary-red)

## Features

- **The Wall** - Visual zone-based inventory grid with live stock levels
- **FIFO Management** - Automatic first-in-first-out stock rotation
- **Barcode Scanner** - USB scanner support with audio feedback
- **Parts Catalog** - Full CRUD with categories and batch tracking
- **Profitability Engine** - Real-time margin calculations with fixed costs
- **Cross-Device Sync** - Configuration syncs across all devices
- **Dark/Light Themes** - Glass morphism UI design

## Quick Start

### Prerequisites

- Docker & Docker Compose
- Node.js 18+ (for development)
- Modern browser (Chrome, Firefox, Safari, Edge)

### Installation

```bash
# Clone the repository
git clone git@github.com:your-org/omiximo-inventory.git
cd omiximo-inventory

# Copy environment template
cp .env.example .env

# Edit .env with your settings
nano .env

# Start all services
./install.sh

# Or manually with Docker Compose
docker-compose up -d
```

### Default Ports

| Service | Port | Description |
|---------|------|-------------|
| Frontend | 8080 | Nginx serving static files |
| InvenTree | 8000 | Inventory API |
| Config API | 8085 | Cross-device config sync |
| PostgreSQL | 5432 | Database |
| Redis | 6379 | Cache |

### First Login

1. Open `http://localhost:8080` in your browser
2. Login with InvenTree admin credentials (default: `admin` / `inventree`)
3. Start by adding zones in **The Wall** view

## Usage Guide

### The Wall

The Wall displays your warehouse as a visual grid of zones, columns, and bins.

- **Zones** (A, B, C...) - Major warehouse sections
- **Columns** (1-8) - Vertical shelving units
- **Levels** (1-7) - Horizontal shelves (1 = bottom)
- **Bins** (A/B) - FIFO compartments (A = new, B = old)

**Adding a Zone:**
1. Click "Add New Zone" at bottom of wall
2. Select zone letter (A-Z)
3. Configure columns and levels
4. Zone locations are auto-created in InvenTree

### Receiving Stock

1. Scan barcode or search for part
2. Enter quantity and purchase price
3. Select target bin (preferably A-side)
4. System auto-rotates: existing A stock → B, new stock → A

### Picking Stock (FIFO)

1. Scan part or click "Pick" mode in handshake modal
2. Enter quantity needed
3. System picks from B-bins first (oldest), then A-bins
4. Stock consumed in FIFO order

### Recording Sales

1. Navigate to **Profitability** view
2. Click **Record Sale**
3. Enter product name and sale price
4. Add components from dropdown (these consume stock)
5. Fixed components (if configured) are auto-included
6. Click **Save** - stock is consumed, order synced to InvenTree

### Configuring Costs

1. In Profitability view, click gear icon
2. **Fixed Costs**: VAT, Commission %, Overhead
3. **Fixed Components**: Parts auto-included in every sale (case, RAM, etc.)
4. Changes sync across all devices automatically

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed system design.

```
Frontend (SPA)
    │
    ├── localStorage (device cache)
    │
    ├── Config API (cross-device sync)
    │
    └── InvenTree API (inventory data)
```

## Documentation

- [ARCHITECTURE.md](./ARCHITECTURE.md) - System overview and module structure
- [DATA-FLOW.md](./DATA-FLOW.md) - How data moves between storage layers
- [API-REFERENCE.md](./API-REFERENCE.md) - All API endpoints used
- [FIXES-2026-02-02.md](./FIXES-2026-02-02.md) - Recent bug fixes

## Development

### Local Development

```bash
# Start InvenTree and dependencies
docker-compose up -d inventree db redis

# Run frontend with live reload (requires simple HTTP server)
cd frontend
python -m http.server 8080
# OR
npx serve -p 8080
```

### File Structure

```
frontend/
├── app.js          # Core app (4400 lines)
├── profit.js       # Profitability engine (2500 lines)
├── style.css       # All styles (2900 lines)
├── index.html      # HTML structure
├── labels.js       # Label printing
├── tenant.js       # Multi-tenant support
└── env.js          # Runtime config
```

### Making Changes

1. Edit files in `frontend/`
2. Refresh browser (no build step required)
3. For production: rebuild Docker image
   ```bash
   ./refresh.sh
   ```

## Known Issues & Troubleshooting

### Different Sales Data on Different Devices

**Cause:** Transactions stored in localStorage are device-local.

**Workaround:** Sales Orders sync to InvenTree, so the data exists there. Refresh the page to re-fetch from InvenTree.

**Fix in progress:** Making InvenTree the sole source of truth for transactions.

### Duplicate Components in Dropdowns

**Cause:** Parts with identical names but different IDs in InvenTree.

**Fix:** Check InvenTree for duplicate part names and merge them.

### Config Changes Not Appearing on Other Devices

**Cause:** Device loaded before config sync completed.

**Fix:** Refresh the page on the other device.

## Environment Variables

```env
# InvenTree Settings
INVENTREE_WEB_ADDR=0.0.0.0
INVENTREE_WEB_PORT=8000
INVENTREE_DB_ENGINE=postgresql
INVENTREE_DB_HOST=db
INVENTREE_DB_NAME=inventree
INVENTREE_DB_USER=inventree
INVENTREE_DB_PASSWORD=<your-password>

# API URLs (for frontend)
API_BASE=http://localhost:8000/api
CONFIG_API_BASE=http://localhost:8085/api/config
```

## Backup & Restore

### Backup Database

```bash
docker exec omiximo-db pg_dump -U inventree inventree > backup.sql
```

### Restore Database

```bash
docker exec -i omiximo-db psql -U inventree inventree < backup.sql
```

### Backup Config

```bash
# Config stored in Docker volume or config API container
docker cp omiximo-config:/app/shared_config ./config-backup/
```

## Contributing

1. Create a feature branch
2. Make changes with clear commit messages
3. Test on both light and dark themes
4. Update documentation if needed
5. Submit pull request

## License

Proprietary - Omiximo BV. All rights reserved.

## Support

For issues or questions, contact the development team.
