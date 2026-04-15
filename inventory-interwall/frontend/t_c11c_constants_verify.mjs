#!/usr/bin/env node
// T-C11c: verify hardcoded business values migrated to named constants in config.js.
// Pure-refactor check: each sink file references the named constant, and the
// migrated line no longer holds the raw literal. Literal occurrences elsewhere
// in the file are ignored (other uses may legitimately remain).

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const read = (rel) => readFileSync(join(__dirname, rel), 'utf8');

const checks = [];

function check(name, fn) {
    try {
        const ok = fn();
        checks.push({ name, ok: !!ok });
    } catch (e) {
        checks.push({ name, ok: false, err: e.message });
    }
}

// ---------------------------------------------------------------------------
// config.js — surface exports
// ---------------------------------------------------------------------------
const config = read('config.js');

check('config.js declares THRESHOLDS', () =>
    /const\s+THRESHOLDS\s*=\s*\{/.test(config));
check('config.js declares DEFAULTS', () =>
    /const\s+DEFAULTS\s*=\s*\{/.test(config));
check('config.js THRESHOLDS has STOCK_CRITICAL=5', () =>
    /STOCK_CRITICAL\s*:\s*5\b/.test(config));
check('config.js THRESHOLDS has STOCK_WARNING=15', () =>
    /STOCK_WARNING\s*:\s*15\b/.test(config));
check('config.js THRESHOLDS has BIN_LOW_FILL_PERCENT=20', () =>
    /BIN_LOW_FILL_PERCENT\s*:\s*20\b/.test(config));
check('config.js THRESHOLDS has LOW_STOCK_RATIO=0.5', () =>
    /LOW_STOCK_RATIO\s*:\s*0\.5\b/.test(config));
check('config.js DEFAULTS has VAT_RATE=21', () =>
    /VAT_RATE\s*:\s*21\b/.test(config));
check('config.js DEFAULTS has COMMISSION_PCT=6.2', () =>
    /COMMISSION_PCT\s*:\s*6\.2\b/.test(config));
check('config.js DEFAULTS has COMMISSION_RATE=0.062', () =>
    /COMMISSION_RATE\s*:\s*0\.062\b/.test(config));
check('config.js DEFAULTS has OVERHEAD_FIXED=95', () =>
    /OVERHEAD_FIXED\s*:\s*95(\.0+)?\b/.test(config));
check('config.js exposes window.THRESHOLDS', () =>
    /window\.THRESHOLDS\s*=\s*THRESHOLDS/.test(config));
check('config.js exposes window.DEFAULTS', () =>
    /window\.DEFAULTS\s*=\s*DEFAULTS/.test(config));

// ---------------------------------------------------------------------------
// wall.js — getStatus band
// ---------------------------------------------------------------------------
const wall = read('wall.js');
const wallStatusBlock = wall.match(/getStatus\(qty\)\s*\{[\s\S]*?\n\s*\}/);
check('wall.js getStatus() block found', () => wallStatusBlock != null);
check('wall.js getStatus uses THRESHOLDS.STOCK_CRITICAL', () =>
    wallStatusBlock && /THRESHOLDS\.STOCK_CRITICAL/.test(wallStatusBlock[0]));
check('wall.js getStatus uses THRESHOLDS.STOCK_WARNING', () =>
    wallStatusBlock && /THRESHOLDS\.STOCK_WARNING/.test(wallStatusBlock[0]));
check('wall.js getStatus no longer has `qty <= 5`', () =>
    wallStatusBlock && !/qty\s*<=\s*5\b/.test(wallStatusBlock[0]));
check('wall.js getStatus no longer has `qty <= 15`', () =>
    wallStatusBlock && !/qty\s*<=\s*15\b/.test(wallStatusBlock[0]));

// ---------------------------------------------------------------------------
// bin-info-modal.js — fill% low threshold
// ---------------------------------------------------------------------------
const binInfo = read('bin-info-modal.js');
const fillBlock = binInfo.match(/const\s+fillPercent[\s\S]{0,400}?classList\.remove\(['"]low['"]\)/);
check('bin-info-modal.js fill% block found', () => fillBlock != null);
check('bin-info-modal.js uses THRESHOLDS.BIN_LOW_FILL_PERCENT', () =>
    fillBlock && /THRESHOLDS\.BIN_LOW_FILL_PERCENT/.test(fillBlock[0]));
check('bin-info-modal.js fill% block no longer has `fillPercent < 20`', () =>
    fillBlock && !/fillPercent\s*<\s*20\b/.test(fillBlock[0]));

// ---------------------------------------------------------------------------
// catalog-core.js — status function low-stock ratio
// ---------------------------------------------------------------------------
const catalog = read('catalog-core.js');
const catalogStatusBlock = catalog.match(/if\s*\(inStock\s*>\s*0\)\s*\{[\s\S]{0,600}?\n\s*\}\s*\n\s*\}/);
check('catalog-core.js status block found', () => catalogStatusBlock != null);
check('catalog-core.js uses THRESHOLDS.LOW_STOCK_RATIO', () =>
    catalogStatusBlock && /THRESHOLDS\.LOW_STOCK_RATIO/.test(catalogStatusBlock[0]));
check('catalog-core.js status block no longer has `minStock * 0.5`', () =>
    catalogStatusBlock && !/minStock\s*\*\s*0\.5\b/.test(catalogStatusBlock[0]));

// ---------------------------------------------------------------------------
// profit.js — costConfig.DEFAULTS array + PROFIT_CONFIG fallbacks
// ---------------------------------------------------------------------------
const profit = read('profit.js');

const defaultsArray = profit.match(/DEFAULTS:\s*\[[\s\S]*?\]\s*,\s*\n\s*costs:/);
check('profit.js costConfig.DEFAULTS block found', () => defaultsArray != null);
check('profit.js DEFAULTS uses DEFAULTS.VAT_RATE', () =>
    defaultsArray && /DEFAULTS\.VAT_RATE/.test(defaultsArray[0]));
check('profit.js DEFAULTS uses DEFAULTS.COMMISSION_PCT', () =>
    defaultsArray && /DEFAULTS\.COMMISSION_PCT/.test(defaultsArray[0]));
check('profit.js DEFAULTS uses DEFAULTS.OVERHEAD_FIXED', () =>
    defaultsArray && /DEFAULTS\.OVERHEAD_FIXED/.test(defaultsArray[0]));
check('profit.js DEFAULTS no longer has raw `value: 21`', () =>
    defaultsArray && !/value:\s*21\b/.test(defaultsArray[0]));
check('profit.js DEFAULTS no longer has raw `value: 6.2`', () =>
    defaultsArray && !/value:\s*6\.2\b/.test(defaultsArray[0]));
check('profit.js DEFAULTS no longer has raw `value: 95.00`', () =>
    defaultsArray && !/value:\s*95\.00\b/.test(defaultsArray[0]));

const profitLegacy = profit.match(/const\s+PROFIT_CONFIG\s*=\s*\{[\s\S]*?\n\};/);
check('profit.js PROFIT_CONFIG block found', () => profitLegacy != null);
check('profit.js PROFIT_CONFIG uses DEFAULTS.COMMISSION_RATE', () =>
    profitLegacy && /DEFAULTS\.COMMISSION_RATE/.test(profitLegacy[0]));
check('profit.js PROFIT_CONFIG uses DEFAULTS.OVERHEAD_FIXED', () =>
    profitLegacy && /DEFAULTS\.OVERHEAD_FIXED/.test(profitLegacy[0]));
check('profit.js PROFIT_CONFIG no longer falls back to literal 0.062', () =>
    profitLegacy && !/:\s*0\.062\b/.test(profitLegacy[0]));
check('profit.js PROFIT_CONFIG no longer falls back to literal 95.00', () =>
    profitLegacy && !/:\s*95\.00\b/.test(profitLegacy[0]));

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
let failed = 0;
for (const c of checks) {
    const mark = c.ok ? 'PASS' : 'FAIL';
    const extra = c.err ? ` (${c.err})` : '';
    console.log(`${mark} ${c.name}${extra}`);
    if (!c.ok) failed++;
}
const passed = checks.length - failed;
console.log(`${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
