/**
 * T-C02e — Shelf settings SoT migration verification script.
 *
 * Asserts:
 *   1. shelf-config.js does not exist
 *   2. index.html has no shelf-config.js script tag
 *   3. app-init.js has no shelfConfig reference
 *   4. wall.js has no shelfConfig reference
 *   5. bin-info-modal.js has no shelfConfig reference
 *   6. api.js exports updateShelf (not updateShelfCapacity)
 *   7. bin-info-modal.js calls api.updateShelf with split_fifo payload
 *   8. bin-info-modal.js calls api.updateShelf with single_bin payload
 *   9. wall.js reads .single_bin from occupancyByCell rows
 *
 * Usage:
 *   node inventory-interwall/frontend/t_c02e_settings_verify.mjs
 */
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
let pass = 0;
let fail = 0;

function ok(label) { pass++; console.log(`  PASS  ${label}`); }
function bad(label, reason) { fail++; console.error(`  FAIL  ${label}: ${reason}`); }

console.log('T-C02e shelf settings SoT verification\n');

// ── 1. shelf-config.js deleted ───────────────────────────────────────
if (!existsSync(resolve(__dirname, 'shelf-config.js'))) {
    ok('shelf-config.js: deleted');
} else {
    bad('shelf-config.js', 'file still exists');
}

// ── Source reads ─────────────────────────────────────────────────────
const htmlSrc   = readFileSync(resolve(__dirname, 'index.html'), 'utf8');
const appSrc    = readFileSync(resolve(__dirname, 'app-init.js'), 'utf8');
const wallSrc   = readFileSync(resolve(__dirname, 'wall.js'), 'utf8');
const binSrc    = readFileSync(resolve(__dirname, 'bin-info-modal.js'), 'utf8');
const apiSrc    = readFileSync(resolve(__dirname, 'api.js'), 'utf8');

// ── 2. index.html: no shelf-config.js script tag ────────────────────
if (/shelf-config\.js/.test(htmlSrc)) {
    bad('index.html', 'still contains shelf-config.js script tag');
} else {
    ok('index.html: no shelf-config.js script tag');
}

// ── 3. app-init.js: no shelfConfig reference ────────────────────────
if (/shelfConfig/.test(appSrc)) {
    bad('app-init.js', 'still references shelfConfig');
} else {
    ok('app-init.js: no shelfConfig reference');
}

// ── 4. wall.js: no shelfConfig reference ────────────────────────────
if (/shelfConfig/.test(wallSrc)) {
    bad('wall.js', 'still references shelfConfig');
} else {
    ok('wall.js: no shelfConfig reference');
}

// ── 5. bin-info-modal.js: no shelfConfig reference ──────────────────
if (/shelfConfig/.test(binSrc)) {
    bad('bin-info-modal.js', 'still references shelfConfig');
} else {
    ok('bin-info-modal.js: no shelfConfig reference');
}

// ── 6. api.js: updateShelf present, updateShelfCapacity gone ────────
if (/updateShelf\s*\(/.test(apiSrc)) {
    ok('api.js: updateShelf defined');
} else {
    bad('api.js', 'updateShelf not found');
}
if (/updateShelfCapacity/.test(apiSrc)) {
    bad('api.js', 'updateShelfCapacity still present (should be renamed)');
} else {
    ok('api.js: updateShelfCapacity removed');
}

// ── 7. bin-info-modal.js: split_fifo payload ────────────────────────
if (/split_fifo/.test(binSrc)) {
    ok('bin-info-modal.js: split_fifo payload present');
} else {
    bad('bin-info-modal.js', 'split_fifo payload not found');
}

// ── 8. bin-info-modal.js: single_bin payload ────────────────────────
if (/single_bin/.test(binSrc)) {
    ok('bin-info-modal.js: single_bin payload present');
} else {
    bad('bin-info-modal.js', 'single_bin payload not found');
}

// ── 9. wall.js: reads .single_bin from occupancyByCell ──────────────
if (/occupancyByCell.*single_bin|single_bin.*occupancyByCell/.test(wallSrc) ||
    /\.single_bin/.test(wallSrc)) {
    ok('wall.js: reads .single_bin from occupancyByCell');
} else {
    bad('wall.js', '.single_bin read from occupancyByCell not found');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
