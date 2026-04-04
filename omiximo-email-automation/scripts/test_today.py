#!/usr/bin/env python3
"""
Test script: Process all marketplace emails from today.

This script:
1. Connects to the IMAP inbox
2. Fetches all marketplace emails from today
3. Parses and processes them as sales
4. Shows what would be deducted (dry-run mode available)

Usage:
    python scripts/test_today.py           # Dry run (no changes)
    python scripts/test_today.py --execute # Actually deduct stock
"""

import sys
import os
import argparse
from datetime import datetime, timedelta
from pathlib import Path

# Add project root to path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

# Now import project modules
from src.config import Config
from src.config_loader import get_fixed_elements_config
from src.email_client import IMAPClient
from src.marketplace_parsers import MediaMarktSaturnParser, BolComParser, BoulangerParser
from src.inventory import InvenTreeClient, StockManager
from src.utils.component_extractor import ComponentExtractor
from src.utils.tracking import ProcessedEmailTracker


def main():
    parser = argparse.ArgumentParser(description="Process today's marketplace emails")
    parser.add_argument(
        "--execute",
        action="store_true",
        help="Actually execute stock deductions (default is dry-run)"
    )
    parser.add_argument(
        "--hours",
        type=int,
        default=24,
        help="Look back N hours (default: 24 for today)"
    )
    args = parser.parse_args()

    dry_run = not args.execute
    
    print("=" * 60)
    print("OMIXIMO EMAIL-TO-INVENTORY TEST")
    print("=" * 60)
    print(f"Mode: {'DRY RUN (no changes)' if dry_run else '⚠️  EXECUTING (will deduct stock)'}")
    print(f"Looking back: {args.hours} hours")
    print()

    # Initialize tracker for deduplication
    tracker = ProcessedEmailTracker()
    print(f"Loaded {tracker.get_processed_count()} previously processed emails")

    # Initialize components
    print("\n[1/4] Initializing InvenTree client...")
    inventree = InvenTreeClient()
    if not inventree.authenticate():
        print("❌ Failed to authenticate with InvenTree!")
        sys.exit(1)
    print("✅ InvenTree authenticated")

    print("\n[2/4] Testing email connection...")
    try:
        email_client = IMAPClient()
        email_client.connect()
        email_client.select_inbox()
        print("✅ Email connection successful")
    except Exception as e:
        print(f"❌ Email connection failed: {e}")
        sys.exit(1)

    # Search for today's marketplace emails
    print(f"\n[3/4] Searching for marketplace emails (last {args.hours}h)...")
    
    # Initialize all parsers
    parsers = [
        MediaMarktSaturnParser(),
        BolComParser(),
        BoulangerParser(),
    ]
    component_extractor = ComponentExtractor()
    stock_manager = StockManager(inventree)
    
    # Get emails from marketplace senders
    orders_found = []
    skipped_count = 0
    
    for name, sender in Config.MARKETPLACE_SENDERS.items():
        print(f"\n  Checking: {name} ({sender})")
        
        try:
            # Search for emails from this sender (with date filter)
            email_ids = email_client.search_from_sender(
                sender_email=sender,
                unseen_only=False,  # Get all, including read ones for testing
                since_hours=args.hours  # Apply date filter
            )
            
            print(f"  Found {len(email_ids)} emails")
            
            for email_id in email_ids:
                email_data = email_client.fetch_email(email_id)
                if not email_data:
                    continue
                
                # Get message ID for deduplication
                message_id = email_data.get("message_id", "")
                
                # Check if already processed
                if tracker.is_processed(message_id):
                    skipped_count += 1
                    continue
                
                # Try each parser until one can handle the email
                for parser in parsers:
                    if not parser.can_parse(email_data):
                        continue
                    
                    # Parse the order
                    order = parser.parse(email_data)
                    if order:
                        # Store message_id with order for later tracking
                        order.message_id = message_id
                        orders_found.append(order)
                        print(f"    ✓ Order {order.order_number}: {order.sku} ({parser.marketplace_name})")
                    break  # Stop trying other parsers once one handles it
                    
        except Exception as e:
            print(f"  ⚠️  Error: {e}")

    email_client.disconnect()
    
    if skipped_count > 0:
        print(f"\n  ⏭️  Skipped {skipped_count} already-processed emails")
    
    if not orders_found:
        print("\n" + "=" * 60)
        print("No NEW marketplace orders found in inbox!")
        print("=" * 60)
        return

    # Process orders
    print(f"\n[4/4] Processing {len(orders_found)} orders...")
    print("=" * 60)
    
    total_deductions = []
    
    for order in orders_found:
        print(f"\n📦 ORDER: {order.order_number}")
        print(f"   Customer: {order.customer_name}")
        print(f"   Product: {order.sku}")
        print(f"   Price: €{order.price}")
        print(f"   RAM: {order.ram_size_gb}GB")
        
        # Extract components
        components = component_extractor.extract(
            sku=order.sku,
            description=order.product_description
        )
        
        print(f"\n   Components to deduct:")
        
        deductions = []
        
        # CPU
        if components.cpu:
            part = inventree.get_part_by_sku(components.cpu)
            if part:
                stock = part.get('in_stock', 0)
                deductions.append({
                    'type': 'CPU',
                    'name': components.cpu,
                    'part_id': part['pk'],
                    'qty': order.quantity,
                    'stock': stock
                })
                print(f"     CPU: {components.cpu} (stock: {stock})")
            else:
                print(f"     ❌ CPU: {components.cpu} NOT FOUND")
        
        # GPU
        if components.gpu:
            part = inventree.get_part_by_sku(components.gpu)
            if part:
                stock = part.get('in_stock', 0)
                deductions.append({
                    'type': 'GPU',
                    'name': components.gpu,
                    'part_id': part['pk'],
                    'qty': order.quantity,
                    'stock': stock
                })
                print(f"     GPU: {components.gpu} (stock: {stock})")
            else:
                print(f"     ❌ GPU: {components.gpu} NOT FOUND")
        
        # RAM (special logic - convert to sticks)
        if components.ram_gb > 0:
            ram_config = stock_manager.RAM_CONFIG.get(components.ram_gb, (8, components.ram_gb // 8))
            stick_size, num_sticks = ram_config
            total_sticks = num_sticks * order.quantity
            
            ram_sku = f"{stick_size}GB RAM"
            part = inventree.get_part_by_sku(ram_sku)
            if part:
                stock = part.get('in_stock', 0)
                deductions.append({
                    'type': 'RAM',
                    'name': ram_sku,
                    'part_id': part['pk'],
                    'qty': total_sticks,
                    'stock': stock,
                    'note': f"{components.ram_gb}GB total → {total_sticks}x {stick_size}GB sticks"
                })
                print(f"     RAM: {ram_sku} x{total_sticks} (stock: {stock}) [{components.ram_gb}GB → {num_sticks}x{stick_size}GB]")
            else:
                print(f"     ❌ RAM: {ram_sku} NOT FOUND")
        
        # SSD
        if components.ssd_size:
            part = inventree.get_part_by_sku(components.ssd_size)
            if part:
                stock = part.get('in_stock', 0)
                deductions.append({
                    'type': 'SSD',
                    'name': components.ssd_size,
                    'part_id': part['pk'],
                    'qty': order.quantity,
                    'stock': stock
                })
                print(f"     SSD: {components.ssd_size} (stock: {stock})")
            else:
                print(f"     ❌ SSD: {components.ssd_size} NOT FOUND")
        
        # Fixed Components (Case, PSU, etc.)
        fixed_config = get_fixed_elements_config()
        for fixed_comp in fixed_config.components:
            part = inventree.get_part_by_sku(fixed_comp.sku)
            if part:
                stock = part.get('in_stock', 0)
                qty = fixed_comp.quantity * order.quantity
                deductions.append({
                    'type': 'Fixed',
                    'name': fixed_comp.part_name,
                    'part_id': part['pk'],
                    'qty': qty,
                    'stock': stock
                })
                print(f"     Fixed: {fixed_comp.part_name} x{qty} (stock: {stock})")
            else:
                print(f"     ❌ Fixed: {fixed_comp.part_name} NOT FOUND")
        
        total_deductions.append({
            'order': order.order_number,
            'deductions': deductions
        })
        
        # Execute if not dry run
        if not dry_run and deductions:
            print(f"\n   ⚡ Executing deductions...")
            results = stock_manager.process_order(order)
            all_success = True
            errors = []
            for r in results:
                if r.success:
                    print(f"      ✅ {r.sku}: -{r.quantity_deducted}")
                else:
                    print(f"      ❌ {r.sku}: {r.error}")
                    all_success = False
                    errors.append(r.error)
            
            # Mark as processed
            tracker.mark_processed(
                message_id=getattr(order, 'message_id', ''),
                order_number=order.order_number,
                sku=order.sku,
                success=all_success,
                error="; ".join(errors) if errors else ""
            )

    # Summary
    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    print(f"Orders found: {len(orders_found)}")
    print(f"Skipped (already processed): {skipped_count}")
    
    if dry_run:
        print("\n⚠️  DRY RUN - No changes were made")
        print("Run with --execute to actually deduct stock")
    else:
        print("\n✅ Stock deductions executed!")
    
    # Show what would be deducted
    print("\nTotal deductions (per part):")
    part_totals = {}
    for order_data in total_deductions:
        for d in order_data['deductions']:
            key = d['name']
            if key not in part_totals:
                part_totals[key] = {'qty': 0, 'stock': d['stock']}
            part_totals[key]['qty'] += d['qty']
    
    for name, data in part_totals.items():
        remaining = data['stock'] - data['qty']
        status = "✅" if remaining >= 0 else "⚠️ INSUFFICIENT"
        print(f"  {name}: -{data['qty']} (was: {data['stock']}, after: {remaining}) {status}")


if __name__ == "__main__":
    main()
