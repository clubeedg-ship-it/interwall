/**
 * T-C03 verification harness — zone topology off localStorage.
 *
 * Run: node inventory-interwall/frontend/t_c03_zones_verify.mjs
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

console.log('\n--- T-C03 zone topology verification ---\n');

const zoneConfigSrc = read('zone-config.js');
const zoneManagerSrc = read('zone-manager.js');
const wallSrc = read('wall.js');
const binInfoSrc = read('bin-info-modal.js');

// Strip block/line comments so comment copy doesn't produce false positives.
function stripComments(src) {
    return src
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '')
        .replace(/\s\/\/.*$/gm, '');
}

const zoneConfigCode = stripComments(zoneConfigSrc);
const zoneManagerCode = stripComments(zoneManagerSrc);
const wallCode = stripComments(wallSrc);
const binInfoCode = stripComments(binInfoSrc);

// ---------------------------------------------------------------------------
// zone-config.js: no localStorage keys, must use api.request('/api/zones')
// ---------------------------------------------------------------------------
assert(
    !/['"]interwall_zones['"]/.test(zoneConfigCode),
    "zone-config.js: no 'interwall_zones' string reference"
);
assert(
    !/['"]interwall_zone_version['"]/.test(zoneConfigCode),
    "zone-config.js: no 'interwall_zone_version' string reference"
);
assert(
    !/localStorage\.(getItem|setItem|removeItem)/.test(zoneConfigCode),
    'zone-config.js: no localStorage.getItem/setItem/removeItem calls'
);
assert(
    /api\.request\(\s*['"]\/api\/zones['"]/.test(zoneConfigCode),
    "zone-config.js: calls api.request('/api/zones', ...)"
);
assert(
    /method:\s*['"]POST['"]/.test(zoneConfigCode),
    'zone-config.js: POST path wired through api.request'
);
assert(
    /method:\s*['"]PATCH['"]/.test(zoneConfigCode),
    'zone-config.js: PATCH path wired through api.request'
);
assert(
    /async\s+load\s*\(\s*\)/.test(zoneConfigCode),
    'zone-config.js: defines async load()'
);

// ---------------------------------------------------------------------------
// zone-manager.js: no InvenTree stock location creation calls, no direct
// localStorage reads, no interwall_zones keys.
// ---------------------------------------------------------------------------
assert(
    !/['"]interwall_zones['"]/.test(zoneManagerCode),
    "zone-manager.js: no 'interwall_zones' string reference"
);
assert(
    !/['"]interwall_zone_version['"]/.test(zoneManagerCode),
    "zone-manager.js: no 'interwall_zone_version' string reference"
);
assert(
    !/localStorage\.(getItem|setItem|removeItem)/.test(zoneManagerCode),
    'zone-manager.js: no localStorage.getItem/setItem/removeItem calls'
);
assert(
    !/createZoneLocations/.test(zoneManagerCode),
    'zone-manager.js: dead InvenTree createZoneLocations removed'
);
assert(
    !/api\.createLocation/.test(zoneManagerCode),
    'zone-manager.js: no api.createLocation calls'
);

// ---------------------------------------------------------------------------
// wall.js: no localStorage zone reads, loads zones via zoneConfig.load()
// ---------------------------------------------------------------------------
assert(
    !/localStorage\.getItem\(\s*['"]interwall_zones/.test(wallCode),
    "wall.js: no localStorage.getItem('interwall_zones...') read"
);
assert(
    !/localStorage\.(getItem|setItem|removeItem)/.test(wallCode),
    'wall.js: no localStorage.getItem/setItem/removeItem calls'
);
assert(
    /zoneConfig\.load\s*\(\s*\)/.test(wallCode),
    'wall.js: loadLiveData refreshes zones via zoneConfig.load()'
);

// ---------------------------------------------------------------------------
// bin-info-modal.js: no localStorage zone reads
// ---------------------------------------------------------------------------
assert(
    !/localStorage\.getItem\(\s*['"]interwall_zones/.test(binInfoCode),
    "bin-info-modal.js: no localStorage.getItem('interwall_zones...') read"
);
assert(
    !/localStorage\.(getItem|setItem|removeItem)/.test(binInfoCode),
    'bin-info-modal.js: no localStorage.getItem/setItem/removeItem calls'
);

// ---------------------------------------------------------------------------
// Hardcoded wall dimensions (D-045): no literal fallbacks for cols/levels
// inside zone-config / wall rendering paths beyond the TEMPLATES constant.
// ---------------------------------------------------------------------------
assert(
    !/CONFIG\.DEFAULT_ZONES/.test(zoneConfigCode),
    'zone-config.js: no CONFIG.DEFAULT_ZONES fallback (D-045)'
);
assert(
    !/CONFIG\.DEFAULT_ZONES/.test(wallCode),
    'wall.js: no CONFIG.DEFAULT_ZONES fallback (D-045)'
);

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
