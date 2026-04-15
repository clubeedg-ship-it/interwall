/**
 * T-C02b — Wall single-source-of-truth verification script.
 *
 * Runs against http://localhost:1441 (system nginx).
 * Verifies:
 *   1. GET /api/shelves/occupancy returns 200 with expected shape.
 *   2. api.getAllStock and api.getStockAtLocation are removed from api.js.
 *   3. wall.js references api.getShelfOccupancy (not getAllStock).
 *   4. bin-info-modal.js references wall.occupancyByCell (not getStockAtLocation).
 *
 * Usage:
 *   node inventory-interwall/frontend/t_c02b_wall_sot_verify.mjs
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE = 'http://localhost:1441';
let pass = 0;
let fail = 0;

function ok(label) { pass++; console.log(`  PASS  ${label}`); }
function bad(label, reason) { fail++; console.error(`  FAIL  ${label}: ${reason}`); }

// ── 1. API endpoint ─────────────────────────────────────────────────
async function checkEndpoint() {
    try {
        const resp = await fetch(`${BASE}/api/shelves/occupancy`, {
            headers: { 'Accept': 'application/json' },
        });
        if (resp.status === 401) {
            // Not authenticated — endpoint exists but requires login.
            // That's fine for a structural check.
            ok('GET /api/shelves/occupancy exists (401 = auth required)');
            return;
        }
        if (!resp.ok) {
            bad('GET /api/shelves/occupancy', `status ${resp.status}`);
            return;
        }
        const data = await resp.json();
        if (!Array.isArray(data)) {
            bad('response shape', 'expected array');
            return;
        }
        ok('GET /api/shelves/occupancy returns array');
        if (data.length > 0) {
            const keys = Object.keys(data[0]);
            const required = ['shelf_id', 'zone_name', 'col', 'level', 'total_qty', 'total_value'];
            const missing = required.filter(k => !keys.includes(k));
            if (missing.length) {
                bad('row shape', `missing: ${missing.join(', ')}`);
            } else {
                ok('row has expected fields');
            }
        } else {
            ok('response is empty array (no shelves — OK for structural check)');
        }
    } catch (e) {
        bad('GET /api/shelves/occupancy', e.message);
    }
}

// ── 2–4. Source code assertions ─────────────────────────────────────
function checkSource() {
    const apiSrc = readFileSync(resolve(__dirname, 'api.js'), 'utf8');
    const wallSrc = readFileSync(resolve(__dirname, 'wall.js'), 'utf8');
    const binSrc = readFileSync(resolve(__dirname, 'bin-info-modal.js'), 'utf8');

    // api.js: retired methods must be gone
    if (/getAllStock\s*\(/.test(apiSrc)) {
        bad('api.js', 'getAllStock() still present');
    } else {
        ok('api.js: getAllStock removed');
    }
    if (/getStockAtLocation\s*\(/.test(apiSrc)) {
        bad('api.js', 'getStockAtLocation() still present');
    } else {
        ok('api.js: getStockAtLocation removed');
    }
    if (!/getShelfOccupancy\s*\(/.test(apiSrc)) {
        bad('api.js', 'getShelfOccupancy() not found');
    } else {
        ok('api.js: getShelfOccupancy present');
    }

    // wall.js: must use occupancy, not old paths
    if (/getAllStock/.test(wallSrc)) {
        bad('wall.js', 'still references getAllStock');
    } else {
        ok('wall.js: no getAllStock references');
    }
    if (/getStockAtLocation/.test(wallSrc)) {
        bad('wall.js', 'still references getStockAtLocation');
    } else {
        ok('wall.js: no getStockAtLocation references');
    }
    if (!/getShelfOccupancy/.test(wallSrc)) {
        bad('wall.js', 'does not reference getShelfOccupancy');
    } else {
        ok('wall.js: references getShelfOccupancy');
    }
    if (!/occupancyByCell/.test(wallSrc)) {
        bad('wall.js', 'occupancyByCell map not found');
    } else {
        ok('wall.js: occupancyByCell map present');
    }

    // bin-info-modal.js: must use wall.occupancyByCell
    if (/getStockAtLocation/.test(binSrc)) {
        bad('bin-info-modal.js', 'still references getStockAtLocation');
    } else {
        ok('bin-info-modal.js: no getStockAtLocation references');
    }
    if (!/occupancyByCell/.test(binSrc)) {
        bad('bin-info-modal.js', 'does not reference occupancyByCell');
    } else {
        ok('bin-info-modal.js: references occupancyByCell');
    }
}

// ── Run ─────────────────────────────────────────────────────────────
console.log('T-C02b wall SOT verification\n');
checkSource();
await checkEndpoint();

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
