#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WEB_ENV_FILE="$ROOT_DIR/apps/web/.env.local"
WEB_DOCKER_ENV_FILE="$ROOT_DIR/apps/web/.env.docker.local"

cd "$ROOT_DIR"

if ! command -v docker >/dev/null 2>&1; then
    echo "docker is required for local Supabase and the web container."
    exit 1
fi

if ! docker info >/dev/null 2>&1; then
    echo "Docker Desktop is not running. Start it first, then rerun: npm run local:up"
    exit 1
fi

echo "Starting local Supabase..."
npx supabase start

echo "Writing apps/web/.env.local..."
npx supabase status -o env \
    --override-name api.url=NEXT_PUBLIC_SUPABASE_URL \
    > "$WEB_ENV_FILE.tmp"

sed \
    -e 's/^ANON_KEY=/NEXT_PUBLIC_SUPABASE_ANON_KEY=/' \
    -e 's/^SERVICE_ROLE_KEY=/SUPABASE_SERVICE_ROLE_KEY=/' \
    "$WEB_ENV_FILE.tmp" > "$WEB_ENV_FILE"

rm -f "$WEB_ENV_FILE.tmp"

sed 's#http://127.0.0.1:#http://host.docker.internal:#g' "$WEB_ENV_FILE" > "$WEB_DOCKER_ENV_FILE"

echo "Bootstrapping demo user and sample data..."
node "$ROOT_DIR/scripts/local/bootstrap-demo.mjs"

echo
echo "Local app is ready to start."
echo "Demo login: demo@interwall.local / Demo123!"
