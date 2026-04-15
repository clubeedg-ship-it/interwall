/**
 * =============================================================================
 * INTERWALL INVENTORY OS - App Initialization & Data Loading
 * =============================================================================
 */

// =============================================================================
// Data Loading
// =============================================================================
async function loadLocations() {
    try {
        const locs = await api.getLocations();
        state.locations.clear();
        locs.forEach(l => state.locations.set(l.name, l));
        console.log(`Loaded ${locs.length} locations`);
    } catch (e) {
        console.error('Failed to load locations:', e);
    }
}

async function loadParts() {
    try {
        const response = await api.getParts({ limit: 500 });
        const parts = response.results || response || [];
        state.parts.clear();
        parts.forEach(p => state.parts.set(p.pk, p));
        console.log(`Loaded ${parts.length} parts into state.parts`);

        // Check for duplicate part names (potential issue source)
        checkDuplicateParts();
    } catch (e) {
        console.error('Failed to load parts:', e);
    }
}

/**
 * Check for duplicate part names in inventory
 * Warns if parts with identical names exist (could cause confusion in dropdowns)
 */
function checkDuplicateParts() {
    const nameMap = new Map(); // name -> array of parts with that name

    state.parts.forEach((part, pk) => {
        const name = (part.name || '').toLowerCase().trim();
        if (!nameMap.has(name)) {
            nameMap.set(name, []);
        }
        nameMap.get(name).push({
            pk: part.pk,
            name: part.name,
            ipn: part.IPN || `PK-${part.pk}`
        });
    });

    // Find duplicates
    const duplicates = [];
    nameMap.forEach((parts, name) => {
        if (parts.length > 1) {
            duplicates.push({ name, parts });
        }
    });

    if (duplicates.length > 0) {
        console.warn('DUPLICATE PART NAMES DETECTED:');
        duplicates.forEach(d => {
            console.warn(`  "${d.name}": ${d.parts.map(p => `${p.ipn} (ID:${p.pk})`).join(', ')}`);
        });

        // Show warning to user (once per session)
        const warningShown = sessionStorage.getItem('duplicate_parts_warning');
        if (!warningShown) {
            sessionStorage.setItem('duplicate_parts_warning', 'true');
            notifications.show(
                `${duplicates.length} part(s) have duplicate names. Check console for details. Consider renaming or merging them.`,
                'warning',
                { timeout: 10000 }
            );
        }
    }
}

async function checkConnection() {
    try {
        const resp = await fetch('/api/health', { credentials: 'same-origin' });
        state.isConnected = resp.ok;
        console.log(state.isConnected ? 'API Connected' : 'API Offline');
    } catch {
        state.isConnected = false;
        console.warn('API Offline');
    }
}

// =============================================================================
// Clock
// =============================================================================
function updateClock() {
    const now = new Date();
    dom.clock.textContent = now.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });
}

// =============================================================================
// Keyboard Shortcuts
// =============================================================================
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        dom.binModal.classList.remove('active');
        dom.handshakeModal.classList.remove('active');
        document.getElementById('partModal')?.classList.remove('active');
        document.getElementById('deleteModal')?.classList.remove('active');
    }
});

// =============================================================================
// Initialize
// =============================================================================
async function init() {
    console.log('Interwall Inventory OS starting...');

    // Clock
    updateClock();
    setInterval(updateClock, 1000);

    // Theme
    theme.init();

    // Router
    router.init();

    // Zone Configuration
    zoneConfig.init();

    // Wall
    wall.init();

    // Modals
    binModal.init();
    binInfoModal.init();
    handshake.init();
    partManager.init();
    batchEditor.init();
    categoryManager.init();

    // Scanner
    scanner.init();

    // Alerts
    alerts.init();

    // Catalog
    catalog.init();

    // Compositions
    if (typeof compositions !== 'undefined') compositions.init();

    // Check for existing session (session cookie auth — no token in localStorage)
    const isValid = await auth.validateToken();
    if (isValid) {
        await auth.onAuthSuccess();
        return;
    }

    // Clean up any legacy inventree_token that may still exist from old system
    localStorage.removeItem('inventree_token');

    // Hide loading screen, show login modal
    const loader = document.getElementById('appLoader');
    if (loader) loader.classList.add('hidden');

    document.body.classList.add('not-authenticated');
    document.getElementById('loginModal').classList.add('active');
    document.getElementById('loginUser').focus();

    console.log('Waiting for authentication...');
}

// Expose bare functions on window for cross-module access
window.loadParts = loadParts;
window.loadLocations = loadLocations;
window.checkConnection = checkConnection;
window.updateClock = updateClock;
window.checkDuplicateParts = checkDuplicateParts;

// Expose zone modules globally for inline onclick handlers (already in zone-config.js/zone-manager.js)
// Kept here as well for compatibility
window.zoneConfig = zoneConfig;
window.zoneManager = zoneManager;

document.addEventListener('DOMContentLoaded', async () => {
    // Initialize UI structure first (creates DOM elements)
    await init();

    // Then handle authentication (which may populate those elements)
    await auth.init();
});
