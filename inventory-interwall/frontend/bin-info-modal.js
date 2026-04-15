/**
 * =============================================================================
 * INTERWALL INVENTORY OS - Bin Info Modal - Shows bin details and per-shelf configuration
 * =============================================================================
 */

// =============================================================================
// Bin Info Modal - Shows bin details and per-shelf configuration
// =============================================================================
const binInfoModal = {
    currentShelfId: null,
    currentBinLetter: null,

    init() {
        const modal = document.getElementById('binInfoModal');
        const closeBtn = document.getElementById('binInfoClose');

        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.close());
        }
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) this.close();
            });
        }

        // Toggle event listeners
        const splitFifoCheckbox = document.getElementById('binConfigSplitFifo');
        const splitBinsCheckbox = document.getElementById('binConfigSplitBins');

        if (splitFifoCheckbox) {
            splitFifoCheckbox.addEventListener('change', (e) => this.onSplitFifoChange(e.target.checked));
        }
        if (splitBinsCheckbox) {
            splitBinsCheckbox.addEventListener('change', (e) => this.onSplitBinsChange(e.target.checked));
        }
    },

    async show(cellId) {
        console.log(` Opening bin info for: ${cellId}`);

        this.currentShelfId = shelfConfig.getShelfId(cellId);
        this.currentBinLetter = cellId.endsWith('-A') ? 'A' : cellId.endsWith('-B') ? 'B' : null;

        const config = shelfConfig.getShelfConfig(this.currentShelfId);

        // Parse cell ID components (e.g., "A-1-3-A" → zone=A, col=1, level=3, bin=A)
        const idParts = cellId.split('-');
        const zone = idParts[0] || '?';
        const col = idParts[1] || '?';
        const level = idParts[2] || '?';
        const binLetter = idParts[3] || '';

        // Update bin badge
        const badgeZone = document.querySelector('.bin-badge-zone');
        const badgeLocation = document.querySelector('.bin-badge-location');
        const badgeBin = document.querySelector('.bin-badge-bin');
        if (badgeZone) badgeZone.textContent = zone;
        if (badgeLocation) badgeLocation.textContent = `${col}-${level}`;
        if (badgeBin) {
            badgeBin.textContent = binLetter ? `Bin ${binLetter}` : 'Shelf';
            badgeBin.style.display = binLetter ? 'block' : 'none';
        }

        // Set modal title and subtitle
        document.getElementById('binInfoTitle').textContent = `Bin ${cellId}`;
        document.getElementById('binInfoShelfId').textContent = `Zone ${zone} · Column ${col} · Level ${level}`;

        // ── Read occupancy from wall cache (T-C02b) ───────────────────
        const isSingleBinMode = !this.currentBinLetter && shelfConfig.isSplitBins(this.currentShelfId);

        let totalQty = 0;
        let totalValue = 0;
        let productName = null;
        let batchCount = 0;
        let capacity = null;

        if (isSingleBinMode) {
            // Combine A + B + base
            const rA = wall.occupancyByCell.get(`${cellId}-A`);
            const rB = wall.occupancyByCell.get(`${cellId}-B`);
            const rBase = wall.occupancyByCell.get(cellId);
            for (const r of [rA, rB, rBase]) {
                if (!r) continue;
                totalQty += r.total_qty;
                totalValue += r.total_value;
                batchCount += r.batch_count;
                if (!productName && r.product_name) productName = r.product_name;
                if (!capacity && r.capacity) capacity = r.capacity;
            }
        } else {
            const row = wall.occupancyByCell.get(cellId);
            if (row) {
                totalQty = row.total_qty;
                totalValue = row.total_value;
                productName = row.product_name;
                batchCount = row.batch_count;
                capacity = row.capacity;
            }
        }

        // Display stock info
        if (totalQty <= 0) {
            document.getElementById('binProductSection').style.display = 'none';
            document.getElementById('binEmptySection').style.display = 'flex';
        } else {
            document.getElementById('binEmptySection').style.display = 'none';
            document.getElementById('binProductSection').style.display = 'flex';

            // Update product name
            document.getElementById('binProductName').textContent = productName || 'Unknown Part';

            // Update stock metrics
            document.getElementById('binProductQty').textContent = totalQty;
            document.getElementById('binProductCapacity').textContent = capacity || '\u221E';

            // Update progress bar
            const fillEl = document.getElementById('binStockFill');
            if (fillEl && capacity) {
                const fillPercent = Math.min((totalQty / capacity) * 100, 100);
                fillEl.style.width = `${fillPercent}%`;
                if (fillPercent < 20) {
                    fillEl.classList.add('low');
                } else {
                    fillEl.classList.remove('low');
                }
            } else if (fillEl) {
                fillEl.style.width = '100%';
                fillEl.classList.remove('low');
            }

            // Update value
            document.getElementById('binProductValue').textContent = `\u20AC${totalValue.toFixed(2)} total value`;
        }

        // Set toggle states
        document.getElementById('binConfigSplitFifo').checked = config.splitFifo || false;
        document.getElementById('binConfigSplitBins').checked = config.splitBins || false;

        // Show modal
        document.getElementById('binInfoModal').classList.add('active');
    },

    close() {
        document.getElementById('binInfoModal').classList.remove('active');
        this.currentShelfId = null;
        this.currentBinLetter = null;
    },

    onSplitFifoChange(enabled) {
        if (!this.currentShelfId) return;
        shelfConfig.toggleSplitFifo(this.currentShelfId, enabled);
        notifications.show(
            enabled
                ? 'Split FIFO enabled - Bins A and B are now independent'
                : 'Split FIFO disabled - Normal FIFO rotation restored',
            'info'
        );
    },

    onSplitBinsChange(enabled) {
        if (!this.currentShelfId) return;
        shelfConfig.toggleSplitBins(this.currentShelfId, enabled);

        // Re-render the cell to update visual appearance
        wall.rerenderCell(this.currentShelfId);

        // Close modal since the cell structure changed
        this.close();

        notifications.show(
            enabled
                ? 'Single Bin mode enabled - Cell merged'
                : 'A/B separation restored - Cell split',
            'success'
        );
    },

    async viewBatches() {
        // Batch-level detail requires per-lot data (T-C04 scope).
        // For now surface a hint rather than calling a dead InvenTree path.
        toast.show('Batch detail view coming in T-C04', 'info');
    },

    async editCapacity() {
        // Read occupancy for current cell to check if there's stock
        const row = wall.occupancyByCell.get(
            this.currentBinLetter
                ? `${this.currentShelfId}-${this.currentBinLetter}`
                : this.currentShelfId
        );
        if (!row || row.total_qty <= 0) {
            toast.show('Add stock first to set capacity', 'info');
            return;
        }

        const partId = null; // capacity is per-shelf now, not per-part
        const currentCapacity = row.capacity;

        const newCapacity = prompt(
            `Enter bin capacity for this product:\n(Current: ${currentCapacity || 'not set'})\n\nLeave empty or enter 0 to remove capacity limit.\nWhen not set, batches are retrieved one-by-one (FIFO order).`,
            currentCapacity || ''
        );

        if (newCapacity === null) {
            // User cancelled
            return;
        }

        const parsedCapacity = parseInt(newCapacity);

        if (newCapacity === '' || parsedCapacity === 0) {
            // Clear capacity - make it unlimited
            shelfConfig.setBinCapacity(this.currentShelfId, partId, null);
            toast.show('Capacity limit removed (unlimited)', 'success');
            document.getElementById('binProductCapacity').textContent = '∞';
            // Update progress bar to hide when unlimited
            const fillEl = document.getElementById('binStockFill');
            if (fillEl) fillEl.style.width = '0%';
        } else if (!isNaN(parsedCapacity) && parsedCapacity > 0) {
            shelfConfig.setBinCapacity(this.currentShelfId, partId, parsedCapacity);
            toast.show(`Capacity set to ${parsedCapacity} units`, 'success');
            document.getElementById('binProductCapacity').textContent = parsedCapacity;
        } else {
            toast.show('Invalid capacity value', 'error');
        }
    }
};

window.binInfoModal = binInfoModal;
