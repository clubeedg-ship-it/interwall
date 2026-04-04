/**
 * =============================================================================
 * OMIXIMO INVENTORY OS - Catalog Module (Enhanced with CRUD)
 * =============================================================================
 */

// =============================================================================
// Catalog Module (Enhanced with CRUD)
// =============================================================================
const catalog = {
    searchDebounce: null,
    categories: [],
    filterCategory: '',

    init() {
        // Search input (Server-side Debounce)
        if (dom.catalogSearch) {
            dom.catalogSearch.addEventListener('input', (e) => {
                clearTimeout(this.searchDebounce);
                this.searchDebounce = setTimeout(() => {
                    this.reload();
                }, 400); // 400ms debounce
            });
        }

        // Category filter
        const categoryFilter = document.getElementById('catalogCategoryFilter');
        if (categoryFilter) {
            categoryFilter.addEventListener('change', (e) => {
                this.filterCategory = e.target.value;
                this.reload();
            });
        }

        // FAB button
        const addBtn = document.getElementById('btnAddPart');
        if (addBtn) {
            addBtn.addEventListener('click', () => partManager.showCreate());
        }

        // New Category button
        const newCatBtn = document.getElementById('btnNewCategory');
        if (newCatBtn) {
            newCatBtn.addEventListener('click', () => categoryManager.show());
        }

        // Load categories
        this.loadCategories();
    },

    async loadCategories() {
        // Categories not available in new API — skip silently
    },

    populateCategoryFilter() {
        const filter = document.getElementById('catalogCategoryFilter');
        if (!filter) return;

        // Keep "All Categories" option
        filter.innerHTML = '<option value="">All Categories</option>';

        this.categories.forEach(cat => {
            const opt = document.createElement('option');
            opt.value = cat.pk;
            opt.textContent = cat.name;
            filter.appendChild(opt);
        });
    },

    /**
     * Clear and reload catalog
     */
    async reload() {
        state.catalog.results = [];
        state.catalog.next = null;
        state.catalog.count = 0;
        await this.loadNextPage();
    },

    /**
     * Load next page of parts
     */
    async loadNextPage() {
        if (state.catalog.loading) return;
        state.catalog.loading = true;

        const grid = document.getElementById('catalogGrid');

        // Show loading indicator if appending
        let loadingIndicator = null;
        if (state.catalog.results.length > 0 && grid) {
            loadingIndicator = document.createElement('div');
            loadingIndicator.className = 'catalog-loading-more';
            loadingIndicator.innerHTML = '<div class="spinner"></div> Loading more...';
            grid.appendChild(loadingIndicator);
        } else if (grid) {
            grid.innerHTML = '<div class="catalog-loading">Loading parts...</div>';
        }

        try {
            const search = dom.catalogSearch?.value?.trim();
            const query = search ? `?q=${encodeURIComponent(search)}` : '';
            const products = await api.request(`/api/products${query}`);

            // Normalize to catalog state format
            const newParts = (Array.isArray(products) ? products : []).map(p => ({
                pk: p.id,
                name: p.name,
                IPN: p.sku || '',
                ean: p.ean,
                is_composite: p.is_composite,
                in_stock: 0,
                minimum_stock: p.default_reorder_point || 0,
            }));

            state.catalog.count = newParts.length;
            state.catalog.next = null; // No pagination yet
            state.catalog.results = newParts;

            newParts.forEach(p => state.parts.set(p.pk, p));

            this.render();

        } catch (e) {
            console.error('Failed to load parts:', e);
            if (grid && state.catalog.results.length === 0) {
                grid.innerHTML = '<div class="catalog-error">Failed to load catalog</div>';
            }
        } finally {
            state.catalog.loading = false;
            // Remove loading indicator
            if (loadingIndicator) loadingIndicator.remove();
        }
    },

    render() {
        if (!dom.catalogGrid) return;

        const parts = state.catalog.results;
        const searchQuery = dom.catalogSearch?.value?.trim();

        if (parts.length === 0) {
            dom.catalogGrid.innerHTML = `
                <div class="catalog-empty">
                    <span>${searchQuery ? '' : ''}</span>
                    <p>${searchQuery ? `No parts found matching "${sanitize(searchQuery)}"` : 'No parts found.'}</p>
                </div>
            `;
            return;
        }

        dom.catalogGrid.innerHTML = parts.map(p => this.createCard(p)).join('');

        // Append "Load More" button if there are more results
        if (state.catalog.next) {
            const loadMoreBtn = document.createElement('button');
            loadMoreBtn.className = 'btn-load-more';
            loadMoreBtn.innerHTML = 'Load More';
            loadMoreBtn.onclick = () => this.loadNextPage();

            const btnContainer = document.createElement('div');
            btnContainer.className = 'load-more-container';
            btnContainer.appendChild(loadMoreBtn);
            dom.catalogGrid.appendChild(btnContainer);
        }

        // Attach card event listeners
        this.attachCardListeners();
    },

    attachCardListeners() {
        document.querySelectorAll('.part-card').forEach(card => {
            const partId = card.dataset.partId;
            const mainSection = card.querySelector('.part-card-main');

            // Edit button
            const editBtn = card.querySelector('.part-card-action.edit');
            if (editBtn) {
                editBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const part = state.parts.get(partId);
                    if (part) partManager.showEdit(part);
                });
            }

            // Delete button
            const deleteBtn = card.querySelector('.part-card-action.delete');
            if (deleteBtn) {
                deleteBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const part = state.parts.get(partId);
                    if (part) partManager.showDelete(part);
                });
            }

            // Expand batch section on main section click
            if (mainSection) {
                mainSection.addEventListener('click', (e) => {
                    if (e.target.closest('.part-card-actions')) return;
                    this.toggleBatches(card, partId);
                });
            }

            // Add batch button
            const addBatchBtn = card.querySelector('.btn-add-batch');
            if (addBatchBtn) {
                addBatchBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const part = state.parts.get(partId);
                    if (part) {
                        state.selectedPart = part;
                        handshake.show(part);
                    }
                });
            }
        });
    },

    toggleBatches(card, partId) {
        const batchSection = card.querySelector('.part-card-batches');
        const chevron = card.querySelector('.expand-chevron');

        if (!batchSection) return;

        const isExpanded = card.classList.toggle('expanded');
        if (chevron) chevron.classList.toggle('rotated', isExpanded);

        if (isExpanded) {
            state.expandedPart = partId;
            this.loadBatches(partId);
        } else {
            state.expandedPart = null;
        }
    },

    async loadBatches(partId) {
        const batchList = document.querySelector(`.batch-list[data-part-id="${partId}"]`);
        if (!batchList) return;

        // Find the EAN for this part from state
        const part = state.parts.get(partId);
        const ean = part?.ean;
        if (!ean) {
            batchList.innerHTML = '<div class="batch-empty">No EAN for this product</div>';
            return;
        }

        try {
            const lots = await api.request(`/api/stock-lots/by-product/${encodeURIComponent(ean)}`);

            if (lots.length === 0) {
                batchList.innerHTML = '<div class="batch-empty">No stock lots</div>';
                return;
            }

            batchList.innerHTML = lots.map(s => {
                const price = parseFloat(s.unit_cost || 0).toFixed(2);
                const totalValue = (s.quantity * parseFloat(s.unit_cost || 0)).toFixed(2);
                const date = s.received_at ? new Date(s.received_at).toLocaleDateString() : '';
                const source = s.marketplace || '';

                return `
                    <div class="batch-item">
                        <div class="batch-location">${sanitize(source)}${date ? ' &middot; ' + sanitize(date) : ''}</div>
                        <div class="batch-meta">
                            <span class="batch-qty">${s.quantity} units</span>
                            <span class="batch-price">&euro;${price}/unit</span>
                            <span class="batch-total">&euro;${totalValue} total</span>
                        </div>
                    </div>
                `;
            }).join('');

        } catch (e) {
            batchList.innerHTML = '<div class="batch-error">Failed to load batches</div>';
            console.error('Error loading batches:', e);
        }
    },

    createCard(part) {
        const sku = part.IPN || `PK-${part.pk}`;
        const minStock = part.minimum_stock || 0;
        const inStock = part.in_stock ?? 0;

        // Determine stock status
        let statusClass = 'empty';
        let statusText = 'No Stock';

        if (inStock > 0) {
            if (minStock > 0 && inStock < minStock * 0.5) {
                statusClass = 'critical';
                statusText = 'Critical';
            } else if (minStock > 0 && inStock < minStock) {
                statusClass = 'warning';
                statusText = 'Low Stock';
            } else {
                statusClass = 'healthy';
                statusText = 'In Stock';
            }
        }

        return `
            <div class="part-card" data-part-id="${part.pk}">
                <div class="part-card-main">
                    <div class="part-card-actions">
                        <button class="part-card-action edit" title="Edit Part">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                            </svg>
                        </button>
                        <button class="part-card-action delete" title="Delete Part">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="3 6 5 6 21 6"/>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                            </svg>
                        </button>
                    </div>
                    <div class="part-card-header">
                        <span class="part-sku">${sanitize(sku)}</span>
                        <span class="stock-badge ${statusClass}">${statusText}</span>
                    </div>
                    <div class="part-card-body">
                        <h3 class="part-name">${sanitize(part.name || 'Unnamed Part')}</h3>
                        <p class="part-desc">${sanitize(part.description || 'No description')}</p>
                    </div>
                    <div class="part-card-footer">
                        <div class="part-stock">
                            <span class="stock-qty">${inStock}</span>
                            <span class="stock-label">in stock</span>
                        </div>
                        ${minStock > 0 ? `
                            <div class="part-min">
                                <span class="min-qty">${minStock}</span>
                                <span class="min-label">min</span>
                            </div>
                        ` : ''}
                        <div class="part-expand-toggle">
                            <svg class="expand-chevron" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="6 9 12 15 18 9"/>
                            </svg>
                        </div>
                    </div>
                </div>
                <div class="part-card-batches">
                    <div class="batch-list" data-part-id="${part.pk}">
                        <div class="batch-loading">Loading batches...</div>
                    </div>
                    <button class="btn-add-batch" data-part-id="${part.pk}">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="12" y1="5" x2="12" y2="19"/>
                            <line x1="5" y1="12" x2="19" y2="12"/>
                        </svg>
                        Add Batch
                    </button>
                </div>
            </div>
        `;
    },

    /**
     * Scroll to a specific part in the catalog
     */
    scrollToPart(partPk) {
        const partCard = document.querySelector(`[data-part-id="${partPk}"]`);
        if (partCard) {
            partCard.closest('.part-card').scrollIntoView({
                behavior: 'smooth',
                block: 'center'
            });
            // Optional: highlight the card briefly
            const card = partCard.closest('.part-card');
            card.style.transition = 'background 0.3s';
            card.style.background = 'var(--accent-glow)';
            setTimeout(() => {
                card.style.background = '';
            }, 1000);
        }
    }
};

window.catalog = catalog;
