#!/bin/bash
#
# Omiximo Email Automation - Start Script
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "Starting Omiximo Email Automation..."

# Check if setup was run
if [ ! -f "$PROJECT_DIR/.secrets/email.key" ]; then
    echo "ERROR: Email credentials not configured!"
    echo "Please run ./scripts/setup.sh first."
    exit 1
fi

# Check if InvenTree network exists
if ! docker network ls | grep -q "inventree_network"; then
    echo "WARNING: inventree_network not found."
    echo "Creating network (InvenTree should join this network)..."
    docker network create inventree_network 2>/dev/null || true
fi

# Start the container
cd "$PROJECT_DIR/docker"
docker compose up -d

echo ""
echo "Service started!"
echo ""
echo "View logs with:"
echo "  docker logs -f omiximo-email-automation"
echo ""
echo "Stop with:"
echo "  ./scripts/stop.sh"
