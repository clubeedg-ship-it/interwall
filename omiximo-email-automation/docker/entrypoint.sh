#!/bin/bash
set -e

echo "======================================"
echo " Omiximo Email-to-Inventory Automation"
echo "======================================"
echo ""

# Export environment variables for cron
printenv | grep -E '^(IMAP_|INVENTREE_|RAM_|SSD_|CPU_|GPU_)' > /etc/environment

# Check required environment variables
required_vars="IMAP_SERVER IMAP_EMAIL IMAP_PASSWORD INVENTREE_API_URL INVENTREE_API_TOKEN"
for var in $required_vars; do
    if [ -z "${!var}" ]; then
        echo "ERROR: Required environment variable $var is not set!"
        exit 1
    fi
done

echo "Configuration:"
echo "  IMAP Server:  ${IMAP_SERVER}"
echo "  IMAP Email:   ${IMAP_EMAIL}"
echo "  InvenTree:    ${INVENTREE_API_URL}"
echo "  Timezone:     ${TZ:-UTC}"
echo ""
echo "Schedule: Every hour at minute 5"
echo ""

# Run once immediately on startup
echo "Running initial processing..."
/app/run_hourly.sh || echo "Initial run completed (may have had no new emails)"
echo ""

# Start the Config API in background
echo "Starting Config API on port 8080..."
python -m src.config_api >> /app/logs/config_api.log 2>&1 &
CONFIG_API_PID=$!
echo "Config API started (PID: $CONFIG_API_PID)"
echo ""

echo "Starting cron daemon..."
echo "Logs will be written to /app/logs/cron.log"
echo ""

# Start cron in foreground
exec cron -f
