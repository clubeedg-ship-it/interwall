#!/bin/bash
# Omiximo Email Automation - Hourly Run Script
# Processes marketplace emails from the last hour and deducts stock

set -e

# Ensure PATH includes python location for cron environment
export PATH="/usr/local/bin:/usr/bin:/bin:$PATH"

cd /app

# Check if paused
if [ -f /app/data/PAUSED ]; then
    echo "$(date '+%Y-%m-%d %H:%M:%S') - ⏸️  PAUSED - skipping (remove /app/data/PAUSED to resume)"
    exit 0
fi

echo "========================================"
echo "$(date '+%Y-%m-%d %H:%M:%S') - Starting hourly email processing"
echo "========================================"

# Run the main processing script for the last hour
# --hours 1 = only emails from the last hour
# --execute = actually deduct stock (not dry-run)
python3 -m scripts.test_today --hours 1 --execute

# Record successful run timestamp
date +%s > /app/data/last_run.txt

echo "$(date '+%Y-%m-%d %H:%M:%S') - Hourly processing complete"
echo ""
