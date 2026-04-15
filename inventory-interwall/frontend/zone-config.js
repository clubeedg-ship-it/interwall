/**
 * =============================================================================
 * INTERWALL INVENTORY OS - Zone Configuration Manager
 * =============================================================================
 *
 * T-C03 (D-040, D-045): zones live on the backend. This module keeps an
 * in-memory cache of `/api/zones`; localStorage is no longer consulted.
 * Per-zone column/level counts are shelf-derived server-side, so the
 * wall grid always matches real geometry.
 */

// =============================================================================
// Zone Configuration Manager
// =============================================================================
const zoneConfig = {
    TEMPLATES: {
        small: { columns: 3, levels: 5 },
        standard: { columns: 4, levels: 7 },
        large: { columns: 6, levels: 10 }
    },

    init() {
        // The API requires a session, so we cannot fetch here. Real load
        // happens in zoneConfig.load(), invoked by wall.loadLiveData()
        // after auth.onAuthSuccess().
        if (!Array.isArray(state.zones)) state.zones = [];
        console.log('zoneConfig.init() — awaiting first load from /api/zones');
    },

    async load() {
        try {
            const rows = await api.request('/api/zones', { method: 'GET' });
            const list = Array.isArray(rows) ? rows : [];
            state.zones = list.map((z, index) => ({
                id: z.id,
                name: z.name,
                columns: z.cols,
                levels: z.levels,
                shelvesCount: z.shelves_count,
                // Synthesise a 2-per-row grid layout until the server
                // owns layout metadata (out of scope for T-C03).
                layoutRow: Math.floor(index / 2),
                layoutCol: index % 2,
                isActive: true,
            }));
            console.log(`Zone Config: loaded ${state.zones.length} zones from /api/zones`, state.zones);
        } catch (e) {
            console.error('Failed to load zones from /api/zones:', e);
            state.zones = [];
        }
    },

    async add(zoneData) {
        try {
            await api.request('/api/zones', {
                method: 'POST',
                body: JSON.stringify({
                    name: zoneData.name,
                    is_active: true,
                }),
            });
            await this.load();
            notifications.show(`Zone ${zoneData.name} created`, 'success');
            return true;
        } catch (e) {
            const msg = /already exists/i.test(e.message)
                ? `Zone ${zoneData.name} already exists`
                : `Failed to create zone: ${e.message}`;
            notifications.show(msg, 'error');
            return false;
        }
    },

    async update(zoneName, updates) {
        const zone = state.zones.find(z => z.name === zoneName);
        if (!zone) {
            notifications.show(`Zone ${zoneName} not found`, 'error');
            return false;
        }
        const patch = {};
        if (updates.name !== undefined) patch.name = updates.name;
        if (updates.isActive !== undefined) patch.is_active = updates.isActive;
        if (Object.keys(patch).length === 0) {
            // columns/levels are shelf-derived now — no API surface accepts them.
            notifications.show(
                'Zone dimensions are now shelf-derived; edit shelves to change the grid.',
                'info'
            );
            return false;
        }
        try {
            await api.request(`/api/zones/${zone.id}`, {
                method: 'PATCH',
                body: JSON.stringify(patch),
            });
            await this.load();
            notifications.show(`Zone ${zoneName} updated`, 'success');
            return true;
        } catch (e) {
            notifications.show(`Failed to update zone: ${e.message}`, 'error');
            return false;
        }
    },

    async delete(zoneName) {
        // T-C03 intentionally ships without DELETE /api/zones — shelf
        // cascade semantics need a dedicated design packet.
        notifications.show(
            `Zone deletion is not supported yet (needs shelf-cascade design).`,
            'error'
        );
        return false;
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
            // Template only updates the form DOM — server does not accept
            // cols/levels on zone POST/PATCH. See zoneManager.applyTemplate.
            Object.assign(targetZone, template);
        }
        return template;
    }
};

window.zoneConfig = zoneConfig;
