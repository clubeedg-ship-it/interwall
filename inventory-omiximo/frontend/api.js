/**
 * =============================================================================
 * OMIXIMO INVENTORY OS - API Client
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

    async getStockAtLocation(locId) {
        const data = await this.request(`/stock/?location=${locId}&limit=100`);
        return data.results || data;
    },

    // Bulk load ALL stock items (for fast wall loading)
    async getAllStock() {
        const data = await this.request(`/stock/?in_stock=true&limit=2000`);
        return data.results || data;
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
     * Get stock items for a part with allocation data
     * @param {number} partId - Part ID
     * @returns {Promise<Array>} Stock items with allocated quantities
     */
    async getStockWithAllocation(partId) {
        const data = await this.request(`/stock/?part=${partId}&include_variants=true`);
        return data.results || data;
    },

    /**
     * Calculate available stock (total - allocated)
     * @param {number} partId - Part ID
     * @returns {Promise<Object>} { total, allocated, available }
     */
    async getAvailableStock(partId) {
        const stock = await this.getStockWithAllocation(partId);
        const totals = stock.reduce((acc, s) => {
            acc.total += s.quantity || 0;
            acc.allocated += s.allocated || 0;
            return acc;
        }, { total: 0, allocated: 0 });

        return {
            ...totals,
            available: totals.total - totals.allocated
        };
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

    /**
     * Remove stock items (delete or set to 0)
     * @param {number} stockItemId - Stock item ID
     * @param {number} qty - Quantity to remove
     */
    async removeStock(stockItemId, qty) {
        // Use stock move/remove endpoint
        return this.request('/stock/remove/', {
            method: 'POST',
            body: JSON.stringify({
                items: [{ pk: stockItemId, quantity: qty }],
                notes: 'Picked via Omiximo OS'
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
    }
};

window.api = api;
