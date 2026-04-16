#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [ ! -f .env ]; then
    echo "ERROR: .env missing. Copy .env.example to .env and fill in real values."
    exit 1
fi

set -a
# shellcheck disable=SC1091
source .env
set +a

if [ -z "${POSTGRES_PASSWORD:-}" ]; then
    echo "ERROR: POSTGRES_PASSWORD is required in .env"
    exit 1
fi

mkdir -p backups
STAMP="$(date +%Y%m%d-%H%M%S)"
DUMP_PATH="${1:-backups/interwall-rehearsal-${STAMP}.dump}"
REHEARSAL_DB="interwall"
REHEARSAL_CONTAINER="interwall-restore-rehearsal-${STAMP}"
POSTGRES_IMAGE="postgres:15-alpine"

COUNTS_SQL="
SELECT 'products', COUNT(*) FROM products
UNION ALL
SELECT 'stock_lots', COUNT(*) FROM stock_lots
UNION ALL
SELECT 'transactions', COUNT(*) FROM transactions
UNION ALL
SELECT 'stock_ledger_entries', COUNT(*) FROM stock_ledger_entries
UNION ALL
SELECT 'builds', COUNT(*) FROM builds
UNION ALL
SELECT 'build_components', COUNT(*) FROM build_components
UNION ALL
SELECT 'ingestion_events', COUNT(*) FROM ingestion_events
ORDER BY 1;
"

OBJECTS_SQL="
SELECT 'retry_count_column', EXISTS (
  SELECT 1
  FROM information_schema.columns
  WHERE table_name = 'ingestion_events'
    AND column_name = 'retry_count'
)
UNION ALL
SELECT 'v_health_ingestion_failed', EXISTS (
  SELECT 1 FROM pg_views WHERE viewname = 'v_health_ingestion_failed'
)
UNION ALL
SELECT 'v_health_ingestion_dead_letter', EXISTS (
  SELECT 1 FROM pg_views WHERE viewname = 'v_health_ingestion_dead_letter'
)
UNION ALL
SELECT 'v_shelf_occupancy', EXISTS (
  SELECT 1 FROM pg_views WHERE viewname = 'v_shelf_occupancy'
)
ORDER BY 1;
"

cleanup() {
    docker rm -f "$REHEARSAL_CONTAINER" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "[1/6] Capturing source backup..."
if [ ! -f "$DUMP_PATH" ]; then
    docker compose exec -T postgres pg_dump -U interwall -d interwall -Fc > "$DUMP_PATH"
fi
echo "  Backup: $DUMP_PATH"

echo "[2/6] Capturing source table counts..."
SOURCE_COUNTS="$(docker compose exec -T postgres psql -U interwall -d interwall -t -A -F '|' -c "$COUNTS_SQL")"

echo "[3/6] Starting throwaway Postgres..."
docker run -d \
    --name "$REHEARSAL_CONTAINER" \
    -e POSTGRES_USER=interwall \
    -e POSTGRES_PASSWORD="$POSTGRES_PASSWORD" \
    -e POSTGRES_DB="$REHEARSAL_DB" \
    "$POSTGRES_IMAGE" >/dev/null

for _ in $(seq 1 30); do
    if docker exec "$REHEARSAL_CONTAINER" pg_isready -U interwall -d "$REHEARSAL_DB" >/dev/null 2>&1; then
        break
    fi
    sleep 1
done

if ! docker exec "$REHEARSAL_CONTAINER" pg_isready -U interwall -d "$REHEARSAL_DB" >/dev/null 2>&1; then
    echo "ERROR: throwaway Postgres did not become ready"
    exit 1
fi

echo "[4/6] Restoring backup into throwaway Postgres..."
cat "$DUMP_PATH" | docker exec -i "$REHEARSAL_CONTAINER" pg_restore \
    -U interwall \
    -d "$REHEARSAL_DB" \
    --clean \
    --if-exists >/dev/null

echo "[5/6] Verifying restored data matches source..."
RESTORED_COUNTS="$(docker exec "$REHEARSAL_CONTAINER" psql -U interwall -d "$REHEARSAL_DB" -t -A -F '|' -c "$COUNTS_SQL")"
if [ "$SOURCE_COUNTS" != "$RESTORED_COUNTS" ]; then
    echo "ERROR: restored table counts do not match source"
    echo "--- source ---"
    printf '%s\n' "$SOURCE_COUNTS"
    echo "--- restored ---"
    printf '%s\n' "$RESTORED_COUNTS"
    exit 1
fi

RESTORED_OBJECTS="$(docker exec "$REHEARSAL_CONTAINER" psql -U interwall -d "$REHEARSAL_DB" -t -A -F '|' -c "$OBJECTS_SQL")"
if printf '%s\n' "$RESTORED_OBJECTS" | grep -q '|f$'; then
    echo "ERROR: restored database is missing critical runtime objects"
    printf '%s\n' "$RESTORED_OBJECTS"
    exit 1
fi

echo "[6/6] Rehearsal passed."
echo "  Source counts:"
printf '%s\n' "$SOURCE_COUNTS"
echo "  Restored objects:"
printf '%s\n' "$RESTORED_OBJECTS"
