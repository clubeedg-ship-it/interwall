#!/usr/bin/env node
/**
 * T-C11b render-safety verification.
 * Confirms the five sinks listed in PROMPT.md route dynamic identifiers
 * through sanitize() (or safe DOM APIs) rather than raw innerHTML
 * interpolation. Exit non-zero on failure.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const profit = readFileSync(resolve(here, 'profit.js'), 'utf8');
const labels = readFileSync(resolve(here, 'labels.js'), 'utf8');

const checks = [];

function assertPresent(name, src, needle) {
    checks.push({
        name,
        ok: src.includes(needle),
        detail: `expected substring: ${JSON.stringify(needle)}`,
    });
}

function assertAbsent(name, src, needle) {
    checks.push({
        name,
        ok: !src.includes(needle),
        detail: `forbidden substring: ${JSON.stringify(needle)}`,
    });
}

// ---------------------------------------------------------------------------
// Sink 1: profit.js renderChart (historical chart)
// Chart.js owns the <canvas>; the function must not assign raw strings
// to an element's innerHTML. Bucket labels flow through dataset config,
// not DOM interpolation.
// ---------------------------------------------------------------------------
const renderChartStart = profit.indexOf('    renderChart() {');
const renderChartEnd = profit.indexOf('    renderSummary() {', renderChartStart);
const renderChartBody = renderChartStart >= 0 && renderChartEnd > renderChartStart
    ? profit.slice(renderChartStart, renderChartEnd)
    : '';
checks.push({
    name: 'sink1 renderChart body located',
    ok: renderChartBody.length > 0,
    detail: 'expected renderChart function body to be present',
});
checks.push({
    name: 'sink1 renderChart avoids raw innerHTML',
    ok: renderChartBody.length > 0 && !renderChartBody.includes('.innerHTML'),
    detail: 'renderChart must not touch .innerHTML — Chart.js writes to canvas',
});

// ---------------------------------------------------------------------------
// Sink 2: profit.js renderCostSplitChart (actual: renderCostBreakdown).
// Dynamic config fields must be sanitized before interpolation.
// ---------------------------------------------------------------------------
const rcbStart = profit.indexOf('renderCostBreakdown() {');
const rcbEnd = profit.indexOf('updateCostBreakdown() {', rcbStart);
const rcbBody = rcbStart >= 0 && rcbEnd > rcbStart ? profit.slice(rcbStart, rcbEnd) : '';
checks.push({
    name: 'sink2 renderCostBreakdown body located',
    ok: rcbBody.length > 0,
    detail: 'expected renderCostBreakdown body to be present',
});
assertPresent('sink2 cost.id wrapped', rcbBody, "costEditor.showEdit('${sanitize(cost.id)}')");
assertPresent('sink2 cost.name wrapped', rcbBody, '${sanitize(cost.name)}');
assertPresent('sink2 cost.value (pct branch) wrapped', rcbBody, "sanitize(cost.value) + '%'");
assertPresent('sink2 data-cost-id wrapped', rcbBody, 'data-cost-id="${sanitize(cost.id)}"');
assertAbsent('sink2 raw cost.id not present', rcbBody, "costEditor.showEdit('${cost.id}')");
assertAbsent('sink2 raw cost.name not present', rcbBody, '${cost.name}');

// ---------------------------------------------------------------------------
// Sink 3: profit.js profitConfig.render (renderCosts + renderComponents).
// ---------------------------------------------------------------------------
const rcStart = profit.indexOf('    renderCosts() {');
const rcEnd = profit.indexOf('    renderComponents() {', rcStart);
const rcBody = rcStart >= 0 && rcEnd > rcStart ? profit.slice(rcStart, rcEnd) : '';
const rcompStart = profit.indexOf('    renderComponents() {');
const rcompEnd = profit.indexOf('    addCost() {', rcompStart);
const rcompBody = rcompStart >= 0 && rcompEnd > rcompStart ? profit.slice(rcompStart, rcompEnd) : '';
checks.push({
    name: 'sink3 renderCosts body located',
    ok: rcBody.length > 0,
    detail: 'expected renderCosts body to be present',
});
checks.push({
    name: 'sink3 renderComponents body located',
    ok: rcompBody.length > 0,
    detail: 'expected renderComponents body to be present',
});
assertPresent('sink3 cost.id wrapped', rcBody, "profitConfig.editCost('${sanitize(cost.id)}')");
assertPresent('sink3 cost.name wrapped', rcBody, '${sanitize(cost.name)}');
assertPresent('sink3 cost.type wrapped', rcBody, '${sanitize(cost.type)}');
assertPresent('sink3 cost.basis wrapped', rcBody, '${sanitize(cost.basis)}');
assertAbsent('sink3 raw cost.name not present', rcBody, '${cost.name}');
assertAbsent('sink3 raw cost.id not present', rcBody, "profitConfig.editCost('${cost.id}')");

assertPresent('sink3 comp.id wrapped', rcompBody, "profitConfig.editComponent('${sanitize(comp.id)}')");
assertPresent('sink3 comp.partName wrapped', rcompBody, '${sanitize(comp.partName)}');
assertPresent('sink3 comp.sku wrapped', rcompBody, "${sanitize(comp.sku || 'N/A')}");
assertPresent('sink3 comp.quantity wrapped', rcompBody, '${sanitize(comp.quantity)}');
assertAbsent('sink3 raw comp.partName not present', rcompBody, '${comp.partName}');
assertAbsent('sink3 raw comp.id not present', rcompBody, "profitConfig.editComponent('${comp.id}')");

// ---------------------------------------------------------------------------
// Sink 4: profit.js recordSale.showEdit prefill.
// Form fields use .value = ... (safe by DOM API), and the dynamic cost
// container populated by applyStoredDatabaseBreakdown must sanitize
// dynamic fields before interpolation.
// ---------------------------------------------------------------------------
const asbStart = profit.indexOf('applyStoredDatabaseBreakdown(tx) {');
const asbEnd = profit.indexOf('    init() {', asbStart);
const asbBody = asbStart >= 0 && asbEnd > asbStart ? profit.slice(asbStart, asbEnd) : '';
checks.push({
    name: 'sink4 applyStoredDatabaseBreakdown body located',
    ok: asbBody.length > 0,
    detail: 'expected applyStoredDatabaseBreakdown body to be present',
});
assertPresent('sink4 bd.vatCountry wrapped', asbBody, "${sanitize(bd.vatCountry || '')}");
assertPresent('sink4 bd.vatRate wrapped', asbBody, '${sanitize(bd.vatRate || 21)}');
assertAbsent('sink4 raw bd.vatCountry not present', asbBody, "${bd.vatCountry || ''}");
assertAbsent('sink4 raw bd.vatRate not present', asbBody, '${bd.vatRate || 21}');

// showEdit itself should only use .value / .textContent for dynamic prefill —
// no unguarded innerHTML writes.
const seStart = profit.indexOf('    async showEdit(orderId) {');
const seEnd = profit.indexOf('    hide() {', seStart);
const seBody = seStart >= 0 && seEnd > seStart ? profit.slice(seStart, seEnd) : '';
checks.push({
    name: 'sink4 recordSale.showEdit body located',
    ok: seBody.length > 0,
    detail: 'expected recordSale.showEdit body to be present',
});
checks.push({
    name: 'sink4 recordSale.showEdit no direct innerHTML writes',
    ok: seBody.length > 0 && !/\.innerHTML\s*=/.test(seBody),
    detail: 'recordSale.showEdit must not assign to .innerHTML directly',
});

// ---------------------------------------------------------------------------
// Sink 5: labels.js printBulk container.
// Must not use `items.map(... ).join('')` assigned to innerHTML;
// use insertAdjacentHTML (or equivalent) per item.
// ---------------------------------------------------------------------------
const pbStart = labels.indexOf('printBulk(items) {');
const pbEnd = labels.indexOf('showPreview(items) {', pbStart);
const pbBody = pbStart >= 0 && pbEnd > pbStart ? labels.slice(pbStart, pbEnd) : '';
checks.push({
    name: 'sink5 printBulk body located',
    ok: pbBody.length > 0,
    detail: 'expected printBulk body to be present',
});
assertAbsent(
    'sink5 no joined-map innerHTML on container',
    pbBody,
    "printContainer.innerHTML = items.map"
);
assertPresent(
    'sink5 uses insertAdjacentHTML per-item',
    pbBody,
    "printContainer.insertAdjacentHTML('beforeend', this.createLabelHTML(item))"
);

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
let failed = 0;
for (const c of checks) {
    if (!c.ok) {
        failed++;
        console.error(`FAIL: ${c.name} — ${c.detail}`);
    }
}
const passed = checks.length - failed;
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
