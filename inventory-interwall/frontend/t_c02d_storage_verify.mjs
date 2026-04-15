#!/usr/bin/env node
// T-C02d storage-cleanup verifier.
//
// Asserts that profit.js no longer exercises browser authority over
// transactions / totalMargin / fixed_components (D-025, D-040), that the
// InvenTree re-pricing path is gone, and that api.js exposes the three
// canonical read helpers the profit view must route through.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const profitPath = resolve(here, 'profit.js');
const apiPath = resolve(here, 'api.js');

const profitSrc = readFileSync(profitPath, 'utf8');
const apiSrc = readFileSync(apiPath, 'utf8');

const failures = [];

function mustNotMatch(haystack, needle, label) {
    if (typeof needle === 'string' ? haystack.includes(needle) : needle.test(haystack)) {
        failures.push(`FAIL: ${label}`);
    }
}

function mustMatch(haystack, needle, label) {
    if (typeof needle === 'string' ? !haystack.includes(needle) : !needle.test(haystack)) {
        failures.push(`FAIL: ${label}`);
    }
}

// --- profit.js: localStorage business keys must be gone --------------------
mustNotMatch(profitSrc, "localStorage.setItem('interwall_transactions'",
    "profit.js still writes interwall_transactions");
mustNotMatch(profitSrc, "localStorage.getItem('interwall_transactions'",
    "profit.js still reads interwall_transactions");
mustNotMatch(profitSrc, "interwall_totalMargin",
    "profit.js still references interwall_totalMargin");
mustNotMatch(profitSrc, "interwall_fixed_components",
    "profit.js still references interwall_fixed_components");

// --- profit.js: D-025 repricer must be fully removed ----------------------
mustNotMatch(profitSrc, /fetchInvenTreeSalesOrders/,
    "profit.js still defines or calls fetchInvenTreeSalesOrders (D-025)");

// --- profit.js: no client-authoritative totalMargin mutations -------------
// (comments are permitted; only executable mutations would re-introduce
// browser authority over profit totals)
mustNotMatch(profitSrc, /profitState\.totalMargin\s*[-+]?=/,
    "profit.js still mutates profitState.totalMargin");

// --- api.js: canonical helpers must be exposed -----------------------------
mustMatch(apiSrc, /\bgetTransactions\s*\(/,
    "api.js missing getTransactions helper");
mustMatch(apiSrc, /\bgetProfitSummary\s*\(/,
    "api.js missing getProfitSummary helper");
mustMatch(apiSrc, /\bgetFixedCosts\s*\(/,
    "api.js missing getFixedCosts helper");
mustMatch(apiSrc, "/api/profit/transactions",
    "api.js getTransactions does not target /api/profit/transactions");
mustMatch(apiSrc, "/api/profit/summary",
    "api.js getProfitSummary does not target /api/profit/summary");
mustMatch(apiSrc, "/api/fixed-costs",
    "api.js getFixedCosts does not target /api/fixed-costs");

if (failures.length) {
    console.error(failures.join('\n'));
    console.error(`\n${failures.length} assertion(s) failed.`);
    process.exit(1);
}

console.log('T-C02d storage verify: PASS');
