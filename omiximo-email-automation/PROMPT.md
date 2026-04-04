# Omiximo Email-to-Inventory Automation

## What to Build

Automated system that:
1. Connects to `info@omiximo.nl` via IMAP (Hostnet)
2. Detects marketplace sale emails (MediaMarktSaturn)
3. Parses order data
4. Records sales in existing inventory system
5. Deducts stock (including RAM as individual sticks)
6. Runs as Docker container

---

## Directories

| Path | Action |
|------|--------|
| `~/omiximo-inventory` | ANALYZE - understand how inventory works |
| `~/omiximo-email-automation` | CREATE - build new software here |

---

## Step 1: Analyze Existing Inventory

Before writing code, understand `~/omiximo-inventory`:
- What database? (PostgreSQL, MySQL, SQLite, MongoDB?)
- How are sales recorded?
- How is stock deducted?
- What are the product SKUs for RAM sticks (8GB, 16GB)?

Save findings to `~/omiximo-email-automation/docs/INVENTORY_ANALYSIS.md`

---

## Step 2: Build the Software

### Email Connection
- Server: `imap.hostnet.nl`
- Port: `993` (SSL)
- Email: `info@omiximo.nl`
- Password: encrypted with Fernet, stored in `.secrets/`

### Marketplace Detection
Detect sales from sender: `noreply@mmsmarketplace.mediamarktsaturn.com`

### Data to Extract
- Order number (format: `02116_296531828-A`)
- Customer name
- Product description
- SKU (after "Interne referentie:")
- Price
- Quantity
- RAM size (from description, e.g., "RAM 16 GB")
- Shipping address

### RAM Deduction - CRITICAL

RAM is stored as individual sticks. When a PC is sold:

| Sale has | Deduct from inventory |
|----------|----------------------|
| 16GB RAM | 2x 8GB sticks |
| 32GB RAM | 2x 16GB sticks |

Example: Order says "RAM 16 GB" → deduct **2 items** of the 8GB RAM SKU

---

## Step 3: Docker Deployment

### setup.sh Script
Interactive script that:
1. Prompts for email password (hidden input)
2. Encrypts password with Fernet
3. Stores in `.secrets/`
4. Builds and starts Docker container

### Usage
```bash
cd ~/omiximo-email-automation
./scripts/setup.sh    # First time
./scripts/start.sh    # Start
./scripts/stop.sh     # Stop
```

---

## Sample Email

```
Van: mediaworld.it Marketplace <noreply@mmsmarketplace.mediamarktsaturn.com>
Onderwerp: Bestelling 02116_296531828-A zal worden verzonden

Hallo Omiximo B.V. IT,

De betaling van de koper voor de bestelling 02116_296531828-A is succesvol ontvangen.

Besteloverzicht:
Bestelnummer: 02116_296531828-A
Naam koper: Federico Italiano
Besteldatum: 14-01-2026
Beschrijving: OMIXIMO DESKTOP OMIXIMO PC Gaming AMD Ryzen 7 5700X
GeForce RTX 5050 16GB DDR4 SSD 1TB Windows 11 Pro, AMD Ryzen 7 5700X,
GeForce RTX™ 5050, RAM 16 GB, 1 TB SSD
Artikel status: Nieuw
Prijs: € 899,00
Aantal: 1
Interne referentie: OMX-GHANA-2026-R7-5700X-RTX5050-16G-1T

Het verzendadres:
M Federico Italiano
Via Rio Rosso 184
98057 Milazzo
ITALY
```

---

## Project Structure

```
~/omiximo-email-automation/
├── docker/
│   ├── Dockerfile
│   ├── docker-compose.yml
│   └── entrypoint.sh
├── src/
│   ├── main.py
│   ├── config.py
│   ├── email_client/
│   ├── marketplace_parsers/
│   ├── inventory/
│   └── utils/
├── scripts/
│   ├── setup.sh
│   ├── start.sh
│   └── stop.sh
├── docs/
│   └── INVENTORY_ANALYSIS.md
└── requirements.txt
```

---

## Completion Criteria

- [ ] Inventory system analyzed and documented
- [ ] IMAP client connects and fetches emails
- [ ] MediaMarktSaturn emails parsed correctly
- [ ] Sales recorded in inventory database
- [ ] RAM deducted as sticks (16GB → 2x 8GB, 32GB → 2x 16GB)
- [ ] Docker container runs with encrypted password
- [ ] setup.sh prompts for password and works

When ALL criteria met, output:

EXIT_SIGNAL: PROJECT_COMPLETE
