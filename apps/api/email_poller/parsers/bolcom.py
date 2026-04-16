"""
Bol.com Marketplace email parser.
Parses sale confirmation emails from bol.com (Dutch marketplace).
"""

import html
import logging
import re
from typing import Optional

from .base import BaseMarketplaceParser, OrderData, ShippingAddress
from email_poller.utils.sku_generator import get_sku_generator

logger = logging.getLogger(__name__)


class BolComParser(BaseMarketplaceParser):
    """Parser for bol.com marketplace emails."""

    marketplace_name = "BolCom"
    sender_pattern = re.compile(r"automail@bol\.com", re.IGNORECASE)
    sale_subject_pattern = re.compile(r"^\s*Nieuwe bestelling:", re.IGNORECASE)
    order_ref_pattern = re.compile(
        r"\s*\(bestelnummer[:\s]+[A-Z0-9-]+\)\s*$", re.IGNORECASE
    )

    def can_parse(self, email_data: dict) -> bool:
        """Check if email is from bol.com marketplace."""
        from_addr = email_data.get("from", "")
        subject = email_data.get("subject", "")

        # Check sender
        if not self.sender_pattern.search(from_addr):
            return False

        # Only treat actual new-order mail as sale input.
        # Return/cancellation mails must not enter sale routing.
        return bool(self.sale_subject_pattern.search(subject))

    def parse(self, email_data: dict) -> Optional[OrderData]:
        """
        Parse bol.com order email.

        Expected email format (Dutch):
        - Subject: Nieuwe bestelling: Gaming PC Ryzen 7-5700X... (bestelnummer: A000E71TN6)
        - Body contains:
          - Product name/description
          - EUR 999,00 (price)
          - Quantity
          - Expected delivery date: 29 januari 2026
        """
        # Decode HTML entities in body (bol.com uses &euro;, &nbsp;, etc.)
        raw_body = email_data.get("body", "")
        body = html.unescape(raw_body)

        # Also strip HTML tags for text extraction
        body_text = re.sub(r"<[^>]+>", " ", body)
        body_text = " ".join(body_text.split())  # Normalize whitespace

        subject = email_data.get("subject", "")

        order = OrderData(
            marketplace=self.marketplace_name,
            raw_email_body=body,
        )

        # Extract order number from subject (bestelnummer: XXXXXX)
        order_match = re.search(
            r"bestelnummer[:\s]+([A-Z0-9]+)", subject, re.IGNORECASE
        )
        if order_match:
            order.order_number = order_match.group(1)

        # Also try from body
        if not order.order_number:
            order_match = re.search(
                r"bestelnummer[:\s]+([A-Z0-9]+)", body, re.IGNORECASE
            )
            if order_match:
                order.order_number = order_match.group(1)

        # Extract product description from the HTML <title> first because the
        # visible subject is often truncated with ellipses.
        title_match = re.search(r"<title>(.*?)</title>", raw_body, re.IGNORECASE | re.DOTALL)
        if title_match:
            title_text = " ".join(html.unescape(title_match.group(1)).split())
            if self.sale_subject_pattern.search(title_text):
                title_text = self.sale_subject_pattern.sub("", title_text, count=1)
            title_text = self.order_ref_pattern.sub("", title_text).strip()
            if title_text:
                order.product_description = title_text

        # Fallback to the subject line when no usable title is present.
        desc_match = re.search(
            r"bestelling[:\s]+(.+?)\s*\(bestelnummer", subject, re.IGNORECASE
        )
        if desc_match:
            subject_desc = desc_match.group(1).strip()
            if subject_desc and "..." not in subject_desc and not order.product_description:
                order.product_description = subject_desc

        # Also check body for product description
        if not order.product_description:
            # Look for product name patterns in body
            body_desc_match = re.search(
                r"(?:product|artikel)[:\s]+(.+?)(?:\n|EUR)", body, re.IGNORECASE
            )
            if body_desc_match:
                order.product_description = " ".join(body_desc_match.group(1).split()).strip()

        # Price - Dutch format (EUR XXX,XX or EUR X.XXX,XX)
        # Body is already decoded from HTML entities
        price_match = re.search(
            r"(?:EUR)[\s\xa0]*([\d.,]+)", body_text, re.IGNORECASE
        )
        if price_match:
            price_str = price_match.group(1)
            # Dutch format: 1.234,56 -> 1234.56
            price_str = price_str.replace(".", "").replace(",", ".")
            try:
                order.price = float(price_str)
            except ValueError:
                logger.warning(f"Could not parse price: {price_match.group(1)}")

        # If no price in body, try subject
        if order.price == 0:
            price_match = re.search(r"[\s\xa0]*([\d.,]+)", subject)
            if price_match:
                price_str = price_match.group(1).replace(".", "").replace(",", ".")
                try:
                    order.price = float(price_str)
                except ValueError:
                    pass

        # Quantity - default to 1 if not found
        qty_match = re.search(r"(?:aantal|quantity)[:\s]*(\d+)", body, re.IGNORECASE)
        if qty_match:
            order.quantity = int(qty_match.group(1))
        else:
            order.quantity = 1

        # Extract SKU from product description
        # Look for patterns like OMX-..., or extract from product name
        order.sku = self._extract_sku_from_description(order.product_description)

        # RAM size from description
        ram_match = re.search(r"(\d+)\s*GB", order.product_description, re.IGNORECASE)
        if ram_match:
            order.ram_size_gb = int(ram_match.group(1))

        # Order date
        date_match = re.search(
            r"(\d{1,2})\s+(januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december)\s+(\d{4})",
            body,
            re.IGNORECASE
        )
        if date_match:
            day = date_match.group(1)
            month_name = date_match.group(2).lower()
            year = date_match.group(3)
            months = {
                "januari": "01", "februari": "02", "maart": "03", "april": "04",
                "mei": "05", "juni": "06", "juli": "07", "augustus": "08",
                "september": "09", "oktober": "10", "november": "11", "december": "12"
            }
            month = months.get(month_name, "01")
            order.order_date = f"{day.zfill(2)}-{month}-{year}"

        # Validate
        if not order.order_number:
            logger.warning("No order number found in bol.com email")
            return None

        # Generate universal SKU
        sku_gen = get_sku_generator()
        order.generated_sku = sku_gen.generate_sku(
            marketplace=self.marketplace_name,
            description=order.product_description,
            order_number=order.order_number
        )

        # Also extract legacy SKU if present (for backwards compatibility)
        if not order.sku:
            order.sku = self._extract_sku_from_description(order.product_description)

        logger.info(
            f"Parsed bol.com order {order.order_number}: SKU={order.generated_sku}, "
            f"RAM={order.ram_size_gb}GB, Price=EUR{order.price}"
        )
        return order

    def _extract_sku_from_description(self, description: str) -> str:
        """
        Try to extract SKU from product description.

        Looks for patterns like:
        - OMX-XXXX-XXXX
        - Explicit SKU/artikelnummer mentions
        """
        if not description:
            return ""

        # Look for OMX-style SKU
        sku_match = re.search(r"(OMX[-\w]+)", description, re.IGNORECASE)
        if sku_match:
            return sku_match.group(1)

        # Look for explicit SKU mention
        sku_match = re.search(r"(?:SKU|artikelnummer)[:\s]+([A-Za-z0-9_-]+)", description, re.IGNORECASE)
        if sku_match:
            return sku_match.group(1)

        return ""

    def _generate_sku_from_description(self, description: str) -> str:
        """
        Generate a SKU identifier from product description.

        Extracts key specs to create a matchable identifier:
        - CPU: Ryzen 7-5700X -> R7-5700X
        - GPU: RTX 5060 -> RTX5060
        - RAM: 16GB -> 16G
        - Storage: 1TB -> 1T
        """
        if not description:
            return ""

        parts = []

        # CPU
        cpu_match = re.search(r"(?:Ryzen|Intel|i)\s*(\d)[- ]?(\d{4}[A-Z]*)", description, re.IGNORECASE)
        if cpu_match:
            parts.append(f"R{cpu_match.group(1)}-{cpu_match.group(2)}")

        # GPU
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
