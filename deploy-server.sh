#!/bin/bash
set -e

echo "==========================================="
echo " Interwall Inventory OS — Safe Deploy"
echo "==========================================="
echo ""

echo "[1/5] Validating environment..."
if [ ! -f .env ]; then
    echo "  ERROR: .env missing. Copy .env.example to .env and fill in real values."
    exit 1
fi
if grep -Eq 'change_me_before_production|change-me-in-production' .env; then
    echo "  ERROR: .env still contains placeholder secrets."
    exit 1
fi

mkdir -p backups
STAMP=$(date +%Y%m%d-%H%M%S)

echo ""
echo "[2/5] Taking database backup..."
docker compose exec -T postgres pg_dump -U interwall -d interwall -Fc > "backups/interwall-${STAMP}.dump"
echo "  Backup written to backups/interwall-${STAMP}.dump"

echo ""
echo "[3/5] Saving current API image for rollback..."
if docker image inspect interwall-api:latest >/dev/null 2>&1; then
    docker image tag interwall-api:latest "interwall-api:predeploy-${STAMP}"
    echo "  Tagged interwall-api:predeploy-${STAMP}"
else
    echo "  No existing interwall-api:latest image to tag."
fi

echo ""
echo "[4/5] Building and starting updated containers..."
docker compose up -d --build

echo ""
echo "[5/5] Verifying deployment..."
sleep 5

HTTP=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:1441/api/health/ping 2>/dev/null || echo "000")
if [ "$HTTP" != "200" ]; then
    echo "  ERROR: /api/health/ping returned HTTP $HTTP"
    echo "  Roll back using the runbook in .project/BACKEND-DEPLOY-RUNBOOK.md"
    exit 1
fi

echo "  Containers:"
docker compose ps --format "    {{.Name}}: {{.Status}}" 2>/dev/null

echo ""
echo "  API health: HTTP $HTTP"

echo ""
echo "==========================================="
echo " DEPLOY COMPLETE"
echo "==========================================="
echo ""
echo "  URL:   http://localhost:1441"
echo "  Logs:  docker compose logs -f api"
echo "  Backup: backups/interwall-${STAMP}.dump"
echo "  Runbook: .project/BACKEND-DEPLOY-RUNBOOK.md"
echo ""
