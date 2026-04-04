# Stock Rewind Agent Prompt

Use this prompt to instruct an agent to reconstruct current component stock levels from a physical stock count checkpoint + inbox sales history.

---

## Prompt

You are working on the Interwall Inventory OS at `/Users/ottogen/interwall/`. The system manages PC assembly inventory — composite products (assembled PCs) are made of individual components (CPUs, RAM sticks, SSDs, GPUs, case, PSU, motherboard).

### How the system works

1. **Products table** has both components (is_composite=false) and assembled PCs (is_composite=true)
2. **ean_compositions** maps each assembled PC to its component parts with quantities
3. **stock_lots** tracks inventory of components — each lot has a quantity, unit_cost, and received_at date
4. **When a sale email arrives**, the system:
   - Extracts the marketplace SKU from the email (e.g., "DB-R5061")
   - Resolves SKU → product EAN via `sku_aliases` table
   - Looks up `ean_compositions` for that EAN to find component list
   - FIFO-deducts each component from `stock_lots` (oldest lot first)
   - Records a `transaction` with COGS and profit

### Your task: Reconstruct stock levels

The database currently has **zero stock** and **36 pending emails** from real sales. We need to figure out the correct starting stock so that after all 36 sales are processed, the remaining stock matches reality.

**Step 1: Get the client's last physical stock count**

Ask the user for the stock count checkpoint — this is the physical count of each component they had at a specific date. Format needed:

```
Date of count: YYYY-MM-DD
Component quantities at that date:
- AMD Ryzen 3 3200G: X units
- AMD Ryzen 5 4500: X units  
- AMD Ryzen 7 5700: X units
- DDR4 8GB RAM Stick: X units
- DDR4 16GB RAM Stick: X units
- NVMe SSD 256GB: X units
- NVMe SSD 512GB: X units
- NVMe SSD 1TB: X units
- NVMe SSD 2TB: X units
- GeForce RTX 3050: X units
- GeForce RTX 3060 12GB: X units
- GeForce RTX 5050: X units
- GeForce RTX 5060: X units
- NGG Gaming Case: X units
- Standard PSU 550W: X units
- AM4 Motherboard: X units
```

Also ask for the average purchase cost per component (for FIFO/COGS accuracy).

**Step 2: Count sales per component from the emails**

Query the database to count how many of each component was consumed by successfully processed sales:

```sql
-- Check how many of each component would be consumed by pending emails
-- by looking at the SKU aliases + compositions
SELECT 
    comp.name AS component,
    SUM(ec.quantity) AS total_needed
FROM emails e
JOIN LATERAL (
    SELECT substring(e.raw_body from 'Interne referentie[^:]*:\s*([A-Za-z0-9_ ./-]+)') AS orig_sku
) extracted ON TRUE
JOIN sku_aliases sa ON sa.marketplace_sku = extracted.orig_sku
JOIN ean_compositions ec ON ec.parent_ean = sa.product_ean  
JOIN products comp ON comp.ean = ec.component_ean
WHERE e.status = 'pending' AND extracted.orig_sku IS NOT NULL
GROUP BY comp.name
ORDER BY comp.name;
```

Also check which pending emails DON'T have SKU aliases (they'll fail and won't consume stock).

**Step 3: Calculate starting stock**

For each component:
```
starting_stock = stock_count_at_checkpoint + purchases_since_checkpoint - sales_NOT_in_inbox_since_checkpoint
```

If the stock count date is BEFORE the oldest email, then:
```
starting_stock = stock_count_at_checkpoint
```
Because all sales since the count are in the inbox and will be deducted automatically.

If the stock count date is AFTER some emails, then those emails were already accounted for in the count, and should be marked as `processed` (not re-deducted).

**Step 4: Insert starting stock**

```sql
INSERT INTO stock_lots (product_id, quantity, unit_cost, marketplace, received_at)
VALUES (
    (SELECT id FROM products WHERE ean = 'COMP-CPU-R5-4500'),
    <quantity>,
    <unit_cost>,
    'stock-count',
    '<stock_count_date>'::timestamptz
);
```

**Step 5: Mark pre-checkpoint emails as processed**

If the stock count happened AFTER some sale emails, those sales are already reflected in the count. Mark them so they don't get double-deducted:

```sql
UPDATE emails SET status = 'processed', processed_at = NOW()
WHERE status = 'pending' AND created_at < '<stock_count_date>';
```

**Step 6: Let the poller process remaining emails**

The poller runs every 60s. After inserting stock and marking pre-checkpoint emails, the remaining pending emails will be processed automatically. Monitor:

```bash
docker compose logs api -f
```

Check results:
```sql
SELECT status, COUNT(*) FROM emails GROUP BY status;
SELECT p.name, sl.quantity FROM stock_lots sl JOIN products p ON p.id = sl.product_id WHERE p.ean LIKE 'COMP-%';
SELECT COUNT(*) AS sales, SUM(total_price) AS revenue, SUM(profit) AS profit FROM transactions WHERE type = 'sale';
```

### Key files to read
- `apps/api/sql/init.sql` — full schema + process_sale() function
- `apps/api/email_poller/sale_writer.py` — SKU resolution logic
- `apps/api/email_poller/poller.py` — poll_once() + retry_pending()
- `apps/api/sql/02_seed_gs1_products.sql` — all products + compositions + SKU aliases

### Component EANs (for SQL inserts)
```
COMP-CPU-R3-3200    AMD Ryzen 3 3200G
COMP-CPU-R5-3400    AMD Ryzen 5 3400G
COMP-CPU-R5-4500    AMD Ryzen 5 4500
COMP-CPU-R7-5700    AMD Ryzen 7 5700
COMP-CPU-R7-5700X   AMD Ryzen 7 5700X
COMP-RAM-8GB        DDR4 8GB RAM Stick
COMP-RAM-16GB       DDR4 16GB RAM Stick
COMP-SSD-256GB      NVMe SSD 256GB
COMP-SSD-500GB      NVMe SSD 500GB
COMP-SSD-512GB      NVMe SSD 512GB
COMP-SSD-1TB        NVMe SSD 1TB
COMP-SSD-2TB        NVMe SSD 2TB
COMP-GPU-RTX3050    GeForce RTX 3050
COMP-GPU-RTX3060    GeForce RTX 3060 12GB
COMP-GPU-RTX4060    GeForce RTX 4060
COMP-GPU-RTX5050    GeForce RTX 5050
COMP-GPU-RTX5060    GeForce RTX 5060
COMP-GPU-RTX5060TI  GeForce RTX 5060 Ti
COMP-GPU-RTX5070    GeForce RTX 5070
COMP-GPU-RTX5070T   GeForce RTX 5070 Ti
COMP-CASE-NGG       NGG Gaming Case
COMP-PSU-STD        Standard PSU 550W
COMP-MOBO-AM4       AM4 Motherboard
```
