#!/bin/bash
set -e

echo "==========================================="
echo " Interwall Inventory OS — Server Deploy"
echo "==========================================="
echo ""

# ── 1. Kill legacy containers ──────────────────────────────────────────────

echo "[1/6] Stopping legacy containers..."

# Stop supabase if running
if docker ps --format '{{.Names}}' | grep -q supabase; then
    echo "  Found Supabase containers — stopping..."
    # Try supabase CLI first
    if command -v supabase &> /dev/null; then
        supabase stop 2>/dev/null || true
    fi
    # Force-kill any remaining supabase containers
    docker ps --format '{{.Names}}' | grep supabase | xargs -r docker stop 2>/dev/null || true
    docker ps -a --format '{{.Names}}' | grep supabase | xargs -r docker rm -f 2>/dev/null || true
    echo "  Supabase containers removed."
fi

# Stop old inventree if running
if docker ps --format '{{.Names}}' | grep -qi inventree; then
    echo "  Found InvenTree containers — stopping..."
    docker ps --format '{{.Names}}' | grep -i inventree | xargs -r docker stop 2>/dev/null || true
    docker ps -a --format '{{.Names}}' | grep -i inventree | xargs -r docker rm -f 2>/dev/null || true
    echo "  InvenTree containers removed."
fi

# Stop old email automation if running
if docker ps --format '{{.Names}}' | grep -qi email; then
    echo "  Found email automation containers — stopping..."
    docker ps --format '{{.Names}}' | grep -i email | xargs -r docker stop 2>/dev/null || true
    docker ps -a --format '{{.Names}}' | grep -i email | xargs -r docker rm -f 2>/dev/null || true
    echo "  Email automation containers removed."
fi

# Stop current interwall if running
docker compose down 2>/dev/null || true
echo "  Done."

# ── 2. Clean old volumes (optional) ───────────────────────────────────────

echo ""
echo "[2/6] Cleaning old Docker volumes..."
# Remove supabase volumes
docker volume ls --format '{{.Name}}' | grep -i supabase | xargs -r docker volume rm 2>/dev/null || true
# Remove old inventree volumes
docker volume ls --format '{{.Name}}' | grep -i inventree | xargs -r docker volume rm 2>/dev/null || true
# Remove interwall postgres volume for fresh seed
docker volume rm interwall_pgdata 2>/dev/null || true
echo "  Done."

# ── 3. Create .env ────────────────────────────────────────────────────────

echo ""
echo "[3/6] Configuring environment..."
if [ ! -f .env ]; then
    cat > .env << 'ENVEOF'
# Email poller (IMAP)
IMAP_SERVER=imap.hostnet.nl
IMAP_EMAIL=info@omiximo.nl
IMAP_PASSWORD=Parelduiker4!!!
IMAP_FOLDER=INBOX

# Database
POSTGRES_PASSWORD=interwall_prod_2026

# Session secret (change this in production)
SESSION_SECRET=interwall-session-secret-change-me-prod-2026

# Frontend port
FRONTEND_PORT=1441
ENVEOF
    echo "  .env created."
else
    echo "  .env already exists — keeping existing config."
fi

# ── 4. Build and start ────────────────────────────────────────────────────

echo ""
echo "[4/6] Building containers..."
docker compose build --quiet

echo ""
echo "[5/6] Starting Interwall..."
docker compose up -d

# Wait for healthy DB
echo -n "  Waiting for database"
for i in $(seq 1 30); do
    if docker exec interwall-postgres pg_isready -U interwall -d interwall &>/dev/null; then
        echo " ready."
        break
    fi
    echo -n "."
    sleep 2
done

# ── 5. Verify ─────────────────────────────────────────────────────────────

echo ""
echo "[6/6] Verifying deployment..."
echo ""

# Containers
echo "  Containers:"
docker compose ps --format "    {{.Name}}: {{.Status}}" 2>/dev/null

# Database counts
echo ""
echo "  Database:"
PRODUCTS=$(docker exec interwall-postgres psql -U interwall -d interwall -t -A -c "SELECT COUNT(*) FROM products;" 2>/dev/null)
COMPS=$(docker exec interwall-postgres psql -U interwall -d interwall -t -A -c "SELECT COUNT(*) FROM ean_compositions;" 2>/dev/null)
ALIASES=$(docker exec interwall-postgres psql -U interwall -d interwall -t -A -c "SELECT COUNT(*) FROM sku_aliases;" 2>/dev/null)
SHELVES=$(docker exec interwall-postgres psql -U interwall -d interwall -t -A -c "SELECT COUNT(*) FROM shelves;" 2>/dev/null)
echo "    Products: $PRODUCTS"
echo "    Compositions: $COMPS"
echo "    SKU aliases: $ALIASES"
echo "    Shelves: $SHELVES"

# API health
sleep 2
HTTP=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:1441/api/health 2>/dev/null || echo "000")
echo ""
echo "  API health: HTTP $HTTP"

# Email poller status
sleep 3
POLLER_LOG=$(docker compose logs api --tail=5 2>/dev/null | grep -i "poll\|imap\|email\|disabled" | tail -1)
if [ -n "$POLLER_LOG" ]; then
    echo "  Email poller: $POLLER_LOG"
else
    echo "  Email poller: running (first poll in ~60s)"
fi

echo ""
echo "==========================================="
echo " DEPLOY COMPLETE"
echo "==========================================="
echo ""
echo "  URL:   http://localhost:1441"
echo "  Login: admin / admin123"
echo ""
echo "  Logs:  docker compose logs -f api"
echo "  Stop:  docker compose down"
echo ""
echo "  The email poller checks the inbox every 60s."
echo "  Sales will process once component stock is added."
echo ""
echo "  Remaining legacy containers on this machine:"
docker ps --format "    {{.Names}} ({{.Image}})" | grep -v interwall || echo "    None"
echo ""
