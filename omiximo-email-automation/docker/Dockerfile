# Omiximo Email-to-Inventory Automation
# Runs hourly to process marketplace emails and deduct stock

FROM python:3.11-slim

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app \
    TZ=Europe/Amsterdam

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    cron \
    tzdata \
    && rm -rf /var/lib/apt/lists/* \
    && ln -snf /usr/share/zoneinfo/$TZ /etc/localtime \
    && echo $TZ > /etc/timezone

# Create app directory
WORKDIR /app

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY src/ ./src/
COPY scripts/ ./scripts/
COPY config/ ./config/

# Create directories
RUN mkdir -p /app/data /app/logs

# Copy entrypoint and run script
COPY docker/entrypoint.sh /entrypoint.sh
COPY docker/run_hourly.sh /app/run_hourly.sh
RUN chmod +x /entrypoint.sh /app/run_hourly.sh

# Setup cron job - run every hour at minute 5
RUN echo "5 * * * * root /app/run_hourly.sh >> /app/logs/cron.log 2>&1" > /etc/cron.d/email-automation \
    && chmod 0644 /etc/cron.d/email-automation \
    && crontab /etc/cron.d/email-automation

# Healthcheck
HEALTHCHECK --interval=5m --timeout=30s --start-period=10s --retries=3 \
    CMD test -f /app/data/last_run.txt && test $(($(date +%s) - $(cat /app/data/last_run.txt))) -lt 7200 || exit 1

ENTRYPOINT ["/entrypoint.sh"]
