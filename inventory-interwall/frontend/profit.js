/**
 * =============================================================================
 * INTERWALL INVENTORY OS - Profit Engine
 * Real FIFO Cost Calculation & Transaction Recording
 * =============================================================================
 */

// =============================================================================
// Backend Config Sync - Persists config for email automation
// =============================================================================
const backendConfigSync = {
    // Replaced: Config API sidecar removed in Phase 3
    // Now calls FastAPI /api/fixed-costs directly
    lastSyncTimestamp: null,

    async syncAll() {
        // no-op: individual PUT calls handle persistence now
    },

    async loadFromBackend() {
        // no-op: costConfig.loadFromBackend() calls /api/fixed-costs directly
        return null;
    },

    syncCosts(costs) {
        // no-op: costConfig.save() calls PUT /api/fixed-costs/{id} directly
    },
};

// =============================================================================
// Dynamic Cost Configuration
// =============================================================================
const costConfig = {
    STORAGE_KEY: 'interwall_cost_config',

    // VAT rates by country (extracted from gross price)
    VAT_RATES: {
        'NL': 21, 'BE': 21, 'DE': 19, 'FR': 20, 'ES': 21,
        'IT': 22, 'PT': 23, 'AT': 20, 'IE': 23, 'PL': 23,
        'UK': 20, 'LU': 17, 'CH': 8.1
    },
    DEFAULT_VAT_COUNTRY: 'NL',

    // Default costs (used on first load)
    DEFAULTS: [
        {
            id: 'vat',
            name: 'BTW/VAT',
            type: 'vat',             // Special type: deducted from sale price
            basis: 'salePrice',
            value: DEFAULTS.VAT_RATE, // VAT percentage (extracted from gross, not added)
            country: 'NL',
            enabled: true
        },
        {
            id: 'commission',
            name: 'Commission',
            type: 'percentage',      // 'fixed' or 'percentage'
            basis: 'salePrice',      // 'salePrice' or 'componentsCost' (only for percentage)
            value: DEFAULTS.COMMISSION_PCT, // percentage value (6.2 = 6.2%)
            enabled: true
        },
        {
            id: 'overhead',
            name: 'Fixed Overhead',
            type: 'fixed',
            basis: null,
            value: DEFAULTS.OVERHEAD_FIXED,
            enabled: true
        }
    ],

    costs: [],

    /**
     * Initialize cost config - BACKEND IS SOURCE OF TRUTH
     * Only falls back to localStorage if backend unavailable
     */
    async init() {
        // Try backend first (server-authoritative)
        const loaded = await this.loadFromBackend();
        if (!loaded) {
            // Backend unavailable, fall back to localStorage
            this.loadFromLocalStorage();
        }
    },

    async loadFromBackend() {
        try {
            const resp = await fetch('/api/fixed-costs', { credentials: 'same-origin' });
            if (!resp.ok) return false;
            const rows = await resp.json();
            if (!Array.isArray(rows)) return false;
            // Map DB rows to the format costConfig.costs expects
            this.costs = rows.map(r => ({
                id: r.id,          // UUID from DB
                name: r.name,
                // Map DB name to type for existing UI display logic
                type: r.is_percentage ? 'percentage' : 'fixed',
                basis: 'salePrice',
                value: parseFloat(r.value),
                enabled: true,
                _db_id: r.id,      // Keep DB UUID for PUT calls
            }));
            if (this.costs.length === 0) {
                // DB empty — use defaults until user configures costs
                this.costs = JSON.parse(JSON.stringify(this.DEFAULTS));
            }
            return true;
        } catch (e) {
            console.warn('Could not load costs from /api/fixed-costs:', e.message);
            return false;
        }
    },

    loadFromLocalStorage() {
        try {
            const stored = localStorage.getItem(this.STORAGE_KEY);
            if (stored) {
                this.costs = JSON.parse(stored);
            } else {
                // First time - use defaults
                this.costs = JSON.parse(JSON.stringify(this.DEFAULTS));
                this.save();
            }
        } catch (e) {
            console.error('Failed to load cost config:', e);
            this.costs = JSON.parse(JSON.stringify(this.DEFAULTS));
        }
    },

    // Legacy alias for backwards compatibility
    load() {
        this.loadFromLocalStorage();
    },

    save() {
        // Update each cost row in DB via PUT /api/fixed-costs/{id}
        // Only update rows that have a DB UUID (_db_id)
        for (const cost of this.costs) {
            if (cost._db_id) {
                fetch(`/api/fixed-costs/${cost._db_id}`, {
                    method: 'PUT',
                    credentials: 'same-origin',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        value: cost.value,
                        is_percentage: cost.type !== 'fixed',
                    }),
                }).catch(e => console.warn('Failed to save cost to DB:', e.message));
            }
        }
        // No localStorage write — DB is source of truth
    },

    getAll() {
        return this.costs.filter(c => c.enabled);
    },

    getAllIncludingDisabled() {
        return this.costs;
    },

    get(id) {
        return this.costs.find(c => c.id === id);
    },

    add(cost) {
        // Generate unique ID if not provided
        if (!cost.id) {
            cost.id = `cost_${Date.now().toString(36)}`;
        }
        cost.enabled = cost.enabled !== false;
        this.costs.push(cost);
        this.save();
        return cost;
    },

    update(id, updates) {
        const cost = this.get(id);
        if (cost) {
            Object.assign(cost, updates);
            this.save();
            return true;
        }
        return false;
    },

    remove(id) {
        const index = this.costs.findIndex(c => c.id === id);
        if (index !== -1) {
            this.costs.splice(index, 1);
            this.save();
            return true;
        }
        return false;
    },

    toggle(id) {
        const cost = this.get(id);
        if (cost) {
            cost.enabled = !cost.enabled;
            this.save();
            return true;
        }
        return false;
    },

    /**
     * Calculate cost value based on type and basis
     * @param {Object} cost - Cost configuration
     * @param {number} salePrice - Sale price (gross, including VAT)
     * @param {number} componentsCost - Components cost
     * @returns {number} Calculated cost value
     */
    calculateCost(cost, salePrice, componentsCost) {
        if (!cost.enabled) return 0;

        if (cost.type === 'fixed') {
            return cost.value;
        } else if (cost.type === 'percentage') {
            const basis = cost.basis === 'componentsCost' ? componentsCost : salePrice;
            return basis * (cost.value / 100);
        } else if (cost.type === 'vat') {
            // VAT is extracted from gross price: VAT = gross * rate / (1 + rate)
            const vatRate = cost.value / 100;
            return salePrice * vatRate / (1 + vatRate);
        }
        return 0;
    },
    
    /**
     * Get net sale price (after VAT extraction)
     */
    getNetSalePrice(grossPrice) {
        const vatCost = this.costs.find(c => c.type === 'vat' && c.enabled);
        if (!vatCost) return grossPrice;
        const vatRate = vatCost.value / 100;
        return grossPrice / (1 + vatRate);
    },

    /**
     * Calculate all costs and return breakdown
     */
    calculateAll(salePrice, componentsCost) {
        const breakdown = {
            items: [],
            total: 0
        };

        for (const cost of this.getAll()) {
            const value = this.calculateCost(cost, salePrice, componentsCost);
            breakdown.items.push({
                ...cost,
                calculatedValue: value
            });
            breakdown.total += value;
        }

        return breakdown;
    },

    /**
     * Format cost for display
     */
    formatCostLabel(cost) {
        if (cost.type === 'fixed') {
            return `${cost.name} (€${cost.value.toFixed(2)})`;
        } else {
            const basisLabel = cost.basis === 'componentsCost' ? 'of parts' : 'of sale';
            return `${cost.name} (${cost.value}% ${basisLabel})`;
        }
    }
};

// Legacy config for backward compatibility
const PROFIT_CONFIG = {
    get COMMISSION_RATE() {
        const commission = costConfig.get('commission');
        return commission ? commission.value / 100 : DEFAULTS.COMMISSION_RATE;
    },
    get STATIC_OVERHEAD() {
        const overhead = costConfig.get('overhead');
        return overhead ? overhead.value : DEFAULTS.OVERHEAD_FIXED;
    }
};

// =============================================================================
// Cost Editor Module
// =============================================================================
const costEditor = {
    currentCostId: null,

    init() {
        const modal = document.getElementById('costEditModal');
        const closeBtn = document.getElementById('costEditClose');
        const cancelBtn = document.getElementById('costEditCancel');
        const deleteBtn = document.getElementById('costDeleteBtn');
        const form = document.getElementById('costEditForm');
        const typeSelect = document.getElementById('costType');
        const addBtn = document.getElementById('btnAddCost');

        if (closeBtn) closeBtn.addEventListener('click', () => this.hide());
        if (cancelBtn) cancelBtn.addEventListener('click', () => this.hide());
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) this.hide();
            });
        }
        if (form) form.addEventListener('submit', (e) => this.submit(e));
        if (deleteBtn) deleteBtn.addEventListener('click', () => this.deleteCost());
        if (typeSelect) typeSelect.addEventListener('change', () => this.onTypeChange());
        if (addBtn) addBtn.addEventListener('click', () => this.showAdd());
    },

    showAdd() {
        this.currentCostId = null;
        document.getElementById('costEditTitle').textContent = 'Add Cost';
        document.getElementById('costName').value = '';
        document.getElementById('costType').value = 'fixed';
        document.getElementById('costBasis').value = 'salePrice';
        document.getElementById('costValue').value = '';
        document.getElementById('costEnabled').checked = true;
        document.getElementById('costEditId').value = '';
        document.getElementById('costDeleteBtn').style.display = 'none';

        this.onTypeChange();
        document.getElementById('costEditModal').classList.add('active');
        document.getElementById('costName').focus();
    },

    showEdit(costId) {
        const cost = costConfig.get(costId);
        if (!cost) return;

        this.currentCostId = costId;
        document.getElementById('costEditTitle').textContent = 'Edit Cost';
        document.getElementById('costName').value = cost.name;
        document.getElementById('costType').value = cost.type;
        document.getElementById('costBasis').value = cost.basis || 'salePrice';
        document.getElementById('costValue').value = cost.value;
        document.getElementById('costEnabled').checked = cost.enabled;
        document.getElementById('costEditId').value = costId;
        document.getElementById('costDeleteBtn').style.display = 'block';

        this.onTypeChange();
        document.getElementById('costEditModal').classList.add('active');
    },

    hide() {
        document.getElementById('costEditModal').classList.remove('active');
        this.currentCostId = null;
    },

    onTypeChange() {
        const type = document.getElementById('costType').value;
        const basisGroup = document.getElementById('costBasisGroup');
        const valueLabel = document.getElementById('costValueLabel');

        if (type === 'percentage') {
            basisGroup.style.display = 'block';
            valueLabel.textContent = 'Percentage (%)';
            document.getElementById('costValue').placeholder = '0.0';
        } else {
            basisGroup.style.display = 'none';
            valueLabel.textContent = 'Amount (€)';
            document.getElementById('costValue').placeholder = '0.00';
        }
    },

    submit(e) {
        e.preventDefault();

        const name = document.getElementById('costName').value.trim();
        const type = document.getElementById('costType').value;
        const basis = type === 'percentage' ? document.getElementById('costBasis').value : null;
        const value = parseFloat(document.getElementById('costValue').value) || 0;
        const enabled = document.getElementById('costEnabled').checked;

        if (!name) {
            toast.show('Please enter a cost name', 'error');
            return;
        }

        if (value <= 0) {
            toast.show('Please enter a valid value', 'error');
            return;
        }

        if (this.currentCostId) {
            // Update existing
            costConfig.update(this.currentCostId, { name, type, basis, value, enabled });
            toast.show(`Cost "${name}" updated`, 'success');
        } else {
            // Add new
            costConfig.add({ name, type, basis, value, enabled });
            toast.show(`Cost "${name}" added`, 'success');
        }

        this.hide();
        recordSale.renderCostBreakdown();
        recordSale.updateCostDisplay();
    },

    deleteCost() {
        if (!this.currentCostId) return;

        const cost = costConfig.get(this.currentCostId);
        if (!cost) return;

        if (confirm(`Delete "${cost.name}"? This action cannot be undone.`)) {
            costConfig.remove(this.currentCostId);
            toast.show(`Cost "${cost.name}" deleted`, 'success');
            this.hide();
            recordSale.renderCostBreakdown();
            recordSale.updateCostDisplay();
        }
    }
};

// =============================================================================
// Profit State
// =============================================================================
const profitState = {
    transactions: [],
    // totalMargin is derived on render from `transactions` (canonical from
    // /api/profit/transactions). Do not re-introduce a client-authoritative
    // mirror — D-025/D-040.
    inventoryValue: 0,
    currentScope: 'month', // week | month | year | custom
    cashFlowScope: 'today',
    currentSubView: 'main', // main | inventory
    components: [], // Components added to current sale (manual)
    stockCache: new Map() // partId -> stock items for FIFO
};

// =============================================================================
// Record Sale Module
// =============================================================================
const recordSale = {
    currentEditOrderId: null, // Track if we're editing an existing sale
    currentEditSource: null,

    resetEditMode() {
        this.currentEditOrderId = null;
        this.currentEditSource = null;
    },

    setDatabaseEditReadonly(isReadonly) {
        const productInput = document.getElementById('saleProductName');
        const salePriceInput = document.getElementById('salePrice');
        const componentSelect = document.getElementById('componentSelect');
        const componentQty = document.getElementById('componentQty');
        const addBtn = document.getElementById('addComponentBtn');
        const submitBtn = document.querySelector('#recordSaleForm button[type="submit"]');

        if (productInput) productInput.disabled = isReadonly;
        if (salePriceInput) salePriceInput.disabled = isReadonly;
        if (componentSelect) componentSelect.disabled = isReadonly;
        if (componentQty) componentQty.disabled = isReadonly;
        if (addBtn) addBtn.disabled = isReadonly;
        if (submitBtn) submitBtn.textContent = isReadonly ? 'Close' : 'Save Sale';
    },

    applyStoredDatabaseBreakdown(tx) {
        const bd = tx.costBreakdown || {};
        const manualCostEl = document.getElementById('componentsCostDisplay');
        const totalCostEl = document.getElementById('totalCostDisplay');
        const salePriceEl = document.getElementById('salePriceDisplay');
        const marginEl = document.getElementById('marginDisplay');
        const oldTotalCost = document.getElementById('saleTotalCost');
        const oldMarginPreview = document.getElementById('saleMarginPreview');

        if (manualCostEl) manualCostEl.textContent = `€${(bd.manualComponents || 0).toFixed(2)}`;
        if (totalCostEl) totalCostEl.textContent = `€${tx.cost.toFixed(2)}`;
        if (salePriceEl) salePriceEl.textContent = `€${tx.sale.toFixed(2)}`;
        if (marginEl) {
            marginEl.textContent = `€${tx.margin.toFixed(2)}`;
            marginEl.style.color = tx.margin >= 0 ? 'var(--signal-healthy-text)' : 'var(--signal-critical-text)';
        }
        if (oldTotalCost) oldTotalCost.textContent = `€${tx.cost.toFixed(2)}`;
        if (oldMarginPreview) {
            oldMarginPreview.textContent = `${tx.margin >= 0 ? '+' : ''}€${tx.margin.toFixed(2)}`;
            oldMarginPreview.className = `value ${tx.margin >= 0 ? 'positive' : 'negative'}`;
        }

        const dynContainer = document.getElementById('dynamicCostsContainer');
        if (dynContainer) {
            dynContainer.innerHTML = [
                bd.vat > 0 ? `<div class="cost-item cost-item-automatic"><span class="cost-label">VAT ${sanitize(bd.vatCountry || '')} <span class="cost-badge">${sanitize(bd.vatRate || 21)}%</span></span><span class="cost-value">€${bd.vat.toFixed(2)}</span></div>` : '',
                bd.commission > 0 ? `<div class="cost-item cost-item-automatic"><span class="cost-label">Commission <span class="cost-badge">${((bd.commissionRate || 0) * 100).toFixed(1)}%</span></span><span class="cost-value">€${bd.commission.toFixed(2)}</span></div>` : '',
                bd.staticOverhead > 0 ? `<div class="cost-item cost-item-automatic"><span class="cost-label">Overhead <span class="cost-badge">€${bd.staticOverhead.toFixed(0)}</span></span><span class="cost-value">€${bd.staticOverhead.toFixed(2)}</span></div>` : '',
            ].join('');
        }
    },

    init() {
        console.log('recordSale.init() starting...');

        const modal = document.getElementById('recordSaleModal');
        const closeBtn = document.getElementById('recordSaleClose');
        const cancelBtn = document.getElementById('recordSaleCancel');
        const form = document.getElementById('recordSaleForm');
        const addBtn = document.getElementById('addComponentBtn');
        const salePriceInput = document.getElementById('salePrice');
        const openBtn = document.getElementById('btnRecordSale');

        console.log('DOM elements found:', {
            modal: !!modal,
            closeBtn: !!closeBtn,
            cancelBtn: !!cancelBtn,
            form: !!form,
            addBtn: !!addBtn,
            salePriceInput: !!salePriceInput,
            openBtn: !!openBtn
        });

        if (closeBtn) closeBtn.addEventListener('click', () => this.hide());
        if (cancelBtn) cancelBtn.addEventListener('click', () => this.hide());
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) this.hide();
            });
        }
        if (form) form.addEventListener('submit', (e) => this.submit(e));
        if (addBtn) addBtn.addEventListener('click', () => this.addComponent());
        if (salePriceInput) salePriceInput.addEventListener('input', () => this.updateMarginPreview());

        if (openBtn) {
            openBtn.addEventListener('click', () => {
                console.log('Record Sale button clicked!');
                this.show();
            });
            console.log('Event listener attached to Record Sale button');
        } else {
            console.error('Record Sale button not found!');
        }

        console.log('recordSale.init() complete');
    },

    async show() {
        const modal = document.getElementById('recordSaleModal');

        // Reset edit mode
        this.resetEditMode();
        this.setDatabaseEditReadonly(false);

        // Update modal title for new sale
        const titleEl = document.querySelector('#recordSaleModal .modal-title');
        if (titleEl) titleEl.textContent = 'Record New Sale';

        // Reset form
        document.getElementById('saleProductName').value = '';
        document.getElementById('salePrice').value = '';
        profitState.components = [];
        profitState.stockCache.clear();

        // Refresh parts data to get current stock levels
        // This ensures the dropdown shows accurate in_stock values
        if (typeof loadParts === 'function') {
            await loadParts();
        }

        // Populate component dropdown with parts
        await this.populatePartsDropdown();

        // Clear components list
        this.renderComponentsList();

        this.updateCostDisplay();

        modal.classList.add('active');
        document.getElementById('saleProductName').focus();
    },

    /**
     * Show modal in edit mode for an existing sale
     * @param {string} orderId - The order ID to edit
     */
    async showEdit(orderId) {
        const tx = profitState.transactions.find(t => t.orderId === orderId);
        if (!tx) {
            toast.show('Transaction not found', 'error');
            return;
        }

        const modal = document.getElementById('recordSaleModal');

        // Set edit mode
        this.currentEditOrderId = orderId;
        this.currentEditSource = tx.source || null;

        // Update modal title for edit
        const titleEl = document.querySelector('#recordSaleModal .modal-title');
        if (titleEl) titleEl.textContent = `Edit Sale: ${orderId}`;

        // Populate form with existing data
        document.getElementById('saleProductName').value = tx.productName || '';
        document.getElementById('salePrice').value = tx.sale || '';

        // DB-sourced transactions: show stored values directly, no client-side recalc
        if (tx.source === 'database') {
            this.setDatabaseEditReadonly(true);
            profitState.components = (tx.components || []).map(c => ({
                partName: c.partName,
                qty: c.qty,
                fifoCost: c.cost || 0,
                batchesUsed: [],
                isEdit: true,
            }));

            this.renderComponentsList();
            this.applyStoredDatabaseBreakdown(tx);

            modal.classList.add('active');
            document.getElementById('salePrice').focus();
            return;
        }

        // Legacy flow for non-DB transactions
        this.setDatabaseEditReadonly(false);
        profitState.components = [];
        profitState.stockCache.clear();

        for (const comp of (tx.components || [])) {
            profitState.components.push({
                partId: comp.partId,
                partName: comp.partName,
                qty: comp.qty,
                fifoCost: comp.cost,
                batchesUsed: comp.batchesUsed || [],
                isEdit: true
            });
        }

        await this.populatePartsDropdown();
        this.renderComponentsList();
        this.updateCostDisplay();

        modal.classList.add('active');
        document.getElementById('saleProductName').focus();
    },

    hide() {
        document.getElementById('recordSaleModal').classList.remove('active');
        this.resetEditMode();
        this.setDatabaseEditReadonly(false);
    },

    async populatePartsDropdown() {
        const select = document.getElementById('componentSelect');
        select.innerHTML = '<option value="">Select component...</option>';

        // Get parts from state (already loaded by main app)
        if (state.parts && state.parts.size > 0) {
            // Check for duplicate names and build lookup
            const nameCount = {};
            state.parts.forEach((part) => {
                const name = part.name || 'Unknown';
                nameCount[name] = (nameCount[name] || 0) + 1;
            });
            
            // Convert to array, filter in-stock, and sort
            const partsArray = [...state.parts.values()]
                .filter(p => (p.in_stock ?? 0) > 0)
                .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
            
            partsArray.forEach((part) => {
                const inStock = part.in_stock ?? 0;
                const opt = document.createElement('option');
                opt.value = part.pk;
                // FIX: Include SKU/IPN to distinguish parts with same name
                const sku = part.IPN || `PK-${part.pk}`;
                const isDuplicate = nameCount[part.name || 'Unknown'] > 1;
                // Show SKU prominently if name is duplicated
                opt.textContent = isDuplicate
                    ? `[${sku}] ${part.name} (${inStock} in stock)`
                    : `${part.name} (${sku}) - ${inStock} in stock`;
                select.appendChild(opt);
            });
        }
    },

    async addComponent() {
        const select = document.getElementById('componentSelect');
        const qtyInput = document.getElementById('componentQty');

        const partId = parseInt(select.value);
        const qty = parseInt(qtyInput.value) || 1;

        if (!partId) {
            toast.show('Please select a component', 'error');
            return;
        }

        const part = state.parts.get(partId);
        if (!part) return;

        // Check if already added
        const existing = profitState.components.find(c => c.partId === partId);
        if (existing) {
            existing.qty += qty;
        } else {
            // Calculate FIFO cost for this component
            const fifoResult = await this.calculateFifoCost(partId, qty);

            if (!fifoResult.success) {
                toast.show(`Insufficient stock for ${part.name}`, 'error');
                return;
            }

            profitState.components.push({
                partId,
                partName: part.name,
                qty,
                fifoCost: fifoResult.totalCost,
                batchesUsed: fifoResult.batchesUsed
            });
        }

        // Reset inputs
        select.value = '';
        qtyInput.value = '1';

        // Refresh UI
        this.renderComponentsList();
        this.updateCostDisplay();
    },

    async calculateFifoCost(partId, qtyNeeded) {
        // Get or fetch stock items for this part
        let stocks = profitState.stockCache.get(partId);

        if (!stocks) {
            stocks = await api.getStockForPart(partId);
            // Sort by date (oldest first) - FIFO
            stocks.sort((a, b) => new Date(a.updated || a.created) - new Date(b.updated || b.created));
            profitState.stockCache.set(partId, stocks);
        }

        let remaining = qtyNeeded;
        let totalCost = 0;
        const batchesUsed = [];

        for (const stock of stocks) {
            if (remaining <= 0) break;

            const availableQty = stock.quantity || 0;
            const unitCost = parseFloat(stock.purchase_price) || 0;

            if (availableQty <= 0) continue;

            const takeQty = Math.min(remaining, availableQty);
            const cost = takeQty * unitCost;

            batchesUsed.push({
                stockId: stock.pk,
                qty: takeQty,
                unitCost,
                subtotal: cost,
                location: stock.location_detail?.name || 'Unknown'
            });

            totalCost += cost;
            remaining -= takeQty;
        }

        if (remaining > 0) {
            return { success: false, totalCost: 0, batchesUsed: [] };
        }

        return { success: true, totalCost, batchesUsed };
    },

    renderComponentsList() {
        const container = document.getElementById('saleComponentsList');

        if (profitState.components.length === 0) {
            container.innerHTML = '<div class="empty-components">No components added yet</div>';
            return;
        }

        container.innerHTML = profitState.components.map((c, idx) => `
            <div class="component-item" data-idx="${idx}">
                <div class="component-info">
                    <span class="component-name">${sanitize(c.partName)} × ${sanitize(c.qty)}</span>
                    <span class="component-cost">FIFO Cost: €${c.fifoCost.toFixed(2)}</span>
                </div>
                <button type="button" class="component-remove" data-idx="${idx}">×</button>
            </div>
        `).join('');

        // Attach remove handlers
        container.querySelectorAll('.component-remove').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = parseInt(btn.dataset.idx);
                profitState.components.splice(idx, 1);
                this.renderComponentsList();
                this.updateCostDisplay();
            });
        });
    },

    updateCostDisplay() {
        this.renderCostBreakdown();
        this.updateCostBreakdown();
    },

    /**
     * Render dynamic cost items in the breakdown
     */
    renderCostBreakdown() {
        const container = document.getElementById('dynamicCostsContainer');
        if (!container) return;

        const costs = costConfig.getAllIncludingDisabled();
        const salePrice = parseFloat(document.getElementById('salePrice').value) || 0;
        const componentsCost = this.calculateComponentsCost();

        container.innerHTML = costs.map(cost => {
            const calculatedValue = costConfig.calculateCost(cost, salePrice, componentsCost);
            const label = costConfig.formatCostLabel(cost);
            const disabledClass = cost.enabled ? '' : 'cost-item-disabled';

            return `
                <div class="cost-item cost-item-automatic cost-item-editable ${disabledClass}"
                     onclick="costEditor.showEdit('${sanitize(cost.id)}')"
                     title="Click to edit">
                    <span class="cost-label">
                        ${sanitize(cost.name)}
                        <span class="cost-badge">${cost.type === 'fixed' ? '€' + cost.value.toFixed(0) : sanitize(cost.value) + '%'}</span>
                        <svg class="cost-edit-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                        </svg>
                    </span>
                    <span class="cost-value" data-cost-id="${sanitize(cost.id)}">€${calculatedValue.toFixed(2)}</span>
                </div>
            `;
        }).join('');
    },

    updateCostBreakdown() {
        if (this.currentEditSource === 'database' && this.currentEditOrderId) {
            const tx = profitState.transactions.find(t => t.orderId === this.currentEditOrderId);
            if (tx) {
                this.applyStoredDatabaseBreakdown(tx);
                return;
            }
        }

        // Get current values
        const salePrice = parseFloat(document.getElementById('salePrice').value) || 0;
        const totalComponentsCost = this.calculateManualComponentsCost();

        // Calculate all dynamic costs
        const costBreakdown = costConfig.calculateAll(salePrice, totalComponentsCost);
        const totalCost = totalComponentsCost + costBreakdown.total;
        const margin = salePrice - totalCost;

        // Update individual cost values
        for (const item of costBreakdown.items) {
            const el = document.querySelector(`[data-cost-id="${item.id}"]`);
            if (el) el.textContent = `€${item.calculatedValue.toFixed(2)}`;
        }

        // Update breakdown display elements
        const manualCostEl = document.getElementById('componentsCostDisplay');
        const totalCostEl = document.getElementById('totalCostDisplay');
        const salePriceEl = document.getElementById('salePriceDisplay');
        const marginEl = document.getElementById('marginDisplay');

        if (manualCostEl) manualCostEl.textContent = `€${totalComponentsCost.toFixed(2)}`;
        if (totalCostEl) totalCostEl.textContent = `€${totalCost.toFixed(2)}`;
        if (salePriceEl) salePriceEl.textContent = `€${salePrice.toFixed(2)}`;

        // Update margin with color coding
        if (marginEl) {
            marginEl.textContent = `€${margin.toFixed(2)}`;
            marginEl.style.color = margin >= 0 ?
                'var(--signal-healthy-text)' :
                'var(--signal-critical-text)';
        }

        // Also update old elements for backward compatibility
        const oldTotalCost = document.getElementById('saleTotalCost');
        const oldMarginPreview = document.getElementById('saleMarginPreview');
        if (oldTotalCost) oldTotalCost.textContent = `€${totalCost.toFixed(2)}`;
        if (oldMarginPreview) {
            oldMarginPreview.textContent = `${margin >= 0 ? '+' : ''}€${margin.toFixed(2)}`;
            oldMarginPreview.className = `value ${margin >= 0 ? 'positive' : 'negative'}`;
        }
    },

    updateMarginPreview() {
        // Redirect to new cost breakdown method
        this.updateCostBreakdown();
    },

    calculateComponentsCost() {
        return profitState.components.reduce((sum, c) => sum + c.fifoCost, 0);
    },

    calculateManualComponentsCost() {
        return profitState.components.reduce((sum, c) => sum + c.fifoCost, 0);
    },

    async submit(e) {
        e.preventDefault();

        const isEditMode = !!this.currentEditOrderId;
        const productName = document.getElementById('saleProductName').value.trim();
        const salePrice = parseFloat(document.getElementById('salePrice').value) || 0;

        // DB-sourced transactions are immutable in the UI; close without PATCH.
        if (isEditMode) {
            const existingTx = profitState.transactions.find(t => t.orderId === this.currentEditOrderId);
            if (existingTx && existingTx.source === 'database' && existingTx.dbId) {
                if (
                    salePrice !== Number(existingTx.sale || 0) ||
                    productName !== String(existingTx.productName || '')
                ) {
                    toast.show('Stored sale values are immutable; use the recorded transaction as history.', 'warning');
                } else {
                    toast.show('Stored sale values are immutable.', 'info');
                }
                this.hide();
                return;
            }
        }

        // Legacy flow for non-DB transactions (manual sales)
        const componentsCost = this.calculateComponentsCost();
        const costBreakdown = costConfig.calculateAll(salePrice, componentsCost);
        const totalCost = componentsCost + costBreakdown.total;
        const margin = salePrice - totalCost;

        const allComponents = [...profitState.components];

        if (allComponents.length === 0) {
            toast.show('Please add at least one component', 'error');
            return;
        }

        // Only consume stock for NEW components (not when editing with existing components)
        if (!isEditMode) {
            try {
                for (const component of allComponents) {
                    for (const batch of (component.batchesUsed || [])) {
                        await api.request(`/stock/${batch.stockId}/`, {
                            method: 'PATCH',
                            body: JSON.stringify({
                                quantity: (await this.getStockQty(batch.stockId)) - batch.qty
                            })
                        });
                    }
                }
            } catch (err) {
                toast.show('Failed to update inventory', 'error');
                console.error('Stock update error:', err);
                return;
            }
        } else {
            try {
                for (const component of allComponents) {
                    if (component.isEdit) continue;
                    for (const batch of (component.batchesUsed || [])) {
                        await api.request(`/stock/${batch.stockId}/`, {
                            method: 'PATCH',
                            body: JSON.stringify({
                                quantity: (await this.getStockQty(batch.stockId)) - batch.qty
                            })
                        });
                    }
                }
            } catch (err) {
                toast.show('Failed to update inventory', 'error');
                console.error('Stock update error:', err);
                return;
            }
        }

        const orderId = isEditMode ? this.currentEditOrderId : `ORD-${Date.now().toString(36).toUpperCase()}`;
        const existingTx = isEditMode ? profitState.transactions.find(t => t.orderId === orderId) : null;

        const transaction = {
            orderId,
            productName,
            date: existingTx?.date || new Date().toISOString().split('T')[0],
            components: allComponents.map(c => ({
                partId: c.partId,
                partName: c.partName,
                qty: c.qty,
                cost: c.fifoCost,
                batchesUsed: (c.batchesUsed || []).map(b => ({
                    stockId: b.stockId,
                    qty: b.qty,
                    unitCost: b.unitCost,
                    location: b.location
                }))
            })),
            cost: totalCost,
            sale: salePrice,
            margin: margin,
            costBreakdown: {
                manualComponents: this.calculateManualComponentsCost(),
                components: componentsCost,
                additionalCosts: costBreakdown.items.map(item => ({
                    id: item.id,
                    name: item.name,
                    type: item.type,
                    basis: item.basis,
                    value: item.value,
                    calculatedValue: item.calculatedValue
                })),
                additionalCostsTotal: costBreakdown.total
            }
        };

        if (isEditMode && existingTx) {
            const txIndex = profitState.transactions.findIndex(t => t.orderId === orderId);
            if (txIndex !== -1) {
                profitState.transactions[txIndex] = transaction;
            }
        } else {
            profitState.transactions.unshift(transaction);
        }

        if (!isEditMode) {
            await this.syncToInvenTree(transaction);
        }

        profitEngine.render();
        this.hide();

        await loadParts();

        const actionWord = isEditMode ? 'updated' : 'recorded';
        toast.show(`Sale ${actionWord}! Margin: €${transaction.margin.toFixed(2)}`, margin >= 0 ? 'success' : 'warning');
    },

    /**
     * Sync transaction to InvenTree as a Sales Order
     * This enables cross-device sync - all devices see the same data
     */
    async syncToInvenTree(transaction) {
        try {
            // Create Sales Order
            const soData = {
                customer_reference: transaction.orderId,
                description: transaction.productName,
                target_date: transaction.date,
                // total_price will be calculated from line items
            };
            
            const soResp = await api.request('/order/so/', {
                method: 'POST',
                body: JSON.stringify(soData)
            });
            
            if (!soResp || !soResp.pk) {
                console.warn('Failed to create Sales Order in InvenTree');
                return;
            }
            
            const soPk = soResp.pk;
            console.log(`✅ Created Sales Order SO-${soPk} in InvenTree`);
            
            // Add line items for each component
            for (const comp of transaction.components) {
                const lineData = {
                    order: soPk,
                    part: comp.partId,
                    quantity: comp.qty,
                    sale_price: transaction.sale / transaction.components.length, // Distribute price
                    notes: `FIFO_COST:${comp.cost.toFixed(2)}`
                };
                
                await api.request('/order/so-line/', {
                    method: 'POST',
                    body: JSON.stringify(lineData)
                });
            }
            
            // Store the InvenTree SO ID in the transaction
            transaction.soId = soPk;

            console.log(`✅ Synced ${transaction.components.length} line items to SO-${soPk}`);
        } catch (e) {
            console.error('Failed to sync to InvenTree:', e);
            // Don't fail the whole transaction - local save still works
        }
    },

    async getStockQty(stockId) {
        const data = await api.request(`/stock/${stockId}/`);
        return data.quantity || 0;
    },

    confirmDeleteSale(orderId) {
        const tx = profitState.transactions.find(t => t.orderId === orderId);
        if (!tx) {
            toast.show('Transaction not found', 'error');
            return;
        }

        const hasBatchData = tx.components.some(c => c.batchesUsed && c.batchesUsed.length > 0);

        let message = `DELETE SALE\n\n` +
            `Are you sure you want to delete this sale?\n\n` +
            `Order: ${tx.orderId}\n` +
            `Product: ${tx.productName}\n` +
            `Sale: EUR ${tx.sale.toFixed(2)}\n` +
            `Margin: EUR ${tx.margin.toFixed(2)}\n\n`;

        if (hasBatchData) {
            message += `The following components will be restored to inventory:\n`;
            tx.components.forEach(c => {
                message += `  - ${c.partName} x ${c.qty}\n`;
            });
        } else {
            message += `NOTE: This is an older sale without batch tracking.\n` +
                `Stock will NOT be restored automatically.`;
        }

        message += `\n\nThis action cannot be undone.`;

        if (confirm(message)) {
            this.deleteSale(orderId);
        }
    },

    async deleteSale(orderId) {
        const txIndex = profitState.transactions.findIndex(t => t.orderId === orderId);
        if (txIndex === -1) {
            toast.show('Transaction not found', 'error');
            return;
        }

        const tx = profitState.transactions[txIndex];

        // Restore stock for each component
        let stockRestored = false;
        
        // Method 1: Use batch data if available (manual sales)
        for (const component of tx.components) {
            if (component.batchesUsed && component.batchesUsed.length > 0) {
                for (const batch of component.batchesUsed) {
                    try {
                        // Get current stock quantity and add back what was consumed
                        const currentQty = await this.getStockQty(batch.stockId);
                        await api.request(`/stock/${batch.stockId}/`, {
                            method: 'PATCH',
                            body: JSON.stringify({
                                quantity: currentQty + batch.qty
                            })
                        });
                        stockRestored = true;
                        console.log(`Restored ${batch.qty} units to stock ${batch.stockId}`);
                    } catch (err) {
                        console.error(`Failed to restore stock ${batch.stockId}:`, err);
                    }
                }
            }
        }
        
        // Method 2: For InvenTree-imported orders, use stock add API
        if (!stockRestored && tx.source === 'inventree' && tx.soId) {
            console.log(`Restoring stock for InvenTree order ${tx.soId}...`);
            try {
                // Fetch line items from InvenTree SO
                const linesResp = await api.request(`/order/so-line/?order=${tx.soId}`);
                const lines = linesResp?.results || [];
                
                for (const line of lines) {
                    if (!line.part || !line.quantity) continue;
                    
                    // Find default location for this part (or use first stock location)
                    const partData = await api.request(`/part/${line.part}/`);
                    let locationId = partData?.default_location;
                    
                    // If no default location, get from existing stock or use location 1
                    if (!locationId) {
                        const existingStock = await api.request(`/stock/?part=${line.part}&limit=1`);
                        const firstItem = existingStock?.results?.[0];
                        locationId = firstItem?.location || 1;
                    }
                    
                    // Add stock back
                    const addResult = await api.request('/stock/', {
                        method: 'POST',
                        body: JSON.stringify({
                            part: line.part,
                            quantity: line.quantity,
                            location: locationId,
                            notes: `Restored from cancelled order ${tx.orderId}`
                        })
                    });
                    
                    if (addResult && addResult.pk) {
                        stockRestored = true;
                        console.log(`Added ${line.quantity} of part ${line.part} back to stock`);
                    }
                }
            } catch (err) {
                console.error('Failed to restore stock from InvenTree order:', err);
            }
        }

        // Remove transaction from list (totalMargin re-derives on render)
        profitState.transactions.splice(txIndex, 1);

        // Refresh UI
        profitEngine.render();

        // Refresh parts to show updated stock
        if (stockRestored) {
            await loadParts();
            toast.show('Sale deleted and stock restored', 'success');
        } else {
            toast.show('Sale deleted (no stock to restore)', 'success');
        }
    }
};

// =============================================================================
// Profit Engine Core
// =============================================================================
const profitEngine = {
    chart: null,

    mapApiTransaction(tx) {
        const sale = parseFloat(tx.total_price) || 0;
        const cogs = parseFloat(tx.cogs) || 0;
        const profit = parseFloat(tx.profit) || 0;
        const totalCost = sale - profit;
        const fixedCosts = tx.fixed_costs || [];
        const vatEntry = fixedCosts.find(f => f.name === 'vat');
        const commEntry = fixedCosts.find(f => f.name === 'commission');
        const overEntry = fixedCosts.find(f => f.name === 'overhead');
        const vatCountry = vatEntry ? vatEntry.country : 'NL';
        const vatRate = vatEntry ? vatEntry.value : 21;
        const components = (tx.components || []).map(c => ({
            partName: c.component_name,
            qty: c.quantity,
            cost: c.cost || 0,
        }));
        return {
            dbId: tx.id,
            orderId: tx.order_reference || tx.id,
            date: tx.created_at,
            productName: tx.product_name || tx.product_ean,
            sale: sale,
            cost: totalCost,
            margin: profit,
            marginPercent: sale > 0 ? ((profit / sale) * 100) : 0,
            components: components,
            costBreakdown: {
                components: cogs,
                manualComponents: cogs,
                commission: commEntry ? commEntry.amount : 0,
                commissionRate: commEntry ? commEntry.value / 100 : 0,
                staticOverhead: overEntry ? overEntry.amount : 0,
                vat: vatEntry ? vatEntry.amount : 0,
                vatRate: vatRate,
                vatCountry: vatCountry,
            },
            source: 'database',
        };
    },

    async init() {
        // Initialize cost configuration (await - backend is source of truth)
        await costConfig.init();
        costEditor.init();

        // Initialize Record Sale module
        recordSale.init();

        // Initialize Profit Config module (dedicated config popup)
        profitConfig.init();

        // Load transactions from canonical API (D-040 — server is source of truth)
        const apiTxns = await this.loadTransactionsFromAPI(100);
        profitState.transactions = (apiTxns || []).map(tx => this.mapApiTransaction(tx));

        // Calculate initial inventory value from API
        await this.calculateInventoryValue();

        // Setup Event Listeners
        this.setupEventListeners();

        // Render UI
        this.render();
    },

    async loadValuationFromAPI() {
        try {
            const resp = await fetch('/api/profit/valuation', {
                credentials: 'same-origin'
            });
            if (!resp.ok) return [];
            return await resp.json();
        } catch (e) {
            console.warn('Could not load inventory valuation:', e.message);
            return [];
        }
    },

    async loadTransactionsFromAPI(limit = 50, offset = 0) {
        try {
            return await api.getTransactions({ limit, offset });
        } catch (e) {
            console.warn('Could not load transactions:', e.message);
            return [];
        }
    },

    setupEventListeners() {
        // Chart Time Scope
        const scopeSelect = document.getElementById('chartTimeScope');
        if (scopeSelect) {
            scopeSelect.addEventListener('change', (e) => {
                profitState.currentScope = e.target.value;
                const customRange = document.getElementById('chartCustomRange');
                if (customRange) {
                    customRange.style.display = e.target.value === 'custom' ? 'flex' : 'none';
                }
                if (e.target.value !== 'custom') {
                    this.renderChart();
                }
            });
        }
        // Custom date range inputs
        const chartDateFrom = document.getElementById('chartDateFrom');
        const chartDateTo = document.getElementById('chartDateTo');
        if (chartDateFrom && chartDateTo) {
            const onRangeChange = () => {
                if (profitState.currentScope === 'custom' && chartDateFrom.value && chartDateTo.value) {
                    this.renderChart();
                }
            };
            chartDateFrom.addEventListener('change', onRangeChange);
            chartDateTo.addEventListener('change', onRangeChange);
        }

        // Cash Flow Scope
        const cashFlowSelect = document.getElementById('cashFlowScope');
        if (cashFlowSelect) {
            cashFlowSelect.addEventListener('change', (e) => {
                profitState.cashFlowScope = e.target.value;
                this.renderSummary(); // Summary handles cash flow update
            });
        }

        // Inventory Value Card Click -> Drill down
        const invCard = document.getElementById('cardInventoryValue');
        if (invCard) {
            invCard.addEventListener('click', () => {
                this.navigateToSubView('inventory');
            });
        }

        // Breadcrumb Navigation
        const breadcrumb = document.getElementById('profitBreadcrumb');
        if (breadcrumb) {
            breadcrumb.addEventListener('click', (e) => {
                if (e.target.classList.contains('crumb-item') && e.target.dataset.target) {
                    this.navigateToSubView(e.target.dataset.target);
                }
            });
        }

        // Update Sales Button (manual email poll trigger)
        const updateSalesBtn = document.getElementById('btnUpdateSales');
        if (updateSalesBtn) {
            updateSalesBtn.addEventListener('click', async () => {
                updateSalesBtn.disabled = true;
                updateSalesBtn.textContent = 'Checking inbox...';
                try {
                    const resp = await fetch('/api/poll-now', { method: 'POST' });
                    if (!resp.ok) throw new Error('Failed');
                    toast.show('Checking inbox for new sales...', 'info');
                    // Wait a few seconds then reload transactions
                    setTimeout(async () => {
                        const apiTxns = await this.loadTransactionsFromAPI(100);
                        profitState.transactions = (apiTxns || []).map(tx => this.mapApiTransaction(tx));
                        this.render();
                        updateSalesBtn.disabled = false;
                        updateSalesBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg> Update Sales';
                        toast.show(`${profitState.transactions.length} sales loaded`, 'success');
                    }, 8000);
                } catch (e) {
                    toast.show('Failed to trigger poll', 'error');
                    updateSalesBtn.disabled = false;
                    updateSalesBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg> Update Sales';
                }
            });
        }

        // Refresh Button
        const refreshBtn = document.getElementById('refreshInventoryBtn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent card click
                this.refreshInventoryValue();
            });
        }
    },

    navigateToSubView(viewName) {
        profitState.currentSubView = viewName;
        const mainView = document.getElementById('profitMainView');
        const invView = document.getElementById('profitInventoryView');
        const breadcrumb = document.getElementById('profitBreadcrumb');

        // Reset Breadcrumb Base
        breadcrumb.innerHTML = '<span class="crumb-item clickable" data-target="main">Profitability Engine</span>';

        if (viewName === 'inventory') {
            mainView.classList.add('hidden');
            invView.classList.remove('hidden');

            // Add breadcrumb item
            const span = document.createElement('span');
            span.className = 'crumb-item active';
            span.textContent = 'Inventory Valuation';
            breadcrumb.appendChild(span);

            this.renderInventoryBreakdown();
        } else {
            // Default to main
            mainView.classList.remove('hidden');
            invView.classList.add('hidden');

            // Fix breadcrumb for main (remove clickable class from last item)
            breadcrumb.innerHTML = '<span class="crumb-item active" data-target="main">Profitability Engine</span>';

            this.renderChart(); // Re-render chart to ensure size is correct
        }
    },

    async refreshInventoryValue() {
        // Show loading state if we have a refresh button
        const btn = document.getElementById('refreshInventoryBtn');
        if (btn) btn.classList.add('spin');

        await this.calculateInventoryValue();

        if (btn) setTimeout(() => btn.classList.remove('spin'), 500);
    },

    async calculateInventoryValue() {
        try {
            const startTime = performance.now();

            // Fetch valuation from API (database is source of truth)
            const items = await this.loadValuationFromAPI();

            let totalVal = 0;
            items.forEach(item => {
                totalVal += parseFloat(item.total_value) || 0;
            });

            profitState.inventoryValue = totalVal;
            profitState.stockItems = items.map(item => ({
                part: item.ean,
                name: item.name,
                quantity: item.total_qty,
                totalValue: parseFloat(item.total_value) || 0,
            }));

            // Update UI
            this.renderSummary();

            if (profitState.currentSubView === 'inventory') {
                this.renderInventoryBreakdown();
            }

            const elapsed = ((performance.now() - startTime) / 1000).toFixed(3);
            console.log(`Inventory Value Updated: EUR ${totalVal.toFixed(2)} (${items.length} products) in ${elapsed}s`);

        } catch (err) {
            console.error('Inventory Value Calc Error:', err);
            if (window.toast) toast.show('Failed to update inventory value', true);
        }
    },

    render() {
        this.renderSummary();
        this.renderChart();
        this.renderTransactions();
    },

    renderChart() {
        const canvas = document.getElementById('profitChart');
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;

        if (this.chart) {
            this.chart.destroy();
        }

        const scope = profitState.currentScope;
        const transactions = profitState.transactions;
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        // Build time buckets: always ending at today (rightmost point)
        const buckets = []; // [{key, label, start, end}]
        const DAY_MS = 86400000;

        if (scope === 'week') {
            for (let i = 6; i >= 0; i--) {
                const d = new Date(today.getTime() - i * DAY_MS);
                buckets.push({
                    key: d.toISOString().slice(0, 10),
                    label: i === 0 ? 'Today' : d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' }),
                    start: d,
                    end: new Date(d.getTime() + DAY_MS),
                });
            }
        } else if (scope === 'month') {
            for (let i = 29; i >= 0; i--) {
                const d = new Date(today.getTime() - i * DAY_MS);
                buckets.push({
                    key: d.toISOString().slice(0, 10),
                    label: i === 0 ? 'Today' : (d.getDate() === 1 ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : String(d.getDate())),
                    start: d,
                    end: new Date(d.getTime() + DAY_MS),
                });
            }
        } else if (scope === 'year') {
            for (let i = 11; i >= 0; i--) {
                const m = new Date(now.getFullYear(), now.getMonth() - i, 1);
                const mEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
                buckets.push({
                    key: m.toISOString().slice(0, 7),
                    label: m.toLocaleDateString('en-US', { month: 'short' }),
                    start: m,
                    end: mEnd,
                });
            }
        } else if (scope === 'custom') {
            const fromEl = document.getElementById('chartDateFrom');
            const toEl = document.getElementById('chartDateTo');
            if (fromEl && toEl && fromEl.value && toEl.value) {
                const startDate = new Date(fromEl.value);
                const endDate = new Date(toEl.value);
                const diffDays = Math.round((endDate - startDate) / DAY_MS);
                if (diffDays > 0 && diffDays <= 365) {
                    for (let i = 0; i <= diffDays; i++) {
                        const d = new Date(startDate.getTime() + i * DAY_MS);
                        buckets.push({
                            key: d.toISOString().slice(0, 10),
                            label: diffDays > 60
                                ? (d.getDate() === 1 ? d.toLocaleDateString('en-US', { month: 'short' }) : '')
                                : String(d.getDate()),
                            start: d,
                            end: new Date(d.getTime() + DAY_MS),
                        });
                    }
                }
            }
        }

        if (buckets.length === 0) return;

        // Aggregate revenue, cost, profit per bucket
        const revenue = new Array(buckets.length).fill(0);
        const costs = new Array(buckets.length).fill(0);
        const profit = new Array(buckets.length).fill(0);

        transactions.forEach(tx => {
            const txDate = new Date(tx.date);
            for (let i = 0; i < buckets.length; i++) {
                if (txDate >= buckets[i].start && txDate < buckets[i].end) {
                    revenue[i] += (tx.sale || 0);
                    costs[i] += (tx.cost || 0);
                    profit[i] += (tx.margin || 0);
                    break;
                }
            }
        });

        // Cumulative profit line (running total across the window)
        const cumProfit = [];
        let running = 0;
        for (let i = 0; i < profit.length; i++) {
            running += profit[i];
            cumProfit.push(running);
        }

        const labels = buckets.map(b => b.label);
        const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
        const textColor = isDark ? '#ffffff' : '#333333';
        const gridColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';

        // Profit bar colors: green for positive, red for negative
        const profitColors = profit.map(v => v >= 0 ? 'rgba(0, 220, 180, 0.8)' : 'rgba(255, 80, 80, 0.8)');

        try {
            this.chart = new Chart(canvas, {
                type: 'bar',
                data: {
                    labels,
                    datasets: [
                        {
                            type: 'bar',
                            label: 'Revenue',
                            data: revenue,
                            backgroundColor: 'rgba(0, 180, 216, 0.25)',
                            borderColor: 'rgba(0, 180, 216, 0.5)',
                            borderWidth: 1,
                            borderRadius: 3,
                            order: 3,
                        },
                        {
                            type: 'bar',
                            label: 'Costs',
                            data: costs,
                            backgroundColor: 'rgba(255, 100, 100, 0.2)',
                            borderColor: 'rgba(255, 100, 100, 0.4)',
                            borderWidth: 1,
                            borderRadius: 3,
                            order: 2,
                        },
                        {
                            type: 'line',
                            label: 'Profit',
                            data: profit,
                            borderColor: '#00dcb4',
                            backgroundColor: 'transparent',
                            borderWidth: 2,
                            tension: 0.3,
                            pointBackgroundColor: profitColors,
                            pointBorderColor: profitColors,
                            pointRadius: profit.some(v => v !== 0) ? 4 : 0,
                            pointHoverRadius: 6,
                            order: 1,
                            segment: {
                                borderColor: ctx => {
                                    const v = ctx.p1.parsed.y;
                                    return v >= 0 ? '#00dcb4' : '#ff5050';
                                },
                            },
                        },
                        {
                            type: 'line',
                            label: 'Cumulative Profit',
                            data: cumProfit,
                            borderColor: 'rgba(255, 255, 255, 0.3)',
                            backgroundColor: 'transparent',
                            borderWidth: 1,
                            borderDash: [6, 4],
                            tension: 0.3,
                            pointRadius: 0,
                            pointHoverRadius: 4,
                            order: 0,
                        },
                    ],
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: {
                        mode: 'index',
                        intersect: false,
                    },
                    plugins: {
                        legend: {
                            display: true,
                            position: 'top',
                            labels: {
                                color: textColor,
                                usePointStyle: true,
                                pointStyle: 'circle',
                                padding: 16,
                                font: { size: 11 },
                            },
                        },
                        tooltip: {
                            callbacks: {
                                label: ctx => `${ctx.dataset.label}: €${ctx.parsed.y.toFixed(2)}`,
                            },
                        },
                    },
                    scales: {
                        x: {
                            ticks: {
                                color: textColor,
                                maxRotation: 0,
                                autoSkip: true,
                                maxTicksLimit: scope === 'month' ? 15 : undefined,
                                font: { size: 10 },
                            },
                            grid: { display: false },
                        },
                        y: {
                            ticks: {
                                color: textColor,
                                callback: v => '€' + v,
                                font: { size: 10 },
                            },
                            grid: { color: gridColor, borderDash: [4, 4] },
                        },
                    },
                },
            });
        } catch (err) {
            console.error('Chart Render Error:', err);
        }
    },

    renderSummary() {
        const marginEl = document.getElementById('todayMargin');
        const countEl = document.getElementById('txCount');
        const invEl = document.getElementById('totalInventoryValue');
        const cashFlowEl = document.getElementById('cashFlowValue');
        const heroInvEl = document.getElementById('heroInventoryValue');

        // Today's Margin — derived from the canonical transactions list
        // (/api/profit/transactions via getTransactions). Sums each tx's
        // stored `margin` so rendered sale values always match the
        // immutable server-side profit (D-025, D-040). Labelled "Today's
        // Margin" for UI continuity; current implementation sums across
        // the loaded window ("Simplified for MVP"), matching the
        // profit-summary-truth Playwright contract.
        const todayMargin = profitState.transactions.reduce(
            (sum, tx) => sum + (parseFloat(tx.margin) || 0),
            0,
        );
        if (marginEl) {
            marginEl.textContent = `${todayMargin >= 0 ? '' : '-'}€${Math.abs(todayMargin).toFixed(2)}`;
            marginEl.className = `value ${todayMargin >= 0 ? 'positive' : 'negative'}`;
        }

        // Transactions Count
        if (countEl) {
            countEl.textContent = profitState.transactions.length;
        }

        // Inventory Value
        if (invEl) {
            invEl.textContent = `€${profitState.inventoryValue.toFixed(2)}`;
        }
        if (heroInvEl) {
            heroInvEl.textContent = `€${profitState.inventoryValue.toFixed(2)}`;
        }

        // Cash Flow (Sales Total based on scope)
        if (cashFlowEl) {
            let totalSales = 0;
            const scope = profitState.cashFlowScope;
            const now = new Date();

            profitState.transactions.forEach(tx => {
                const txDate = new Date(tx.date);
                let include = false;

                if (scope === 'today') {
                    if (txDate.toDateString() === now.toDateString()) include = true;
                } else if (scope === 'month') {
                    if (txDate.getMonth() === now.getMonth() && txDate.getFullYear() === now.getFullYear()) include = true;
                }

                if (include) totalSales += (tx.sale || 0);
            });

            cashFlowEl.textContent = `€${totalSales.toFixed(2)}`;
        }
    },

    /**
     * Render drill-down table of inventory (from /api/profit/valuation)
     */
    renderInventoryBreakdown() {
        try {
            const tbody = document.getElementById('inventoryBreakdownBody');
            if (!tbody) return;

            if (!profitState.stockItems || profitState.stockItems.length === 0) {
                tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding: 2rem;">No stock data available</td></tr>';
                return;
            }

            // stockItems now comes from /api/profit/valuation: [{ean, name, total_qty, total_value}]
            let html = '';
            profitState.stockItems.forEach(item => {
                const qty = parseInt(item.quantity) || item.total_qty || 0;
                const value = parseFloat(item.totalValue) || 0;
                const unitCost = qty > 0 ? (value / qty) : 0;
                const name = item.name || item.part || 'Unknown';

                html += `
                    <tr class="product-row">
                        <td>${sanitize(name)}</td>
                        <td>${qty}</td>
                        <td>${unitCost.toFixed(2)}</td>
                        <td>${value.toFixed(2)}</td>
                    </tr>
                `;
            });

            tbody.innerHTML = html;
        } catch (e) {
            console.error('CRITICAL: Render Inventory Failed', e);
            const tbody = document.getElementById('inventoryBreakdownBody');
            if (tbody) tbody.innerHTML = `<tr><td colspan="4" style="color:red; text-align:center;">Error rendering data: ${sanitize(e.message)}</td></tr>`;
        }
    },

    renderTransactions() {
        const container = document.getElementById('transactionsList');
        if (!container) return;

        if (profitState.transactions.length === 0) {
            container.innerHTML = `
                <div class="empty-transactions">
                    <p>No transactions yet</p>
                    <p>Click "Record Sale" to add your first sale</p>
                </div>
            `;
            return;
        }

        container.innerHTML = profitState.transactions.map(tx => {
            const breakdown = tx.costBreakdown || {};

            return `
            <div class="transaction-card" data-order="${sanitize(tx.orderId)}">
                <div class="transaction-header">
                    <div class="transaction-header-left">
                        <span class="transaction-id">${sanitize(tx.orderId)}</span>
                        <span class="transaction-date">${sanitize(tx.date)}</span>
                    </div>
                    <div class="transaction-actions">
                        <button class="transaction-edit-btn" onclick="event.stopPropagation(); recordSale.showEdit('${sanitize(tx.orderId)}')" title="Edit Sale">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                            </svg>
                        </button>
                        <button class="transaction-delete-btn" onclick="event.stopPropagation(); recordSale.confirmDeleteSale('${sanitize(tx.orderId)}')" title="Delete Sale">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            </svg>
                        </button>
                    </div>
                </div>
                <div class="transaction-product">${sanitize(tx.productName)}</div>

                ${breakdown.components !== undefined ? `
                    <div class="transaction-breakdown">
                        <div class="breakdown-item">
                            <span class="breakdown-label">COGS (components):</span>
                            <span class="breakdown-value">€${(breakdown.manualComponents || 0).toFixed(2)}</span>
                        </div>
                        ${(breakdown.vat || 0) > 0 ? `
                        <div class="breakdown-item breakdown-item-auto">
                            <span class="breakdown-label">VAT ${sanitize(breakdown.vatCountry || '')} (${sanitize(breakdown.vatRate || 21)}%):</span>
                            <span class="breakdown-value">€${breakdown.vat.toFixed(2)}</span>
                        </div>
                        ` : ''}
                        <div class="breakdown-item breakdown-item-auto">
                            <span class="breakdown-label">Commission (${((breakdown.commissionRate || 0) * 100).toFixed(1)}%):</span>
                            <span class="breakdown-value">€${(breakdown.commission || 0).toFixed(2)}</span>
                        </div>
                        <div class="breakdown-item breakdown-item-auto">
                            <span class="breakdown-label">Overhead:</span>
                            <span class="breakdown-value">€${(breakdown.staticOverhead || 0).toFixed(2)}</span>
                        </div>
                    </div>
                ` : ''}

                <div class="transaction-financials">
                    <span class="cost">Total Cost: €${tx.cost.toFixed(2)}</span>
                    <span class="sale">Sale: €${tx.sale.toFixed(2)}</span>
                    <span class="margin ${tx.margin >= 0 ? 'positive' : 'negative'}">
                        Margin: ${tx.margin >= 0 ? '+' : ''}€${tx.margin.toFixed(2)}
                    </span>
                </div>
                <div class="transaction-details">
                    <strong>Components Used:</strong>
                    ${tx.components.map(c => `
                        <div class="batch-used">
                            <span class="part">${sanitize(c.partName)} × ${sanitize(c.qty)}</span>
                            <span class="batch-info">€${c.cost.toFixed(2)}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
        }).join('');

        // Add click handlers for expand/collapse
        container.querySelectorAll('.transaction-card').forEach(card => {
            card.addEventListener('click', () => {
                card.classList.toggle('expanded');
            });
        });
    }
};

// =============================================================================
// Expose modules globally for app.js integration
// Initialization is called from app.js onAuthSuccess() after parts are loaded
// =============================================================================
// =============================================================================
// Profit Configuration Module (Dedicated Config Popup)
// =============================================================================
const profitConfig = {
    init() {
        const configBtn = document.getElementById('btnConfigCosts');
        const closeBtn = document.getElementById('profitConfigClose');
        const modal = document.getElementById('profitConfigModal');

        if (configBtn) {
            configBtn.addEventListener('click', () => this.show());
        }
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.hide());
        }
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) this.hide();
            });
        }
    },

    show() {
        this.render();
        document.getElementById('profitConfigModal').classList.add('active');
    },

    hide() {
        document.getElementById('profitConfigModal').classList.remove('active');
    },

    render() {
        this.renderCosts();
        this.updateSyncStatus();
    },

    renderCosts() {
        const container = document.getElementById('configFixedCostsList');
        if (!container) return;

        const costs = costConfig.getAllIncludingDisabled();
        
        if (costs.length === 0) {
            container.innerHTML = '<div class="config-empty">No fixed costs configured</div>';
            return;
        }

        container.innerHTML = costs.map(cost => {
            const disabledClass = cost.enabled ? '' : 'disabled';
            let valueDisplay = '';

            if (cost.type === 'fixed') {
                valueDisplay = `€${cost.value.toFixed(2)}`;
            } else if (cost.type === 'percentage') {
                valueDisplay = `${sanitize(cost.value)}%`;
            } else if (cost.type === 'vat') {
                valueDisplay = `${sanitize(cost.value)}% VAT`;
            }

            return `
                <div class="config-item ${disabledClass}" onclick="profitConfig.editCost('${sanitize(cost.id)}')">
                    <div class="config-item-info">
                        <div class="config-item-name">${sanitize(cost.name)}</div>
                        <div class="config-item-detail">${sanitize(cost.type)} ${cost.basis ? `(${sanitize(cost.basis)})` : ''}</div>
                    </div>
                    <div class="config-item-value">${valueDisplay}</div>
                </div>
            `;
        }).join('');
    },

    addCost() {
        this.hide();
        costEditor.showAdd();
    },

    editCost(costId) {
        this.hide();
        costEditor.showEdit(costId);
    },

    updateSyncStatus() {
        const statusEl = document.getElementById('configSyncStatus');
        if (!statusEl) return;
        
        // Check if we have a sync timestamp from backend
        if (backendConfigSync.lastSyncTimestamp) {
            statusEl.innerHTML = `<span class="sync-icon">☁️</span><span class="sync-text">Synced to server</span>`;
        } else {
            statusEl.innerHTML = `<span class="sync-icon">💾</span><span class="sync-text">Local only</span>`;
        }
    }
};

window.profitEngine = profitEngine;
window.recordSale = recordSale;
window.costConfig = costConfig;
window.costEditor = costEditor;
window.profitConfig = profitConfig;
