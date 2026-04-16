#!/bin/bash
set -e

echo "=== Interwall Inventory OS — Safe Server Bootstrap ==="
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

# Create .env from template if it doesn't exist
if [ ! -f .env ]; then
    echo "Creating .env from .env.example..."
    cp .env.example .env
    echo ".env created. Fill in real values before continuing."
    exit 1
else
    echo ".env already exists."
fi

if grep -Eq 'change_me_before_production|change-me-in-production' .env; then
    echo "ERROR: .env still contains placeholder secrets. Fix it before bootstrap."
    exit 1
fi

# Build and start
echo ""
echo "Building and starting containers..."
docker compose up -d --build

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
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:1441/api/health/ping 2>/dev/null || echo "000")
echo "API health: HTTP $HTTP_CODE"

echo ""
echo "=== Setup Complete ==="
echo ""
echo "  Frontend: http://localhost:1441"
echo "  Login:    admin / admin123"
echo ""
echo "  Next: follow .project/BACKEND-DEPLOY-RUNBOOK.md for deploy, backup, and restore."
