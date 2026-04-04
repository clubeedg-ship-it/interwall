#!/bin/bash
#
# Omiximo Email Automation - Stop Script
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "Stopping Omiximo Email Automation..."

cd "$PROJECT_DIR/docker"
docker compose down

echo "Service stopped."
