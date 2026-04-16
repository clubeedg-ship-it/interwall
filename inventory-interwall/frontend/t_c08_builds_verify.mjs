#!/usr/bin/env node
/**
 * T-C08 Builds source verifier.
 * Checks that all expected source artifacts exist and contain key markers.
 */
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const fe = resolve(root, 'frontend');

let ok = true;
function check(label, pass) {
    if (!pass) { console.error(`FAIL: ${label}`); ok = false; }
    else console.log(`OK:   ${label}`);
}

// 1. builds.js exists and exports window.builds
const buildsJs = resolve(fe, 'builds.js');
check('builds.js exists', existsSync(buildsJs));
const bjsContent = existsSync(buildsJs) ? readFileSync(buildsJs, 'utf8') : '';
check('builds.js exposes window.builds', bjsContent.includes('window.builds'));
check('builds.js calls api.listBuilds', bjsContent.includes('api.listBuilds'));
check('builds.js calls api.listItemGroups', bjsContent.includes('api.listItemGroups'));
check('builds.js calls api.listExternalXrefs', bjsContent.includes('api.listExternalXrefs'));

// 2. api.js has builds/item-groups/external-xref helpers
const apiJs = resolve(fe, 'api.js');
const apiContent = readFileSync(apiJs, 'utf8');
check('api.js has listBuilds', apiContent.includes('listBuilds'));
check('api.js has listItemGroups', apiContent.includes('listItemGroups'));
check('api.js has listExternalXrefs', apiContent.includes('listExternalXrefs'));
check('api.js has createExternalXref', apiContent.includes('createExternalXref'));
check('api.js has deleteExternalXref', apiContent.includes('deleteExternalXref'));

// 3. index.html has builds view and nav
const indexHtml = resolve(fe, 'index.html');
const htmlContent = readFileSync(indexHtml, 'utf8');
check('index.html has view-builds section', htmlContent.includes('id="view-builds"'));
check('index.html has builds nav button', htmlContent.includes('data-view="builds"'));
check('index.html loads builds.js', htmlContent.includes('builds.js'));

// 4. router.js has builds title
const routerJs = resolve(fe, 'router.js');
const routerContent = readFileSync(routerJs, 'utf8');
check('router.js has builds title', routerContent.includes("builds: 'Builds'"));

// 5. style.css has builds styles
const styleCss = resolve(fe, 'style.css');
const styleContent = readFileSync(styleCss, 'utf8');
check('style.css has .builds-workspace', styleContent.includes('.builds-workspace'));

// 6. compositions.js untouched (check it exists — we don't diff here)
check('compositions.js exists', existsSync(resolve(fe, 'compositions.js')));

// 7. No backend files changed (verify by absence of markers we'd add)
// This is a passive check — the diff command in PLAN.md does the real check.

if (!ok) { console.error('\nVerification FAILED'); process.exit(1); }
console.log('\nAll T-C08 source checks passed.');
