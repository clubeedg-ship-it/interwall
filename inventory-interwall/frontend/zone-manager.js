/**
 * =============================================================================
 * INTERWALL INVENTORY OS - Zone Manager - UI for Zone Configuration
 * =============================================================================
 */

// =============================================================================
// Zone Manager - UI for Zone Configuration
// =============================================================================
const zoneManager = {
    currentZone: null,

    showAddModal() {
        this.currentZone = null;
        document.getElementById('zoneConfigTitle').textContent = 'Add New Zone';
        document.getElementById('zoneConfigForm').reset();
        document.getElementById('zoneConfigName').disabled = false;

        // Calculate next available zone letter
        const existingZones = state.zones.map(z => z.name).sort();
        const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        let nextZone = 'C'; // Default if A and B exist

        for (let i = 0; i < alphabet.length; i++) {
            if (!existingZones.includes(alphabet[i])) {
                nextZone = alphabet[i];
                break;
            }
        }

        // Pre-fill with suggested zone name
        document.getElementById('zoneConfigName').value = nextZone;
        document.getElementById('zoneConfigName').placeholder = nextZone;

        // Update help text to show existing zones
        const helpText = existingZones.length > 0
            ? `Existing zones: ${existingZones.join(', ')}. Suggested: ${nextZone}`
            : `Single letter (A-Z). Suggested: ${nextZone}`;

        const helpEl = document.querySelector('#zoneConfigName + .form-help');
        if (helpEl) helpEl.textContent = helpText;

        document.getElementById('zoneConfigModal').classList.add('active');
    },

    configureZone(zoneName) {
        const zone = zoneConfig.getZone(zoneName);
        if (!zone) return;

        this.currentZone = zone;
        document.getElementById('zoneConfigTitle').textContent = `Configure Zone ${zoneName}`;
        document.getElementById('zoneConfigName').value = zone.name;
        document.getElementById('zoneConfigName').disabled = true; // Can't change zone name
        document.getElementById('zoneConfigColumns').value = zone.columns;
        document.getElementById('zoneConfigLevels').value = zone.levels;

        // Reset help text for editing mode
        const helpEl = document.querySelector('#zoneConfigName + .form-help');
        if (helpEl) helpEl.textContent = 'Zone name cannot be changed';

        document.getElementById('zoneConfigModal').classList.add('active');
    },

    closeConfigModal() {
        document.getElementById('zoneConfigModal').classList.remove('active');
        this.currentZone = null;
    },

    applyTemplate(templateName) {
        const template = zoneConfig.TEMPLATES[templateName];
        if (!template) return;

        document.getElementById('zoneConfigColumns').value = template.columns;
        document.getElementById('zoneConfigLevels').value = template.levels;
    },

    /**
     * Create InvenTree stock locations for a new zone
     * Creates: Zone-X, X-1...X-N columns, X-1-1...X-N-M shelves, X-1-1-A/B bins
     */
    async createZoneLocations(zoneName, columns, levels) {
        try {
            notifications.show(`Creating locations for Zone ${zoneName}...`, 'info');

            // Find or create Warehouse root
            let warehouse = await api.getLocationByName('Warehouse');
            if (!warehouse) {
                warehouse = await api.createLocation('Warehouse', 'Main warehouse - Lean Inventory System');
            }
            const warehouseId = warehouse.pk;

            // Create Zone-X
            const zoneLocation = await api.createLocation(
                `Zone-${zoneName}`,
                `Zone ${zoneName} - Dynamic Zone`,
                warehouseId
            );
            const zoneId = zoneLocation?.pk;
            if (!zoneId) {
                throw new Error(`Failed to create Zone-${zoneName}`);
            }

            let createdCount = 0;

            // Create columns: X-1, X-2, etc.
            for (let col = 1; col <= columns; col++) {
                const colName = `${zoneName}-${col}`;
                const colLocation = await api.createLocation(
                    colName,
                    `Column ${col} in Zone ${zoneName}`,
                    zoneId
                );
                const colId = colLocation?.pk;
                if (!colId) continue;

                // Create shelves: X-1-1, X-1-2, etc.
                for (let level = 1; level <= levels; level++) {
                    const shelfName = `${colName}-${level}`;
                    const shelfLocation = await api.createLocation(
                        shelfName,
                        `Level ${level} (1=Bottom)`,
                        colId
                    );
                    const shelfId = shelfLocation?.pk;
                    if (!shelfId) continue;

                    // Create bins A and B
                    await api.createLocation(
                        `${shelfName}-A`,
                        'IN - New Stock (FIFO: Use Last)',
                        shelfId
                    );
                    await api.createLocation(
                        `${shelfName}-B`,
                        'OUT - Old Stock (FIFO: Use First)',
                        shelfId
                    );

                    createdCount += 2;
                }
            }

            // Reload locations into state
            await loadLocations();

            notifications.show(`Zone ${zoneName} created with ${createdCount} bins`, 'success');
            return true;
        } catch (e) {
            console.error('Failed to create zone locations:', e);
            notifications.show(`Failed to create Zone ${zoneName} locations: ${e.message}`, 'error');
            return false;
        }
    },

    async submitConfig(e) {
        e.preventDefault();

        const name = document.getElementById('zoneConfigName').value.trim().toUpperCase();
        const columns = parseInt(document.getElementById('zoneConfigColumns').value);
        const levels = parseInt(document.getElementById('zoneConfigLevels').value);

        // Validation
        if (!/^[A-Z]$/.test(name)) {
            notifications.show('Zone name must be a single letter (A-Z)', 'error');
            return;
        }

        if (columns < 1 || columns > 10) {
            notifications.show('Columns must be between 1 and 10', 'error');
            return;
        }

        if (levels < 1 || levels > 15) {
            notifications.show('Levels must be between 1 and 15', 'error');
            return;
        }

        // Add or update zone
        let success;
        if (this.currentZone) {
            // Update existing zone
            success = zoneConfig.update(this.currentZone.name, { columns, levels });
            if (success) {
                this.closeConfigModal();
                wall.render();
                wall.loadLiveData();
            }
        } else {
            // Add new zone
            // Calculate layout position: max 2 zones per row
            const zoneIndex = state.zones.length;
            const layoutRow = Math.floor(zoneIndex / 2);  // 0-1 in row 0, 2-3 in row 1, etc.
            const layoutCol = zoneIndex % 2;              // Alternates 0, 1, 0, 1...

            // First add to frontend config
            success = zoneConfig.add({
                name,
                columns,
                levels,
                layoutRow,
                layoutCol
            });

            if (success) {
                this.closeConfigModal();

                // Create InvenTree backend locations
                const locationsCreated = await this.createZoneLocations(name, columns, levels);
                if (!locationsCreated) {
                    notifications.show(`Zone ${name} added but backend locations may be incomplete`, 'warning');
                }

                // Re-populate location dropdown for part creation
                partForm.populateLocations();

                wall.render();
                wall.loadLiveData();
            }
        }
    },

    confirmDelete(zoneName) {
        const zone = zoneConfig.getZone(zoneName);
        if (!zone) return;

        this.currentZone = zone;
        const cellCount = zone.columns * zone.levels;

        document.getElementById('deleteZoneName').textContent = zoneName;
        document.getElementById('deleteZoneNameRepeat').textContent = zoneName;
        document.getElementById('deleteZoneCellCount').textContent = cellCount;
        document.getElementById('deleteZoneConfirmWipe').checked = false;
        document.getElementById('deleteZoneBtn').disabled = true;

        document.getElementById('zoneDeleteModal').classList.add('active');
    },

    closeDeleteModal() {
        document.getElementById('zoneDeleteModal').classList.remove('active');
        this.currentZone = null;
    },

    onConfirmCheckChange(checked) {
        document.getElementById('deleteZoneBtn').disabled = !checked;
    },

    async executeDelete() {
        if (!this.currentZone) return;

        const success = zoneConfig.delete(this.currentZone.name);
        if (success) {
            this.closeDeleteModal();
            wall.render();
        }
    }
};

window.zoneManager = zoneManager;
