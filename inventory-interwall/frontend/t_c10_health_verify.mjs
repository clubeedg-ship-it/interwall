#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const read = (name) => readFileSync(join(here, name), 'utf8');

const healthSrc = read('health.js');
const apiSrc = read('api.js');
const routerSrc = read('router.js');
const indexSrc = read('index.html');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function includesAll(source, labels) {
  return labels.every((label) => source.includes(label));
}

console.log('\n--- T-C10 health verify ---\n');

assert(
  includesAll(healthSrc, ['const health = {', 'async init()', 'async render()', 'window.health = health;']),
  'health.js must expose a split-module surface with init/render and window.health'
);

assert(
  includesAll(apiSrc, [
    'async getHealth()',
    'async pingHealth()',
    'async getHealthOrphansPartsWithoutShelf()',
    'async getHealthOrphansPartsWithoutReorder()',
    'async getHealthOrphansBuildsWithoutXref()',
    'async getHealthSalesWithoutLedger()',
    'async getHealthIngestionStatus()',
    'async getHealthIngestionDeadLetter()',
  ]),
  'api.js must expose health helpers for each endpoint the page uses'
);

assert(
  routerSrc.includes("health: 'Health'") &&
  routerSrc.includes("if (view === 'health' && typeof health !== 'undefined')") &&
  routerSrc.includes("if (targetView === 'health' && typeof health !== 'undefined')"),
  'router.js must register the #health route and lazy-init the module'
);

const batchesIdx = indexSrc.indexOf('<script src="batches.js');
const healthIdx = indexSrc.indexOf('<script src="health.js');
const appInitIdx = indexSrc.indexOf('<script src="app-init.js');
assert(batchesIdx !== -1 && healthIdx !== -1 && appInitIdx !== -1, 'index.html must load batches.js, health.js, and app-init.js');
assert(batchesIdx < healthIdx && healthIdx < appInitIdx, 'health.js must load after batches.js and before app-init.js');
assert(indexSrc.includes('data-view="health"') && indexSrc.includes('id="view-health"'), 'index.html must register the health nav item and view');

assert(!healthSrc.includes('innerHTML'), 'health.js must avoid innerHTML so dynamic fields stay sanitized');

console.log('T-C10 verify passed');
