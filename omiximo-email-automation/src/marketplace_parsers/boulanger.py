"""
Boulanger Marketplace email parser.
Parses sale confirmation emails from Boulanger (French electronics retailer).
Uses Mirakl platform - similar format to MediaMarktSaturn.
"""

import re
import html
import logging
from typing import Optional

from .base import BaseMarketplaceParser, OrderData, ShippingAddress
from ..utils.sku_generator import get_sku_generator

logger = logging.getLogger(__name__)


class BoulangerParser(BaseMarketplaceParser):
    """Parser for Boulanger marketplace emails."""

    marketplace_name = "Boulanger"
    sender_pattern = re.compile(r"marketplace\.boulanger@boulanger\.com", re.IGNORECASE)

    def can_parse(self, email_data: dict) -> bool:
        """Check if email is from Boulanger marketplace."""
        from_addr = email_data.get("from", "")
        subject = email_data.get("subject", "")

        # Check sender
        if not self.sender_pattern.search(from_addr):
            return False

        # Only parse actual order notifications (not messages about orders)
        # Valid patterns:
        # - "Commande n°F905MS48553-A à expédier" (order ready to ship)
        # - "Nouvelle commande n°XXX" (new order)
        # Invalid patterns (should NOT parse):
        # - "Vous avez reçu un message à propos de la commande" (message about order)
        # - "Vous avez une ou plusieurs commandes à confirmer" (orders to confirm)
        
        # Exclude message notifications
        if "message à propos" in subject.lower():
            return False
        if "message about" in subject.lower():
            return False
        
        # Must have order number format: "Commande n°XXX"
        if re.search(r"[Cc]ommande\s*n[°º]?\s*[A-Z0-9]+-[A-Z]", subject):
            return True

        return False

    def parse(self, email_data: dict) -> Optional[OrderData]:
        """
        Parse Boulanger order email.

        Expected email format (French):
        - Subject: Commande n°F905MS48553-A à expédier
        - Body contains:
          - Référence de la commande: F905MS48553-A
          - Date de commande: 26-01-2026
          - Article: product name
          - Prix: €599,00
          - Quantité: 1
          - Référence interne: SKU
          - Shipping address block
        """
        # Decode HTML entities
        raw_body = email_data.get("body", "")
        body = html.unescape(raw_body)
        body_text = re.sub(r"<[^>]+>", " ", body)
        body_text = " ".join(body_text.split())
        
        subject = email_data.get("subject", "")

        order = OrderData(
            marketplace=self.marketplace_name,
            raw_email_body=body,
        )

        # Extract order number from subject
        # Format: "Commande n°F905MS48553-A à expédier"
        order_match = re.search(
            r"[Cc]ommande\s*n[°º]?\s*([A-Z0-9_-]+)", subject, re.IGNORECASE
        )
        if order_match:
            order.order_number = order_match.group(1)

        # Also try from body
        if not order.order_number:
            order_match = re.search(
                r"[Rr]éférence.*?commande[:\s]*([A-Z0-9_-]+)", body_text, re.IGNORECASE
            )
            if order_match:
                order.order_number = order_match.group(1)

        # Customer name - look for "Nom client" or "Nom acheteur" pattern
        # Format: "Nom client : CARINE TOURRAINE"
        name_match = re.search(
            r"Nom\s*(?:client|acheteur)?[:\s]+([A-Z][A-Za-zÀ-ÿ\s-]+?)(?=\s*Date|\s*Nom\s*de)",
            body_text,
            re.IGNORECASE
        )
        if name_match:
            order.customer_name = name_match.group(1).strip()

        # Order date (French format: DD-MM-YYYY or DD/MM/YYYY)
        # Pattern: "Date de la commande : 26-01-2026"
        date_match = re.search(
            r"Date\s*(?:de\s*la\s*)?commande[:\s]*(\d{2}[-/]\d{2}[-/]\d{4})",
            body_text,
            re.IGNORECASE
        )
        if date_match:
            order.order_date = date_match.group(1)

        # Product description / Article name
        # Pattern: "Nom de l'article : B21"
        desc_match = re.search(
            r"Nom\s*de\s*l['\u2019]article[:\s]+(.+?)(?=\s*Etat|\s*État|\s*Condition|$)",
            body_text,
            re.IGNORECASE
        )
        if desc_match:
            order.product_description = desc_match.group(1).strip()[:200]

        # Price - French format
        # Pattern: "Prix de l'article : € 599,00"
        price_match = re.search(
            r"Prix\s*(?:de\s*l['\u2019]article)?[:\s]*€?\s*([\d\s.,]+)\s*€?",
            body_text,
            re.IGNORECASE
        )
        if price_match:
            price_str = price_match.group(1).strip()
            # Remove spaces, convert French format: 1 234,56 -> 1234.56
            price_str = price_str.replace(" ", "").replace(",", ".")
            # Handle case where there might be trailing dots
            price_str = price_str.rstrip(".")
            try:
                order.price = float(price_str)
            except ValueError:
                logger.warning(f"Could not parse price: {price_match.group(1)}")

        # Quantity
        # Pattern: "Quantité : 1"
        qty_match = re.search(
            r"Quantité[:\s]*(\d+)",
            body_text,
            re.IGNORECASE
        )
        if qty_match:
            order.quantity = int(qty_match.group(1))
        else:
            order.quantity = 1

        # SKU / Internal reference
        # Pattern: "Référence interne : 151382860"
        sku_match = re.search(
            r"Référence\s*interne[:\s]*([A-Za-z0-9_-]+)",
            body_text,
            re.IGNORECASE
        )
        if sku_match:
            order.sku = sku_match.group(1).strip()

        # If no SKU found, try to generate from product description
        if not order.sku and order.product_description:
            order.sku = self._generate_sku_from_description(order.product_description)

        # RAM size from description
        if order.product_description:
            ram_match = re.search(r"(\d+)\s*GB", order.product_description, re.IGNORECASE)
            if ram_match:
                order.ram_size_gb = int(ram_match.group(1))

        # Shipping address
        order.shipping_address = self._parse_shipping_address(body_text)

        # Validate
        if not order.order_number:
            logger.warning("No order number found in Boulanger email")
            return None

        # Generate universal SKU
        sku_gen = get_sku_generator()
        order.generated_sku = sku_gen.generate_sku(
            marketplace=self.marketplace_name,
            description=order.product_description,
            order_number=order.order_number
        )

        logger.info(
            f"Parsed Boulanger order {order.order_number}: SKU={order.generated_sku}, "
            f"Price=EUR{order.price}"
        )
        return order

    def _parse_shipping_address(self, body: str) -> ShippingAddress:
        """Parse shipping address from email body (French format)."""
        address = ShippingAddress()

        # Look for address block
        # French: "Adresse de livraison" or "Adresse d'expédition"
        addr_match = re.search(
            r"(?:Adresse\s*(?:de\s*)?(?:livraison|expédition)|Shipping\s*address)[:\s]*(.+?)(?=(?:Mode|Méthode|Transporteur|$))",
            body,
            re.IGNORECASE | re.DOTALL
        )

        if not addr_match:
            return address

        addr_block = addr_match.group(1).strip()
        lines = [line.strip() for line in addr_block.split("\n") if line.strip()]

        if len(lines) >= 1:
            # First line often has title + name (MME CARINE TOURRAINE)
            name_line = lines[0]
            # Remove title prefixes
            name_line = re.sub(r"^(M\.|MR|MME|MLLE|Mme|Mr)\s*", "", name_line, flags=re.IGNORECASE)
            address.name = name_line.strip()

        if len(lines) >= 2:
            address.street = lines[1]

        if len(lines) >= 3:
            # Try to extract postal code and city
            postal_city = lines[2]
            # French format: 31390 CARBONNE
            postal_match = re.match(r"^(\d{5})\s+(.+)$", postal_city)
            if postal_match:
                address.postal_code = postal_match.group(1)
                address.city = postal_match.group(2)
            else:
                address.city = postal_city

        if len(lines) >= 4:
            address.country = lines[3]

        return address

    def _generate_sku_from_description(self, description: str) -> str:
        """Generate SKU identifier from product description."""
        if not description:
            return ""

        parts = []

        # CPU patterns
        cpu_match = re.search(r"(?:Ryzen|Intel|i)\s*(\d)[- ]?(\d{4}[A-Z]*)", description, re.IGNORECASE)
        if cpu_match:
            parts.append(f"R{cpu_match.group(1)}-{cpu_match.group(2)}")

        # GPU patterns
        gpu_match = re.search(r"(RTX|GTX|RX)\s*(\d{4})", description, re.IGNORECASE)
        if gpu_match:
            parts.append(f"{gpu_match.group(1).upper()}{gpu_match.group(2)}")

        # RAM
        ram_match = re.search(r"(\d+)\s*GB", description, re.IGNORECASE)
        if ram_match:
            parts.append(f"{ram_match.group(1)}G")

        # Storage
        storage_match = re.search(r"(\d+)\s*TB", description, re.IGNORECASE)
        if storage_match:
            parts.append(f"{storage_match.group(1)}T")

        if parts:
            return "OMX-" + "-".join(parts)

        return ""
