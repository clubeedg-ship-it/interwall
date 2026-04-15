#!/usr/bin/env node
// T-C11d verifier: the orphaned BOM fixed-components editor is gone.
//
// Pre-deletion selectors we must scrub from index.html:
//   - id "fixedComponentsContainer"      (sale-modal container)
//   - id "fixedComponentsCostDisplay"    (cost-breakdown row)
//   - id "btnAddFixedComponent"          (add button in sale modal)
//   - id "fixedCompEditModal"            (editor modal)
//   - id "fixedCompEditForm"             (editor form)
//   - id "fixedCompEditTitle"
//   - id "fixedCompEditClose"
//   - id "fixedCompEditCancel"
//   - id "fixedCompPartSelect"
//   - id "fixedCompQty"
//   - id "fixedCompEnabled"
//   - id "fixedCompEditId"
//   - id "fixedCompDeleteBtn"
//   - id "configFixedComponentsList"     (profit-config popup list)
//   - class "fixed-components-section"
//   - class "fixed-components-header"
//   - class "fixed-components-list"
//   - class "fixed-components-info"
//   - class "fixed-components-empty"
//   - class "fixed-component-item"
//   - profitConfig.addComponent / editComponent wiring
//
// profit.js scrub:
//   - identifier fixedComponentsConfig
//   - identifier fixedComponentsEditor
//   - identifier fixedComponentsCost
//   - string literal "interwall_fixed_components"

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const profitSrc = readFileSync(resolve(here, 'profit.js'), 'utf8');
const indexSrc = readFileSync(resolve(here, 'index.html'), 'utf8');

const failures = [];

function mustNotMatch(src, needle, label) {
    const hit = typeof needle === 'string' ? src.includes(needle) : needle.test(src);
    if (hit) failures.push(`FAIL: ${label}`);
}

// --- profit.js ------------------------------------------------------------
mustNotMatch(profitSrc, /\bfixedComponentsConfig\b/,
    'profit.js still references fixedComponentsConfig');
mustNotMatch(profitSrc, /\bfixedComponentsEditor\b/,
    'profit.js still references fixedComponentsEditor');
mustNotMatch(profitSrc, /\bfixedComponentsCost\b/,
    'profit.js still references fixedComponentsCost');
mustNotMatch(profitSrc, 'interwall_fixed_components',
    'profit.js still references interwall_fixed_components');
mustNotMatch(profitSrc, /profitState\.fixedComponents\b/,
    'profit.js still references profitState.fixedComponents');
mustNotMatch(profitSrc, /\bisFixed\b/,
    'profit.js still references isFixed on components');
mustNotMatch(profitSrc, /renderFixedComponents\s*\(/,
    'profit.js still defines/calls renderFixedComponents');

// --- index.html -----------------------------------------------------------
const htmlIds = [
    'fixedComponentsContainer',
    'fixedComponentsCostDisplay',
    'btnAddFixedComponent',
    'fixedCompEditModal',
    'fixedCompEditForm',
    'fixedCompEditTitle',
    'fixedCompEditClose',
    'fixedCompEditCancel',
    'fixedCompPartSelect',
    'fixedCompQty',
    'fixedCompEnabled',
    'fixedCompEditId',
    'fixedCompDeleteBtn',
    'configFixedComponentsList',
];
for (const id of htmlIds) {
    mustNotMatch(indexSrc, `id="${id}"`, `index.html still has id="${id}"`);
}

const htmlClasses = [
    'fixed-components-section',
    'fixed-components-header',
    'fixed-components-list',
    'fixed-components-info',
    'fixed-components-empty',
    'fixed-component-item',
    'cost-item-fixed',
];
for (const cls of htmlClasses) {
    mustNotMatch(indexSrc, cls, `index.html still contains class/string "${cls}"`);
}

mustNotMatch(indexSrc, /profitConfig\.addComponent/,
    'index.html still wires profitConfig.addComponent');
mustNotMatch(indexSrc, /profitConfig\.editComponent/,
    'index.html still wires profitConfig.editComponent');

if (failures.length) {
    console.error(failures.join('\n'));
    console.error(`\n${failures.length} assertion(s) failed.`);
    process.exit(1);
}

console.log('T-C11d fixed-components retired verify: PASS');
