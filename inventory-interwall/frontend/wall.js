/**
 * =============================================================================
 * INTERWALL INVENTORY OS - Wall Grid Renderer
 * =============================================================================
 */

// =============================================================================
// Wall Grid Renderer
// =============================================================================
const wall = {
    init() {
        this.render();
    },

    render() {
        console.log('Wall.render() called');
        dom.wallGrid.innerHTML = '';
        const activeZones = zoneConfig.getAllZones();
        console.log('Active zones:', activeZones);

        if (activeZones.length === 0) {
            console.log('No zones configured, showing empty state');
            dom.wallGrid.innerHTML = '<div class="empty-state">No zones configured. Click "Add Zone" to get started.</div>';
            this.renderAddZoneButton();
            return;
        }

        // Group zones by layout row for hybrid layout support
        const zonesByRow = this.groupZonesByRow(activeZones);
        console.log('Zones by row:', zonesByRow);

        // Render each row of zones
        Object.keys(zonesByRow).sort().forEach(rowKey => {
            const rowZones = zonesByRow[rowKey];
            const wallRow = document.createElement('div');
            wallRow.className = 'wall-row';
            wallRow.style.gridTemplateColumns = `repeat(${rowZones.length}, 1fr)`;
            wallRow.style.gap = '2rem';

            // Render each zone in this row
            rowZones.forEach(zone => {
                console.log(`Rendering zone ${zone.name}`);
                const zoneContainer = this.renderZone(zone);
                wallRow.appendChild(zoneContainer);
            });

            dom.wallGrid.appendChild(wallRow);
        });

        // Add "Add Zone" button
        console.log('Adding "Add Zone" button');
        this.renderAddZoneButton();
        console.log('Wall.render() complete');
    },

    groupZonesByRow(zones) {
        const grouped = {};
        zones.forEach(zone => {
            const rowKey = zone.layoutRow || 0;
            if (!grouped[rowKey]) grouped[rowKey] = [];
            grouped[rowKey].push(zone);
        });
        // Sort zones within each row by layoutCol
        Object.keys(grouped).forEach(key => {
            grouped[key].sort((a, b) => (a.layoutCol || 0) - (b.layoutCol || 0));
        });
        return grouped;
    },

    renderZone(zone) {
        const zoneContainer = document.createElement('div');
        zoneContainer.className = 'zone-container';
        zoneContainer.dataset.zoneName = zone.name;

        // Zone header
        const header = document.createElement('div');
        header.className = 'zone-header';
        header.innerHTML = `
            <div class="zone-badge">ZONE ${sanitize(zone.name)}</div>
            <div class="zone-info">${sanitize(String(zone.columns))} cols × ${sanitize(String(zone.levels))} levels</div>
            <div class="zone-actions">
                <button class="zone-action-btn" onclick="zoneManager.configureZone('${sanitize(zone.name)}')" title="Configure Zone"></button>
                <button class="zone-action-btn zone-delete-btn" onclick="zoneManager.confirmDelete('${sanitize(zone.name)}')" title="Delete Zone"></button>
            </div>
        `;
        zoneContainer.appendChild(header);

        // Column headers
        const colHeaders = document.createElement('div');
        colHeaders.className = 'column-headers';
        colHeaders.style.gridTemplateColumns = `40px repeat(${zone.columns}, 1fr)`;
        colHeaders.innerHTML = `<div class="column-header"></div>`;
        for (let col = 1; col <= zone.columns; col++) {
            const colHeader = document.createElement('div');
            colHeader.className = 'column-header';
            colHeader.textContent = `${zone.name}-${col}`;
            colHeaders.appendChild(colHeader);
        }
        zoneContainer.appendChild(colHeaders);

        // Grid (levels from top to bottom)
        const grid = document.createElement('div');
        grid.className = 'zone-grid';

        for (let level = zone.levels; level >= 1; level--) {
            const row = document.createElement('div');
            row.className = 'grid-row';
            row.style.gridTemplateColumns = `40px repeat(${zone.columns}, 1fr)`;

            // Row label
            const label = document.createElement('div');
            label.className = 'row-label';
            label.textContent = `L${level}`;
            row.appendChild(label);

            // Cells for this row
            for (let col = 1; col <= zone.columns; col++) {
                const cellId = `${zone.name}-${col}-${level}`;
                const isPowerSupply = `${zone.name}-${col}` === CONFIG.POWER_SUPPLY_COLUMN;
                row.appendChild(this.createCell(cellId, isPowerSupply));
            }

            grid.appendChild(row);
        }

        zoneContainer.appendChild(grid);
        return zoneContainer;
    },

    renderAddZoneButton() {
        console.log('renderAddZoneButton() called');
        const addRow = document.createElement('div');
        addRow.className = 'wall-add-zone-row';
        addRow.innerHTML = `
            <button class="btn-add-zone" onclick="zoneManager.showAddModal()">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="12" y1="5" x2="12" y2="19"></line>
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
                Add New Zone
            </button>
        `;
        dom.wallGrid.appendChild(addRow);
        console.log('Add Zone button appended to DOM');
    },

    createCell(cellId, isPowerSupply) {
        const cell = document.createElement('div');
        cell.className = 'cell empty';
        cell.dataset.cellId = cellId;

        // Check if this shelf is configured as Single Bin mode (via toggle)
        const isSingleBin = isPowerSupply || shelfConfig.isSplitBins(cellId);

        if (isSingleBin) {
            cell.classList.add('solid');
            // Single bin mode - no A/B division
            const bin = document.createElement('div');
            bin.className = 'bin-half';
            bin.innerHTML = '<span class="qty">-</span>';
            bin.addEventListener('click', (e) => {
                e.stopPropagation();
                binInfoModal.show(`${cellId}`);  // No -A/-B suffix for solid bins
            });
            cell.appendChild(bin);
        } else {
            // Split bins for standard cells
            const binA = document.createElement('div');
            binA.className = 'bin-half bin-a';
            binA.innerHTML = '<span class="label">A</span><span class="qty">-</span>';
            binA.addEventListener('click', (e) => {
                e.stopPropagation();
                binInfoModal.show(`${cellId}-A`);
            });

            const binB = document.createElement('div');
            binB.className = 'bin-half bin-b';
            binB.innerHTML = '<span class="label">B</span><span class="qty">-</span>';
            binB.addEventListener('click', (e) => {
                e.stopPropagation();
                binInfoModal.show(`${cellId}-B`);
            });

            cell.appendChild(binA);
            cell.appendChild(binB);
        }

        cell.addEventListener('click', () => this.showCellDetails(cellId, isSingleBin));

        return cell;
    },

    /**
     * Re-render a specific cell (used when configuration changes)
     */
    rerenderCell(cellId) {
        const existingCell = document.querySelector(`[data-cell-id="${cellId}"]`);
        if (!existingCell) {
            console.warn(`Cell not found for re-render: ${cellId}`);
            return;
        }

        // Determine if it's a power supply column
        const parts = cellId.split('-');
        const isPowerSupply = `${parts[0]}-${parts[1]}` === CONFIG.POWER_SUPPLY_COLUMN;

        // Create new cell with updated configuration
        const newCell = this.createCell(cellId, isPowerSupply);

        // Copy over any status classes (like 'stocked', 'low', etc.)
        if (existingCell.classList.contains('stocked')) newCell.classList.add('stocked');
        if (existingCell.classList.contains('low')) newCell.classList.add('low');
        if (existingCell.classList.contains('loading')) newCell.classList.add('loading');

        // Replace the old cell with the new one
        existingCell.parentNode.replaceChild(newCell, existingCell);

        // Reload data for this cell
        this.loadCellData(cellId, isPowerSupply || shelfConfig.isSplitBins(cellId));

        console.log(`Cell ${cellId} re-rendered`);
    },

    async showCellDetails(cellId, isPowerSupply) {
        const [zone, col, level] = cellId.split('-');

        // Track current cell for print button
        binModal.currentCellId = cellId;

        dom.binModalTitle.textContent = cellId;
        dom.binModalSubtitle.textContent = `Zone ${zone} · Column ${col} · Level ${level}`;

        dom.binAContent.innerHTML = '<div class="empty-bin">Loading...</div>';
        dom.binBContent.innerHTML = isPowerSupply
            ? '<div class="empty-bin">N/A (Solid Bin)</div>'
            : '<div class="empty-bin">Loading...</div>';

        dom.binModal.classList.add('active');

        // Fetch stock data
        await this.loadBinContents(cellId, isPowerSupply);
    },

    async loadBinContents(cellId, isPowerSupply) {
        if (isPowerSupply) {
            dom.binAContent.innerHTML = this.renderOccupancy(cellId);
        } else {
            dom.binAContent.innerHTML = this.renderOccupancy(`${cellId}-A`, cellId);
            dom.binBContent.innerHTML = this.renderOccupancy(`${cellId}-B`);
        }
    },

    /**
     * Render occupancy summary for a shelf key.
     * If fallbackKey is provided, its qty is folded in (base shelf → bin A).
     */
    renderOccupancy(key, fallbackKey) {
        const row = this.occupancyByCell.get(key);
        const fallback = fallbackKey ? this.occupancyByCell.get(fallbackKey) : null;
        const qty = (row ? row.total_qty : 0) + (fallback ? fallback.total_qty : 0);
        const value = (row ? row.total_value : 0) + (fallback ? fallback.total_value : 0);
        const name = (row && row.product_name) || (fallback && fallback.product_name);

        if (qty <= 0) {
            return '<div class="empty-bin">No stock</div>';
        }

        return `
            <div class="stock-item">
                <div class="stock-item-name">${sanitize(name || 'Unknown')}</div>
                <div class="stock-item-meta">
                    <span class="stock-qty">${qty}</span>
                    <span class="stock-price">${sanitize('\u20AC')}${value.toFixed(2)}</span>
                </div>
            </div>
        `;
    },

    highlightCell(cellId) {
        // Remove previous highlight
        $$('.cell.highlighted').forEach(c => c.classList.remove('highlighted'));

        // Find and highlight
        const cell = document.querySelector(`[data-cell-id="${cellId}"]`);
        if (cell) {
            cell.classList.add('highlighted');
            cell.scrollIntoView({ behavior: 'smooth', block: 'center' });

            setTimeout(() => cell.classList.remove('highlighted'), 2000);
        }
    },

    updateCellStatus(cellId, status, qtyA = null, qtyB = null) {
        const cell = document.querySelector(`[data-cell-id="${cellId}"]`);
        if (!cell) return;

        // Remove old status
        cell.classList.remove('healthy', 'warning', 'critical', 'empty');
        cell.classList.add(status);

        // Update quantities
        const binHalves = cell.querySelectorAll('.bin-half');
        if (binHalves[0] && qtyA !== null) {
            binHalves[0].querySelector('.qty').textContent = qtyA || '-';
        }
        if (binHalves[1] && qtyB !== null) {
            binHalves[1].querySelector('.qty').textContent = qtyB || '-';
        }
    },

    /**
     * Occupancy cache — populated by loadLiveData(), consumed by
     * processCellFromCache() and bin-info-modal.
     * Key: "${zone}-${col}-${level}" or "${zone}-${col}-${level}-${bin}"
     * Value: occupancy row {total_qty, total_value, batch_count, product_name, product_ean, capacity}
     */
    occupancyByCell: new Map(),

    /**
     * Load live stock data for all cells from v_shelf_occupancy (T-C02b).
     */
    async loadLiveData() {
        console.log('Loading live wall data (occupancy view)...');
        const startTime = performance.now();

        const activeZones = zoneConfig.getAllZones();
        if (activeZones.length === 0) {
            console.warn('No active zones configured, skipping data load');
            return;
        }

        let rows = [];
        try {
            rows = await api.getShelfOccupancy();
            console.log(`Fetched ${rows.length} shelf occupancy rows`);
        } catch (e) {
            console.error('Failed to fetch shelf occupancy:', e);
            return;
        }

        // Build occupancy map keyed by cell-compatible ID
        this.occupancyByCell.clear();
        for (const r of rows) {
            const key = r.bin
                ? `${r.zone_name}-${r.col}-${r.level}-${r.bin}`
                : `${r.zone_name}-${r.col}-${r.level}`;
            this.occupancyByCell.set(key, r);
        }

        // Process all cells
        for (const zone of activeZones) {
            for (let col = 1; col <= zone.columns; col++) {
                for (let level = 1; level <= zone.levels; level++) {
                    const cellId = `${zone.name}-${col}-${level}`;
                    const isPowerSupply = `${zone.name}-${col}` === CONFIG.POWER_SUPPLY_COLUMN;
                    this.processCellFromCache(cellId, isPowerSupply);
                }
            }
        }

        const endTime = performance.now();
        const loadTime = ((endTime - startTime) / 1000).toFixed(2);
        console.log(`Wall data loaded in ${loadTime}s (occupancy view)`);
    },

    /**
     * Process cell data from occupancy cache (no API call).
     */
    processCellFromCache(cellId, isPowerSupply) {
        const getQty = (key) => {
            const row = this.occupancyByCell.get(key);
            return row ? row.total_qty : 0;
        };

        let totalQty, qtyA, qtyB;

        if (isPowerSupply) {
            qtyA = getQty(cellId);
            totalQty = qtyA;
            this.updateCellStatus(cellId, this.getStatus(totalQty), qtyA, null);
        } else {
            qtyA = getQty(`${cellId}-A`);
            qtyB = getQty(`${cellId}-B`);
            const qtyBase = getQty(cellId);
            totalQty = qtyA + qtyB + qtyBase;
            this.updateCellStatus(cellId, this.getStatus(totalQty), qtyA + qtyBase, qtyB);
        }
    },

    /**
     * Reload occupancy for a single cell and update its status.
     * Re-fetches the full occupancy set (cheap view query) so the
     * cache stays consistent after handshake / zone changes.
     */
    async loadCellData(cellId, isPowerSupply) {
        // Refresh occupancy cache then process the single cell
        await this.loadLiveData();
    },

    /**
     * Get status class based on quantity
     */
    getStatus(qty) {
        if (qty <= 0) return 'empty';
        if (qty <= 5) return 'critical';
        if (qty <= 15) return 'warning';
        return 'healthy';
    }
};

window.wall = wall;
