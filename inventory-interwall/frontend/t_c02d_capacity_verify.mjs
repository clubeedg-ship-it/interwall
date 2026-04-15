/**
 * T-C02d — Capacity SoT verification script.
 *
 * Verifies:
 *   1. api.js exports updateShelf (renamed from updateShelfCapacity in T-C02e),
 *      calls PATCH /api/shelves/
 *   2. bin-info-modal.js no longer references shelfConfig.getBinCapacity
 *      or shelfConfig.setBinCapacity
 *   3. bin-info-modal.js references wall.occupancyByCell and
 *      api.updateShelf
 *   4. shelf-config.js has been deleted (T-C02e complete)
 *
 * Usage:
 *   node inventory-interwall/frontend/t_c02d_capacity_verify.mjs
 */
import { readFileSync, existsSync } from 'fs';
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

console.log('T-C02d capacity SoT verification\n');

// 1. api.js: updateShelf present (renamed from updateShelfCapacity in T-C02e)
if (/updateShelf\s*\(/.test(apiSrc)) {
    ok('api.js: updateShelf defined');
} else {
    bad('api.js', 'updateShelf not found');
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

// 3. bin-info-modal.js: references wall.occupancyByCell and api.updateShelf
if (/wall\.occupancyByCell/.test(binSrc)) {
    ok('bin-info-modal.js: references wall.occupancyByCell');
} else {
    bad('bin-info-modal.js', 'does not reference wall.occupancyByCell');
}
if (/api\.updateShelf/.test(binSrc)) {
    ok('bin-info-modal.js: references api.updateShelf');
} else {
    bad('bin-info-modal.js', 'does not reference api.updateShelf');
}

// 4. shelf-config.js deleted (T-C02e)
if (!existsSync(resolve(__dirname, 'shelf-config.js'))) {
    ok('shelf-config.js: deleted (T-C02e complete)');
} else {
    bad('shelf-config.js', 'still exists — T-C02e not applied');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
