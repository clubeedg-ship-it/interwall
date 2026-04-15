/**
 * =============================================================================
 * INTERWALL INVENTORY OS - Shelf Configuration - Per-Shelf Settings for Bin A/B FIFO Logic
 * =============================================================================
 */

// =============================================================================
// Shelf Configuration - Per-Shelf Settings for Bin A/B FIFO Logic
// =============================================================================
const shelfConfig = {
    STORAGE_KEY: 'interwall_shelf_config',
    config: {},

    init() {
        console.log('shelfConfig.init() called');
        this.load();
        console.log(`Shelf Config: Loaded ${Object.keys(this.config).length} shelf configurations`);
    },

    load() {
        try {
            const stored = localStorage.getItem(this.STORAGE_KEY);
            if (stored) {
                this.config = JSON.parse(stored);
            }
        } catch (e) {
            console.error('Failed to load shelf config:', e);
            this.config = {};
        }
    },

    save() {
        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.config));
            console.log('Shelf config saved');
        } catch (e) {
            console.error('Failed to save shelf config:', e);
        }
    },

    /**
     * Extract shelf ID from cell ID (removes bin suffix)
     * 'A-1-3-A' → 'A-1-3'
     * 'B-4-7' → 'B-4-7' (already a shelf ID for single bin shelves)
     */
    getShelfId(cellId) {
        const parts = cellId.split('-');
        // Cell IDs have 4 parts: Zone-Col-Level-Bin (e.g., A-1-3-A)
        // Shelf IDs have 3 parts: Zone-Col-Level (e.g., A-1-3)
        if (parts.length === 4) {
            return parts.slice(0, 3).join('-');
        }
        return cellId; // Already a shelf ID
    },

    /**
     * Get configuration for a specific shelf
     */
    getShelfConfig(shelfId) {
        return this.config[shelfId] || {
            splitFifo: false,      // When true: A & B hold different products, no auto-transfer
            splitBins: false,       // When true: No A/B division, single bin for entire shelf
            capacities: {}          // Per-product capacities: { partId: { binA: qty, binB: qty } }
        };
    },

    /**
     * Update configuration for a specific shelf
     */
    setShelfConfig(shelfId, updates) {
        if (!this.config[shelfId]) {
            this.config[shelfId] = {
                splitFifo: false,
                splitBins: false,
                capacities: {}
            };
        }
        Object.assign(this.config[shelfId], updates);
        this.save();
    },

    /**
     * Check if shelf has Split FIFO mode enabled
     */
    isSplitFifo(shelfId) {
        return this.getShelfConfig(shelfId).splitFifo;
    },

    /**
     * Check if shelf has Single Bin mode (no A/B separation)
     */
    isSplitBins(shelfId) {
        return this.getShelfConfig(shelfId).splitBins;
    },

    /**
     * Toggle Split FIFO mode for a shelf
     */
    toggleSplitFifo(shelfId, enabled) {
        this.setShelfConfig(shelfId, { splitFifo: enabled });
        console.log(`Split FIFO ${enabled ? 'enabled' : 'disabled'} for ${shelfId}`);
    },

    /**
     * Toggle Single Bin mode for a shelf
     */
    toggleSplitBins(shelfId, enabled) {
        this.setShelfConfig(shelfId, { splitBins: enabled });
        console.log(`Single Bin mode ${enabled ? 'enabled' : 'disabled'} for ${shelfId}`);
    },

    /**
     * Get all unique shelves from locations
     */
    getAllShelves() {
        const shelves = new Set();
        for (const [name] of state.locations) {
            const shelfId = this.getShelfId(name);
            if (shelfId && shelfId.split('-').length >= 3) {
                shelves.add(shelfId);
            }
        }
        return [...shelves].sort();
    }
};

window.shelfConfig = shelfConfig;
