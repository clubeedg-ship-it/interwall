#!/bin/bash
# Omiximo Email Automation Control Script
# Usage: ./ctl.sh [status|pause|resume|run|logs]

CONTAINER="omiximo-email-automation"

case "$1" in
    status)
        echo "=== Omiximo Email Automation Status ==="
        if docker ps --filter name=$CONTAINER --format "{{.Status}}" | grep -q "Up"; then
            echo "Container: ✅ Running"
            if docker exec $CONTAINER test -f /app/data/PAUSED 2>/dev/null; then
                echo "Automation: ⏸️  PAUSED"
            else
                echo "Automation: ▶️  ACTIVE"
            fi
            LAST_RUN=$(docker exec $CONTAINER cat /app/data/last_run.txt 2>/dev/null || echo "0")
            if [ "$LAST_RUN" != "0" ]; then
                LAST_RUN_DATE=$(TZ='Europe/Amsterdam' date -d @$LAST_RUN '+%Y-%m-%d %H:%M:%S' 2>/dev/null || TZ='Europe/Amsterdam' date -r $LAST_RUN '+%Y-%m-%d %H:%M:%S')
                echo "Last run: $LAST_RUN_DATE"
            fi
        else
            echo "Container: ❌ Not running"
        fi
        ;;
    
    pause)
        echo "⏸️  Pausing automation..."
        docker exec $CONTAINER touch /app/data/PAUSED
        echo "Done. Hourly runs will be skipped until resumed."
        ;;
    
    resume)
        echo "▶️  Resuming automation..."
        docker exec $CONTAINER rm -f /app/data/PAUSED
        echo "Done. Hourly runs will process emails again."
        ;;
    
    run)
        echo "🔄 Running manual processing..."
        docker exec $CONTAINER /app/run_hourly.sh
        ;;
    
    logs)
        docker logs -f $CONTAINER
        ;;
    
    sales)
        HOURS=${2:-24}
        cd "$(dirname "$0")"
        source venv/bin/activate 2>/dev/null || true
        python scripts/last_day_sales.py --hours "$HOURS"
        ;;
    
    clear-sales)
        cd "$(dirname "$0")"
        source venv/bin/activate 2>/dev/null || true
        if [ "$2" == "--confirm" ]; then
            python scripts/clear_sales.py --confirm
        else
            python scripts/clear_sales.py
        fi
        ;;
    
    *)
        echo "Omiximo Email Automation Control"
        echo ""
        echo "Usage: $0 {status|pause|resume|run|logs|sales|clear-sales}"
        echo ""
        echo "Commands:"
        echo "  status       - Show current status"
        echo "  pause        - Stop processing (container keeps running)"
        echo "  resume       - Resume processing"
        echo "  run          - Run processing immediately"
        echo "  logs         - Follow container logs"
        echo "  sales [N]    - Show sales from last N hours (default: 24)"
        echo "  clear-sales  - Delete ALL sales (dry run)"
        echo "  clear-sales --confirm  - Actually delete all sales"
        ;;
esac
