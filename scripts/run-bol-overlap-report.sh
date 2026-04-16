#!/usr/bin/env bash
set -euo pipefail

OUTPUT_PATH="${1:-.project/T-D04-BOL-OVERLAP-REPORT.md}"
if [[ $# -gt 0 ]]; then
  shift
fi

mkdir -p "$(dirname "$OUTPUT_PATH")"
TMP_FILE="$(mktemp)"
cleanup() {
  rm -f "$TMP_FILE"
}
trap cleanup EXIT

set +e
docker compose exec -T api python /app/scripts/bol_reliability_report.py "$@" >"$TMP_FILE"
STATUS=$?
set -e

mv "$TMP_FILE" "$OUTPUT_PATH"
echo "Wrote $OUTPUT_PATH"
echo "Report exit code: $STATUS"
exit "$STATUS"
