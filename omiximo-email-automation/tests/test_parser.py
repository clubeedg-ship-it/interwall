#!/usr/bin/env python3
"""
Test script for MediaMarktSaturn email parser.
"""

import sys
from pathlib import Path

# Ensure imports work regardless of how the test is run
project_root = Path(__file__).parent.parent
if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))
if str(project_root / "src") not in sys.path:
    sys.path.insert(0, str(project_root / "src"))

from src.marketplace_parsers.mediamarktsaturn import MediaMarktSaturnParser

# Sample email data matching the format from the requirements
SAMPLE_EMAIL = {
    "from": "mediaworld.it Marketplace <noreply@mmsmarketplace.mediamarktsaturn.com>",
    "subject": "Bestelling 02116_296531828-A zal worden verzonden",
    "body": """
Hallo Omiximo B.V. IT,

De betaling van de koper voor de bestelling 02116_296531828-A is succesvol ontvangen.

Besteloverzicht:
Bestelnummer: 02116_296531828-A
Naam koper: Federico Italiano
Besteldatum: 14-01-2026
Beschrijving: OMIXIMO DESKTOP OMIXIMO PC Gaming AMD Ryzen 7 5700X
GeForce RTX 5050 16GB DDR4 SSD 1TB Windows 11 Pro, AMD Ryzen 7 5700X,
GeForce RTX™ 5050, RAM 16 GB, 1 TB SSD
Artikel status: Nieuw
Prijs: € 899,00
Aantal: 1
Interne referentie: OMX-GHANA-2026-R7-5700X-RTX5050-16G-1T

Het verzendadres:
M Federico Italiano
Via Rio Rosso 184
98057 Milazzo
ITALY
""",
    "message_id": "<test-123@example.com>",
}


def test_parser():
    """Test the MediaMarktSaturn parser."""
    parser = MediaMarktSaturnParser()

    # Test can_parse
    print("Testing can_parse...")
    assert parser.can_parse(SAMPLE_EMAIL), "Parser should recognize this email"
    print("  PASS: can_parse returned True")

    # Test parse
    print("\nTesting parse...")
    order = parser.parse(SAMPLE_EMAIL)

    assert order is not None, "Parser should return an order"
    print(f"  Order Number: {order.order_number}")
    print(f"  Customer: {order.customer_name}")
    print(f"  SKU: {order.sku}")
    print(f"  Price: EUR {order.price}")
    print(f"  Quantity: {order.quantity}")
    print(f"  RAM: {order.ram_size_gb} GB")
    print(f"  Order Date: {order.order_date}")
    print(f"  Shipping Address:")
    print(f"    {order.shipping_address}")

    # Assertions
    assert order.order_number == "02116_296531828-A", f"Order number mismatch: {order.order_number}"
    assert order.customer_name == "Federico Italiano", f"Customer name mismatch: {order.customer_name}"
    assert order.sku == "OMX-GHANA-2026-R7-5700X-RTX5050-16G-1T", f"SKU mismatch: {order.sku}"
    assert order.price == 899.00, f"Price mismatch: {order.price}"
    assert order.quantity == 1, f"Quantity mismatch: {order.quantity}"
    assert order.ram_size_gb == 16, f"RAM size mismatch: {order.ram_size_gb}"
    assert order.order_date == "14-01-2026", f"Order date mismatch: {order.order_date}"

    print("\n  ALL ASSERTIONS PASSED!")

    # Test RAM deduction logic
    print("\nTesting RAM deduction logic...")
    from src.inventory.stock_manager import StockManager

    # Test RAM configuration mapping
    ram_config = StockManager.RAM_CONFIG

    test_cases = [
        (16, 8, 2, "16GB -> 2x 8GB sticks"),
        (32, 16, 2, "32GB -> 2x 16GB sticks"),
        (64, 16, 4, "64GB -> 4x 16GB sticks"),
    ]

    for total_gb, expected_stick_size, expected_count, description in test_cases:
        stick_size, count = ram_config.get(total_gb, (8, 1))
        print(f"  {description}: stick_size={stick_size}GB, count={count}")
        assert stick_size == expected_stick_size, f"Stick size mismatch for {total_gb}GB"
        assert count == expected_count, f"Count mismatch for {total_gb}GB"

    print("\n  ALL RAM TESTS PASSED!")

    return True


if __name__ == "__main__":
    print("=" * 50)
    print("MediaMarktSaturn Parser Test")
    print("=" * 50)
    print()

    try:
        success = test_parser()
        print("\n" + "=" * 50)
        print("ALL TESTS PASSED!" if success else "TESTS FAILED!")
        print("=" * 50)
        sys.exit(0 if success else 1)
    except Exception as e:
        print(f"\nTEST FAILED with error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
