# Project: Omiximo Email-to-Inventory Automation

Last Updated: 2026-01-21

---

## Project Overview

- **Purpose:** Automates recording of marketplace sales from email confirmations into the InvenTree inventory management system. Monitors an email inbox for MediaMarktSaturn sale notifications, parses order details, and automatically deducts stock with special RAM stick handling.
- **Tech Stack:** Python 3.11, IMAP (imaplib), InvenTree REST API, Docker, Fernet encryption
- **Architecture:** Monolithic service with pluggable parser pattern
- **Status:** Production-ready

---

## MCP Tools Integration

**CRITICAL: Always utilize available MCP (Model Context Protocol) tools for enhanced capabilities.**

### Available MCP Servers

#### Context7 - Library Documentation
**When to use:** Getting up-to-date documentation for Python libraries, InvenTree API, or IMAP protocols

**Available Tools:**
- `mcp__context7__resolve-library-id` - Convert library name to Context7 ID
- `mcp__context7__get-library-docs` - Fetch comprehensive documentation

**Project-Specific Examples:**
- Python requests: resolve-library-id("requests") for HTTP client best practices
- Cryptography library: resolve-library-id("cryptography") for Fernet encryption docs
- Docker: resolve-library-id("docker") for containerization patterns

#### Sequential Thinking - Complex Problem Solving
**When to use:** Breaking down complex problems with multi-step reasoning

**Available Tools:**
- `mcp__sequential-thinking__sequentialthinking` - Chain of thought reasoning

**When to use in this project:**
- Debugging email parsing issues with specific marketplace formats
- Analyzing FIFO stock deduction edge cases
- Troubleshooting InvenTree API integration issues
- Designing new marketplace parser implementations

#### Playwright - Browser Automation
**When to use:** Testing InvenTree web interface or verifying inventory changes

**Note:** This project is primarily backend/CLI-based. Playwright is useful for:
- Verifying InvenTree stock levels via web UI
- Testing InvenTree dashboard functionality
- Screenshots for documentation

---

## Technology Stack

### Backend
- **Runtime:** Python 3.11
- **Email Protocol:** IMAP via imaplib (SSL/TLS on port 993)
- **Email Provider:** Hostnet (imap.hostnet.nl)
- **Inventory API:** InvenTree REST API
- **HTTP Client:** requests >= 2.31.0
- **Encryption:** Fernet (cryptography >= 41.0.0)
- **Configuration:** python-dotenv >= 1.0.0

### Infrastructure
- **Containerization:** Docker & Docker Compose
- **Network:** External `inventree_network` for InvenTree connectivity
- **Secrets:** Encrypted file storage (.secrets/ directory)
- **Persistence:** Docker volume for processed email tracking
- **Logging:** JSON file driver with rotation (10MB, 3 files)

### Development Tools
- **Package Manager:** pip with requirements.txt
- **Testing:** Python unittest (tests/test_parser.py)
- **Scripts:** Bash scripts for setup/start/stop/logs

---

## Architecture Overview

### Design Patterns
- **Pluggable Parser Pattern:** Abstract `BaseMarketplaceParser` with concrete implementations (e.g., `MediaMarktSaturnParser`) for extensibility to new marketplaces
- **FIFO Stock Management:** First-In-First-Out ordering for stock deductions using timestamp-based queries
- **Context Manager Pattern:** Used for IMAP connections to ensure proper cleanup
- **Layered Architecture:** Separation between email client, parsers, inventory client, and stock management

### Key Components
- **IMAPClient** (`src/email_client/imap_client.py`): IMAP connection management, email fetching, MIME parsing
- **MediaMarktSaturnParser** (`src/marketplace_parsers/mediamarktsaturn.py`): Dutch-language email parsing with regex extraction
- **InvenTreeClient** (`src/inventory/inventree_client.py`): REST API client with token authentication
- **StockManager** (`src/inventory/stock_manager.py`): High-level stock operations, RAM deduction logic
- **ProcessedEmailTracker** (`src/utils/tracking.py`): Duplicate prevention via Message-ID tracking

### Data Flow
```
[IMAP Server] → [IMAPClient] → [Parser Pipeline] → [StockManager] → [InvenTree API]
                     ↓                  ↓                  ↓
              [Email Fetch]      [OrderData]       [DeductionResult]
                     ↓                  ↓                  ↓
              [ProcessedEmailTracker] ← [Mark Processed] ← [Log Result]
```

### Directory Structure
```
omiximo-email-automation/
├── src/
│   ├── main.py                    # Entry point, main loop, signal handling
│   ├── config.py                  # Configuration & environment management
│   ├── email_client/
│   │   └── imap_client.py        # IMAP connection & email fetching
│   ├── marketplace_parsers/
│   │   ├── base.py               # BaseMarketplaceParser, OrderData, ShippingAddress
│   │   └── mediamarktsaturn.py   # MediaMarktSaturn-specific parser
│   ├── inventory/
│   │   ├── inventree_client.py   # InvenTree REST API client
│   │   └── stock_manager.py      # Stock operations & RAM logic
│   └── utils/
│       └── tracking.py           # Processed email tracking (JSON)
├── docker/
│   ├── Dockerfile                # Python 3.11-slim, non-root user
│   ├── docker-compose.yml        # Service definition
│   └── entrypoint.sh             # Container startup
├── scripts/
│   ├── setup.sh                  # Interactive setup with encryption
│   ├── start.sh                  # Start container
│   ├── stop.sh                   # Stop container
│   └── logs.sh                   # View logs
├── tests/
│   └── test_parser.py            # MediaMarktSaturn parser tests
├── docs/
│   └── INVENTORY_ANALYSIS.md     # InvenTree system documentation
├── .env.example                  # Configuration template
├── requirements.txt              # Python dependencies
└── PROMPT.md                     # Original project requirements
```

---

## Development Commands

### Setup
```bash
# Clone and enter directory
cd omiximo-email-automation

# Install dependencies (local development)
pip install -r requirements.txt

# Environment setup
cp .env.example .env
# Edit .env with your InvenTree credentials

# Run interactive setup (encrypts email password)
./scripts/setup.sh
```

### Development
```bash
# Run once (single poll, then exit) - useful for testing
python -m src.main --once

# Run with debug logging
python -m src.main --debug

# Run continuous polling (production mode)
python -m src.main
```

### Testing
```bash
# Run parser unit tests
python -m pytest tests/test_parser.py -v

# Run all tests
python -m pytest tests/ -v
```

### Docker Operations
```bash
# Build and start container
./scripts/start.sh

# Stop container
./scripts/stop.sh

# View logs
./scripts/logs.sh

# Manual Docker Compose
cd docker && docker compose up --build -d
cd docker && docker compose logs -f
cd docker && docker compose down
```

---

## Data Models

### OrderData
```python
@dataclass
class OrderData:
    order_number: str           # "02116_296531828-A"
    customer_name: str          # "Federico Italiano"
    product_description: str    # Full product specs
    sku: str                    # "OMX-GHANA-2026-R7-5700X-RTX5050-16G-1T"
    price: float                # 899.00
    quantity: int               # 1
    ram_size_gb: int            # 16
    order_date: str             # "14-01-2026"
    shipping_address: ShippingAddress
    raw_email_body: str
    marketplace: str            # "MediaMarktSaturn"
```

### DeductionResult
```python
@dataclass
class DeductionResult:
    success: bool
    part_id: int
    sku: str
    quantity_deducted: int
    batches_used: list
    error: str
```

---

## RAM Deduction Configuration

The system converts total RAM to individual stick configurations:

| Total RAM | Stick Size | Quantity | SKU Pattern |
|-----------|------------|----------|-------------|
| 8 GB      | 8 GB       | 1        | RAM-8GB-DDR4 |
| 16 GB     | 8 GB       | 2        | RAM-8GB-DDR4 |
| 32 GB     | 16 GB      | 2        | RAM-16GB-DDR4 |
| 64 GB     | 16 GB      | 4        | RAM-16GB-DDR4 |
| 128 GB    | 32 GB      | 4        | RAM-32GB-DDR4 |

---

## Established Patterns & Conventions

### Code Style
- **Dataclasses:** Used for all data models (OrderData, ShippingAddress, DeductionResult)
- **Context Managers:** IMAP connections use `with` statements for cleanup
- **Logging:** Consistent format with module-level loggers
- **Type Hints:** Used throughout for clarity

### Parser Patterns
- **can_parse():** Check if parser handles this email sender
- **parse():** Extract OrderData from email body
- **Validation:** Always validate extracted fields before returning

### API Patterns
- **Token Auth:** InvenTree uses Basic Auth to obtain token, then token for subsequent requests
- **FIFO Ordering:** Stock queries ordered by `updated` timestamp (ascending)
- **Batch Operations:** Support multi-batch deductions when single batch insufficient

### Error Handling
- **Graceful Degradation:** Continue processing on partial failures
- **Signal Handlers:** SIGINT/SIGTERM for clean shutdown
- **Logging:** All errors logged with context for debugging
- **Retry on Next Poll:** Failed operations retried on next polling cycle

---

## Known Issues & Solutions

### Email Marked as Read But Not Processed
- **Problem:** IMAP marks email as read before parsing completes
- **Solution:** Email is marked read after successful processing or explicit error handling
- **Prevention:** Ensure try/finally blocks always mark as read to prevent reprocessing

### Insufficient Stock Warnings
- **Problem:** Stock deduction proceeds even with insufficient inventory
- **Symptoms:** Log warnings about partial deductions
- **Solution:** By design - system deducts what's available and logs warning
- **Prevention:** Monitor InvenTree stock levels proactively

### RAM SKU Not Found
- **Problem:** RAM stick SKU doesn't exist in InvenTree
- **Solution:** Create the required RAM SKU in InvenTree with IPN matching config
- **Config:** Update `RAM_8GB_SKU`, `RAM_16GB_SKU`, `RAM_32GB_SKU` in environment

---

## Security & Authentication

### Email Authentication
- **Method:** IMAP with encrypted password storage
- **Password Storage:** Fernet-encrypted in `.secrets/email_password.enc`
- **Key Storage:** `.secrets/email.key` (symmetric key)
- **Setup:** Interactive `./scripts/setup.sh` handles encryption

### InvenTree Authentication
- **Method:** Token-based authentication
- **Token Acquisition:** Basic Auth to `/api/user/token/` endpoint
- **Storage:** Environment variables (`.env` file, not committed)

### Environment Variables
```bash
# Required (in .env)
INVENTREE_API_URL=http://inventree-server:8000/api
INVENTREE_USERNAME=admin
INVENTREE_PASSWORD=your_password

# Optional
INVENTREE_API_TOKEN=  # If set, skips token acquisition
IMAP_EMAIL=info@omiximo.nl
POLL_INTERVAL=60

# RAM SKU Configuration
RAM_8GB_SKU=RAM-8GB-DDR4
RAM_16GB_SKU=RAM-16GB-DDR4
RAM_32GB_SKU=RAM-32GB-DDR4
```

---

## Testing Strategy

### Unit Tests
- **Framework:** Python unittest / pytest
- **Location:** `tests/test_parser.py`
- **Coverage:** MediaMarktSaturn parser validation

### Test Cases
- `test_can_parse()`: Validates sender detection
- `test_parse_order()`: Validates field extraction
- `test_ram_detection()`: Validates RAM size parsing
- `test_price_parsing()`: Validates Dutch number format conversion

### Manual Testing
```bash
# Test single poll cycle
python -m src.main --once --debug

# Verify InvenTree connection
curl -X GET "http://inventree-server:8000/api/" -H "Authorization: Token YOUR_TOKEN"
```

---

## Monitoring & Observability

### Logging
- **Format:** `%(asctime)s [%(levelname)s] %(name)s: %(message)s`
- **Output:** stdout (Docker logs)
- **Levels:**
  - DEBUG: Detailed parsing/API info (--debug flag)
  - INFO: Normal operation, successful orders
  - WARNING: Partial failures, insufficient stock
  - ERROR: API failures, parsing errors

### Docker Logging
- **Driver:** JSON file
- **Max Size:** 10MB per file
- **Rotation:** 3 files

### Health Indicators
- Check `data/processed_emails.json` for recent activity
- Monitor Docker logs for errors
- InvenTree stock levels for successful deductions

---

## Next Steps

**Immediate:**
- [ ] Deploy to production environment
- [ ] Configure monitoring/alerting for failures
- [ ] Test with real MediaMarktSaturn orders

**Short Term:**
- [ ] Add additional marketplace parsers (e.g., Bol.com, Amazon)
- [ ] Implement email notification on processing failures
- [ ] Add stock level alerts when inventory low

**Long Term:**
- [ ] Web dashboard for monitoring order processing
- [ ] REST API for manual order entry
- [ ] Integration with accounting/invoicing systems

**Backlog:**
- [ ] Support for multiple InvenTree locations
- [ ] Transaction history recording in InvenTree
- [ ] Bulk email reprocessing capability

---

## Additional Resources

### Documentation
- `docs/INVENTORY_ANALYSIS.md` - InvenTree system structure analysis
- `PROMPT.md` - Original project requirements and specifications

### External References
- [InvenTree API Documentation](https://docs.inventree.org/en/latest/api/api/)
- [Python imaplib Documentation](https://docs.python.org/3/library/imaplib.html)
- [Fernet Encryption (cryptography)](https://cryptography.io/en/latest/fernet/)

---

## Project-Specific Notes

### Important Quirks
- **Dutch Email Format:** Parser expects Dutch-language emails from MediaMarktSaturn
- **Price Format:** Dutch decimal format (1.234,56) converted to float (1234.56)
- **SKU in Email:** Product SKU extracted from "Uw referentie" field in order emails
- **External Network:** Docker must connect to pre-existing `inventree_network`

### Local Development Tips
- Use `--once --debug` flags for testing single email processing
- Check `.secrets/` directory exists with proper encryption files
- Ensure InvenTree is accessible before starting container
- Monitor `data/processed_emails.json` for tracking state

### Common Gotchas
- **Missing .secrets/:** Run `./scripts/setup.sh` to initialize encryption
- **Network Error:** Ensure Docker network `inventree_network` exists
- **Token Expiry:** InvenTree tokens may expire; service will re-authenticate
- **RAM SKU Mismatch:** Ensure InvenTree has matching IPN for RAM parts

---

## Extending the System

### Adding a New Marketplace Parser

1. Create new file in `src/marketplace_parsers/`:
```python
from .base import BaseMarketplaceParser, OrderData

class NewMarketplaceParser(BaseMarketplaceParser):
    def can_parse(self, sender: str, subject: str) -> bool:
        return "newmarketplace.com" in sender.lower()

    def parse(self, email_body: str, sender: str, subject: str) -> OrderData:
        # Implement parsing logic
        pass
```

2. Register in `src/marketplace_parsers/__init__.py`
3. Add to parser list in `src/main.py`

---

## Changelog

### 2026-01-21
- Initial CLAUDE.md customization based on codebase analysis
- Documented all core components and architecture
- Added development commands and configuration details

---

**Last Reviewed:** 2026-01-21
**Maintained By:** Orchestrator Agent + Team
**Project Version:** 1.0.0
