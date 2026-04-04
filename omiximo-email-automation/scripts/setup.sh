#!/bin/bash
#
# Omiximo Email Automation - Setup Script
# This script configures the email password and builds the Docker container.
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
SECRETS_DIR="$PROJECT_DIR/.secrets"

echo "======================================"
echo " Omiximo Email Automation Setup"
echo "======================================"
echo ""

# Create secrets directory
mkdir -p "$SECRETS_DIR"

# Check if already configured
if [ -f "$SECRETS_DIR/email.key" ] && [ -f "$SECRETS_DIR/email_password.enc" ]; then
    echo "Email credentials already configured."
    read -p "Do you want to reconfigure? (y/N): " reconfigure
    if [[ ! "$reconfigure" =~ ^[Yy]$ ]]; then
        echo "Skipping password configuration."
        skip_password=true
    fi
fi

if [ -z "$skip_password" ]; then
    # Prompt for email password
    echo ""
    echo "Email Configuration"
    echo "-------------------"
    echo "Server: imap.hostnet.nl"
    echo "Email: info@omiximo.nl"
    echo ""

    # Read password securely
    read -s -p "Enter email password: " EMAIL_PASSWORD
    echo ""

    if [ -z "$EMAIL_PASSWORD" ]; then
        echo "ERROR: Password cannot be empty"
        exit 1
    fi

    # Confirm password
    read -s -p "Confirm email password: " EMAIL_PASSWORD_CONFIRM
    echo ""

    if [ "$EMAIL_PASSWORD" != "$EMAIL_PASSWORD_CONFIRM" ]; then
        echo "ERROR: Passwords do not match"
        exit 1
    fi

    # Generate Fernet key and encrypt password using Python
    echo ""
    echo "Encrypting password..."

    python3 << EOF
from cryptography.fernet import Fernet
import os

# Generate key
key = Fernet.generate_key()

# Encrypt password
fernet = Fernet(key)
encrypted = fernet.encrypt(b"$EMAIL_PASSWORD")

# Save key
with open("$SECRETS_DIR/email.key", "wb") as f:
    f.write(key)

# Save encrypted password
with open("$SECRETS_DIR/email_password.enc", "wb") as f:
    f.write(encrypted)

print("Password encrypted successfully!")
EOF

    # Set secure permissions
    chmod 600 "$SECRETS_DIR/email.key"
    chmod 600 "$SECRETS_DIR/email_password.enc"

    echo "Credentials saved to $SECRETS_DIR/"
fi

# Create .env file if it doesn't exist
ENV_FILE="$PROJECT_DIR/.env"
if [ ! -f "$ENV_FILE" ]; then
    echo ""
    echo "Creating .env configuration file..."

    cat > "$ENV_FILE" << 'ENVFILE'
# Omiximo Email Automation Configuration

# IMAP Settings (Hostnet)
IMAP_SERVER=imap.hostnet.nl
IMAP_PORT=993
IMAP_EMAIL=info@omiximo.nl
IMAP_USE_SSL=true

# InvenTree API Settings
# When running in Docker, use the container name
INVENTREE_API_URL=http://inventree-server:8000/api
INVENTREE_USERNAME=admin
INVENTREE_PASSWORD=admin123

# RAM SKU Configuration
# These are the SKUs in InvenTree for RAM sticks
RAM_8GB_SKU=RAM-8GB-DDR4
RAM_16GB_SKU=RAM-16GB-DDR4

# Polling interval in seconds
POLL_INTERVAL=60
ENVFILE

    echo "Created $ENV_FILE"
    echo "Edit this file to customize your configuration."
fi

# Build Docker image
echo ""
echo "Building Docker image..."
cd "$PROJECT_DIR/docker"
docker compose build

echo ""
echo "======================================"
echo " Setup Complete!"
echo "======================================"
echo ""
echo "To start the service:"
echo "  ./scripts/start.sh"
echo ""
echo "To view logs:"
echo "  docker logs -f omiximo-email-automation"
echo ""
echo "To stop the service:"
echo "  ./scripts/stop.sh"
echo ""

# Check if InvenTree network exists
if ! docker network ls | grep -q "inventree_network"; then
    echo "WARNING: inventree_network not found!"
    echo "Make sure InvenTree is running before starting this service."
    echo ""
fi
