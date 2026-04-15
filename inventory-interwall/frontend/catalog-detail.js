/**
 * =============================================================================
 * INTERWALL INVENTORY OS - Category Manager, Batch Detail, Batch Editor
 * =============================================================================
 */

// =============================================================================
// Category Manager (Create categories on demand)
// =============================================================================
const categoryManager = {
    init() {
        const modal = document.getElementById('categoryModal');
        const closeBtn = document.getElementById('categoryModalClose');
        const cancelBtn = document.getElementById('categoryCancel');
        const form = document.getElementById('categoryForm');

        if (closeBtn) closeBtn.addEventListener('click', () => this.hide());
        if (cancelBtn) cancelBtn.addEventListener('click', () => this.hide());
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) this.hide();
            });
        }
        if (form) form.addEventListener('submit', (e) => this.submit(e));
    },

    show() {
        const modal = document.getElementById('categoryModal');
        document.getElementById('categoryName').value = '';
        document.getElementById('categoryDescription').value = '';
        modal.classList.add('active');
        document.getElementById('categoryName').focus();
    },

    hide() {
        document.getElementById('categoryModal').classList.remove('active');
    },

    async submit(e) {
        e.preventDefault();

        const name = document.getElementById('categoryName').value.trim();
        const description = document.getElementById('categoryDescription').value.trim();

        if (!name) {
            toast.show('Please enter a category name', 'error');
            return;
        }

        try {
            await api.request('/api/categories', {
                method: 'POST',
                body: JSON.stringify({ name, description })
            });
            toast.show(`Category "${name}" created!`, 'success');
            this.hide();
            // Refresh part modal's category dropdown
            if (typeof partManager !== 'undefined') partManager.populateCategories();
        } catch (err) {
            console.error('Create category error:', err);
            toast.show('Failed to create category: ' + (err.message || ''), 'error');
        }
    }
};

// =============================================================================
// Batch Detail Modal
// =============================================================================
const batchDetail = {
    currentStock: null,

    async show(stockId) {
        try {
            // Fetch full stock details with nested part and location info
            const stock = await api.request(`/stock/${stockId}/?part_detail=true&location_detail=true`);
            this.currentStock = stock;
            console.log('batchDetail loaded stock:', stock);

            // Get part details
            const part = state.parts.get(stock.part) || await api.request(`/part/${stock.part}/`);

            // Populate modal
            document.getElementById('batchDetailPartName').textContent = part.name || 'Unknown';
            document.getElementById('batchDetailSKU').textContent = part.IPN || `PK-${stock.part}`;
            document.getElementById('batchDetailLocation').textContent =
                stock.location_detail?.name || 'Unknown';
            document.getElementById('batchDetailQty').textContent = stock.quantity;
            document.getElementById('batchDetailAllocated').textContent = stock.allocated || 0;
            document.getElementById('batchDetailUnitCost').textContent =
                `€${parseFloat(stock.purchase_price || 0).toFixed(2)}`;
            document.getElementById('batchDetailTotalValue').textContent =
                `€${(stock.quantity * (stock.purchase_price || 0)).toFixed(2)}`;
            document.getElementById('batchDetailReceived').textContent =
                this.formatDate(stock.stocktake_date);
            document.getElementById('batchDetailBatchCode').textContent =
                stock.batch || 'N/A';

            // Parse supplier URL from notes
            const supplierURL = this.extractSupplierURL(stock.notes);
            const urlContainer = document.getElementById('batchDetailSupplierURL');

            if (supplierURL) {
                urlContainer.replaceChildren();
                const anchor = document.createElement('a');
                anchor.setAttribute('target', '_blank');
                anchor.setAttribute('rel', 'noopener noreferrer');
                anchor.className = 'supplier-link';
                try {
                    const parsed = new URL(supplierURL);
                    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
                        anchor.href = parsed.href;
                    }
                } catch {
                    // Leave href unset if URL is invalid
                }
                const svgNS = 'http://www.w3.org/2000/svg';
                const svg = document.createElementNS(svgNS, 'svg');
                svg.setAttribute('width', '16');
                svg.setAttribute('height', '16');
                svg.setAttribute('viewBox', '0 0 24 24');
                svg.setAttribute('fill', 'none');
                svg.setAttribute('stroke', 'currentColor');
                svg.setAttribute('stroke-width', '2');
                const p1 = document.createElementNS(svgNS, 'path');
                p1.setAttribute('d', 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6');
                const pl = document.createElementNS(svgNS, 'polyline');
                pl.setAttribute('points', '15 3 21 3 21 9');
                const ln = document.createElementNS(svgNS, 'line');
                ln.setAttribute('x1', '10');
                ln.setAttribute('y1', '14');
                ln.setAttribute('x2', '21');
                ln.setAttribute('y2', '3');
                svg.appendChild(p1);
                svg.appendChild(pl);
                svg.appendChild(ln);
                anchor.appendChild(svg);
                const label = document.createElement('span');
                label.className = 'supplier-link-text';
                label.textContent = this.shortenURL(supplierURL);
                anchor.appendChild(label);
                urlContainer.appendChild(anchor);
            } else {
                urlContainer.replaceChildren();
                const empty = document.createElement('span');
                empty.className = 'detail-empty';
                empty.textContent = 'No supplier URL provided';
                urlContainer.appendChild(empty);
            }

            // Show/hide notes section
            const notesSection = document.getElementById('batchDetailNotesSection');
            const notesEl = document.getElementById('batchDetailNotes');

            // Only show notes if they exist and are different from just the URL
            const cleanNotes = stock.notes ? stock.notes.replace(supplierURL || '', '').trim() : '';
            if (cleanNotes) {
                notesSection.style.display = 'block';
                notesEl.textContent = cleanNotes;
            } else {
                notesSection.style.display = 'none';
            }

            // Show modal
            document.getElementById('batchDetailModal').classList.add('active');
        } catch (e) {
            console.error('Failed to load batch details:', e);
            notifications.show('Failed to load batch details', 'error');
        }
    },

    extractSupplierURL(notes) {
        if (!notes) return null;
        // Match http:// or https:// URLs
        const urlMatch = notes.match(/https?:\/\/[^\s]+/);
        return urlMatch ? urlMatch[0] : null;
    },

    shortenURL(url) {
        try {
            const urlObj = new URL(url);
            let shortened = urlObj.hostname;
            if (urlObj.pathname !== '/') {
                const path = urlObj.pathname.slice(0, 30);
                shortened += path + (urlObj.pathname.length > 30 ? '...' : '');
            }
            return shortened;
        } catch {
            return url.slice(0, 40) + (url.length > 40 ? '...' : '');
        }
    },

    formatDate(dateStr) {
        if (!dateStr) return 'N/A';
        try {
            const date = new Date(dateStr);
            return date.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            });
        } catch {
            return dateStr;
        }
    },

    openEdit() {
        console.log('batchDetail.openEdit() called, currentStock:', this.currentStock);
        if (this.currentStock) {
            // Pass the full stock object, not just the ID
            const stockToEdit = this.currentStock;
            this.close();
            batchEditor.show(stockToEdit);
        } else {
            console.error('openEdit: currentStock is null');
            toast.show('Error: No batch selected', 'error');
        }
    },

    viewHistory() {
        this.close();
        router.navigate('history');
        // Could filter history by this stock item in future
    },

    async deleteBatch() {
        if (!this.currentStock) return;

        const confirmed = confirm(
            `Are you sure you want to delete this batch?\n\n` +
            `Part: ${state.parts.get(this.currentStock.part)?.name || 'Unknown'}\n` +
            `Quantity: ${this.currentStock.quantity}\n\n` +
            `This action cannot be undone.`
        );

        if (!confirmed) return;

        try {
            await api.request(`/stock/${this.currentStock.pk}/`, { method: 'DELETE' });
            notifications.show('Batch deleted successfully', 'success');
            this.close();

            // Refresh wall and catalog
            wall.loadLiveData();
            catalog.reload();
        } catch (e) {
            console.error('Failed to delete batch:', e);
            notifications.show('Failed to delete batch', 'error');
        }
    },

    close() {
        document.getElementById('batchDetailModal').classList.remove('active');
        this.currentStock = null;
    }
};

// =============================================================================
// Batch Editor (Edit Stock Item)
// =============================================================================
const batchEditor = {
    currentStock: null,

    init() {
        const modal = document.getElementById('batchEditModal');
        const closeBtn = document.getElementById('batchEditClose');
        const cancelBtn = document.getElementById('batchEditCancel');
        const deleteBtn = document.getElementById('batchEditDelete');
        const form = document.getElementById('batchEditForm');

        if (closeBtn) closeBtn.addEventListener('click', () => this.hide());
        if (cancelBtn) cancelBtn.addEventListener('click', () => this.hide());
        if (deleteBtn) deleteBtn.addEventListener('click', () => this.confirmDelete());
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) this.hide();
            });
        }
        if (form) form.addEventListener('submit', (e) => this.submit(e));
    },

    show(stockItem) {
        console.log('batchEditor.show() called with:', stockItem);

        if (!stockItem) {
            console.error('batchEditor.show() received null/undefined stockItem');
            toast.show('Error: No batch data', 'error');
            return;
        }

        this.currentStock = stockItem;
        const modal = document.getElementById('batchEditModal');

        if (!modal) {
            console.error('batchEditModal element not found in DOM');
            toast.show('Error: Edit modal not found', 'error');
            return;
        }

        try {
            // Populate form with existing values
            const qtyInput = document.getElementById('batchEditQty');
            const priceInput = document.getElementById('batchEditPrice');

            if (qtyInput) {
                qtyInput.value = stockItem.quantity ?? 0;
                console.log('Set quantity to:', stockItem.quantity);
            }
            if (priceInput) {
                priceInput.value = stockItem.purchase_price ?? 0;
                console.log('Set price to:', stockItem.purchase_price);
            }

            // Show current location in readonly info
            // Try multiple sources for location name
            let currentLocName = 'Unknown';
            if (stockItem.location_detail?.name) {
                currentLocName = stockItem.location_detail.name;
            } else if (stockItem.location) {
                // Try to get from state.locations
                for (const [name, loc] of state.locations.entries()) {
                    if (loc.pk === stockItem.location) {
                        currentLocName = name;
                        break;
                    }
                }
            }
            document.getElementById('batchEditLocation').textContent = currentLocName;

            // Show part name - try multiple sources
            let partName = 'Unknown Part';
            if (stockItem.part_detail?.name) {
                partName = stockItem.part_detail.name;
            } else if (stockItem.part && state.parts.has(stockItem.part)) {
                partName = state.parts.get(stockItem.part).name;
            }
            document.getElementById('batchEditPartName').textContent = partName;

            // Populate location dropdown
            const locSelect = document.getElementById('batchEditLocationSelect');
            if (locSelect) {
                locSelect.innerHTML = '<option value="">Keep current location</option>';

                // Add all bin locations (matches patterns like A-1-3-A, B-2-4-B, etc.)
                for (const [name, loc] of state.locations.entries()) {
                    if (name.match(/^[A-Z]-\d+-\d+-[AB]$/) || name.match(/^[A-Z]-\d+-\d+$/)) {
                        const option = new Option(name, loc.pk);
                        // Mark current location
                        if (loc.pk === stockItem.location) {
                            option.text += ' (current)';
                            option.disabled = true;
                        }
                        locSelect.appendChild(option);
                    }
                }
            }

            modal.classList.add('active');
            console.log('batchEditModal opened with values:', {
                qty: qtyInput?.value,
                price: priceInput?.value,
                location: currentLocName,
                part: partName
            });
            qtyInput?.focus();
        } catch (e) {
            console.error('Error in batchEditor.show():', e);
            toast.show('Error opening edit modal', 'error');
        }
    },

    hide() {
        document.getElementById('batchEditModal').classList.remove('active');
        this.currentStock = null;
    },

    /**
     * Show editor by fetching stock data first (for direct edit button)
     */
    async showById(stockId) {
        try {
            const stock = await api.request(`/stock/${stockId}/?part_detail=true&location_detail=true`);
            this.show(stock);
        } catch (e) {
            console.error('Failed to load stock:', e);
            toast.show('Failed to load batch data', 'error');
        }
    },

    async submit(e) {
        e.preventDefault();

        if (!this.currentStock) {
            console.error('submit: currentStock is null');
            toast.show('Error: No batch data', 'error');
            return;
        }

        // Get stock ID - InvenTree uses 'pk' as the primary key
        const stockId = this.currentStock.pk || this.currentStock.id;
        if (!stockId) {
            console.error('submit: No stock ID found', this.currentStock);
            toast.show('Error: Invalid batch data', 'error');
            return;
        }

        const qty = parseFloat(document.getElementById('batchEditQty').value);
        const price = parseFloat(document.getElementById('batchEditPrice').value);
        const newLocationId = document.getElementById('batchEditLocationSelect').value;

        console.log('batchEditor.submit():', { stockId, qty, price, newLocationId });

        // Manual validation (since form has novalidate)
        if (isNaN(qty) || qty < 0) {
            toast.show('Please enter a valid quantity', 'error');
            return;
        }
        if (isNaN(price) || price < 0) {
            toast.show('Please enter a valid price', 'error');
            return;
        }

        try {
            // Check if location changed
            const locationChanged = newLocationId && parseInt(newLocationId) !== this.currentStock.location;

            if (locationChanged) {
                // Backend /api/stock/transfer expects UUIDs for both lot and
                // shelf. The legacy InvenTree state model stored integer pks,
                // so guard the call to keep the flow safe when the editor is
                // still wired against the old shape.
                const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
                if (UUID_RE.test(String(stockId)) && UUID_RE.test(String(newLocationId))) {
                    await api.transferStock(stockId, newLocationId, qty, 'Batch editor location change');
                    toast.show('Batch moved to new location', 'success');
                } else {
                    console.warn('Skipping transferStock: non-UUID ids', { stockId, newLocationId });
                    toast.show('Move skipped: legacy ids — re-open from canonical lot list', 'warn');
                }
            }

            // Update quantity and price
            console.log(`Updating stock ${stockId}: qty=${qty}, price=${price}`);
            await api.request(`/stock/${stockId}/`, {
                method: 'PATCH',
                body: JSON.stringify({
                    quantity: qty,
                    purchase_price: price
                })
            });

            toast.show('Batch updated successfully', 'success');
            this.hide();

            // Refresh the catalog and wall to show updated data
            await catalog.reload();

            if (state.expandedPart) {
                await catalog.loadBatches(state.expandedPart);
            }

            wall.loadLiveData();

        } catch (e) {
            console.error('Batch update error:', e);
            toast.show(`Failed to update batch: ${e.message}`, 'error');
        }
    },

    confirmDelete() {
        if (!this.currentStock) return;

        const part = state.parts.get(this.currentStock.part);
        const confirmed = confirm(
            `Delete this batch?\n\n` +
            `Part: ${part?.name || 'Unknown'}\n` +
            `Qty: ${this.currentStock.quantity}\n` +
            `Price: €${this.currentStock.purchase_price || 0}\n\n` +
            `This cannot be undone.`
        );

        if (confirmed) this.deleteBatch();
    },

    async deleteBatch() {
        if (!this.currentStock) return;

        const stockId = this.currentStock.pk || this.currentStock.id;

        try {
            await api.request(`/stock/${stockId}/`, { method: 'DELETE' });
            toast.show('Batch deleted', 'success');
            this.hide();

            // Refresh the catalog and wall
            await catalog.reload();

            if (state.expandedPart) {
                await catalog.loadBatches(state.expandedPart);
            }

            wall.loadLiveData();

        } catch (e) {
            console.error('Batch delete error:', e);
            toast.show(`Failed to delete batch: ${e.message}`, 'error');
        }
    }
};

window.categoryManager = categoryManager;
window.batchDetail = batchDetail;
window.batchEditor = batchEditor;
