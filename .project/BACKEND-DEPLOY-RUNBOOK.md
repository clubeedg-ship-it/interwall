# Backend Deploy Runbook

## Scope

This runbook is for the actual backend stack in this repo:

- `postgres`
- `api`
- `nginx`

It replaces the old wipe-and-seed deployment habits. Do not remove
`interwall_pgdata` during normal deployment.

## Preconditions

- `.env` exists and is based on `.env.example`
- `POSTGRES_PASSWORD` and `SESSION_SECRET` are real values
- if `APP_ENV=production`, `SESSION_HTTPS_ONLY=true`
- Docker Desktop / Docker Engine is running

## First bootstrap

1. Copy the env template:
   - `cp .env.example .env`
2. Fill in `.env` with real values.
3. Start the stack:
   - `docker compose up -d --build`
4. Verify liveness:
   - `curl -fsS http://localhost:1441/api/health/ping`
5. Verify container health:
   - `docker compose ps`

## Safe deploy

1. Take a backup:
  - `mkdir -p backups`
  - `STAMP=$(date +%Y%m%d-%H%M%S)`
  - `docker compose exec -T postgres pg_dump -U interwall -d interwall -Fc > "backups/interwall-${STAMP}.dump"`
2. Save the current API image for rollback:
   - `docker compose build api`
   - `docker image tag interwall-api:latest "interwall-api:predeploy-${STAMP}"`
3. Deploy updated code:
   - `docker compose up -d --build`
4. Wait for health:
   - `docker compose ps`
   - `curl -fsS http://localhost:1441/api/health/ping`
5. Check recent API logs:
   - `docker compose logs --tail=100 api`

## Recommended smoke checks

- `curl -fsS http://localhost:1441/api/health/ping`
- `docker compose exec -T postgres psql -U interwall -d interwall -c "SELECT COUNT(*) FROM v_shelf_occupancy;"`
- `docker compose exec -T postgres psql -U interwall -d interwall -c "SELECT COUNT(*) FROM v_health_ingestion_failed;"`
- For release-gate backend changes, run:
  - `docker compose exec -T api python -m pytest /app/tests/t_A07_routers.py /app/tests/t_A09_health_router.py /app/tests/t_C01_profit_immutability.py /app/tests/t_C02c_handshake_endpoints.py /app/tests/t_C03_zones_endpoints.py /app/tests/t_C06_batches_endpoints.py /app/tests/t_shelves_occupancy.py /app/tests/t_shelves_capacity_patch.py /app/tests/t_shelves_settings_patch.py -q`

## T-D04 live overlap proof

Use this when proving Bol.com API polling against the retained emergency
email fallback.

1. Enable the overlap window in `.env`:
   - keep `BOL_CLIENT_ID` and `BOL_CLIENT_SECRET` populated
   - set `ENABLE_BOL_EMAIL_FALLBACK=true`
2. Rebuild the API so the container picks up the current code and env:
   - `docker compose up -d --build api`
3. Verify both ingestion paths are armed:
   - `docker compose logs --tail=100 api`
   - expect Bol.com poll completion logs and no IMAP credential/config errors
4. Let the stack run for the overlap window:
   - gate is `50` distinct Bol.com orders or `7` elapsed days, whichever comes first
5. Capture the current overlap report on the host:
   - `scripts/run-bol-overlap-report.sh`
   - optional custom path: `scripts/run-bol-overlap-report.sh .project/T-D04-BOL-OVERLAP-REPORT.md`
   - synthetic `B03LOCAL` development rows are ignored by default; for a local dry-run of the helper only, pass `--include-synthetic`
6. Read the exit line in the report:
   - ready to close `T-D04` means zero email-only orders, zero API-only orders, and zero quantity/value mismatches inside the comparison window
   - not ready means keep the overlap window open and rerun the script later
7. After the proof window closes, decide whether fallback stays:
   - if the report is clean, set `ENABLE_BOL_EMAIL_FALLBACK=false` (or unset it) and redeploy
   - if not, keep fallback available and log the blocker in the active handoff

## Rollback

Use rollback if the new deployment fails health checks or introduces a
clear regression immediately after deploy.

1. Retag the saved image:
   - `docker image tag "interwall-api:predeploy-${STAMP}" interwall-api:latest`
2. Start the previous API image:
   - `docker compose up -d api`
3. Re-check health:
   - `curl -fsS http://localhost:1441/api/health/ping`

If the rollback image is healthy but the database was changed in a way
the older image cannot tolerate, restore the DB from the matching backup.

## Rehearsal

Use the isolated restore rehearsal before treating backup/restore as
deployment-ready. This restores a dump into a throwaway Postgres
container and verifies core table counts plus critical runtime objects
before any API startup logic can mutate the restored database.

1. Run the rehearsal:
   - `scripts/rehearse-backup-restore.sh`
2. Optional: rehearse a specific dump:
   - `scripts/rehearse-backup-restore.sh backups/interwall-YYYYMMDD-HHMMSS.dump`
3. Expected result:
   - source and restored counts match for `products`, `stock_lots`,
     `transactions`, `stock_ledger_entries`, `builds`,
     `build_components`, and `ingestion_events`
   - restored DB contains `ingestion_events.retry_count`,
     `v_health_ingestion_failed`, `v_health_ingestion_dead_letter`,
     and `v_shelf_occupancy`

## Restore

1. Stop write traffic to the app:
   - `docker compose stop nginx api`
2. Recreate the target database:
   - `docker compose exec -T postgres dropdb -U interwall --if-exists interwall`
   - `docker compose exec -T postgres createdb -U interwall interwall`
3. Restore:
   - `cat backups/interwall-YYYYMMDD-HHMMSS.dump | docker compose exec -T postgres pg_restore -U interwall -d interwall --clean --if-exists`
4. Start services again:
   - `docker compose up -d api nginx`
5. Verify:
   - `curl -fsS http://localhost:1441/api/health/ping`
   - `docker compose logs --tail=100 api`
    - `scripts/rehearse-backup-restore.sh backups/interwall-YYYYMMDD-HHMMSS.dump`
