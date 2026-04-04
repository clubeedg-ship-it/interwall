#!/usr/bin/env python3
"""
Retrieve and display sales from the last 24 hours.

Usage:
    python scripts/last_day_sales.py           # Last 24 hours
    python scripts/last_day_sales.py --hours 48  # Last 48 hours
    python scripts/last_day_sales.py --json    # Output as JSON
"""

import sys
import argparse
import json
from datetime import datetime, timedelta
from pathlib import Path

# Add project root to path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from src.config import Config
from src.inventory import InvenTreeClient


def get_sales_orders(client: InvenTreeClient, hours: int = 24) -> list:
    """Fetch sales orders from the last N hours."""
    # Calculate date filter
    since_date = datetime.now() - timedelta(hours=hours)
    date_str = since_date.strftime("%Y-%m-%d")
    
    # Get all sales orders
    data = client._request(
        "GET",
        "/order/so/",
        params={
            "limit": 500,
        }
    )
    
    if not data:
        return []
    
    results = data if isinstance(data, list) else data.get("results", [])
    
    # Filter by creation date
    filtered = []
    for so in results:
        created = so.get("creation_date", "")
        if created >= date_str:
            filtered.append(so)
    
    return filtered


def get_line_items(client: InvenTreeClient, order_id: int) -> list:
    """Get line items for a sales order."""
    data = client._request(
        "GET",
        "/order/so-line/",
        params={"order": order_id, "limit": 100}
    )
    
    if not data:
        return []
    
    return data if isinstance(data, list) else data.get("results", [])


def get_part_name(client: InvenTreeClient, part_id: int) -> str:
    """Get part name by ID."""
    data = client._request("GET", f"/part/{part_id}/")
    if data:
        return data.get("name", f"Part #{part_id}")
    return f"Part #{part_id}"


def main():
    parser = argparse.ArgumentParser(description="Get sales from last day")
    parser.add_argument(
        "--hours",
        type=int,
        default=24,
        help="Look back N hours (default: 24)"
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Output as JSON"
    )
    args = parser.parse_args()

    # Initialize client
    client = InvenTreeClient()
    if not client.authenticate():
        print("❌ Failed to authenticate with InvenTree!", file=sys.stderr)
        sys.exit(1)

    # Get sales orders
    sales_orders = get_sales_orders(client, args.hours)
    
    if args.json:
        # JSON output
        output = []
        for so in sales_orders:
            items = get_line_items(client, so["pk"])
            output.append({
                "reference": so.get("reference"),
                "customer_reference": so.get("customer_reference"),
                "status": so.get("status_text"),
                "created": so.get("creation_date"),
                "total_price": so.get("total_price"),
                "line_items": [
                    {
                        "part_id": item.get("part"),
                        "quantity": item.get("quantity"),
                        "price": item.get("sale_price"),
                    }
                    for item in items
                ]
            })
        print(json.dumps(output, indent=2))
        return

    # Human-readable output
    print("=" * 60)
    print(f"SALES ORDERS - Last {args.hours} hours")
    print("=" * 60)
    
    if not sales_orders:
        print("\nNo sales orders found.")
        return
    
    print(f"\nFound {len(sales_orders)} sales order(s):\n")
    
    total_revenue = 0
    
    for so in sales_orders:
        ref = so.get("reference", "?")
        cust_ref = so.get("customer_reference", "")
        status = so.get("status_text", "?")
        created = so.get("creation_date", "?")
        price = so.get("total_price", 0) or 0
        
        print(f"📦 {ref}")
        print(f"   Marketplace Order: {cust_ref}")
        print(f"   Status: {status}")
        print(f"   Created: {created}")
        print(f"   Total: €{price:.2f}")
        
        # Get line items
        items = get_line_items(client, so["pk"])
        if items:
            print(f"   Items:")
            for item in items:
                part_id = item.get("part")
                qty = item.get("quantity", 0)
                item_price = item.get("sale_price", 0) or 0
                notes = item.get("notes", "")
                
                # Get part name (cached would be better but keeping it simple)
                part_name = get_part_name(client, part_id) if part_id else "Unknown"
                
                print(f"     - {qty}x {part_name}", end="")
                if item_price:
                    print(f" @ €{item_price:.2f}", end="")
                if notes:
                    print(f" ({notes})", end="")
                print()
        
        total_revenue += price
        print()
    
    print("-" * 60)
    print(f"Total Orders: {len(sales_orders)}")
    print(f"Total Revenue: €{total_revenue:.2f}")
    print("=" * 60)


if __name__ == "__main__":
    main()
