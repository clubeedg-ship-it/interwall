/**
 * =============================================================================
 * INTERWALL INVENTORY OS - Configuration, State, DOM Helpers
 * =============================================================================
 */

// =============================================================================
// Configuration
// =============================================================================
const CONFIG = {
    // Check for runtime config (from env.js) or fallback to default
    API_BASE: (window.ENV && window.ENV.API_BASE) ? window.ENV.API_BASE : '',
    API_TOKEN: null,
    REFRESH_INTERVAL: 30000,
    SCAN_TIMEOUT: 100,  // Reduced for faster scanner detection
    SCAN_AUDIO_ENABLED: true,  // User preference for beep
    // Zone configuration now loaded dynamically from localStorage
    // Default zones if none configured
    DEFAULT_ZONES: [
        { name: 'A', columns: 4, levels: 7, layoutRow: 0, layoutCol: 0, isActive: true },
        { name: 'B', columns: 4, levels: 7, layoutRow: 0, layoutCol: 1, isActive: true }
    ],
    POWER_SUPPLY_COLUMN: 'B-4'
};

// =============================================================================
// Business Thresholds & Defaults (D-045)
// =============================================================================
const THRESHOLDS = {
    STOCK_CRITICAL: 5,          // qty at/below which wall cell is "critical"
    STOCK_WARNING: 15,          // qty at/below which wall cell is "warning"
    BIN_LOW_FILL_PERCENT: 20,   // fill% below which bin-info flags low
    LOW_STOCK_RATIO: 0.5,       // catalog low-stock = inStock < minStock * ratio
};

const DEFAULTS = {
    VAT_RATE: 21,               // default VAT percentage (NL) when backend absent
    COMMISSION_PCT: 6.2,        // default commission percentage
    COMMISSION_RATE: 0.062,     // default commission as rate (legacy PROFIT_CONFIG fallback)
    OVERHEAD_FIXED: 95.00,      // default fixed overhead amount
};

window.THRESHOLDS = THRESHOLDS;
window.DEFAULTS = DEFAULTS;

// =============================================================================
// State
// =============================================================================
const state = {
    currentView: 'wall',
    locations: new Map(),
    parts: new Map(),
    zones: [], // Dynamic zone configuration loaded from localStorage
    isConnected: false,
    scanBuffer: '',
    scanTimer: null,
    selectedPart: null,
    // Pagination State
    catalog: {
        results: [],
        next: null,
        count: 0,
        loading: false
    }
};

// Expose state globally for cross-file access (profit.js, etc.)
window.state = state;

// =============================================================================
// XSS Sanitization Utility
// =============================================================================
function sanitize(str) {
    if (str === null || str === undefined) return '';
    const el = document.createElement('div');
    el.appendChild(document.createTextNode(String(str)));
    return el.innerHTML;
}
window.sanitize = sanitize;

// =============================================================================
// DOM Elements
// =============================================================================
const $ = (id) => document.getElementById(id);
const $$ = (sel) => document.querySelectorAll(sel);

const dom = {
    // Views
    views: $$('.view'),
    navItems: $$('.nav-item[data-view]'),
    viewTitle: $('viewTitle'),

    // Wall
    wallGrid: $('wallGrid'),

    // Header
    clock: $('clock'),
    scanStatus: $('scanStatus'),
    scanText: $('scanText'),

    // Modals
    binModal: $('binModal'),
    binModalClose: $('binModalClose'),
    binModalTitle: $('binModalTitle'),
    binModalSubtitle: $('binModalSubtitle'),
    binAContent: $('binAContent'),
    binBContent: $('binBContent'),

    handshakeModal: $('handshakeModal'),
    handshakeClose: $('handshakeClose'),
    handshakeAction: $('handshakeAction'),
    handshakePartName: $('handshakePartName'),
    handshakeSKU: $('handshakeSKU'),
    handshakeForm: $('handshakeForm'),
    inputQty: $('inputQty'),
    inputPrice: $('inputPrice'),
    inputBin: $('inputBin'),
    successFeedback: $('successFeedback'),

    // Toast
    toast: $('toast'),
    toastMessage: $('toastMessage'),

    // Catalog
    catalogSearch: $('catalogSearch'),
    catalogGrid: $('catalogGrid')
};

// =============================================================================
// Tenant-Aware Query Builder
// =============================================================================
function buildTenantQuery(baseParams = {}) {
    const tenantFilter = (typeof tenant !== 'undefined' && tenant.current) ? tenant.getFilter() : {};
    const merged = { ...baseParams, ...tenantFilter };
    const query = new URLSearchParams(merged).toString();
    return query ? `?${query}` : '';
}

// Expose globals
window.CONFIG = CONFIG;
window.$ = $;
window.$$ = $$;
window.dom = dom;
window.buildTenantQuery = buildTenantQuery;
