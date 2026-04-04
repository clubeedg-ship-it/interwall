# Omiximo Email-to-Inventory Automation - Docker Setup

Automatically processes MediaMarktSaturn marketplace order emails and deducts components from InvenTree inventory.

## Quick Start

1. **Configure credentials:**
   ```bash
   cp ../.env.example ../.env
   nano ../.env  # Fill in your credentials
   ```

2. **Build and start:**
   ```bash
   docker compose up -d --build
   ```

3. **Watch logs:**
   ```bash
   docker compose logs -f
   ```

## Schedule

The automation runs **every hour at minute 5** (e.g., 10:05, 11:05, 12:05).

Each run processes only emails received in the **last hour** to avoid duplicates.

## Environment Variables

### Required

| Variable | Description | Example |
|----------|-------------|---------|
| `IMAP_SERVER` | IMAP mail server | `imap.hostnet.nl` |
| `IMAP_EMAIL` | Email address | `info@omiximo.nl` |
| `IMAP_PASSWORD` | Email password | `secret123` |
| `INVENTREE_API_URL` | InvenTree API URL | `http://inventree-server:8000/api` |
| `INVENTREE_API_TOKEN` | InvenTree API token | `inv_xxx...` |

### Optional - Component SKUs

| Variable | Description | Default |
|----------|-------------|---------|
| `RAM_8GB_SKU` | 8GB RAM part SKU | `RAM-8GB-DDR4` |
| `RAM_16GB_SKU` | 16GB RAM part SKU | `RAM-16GB-DDR4` |
| `SSD_512GB_SKU` | 512GB SSD part SKU | `SSD-512GB-NVME` |
| `SSD_1TB_SKU` | 1TB SSD part SKU | `SSD-1TB-NVME` |
| `SSD_2TB_SKU` | 2TB SSD part SKU | `SSD-2TB-NVME` |

## Network

The container connects to the `inventree_network` Docker network to communicate with InvenTree.

If your InvenTree is on a different network, update `docker-compose.yml`.

## Logs

View logs:
```bash
# Live logs
docker compose logs -f

# Cron execution logs (inside container)
docker exec omiximo-email-automation cat /app/logs/cron.log
```

## Manual Run

Trigger an immediate processing run:
```bash
docker exec omiximo-email-automation /app/run_hourly.sh
```

## Healthcheck

The container includes a healthcheck that verifies the last successful run was within 2 hours.

Check status:
```bash
docker inspect --format='{{.State.Health.Status}}' omiximo-email-automation
```

## Troubleshooting

### Container won't start
- Check `.env` file exists and has all required variables
- Verify IMAP credentials are correct
- Ensure `inventree_network` exists: `docker network create inventree_network`

### No emails processed
- Check IMAP server allows connections from container
- Verify email address has marketplace emails
- Check logs for parsing errors

### Stock not deducting
- Verify InvenTree API token has write permissions
- Check SKU mappings match InvenTree part numbers
- Ensure parts exist in InvenTree with stock locations
