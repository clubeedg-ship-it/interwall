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
            const loc = state.locations.get(cellId);
            if (loc) {
                const stock = await api.getStockAtLocation(loc.pk);
                dom.binAContent.innerHTML = this.renderStock(stock);
            }
        } else {
            const locA = state.locations.get(`${cellId}-A`);
            const locB = state.locations.get(`${cellId}-B`);

            if (locA) {
                const stockA = await api.getStockAtLocation(locA.pk);
                dom.binAContent.innerHTML = this.renderStock(stockA);
            }

            if (locB) {
                const stockB = await api.getStockAtLocation(locB.pk);
                dom.binBContent.innerHTML = this.renderStock(stockB);
            }
        }
    },

    renderStock(items) {
        if (!items || items.length === 0) {
            return '<div class="empty-bin">No stock</div>';
        }

        return items.map(item => {
            const qty = item.quantity || 0;
            const allocated = item.allocated || 0;
            const available = qty - allocated;
            const hasAllocation = allocated > 0;

            return `
                <div class="stock-item ${hasAllocation ? 'has-allocation' : ''}" onclick="batchDetail.show(${item.pk})" style="cursor: pointer;">
                    <div class="stock-item-name">${item.part_detail?.name || 'Unknown'}</div>
                    <div class="stock-item-meta">
                        <span class="stock-qty ${hasAllocation ? 'partial' : ''}">${available}/${qty}</span>
                        <span class="stock-price">€${(item.purchase_price || 0).toFixed(2)}</span>
                        ${hasAllocation ? `<span class="allocation-badge" title="${allocated} reserved"></span>` : ''}
                    </div>
                </div>
            `;
        }).join('');
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
     * Load live stock data for all cells
     */
    async loadLiveData() {
        console.log('Loading live wall data (bulk mode)...');
        const startTime = performance.now();

        // Get active zones from dynamic configuration
        const activeZones = zoneConfig.getAllZones();

        if (activeZones.length === 0) {
            console.warn('No active zones configured, skipping data load');
            return;
        }

        // OPTIMIZATION: Fetch ALL stock in ONE API call
        let allStock = [];
        try {
            allStock = await api.getAllStock();
            console.log(`Fetched ${allStock.length} stock items in bulk`);
        } catch (e) {
            console.error('Failed to fetch bulk stock:', e);
            return;
        }

        // Build location ID -> stock items map for O(1) lookup
        const stockByLocation = new Map();
        for (const item of allStock) {
            const locId = item.location;
            if (!stockByLocation.has(locId)) {
                stockByLocation.set(locId, []);
            }
            stockByLocation.get(locId).push(item);
        }

        // Process all cells using cached data (no additional API calls!)
        for (let zone of activeZones) {
            for (let col = 1; col <= zone.columns; col++) {
                for (let level = 1; level <= zone.levels; level++) {
                    const cellId = `${zone.name}-${col}-${level}`;
                    const isPowerSupply = `${zone.name}-${col}` === CONFIG.POWER_SUPPLY_COLUMN;

                    this.processCellFromCache(cellId, isPowerSupply, stockByLocation);
                }
            }
        }

        const endTime = performance.now();
        const loadTime = ((endTime - startTime) / 1000).toFixed(2);
        console.log(`Wall data loaded in ${loadTime}s (bulk mode)`);
    },

    /**
     * Process cell data from cached stock (no API call)
     */
    processCellFromCache(cellId, isPowerSupply, stockByLocation) {
        let totalQty = 0;
        let qtyA = 0;
        let qtyB = 0;

        const getQty = (locName) => {
            const loc = state.locations.get(locName);
            if (!loc) return 0;
            const items = stockByLocation.get(loc.pk) || [];
            return items.reduce((sum, item) => sum + (item.quantity || 0), 0);
        };

        if (isPowerSupply) {
            qtyA = getQty(cellId);
            totalQty = qtyA;
            this.updateCellStatus(cellId, this.getStatus(totalQty), qtyA, null);
        } else {
            qtyA = getQty(`${cellId}-A`);
            qtyB = getQty(`${cellId}-B`);
            const qtyBase = getQty(cellId);
            totalQty = qtyA + qtyB + qtyBase;
            this.updateCellStatus(cellId, this.getStatus(totalQty), qtyA, qtyB);
        }
    },

    /**
     * Load data for a single cell and update its status
     */
    async loadCellData(cellId, isPowerSupply) {
        let totalQty = 0;
        let qtyA = 0;
        let qtyB = 0;
        let qtyBase = 0;

        if (isPowerSupply) {
            // Single bin for power supplies
            const loc = state.locations.get(cellId);
            if (loc) {
                const stock = await api.getStockAtLocation(loc.pk);
                totalQty = stock.reduce((sum, item) => sum + (item.quantity || 0), 0);
                qtyA = totalQty;
            }
            this.updateCellStatus(cellId, this.getStatus(totalQty), qtyA, null);
        } else {
            // Split bins (A = new, B = old)
            const locA = state.locations.get(`${cellId}-A`);
            const locB = state.locations.get(`${cellId}-B`);
            const locBase = state.locations.get(cellId);

            // Use a Set to track stock IDs and prevent double-counting
            const seenStockIds = new Set();

            if (locA) {
                const stockA = await api.getStockAtLocation(locA.pk);
                for (const item of stockA) {
                    if (!seenStockIds.has(item.pk)) {
                        seenStockIds.add(item.pk);
                        qtyA += item.quantity || 0;
                    }
                }
            }

            if (locB) {
                const stockB = await api.getStockAtLocation(locB.pk);
                for (const item of stockB) {
                    if (!seenStockIds.has(item.pk)) {
                        seenStockIds.add(item.pk);
                        qtyB += item.quantity || 0;
                    }
                }
            }

            // Also check base shelf location (stock may exist directly at shelf without A/B suffix)
            if (locBase) {
                const stockBase = await api.getStockAtLocation(locBase.pk);
                for (const item of stockBase) {
                    if (!seenStockIds.has(item.pk)) {
                        seenStockIds.add(item.pk);
                        qtyBase += item.quantity || 0;
                    }
                }
            }

            totalQty = qtyA + qtyB + qtyBase;
            // Add base qty to A for display purposes (newer stock)
            this.updateCellStatus(cellId, this.getStatus(totalQty), qtyA + qtyBase, qtyB);
        }
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
