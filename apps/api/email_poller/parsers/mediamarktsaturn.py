"""
MediaMarktSaturn Marketplace email parser.
Parses sale confirmation emails from mediaworld.it Marketplace.
"""

import re
import logging
from typing import Optional

from .base import BaseMarketplaceParser, OrderData, ShippingAddress
from email_poller.utils.sku_generator import get_sku_generator

logger = logging.getLogger(__name__)


class MediaMarktSaturnParser(BaseMarketplaceParser):
    """Parser for MediaMarktSaturn marketplace emails."""

    marketplace_name = "MediaMarktSaturn"
    sender_pattern = re.compile(
        r"noreply@mmsmarketplace\.mediamarktsaturn\.com", re.IGNORECASE
    )

    def can_parse(self, email_data: dict) -> bool:
        """Check if email is from MediaMarktSaturn marketplace."""
        from_addr = email_data.get("from", "")
        subject = email_data.get("subject", "")

        # Check sender
        if not self.sender_pattern.search(from_addr):
            return False

        # Check for order-related subject patterns
        # e.g., "Bestelling 02116_296531828-A zal worden verzonden"
        # or payment confirmation emails
        if "Bestelling" in subject:
            return True

        return False

    def parse(self, email_data: dict) -> Optional[OrderData]:
        """
        Parse MediaMarktSaturn order email.

        Expected email format (Dutch):
        - Bestelnummer: 02116_296531828-A
        - Naam koper: Federico Italiano
        - Besteldatum: 14-01-2026
        - Beschrijving: OMIXIMO DESKTOP OMIXIMO PC Gaming...
        - Prijs: EUR 899,00
        - Aantal: 1
        - Interne referentie: OMX-GHANA-2026-R7-5700X-RTX5050-16G-1T
        - Shipping address block
        """
        body = email_data.get("body", "")
        subject = email_data.get("subject", "")

        order = OrderData(
            marketplace=self.marketplace_name,
            raw_email_body=body,
        )

        # Extract order number from subject first
        order_match = re.search(
            r"Bestelling\s+([A-Z0-9_-]+)", subject, re.IGNORECASE
        )
        if order_match:
            order.order_number = order_match.group(1)

        # Also try from body
        if not order.order_number:
            order_match = re.search(
                r"Bestelnummer:\s*([A-Z0-9_-]+)", body, re.IGNORECASE
            )
            if order_match:
                order.order_number = order_match.group(1)

        # Customer name
        name_match = re.search(r"Naam koper:\s*(.+?)(?:\n|$)", body)
        if name_match:
            order.customer_name = name_match.group(1).strip()

        # Order date
        date_match = re.search(r"Besteldatum:\s*(\d{2}-\d{2}-\d{4})", body)
        if date_match:
            order.order_date = date_match.group(1)

        # Product description - handle both plain text and HTML format
        # HTML format: <b>Beschrijving</b>: ...
        desc_match = re.search(
            r"(?:<b>)?Beschrijving(?:</b>)?[:\s]+(.+?)(?=(?:</?div>|Artikel status:|<b>Artikel|Prijs:|<b>Prijs|$))",
            body,
            re.DOTALL | re.IGNORECASE,
        )
        if desc_match:
            desc = desc_match.group(1).strip()
            # Clean up HTML tags, newlines and extra whitespace
            desc = re.sub(r"<[^>]+>", "", desc)
            order.product_description = " ".join(desc.split())

        # Price - Dutch format (EUR X.XXX,XX or EUR XXX,XX)
        # Handle HTML format: <b>Prijs</b>: €\xa0349,00 (with non-breaking space)
        price_match = re.search(
            r"(?:<b>)?Prijs(?:</b>)?[:\s]*(?:EUR|€)[\s\xa0]*([\d.,]+)",
            body,
            re.IGNORECASE
        )
        if price_match:
            price_str = price_match.group(1)
            # Dutch format: 1.234,56 -> 1234.56
            price_str = price_str.replace(".", "").replace(",", ".")
            try:
                order.price = float(price_str)
            except ValueError:
                logger.warning(f"Could not parse price: {price_match.group(1)}")

        # Quantity - handle HTML format
        qty_match = re.search(r"(?:<b>)?Aantal(?:</b>)?[:\s]*(\d+)", body)
        if qty_match:
            order.quantity = int(qty_match.group(1))

        # SKU (Interne referentie) - handle both plain text and HTML format
        sku_match = re.search(r"(?:<b>)?Interne referentie(?:</b>)?[:\s]*([A-Za-z0-9_-]+)", body)
        if sku_match:
            order.sku = sku_match.group(1).strip()

        # RAM size from description - try multiple patterns
        # Pattern 1: "16 GB" in description
        ram_match = re.search(r"[-\u2013]\s*(\d+)\s*GB\s*[-\u2013]", order.product_description, re.IGNORECASE)
        if not ram_match:
            # Pattern 2: just "XX GB"
            ram_match = re.search(r"(\d+)\s*GB", order.product_description, re.IGNORECASE)
        if ram_match:
            order.ram_size_gb = int(ram_match.group(1))

        # Shipping address
        order.shipping_address = self._parse_shipping_address(body)

        # Generate universal SKU
        sku_gen = get_sku_generator()
        order.generated_sku = sku_gen.generate_sku(
            marketplace=self.marketplace_name,
            description=order.product_description,
            order_number=order.order_number
        )

        # Validate
        if not order.is_valid():
            logger.warning(f"Incomplete order data extracted: {order}")
            return None

        logger.info(
            f"Parsed order {order.order_number}: SKU={order.generated_sku}, "
            f"RAM={order.ram_size_gb}GB, Price=EUR{order.price}"
        )
        return order

    def _parse_shipping_address(self, body: str) -> ShippingAddress:
        """
        Parse shipping address from email body.

        Expected format:
        Het verzendadres:
        M Federico Italiano
        Via Rio Rosso 184
        98057 Milazzo
        ITALY
        """
        address = ShippingAddress()

        # Find address block
        addr_match = re.search(
            r"(?:verzendadres|shipping address):\s*\n(.+?)(?:\n\n|\Z)",
            body,
            re.IGNORECASE | re.DOTALL,
        )

        if not addr_match:
            return address

        addr_block = addr_match.group(1).strip()
        lines = [line.strip() for line in addr_block.split("\n") if line.strip()]

        if len(lines) >= 1:
            address.name = lines[0]

        if len(lines) >= 2:
            address.street = lines[1]

        if len(lines) >= 3:
            # Try to extract postal code and city
            postal_city = lines[2]
            postal_match = re.match(r"^(\d{4,6})\s+(.+)$", postal_city)
            if postal_match:
                address.postal_code = postal_match.group(1)
                address.city = postal_match.group(2)
            else:
                address.city = postal_city

        if len(lines) >= 4:
            address.country = lines[3]

        return address
