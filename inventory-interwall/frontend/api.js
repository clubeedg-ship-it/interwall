/**
 * =============================================================================
 * INTERWALL INVENTORY OS - API Client
 * =============================================================================
 */

// =============================================================================
// API Client
// =============================================================================
const api = {
    async request(endpoint, options = {}) {
        const headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        };

        const response = await fetch(`${CONFIG.API_BASE}${endpoint}`, {
            ...options,
            credentials: 'same-origin',
            headers: { ...headers, ...options.headers }
        });

        if (response.status === 401) {
            if (typeof auth !== 'undefined' && auth.showLoginModal) {
                auth.showLoginModal();
            }
            throw new Error('Not authenticated');
        }

        if (!response.ok) {
            const text = await response.text();
            let detail = text;
            try { detail = JSON.parse(text).detail || text; } catch (_) {}
            throw new Error(detail);
        }

        // Handle empty responses (e.g., DELETE returns 204 No Content)
        const text = await response.text();
        return text ? JSON.parse(text) : {};
    },


    async getLocations() {
        const query = buildTenantQuery({ limit: 500 });
        const data = await this.request(`/stock/location/${query}`);
        return data.results || data;
    },

    async getLocationByName(name) {
        const data = await this.request(`/stock/location/?name=${encodeURIComponent(name)}&limit=1`);
        const results = data.results || data;
        return results.length > 0 ? results[0] : null;
    },

    async createLocation(name, description, parentId = null) {
        const payload = { name, description };
        if (parentId) payload.parent = parentId;

        try {
            return await this.request('/stock/location/', {
                method: 'POST',
                body: JSON.stringify(payload)
            });
        } catch (e) {
            // Location might already exist
            console.warn(`Location '${name}' may already exist:`, e.message);
            return await this.getLocationByName(name);
        }
    },

    async getParts(options = {}) {
        const defaultParams = { limit: 50, offset: 0 };
        const params = { ...defaultParams, ...options };
        const query = buildTenantQuery(params);
        const data = await this.request(`/part/${query}`);
        // If it's a paginated response, it has 'results'. If valid list, it's array.
        // We return the raw data if it has 'results' (to get 'count' & 'next'),
        // OR the array if it's a direct array (rare in InvenTree if limit is used).
        // BUT current app.js expects an ARRAY.
        // We need to support both legacy array return AND new paginated return.
        // For compability during refactor, if 'results' exists, return it properties attached to the array?
        // No, let's return the full object if request asks for it, or just results.
        // Actually, to make 'catalog' pagination work, we MUST return 'next' and 'count'.
        // So we should return the full response object, and let the caller handle .results
        // However, existing code might break if we change return type.
        // Checking usages: 'loadParts' uses .forEach on result.
        // We are removing 'loadParts', so we can change the return signature!
        // BUT 'scanner.handlePart' uses 'api.searchPart', not 'getParts'.
        // Let's standardise: return the full DRF object { count, next, previous, results: [] }
        return data;
    },

    /**
     * Per-shelf occupancy from v_shelf_occupancy (T-C02b).
     * Returns array of {shelf_id, shelf_label, zone_name, col, level, bin,
     *                    capacity, total_qty, total_value, batch_count,
     *                    product_name, product_ean}.
     */
    async getShelfOccupancy() {
        return this.request('/api/shelves/occupancy');
    },

    /**
     * Update per-shelf settings via PATCH /api/shelves/{shelfId}.
     * @param {string} shelfId - Shelf UUID
     * @param {Object} patch - Fields to update: capacity, split_fifo, single_bin
     */
    async updateShelf(shelfId, patch) {
        return this.request(`/api/shelves/${shelfId}`, {
            method: 'PATCH',
            body: JSON.stringify(patch),
        });
    },

    async searchPart(query) {
        const data = await this.request(`/part/?search=${encodeURIComponent(query)}&limit=10`);
        return data.results || data;
    },

    async createStock(partId, locationId, qty, price, notes = '') {
        const body = {
            part: partId,
            location: locationId,
            quantity: qty,
            purchase_price: price
        };
        // Add notes if provided (for storing source URL)
        if (notes) {
            body.notes = notes;
        }
        return this.request('/stock/', {
            method: 'POST',
            body: JSON.stringify(body)
        });
    },

    /**
     * Canonical stock snapshot from v_part_stock via /api/profit/valuation.
     * Returns Map<ean, {in_stock, total_value}>.
     */
    async getPartStockSnapshot() {
        const rows = await this.request('/api/profit/valuation');
        const map = new Map();
        (Array.isArray(rows) ? rows : []).forEach(r => {
            map.set(r.ean, {
                in_stock: parseFloat(r.total_qty) || 0,
                total_value: parseFloat(r.total_value) || 0,
            });
        });
        return map;
    },

    /**
     * Products merged with canonical stock snapshot.
     * Returns array of {id, ean, name, sku, is_composite, minimum_stock, in_stock}.
     */
    async getProductsWithStock(searchParams) {
        const params = searchParams || new URLSearchParams();
        if (!params.has('composite')) params.set('composite', 'false');
        const [products, stockMap] = await Promise.all([
            this.request(`/api/products?${params}`),
            this.getPartStockSnapshot(),
        ]);
        return (Array.isArray(products) ? products : []).map(p => {
            const stock = stockMap.get(p.ean);
            return {
                pk: p.id,
                name: p.name,
                IPN: p.sku || '',
                ean: p.ean,
                is_composite: p.is_composite,
                in_stock: stock ? stock.in_stock : 0,
                minimum_stock: p.minimum_stock || 0,
            };
        });
    },

    /**
     * Get all stock items for a part (for FIFO picking)
     * @param {number} partId - Part ID
     * @returns {Promise<Array>} Stock items sorted by oldest first
     */
    async getStockForPart(partId) {
        const data = await this.request(`/stock/?part=${partId}&in_stock=true&ordering=updated`);
        return data.results || data;
    },

    /**
     * Canonical FIFO order for a product's stock lots (server-authoritative).
     * Returns [{id, quantity, unit_cost, marketplace, received_at, created_at}, ...]
     * ordered by received_at ASC — oldest first.
     */
    async getStockLotsByProduct(ean) {
        return this.request(`/api/stock-lots/by-product/${encodeURIComponent(ean)}`);
    },

    /**
     * Move a lot (or part of a lot) to another shelf.
     * Backed by POST /api/stock/transfer; session-authenticated.
     */
    async transferStock(lotId, toShelfId, qty, notes = '') {
        return this.request('/api/stock/transfer', {
            method: 'POST',
            body: JSON.stringify({
                lot_id: lotId,
                to_shelf_id: toShelfId,
                qty,
                notes,
            }),
        });
    },

    /**
     * Consume (decrement) qty from a specific stock lot.
     * Backed by POST /api/stock-lots/{lot_id}/consume. Used by the
     * handshake picking flow for manual stock-outs.
     */
    async consumeLot(lotId, qty, notes = '') {
        return this.request(`/api/stock-lots/${encodeURIComponent(lotId)}/consume`, {
            method: 'POST',
            body: JSON.stringify({ qty, notes }),
        });
    },

    /**
     * Consume stock from a specific stock item (reduce quantity)
     * @param {number} stockItemId - Stock item ID
     * @param {number} qty - Quantity to consume
     * @returns {Promise<Object>} Updated stock item
     */
    async consumeStock(stockItemId, qty) {
        // InvenTree uses a "take" API or direct quantity update
        // Using the stock adjustment endpoint
        return this.request(`/stock/${stockItemId}/`, {
            method: 'PATCH',
            body: JSON.stringify({
                quantity: qty
            })
        });
    },

    // =========================================================================
    // Part CRUD Operations
    // =========================================================================

    /**
     * Get part categories
     * @returns {Promise<Array>} List of categories
     */
    async getCategories() {
        const data = await this.request('/part/category/?limit=100');
        return data.results || data;
    },

    /**
     * Get single part details
     * @param {number} partId - Part ID
     * @returns {Promise<Object>} Part details
     */
    async getPart(partId) {
        return this.request(`/part/${partId}/`);
    },

    /**
     * Create a new part
     * @param {Object} data - Part data
     * @returns {Promise<Object>} Created part
     */
    async createPart(data) {
        return this.request('/part/', {
            method: 'POST',
            body: JSON.stringify({
                name: data.name,
                IPN: data.ipn || '',
                description: data.description || '',
                category: data.category || null,
                minimum_stock: data.minimum_stock || 0,
                component: true,  // This is a component/stock item
                purchaseable: true,
                salable: false,
                active: true
            })
        });
    },

    /**
     * Update an existing part
     * @param {number} partId - Part ID
     * @param {Object} data - Updated part data
     * @returns {Promise<Object>} Updated part
     */
    async updatePart(partId, data) {
        const payload = {};
        if (data.name !== undefined) payload.name = data.name;
        if (data.ipn !== undefined) payload.IPN = data.ipn;
        if (data.description !== undefined) payload.description = data.description;
        if (data.category !== undefined) payload.category = data.category;
        if (data.minimum_stock !== undefined) payload.minimum_stock = data.minimum_stock;

        return this.request(`/part/${partId}/`, {
            method: 'PATCH',
            body: JSON.stringify(payload)
        });
    },

    /**
     * Delete a part
     * @param {number} partId - Part ID
     * @returns {Promise<void>}
     */
    async deletePart(partId) {
        return this.request(`/part/${partId}/`, {
            method: 'DELETE'
        });
    },

    /**
     * Create a new part category
     * @param {Object} data - Category data
     * @returns {Promise<Object>} Created category
     */
    async createCategory(data) {
        return this.request('/part/category/', {
            method: 'POST',
            body: JSON.stringify({
                name: data.name,
                description: data.description || '',
                parent: data.parent || null
            })
        });
    },

    // =========================================================================
    // Profit & Fixed-Cost Canonical Reads (T-C02d)
    //
    // These are the session-authenticated, server-authoritative sources for
    // transaction, summary, and fixed-cost data. The frontend must not
    // re-derive or mutate these values from localStorage (D-025, D-040).
    // =========================================================================

    /**
     * Canonical transaction list from /api/profit/transactions.
     * @param {Object} [params] - { limit, offset }
     * @returns {Promise<Array>} Transaction rows (immutable economics)
     */
    async getTransactions(params = {}) {
        const qs = new URLSearchParams();
        if (params.limit != null) qs.set('limit', String(params.limit));
        if (params.offset != null) qs.set('offset', String(params.offset));
        const q = qs.toString();
        return this.request(`/api/profit/transactions${q ? `?${q}` : ''}`);
    },

    /**
     * Canonical profit summary from /api/profit/summary.
     * @param {Object} [params] - { period: 'day' | 'week' | 'month' }
     * @returns {Promise<Array>} Summary rows grouped by period + marketplace
     */
    async getProfitSummary(params = {}) {
        const qs = new URLSearchParams();
        if (params.period) qs.set('period', params.period);
        const q = qs.toString();
        return this.request(`/api/profit/summary${q ? `?${q}` : ''}`);
    },

    /**
     * Canonical fixed-cost rows from /api/fixed-costs.
     * @returns {Promise<Array>} Rows {id, name, value, is_percentage, updated_at}
     */
    async getFixedCosts() {
        return this.request('/api/fixed-costs');
    }
};

window.api = api;
