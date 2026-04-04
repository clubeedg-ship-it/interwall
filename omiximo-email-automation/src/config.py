"""
Configuration management for Omiximo Email Automation.
Loads settings from environment variables.
"""

import os
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables from .env file (if exists)
load_dotenv()


class Config:
    """Application configuration from environment variables."""

    # Project paths
    BASE_DIR = Path(__file__).parent.parent
    DATA_DIR = BASE_DIR / "data"

    # IMAP Configuration
    IMAP_SERVER = os.getenv("IMAP_SERVER", "imap.hostnet.nl")
    IMAP_PORT = int(os.getenv("IMAP_PORT", "993"))
    IMAP_EMAIL = os.getenv("IMAP_EMAIL", "info@omiximo.nl")
    IMAP_PASSWORD = os.getenv("IMAP_PASSWORD", "")
    IMAP_USE_SSL = os.getenv("IMAP_USE_SSL", "true").lower() == "true"

    # InvenTree API Configuration
    INVENTREE_API_URL = os.getenv("INVENTREE_API_URL", "http://inventree-server:8000/api")
    INVENTREE_API_TOKEN = os.getenv("INVENTREE_API_TOKEN", "")
    
    # Legacy username/password support
    INVENTREE_USERNAME = os.getenv("INVENTREE_USERNAME", "")
    INVENTREE_PASSWORD = os.getenv("INVENTREE_PASSWORD", "")

    # Marketplace sender addresses
    MARKETPLACE_SENDERS = {
        "mediamarktsaturn": "noreply@mmsmarketplace.mediamarktsaturn.com",
        "bolcom": "automail@bol.com",
        "boulanger": "marketplace.boulanger@boulanger.com",
    }

    # Component SKU Configuration
    RAM_8GB_SKU = os.getenv("RAM_8GB_SKU", "RAM-8GB-DDR4")
    RAM_16GB_SKU = os.getenv("RAM_16GB_SKU", "RAM-16GB-DDR4")
    
    # SSD SKUs
    SSD_256GB_SKU = os.getenv("SSD_256GB_SKU", "SSD-256GB-NVME")
    SSD_512GB_SKU = os.getenv("SSD_512GB_SKU", "SSD-512GB-NVME")
    SSD_1TB_SKU = os.getenv("SSD_1TB_SKU", "SSD-1TB-NVME")
    SSD_2TB_SKU = os.getenv("SSD_2TB_SKU", "SSD-2TB-NVME")

    # Processed emails tracking file
    PROCESSED_FILE = DATA_DIR / "processed_emails.json"

    @classmethod
    def get_email_password(cls) -> str:
        """
        Get email password from environment variable.

        Returns:
            Password string.

        Raises:
            ValueError: If password is not configured.
        """
        if not cls.IMAP_PASSWORD:
            raise ValueError(
                "IMAP_PASSWORD environment variable is required. "
                "Set it in .env file or container environment."
            )
        return cls.IMAP_PASSWORD

    @classmethod
    def get_inventree_auth(cls) -> dict:
        """
        Get InvenTree authentication credentials.
        
        Returns:
            Dict with either 'token' or 'username'/'password'.
        """
        if cls.INVENTREE_API_TOKEN:
            return {"token": cls.INVENTREE_API_TOKEN}
        elif cls.INVENTREE_USERNAME and cls.INVENTREE_PASSWORD:
            return {
                "username": cls.INVENTREE_USERNAME,
                "password": cls.INVENTREE_PASSWORD
            }
        else:
            raise ValueError(
                "InvenTree authentication required. "
                "Set INVENTREE_API_TOKEN or INVENTREE_USERNAME/PASSWORD."
            )

    @classmethod
    def validate(cls) -> bool:
        """
        Validate that all required configuration is present.

        Returns:
            True if configuration is valid.

        Raises:
            ValueError: If required configuration is missing.
        """
        errors = []

        if not cls.IMAP_EMAIL:
            errors.append("IMAP_EMAIL is required")

        if not cls.IMAP_PASSWORD:
            errors.append("IMAP_PASSWORD is required")

        if not cls.INVENTREE_API_URL:
            errors.append("INVENTREE_API_URL is required")

        if not cls.INVENTREE_API_TOKEN and not (cls.INVENTREE_USERNAME and cls.INVENTREE_PASSWORD):
            errors.append("INVENTREE_API_TOKEN or INVENTREE_USERNAME/PASSWORD required")

        if errors:
            raise ValueError("Configuration errors: " + "; ".join(errors))

        return True
    
    @classmethod
    def ensure_dirs(cls):
        """Create required directories if they don't exist."""
        cls.DATA_DIR.mkdir(parents=True, exist_ok=True)
