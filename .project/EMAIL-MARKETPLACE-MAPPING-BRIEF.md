# Email Marketplace Mapping Brief

Last refreshed: `2026-04-16`

## Goal

Document how marketplace email sales are expected to resolve into Builds, and
which marketplaces are actually clean in the current live DB.

This is a runtime truth note, not a design wish list.

## Shared Email Routing Contract

All email marketplaces currently flow through the same runtime sale path:

1. parser extracts marketplace + order number + SKU/code
2. `sale_writer.write_sale(...)` tries `external_item_xref(marketplace, external_sku)`
3. if no xref hit, it tries `sku_aliases / products.ean / products.sku -> EAN`
4. if EAN resolves to an active Build, sale goes through `process_bom_sale(...)`
5. if no sale-routing Build is reachable:
   - a draft Build + SKU mapping is created
   - the ingestion row moves to `review`
   - sale is not processed until a human completes the Build and replays the row

Draft rules:

- draft Build is inactive
- draft Build has zero components
- draft Build description contains `[DRAFT-UNRESOLVED-SKU]`
- draft creation is generic for email marketplaces, not Bol-only

## Current Live Status

Source: `ingestion_events` where `source='email'`

### BolCom

- `processed=50`
- `review=73`
- `dead_letter=28`

Meaning:

- `73 review` rows are unresolved email SKUs now captured as draft mapping work
- `28 dead_letter` rows are no longer SKU-resolution misses; they are real stock blockers

### MediaMarktSaturn

- `review=245`
- lowercase `mediamarktsaturn`: `processed=2`

Meaning:

- seller-code routing is materially cleaner than before
- `Product not found for SKU: ...` is now `0` for historical MMS email rows
- remaining MMS backlog is now explicit operator work, not unknown-SKU churn:
  - `197` review rows are real stock blockers
  - `48` review rows are draft Build mapping work

Examples seen live:

- stock review hotspots:
  - `COMP-CPU-R3-3200`
  - `COMP-CPU-R5-3400`
  - `COMP-CPU-R5-4500`
  - `COMP-CPU-R7-5700`
- draft review hotspots:
  - `LPT-N95001`
  - `RDT-R3004`
  - `QL-R7064`
  - `RDT-R5041`
  - `OMX-GHANA-2026-R7-5700X-RTX5060-16G-1T`

Notes:

- MediaMarktSaturn parser usually extracts `Interne referentie` directly
- replay packet backfilled `32` MMS `external_item_xref` rows from deterministic replay resolution and draft capture
- status is improved but still not fully clean because historical stock shortages and unresolved draft mappings remain

### Boulanger

- `dead_letter=90`

Meaning:

- not clean
- dominant blocker is still `Product not found for SKU: ...`
- many rows carry numeric internal references that do not currently resolve through xref or EAN

Examples seen live:

- `155090992`
- `151382844`
- `164534385`
- `OMX-BOU-UNK-0-0-031`

Notes:

- Boulanger parser usually extracts `Référence interne` directly
- where no explicit SKU is found, it may fall back to generated `OMX-BOU-*`, which is weaker than a marketplace-native seller code

## Clean/Unclean Verdict

Current repo/runtime verdict:

- `BolCom`: partially improved, still not clean
- `MediaMarktSaturn`: not clean
- mapping failures cleared on historical replay, but backlog still has review work
- `Boulanger`: not clean

So the statement “MediaMarktSaturn and the other user marketplaces are clean and work with no caveat” is false in the current live DB.

## Required Cleanup Standard

A marketplace email path is only “clean” when all of the following are true:

- new email sales resolve to an active Build without operator-created draft review rows
- no dominant `Product not found for SKU:` failures remain for that marketplace
- no marketplace-specific parser caveat is required to explain routine routing success
- replaying historical failed email rows produces either:
  - `processed`, or
  - real operational blockers such as stock insufficiency

## Next Cleanup Packet

Recommended bounded packet order:

1. MediaMarktSaturn:
   - inventory and normalize the live seller-code family set
   - backfill deterministic xref/EAN coverage for the missing MMS codes
   - replay historical MMS email rows
2. Boulanger:
   - inventory numeric internal references vs generated fallback SKUs
   - backfill deterministic xref/EAN coverage
   - replay historical Boulanger email rows
3. BolCom:
   - finish the remaining `review` draft mappings
   - separate the `dead_letter` stock blockers into an ops/data packet

## Query Snippets

Live marketplace email status:

```sql
SELECT marketplace, status, count(*)
FROM ingestion_events
WHERE source = 'email'
  AND lower(marketplace) IN ('mediamarktsaturn', 'boulanger', 'bolcom')
GROUP BY marketplace, status
ORDER BY marketplace, status;
```

Live marketplace email routing blockers:

```sql
SELECT marketplace, left(error_message, 120) AS err, count(*)
FROM ingestion_events
WHERE source = 'email'
  AND lower(marketplace) IN ('mediamarktsaturn', 'boulanger')
  AND status IN ('failed', 'review', 'dead_letter')
GROUP BY marketplace, err
ORDER BY marketplace, count(*) DESC;
```
