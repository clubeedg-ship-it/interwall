/**
 * T-C02c handshake cleanup verification harness.
 *
 * Run: node inventory-interwall/frontend/t_c02c_handshake_verify.mjs
 */

import { readFileSync } from 'fs';
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

console.log('\n--- T-C02c handshake cleanup verification ---\n');

const apiSrc = read('api.js');
const handshakeSrc = read('handshake.js');
const catalogDetailSrc = read('catalog-detail.js');

// ---------------------------------------------------------------------------
// api.js — new canonical helpers, no legacy removeStock
// ---------------------------------------------------------------------------
assert(
    /async\s+getStockLotsByProduct\s*\(/.test(apiSrc),
    'api.js defines getStockLotsByProduct('
);
assert(
    /async\s+transferStock\s*\(/.test(apiSrc),
    'api.js defines transferStock('
);
assert(
    /async\s+consumeLot\s*\(/.test(apiSrc),
    'api.js defines consumeLot('
);
assert(
    apiSrc.includes('/api/stock-lots/by-product/'),
    'api.js routes getStockLotsByProduct to /api/stock-lots/by-product/'
);
assert(
    apiSrc.includes('/api/stock/transfer'),
    'api.js routes transferStock to /api/stock/transfer'
);
assert(
    /\/consume/.test(apiSrc) && apiSrc.includes('/api/stock-lots/'),
    'api.js routes consumeLot to /api/stock-lots/{lot_id}/consume'
);
assert(
    !/async\s+removeStock\s*\(/.test(apiSrc),
    'api.js has no removeStock method'
);
assert(
    !apiSrc.includes('/stock/remove/'),
    'api.js has no /stock/remove/ path reference'
);

// ---------------------------------------------------------------------------
// handshake.js — picking uses canonical server surfaces only
// ---------------------------------------------------------------------------
assert(
    handshakeSrc.includes('getStockLotsByProduct('),
    'handshake.js picking calls api.getStockLotsByProduct('
);
assert(
    handshakeSrc.includes('api.consumeLot('),
    'handshake.js picking calls api.consumeLot('
);
assert(
    !handshakeSrc.includes('api.removeStock('),
    'handshake.js no longer calls api.removeStock('
);
assert(
    !handshakeSrc.includes('/stock/remove/'),
    'handshake.js has no /stock/remove/ string'
);
assert(
    !handshakeSrc.includes('getStockAtLocation('),
    'handshake.js has no getStockAtLocation( reference'
);
assert(
    !/fetch\(\s*`\$\{CONFIG\.API_BASE\}\/stock\/transfer\//.test(handshakeSrc),
    'handshake.js has no raw fetch(`${CONFIG.API_BASE}/stock/transfer/`'
);
assert(
    !handshakeSrc.includes('CONFIG.API_TOKEN'),
    'handshake.js has no CONFIG.API_TOKEN usage'
);
assert(
    !/\bfetch\s*\(/.test(handshakeSrc),
    'handshake.js has no raw fetch( calls'
);
assert(
    !handshakeSrc.includes("locName.endsWith('-A')"),
    'handshake.js has no receive auto-rotation branch (endsWith -A)'
);
assert(
    !handshakeSrc.includes('FIFO Auto-Rotation'),
    'handshake.js has no FIFO Auto-Rotation comment/note'
);
assert(
    !/this\.moveStock\s*\(/.test(handshakeSrc),
    'handshake.js no longer invokes this.moveStock('
);
assert(
    !/endsWith\(\s*['"`]-B['"`]\s*\)/.test(handshakeSrc),
    "handshake.js has no browser-authored Bin B suffix sort"
);
assert(
    !handshakeSrc.includes('stocktake_date'),
    'handshake.js has no stocktake_date sort key'
);

// ---------------------------------------------------------------------------
// catalog-detail.js — routes through api.transferStock
// ---------------------------------------------------------------------------
assert(
    !catalogDetailSrc.includes('handshake.moveStock('),
    'catalog-detail.js no longer calls handshake.moveStock('
);
assert(
    catalogDetailSrc.includes('api.transferStock('),
    'catalog-detail.js uses api.transferStock( for location change'
);

// ---------------------------------------------------------------------------
console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
