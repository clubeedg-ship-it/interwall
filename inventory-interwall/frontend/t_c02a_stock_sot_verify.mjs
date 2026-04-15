/**
 * T-C02a stock source-of-truth verification harness.
 *
 * Asserts:
 *  1. catalog normalization reads in_stock from a stubbed snapshot, not 0
 *  2. low-stock card reads in_stock from the same snapshot
 *  3. api.getAvailableStock is undefined
 *
 * Run: node inventory-interwall/frontend/t_c02a_stock_sot_verify.mjs
 */

import { readFileSync } from 'fs';
import { createContext, Script } from 'vm';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const read = f => readFileSync(join(__dirname, f), 'utf8');

let passed = 0;
let failed = 0;

function assert(condition, label) {
    if (condition) {
        console.log(`  PASS  ${label}`);
        passed++;
    } else {
        console.error(`  FAIL  ${label}`);
        failed++;
    }
}

// ---------------------------------------------------------------------------
// Build a minimal browser-like sandbox
// ---------------------------------------------------------------------------
const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    URLSearchParams,
    Map,
    Array,
    Object,
    JSON,
    Date,
    Math,
    Promise,
    Error,
    parseInt,
    parseFloat,
    isNaN,
    encodeURIComponent,
    sessionStorage: { getItem() { return null; }, setItem() {} },
    localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    document: {
        getElementById() { return null; },
        querySelector() { return null; },
        querySelectorAll() { return []; },
        createElement() { return { className: '', innerHTML: '', appendChild() {}, remove() {} }; },
        addEventListener() {},
    },
    window: {},
    fetch: null, // replaced per-test
    CONFIG: { API_BASE: '' },
    dom: { catalogSearch: null, catalogGrid: null },
    state: {
        catalog: { results: [], next: null, count: 0, loading: false },
        parts: new Map(),
        zones: [],
        isConnected: true,
    },
    notifications: { show() {} },
    sanitize: s => String(s),
    theme: { init() {} },
    router: { init() {} },
    partManager: { showCreate() {}, showEdit() {}, showDelete() {} },
    categoryManager: { show() {} },
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;

const ctx = createContext(sandbox);

// Load modules in order (skip env.js/config.js — we set CONFIG directly)
function loadScript(file) {
    const code = read(file);
    const script = new Script(code, { filename: file });
    script.runInContext(ctx);
}

// We need buildTenantQuery which may be in config.js
sandbox.buildTenantQuery = (params) => {
    const qs = new URLSearchParams(params);
    return '?' + qs.toString();
};

loadScript('api.js');

// ---------------------------------------------------------------------------
// Stub fetch to return controlled data
// ---------------------------------------------------------------------------
const STUB_PRODUCTS = [
    { id: 1, ean: 'EAN-001', name: 'Widget A', sku: 'W-A', is_composite: false, minimum_stock: 10 },
    { id: 2, ean: 'EAN-002', name: 'Widget B', sku: 'W-B', is_composite: false, minimum_stock: 5 },
    { id: 3, ean: 'EAN-003', name: 'Widget C', sku: 'W-C', is_composite: false, minimum_stock: 0 },
];

const STUB_VALUATION = [
    { ean: 'EAN-001', name: 'Widget A', total_qty: 25, total_value: 125.00 },
    { ean: 'EAN-002', name: 'Widget B', total_qty: 3, total_value: 15.00 },
    // EAN-003 has no stock lots — absent from valuation
];

function stubFetch(url) {
    const u = String(url);
    let body;
    if (u.includes('/api/profit/valuation')) {
        body = STUB_VALUATION;
    } else if (u.includes('/api/products')) {
        body = STUB_PRODUCTS;
    } else {
        body = [];
    }
    return Promise.resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify(body)),
    });
}

sandbox.fetch = stubFetch;

// ---------------------------------------------------------------------------
// Test 1: catalog normalization reads in_stock from snapshot
// ---------------------------------------------------------------------------
console.log('\n--- T-C02a stock source-of-truth verification ---\n');

const apiObj = sandbox.api;

// 1a. getPartStockSnapshot returns correct Map
const snapshot = await apiObj.getPartStockSnapshot();
assert(snapshot instanceof Map, 'getPartStockSnapshot returns a Map');
assert(snapshot.get('EAN-001')?.in_stock === 25, 'snapshot EAN-001 in_stock = 25');
assert(snapshot.get('EAN-002')?.in_stock === 3, 'snapshot EAN-002 in_stock = 3');
assert(!snapshot.has('EAN-003'), 'snapshot omits EAN-003 (no stock lots)');

// 1b. getProductsWithStock merges correctly
const merged = await apiObj.getProductsWithStock();
const w_a = merged.find(p => p.ean === 'EAN-001');
const w_b = merged.find(p => p.ean === 'EAN-002');
const w_c = merged.find(p => p.ean === 'EAN-003');

assert(w_a?.in_stock === 25, 'catalog Widget A in_stock = 25 (from snapshot, not 0)');
assert(w_b?.in_stock === 3, 'catalog Widget B in_stock = 3 (from snapshot, not 0)');
assert(w_c?.in_stock === 0, 'catalog Widget C in_stock = 0 (no lots, correct default)');
assert(w_a?.minimum_stock === 10, 'catalog Widget A minimum_stock preserved');

// ---------------------------------------------------------------------------
// Test 2: low-stock derives from same snapshot
// ---------------------------------------------------------------------------
// Load ui.js into the sandbox
loadScript('ui.js');

const alertsObj = sandbox.alerts;
const lowStockItems = await alertsObj.checkLowStock();

// Widget B: in_stock=3 < minimum_stock=5 => low stock
// Widget A: in_stock=25 >= minimum_stock=10 => fine
// Widget C: minimum_stock=0 => skipped
assert(alertsObj.lowStockItems.length === 1, 'low-stock count = 1 (only Widget B)');
assert(alertsObj.lowStockItems[0]?.name === 'Widget B', 'low-stock item is Widget B');
assert(alertsObj.lowStockItems[0]?.available === 3, 'low-stock available = 3 (from snapshot)');
assert(alertsObj.lowStockItems[0]?.shortage === 2, 'low-stock shortage = 2');

// ---------------------------------------------------------------------------
// Test 3: getAvailableStock is removed
// ---------------------------------------------------------------------------
assert(typeof apiObj.getAvailableStock === 'undefined', 'api.getAvailableStock is undefined');
assert(typeof apiObj.getStockWithAllocation === 'undefined', 'api.getStockWithAllocation is undefined');

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
