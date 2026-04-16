# T-D05 Sale Routing Audit

Generated against `v2` on `2026-04-16`.

## Scope

Audit every current Python sale-ingestion write path and verify whether
new sales can still route through legacy `process_sale()`.

## Production write paths

1. Email poller inline path:
   `email_poller.poller._process_one()` → `process_ingestion_event()` →
   `email_poller.sale_writer.write_sale()` → `process_bom_sale()`
2. Shared ingestion worker retry path:
   `ingestion.worker.process_pending_events()` →
   `_reprocess_email()` / `_reprocess_bolcom()` →
   `write_sale()` or direct `process_bom_sale()`
3. Bol.com API poller path:
   `poller.bol_poller._process_order_item()` → `process_bom_sale()`

## Findings

- No live Python runtime call site invokes legacy `process_sale()`.
- Email sales now route through `write_sale()`, which is Build-only:
  xref hit → `process_bom_sale()`, EAN/build hit → `process_bom_sale()`,
  otherwise raise.
- Bol.com API sales call `process_bom_sale()` directly after Build
  resolution.
- `process_bom_sale()` writes:
  - `transactions.type = 'sale'`
  - `transactions.product_ean = build_code`
  - `transactions.build_code = build_code`
  - immutable `cogs` / `profit`
  - at least one `stock_ledger_entries` row

## Legacy status

- `process_sale()` still exists in `apps/api/sql/init.sql`.
- It is retained only as a migration-compatibility database shim.
- Current Python ingestion/runtime code does not call it.

## Proof bundle

- Source audit:
  - `rg -n "process_sale\\(" apps/api`
- Focused proof test:
  - `docker compose exec -T api python -m pytest /app/tests/t_D05_sale_routing_audit.py -q`
- Supporting routing/integration tests already present:
  - `/app/tests/t_A08_poller_routing.py`
  - `/app/tests/t_B01_bol_poller.py`
  - `/app/tests/t_B02_ingestion_worker.py`

## Exit decision

`T-D05` is satisfied at the code-path level: all current Python sale
ingestion paths are Build-routed. The remaining legacy `process_sale()`
policy is explicitly narrowed to DB-only migration compatibility and can
be dropped after `T-D06` production signoff if no non-Python callers are
needed.
