# Interwall — External References

Design leverage we've agreed to use. Before writing code in these
areas, pull the reference first — do NOT reason from first principles.
This file is NOT auto-imported; load it on demand when a primer's
scope lands in one of these domains.

- **Database schema shapes** — read ERPNext's DocType JSONs before
  drafting any new table:
  https://github.com/frappe/erpnext/tree/version-15/erpnext/stock/doctype
  Specifically `item`, `bom`, `bom_item`, `item_alternative`,
  `stock_ledger_entry`. Translate shapes to our Postgres DDL; do not
  adopt their stack.

- **FIFO edge cases** — read Tryton's `product_cost_fifo` module (on
  PyPI as `trytond-product-cost-fifo`) before editing
  `deduct_fifo_for_group` or writing new cancellation / return /
  reversal logic. Catches partial-depletion and rollback edge cases.

- **Bol.com Retailer API v10** — the full catalogue, signature scheme
  (RSA-SHA256, not HMAC), and polling contract live in
  `.project/BOL-CONTRACT.md` (from T-B00 research). Consult that file
  for any ingestion work; fall back to the official OpenAPI spec if a
  field isn't documented there.

- **GS1 EPCIS event model** — consult when designing new stock
  movement event types. Four canonical events: Object / Aggregation /
  Transaction / Transformation. If our event shape matches EPCIS, we
  stay compatible.

Rule: lift shapes and algorithms, never adopt the runtime. We will
not run ERPNext, Frappe, MariaDB, Tryton, or anything similar.
(D-001, D-002)
