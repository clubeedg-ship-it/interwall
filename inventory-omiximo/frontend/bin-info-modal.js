/**
 * =============================================================================
 * OMIXIMO INVENTORY OS - Bin Info Modal - Shows bin details and per-shelf configuration
 * =============================================================================
 */

// =============================================================================
// Bin Info Modal - Shows bin details and per-shelf configuration
// =============================================================================
const binInfoModal = {
    currentShelfId: null,
    currentBinLetter: null,
    currentStock: [],

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

        // Get location ID for this cell
        let location = state.locations.get(cellId);

        // For single bin mode on regular shelves, the location might not exist directly
        // (e.g., "A-1-3" doesn't exist, only "A-1-3-A" and "A-1-3-B" do)
        // In this case, we need to combine stock from both A and B bins
        const isSingleBinMode = !this.currentBinLetter && shelfConfig.isSplitBins(this.currentShelfId);

        // Load stock for this cell
        try {
            if (location) {
                // Direct location found (power supply or native single bin)
                this.currentStock = await api.getStockAtLocation(location.pk);
            } else if (isSingleBinMode) {
                // Single bin mode on regular shelf - combine stock from A and B
                const locA = state.locations.get(`${cellId}-A`);
                const locB = state.locations.get(`${cellId}-B`);

                const stockA = locA ? await api.getStockAtLocation(locA.pk) : [];
                const stockB = locB ? await api.getStockAtLocation(locB.pk) : [];

                this.currentStock = [...stockA, ...stockB];
                console.log(`Single bin mode: Combined ${stockA.length} + ${stockB.length} batches`);
            } else {
                console.warn(`Location not found for cell: ${cellId}`);
                document.getElementById('binProductSection').style.display = 'none';
                document.getElementById('binEmptySection').style.display = 'flex';
                document.getElementById('binInfoModal').classList.add('active');
                return;
            }
        } catch (e) {
            console.error('Failed to load stock:', e);
            this.currentStock = [];
        }

        // Display stock info
        if (this.currentStock.length === 0) {
            document.getElementById('binProductSection').style.display = 'none';
            document.getElementById('binEmptySection').style.display = 'flex';
        } else {
            document.getElementById('binEmptySection').style.display = 'none';
            document.getElementById('binProductSection').style.display = 'flex';

            // Get first stock item (could be multiple batches of same product)
            const firstStock = this.currentStock[0];
            const part = state.parts.get(firstStock.part);
            const totalQty = this.currentStock.reduce((sum, s) => sum + s.quantity, 0);
            const totalValue = this.currentStock.reduce((sum, s) => sum + (s.quantity * (s.purchase_price || 0)), 0);
            const capacity = shelfConfig.getBinCapacity(this.currentShelfId, firstStock.part, this.currentBinLetter);

            // Update product name
            document.getElementById('binProductName').textContent = part?.name || 'Unknown Part';

            // Update stock metrics (separate elements)
            document.getElementById('binProductQty').textContent = totalQty;
            document.getElementById('binProductCapacity').textContent = capacity || '∞';

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
            document.getElementById('binProductValue').textContent = `€${totalValue.toFixed(2)} total value`;
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
        this.currentStock = [];
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
        if (this.currentStock.length === 0) {
            toast.show('No batches in this bin', 'info');
            return;
        }
        // Open first batch in batch detail modal
        if (typeof batchDetail !== 'undefined') {
            batchDetail.show(this.currentStock[0].pk);
            this.close();
        }
    },

    async editCapacity() {
        if (this.currentStock.length === 0) {
            toast.show('Add stock first to set capacity', 'info');
            return;
        }

        const partId = this.currentStock[0].part;
        const currentCapacity = shelfConfig.getBinCapacity(this.currentShelfId, partId, this.currentBinLetter);

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
