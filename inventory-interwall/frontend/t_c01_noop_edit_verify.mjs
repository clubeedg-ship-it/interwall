#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const profitPath = path.resolve('inventory-interwall/frontend/profit.js');
const source = fs.readFileSync(profitPath, 'utf8');

const fetchCalls = [];
const storage = new Map();
const elements = new Map();

function makeElement() {
    return {
        value: '',
        textContent: '',
        className: '',
        style: {},
        innerHTML: '',
        disabled: false,
        dataset: {},
        classList: {
            add() {},
            remove() {},
            toggle() {},
            contains() { return false; },
        },
        addEventListener() {},
        appendChild() {},
        querySelector() { return null; },
        querySelectorAll() { return []; },
        focus() {},
    };
}

const documentMock = {
    getElementById(id) {
        if (!elements.has(id)) elements.set(id, makeElement());
        return elements.get(id);
    },
    querySelector() {
        return makeElement();
    },
    querySelectorAll() {
        return [];
    },
    createElement() {
        return makeElement();
    },
    addEventListener() {},
    body: makeElement(),
    documentElement: {
        getAttribute() { return 'dark'; },
    },
};

const context = vm.createContext({
    console,
    document: documentMock,
    window: {},
    Chart: function Chart() {},
    state: { parts: new Map() },
    api: { request: async () => ({}) },
    loadParts: async () => {},
    costEditor: { init() {} },
    fixedComponentsEditor: { init() {} },
    profitConfig: { init() {} },
    toast: {
        logs: [],
        show(message, type = 'info') {
            this.logs.push({ message, type });
        },
    },
    localStorage: {
        getItem(key) {
            return storage.has(key) ? storage.get(key) : null;
        },
        setItem(key, value) {
            storage.set(key, String(value));
        },
        removeItem(key) {
            storage.delete(key);
        },
    },
    fetch: async (url, options = {}) => {
        fetchCalls.push({ url, options });
        return {
            ok: true,
            async json() { return []; },
            async text() { return ''; },
        };
    },
    setTimeout,
    clearTimeout,
    Date,
    Math,
    performance: { now: () => 0 },
    confirm: () => true,
    location: { reload() {} },
    __fetchCalls: fetchCalls,
});

vm.runInContext(source, context, { filename: 'profit.js' });

const result = await vm.runInContext(`
    (async () => {
        const immutableMargin = 42.5;
        const immutableCost = 57.5;
        const immutableSale = 100.0;

        profitState.transactions = [{
            dbId: 'txn-1',
            orderId: 'ORDER-1',
            date: '2026-04-15T00:00:00Z',
            productName: 'Widget',
            sale: immutableSale,
            cost: immutableCost,
            margin: immutableMargin,
            components: [],
            costBreakdown: {
                manualComponents: 40,
                fixedComponents: 0,
                components: 40,
                commission: 4,
                commissionRate: 0.04,
                staticOverhead: 3,
                vat: 10.5,
                vatRate: 21,
                vatCountry: 'NL',
            },
            source: 'database',
        }];
        profitState.totalMargin = immutableMargin;

        recordSale.currentEditOrderId = 'ORDER-1';
        recordSale.currentEditSource = 'database';
        document.getElementById('saleProductName').value = 'Widget';
        document.getElementById('salePrice').value = String(immutableSale);

        let hideCalls = 0;
        recordSale.hide = () => { hideCalls += 1; };

        await recordSale.submit({ preventDefault() {} });

        const patchCalls = __fetchCalls.filter(call =>
            String(call.url).includes('/api/profit/transactions/') &&
            String(call.options && call.options.method || 'GET').toUpperCase() === 'PATCH'
        ).length;

        return {
            before: immutableMargin,
            after: profitState.transactions[0].margin,
            patchCalls,
            hideCalls,
            toast: toast.logs[toast.logs.length - 1] || null,
        };
    })()
`, context);

const marginEqual = Math.abs(result.before - result.after) < 0.0001;
const patchSkipped = result.patchCalls === 0;
const modalClosed = result.hideCalls === 1;

if (!marginEqual || !patchSkipped || !modalClosed) {
    console.error('T-C01 VERIFY FAILED', JSON.stringify(result));
    process.exit(1);
}

console.log(`T-C01 NOOP EDIT VERIFIED margin_before=${result.before.toFixed(2)} margin_after=${result.after.toFixed(2)} patch_calls=${result.patchCalls}`);
