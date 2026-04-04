/**
 * =============================================================================
 * OMIXIMO INVENTORY OS - Profit Engine
 * Real FIFO Cost Calculation & Transaction Recording
 * =============================================================================
 */

// =============================================================================
// Backend Config Sync - Persists config for email automation
// =============================================================================
const backendConfigSync = {
    // Config API endpoint (email automation container)
    // Use ENV config if available, fallback to localhost for local dev
    API_URL: (window.ENV && window.ENV.CONFIG_API_BASE) ? window.ENV.CONFIG_API_BASE : 'http://localhost:8085/api/config',
    
    // Debounce timer to avoid too many requests
    _syncTimer: null,
    _pendingSync: null,
    
    // Last sync timestamp from backend
    lastSyncTimestamp: null,

    async syncAll() {
        const costs = JSON.parse(localStorage.getItem('omiximo_cost_config') || '[]');
        const components = JSON.parse(localStorage.getItem('omiximo_fixed_components') || '[]');
        
        try {
            const response = await fetch(this.API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    fixed_costs: costs,
                    fixed_components: components
                })
            });
            if (response.ok) {
                console.log('✅ Config synced to backend');
            } else {
                console.warn('⚠️ Backend sync failed:', response.status);
            }
        } catch (e) {
            console.warn('⚠️ Backend sync unavailable:', e.message);
        }
    },

    syncCosts(costs) {
        this._scheduleSync();
    },

    syncComponents(components) {
        this._scheduleSync();
    },

    _scheduleSync() {
        // Debounce: wait 500ms after last change before syncing
        if (this._syncTimer) clearTimeout(this._syncTimer);
        this._syncTimer = setTimeout(() => this.syncAll(), 500);
    },

    async loadFromBackend() {
        try {
            const response = await fetch(this.API_URL);
            if (response.ok) {
                const data = await response.json();
                // Store sync timestamp
                if (data._updated) {
                    this.lastSyncTimestamp = data._updated;
                }
                return data;
            }
        } catch (e) {
            console.warn('Backend config not available, using localStorage');
        }
        return null;
    }
};

// =============================================================================
// Dynamic Cost Configuration
// =============================================================================
const costConfig = {
    STORAGE_KEY: 'omiximo_cost_config',

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
            value: 21,               // VAT percentage (extracted from gross, not added)
            country: 'NL',
            enabled: true
        },
        {
            id: 'commission',
            name: 'Commission',
            type: 'percentage',      // 'fixed' or 'percentage'
            basis: 'salePrice',      // 'salePrice' or 'componentsCost' (only for percentage)
            value: 6.2,              // percentage value (6.2 = 6.2%)
            enabled: true
        },
        {
            id: 'overhead',
            name: 'Fixed Overhead',
            type: 'fixed',
            basis: null,
            value: 95.00,
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
            const data = await backendConfigSync.loadFromBackend();
            if (data && data.fixed_costs) {
                console.log('✅ Loaded costs from backend:', data.fixed_costs);
                this.costs = data.fixed_costs.length > 0 ? data.fixed_costs : JSON.parse(JSON.stringify(this.DEFAULTS));
                localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.costs)); // Cache locally
                return true;
            }
        } catch (e) {
            console.warn('Could not load costs from backend:', e);
        }
        return false;
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
        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.costs));
            // Sync to backend for email automation
            backendConfigSync.syncCosts(this.costs);
        } catch (e) {
            console.error('Failed to save cost config:', e);
        }
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
        return commission ? commission.value / 100 : 0.062;
    },
    get STATIC_OVERHEAD() {
        const overhead = costConfig.get('overhead');
        return overhead ? overhead.value : 95.00;
    }
};

// =============================================================================
// Fixed Components Configuration
// =============================================================================
const fixedComponentsConfig = {
    STORAGE_KEY: 'omiximo_fixed_components',

    // Default fixed components (empty on first load)
    DEFAULTS: [],

    components: [],

    /**
     * Initialize fixed components config - BACKEND IS SOURCE OF TRUTH
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
            const data = await backendConfigSync.loadFromBackend();
            if (data && data.fixed_components !== undefined) {
                console.log('✅ Loaded fixed components from backend:', data.fixed_components);
                this.components = data.fixed_components || [];
                localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.components)); // Cache locally
                return true;
            }
        } catch (e) {
            console.warn('Could not load fixed components from backend:', e);
        }
        return false;
    },

    loadFromLocalStorage() {
        try {
            const stored = localStorage.getItem(this.STORAGE_KEY);
            if (stored) {
                this.components = JSON.parse(stored);
            } else {
                // First time - use defaults (empty)
                this.components = JSON.parse(JSON.stringify(this.DEFAULTS));
                this.save();
            }
        } catch (e) {
            console.error('Failed to load fixed components config:', e);
            this.components = [];
        }
    },

    // Legacy alias for backwards compatibility
    load() {
        this.loadFromLocalStorage();
    },

    save() {
        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.components));
            // Sync to backend for email automation
            backendConfigSync.syncComponents(this.components);
        } catch (e) {
            console.error('Failed to save fixed components config:', e);
        }
    },

    getAll() {
        return this.components.filter(c => c.enabled);
    },

    getAllIncludingDisabled() {
        return this.components;
    },

    get(id) {
        return this.components.find(c => c.id === id);
    },

    add(component) {
        // Generate unique ID if not provided
        if (!component.id) {
            component.id = `fixcomp_${Date.now().toString(36)}`;
        }
        component.enabled = component.enabled !== false;
        this.components.push(component);
        this.save();
        return component;
    },

    update(id, updates) {
        const comp = this.get(id);
        if (comp) {
            Object.assign(comp, updates);
            this.save();
            return true;
        }
        return false;
    },

    remove(id) {
        const index = this.components.findIndex(c => c.id === id);
        if (index !== -1) {
            this.components.splice(index, 1);
            this.save();
            return true;
        }
        return false;
    },

    toggle(id) {
        const comp = this.get(id);
        if (comp) {
            comp.enabled = !comp.enabled;
            this.save();
            return true;
        }
        return false;
    }
};

// =============================================================================
// Fixed Components Editor Module
// =============================================================================
const fixedComponentsEditor = {
    currentCompId: null,

    init() {
        const modal = document.getElementById('fixedCompEditModal');
        const closeBtn = document.getElementById('fixedCompEditClose');
        const cancelBtn = document.getElementById('fixedCompEditCancel');
        const deleteBtn = document.getElementById('fixedCompDeleteBtn');
        const form = document.getElementById('fixedCompEditForm');
        const addBtn = document.getElementById('btnAddFixedComponent');

        if (closeBtn) closeBtn.addEventListener('click', () => this.hide());
        if (cancelBtn) cancelBtn.addEventListener('click', () => this.hide());
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) this.hide();
            });
        }
        if (form) form.addEventListener('submit', (e) => this.submit(e));
        if (deleteBtn) deleteBtn.addEventListener('click', () => this.deleteComponent());
        if (addBtn) addBtn.addEventListener('click', () => this.showAdd());
    },

    async populatePartSelect() {
        try {
            const select = document.getElementById('fixedCompPartSelect');
            if (!select) {
                console.error('❌ fixedCompPartSelect element not found');
                return;
            }

            select.innerHTML = '<option value="">Loading parts...</option>';

            // Fetch ALL parts directly from API (don't rely on state which may be incomplete)
            const response = await api.getParts({ limit: 500 });
            const parts = response.results || response || [];
            
            select.innerHTML = '<option value="">Select a part...</option>';
            
            // Sort alphabetically
            parts.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
            
            // Check for duplicate names and warn
            const nameCount = {};
            parts.forEach(p => {
                const name = p.name || 'Unknown';
                nameCount[name] = (nameCount[name] || 0) + 1;
            });
            const duplicateNames = Object.keys(nameCount).filter(n => nameCount[n] > 1);
            if (duplicateNames.length > 0) {
                console.warn('⚠️ Duplicate part names found:', duplicateNames);
            }
            
            parts.forEach(part => {
                const opt = document.createElement('option');
                opt.value = part.pk;
                // FIX: Include SKU/IPN to distinguish parts with same name
                const sku = part.IPN || `PK-${part.pk}`;
                const isDuplicate = nameCount[part.name || 'Unknown'] > 1;
                // Show SKU prominently if name is duplicated, otherwise show after name
                opt.textContent = isDuplicate
                    ? `[${sku}] ${part.name || 'Unknown'} (${part.in_stock ?? 0} in stock)`
                    : `${part.name || 'Unknown'} (${sku}) - ${part.in_stock ?? 0} in stock`;
                select.appendChild(opt);
                
                // Also update state cache
                if (window.state?.parts) {
                    window.state.parts.set(part.pk, part);
                }
            });
            
            console.log(`✅ Populated ${parts.length} parts in fixed component dropdown`);
        } catch (e) {
            console.error('❌ Error in populatePartSelect:', e);
            const select = document.getElementById('fixedCompPartSelect');
            if (select) {
                select.innerHTML = '<option value="">Error loading parts</option>';
            }
        }
    },

    async showAdd() {
        this.currentCompId = null;
        document.getElementById('fixedCompEditTitle').textContent = 'Add Fixed Component';
        await this.populatePartSelect();
        document.getElementById('fixedCompPartSelect').value = '';
        document.getElementById('fixedCompQty').value = '1';
        document.getElementById('fixedCompEnabled').checked = true;
        document.getElementById('fixedCompEditId').value = '';
        document.getElementById('fixedCompDeleteBtn').style.display = 'none';

        document.getElementById('fixedCompEditModal').classList.add('active');
    },

    async showEdit(compId) {
        const comp = fixedComponentsConfig.get(compId);
        if (!comp) return;

        this.currentCompId = compId;
        document.getElementById('fixedCompEditTitle').textContent = 'Edit Fixed Component';
        await this.populatePartSelect();
        document.getElementById('fixedCompPartSelect').value = comp.partId;
        document.getElementById('fixedCompQty').value = comp.quantity;
        document.getElementById('fixedCompEnabled').checked = comp.enabled;
        document.getElementById('fixedCompEditId').value = compId;
        document.getElementById('fixedCompDeleteBtn').style.display = 'block';

        document.getElementById('fixedCompEditModal').classList.add('active');
    },

    hide() {
        document.getElementById('fixedCompEditModal').classList.remove('active');
        this.currentCompId = null;
    },

    async submit(e) {
        e.preventDefault();

        const partId = parseInt(document.getElementById('fixedCompPartSelect').value);
        const quantity = parseInt(document.getElementById('fixedCompQty').value) || 1;
        const enabled = document.getElementById('fixedCompEnabled').checked;

        if (!partId) {
            toast.show('Please select a part', 'error');
            return;
        }

        // Get part data from state (includes name which is used as SKU in automation)
        const part = state.parts.get(partId);
        const partName = part ? part.name : `Part #${partId}`;
        // SKU: Use IPN if available, otherwise use part name (matches automation config like "8GB RAM")
        const sku = part?.IPN || part?.name || partName;

        if (this.currentCompId) {
            // Update existing
            fixedComponentsConfig.update(this.currentCompId, { partId, partName, sku, quantity, enabled });
            toast.show(`Fixed component "${partName}" updated`, 'success');
        } else {
            // Check if part already exists as fixed component
            const existing = fixedComponentsConfig.components.find(c => c.partId === partId);
            if (existing) {
                toast.show(`"${partName}" is already a fixed component`, 'error');
                return;
            }

            // Add new (include SKU for email automation)
            fixedComponentsConfig.add({ partId, partName, sku, quantity, enabled });
            toast.show(`Fixed component "${partName}" added`, 'success');
        }

        this.hide();
        recordSale.renderFixedComponents();
    },

    deleteComponent() {
        if (!this.currentCompId) return;

        const comp = fixedComponentsConfig.get(this.currentCompId);
        if (!comp) return;

        if (confirm(`Remove "${comp.partName}" from fixed components?`)) {
            fixedComponentsConfig.remove(this.currentCompId);
            toast.show(`Fixed component "${comp.partName}" removed`, 'success');
            this.hide();
            recordSale.renderFixedComponents();
        }
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
    totalMargin: 0,
    inventoryValue: 0,
    currentScope: 'day', // day | week | month | year
    cashFlowScope: 'today',
    currentSubView: 'main', // main | inventory
    components: [], // Components added to current sale (manual)
    fixedComponents: [], // Fixed components auto-included in every sale
    stockCache: new Map() // partId -> stock items for FIFO
};

// =============================================================================
// Record Sale Module
// =============================================================================
const recordSale = {
    fixedComponentsCost: 0, // Track fixed components cost separately
    currentEditOrderId: null, // Track if we're editing an existing sale

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
        this.currentEditOrderId = null;

        // Update modal title for new sale
        const titleEl = document.querySelector('#recordSaleModal .modal-title');
        if (titleEl) titleEl.textContent = 'Record New Sale';

        // Reset form
        document.getElementById('saleProductName').value = '';
        document.getElementById('salePrice').value = '';
        profitState.components = [];
        profitState.stockCache.clear();
        this.fixedComponentsCost = 0;

        // Refresh parts data to get current stock levels
        // This ensures the dropdown shows accurate in_stock values
        if (typeof loadParts === 'function') {
            await loadParts();
        }

        // Populate component dropdown with parts
        await this.populatePartsDropdown();

        // Clear components list
        this.renderComponentsList();

        // Render fixed components and calculate their costs
        await this.renderFixedComponents();

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

        // Allow editing all transactions - InvenTree sync is for inventory tracking only
        // Show warning for InvenTree-sourced orders but don't block
        if (tx.source === 'inventree' && tx.soId) {
            toast.show('Note: Changes won\'t sync back to InvenTree', 'info');
        }

        const modal = document.getElementById('recordSaleModal');

        // Set edit mode
        this.currentEditOrderId = orderId;

        // Update modal title for edit
        const titleEl = document.querySelector('#recordSaleModal .modal-title');
        if (titleEl) titleEl.textContent = `Edit Sale: ${orderId}`;

        // Populate form with existing data
        document.getElementById('saleProductName').value = tx.productName || '';
        document.getElementById('salePrice').value = tx.sale || '';

        // Load components from transaction (without consuming stock again)
        profitState.components = [];
        profitState.stockCache.clear();
        this.fixedComponentsCost = 0;

        // Separate fixed and manual components
        const manualComponents = (tx.components || []).filter(c => !c.isFixed);
        const fixedComponents = (tx.components || []).filter(c => c.isFixed);

        // Restore manual components (use stored cost, don't recalculate)
        for (const comp of manualComponents) {
            profitState.components.push({
                partId: comp.partId,
                partName: comp.partName,
                qty: comp.qty,
                fifoCost: comp.cost,
                batchesUsed: comp.batchesUsed || [],
                isEdit: true // Flag to prevent stock consumption on re-save
            });
        }

        // Populate dropdown
        await this.populatePartsDropdown();

        // Render components list
        this.renderComponentsList();

        // Render fixed components (recalculate based on current config)
        await this.renderFixedComponents();

        this.updateCostDisplay();

        modal.classList.add('active');
        document.getElementById('saleProductName').focus();
    },

    hide() {
        document.getElementById('recordSaleModal').classList.remove('active');
        this.currentEditOrderId = null;
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
                    <span class="component-name">${c.partName} × ${c.qty}</span>
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

    /**
     * Render and calculate fixed components
     * These are automatically included in every sale
     */
    async renderFixedComponents() {
        const container = document.getElementById('fixedComponentsContainer');
        if (!container) return;

        const fixedComps = fixedComponentsConfig.getAllIncludingDisabled();
        profitState.fixedComponents = [];
        this.fixedComponentsCost = 0;

        if (fixedComps.length === 0) {
            container.innerHTML = `
                <div class="fixed-components-empty">
                    No fixed components configured
                </div>
            `;
            return;
        }

        let html = '';
        let hasWarnings = false;

        for (const comp of fixedComps) {
            const part = state.parts.get(comp.partId);
            const inStock = part ? (part.in_stock ?? 0) : 0;
            const hasEnoughStock = inStock >= comp.quantity;
            const disabledClass = comp.enabled ? '' : 'fixed-comp-disabled';
            const warningClass = (!hasEnoughStock && comp.enabled) ? 'fixed-comp-warning' : '';

            let fifoCost = 0;
            let stockStatus = '';

            if (comp.enabled) {
                if (hasEnoughStock) {
                    // Calculate FIFO cost for this fixed component
                    const fifoResult = await this.calculateFifoCost(comp.partId, comp.quantity);
                    if (fifoResult.success) {
                        fifoCost = fifoResult.totalCost;
                        this.fixedComponentsCost += fifoCost;

                        // Store for submission
                        profitState.fixedComponents.push({
                            partId: comp.partId,
                            partName: comp.partName,
                            qty: comp.quantity,
                            fifoCost: fifoCost,
                            batchesUsed: fifoResult.batchesUsed,
                            isFixed: true
                        });

                        stockStatus = `<span class="fixed-comp-stock ok">${inStock} in stock</span>`;
                    } else {
                        stockStatus = `<span class="fixed-comp-stock warning">Insufficient stock</span>`;
                        hasWarnings = true;
                    }
                } else {
                    stockStatus = `<span class="fixed-comp-stock warning">Need ${comp.quantity}, have ${inStock}</span>`;
                    hasWarnings = true;
                }
            } else {
                stockStatus = `<span class="fixed-comp-stock disabled">Disabled</span>`;
            }

            html += `
                <div class="fixed-component-item ${disabledClass} ${warningClass}"
                     onclick="fixedComponentsEditor.showEdit('${comp.id}')"
                     title="Click to edit">
                    <div class="fixed-comp-info">
                        <span class="fixed-comp-name">${comp.partName}</span>
                        <span class="fixed-comp-qty">× ${comp.quantity}</span>
                    </div>
                    <div class="fixed-comp-right">
                        ${stockStatus}
                        <span class="fixed-comp-cost">€${fifoCost.toFixed(2)}</span>
                        <svg class="fixed-comp-edit-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                        </svg>
                    </div>
                </div>
            `;
        }

        container.innerHTML = html;

        // Update the fixed components cost display
        const fixedCostDisplay = document.getElementById('fixedComponentsCostDisplay');
        if (fixedCostDisplay) {
            fixedCostDisplay.textContent = `€${this.fixedComponentsCost.toFixed(2)}`;
        }
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
                     onclick="costEditor.showEdit('${cost.id}')"
                     title="Click to edit">
                    <span class="cost-label">
                        ${cost.name}
                        <span class="cost-badge">${cost.type === 'fixed' ? '€' + cost.value.toFixed(0) : cost.value + '%'}</span>
                        <svg class="cost-edit-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                        </svg>
                    </span>
                    <span class="cost-value" data-cost-id="${cost.id}">€${calculatedValue.toFixed(2)}</span>
                </div>
            `;
        }).join('');
    },

    updateCostBreakdown() {
        // Get current values
        const salePrice = parseFloat(document.getElementById('salePrice').value) || 0;
        const manualComponentsCost = this.calculateManualComponentsCost();
        const fixedComponentsCost = this.fixedComponentsCost;
        const totalComponentsCost = manualComponentsCost + fixedComponentsCost;

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
        const fixedCostEl = document.getElementById('fixedComponentsCostDisplay');
        const totalCostEl = document.getElementById('totalCostDisplay');
        const salePriceEl = document.getElementById('salePriceDisplay');
        const marginEl = document.getElementById('marginDisplay');

        if (manualCostEl) manualCostEl.textContent = `€${manualComponentsCost.toFixed(2)}`;
        if (fixedCostEl) fixedCostEl.textContent = `€${fixedComponentsCost.toFixed(2)}`;
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
        // Manual components cost
        const manualCost = profitState.components.reduce((sum, c) => sum + c.fifoCost, 0);
        // Fixed components cost (already calculated in renderFixedComponents)
        return manualCost + this.fixedComponentsCost;
    },

    calculateManualComponentsCost() {
        // Only manual components, not fixed
        return profitState.components.reduce((sum, c) => sum + c.fifoCost, 0);
    },

    async submit(e) {
        e.preventDefault();

        const isEditMode = !!this.currentEditOrderId;
        const productName = document.getElementById('saleProductName').value.trim();
        const salePrice = parseFloat(document.getElementById('salePrice').value) || 0;
        const componentsCost = this.calculateComponentsCost();

        // Calculate all dynamic costs
        const costBreakdown = costConfig.calculateAll(salePrice, componentsCost);
        const totalCost = componentsCost + costBreakdown.total;
        const margin = salePrice - totalCost;

        // Combine manual and fixed components
        const allComponents = [
            ...profitState.components,
            ...(profitState.fixedComponents || [])
        ];

        if (allComponents.length === 0) {
            toast.show('Please add at least one component', 'error');
            return;
        }

        // Only consume stock for NEW components (not when editing with existing components)
        if (!isEditMode) {
            // New sale: consume stock from inventory (FIFO) - both manual and fixed components
            try {
                for (const component of allComponents) {
                    for (const batch of component.batchesUsed) {
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
            // Edit mode: only consume stock for newly added components (not marked as isEdit)
            try {
                for (const component of allComponents) {
                    if (component.isEdit) continue; // Skip components that were already in the original sale
                    for (const batch of component.batchesUsed) {
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

        // Create or update transaction record
        const orderId = isEditMode ? this.currentEditOrderId : `ORD-${Date.now().toString(36).toUpperCase()}`;
        const existingTx = isEditMode ? profitState.transactions.find(t => t.orderId === orderId) : null;
        
        const transaction = {
            orderId,
            productName,
            date: existingTx?.date || new Date().toISOString().split('T')[0],
            // Store all components with isFixed flag
            components: allComponents.map(c => ({
                partId: c.partId,
                partName: c.partName,
                qty: c.qty,
                cost: c.fifoCost,
                isFixed: c.isFixed || false,
                // Store batch details for potential restoration
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

            // Store breakdown for historical reference (dynamic costs)
            costBreakdown: {
                manualComponents: this.calculateManualComponentsCost(),
                fixedComponents: this.fixedComponentsCost,
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

        // Save transaction (add new or update existing)
        if (isEditMode && existingTx) {
            // Edit mode: update existing transaction
            const txIndex = profitState.transactions.findIndex(t => t.orderId === orderId);
            if (txIndex !== -1) {
                // Adjust total margin (remove old, add new)
                profitState.totalMargin -= existingTx.margin;
                profitState.totalMargin += transaction.margin;
                // Replace transaction
                profitState.transactions[txIndex] = transaction;
            }
        } else {
            // New sale: add to front of list
            profitState.transactions.unshift(transaction);
            profitState.totalMargin += transaction.margin;
        }
        
        this.saveTransactions();

        // Sync to InvenTree (creates Sales Order for cross-device sync)
        if (!isEditMode) {
            await this.syncToInvenTree(transaction);
        }

        // Refresh UI
        profitEngine.render();
        this.hide();

        // Refresh parts to show updated stock
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
                    notes: `FIFO_COST:${comp.cost.toFixed(2)}${comp.isFixed ? ' | FIXED' : ''}`
                };
                
                await api.request('/order/so-line/', {
                    method: 'POST',
                    body: JSON.stringify(lineData)
                });
            }
            
            // Store the InvenTree SO ID in the transaction
            transaction.soId = soPk;
            this.saveTransactions();
            
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

    saveTransactions() {
        localStorage.setItem('omiximo_transactions', JSON.stringify(profitState.transactions));
        localStorage.setItem('omiximo_totalMargin', profitState.totalMargin.toString());
    },

    loadTransactions() {
        const saved = localStorage.getItem('omiximo_transactions');
        const margin = localStorage.getItem('omiximo_totalMargin');

        if (saved) {
            profitState.transactions = JSON.parse(saved);
        }
        if (margin) {
            profitState.totalMargin = parseFloat(margin);
        }
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

        // Remove transaction from list
        profitState.transactions.splice(txIndex, 1);

        // Update total margin
        profitState.totalMargin -= tx.margin;

        // Save updated transactions
        this.saveTransactions();

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

    async init() {
        // Initialize cost configuration (await - backend is source of truth)
        await costConfig.init();
        costEditor.init();

        // Initialize fixed components configuration (await - backend is source of truth)
        await fixedComponentsConfig.init();
        fixedComponentsEditor.init();

        // Sync current config to backend (ensures email automation has latest)
        backendConfigSync.syncAll();

        // Initialize Record Sale module
        recordSale.init();

        // Initialize Profit Config module (dedicated config popup)
        profitConfig.init();

        // Load saved transactions from localStorage (local-only sales)
        recordSale.loadTransactions();

        // Fetch Sales Orders from InvenTree and merge (InvenTree is authoritative for synced orders)
        await this.fetchInvenTreeSalesOrders();
        
        // Recalculate total margin from all transactions (ensures accuracy after merge)
        profitState.totalMargin = profitState.transactions.reduce((sum, tx) => sum + (tx.margin || 0), 0);
        recordSale.saveTransactions();

        // Calculate initial inventory value (async)
        // No timeout needed - we check CONFIG.API_TOKEN now
        this.calculateInventoryValue();

        // Setup Event Listeners
        this.setupEventListeners();

        // Render UI
        this.render();
    },

    /**
     * Fetch Sales Orders from InvenTree (created by email automation)
     * and merge them into the transactions list
     */
    async fetchInvenTreeSalesOrders() {
        if (!CONFIG.API_TOKEN) {
            console.log('❌ No API token, skipping InvenTree SO fetch');
            return;
        }

        try {
            console.log('🔄 Fetching Sales Orders from InvenTree...');
            const response = await api.request('/order/so/?limit=100');
            console.log('📦 SO API response:', response);
            
            if (!response) {
                console.log('❌ No response from SO API');
                return;
            }
            
            // Handle both array and {results: [...]} format
            const salesOrders = response.results || response;
            if (!Array.isArray(salesOrders)) {
                console.log('❌ Unexpected SO response format:', typeof salesOrders);
                return;
            }
            
            console.log(`✅ Fetched ${salesOrders.length} Sales Orders from InvenTree`);

            for (const so of salesOrders) {
                // Check if already in transactions (by customer_reference as orderId)
                const orderId = so.customer_reference || so.reference;
                const existingTxIndex = profitState.transactions.findIndex(t => t.orderId === orderId);
                
                // If exists and is from InvenTree, skip (already synced)
                // If exists but is local-only, update it with InvenTree data
                if (existingTxIndex !== -1) {
                    const existingTx = profitState.transactions[existingTxIndex];
                    if (existingTx.source === 'inventree' && existingTx.soId === so.pk) {
                        // Already have this InvenTree order, skip
                        continue;
                    }
                    // Local transaction exists - will be updated below with InvenTree data
                    console.log(`📝 Updating local transaction ${orderId} with InvenTree data`);
                }

                // Fetch line items for this SO
                const linesResp = await api.request(`/order/so-line/?order=${so.pk}&limit=50`);
                const lines = linesResp?.results || [];

                // Build components list with costs from InvenTree parts
                const components = [];
                let totalComponentCost = 0;

                for (const line of lines) {
                    if (!line.part) continue;
                    
                    // Fetch part details for name
                    const partResp = await api.request(`/part/${line.part}/`);
                    const qty = line.quantity || 1;
                    
                    // Get cost from line item notes (FIFO_COST:xxx.xx format)
                    // This is the actual cost captured at sale time
                    let cost = 0;
                    const notes = line.notes || '';
                    const fifoMatch = notes.match(/FIFO_COST:([\d.]+)/);
                    if (fifoMatch) {
                        cost = parseFloat(fifoMatch[1]) || 0;
                    } else {
                        // Fallback: try internal-price if no FIFO cost captured
                        try {
                            const priceResp = await api.request(`/part/internal-price/?part=${line.part}`);
                            const prices = Array.isArray(priceResp) ? priceResp : priceResp?.results || [];
                            if (prices.length > 0) {
                                cost = (prices[0].price || 0) * qty;
                            }
                        } catch (e) {
                            console.warn(`Could not fetch price for part ${line.part}`);
                        }
                    }
                    
                    components.push({
                        partId: line.part,
                        partName: partResp?.name || `Part ${line.part}`,
                        quantity: qty,
                        unitCost: qty > 0 ? cost / qty : 0,  // Calculate unit cost from total
                        totalCost: cost,
                        notes: notes.replace(/\s*\|\s*FIFO_COST:[\d.]+/, '')  // Clean notes for display
                    });
                    totalComponentCost += cost;
                }

                // Calculate costs using current config
                const salePrice = parseFloat(so.total_price) || 0;
                const fixedCosts = costConfig.calculateAll(salePrice, totalComponentCost);
                const totalCost = totalComponentCost + fixedCosts.total;
                const margin = salePrice - totalCost;

                // Get commission rate for breakdown
                const commissionCost = costConfig.get('commission');
                const commissionRate = commissionCost ? commissionCost.value / 100 : 0.062;
                const commissionAmount = salePrice * commissionRate;
                const overheadCost = costConfig.get('overhead');
                const overhead = overheadCost ? overheadCost.value : 0;

                // Transform components to expected format
                const txComponents = components.map(c => ({
                    partId: c.partId,
                    partName: c.partName,
                    qty: c.quantity,
                    cost: c.totalCost,  // 'cost' not 'totalCost'
                    isFixed: c.notes?.includes('Fixed:') || false,
                    batchesUsed: []  // Not tracked for InvenTree imports
                }));

                // Create transaction record (matching expected format for renderTransactions)
                const transaction = {
                    orderId: orderId,
                    date: so.creation_date,
                    productName: so.description?.split('|')[0]?.trim() || `Order ${orderId}`,
                    sale: salePrice,           // 'sale' not 'salePrice'
                    cost: totalCost,           // 'cost' not 'totalCost'
                    margin: margin,
                    marginPercent: salePrice > 0 ? (margin / salePrice * 100) : 0,
                    components: txComponents,   // Use transformed components
                    // costBreakdown for rendering
                    costBreakdown: {
                        components: totalComponentCost,
                        commission: commissionAmount,
                        commissionRate: commissionRate,
                        staticOverhead: overhead
                    },
                    source: 'inventree',
                    soReference: so.reference,
                    soId: so.pk,
                    status: so.status_text
                };

                // Add or update transaction
                if (existingTxIndex !== -1) {
                    // Update existing local transaction with InvenTree data
                    profitState.transactions[existingTxIndex] = transaction;
                    console.log(`✅ Updated transaction ${orderId} from InvenTree`);
                } else {
                    // Add new transaction from InvenTree
                    profitState.transactions.push(transaction);
                    console.log(`✅ Added new transaction ${orderId} from InvenTree`);
                }
            }

            // Sort transactions by date (newest first)
            profitState.transactions.sort((a, b) => 
                new Date(b.date || b.timestamp) - new Date(a.date || a.timestamp)
            );

            console.log(`Total transactions after merge: ${profitState.transactions.length}`);
        } catch (e) {
            console.warn('Failed to fetch InvenTree Sales Orders:', e);
        }
    },

    setupEventListeners() {
        // Chart Time Scope
        const scopeSelect = document.getElementById('chartTimeScope');
        if (scopeSelect) {
            scopeSelect.addEventListener('change', (e) => {
                profitState.currentScope = e.target.value;
                this.renderChart();
            });
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

            // Use CONFIG.API_TOKEN from app.js instead of undefined state.token
            if (!CONFIG.API_TOKEN) {
                console.warn('calculateInventoryValue: No auth token available');
                return;
            }

            // Check cache first (5-minute TTL)
            const cacheKey = 'omiximo_inventory_cache';
            const cacheData = localStorage.getItem(cacheKey);

            if (cacheData) {
                try {
                    const { timestamp, value, items } = JSON.parse(cacheData);
                    const cacheAge = Date.now() - timestamp;
                    const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

                    if (cacheAge < CACHE_TTL) {
                        profitState.inventoryValue = value;
                        profitState.stockItems = items;

                        this.renderSummary();
                        if (profitState.currentSubView === 'inventory') {
                            this.renderInventoryBreakdown();
                        }

                        const elapsed = ((performance.now() - startTime) / 1000).toFixed(3);
                        console.log(`Inventory Value (cached): €${value.toFixed(2)} (${items.length} batches) in ${elapsed}s`);
                        return;
                    }
                } catch (e) {
                    console.warn('Cache parse error, fetching fresh data:', e);
                }
            }

            // Cache miss or expired - fetch fresh data
            console.log('Fetching fresh inventory data...');
            const stockItems = await api.request('/stock/?limit=1000');
            const items = stockItems.results || stockItems;

            let totalVal = 0;

            // Calculate value based on actual purchase_price
            items.forEach(item => {
                const qty = parseFloat(item.quantity) || 0;
                const price = parseFloat(item.purchase_price) || 0;
                totalVal += qty * price;
            });

            profitState.inventoryValue = totalVal;
            profitState.stockItems = items;

            // Store in cache
            localStorage.setItem(cacheKey, JSON.stringify({
                timestamp: Date.now(),
                value: totalVal,
                items: items
            }));

            // Update UI
            this.renderSummary();

            if (profitState.currentSubView === 'inventory') {
                this.renderInventoryBreakdown();
            }

            const elapsed = ((performance.now() - startTime) / 1000).toFixed(3);
            console.log(`Inventory Value Updated: €${totalVal.toFixed(2)} (${items.length} batches) in ${elapsed}s`);

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

        // Group Data Logic
        const groupedData = {};

        transactions.forEach(tx => {
            const txDate = new Date(tx.date);
            let key;

            if (scope === 'day') {
                if (txDate.toDateString() === now.toDateString()) {
                    key = txDate.getHours() + ':00';
                }
            } else if (scope === 'week') {
                const diffTime = Math.abs(now - txDate);
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                if (diffDays <= 7) {
                    key = txDate.toLocaleDateString('en-US', { weekday: 'short' });
                }
            } else if (scope === 'month') {
                if (txDate.getMonth() === now.getMonth() && txDate.getFullYear() === now.getFullYear()) {
                    key = txDate.getDate();
                }
            } else if (scope === 'year') {
                if (txDate.getFullYear() === now.getFullYear()) {
                    key = txDate.toLocaleDateString('en-US', { month: 'short' });
                }
            }

            if (key) {
                if (!groupedData[key]) groupedData[key] = 0;
                groupedData[key] += (tx.margin || 0);
            }
        });

        let labels = Object.keys(groupedData);
        let dataPoints = Object.values(groupedData);

        // Always show full range for each scope (like week view does)
        if (scope === 'day') {
            // Show all hours of today (0:00 -> 23:00)
            labels = [];
            for (let h = 0; h < 24; h++) {
                labels.push(h + ':00');
            }
            dataPoints = labels.map(l => groupedData[l] || 0);
        } else if (scope === 'week') {
            // Show last 7 days in order ending with today
            const dayOrder = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            const today = now.getDay();
            labels = [];
            for (let i = 6; i >= 0; i--) {
                const dayIdx = (today - i + 7) % 7;
                labels.push(dayOrder[dayIdx]);
            }
            dataPoints = labels.map(l => groupedData[l] || 0);
        } else if (scope === 'month') {
            // Show all days of current month (1 -> 28/29/30/31)
            const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
            labels = [];
            for (let d = 1; d <= daysInMonth; d++) {
                labels.push(String(d));
            }
            dataPoints = labels.map(l => groupedData[l] || groupedData[parseInt(l)] || 0);
        } else if (scope === 'year') {
            // Show all 12 months
            labels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            dataPoints = labels.map(l => groupedData[l] || 0);
        }

        const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
        const textColor = isDark ? '#ffffff' : '#333333';
        const gridColor = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';

        try {
            this.chart = new Chart(canvas, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Profit Margin',
                        data: dataPoints,
                        borderColor: '#00dcb4',
                        backgroundColor: 'rgba(0, 220, 180, 0.1)',
                        borderWidth: 2,
                        tension: 0.4,
                        fill: 'origin', // Explicitly fill to the X-axis (0)
                        pointBackgroundColor: '#005066',
                        pointBorderColor: '#fff',
                        pointRadius: 4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false }
                    },
                    scales: {
                        x: {
                            ticks: { color: textColor },
                            grid: { display: false }
                        },
                        y: {
                            beginAtZero: true, // Ensure we have a ground at 0
                            suggestedMin: 0,   // Suggest 0 as minimum even if data is higher
                            ticks: {
                                color: textColor,
                                callback: value => '€' + value
                            },
                            grid: { color: gridColor, borderDash: [5, 5] }
                        }
                    }
                }
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

        // Today's Margin
        const todayMargin = profitState.totalMargin; // Simplified for MVP (should filter by today)
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
     * Render drill-down table of inventory
     */
    renderInventoryBreakdown() {
        try {
            const tbody = document.getElementById('inventoryBreakdownBody');
            if (!tbody) return;

            if (!profitState.stockItems || profitState.stockItems.length === 0) {
                tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding: 2rem;">No stock data available</td></tr>';
                return;
            }

            console.time('renderInventory');
            // Group by Part
            const parts = {};
            let partCount = 0;
            const MAX_PARTS_TO_RENDER = 500; // Safety limit to prevent DOM freeze

            profitState.stockItems.forEach(item => {
                if (!item.part) return;
                const partId = item.part;

                if (!parts[partId]) {
                    // Check limit
                    if (partCount >= MAX_PARTS_TO_RENDER) return;

                    // FIX: Lookup part name from global state
                    const partDef = (typeof state !== 'undefined' && state.parts) ? state.parts.get(partId) : null;
                    const partName = partDef ? partDef.name : (item.part_detail ? item.part_detail.name : `Unknown Part (ID: ${partId})`);

                    parts[partId] = {
                        name: partName,
                        totalQty: 0,
                        totalValue: 0,
                        batches: []
                    };
                    partCount++;
                }

                // If part was skipped due to limit, don't accumulate
                if (!parts[partId]) return;

                const qty = parseFloat(item.quantity) || 0;
                const price = item.purchase_price ? parseFloat(item.purchase_price) : 0;
                const value = qty * price;

                parts[partId].totalQty += qty;
                parts[partId].totalValue += value;

                parts[partId].batches.push({
                    id: item.pk,
                    batch: item.batch || 'N/A',
                    location: item.location_detail ? item.location_detail.name : 'Unknown', // This relies on API, might be simplified
                    qty,
                    price,
                    value
                });
            });

            // Render HTML
            let html = '';
            Object.values(parts).forEach(part => {
                // Product Row
                html += `
                    <tr class="product-row clickable" onclick="toggleBatchRow(this)">
                        <td><span class="menu-arrow">▶</span> ${part.name}</td>
                        <td>${part.totalQty}</td>
                        <td>-</td>
                        <td>€${part.totalValue.toFixed(2)}</td>
                    </tr>
                 `;

                // Batches
                part.batches.forEach(batch => {
                    html += `
                        <tr class="batch-row hidden" onclick="batchDetail.show(${batch.id})" style="cursor: pointer;">
                            <td style="padding-left: 2rem;">
                                <span style="opacity:0.7">Batch: ${batch.batch} (Loc: ${batch.location})</span>
                            </td>
                            <td>${batch.qty}</td>
                            <td>€${batch.price.toFixed(2)}</td>
                            <td>€${batch.value.toFixed(2)}</td>
                        </tr>
                     `;
                });
            });

            if (partCount >= MAX_PARTS_TO_RENDER) {
                html += `<tr><td colspan="4" style="text-align:center; padding:1rem; opacity:0.6">... rendering limit reached (${MAX_PARTS_TO_RENDER} items) ...</td></tr>`;
            }

            tbody.innerHTML = html;
            console.timeEnd('renderInventory');

            // Assign toggle handler globally if not exists
            if (!window.toggleBatchRow) {
                window.toggleBatchRow = (row) => {
                    row.classList.toggle('expanded');
                    let next = row.nextElementSibling;
                    while (next && next.classList.contains('batch-row')) {
                        next.classList.toggle('hidden');
                        next = next.nextElementSibling;
                    }
                };
            }
        } catch (e) {
            console.error('CRITICAL: Render Inventory Failed', e);
            const tbody = document.getElementById('inventoryBreakdownBody');
            if (tbody) tbody.innerHTML = `<tr><td colspan="4" style="color:red; text-align:center;">Error rendering data: ${e.message}</td></tr>`;
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
            <div class="transaction-card" data-order="${tx.orderId}">
                <div class="transaction-header">
                    <div class="transaction-header-left">
                        <span class="transaction-id">${tx.orderId}</span>
                        <span class="transaction-date">${tx.date}</span>
                    </div>
                    <div class="transaction-actions">
                        <button class="transaction-edit-btn" onclick="event.stopPropagation(); recordSale.showEdit('${tx.orderId}')" title="Edit Sale">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                            </svg>
                        </button>
                        <button class="transaction-delete-btn" onclick="event.stopPropagation(); recordSale.confirmDeleteSale('${tx.orderId}')" title="Delete Sale">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            </svg>
                        </button>
                    </div>
                </div>
                <div class="transaction-product">${tx.productName}</div>

                ${breakdown.components !== undefined ? `
                    <div class="transaction-breakdown">
                        <div class="breakdown-item">
                            <span class="breakdown-label">Manual Components:</span>
                            <span class="breakdown-value">€${(breakdown.manualComponents || 0).toFixed(2)}</span>
                        </div>
                        ${(breakdown.fixedComponents || 0) > 0 ? `
                        <div class="breakdown-item fixed-components">
                            <span class="breakdown-label">Fixed Components:</span>
                            <span class="breakdown-value">€${breakdown.fixedComponents.toFixed(2)}</span>
                        </div>
                        ` : ''}
                        <div class="breakdown-item breakdown-item-auto">
                            <span class="breakdown-label">Commission (${((breakdown.commissionRate || 0) * 100).toFixed(1)}%):</span>
                            <span class="breakdown-value">€${(breakdown.commission || 0).toFixed(2)}</span>
                        </div>
                        <div class="breakdown-item breakdown-item-auto">
                            <span class="breakdown-label">Fixed Overhead:</span>
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
                        <div class="batch-used ${c.isFixed ? 'batch-fixed' : ''}">
                            <span class="part">${c.partName} × ${c.qty}${c.isFixed ? ' <span class="fixed-badge">FIXED</span>' : ''}</span>
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
        this.renderComponents();
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
                valueDisplay = `${cost.value}%`;
            } else if (cost.type === 'vat') {
                valueDisplay = `${cost.value}% VAT`;
            }

            return `
                <div class="config-item ${disabledClass}" onclick="profitConfig.editCost('${cost.id}')">
                    <div class="config-item-info">
                        <div class="config-item-name">${cost.name}</div>
                        <div class="config-item-detail">${cost.type} ${cost.basis ? `(${cost.basis})` : ''}</div>
                    </div>
                    <div class="config-item-value">${valueDisplay}</div>
                </div>
            `;
        }).join('');
    },

    renderComponents() {
        const container = document.getElementById('configFixedComponentsList');
        if (!container) return;

        const components = fixedComponentsConfig.getAllIncludingDisabled();
        
        if (components.length === 0) {
            container.innerHTML = '<div class="config-empty">No fixed components configured</div>';
            return;
        }

        container.innerHTML = components.map(comp => {
            const disabledClass = comp.enabled ? '' : 'disabled';
            return `
                <div class="config-item ${disabledClass}" onclick="profitConfig.editComponent('${comp.id}')">
                    <div class="config-item-info">
                        <div class="config-item-name">${comp.partName}</div>
                        <div class="config-item-detail">SKU: ${comp.sku || 'N/A'}</div>
                    </div>
                    <div class="config-item-value">× ${comp.quantity}</div>
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

    addComponent() {
        this.hide();
        fixedComponentsEditor.showAdd();
    },

    editComponent(compId) {
        this.hide();
        fixedComponentsEditor.showEdit(compId);
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
window.fixedComponentsConfig = fixedComponentsConfig;
window.fixedComponentsEditor = fixedComponentsEditor;
window.profitConfig = profitConfig;
