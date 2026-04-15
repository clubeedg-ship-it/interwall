-- Interwall — March 31, 2026 physical stock count
-- Run: docker exec -i interwall-postgres psql -U interwall -d interwall < reset-stock.sql

DELETE FROM transactions;
DELETE FROM stock_lots;
UPDATE ingestion_events SET status = 'pending', processed_at = NULL WHERE status IN ('processed', 'failed');

INSERT INTO stock_lots (product_id, quantity, unit_cost, marketplace, received_at) VALUES
    ((SELECT id FROM products WHERE ean = 'COMP-MOBO-AM4'), 71, 69.00, 'stock-count', '2026-03-31'::timestamptz),
    ((SELECT id FROM products WHERE ean = 'COMP-CPU-R3-3200'), 7, 65.00, 'stock-count', '2026-03-31'::timestamptz),
    ((SELECT id FROM products WHERE ean = 'COMP-CPU-R5-3400'), 7, 79.00, 'stock-count', '2026-03-31'::timestamptz),
    ((SELECT id FROM products WHERE ean = 'COMP-CPU-R5-4500'), 9, 89.00, 'stock-count', '2026-03-31'::timestamptz),
    ((SELECT id FROM products WHERE ean = 'COMP-CPU-R7-5700'), 5, 159.00, 'stock-count', '2026-03-31'::timestamptz),
    ((SELECT id FROM products WHERE ean = 'COMP-CPU-R7-5700X'), 63, 179.00, 'stock-count', '2026-03-31'::timestamptz),
    ((SELECT id FROM products WHERE ean = 'COMP-RAM-8GB'), 42, 18.00, 'stock-count', '2026-03-31'::timestamptz),
    ((SELECT id FROM products WHERE ean = 'COMP-RAM-16GB'), 72, 32.00, 'stock-count', '2026-03-31'::timestamptz),
    ((SELECT id FROM products WHERE ean = 'COMP-SSD-256GB'), 9, 25.00, 'stock-count', '2026-03-31'::timestamptz),
    ((SELECT id FROM products WHERE ean = 'COMP-SSD-512GB'), 33, 36.00, 'stock-count', '2026-03-31'::timestamptz),
    ((SELECT id FROM products WHERE ean = 'COMP-SSD-1TB'), 13, 55.00, 'stock-count', '2026-03-31'::timestamptz),
    ((SELECT id FROM products WHERE ean = 'COMP-SSD-2TB'), 11, 95.00, 'stock-count', '2026-03-31'::timestamptz),
    ((SELECT id FROM products WHERE ean = 'COMP-GPU-RTX3050'), 0, 189.00, 'stock-count', '2026-03-31'::timestamptz),
    ((SELECT id FROM products WHERE ean = 'COMP-GPU-RTX3060'), 4, 249.00, 'stock-count', '2026-03-31'::timestamptz),
    ((SELECT id FROM products WHERE ean = 'COMP-GPU-RTX5050'), 14, 279.00, 'stock-count', '2026-03-31'::timestamptz),
    ((SELECT id FROM products WHERE ean = 'COMP-GPU-RTX5060'), 18, 349.00, 'stock-count', '2026-03-31'::timestamptz),
    ((SELECT id FROM products WHERE ean = 'COMP-GPU-RTX5060TI'), 2, 449.00, 'stock-count', '2026-03-31'::timestamptz),
    ((SELECT id FROM products WHERE ean = 'COMP-GPU-RTX5070'), 1, 599.00, 'stock-count', '2026-03-31'::timestamptz),
    ((SELECT id FROM products WHERE ean = 'COMP-PSU-STD'), 7, 39.00, 'stock-count', '2026-03-31'::timestamptz),
    ((SELECT id FROM products WHERE ean = 'COMP-CASE-NGG'), 66, 45.00, 'stock-count', '2026-03-31'::timestamptz);

-- Ensure VAT setup
CREATE TABLE IF NOT EXISTS vat_rates (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), marketplace TEXT NOT NULL UNIQUE, country TEXT NOT NULL, rate NUMERIC(5,2) NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
INSERT INTO vat_rates (marketplace, country, rate) VALUES ('mediamarktsaturn', 'NL', 21.00), ('bolcom', 'NL', 21.00), ('boulanger', 'FR', 20.00) ON CONFLICT (marketplace) DO NOTHING;
DELETE FROM fixed_costs WHERE name = 'vat';

-- Verify
SELECT p.name, sl.quantity FROM stock_lots sl JOIN products p ON p.id = sl.product_id WHERE sl.quantity > 0 ORDER BY p.name;
SELECT COUNT(*) AS pending_events FROM ingestion_events WHERE status = 'pending';
