/**
 * =============================================================================
 * INTERWALL INVENTORY OS - Bin Info Modal - Shows bin details and per-shelf configuration
 * =============================================================================
 */

// =============================================================================
// Bin Info Modal - Shows bin details and per-shelf configuration
// =============================================================================
const binInfoModal = {
    currentCellId: null,
    currentShelfId: null,
    currentBinLetter: null,
    currentShelfDbId: null,

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

        this.currentCellId = cellId;
        const parts = cellId.split('-');
        this.currentShelfId = parts.length === 4 ? parts.slice(0, 3).join('-') : cellId;
        this.currentBinLetter = cellId.endsWith('-A') ? 'A' : cellId.endsWith('-B') ? 'B' : null;

        const row = wall.occupancyByCell.get(cellId);
        const splitFifo = row?.split_fifo ?? false;
        const singleBin = row?.single_bin ?? false;

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
        const isSingleBinMode = !this.currentBinLetter && singleBin;

        let totalQty = 0;
        let totalValue = 0;
        let productName = null;
        let batchCount = 0;
        let capacity = null;
        this.currentShelfDbId = null;

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
                if (!this.currentShelfDbId && r.shelf_id) this.currentShelfDbId = r.shelf_id;
            }
        } else {
            const occRow = wall.occupancyByCell.get(cellId);
            if (occRow) {
                totalQty = occRow.total_qty;
                totalValue = occRow.total_value;
                productName = occRow.product_name;
                batchCount = occRow.batch_count;
                capacity = occRow.capacity;
                this.currentShelfDbId = occRow.shelf_id;
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
        document.getElementById('binConfigSplitFifo').checked = splitFifo;
        document.getElementById('binConfigSplitBins').checked = singleBin;

        // Show modal
        document.getElementById('binInfoModal').classList.add('active');
    },

    close() {
        document.getElementById('binInfoModal').classList.remove('active');
        this.currentCellId = null;
        this.currentShelfId = null;
        this.currentBinLetter = null;
        this.currentShelfDbId = null;
    },

    async onSplitFifoChange(enabled) {
        if (!this.currentShelfDbId) return;
        await api.updateShelf(this.currentShelfDbId, { split_fifo: enabled });
        await wall.loadLiveData();
        this.show(this.currentCellId);
        notifications.show(
            enabled
                ? 'Split FIFO enabled - Bins A and B are now independent'
                : 'Split FIFO disabled - Normal FIFO rotation restored',
            'info'
        );
    },

    async onSplitBinsChange(enabled) {
        if (!this.currentShelfDbId) return;
        await api.updateShelf(this.currentShelfDbId, { single_bin: enabled });
        await wall.loadLiveData();
        this.show(this.currentCellId);
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
        if (!this.currentShelfDbId) {
            toast.show('Shelf not found in occupancy data', 'error');
            return;
        }

        const occRow = wall.occupancyByCell.get(
            this.currentBinLetter
                ? `${this.currentShelfId}-${this.currentBinLetter}`
                : this.currentShelfId
        );
        const currentCapacity = occRow ? occRow.capacity : null;

        const newCapacity = prompt(
            `Enter shelf capacity:\n(Current: ${currentCapacity || 'not set'})\n\nLeave empty or enter 0 to remove capacity limit.`,
            currentCapacity || ''
        );

        if (newCapacity === null) return; // cancelled

        const parsedCapacity = parseInt(newCapacity);
        const capacityValue = (newCapacity === '' || parsedCapacity === 0)
            ? null
            : (!isNaN(parsedCapacity) && parsedCapacity > 0) ? parsedCapacity : undefined;

        if (capacityValue === undefined) {
            toast.show('Invalid capacity value', 'error');
            return;
        }

        try {
            await api.updateShelf(this.currentShelfDbId, { capacity: capacityValue });
            toast.show(
                capacityValue === null
                    ? 'Capacity limit removed (unlimited)'
                    : `Capacity set to ${capacityValue} units`,
                'success'
            );
            // Refresh wall data and re-show modal with updated values
            const cellId = this.currentBinLetter
                ? `${this.currentShelfId}-${this.currentBinLetter}`
                : this.currentShelfId;
            await wall.loadLiveData();
            this.show(cellId);
        } catch (err) {
            toast.show(err.message, 'error');
        }
    }
};

window.binInfoModal = binInfoModal;
