#!/bin/bash
set -e

echo "=== Interwall Inventory OS — Server Setup ==="
echo ""

# Check Docker
if ! command -v docker &> /dev/null; then
    echo "ERROR: Docker is not installed. Install Docker first."
    exit 1
fi

if ! docker compose version &> /dev/null; then
    echo "ERROR: Docker Compose v2 not found."
    exit 1
fi

# Create .env if it doesn't exist
if [ ! -f .env ]; then
    echo "Creating .env file..."
    cat > .env << 'EOF'
# Email poller (IMAP)
IMAP_SERVER=imap.hostnet.nl
IMAP_EMAIL=info@omiximo.nl
IMAP_PASSWORD=Parelduiker4!!!
IMAP_FOLDER=INBOX

# Database
POSTGRES_PASSWORD=interwall_prod_2026

# Session (change this to a random 32+ char string)
SESSION_SECRET=interwall-session-secret-change-me-prod-2026
EOF
    echo ".env created. Edit it if needed."
else
    echo ".env already exists, skipping."
fi

# Stop existing containers
echo ""
echo "Stopping existing containers..."
docker compose down 2>/dev/null || true

# Remove old database volume for fresh start
echo "Removing old database volume (fresh seed)..."
docker volume rm interwall_pgdata 2>/dev/null || true

# Build and start
echo ""
echo "Building and starting containers..."
docker compose build
docker compose up -d

# Wait for postgres to be healthy
echo ""
echo "Waiting for database..."
for i in $(seq 1 30); do
    if docker exec interwall-postgres pg_isready -U interwall -d interwall &>/dev/null; then
        echo "Database ready."
        break
    fi
    sleep 1
done

# Verify
echo ""
echo "=== Verification ==="

# Check containers
echo -n "Containers: "
docker compose ps --format "{{.Name}} ({{.Status}})" | tr '\n' ', '
echo ""

# Check products
PRODUCT_COUNT=$(docker exec interwall-postgres psql -U interwall -d interwall -t -A -c "SELECT COUNT(*) FROM products;")
echo "Products: $PRODUCT_COUNT"

# Check compositions
COMP_COUNT=$(docker exec interwall-postgres psql -U interwall -d interwall -t -A -c "SELECT COUNT(*) FROM ean_compositions;")
echo "Compositions: $COMP_COUNT"

# Check SKU aliases
ALIAS_COUNT=$(docker exec interwall-postgres psql -U interwall -d interwall -t -A -c "SELECT COUNT(*) FROM sku_aliases;")
echo "SKU aliases: $ALIAS_COUNT"

# Check user
USER=$(docker exec interwall-postgres psql -U interwall -d interwall -t -A -c "SELECT username FROM users LIMIT 1;")
echo "Login user: $USER / admin123"

# Check API health
sleep 3
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:1441/api/health 2>/dev/null || echo "000")
echo "API health: HTTP $HTTP_CODE"

echo ""
echo "=== Setup Complete ==="
echo ""
echo "  Frontend: http://localhost:1441"
echo "  Login:    admin / admin123"
echo ""
echo "  Email poller runs every 60s automatically."
echo "  First poll will process all sale emails from inbox."
echo "  Sales will fail until component stock is added."
echo ""
echo "  To add stock (example):"
echo "    curl -c /tmp/c.txt -X POST http://localhost:1441/api/auth/login -d 'username=admin&password=admin123'"
echo "    curl -b /tmp/c.txt -X POST http://localhost:1441/api/stock-lots -H 'Content-Type: application/json' \\"
echo "      -d '{\"ean\":\"COMP-CPU-R5-4500\",\"quantity\":50,\"unit_cost\":89.00}'"
echo ""
