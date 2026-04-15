#!/usr/bin/env node
/**
 * T-C11a verification: assert every listed unsanitized innerHTML sink
 * has been routed through sanitize() or a safe DOM API.
 *
 * For each file+marker pair, the script reads the file as text and
 * checks a regex. Every dynamic identifier pulled from the task packet
 * must appear ONLY as `sanitize(<id>)` (or not appear at all — if the
 * block was refactored to DOM APIs).
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const here = (p) => resolve(__dirname, p);

const checks = [
  // --- tenant.js: selector option interpolation ---
  {
    file: here('tenant.js'),
    label: 'tenant.js selector: ${t.id} must be sanitize(t.id)',
    mustMatch: /\$\{sanitize\(t\.id\)\}/,
    mustNotMatch: /value="\$\{t\.id\}"/
  },
  {
    file: here('tenant.js'),
    label: 'tenant.js selector: ${t.displayName} must be sanitize(t.displayName)',
    mustMatch: /\$\{sanitize\(t\.displayName\)\}/,
    mustNotMatch: /^\s*\$\{t\.displayName\}\s*$/m
  },

  // --- labels.js: createLabelHTML fields ---
  {
    file: here('labels.js'),
    label: 'labels.js createLabelHTML: name must be sanitize(name)',
    mustMatch: /label-name">\$\{sanitize\(name\)\}/,
    mustNotMatch: /label-name">\$\{name\}</
  },
  {
    file: here('labels.js'),
    label: 'labels.js createLabelHTML: sku must be sanitize(sku)',
    mustMatch: /data-sku="\$\{sanitize\(sku\)\}"/,
    mustNotMatch: /data-sku="\$\{sku\}"/
  },
  {
    file: here('labels.js'),
    label: 'labels.js createLabelHTML: location must be sanitize(location)',
    mustMatch: /label-location">\$\{sanitize\(location\)\}/,
    mustNotMatch: /label-location">\$\{location\}</
  },
  {
    file: here('labels.js'),
    label: 'labels.js preview modal: items.length must be sanitize(items.length)',
    mustMatch: /\$\{sanitize\(items\.length\)\} Label/,
    mustNotMatch: /modal-title">\$\{items\.length\} Label/
  },

  // --- history.js: renderMovement ---
  {
    file: here('history.js'),
    label: 'history.js renderMovement: partName must be sanitize(partName)',
    mustMatch: /history-item-title">\$\{sanitize\(partName\)\}/,
    mustNotMatch: /history-item-title">\$\{partName\}</
  },
  {
    file: here('history.js'),
    label: 'history.js renderMovement: formattedDate must be sanitize(formattedDate)',
    mustMatch: /history-item-timestamp">\$\{sanitize\(formattedDate\)\}/,
    mustNotMatch: /history-item-timestamp">\$\{formattedDate\}</
  },
  {
    file: here('history.js'),
    label: 'history.js renderMovement: movement.notes must be sanitize(movement.notes)',
    mustMatch: /history-item-notes">\$\{sanitize\(movement\.notes\)\}/,
    mustNotMatch: /history-item-notes">\$\{movement\.notes\}</
  },

  // --- history.js: renderDetails ---
  {
    file: here('history.js'),
    label: 'history.js renderDetails: quantity must be sanitize(movement.quantity)',
    mustMatch: /\$\{sanitize\(movement\.quantity\)\}/,
    mustNotMatch: /mono highlight">\$\{movement\.quantity\}</
  },
  {
    file: here('history.js'),
    label: 'history.js renderDetails: location_detail.name must be sanitized',
    mustMatch: /\$\{sanitize\(movement\.location_detail\.name \|\| 'Unknown'\)\}/,
    mustNotMatch: /history-detail-value">\$\{movement\.location_detail\.name \|\| 'Unknown'\}</
  },
  {
    file: here('history.js'),
    label: 'history.js renderDetails: user_detail.username must be sanitized',
    mustMatch: /\$\{sanitize\(movement\.user_detail\.username \|\| 'Unknown'\)\}/,
    mustNotMatch: /history-detail-value">\$\{movement\.user_detail\.username \|\| 'Unknown'\}</
  },
  {
    file: here('history.js'),
    label: 'history.js renderDetails: tracking_type must be sanitize(movement.tracking_type)',
    mustMatch: /history-detail-value">\$\{sanitize\(movement\.tracking_type\)\}/,
    mustNotMatch: /history-detail-value">\$\{movement\.tracking_type\}</
  },

  // --- catalog-detail.js: supplier URL block uses DOM APIs, not innerHTML ---
  {
    file: here('catalog-detail.js'),
    label: 'catalog-detail.js: supplier URL uses DOM API (no innerHTML with ${supplierURL})',
    // anchor should be built via createElement
    mustMatch: /document\.createElement\('a'\)/,
    mustNotMatch: /urlContainer\.innerHTML\s*=\s*`\s*<a href="\$\{supplierURL\}/
  },
  {
    file: here('catalog-detail.js'),
    label: 'catalog-detail.js: shortenURL output not injected via innerHTML',
    // must not find innerHTML assignment that contains ${this.shortenURL(
    mustNotMatch: /innerHTML\s*=\s*`[^`]*\$\{this\.shortenURL\(/s
  },

  // --- profit.js: inventory breakdown ---
  {
    file: here('profit.js'),
    label: 'profit.js inventoryBreakdown: name must be sanitize(name)',
    mustMatch: /<td>\$\{sanitize\(name\)\}<\/td>/,
    mustNotMatch: /product-row">\s*<td>\$\{name\}</s
  },
  {
    file: here('profit.js'),
    label: 'profit.js inventoryBreakdown error path: e.message must be sanitize(e.message)',
    mustMatch: /Error rendering data: \$\{sanitize\(e\.message\)\}/,
    mustNotMatch: /Error rendering data: \$\{e\.message\}</
  },

  // --- profit.js: transaction card header/product/breakdown ---
  {
    file: here('profit.js'),
    label: 'profit.js transactions: data-order tx.orderId sanitized',
    mustMatch: /data-order="\$\{sanitize\(tx\.orderId\)\}"/,
    mustNotMatch: /data-order="\$\{tx\.orderId\}"/
  },
  {
    file: here('profit.js'),
    label: 'profit.js transactions: transaction-id tx.orderId sanitized',
    mustMatch: /transaction-id">\$\{sanitize\(tx\.orderId\)\}/,
    mustNotMatch: /transaction-id">\$\{tx\.orderId\}</
  },
  {
    file: here('profit.js'),
    label: 'profit.js transactions: transaction-date tx.date sanitized',
    mustMatch: /transaction-date">\$\{sanitize\(tx\.date\)\}/,
    mustNotMatch: /transaction-date">\$\{tx\.date\}</
  },
  {
    file: here('profit.js'),
    label: 'profit.js transactions: transaction-product tx.productName sanitized',
    mustMatch: /transaction-product">\$\{sanitize\(tx\.productName\)\}/,
    mustNotMatch: /transaction-product">\$\{tx\.productName\}</
  },
  {
    file: here('profit.js'),
    label: 'profit.js transactions: breakdown.vatCountry sanitized',
    mustMatch: /VAT \$\{sanitize\(breakdown\.vatCountry \|\| ''\)\}/,
    mustNotMatch: /VAT \$\{breakdown\.vatCountry \|\| ''\} \(/
  },
  {
    file: here('profit.js'),
    label: 'profit.js Components Used (transaction card): c.partName sanitized',
    mustMatch: /class="part">\$\{sanitize\(c\.partName\)\}/,
    mustNotMatch: /class="part">\$\{c\.partName\}/
  },
  {
    file: here('profit.js'),
    label: 'profit.js Components Used (transaction card): c.qty sanitized',
    // The transaction-card row puts FIXED after qty — use that as scope anchor
    mustMatch: /× \$\{sanitize\(c\.qty\)\}\$\{c\.isFixed \?/,
    mustNotMatch: /× \$\{c\.qty\}\$\{c\.isFixed \?/
  }
];

let passed = 0;
let failed = 0;
const failures = [];

const cache = new Map();
function readFile(p) {
  if (!cache.has(p)) cache.set(p, readFileSync(p, 'utf8'));
  return cache.get(p);
}

for (const c of checks) {
  const text = readFile(c.file);
  let ok = true;
  let reason = '';

  if (c.mustMatch && !c.mustMatch.test(text)) {
    ok = false;
    reason = `mustMatch did not match: ${c.mustMatch}`;
  } else if (c.mustNotMatch && c.mustNotMatch.test(text)) {
    ok = false;
    reason = `mustNotMatch matched (unsanitized still present): ${c.mustNotMatch}`;
  }

  if (ok) {
    passed++;
  } else {
    failed++;
    failures.push(`  - ${c.label}\n      ${reason}`);
  }
}

if (failures.length) {
  console.error('FAILURES:');
  console.error(failures.join('\n'));
}
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
