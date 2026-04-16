# Interwall Retrieval Commands

Use CLI retrieval instead of repo-wide re-scanning.

## Core read

```bash
sed -n '1,200p' .project/SESSION.md
sed -n '1,240p' AGENTS.md
```

## Read one lane only

```bash
sed -n '/^## Backend lane/,/^## Frontend lane/p' .project/WORKSTREAMS.md
sed -n '/^## Frontend lane/,/^## References/p' .project/WORKSTREAMS.md
```

## Decision lookup

```bash
rg -n "fifo|profit|vat|build_code|source_type|dead_letter|review" .project/DECISIONS.md
```

## Queue / current-state lookup

```bash
sed -n '1,220p' .project/TODO.md
sed -n '1,220p' .project/COACH-HANDOFF.md
```

## Backend retrieval

```bash
rg -n "process_bom_sale|deduct_fifo_for_group|deduct_fifo_for_product|external_item_xref|process_ingestion_event|review|dead_letter" apps/api
rg --files apps/api/routers apps/api/sql apps/api/tests
```

## Frontend retrieval

```bash
rg -n "ALL_VIEWS|ported|WallPage|CatalogPage|ProfitPage|BuildsPage|HealthPage|LocationPicker|BuildWorkspace" inventory-interwall/ui-v2/src
rg --files inventory-interwall/ui-v2/src/pages inventory-interwall/ui-v2/src/components inventory-interwall/frontend
```

## GitHub / handoff snippet

Use this shape in comments, PR notes, or agent handoff messages:

```text
Lane: <backend|frontend>
Scope: <one bounded task>
Read set:
- .project/SESSION.md
- relevant lane section in .project/WORKSTREAMS.md
- smallest relevant source files
Contract source:
- <router/sql/component files>
Proof:
- <exact test/command or browser check>
Blocked by:
- <missing field/endpoint/decision>  # omit if none
```

## GSD note

Use GSD only for bounded single-task packets. If the task already fits in one lane and one proof bundle, work directly and update the relevant state file after.
