#!/bin/bash
set -e

echo "==========================================="
echo " Interwall — Data Reset (March 31 stock)"
echo "==========================================="
echo ""

# Detect container name
if docker ps --format '{{.Names}}' | grep -q interwall-postgres; then
    PG="interwall-postgres"
elif docker ps --format '{{.Names}}' | grep -q omiximo-postgres; then
    PG="omiximo-postgres"
else
    echo "ERROR: No postgres container found. Is docker compose running?"
    exit 1
fi
echo "Using container: $PG"

run_sql() {
    docker exec "$PG" psql -U interwall -d interwall -c "$1"
}

# ── 1. Wipe test data ────────────────────────────────────────────────────
echo ""
echo "[1/5] Wiping test transactions and stock..."
run_sql "DELETE FROM transactions;"
run_sql "DELETE FROM stock_lots;"
echo "  Done."

# ── 2. Reset all emails to pending ───────────────────────────────────────
echo ""
echo "[2/5] Resetting emails to pending (will be reprocessed by poller)..."
run_sql "UPDATE emails SET status = 'pending', processed_at = NULL WHERE status IN ('processed', 'failed');"
PENDING=$(docker exec "$PG" psql -U interwall -d interwall -t -A -c "SELECT COUNT(*) FROM emails WHERE status = 'pending';")
echo "  $PENDING emails set to pending."

# ── 3. Load March 31 stock counting ──────────────────────────────────────
echo ""
echo "[3/5] Loading inventory from March 31, 2026 physical count..."

docker exec "$PG" psql -U interwall -d interwall <<'SQL'
INSERT INTO stock_lots (product_id, quantity, unit_cost, marketplace, received_at) VALUES
    -- Motherboards: A520M = 71
    ((SELECT id FROM products WHERE ean = 'COMP-MOBO-AM4'), 71, 69.00, 'stock-count', '2026-03-31'::timestamptz),
    -- CPUs
    ((SELECT id FROM products WHERE ean = 'COMP-CPU-R3-3200'), 7, 65.00, 'stock-count', '2026-03-31'::timestamptz),
    ((SELECT id FROM products WHERE ean = 'COMP-CPU-R5-3400'), 7, 79.00, 'stock-count', '2026-03-31'::timestamptz),
    ((SELECT id FROM products WHERE ean = 'COMP-CPU-R5-4500'), 9, 89.00, 'stock-count', '2026-03-31'::timestamptz),
    ((SELECT id FROM products WHERE ean = 'COMP-CPU-R7-5700'), 5, 159.00, 'stock-count', '2026-03-31'::timestamptz),
    ((SELECT id FROM products WHERE ean = 'COMP-CPU-R7-5700X'), 63, 179.00, 'stock-count', '2026-03-31'::timestamptz),
    -- RAM sticks
    ((SELECT id FROM products WHERE ean = 'COMP-RAM-8GB'), 42, 18.00, 'stock-count', '2026-03-31'::timestamptz),
    ((SELECT id FROM products WHERE ean = 'COMP-RAM-16GB'), 72, 32.00, 'stock-count', '2026-03-31'::timestamptz),
    -- SSDs
    ((SELECT id FROM products WHERE ean = 'COMP-SSD-256GB'), 9, 25.00, 'stock-count', '2026-03-31'::timestamptz),
    ((SELECT id FROM products WHERE ean = 'COMP-SSD-512GB'), 33, 36.00, 'stock-count', '2026-03-31'::timestamptz),
    ((SELECT id FROM products WHERE ean = 'COMP-SSD-1TB'), 13, 55.00, 'stock-count', '2026-03-31'::timestamptz),
    ((SELECT id FROM products WHERE ean = 'COMP-SSD-2TB'), 11, 95.00, 'stock-count', '2026-03-31'::timestamptz),
    -- GPUs
    ((SELECT id FROM products WHERE ean = 'COMP-GPU-RTX3050'), 0, 189.00, 'stock-count', '2026-03-31'::timestamptz),
    ((SELECT id FROM products WHERE ean = 'COMP-GPU-RTX3060'), 4, 249.00, 'stock-count', '2026-03-31'::timestamptz),
    ((SELECT id FROM products WHERE ean = 'COMP-GPU-RTX5050'), 14, 279.00, 'stock-count', '2026-03-31'::timestamptz),
    ((SELECT id FROM products WHERE ean = 'COMP-GPU-RTX5060'), 18, 349.00, 'stock-count', '2026-03-31'::timestamptz),
    ((SELECT id FROM products WHERE ean = 'COMP-GPU-RTX5060TI'), 2, 449.00, 'stock-count', '2026-03-31'::timestamptz),
    ((SELECT id FROM products WHERE ean = 'COMP-GPU-RTX5070'), 1, 599.00, 'stock-count', '2026-03-31'::timestamptz),
    -- PSU: AT750R=1, SP620=5, Intertech SAMA=1 = 7 total
    ((SELECT id FROM products WHERE ean = 'COMP-PSU-STD'), 7, 39.00, 'stock-count', '2026-03-31'::timestamptz),
    -- Cases
    ((SELECT id FROM products WHERE ean = 'COMP-CASE-NGG'), 66, 45.00, 'stock-count', '2026-03-31'::timestamptz);
SQL

echo "  20 component lots loaded."

# ── 4. Ensure VAT rates + fixed costs are correct ────────────────────────
echo ""
echo "[4/5] Setting up VAT rates and fixed costs..."

docker exec "$PG" psql -U interwall -d interwall <<'SQL'
-- Create vat_rates if not exists (init.sql should have it, but just in case)
CREATE TABLE IF NOT EXISTS vat_rates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    marketplace TEXT NOT NULL UNIQUE,
    country TEXT NOT NULL,
    rate NUMERIC(5,2) NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO vat_rates (marketplace, country, rate) VALUES
    ('mediamarktsaturn', 'NL', 21.00),
    ('bolcom',           'NL', 21.00),
    ('boulanger',        'FR', 20.00)
ON CONFLICT (marketplace) DO NOTHING;

-- Remove VAT from fixed_costs (now per-marketplace in vat_rates)
DELETE FROM fixed_costs WHERE name = 'vat';

-- Ensure commission and overhead exist
INSERT INTO fixed_costs (name, value, is_percentage) VALUES
    ('commission', 6.20, TRUE),
    ('overhead', 95.00, FALSE)
ON CONFLICT (name) DO NOTHING;
SQL

echo "  Done."

# ── 5. Verify ─────────────────────────────────────────────────────────────
echo ""
echo "[5/5] Verifying..."
echo ""

echo "  Stock:"
docker exec "$PG" psql -U interwall -d interwall -c \
    "SELECT p.name, SUM(sl.quantity) AS qty FROM stock_lots sl JOIN products p ON p.id = sl.product_id WHERE sl.quantity > 0 GROUP BY p.name ORDER BY p.name;"

echo ""
echo "  Transactions: $(docker exec "$PG" psql -U interwall -d interwall -t -A -c "SELECT COUNT(*) FROM transactions;")"
echo "  Pending emails: $(docker exec "$PG" psql -U interwall -d interwall -t -A -c "SELECT COUNT(*) FROM emails WHERE status = 'pending';")"
echo "  VAT rates:"
docker exec "$PG" psql -U interwall -d interwall -c "SELECT marketplace, country, rate FROM vat_rates ORDER BY marketplace;"

echo ""
echo "==========================================="
echo " RESET COMPLETE"
echo "==========================================="
echo ""
echo "  Stock is set to March 31, 2026 physical count."
echo "  All emails reset to pending — the poller will"
echo "  reprocess them within 60 seconds, creating real"
echo "  transactions with correct FIFO COGS."
echo ""
echo "  Monitor: docker compose logs -f api"
echo ""
