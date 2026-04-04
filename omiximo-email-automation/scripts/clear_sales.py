#!/usr/bin/env python3
"""
Clear all Sales Orders from InvenTree.
Use with caution - this deletes ALL sales history!

Usage:
    python scripts/clear_sales.py           # Dry run (show what would be deleted)
    python scripts/clear_sales.py --confirm # Actually delete
"""

import sys
import argparse
from pathlib import Path

# Add project root to path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from src.inventory import InvenTreeClient


def main():
    parser = argparse.ArgumentParser(description="Clear all Sales Orders")
    parser.add_argument(
        "--confirm",
        action="store_true",
        help="Actually delete (without this flag, only shows what would be deleted)"
    )
    args = parser.parse_args()

    client = InvenTreeClient()
    if not client.authenticate():
        print("❌ Failed to authenticate with InvenTree")
        sys.exit(1)

    # Get all Sales Orders
    data = client._request("GET", "/order/so/", params={"limit": 500})
    
    if not data:
        print("No Sales Orders found.")
        return
    
    orders = data if isinstance(data, list) else data.get("results", [])
    
    if not orders:
        print("✅ No Sales Orders to delete.")
        return
    
    print(f"Found {len(orders)} Sales Order(s):\n")
    
    for so in orders:
        ref = so.get("reference", "?")
        cust_ref = so.get("customer_reference", "")
        total = so.get("total_price", 0)
        status = so.get("status_text", "?")
        print(f"  {ref}: {cust_ref} | €{total:.2f} | {status}")
    
    print()
    
    if not args.confirm:
        print("⚠️  DRY RUN - No changes made")
        print("Run with --confirm to actually delete these Sales Orders")
        return
    
    # Delete each SO
    print("Deleting Sales Orders...")
    deleted = 0
    errors = []
    
    for so in orders:
        pk = so.get("pk")
        ref = so.get("reference", f"SO-{pk}")
        try:
            client._request("DELETE", f"/order/so/{pk}/")
            print(f"  ✅ Deleted {ref}")
            deleted += 1
        except Exception as e:
            print(f"  ❌ Failed to delete {ref}: {e}")
            errors.append(ref)
    
    print()
    print(f"✅ Deleted {deleted} Sales Order(s)")
    if errors:
        print(f"❌ Failed to delete: {', '.join(errors)}")


if __name__ == "__main__":
    main()
