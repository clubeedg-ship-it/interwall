/**
 * T-C02d — Capacity SoT verification script.
 *
 * Verifies:
 *   1. api.js exports updateShelfCapacity, calls PATCH /api/shelves/
 *   2. bin-info-modal.js no longer references shelfConfig.getBinCapacity
 *      or shelfConfig.setBinCapacity
 *   3. bin-info-modal.js references wall.occupancyByCell and
 *      api.updateShelfCapacity
 *   4. shelf-config.js no longer defines getBinCapacity / setBinCapacity
 *   5. shelf-config.js still defines isSplitBins, toggleSplitFifo
 *      (regression guard for T-C02e)
 *
 * Usage:
 *   node inventory-interwall/frontend/t_c02d_capacity_verify.mjs
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
let pass = 0;
let fail = 0;

function ok(label) { pass++; console.log(`  PASS  ${label}`); }
function bad(label, reason) { fail++; console.error(`  FAIL  ${label}: ${reason}`); }

// ── Source code assertions ──────────────────────────────────────────
const apiSrc = readFileSync(resolve(__dirname, 'api.js'), 'utf8');
const binSrc = readFileSync(resolve(__dirname, 'bin-info-modal.js'), 'utf8');
const shelfSrc = readFileSync(resolve(__dirname, 'shelf-config.js'), 'utf8');

console.log('T-C02d capacity SoT verification\n');

// 1. api.js: updateShelfCapacity present and calls PATCH /api/shelves/
if (/updateShelfCapacity\s*\(/.test(apiSrc)) {
    ok('api.js: updateShelfCapacity defined');
} else {
    bad('api.js', 'updateShelfCapacity not found');
}
if (/PATCH/.test(apiSrc) && /\/api\/shelves\//.test(apiSrc)) {
    ok('api.js: PATCH /api/shelves/ call present');
} else {
    bad('api.js', 'PATCH /api/shelves/ call not found');
}

// 2. bin-info-modal.js: no shelfConfig.getBinCapacity / setBinCapacity
if (/shelfConfig\.getBinCapacity/.test(binSrc)) {
    bad('bin-info-modal.js', 'still references shelfConfig.getBinCapacity');
} else {
    ok('bin-info-modal.js: no shelfConfig.getBinCapacity');
}
if (/shelfConfig\.setBinCapacity/.test(binSrc)) {
    bad('bin-info-modal.js', 'still references shelfConfig.setBinCapacity');
} else {
    ok('bin-info-modal.js: no shelfConfig.setBinCapacity');
}

// 3. bin-info-modal.js: references wall.occupancyByCell and api.updateShelfCapacity
if (/wall\.occupancyByCell/.test(binSrc)) {
    ok('bin-info-modal.js: references wall.occupancyByCell');
} else {
    bad('bin-info-modal.js', 'does not reference wall.occupancyByCell');
}
if (/api\.updateShelfCapacity/.test(binSrc)) {
    ok('bin-info-modal.js: references api.updateShelfCapacity');
} else {
    bad('bin-info-modal.js', 'does not reference api.updateShelfCapacity');
}

// 4. shelf-config.js: no getBinCapacity / setBinCapacity
if (/getBinCapacity\s*\(/.test(shelfSrc)) {
    bad('shelf-config.js', 'still defines getBinCapacity');
} else {
    ok('shelf-config.js: getBinCapacity removed');
}
if (/setBinCapacity\s*\(/.test(shelfSrc)) {
    bad('shelf-config.js', 'still defines setBinCapacity');
} else {
    ok('shelf-config.js: setBinCapacity removed');
}

// 5. shelf-config.js: still defines isSplitBins and toggleSplitFifo (T-C02e guard)
if (/isSplitBins\s*\(/.test(shelfSrc)) {
    ok('shelf-config.js: isSplitBins still present (T-C02e)');
} else {
    bad('shelf-config.js', 'isSplitBins missing — T-C02e regression');
}
if (/toggleSplitFifo\s*\(/.test(shelfSrc)) {
    ok('shelf-config.js: toggleSplitFifo still present (T-C02e)');
} else {
    bad('shelf-config.js', 'toggleSplitFifo missing — T-C02e regression');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
