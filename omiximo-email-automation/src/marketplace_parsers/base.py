"""
Base classes for marketplace email parsers.
"""

from dataclasses import dataclass, field
from typing import Optional
from abc import ABC, abstractmethod


@dataclass
class ShippingAddress:
    """Shipping address data."""

    name: str = ""
    street: str = ""
    postal_code: str = ""
    city: str = ""
    country: str = ""

    def __str__(self) -> str:
        parts = [self.name, self.street, f"{self.postal_code} {self.city}", self.country]
        return "\n".join(p for p in parts if p.strip())


@dataclass
class OrderData:
    """Parsed order data from marketplace email."""

    order_number: str = ""
    customer_name: str = ""
    product_description: str = ""
    sku: str = ""
    generated_sku: str = ""  # Universal OMX-XXX-XXX SKU
    price: float = 0.0
    quantity: int = 1
    ram_size_gb: int = 0
    order_date: str = ""
    shipping_address: ShippingAddress = field(default_factory=ShippingAddress)
    raw_email_body: str = ""
    marketplace: str = ""

    def is_valid(self) -> bool:
        """Check if order has minimum required data."""
        # Now valid with either explicit SKU or generated SKU
        return bool(self.order_number and (self.sku or self.generated_sku))
    
    def get_sku(self) -> str:
        """Get the best available SKU (prefer generated)."""
        return self.generated_sku or self.sku


class BaseMarketplaceParser(ABC):
    """Base class for marketplace email parsers."""

    marketplace_name: str = "unknown"

    @abstractmethod
    def can_parse(self, email_data: dict) -> bool:
        """
        Check if this parser can handle the given email.

        Args:
            email_data: Dictionary with email data (from, subject, body).

        Returns:
            True if this parser can handle the email.
        """
        pass

    @abstractmethod
    def parse(self, email_data: dict) -> Optional[OrderData]:
        """
        Parse the email and extract order data.

        Args:
            email_data: Dictionary with email data.

        Returns:
            OrderData object or None if parsing fails.
        """
        pass
