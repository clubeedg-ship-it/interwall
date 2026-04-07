/**
 * =============================================================================
 * INTERWALL INVENTORY OS - Zone Configuration Manager
 * =============================================================================
 */

// =============================================================================
// Zone Configuration Manager
// =============================================================================
const zoneConfig = {
    STORAGE_KEY: 'interwall_zones',
    TEMPLATES: {
        small: { columns: 3, levels: 5 },
        standard: { columns: 4, levels: 7 },
        large: { columns: 6, levels: 10 }
    },

    init() {
        console.log('zoneConfig.init() called');

        // Migration: Clear incompatible old zone data from pre-Phase 5
        const ZONE_VERSION = '2'; // Phase 5 localStorage format
        const storedVersion = localStorage.getItem('interwall_zone_version');

        if (storedVersion !== ZONE_VERSION) {
            console.log('Migrating zone config to v2... (clearing old incompatible data)');
            localStorage.removeItem('interwall_zones');
            localStorage.setItem('interwall_zone_version', ZONE_VERSION);
            // After migration, force reload of defaults
            state.zones = CONFIG.DEFAULT_ZONES;
            this.save();
            console.log('Migration complete - defaults restored:', state.zones);
            return; // Skip load() since we just set defaults
        }

        this.load();
        console.log(`After load, state.zones =`, state.zones);
        if (state.zones.length === 0) {
            // First time - use defaults
            console.log(' No zones found, loading defaults:', CONFIG.DEFAULT_ZONES);
            state.zones = CONFIG.DEFAULT_ZONES;
            this.save();
        }

        // Fix layout positions: ensure max 2 zones per row
        let needsSave = false;
        state.zones.forEach((zone, index) => {
            const correctRow = Math.floor(index / 2);
            const correctCol = index % 2;
            if (zone.layoutRow !== correctRow || zone.layoutCol !== correctCol) {
                console.log(`Fixing layout for zone ${zone.name}: row ${zone.layoutRow}->${correctRow}, col ${zone.layoutCol}->${correctCol}`);
                zone.layoutRow = correctRow;
                zone.layoutCol = correctCol;
                needsSave = true;
            }
        });
        if (needsSave) {
            this.save();
            console.log('Zone layouts corrected and saved');
        }

        console.log(`Zone Config: Loaded ${state.zones.length} zones`, state.zones);
    },

    load() {
        try {
            const stored = localStorage.getItem(this.STORAGE_KEY);
            if (stored) {
                state.zones = JSON.parse(stored);
            }
        } catch (e) {
            console.error('Failed to load zone config:', e);
            state.zones = [];
        }
    },

    save() {
        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(state.zones));
            console.log('Zone config saved');
        } catch (e) {
            console.error('Failed to save zone config:', e);
            notifications.show('Failed to save zone configuration', 'error');
        }
    },

    add(zoneData) {
        // Validate zone name is unique
        if (state.zones.find(z => z.name === zoneData.name)) {
            notifications.show(`Zone ${zoneData.name} already exists`, 'error');
            return false;
        }

        state.zones.push({
            name: zoneData.name,
            columns: parseInt(zoneData.columns),
            levels: parseInt(zoneData.levels),
            layoutRow: parseInt(zoneData.layoutRow || 0),
            layoutCol: parseInt(zoneData.layoutCol || state.zones.length),
            isActive: true
        });

        this.save();
        notifications.show(`Zone ${zoneData.name} created`, 'success');
        return true;
    },

    update(zoneName, updates) {
        const zone = state.zones.find(z => z.name === zoneName);
        if (!zone) {
            notifications.show(`Zone ${zoneName} not found`, 'error');
            return false;
        }

        Object.assign(zone, updates);
        this.save();
        notifications.show(`Zone ${zoneName} updated`, 'success');
        return true;
    },

    delete(zoneName) {
        const index = state.zones.findIndex(z => z.name === zoneName);
        if (index === -1) {
            notifications.show(`Zone ${zoneName} not found`, 'error');
            return false;
        }

        state.zones.splice(index, 1);
        this.save();
        notifications.show(`Zone ${zoneName} deleted`, 'success');
        return true;
    },

    getZone(zoneName) {
        return state.zones.find(z => z.name === zoneName);
    },

    getAllZones() {
        return state.zones.filter(z => z.isActive);
    },

    applyTemplate(templateName, targetZone) {
        const template = this.TEMPLATES[templateName];
        if (!template) return false;

        if (targetZone) {
            this.update(targetZone.name, template);
        }
        return template;
    }
};

window.zoneConfig = zoneConfig;
