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

        // Load canonical FIFO lot order from the server (received_at ASC).
        // The browser must not re-sort — server is the source of truth.
        try {
            const lots = part.ean ? await api.getStockLotsByProduct(part.ean) : [];
            this.stockItems = Array.isArray(lots) ? lots : [];
        } catch (e) {
            this.stockItems = [];
            console.error('Failed to load stock lots for picking:', e);
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
     * Populate lot list for PICKING in canonical server FIFO order.
     */
    populateSourceBins() {
        dom.inputBin.innerHTML = '<option value="">Auto (FIFO)</option>';

        this.stockItems.forEach(item => {
            const qty = Number(item.quantity) || 0;
            if (qty > 0) {
                const cost = Number(item.unit_cost) || 0;
                const received = item.received_at ? String(item.received_at).slice(0, 10) : '';
                const opt = document.createElement('option');
                opt.value = item.id;
                opt.textContent = `Lot ${received} (${qty} @ €${cost.toFixed(2)})`;
                opt.dataset.qty = qty;
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
     * Handle RECEIVING submission.
     * Receive is create-stock + refresh. Bin rotation is not the browser's job.
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
            const sourceUrl = document.getElementById('inputSourceUrl')?.value?.trim() || '';
            await api.createStock(partId, locationId, qty, price, sourceUrl ? `Source: ${sourceUrl}` : '');

            dom.handshakeForm.style.display = 'none';
            dom.successFeedback.classList.add('active');

            setTimeout(() => {
                this.hide();
                toast.show(`Received ${qty} × ${state.selectedPart.name}`);
                wall.loadLiveData();
            }, 800);

        } catch (e) {
            console.error('Receiving error:', e);
            toast.show(`Failed: ${e.message}`, true);
        }
    },

    /**
     * Handle PICKING submission.
     * FIFO order comes from the server (getStockLotsByProduct). The browser
     * consumes lots in the order it received them — no client-side re-sorting.
     */
    async submitPick() {
        const qty = parseInt(dom.inputQty.value);
        const selectedLotId = dom.inputBin.value;

        if (qty <= 0) {
            toast.show('Invalid quantity', true);
            return;
        }

        try {
            let remaining = qty;
            const consumed = [];

            if (selectedLotId) {
                const item = this.stockItems.find(s => String(s.id) === String(selectedLotId));
                const available = Number(item?.quantity) || 0;
                if (item && available >= qty) {
                    await api.consumeLot(item.id, qty, 'Picked via Interwall OS');
                    consumed.push({ lotId: item.id, qty, price: item.unit_cost });
                    remaining = 0;
                } else {
                    toast.show('Insufficient stock in selected lot', true);
                    return;
                }
            } else {
                // Walk the server-provided FIFO list in order.
                for (const item of this.stockItems) {
                    if (remaining <= 0) break;
                    const available = Number(item.quantity) || 0;
                    if (available <= 0) continue;

                    const toConsume = Math.min(remaining, available);
                    await api.consumeLot(item.id, toConsume, 'Picked via Interwall OS');
                    consumed.push({ lotId: item.id, qty: toConsume, price: item.unit_cost });
                    remaining -= toConsume;
                }
            }

            if (remaining > 0) {
                toast.show(`Only picked ${qty - remaining} of ${qty} (insufficient stock)`, true);
            } else {
                dom.handshakeForm.style.display = 'none';
                dom.successFeedback.classList.add('active');

                const summary = consumed.map(c => `${c.qty} from lot ${c.lotId}`).join(', ');
                setTimeout(() => {
                    this.hide();
                    toast.show(`Picked ${qty} × ${state.selectedPart.name}`);
                    console.log('FIFO consumed:', summary);
                    wall.loadLiveData();
                }, 800);
            }

        } catch (e) {
            toast.show(`Pick failed: ${e.message}`, true);
        }
    }
};

window.handshake = handshake;
