/**
 * =============================================================================
 * INTERWALL INVENTORY OS - Zone Manager - UI for Zone Configuration
 * =============================================================================
 *
 * T-C03: zones are persisted by /api/zones. This module handles the form
 * and delegates all mutations to zoneConfig, which calls api.request.
 * Column/level counts are shelf-derived server-side; the form still shows
 * them for display, but they are not part of POST/PATCH payloads.
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
        if (helpEl) helpEl.textContent = 'Dimensions are shelf-derived; see shelves to change the grid.';

        document.getElementById('zoneConfigModal').classList.add('active');
    },

    closeConfigModal() {
        document.getElementById('zoneConfigModal').classList.remove('active');
        this.currentZone = null;
    },

    applyTemplate(templateName) {
        const template = zoneConfig.TEMPLATES[templateName];
        if (!template) return;

        // Only updates the form DOM — POST/PATCH do not accept cols/levels.
        document.getElementById('zoneConfigColumns').value = template.columns;
        document.getElementById('zoneConfigLevels').value = template.levels;
    },

    async submitConfig(e) {
        e.preventDefault();

        const name = document.getElementById('zoneConfigName').value.trim().toUpperCase();

        // Validation — a zone name is a single uppercase letter.
        if (!/^[A-Z]$/.test(name)) {
            notifications.show('Zone name must be a single letter (A-Z)', 'error');
            return;
        }

        if (this.currentZone) {
            // Existing zone: T-C03 cannot change cols/levels via /api/zones.
            // Nothing to PATCH here unless we expose rename/deactivate in
            // the form later. Close the modal with an informative toast.
            this.closeConfigModal();
            notifications.show(
                'Zone dimensions are shelf-derived; edit shelves to change the grid.',
                'info'
            );
            wall.render();
            await wall.loadLiveData();
            return;
        }

        // New zone: POST /api/zones. No InvenTree location calls — shelves
        // are seeded via DB migration / separate tooling, not from the UI.
        const success = await zoneConfig.add({ name });
        if (success) {
            this.closeConfigModal();
            if (typeof partForm !== 'undefined' && partForm.populateLocations) {
                partForm.populateLocations();
            }
            wall.render();
            await wall.loadLiveData();
        }
    },

    confirmDelete(zoneName) {
        const zone = zoneConfig.getZone(zoneName);
        if (!zone) return;

        this.currentZone = zone;
        const cellCount = (zone.columns || 0) * (zone.levels || 0);

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

        // zoneConfig.delete surfaces a not-supported toast — T-C03 ships
        // without DELETE /api/zones. Close the modal either way.
        await zoneConfig.delete(this.currentZone.name);
        this.closeDeleteModal();
    }
};

window.zoneManager = zoneManager;
