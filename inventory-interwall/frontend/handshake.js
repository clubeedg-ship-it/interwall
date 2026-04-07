/**
 * =============================================================================
 * INTERWALL INVENTORY OS - Handshake Modal (Receiving & Picking)
 * =============================================================================
 */

// =============================================================================
// Handshake Modal (Receiving & Picking)
// =============================================================================
const handshake = {
    mode: 'receiving', // 'receiving' or 'picking'
    stockItems: [],    // Available stock for picking (FIFO ordered)

    init() {
        dom.handshakeClose.addEventListener('click', () => this.hide());
        dom.handshakeModal.addEventListener('click', (e) => {
            if (e.target === dom.handshakeModal) this.hide();
        });

        dom.handshakeForm.addEventListener('submit', (e) => this.submit(e));

        // Mode toggle via action badge click
        dom.handshakeAction.addEventListener('click', () => this.toggleMode());
    },

    /**
     * Show modal in RECEIVING mode (default from barcode scan)
     */
    show(part) {
        this.mode = 'receiving';
        this.showModal(part);
    },

    /**
     * Show modal in PICKING mode
     */
    async showForPicking(part) {
        this.mode = 'picking';

        // Load available stock for FIFO picking
        try {
            this.stockItems = await api.getStockForPart(part.pk);
            // Sort by location: Bin B first (older stock), then by update date
            this.stockItems.sort((a, b) => {
                const locA = a.location_detail?.name || '';
                const locB = b.location_detail?.name || '';
                // B bins first (FIFO OUT)
                if (locA.endsWith('-B') && !locB.endsWith('-B')) return -1;
                if (!locA.endsWith('-B') && locB.endsWith('-B')) return 1;
                // Then by date (oldest first)
                return new Date(a.updated) - new Date(b.updated);
            });
        } catch (e) {
            this.stockItems = [];
            console.error('Failed to load stock for picking:', e);
        }

        this.showModal(part);
    },

    /**
     * Internal: render modal based on mode
     */
    showModal(part) {
        dom.handshakeAction.textContent = this.mode === 'picking' ? 'PICKING' : 'RECEIVING';
        dom.handshakeAction.classList.toggle('picking', this.mode === 'picking');
        dom.handshakeAction.title = 'Click to toggle mode';

        dom.handshakePartName.textContent = part.name;
        dom.handshakeSKU.textContent = part.IPN || `PK-${part.pk}`;

        dom.inputQty.value = 1;

        // Configure form based on mode
        const sourceUrlGroup = document.getElementById('inputSourceUrl')?.parentElement;
        if (this.mode === 'picking') {
            // Hide price and source URL, populate source bins
            dom.inputPrice.parentElement.style.display = 'none';
            if (sourceUrlGroup) sourceUrlGroup.style.display = 'none';
            this.populateSourceBins();
        } else {
            // Show price and source URL, populate target bins
            dom.inputPrice.parentElement.style.display = 'flex';
            if (sourceUrlGroup) sourceUrlGroup.style.display = 'block';
            dom.inputPrice.value = '';
            const sourceUrlInput = document.getElementById('inputSourceUrl');
            if (sourceUrlInput) sourceUrlInput.value = '';
            this.populateBins();
        }

        // Show form, hide success
        dom.handshakeForm.style.display = 'flex';
        dom.successFeedback.classList.remove('active');

        dom.handshakeModal.classList.add('active');
        dom.inputQty.focus();
    },

    /**
     * Toggle between RECEIVING and PICKING modes
     */
    toggleMode() {
        const part = state.selectedPart;
        if (!part) return;

        if (this.mode === 'receiving') {
            this.showForPicking(part);
        } else {
            this.show(part);
        }
    },

    hide() {
        dom.handshakeModal.classList.remove('active');
        state.selectedPart = null;
        this.stockItems = [];
    },

    /**
     * Populate bins for RECEIVING (target bins) - sorted naturally
     */
    populateBins() {
        dom.inputBin.innerHTML = '<option value="">Select bin...</option>';

        // Get all leaf bins and sort them naturally
        const bins = [];
        for (const [name, loc] of state.locations) {
            // Only show leaf bins (format: A-1-3-A or B-4-7-B)
            if (name.split('-').length >= 3) {
                bins.push({ name, pk: loc.pk });
            }
        }

        // Natural sort: zone, column, level, bin letter
        bins.sort((a, b) => {
            const partsA = a.name.split('-');
            const partsB = b.name.split('-');

            // Zone (A/B)
            if (partsA[0] !== partsB[0]) return partsA[0].localeCompare(partsB[0]);
            // Column (1-8)
            const colA = parseInt(partsA[1]) || 0;
            const colB = parseInt(partsB[1]) || 0;
            if (colA !== colB) return colA - colB;
            // Level (1-7)
            const lvlA = parseInt(partsA[2]) || 0;
            const lvlB = parseInt(partsB[2]) || 0;
            if (lvlA !== lvlB) return lvlA - lvlB;
            // Bin letter (A/B)
            return (partsA[3] || '').localeCompare(partsB[3] || '');
        });

        bins.forEach(({ name, pk }) => {
            const opt = document.createElement('option');
            opt.value = pk;
            opt.textContent = name;
            dom.inputBin.appendChild(opt);
        });
    },

    /**
     * Populate bins for PICKING (source bins with stock)
     */
    populateSourceBins() {
        dom.inputBin.innerHTML = '<option value="">Auto (FIFO)</option>';

        // Add stock items as options
        this.stockItems.forEach(item => {
            if (item.quantity > 0) {
                const opt = document.createElement('option');
                opt.value = item.pk;
                opt.textContent = `${item.location_detail?.name || 'Unknown'} (${item.quantity} @ €${(item.purchase_price || 0).toFixed(2)})`;
                opt.dataset.qty = item.quantity;
                dom.inputBin.appendChild(opt);
            }
        });
    },

    async submit(e) {
        e.preventDefault();

        if (this.mode === 'picking') {
            await this.submitPick();
        } else {
            await this.submitReceive();
        }
    },

    /**
     * Handle RECEIVING submission with FIFO Auto-Rotation
     * New stock goes to Bin A, pushing old Bin A stock to Bin B
     */
    async submitReceive() {
        const partId = state.selectedPart?.pk;
        const locationId = dom.inputBin.value;
        const qty = parseInt(dom.inputQty.value);
        const price = parseFloat(dom.inputPrice.value) || 0;

        if (!partId || !locationId) {
            toast.show('Missing required fields', true);
            return;
        }

        try {
            // Get the selected location details to determine which bin it is
            const selectedLocation = [...state.locations.values()].find(loc => loc.pk === parseInt(locationId));
            if (!selectedLocation) {
                throw new Error('Invalid location');
            }

            const locName = selectedLocation.name;

            // FIFO Auto-Rotation Logic
            // If receiving to Bin A (e.g., A-1-3-A), check if there's existing stock
            // If yes, move it to corresponding Bin B (A-1-3-B) before adding new stock
            if (locName.endsWith('-A')) {
                console.log(`FIFO rotation: Receiving to ${locName} (Bin A)`);

                // Find corresponding Bin B
                const binBName = locName.slice(0, -1) + 'B'; // Replace -A with -B
                const binBLocation = [...state.locations.entries()].find(([name]) => name === binBName);

                if (binBLocation) {
                    const binBId = binBLocation[1].pk;

                    // Check for existing stock in Bin A for this part
                    const existingStockA = await api.getStockAtLocation(locationId);
                    const partStockInA = existingStockA.filter(item => item.part === partId);

                    if (partStockInA.length > 0) {
                        console.log(`  Found ${partStockInA.length} existing batch(es) in Bin A, moving to Bin B...`);

                        // Move all existing Bin A stock to Bin B
                        for (const stockItem of partStockInA) {
                            await this.moveStock(stockItem.pk, binBId, stockItem.quantity);
                            console.log(`  Moved ${stockItem.quantity} units (€${stockItem.purchase_price}) to ${binBName}`);
                        }

                        toast.show(`Rotated old batch to Bin B`, 'info');
                    } else {
                        console.log(`  No existing stock in Bin A, direct placement`);
                    }
                } else {
                    console.warn(`  Bin B not found for rotation (${binBName})`);
                }
            }

            // Create new stock at the selected location (now Bin A is clear if rotation happened)
            const sourceUrl = document.getElementById('inputSourceUrl')?.value?.trim() || '';
            await api.createStock(partId, locationId, qty, price, sourceUrl ? `Source: ${sourceUrl}` : '');

            // Show success
            dom.handshakeForm.style.display = 'none';
            dom.successFeedback.classList.add('active');

            setTimeout(() => {
                this.hide();
                toast.show(`Received ${qty} × ${state.selectedPart.name}`);
                // Refresh wall data
                wall.loadLiveData();
            }, 800);

        } catch (e) {
            console.error('Receiving error:', e);
            toast.show(`Failed: ${e.message}`, true);
        }
    },

    /**
     * Move stock from one location to another
     * @param {number} stockItemId - Stock item ID to move
     * @param {number} newLocationId - Destination location ID
     * @param {number} quantity - Quantity to transfer
     */
    async moveStock(stockItemId, newLocationId, quantity) {
        // InvenTree stock transfer endpoint: POST /api/stock/transfer/
        const response = await fetch(`${CONFIG.API_BASE}/stock/transfer/`, {
            method: 'POST',
            headers: {
                'Authorization': `Token ${CONFIG.API_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                items: [{
                    pk: stockItemId,
                    quantity: quantity
                }],
                location: newLocationId,
                notes: 'FIFO Auto-Rotation: Old → Bin B'
            })
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Transfer failed: ${error}`);
        }

        return await response.json();
    },

    /**
     * Handle PICKING submission with FIFO logic
     * Consumes from Bin B (oldest) first, then Bin A (newest)
     */
    async submitPick() {
        const qty = parseInt(dom.inputQty.value);
        const selectedStockId = dom.inputBin.value;

        if (qty <= 0) {
            toast.show('Invalid quantity', true);
            return;
        }

        try {
            let remaining = qty;
            const consumed = [];

            if (selectedStockId) {
                // Pick from specific stock item
                const item = this.stockItems.find(s => s.pk === parseInt(selectedStockId));
                if (item && item.quantity >= qty) {
                    await api.removeStock(item.pk, qty);
                    consumed.push({
                        bin: item.location_detail?.name,
                        qty,
                        price: item.purchase_price
                    });
                    remaining = 0;
                } else {
                    toast.show('Insufficient stock in selected bin', true);
                    return;
                }
            } else {
                // FIFO Auto-pick: Explicit Bin B priority (oldest first)
                // Sort stock items: Bin B (-B suffix) before Bin A (-A suffix)
                const sortedStock = [...this.stockItems].sort((a, b) => {
                    const nameA = a.location_detail?.name || '';
                    const nameB = b.location_detail?.name || '';

                    // Bin B (-B) gets priority (comes first)
                    const isBinB_A = nameA.endsWith('-B');
                    const isBinB_B = nameB.endsWith('-B');

                    if (isBinB_A && !isBinB_B) return -1;  // A is Bin B, comes first
                    if (!isBinB_A && isBinB_B) return 1;   // B is Bin B, B comes first

                    // Both same type (both -A or both -B), sort by created date (oldest first)
                    return new Date(a.stocktake_date || 0) - new Date(b.stocktake_date || 0);
                });

                console.log('FIFO Picking Order:', sortedStock.map(s => `${s.location_detail?.name} (${s.quantity} @ €${s.purchase_price})`));

                for (const item of sortedStock) {
                    if (remaining <= 0) break;
                    if (item.quantity <= 0) continue;

                    const toConsume = Math.min(remaining, item.quantity);
                    await api.removeStock(item.pk, toConsume);
                    consumed.push({
                        bin: item.location_detail?.name,
                        qty: toConsume,
                        price: item.purchase_price
                    });
                    remaining -= toConsume;

                    console.log(`  Consumed ${toConsume} from ${item.location_detail?.name} @ €${item.purchase_price}`);
                }
            }

            if (remaining > 0) {
                toast.show(`Only picked ${qty - remaining} of ${qty} (insufficient stock)`, true);
            } else {
                // Show success
                dom.handshakeForm.style.display = 'none';
                dom.successFeedback.classList.add('active');

                const summary = consumed.map(c => `${c.qty} from ${c.bin}`).join(', ');
                setTimeout(() => {
                    this.hide();
                    toast.show(`Picked ${qty} × ${state.selectedPart.name}`);
                    console.log('FIFO consumed:', summary);
                    // Refresh wall data
                    wall.loadLiveData();
                }, 800);
            }

        } catch (e) {
            toast.show(`Pick failed: ${e.message}`, true);
        }
    }
};

window.handshake = handshake;
