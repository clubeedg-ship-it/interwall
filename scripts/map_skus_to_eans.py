#!/usr/bin/env python3
"""
Map marketplace SKUs to GS1 EANs by matching specs from email descriptions.
Reads failed emails from DB, parses their descriptions, and finds matching EAN.
Outputs SQL to add sku aliases to the products table.

Usage: python3 scripts/map_skus_to_eans.py
"""
import re
import subprocess
import json


def parse_email_specs(description):
    """Parse specs from a marketplace email description.
    Returns dict with cpu, ram_gb, ssd_gb, gpu or None."""
    if not description:
        return None
    d = description.lower().strip()

    specs = {}

    # CPU
    if re.search(r'ryzen.{0,3}7', d):
        specs['cpu'] = 'r7'
    elif re.search(r'ryzen.{0,3}5', d):
        specs['cpu'] = 'r5'
    elif re.search(r'ryzen.{0,3}3', d):
        specs['cpu'] = 'r3'
    else:
        return None

    # RAM
    m = re.search(r'(\d+)\s*g[bo]?\b', d)
    if m:
        ram = int(m.group(1))
        if ram in (8, 16, 32, 64):
            specs['ram'] = ram

    # SSD — look for storage after RAM
    # Match patterns like "512 GB", "1000 GB", "1 TB", "256 GB"
    ssd_matches = re.findall(r'(\d+)\s*(gb|go|tb)', d)
    for val_s, unit in ssd_matches:
        val = int(val_s)
        if unit == 'tb':
            specs['ssd'] = val * 1000
        elif val >= 100:  # 256, 512, 1000, 2000 — definitely storage, not RAM
            specs['ssd'] = val

    # GPU
    if re.search(r'rtx.{0,3}5070\s*ti', d):
        specs['gpu'] = 'rtx5070t'
    elif re.search(r'rtx.{0,3}5070', d):
        specs['gpu'] = 'rtx5070'
    elif re.search(r'rtx.{0,3}5060\s*ti', d):
        specs['gpu'] = 'rtx5060ti'
    elif re.search(r'rtx.{0,3}5060', d):
        specs['gpu'] = 'rtx5060'
    elif re.search(r'rtx.{0,3}5050', d):
        specs['gpu'] = 'rtx5050'
    elif re.search(r'rtx.{0,3}4060', d):
        specs['gpu'] = 'rtx4060'
    elif re.search(r'rtx.{0,3}3060', d):
        specs['gpu'] = 'rtx3060'
    elif re.search(r'rtx.{0,3}3050', d):
        specs['gpu'] = 'rtx3050'
    elif re.search(r'geforce', d):
        specs['gpu'] = 'unknown_geforce'
    # Radeon Vega = integrated, no discrete GPU

    return specs


def parse_ean_name(name):
    """Parse specs from a GS1 product name in the DB.
    Returns same format as parse_email_specs."""
    d = name.lower().strip()
    d = re.sub(r'\(setup\)$', '', d).strip()
    d = re.sub(r'-setup$', '', d).strip()

    specs = {}

    # CPU
    if re.search(r'ryzen.{0,3}7.{0,3}5700x', d):
        specs['cpu'] = 'r7'  # Treat 5700X same as 5700 for matching
    elif re.search(r'ryzen.{0,3}7', d):
        specs['cpu'] = 'r7'
    elif re.search(r'ryzen.{0,3}5.{0,3}4500', d):
        specs['cpu'] = 'r5'
    elif re.search(r'ryzen.{0,3}5.{0,3}3400', d):
        specs['cpu'] = 'r5_3400'
    elif re.search(r'ryzen.{0,3}5', d):
        specs['cpu'] = 'r5'
    elif re.search(r'ryzen.{0,3}3', d):
        specs['cpu'] = 'r3'

    # RAM
    m = re.search(r'(\d+)gb', d)
    if m:
        ram = int(m.group(1))
        if ram in (8, 16, 32, 64):
            specs['ram'] = ram

    # SSD
    ssd_matches = re.findall(r'(\d+)(gb|tb)', d)
    for val_s, unit in ssd_matches:
        val = int(val_s)
        if unit == 'tb':
            specs['ssd'] = val * 1000
        elif val >= 100:
            specs['ssd'] = val

    # GPU
    if re.search(r'rtx5070t', d):
        specs['gpu'] = 'rtx5070t'
    elif re.search(r'rtx5070', d):
        specs['gpu'] = 'rtx5070'
    elif re.search(r'rtx5060ti', d):
        specs['gpu'] = 'rtx5060ti'
    elif re.search(r'rtx5060i', d):
        specs['gpu'] = 'rtx5060ti'
    elif re.search(r'rtx5060', d):
        specs['gpu'] = 'rtx5060'
    elif re.search(r'rtx5050', d):
        specs['gpu'] = 'rtx5050'
    elif re.search(r'rtx4060', d):
        specs['gpu'] = 'rtx4060'
    elif re.search(r'rtx3060', d):
        specs['gpu'] = 'rtx3060'
    elif re.search(r'rtx3050', d):
        specs['gpu'] = 'rtx3050'

    return specs


def specs_match(email_specs, ean_specs):
    """Check if email specs match an EAN's specs."""
    # CPU must match
    if email_specs.get('cpu') != ean_specs.get('cpu'):
        # Special: r5_3400 in EAN matches r5 in email if no 4500 distinction
        if not (ean_specs.get('cpu') == 'r5' and email_specs.get('cpu') == 'r5'):
            return False

    # RAM must match if both have it
    if 'ram' in email_specs and 'ram' in ean_specs:
        if email_specs['ram'] != ean_specs['ram']:
            return False

    # SSD must match if both have it
    if 'ssd' in email_specs and 'ssd' in ean_specs:
        if email_specs['ssd'] != ean_specs['ssd']:
            return False

    # GPU must match (or both absent)
    email_gpu = email_specs.get('gpu')
    ean_gpu = ean_specs.get('gpu')
    if email_gpu and email_gpu != 'unknown_geforce':
        if email_gpu != ean_gpu:
            return False
    elif email_gpu == 'unknown_geforce' and not ean_gpu:
        return False  # Email has GPU but EAN doesn't

    return True


def main():
    # Get failed emails with their original SKU and description
    result = subprocess.run(
        ['docker', 'exec', 'interwall-postgres', 'psql', '-U', 'interwall', '-d', 'interwall',
         '-t', '-A', '-c',
         """SELECT json_agg(json_build_object(
             'order_nr', parsed_data->>'order_number',
             'sku', parsed_data->>'sku',
             'price', (parsed_data->>'price')::numeric,
             'marketplace', marketplace,
             'orig_sku', substring(raw_body from 'Interne referentie[^:]*:\\s*([A-Za-z0-9-]+)'),
             'description', substring(raw_body from 'Beschrijving[^:]*:\\s*([^<\\r\\n]+)')
         )) FROM ingestion_events WHERE status = 'failed'"""],
        capture_output=True, text=True
    )
    emails = json.loads(result.stdout.strip())

    # Get all composite EANs from DB (non-setup variants only)
    result2 = subprocess.run(
        ['docker', 'exec', 'interwall-postgres', 'psql', '-U', 'interwall', '-d', 'interwall',
         '-t', '-A', '-c',
         "SELECT json_agg(json_build_object('ean', ean, 'name', name)) FROM products WHERE is_composite = TRUE AND name NOT LIKE '%(Setup)%'"],
        capture_output=True, text=True
    )
    eans = json.loads(result2.stdout.strip())

    # Parse all EAN specs
    ean_specs_list = []
    for e in eans:
        specs = parse_ean_name(e['name'])
        if specs:
            ean_specs_list.append((e['ean'], e['name'], specs))

    print(f"-- {len(emails)} failed emails, {len(ean_specs_list)} EANs to match against")
    print()

    matched = 0
    unmatched = []
    seen_skus = set()

    for email in emails:
        orig_sku = email.get('orig_sku') or email.get('sku')
        desc = email.get('description', '')
        if not orig_sku or orig_sku in seen_skus:
            continue
        seen_skus.add(orig_sku)

        email_specs = parse_email_specs(desc)
        if not email_specs:
            unmatched.append((orig_sku, desc, 'Could not parse specs'))
            continue

        # Find matching EAN
        matches = [(ean, name) for ean, name, especs in ean_specs_list
                    if specs_match(email_specs, especs)]

        if len(matches) == 1:
            ean, name = matches[0]
            print(f"-- {orig_sku} → {ean} ({name})")
            print(f"--   Email: {desc[:80]}")
            print(f"--   Specs: {email_specs}")
            matched += 1
        elif len(matches) > 1:
            # Multiple matches — pick first (they're equivalent specs, just NGG vs other line)
            ean, name = matches[0]
            print(f"-- {orig_sku} → {ean} ({name}) [picked from {len(matches)} matches]")
            print(f"--   Email: {desc[:80]}")
            matched += 1
        else:
            unmatched.append((orig_sku, desc, f'No match for specs {email_specs}'))

    print()
    print(f"-- Matched: {matched}/{len(seen_skus)}")
    if unmatched:
        print(f"-- Unmatched: {len(unmatched)}")
        for sku, desc, reason in unmatched:
            print(f"--   {sku}: {reason} — {desc[:60]}")


if __name__ == "__main__":
    main()
