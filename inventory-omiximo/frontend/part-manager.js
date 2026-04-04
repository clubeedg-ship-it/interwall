/**
 * =============================================================================
 * OMIXIMO INVENTORY OS - Part Manager (CRUD Modal Handler)
 * Uses /api/products, /api/categories, /api/shelves, /api/stock-lots
 * =============================================================================
 */

const partManager = {
    mode: 'create',
    currentPart: null,

    init() {
        const modal = document.getElementById('partModal');
        const closeBtn = document.getElementById('partModalClose');
        const cancelBtn = document.getElementById('partFormCancel');
        const form = document.getElementById('partForm');

        if (closeBtn) closeBtn.addEventListener('click', () => this.hide());
        if (cancelBtn) cancelBtn.addEventListener('click', () => this.hide());
        if (modal) modal.addEventListener('click', (e) => { if (e.target === modal) this.hide(); });
        if (form) form.addEventListener('submit', (e) => this.submit(e));

        // Delete Modal
        const deleteModal = document.getElementById('deleteModal');
        const deleteCancelBtn = document.getElementById('deleteCancelBtn');
        const deleteConfirmBtn = document.getElementById('deleteConfirmBtn');
        if (deleteCancelBtn) deleteCancelBtn.addEventListener('click', () => this.hideDelete());
        if (deleteConfirmBtn) deleteConfirmBtn.addEventListener('click', () => this.confirmDelete());
        if (deleteModal) deleteModal.addEventListener('click', (e) => { if (e.target === deleteModal) this.hideDelete(); });

        // JIT live calc
        ['partMinStock', 'partDeliveryDays', 'partAvgSoldDay'].forEach(id => {
            const input = document.getElementById(id);
            if (input) input.addEventListener('input', () => this.updateJitDisplay());
        });
    },

    showCreate() {
        this.mode = 'create';
        this.currentPart = null;
        this.resetForm();
        this.populateCategories();
        this.populateLocations();

        document.getElementById('partModalAction').textContent = 'NEW PART';
        document.getElementById('partModalTitle').textContent = 'Add Part';
        document.getElementById('partFormLabel').textContent = 'Create Part';

        const stockSection = document.getElementById('initialStockSection');
        const stockFields = document.getElementById('initialStockFields');
        const fifoHint = document.getElementById('fifoHint');
        if (stockSection) stockSection.style.display = 'flex';
        if (stockFields) stockFields.style.display = 'grid';
        if (fifoHint) fifoHint.style.display = 'block';

        document.getElementById('partModal').classList.add('active');
        document.getElementById('partName').focus();
    },

    showEdit(part) {
        this.mode = 'edit';
        this.currentPart = part;
        this.populateCategories();

        document.getElementById('partModalAction').textContent = 'EDIT';
        document.getElementById('partModalTitle').textContent = 'Edit Part';
        document.getElementById('partFormLabel').textContent = 'Save Changes';

        document.getElementById('partName').value = part.name || '';
        document.getElementById('partIPN').value = part.IPN || part.sku || '';
        const descEl = document.getElementById('partDescription');
        if (descEl) descEl.value = part.description || '';
        const catEl = document.getElementById('partCategory');
        if (catEl) catEl.value = part.category_id || '';
        document.getElementById('partMinStock').value = part.minimum_stock || part.default_reorder_point || 0;

        const jitConfig = this.getJitConfig(part.pk);
        document.getElementById('partDeliveryDays').value = jitConfig.delivery_days || 3;
        document.getElementById('partAvgSoldDay').value = jitConfig.avg_sold_day || 0;
        this.updateJitDisplay();

        const stockSection = document.getElementById('initialStockSection');
        const stockFields = document.getElementById('initialStockFields');
        const fifoHint = document.getElementById('fifoHint');
        if (stockSection) stockSection.style.display = 'none';
        if (stockFields) stockFields.style.display = 'none';
        if (fifoHint) fifoHint.style.display = 'none';

        document.getElementById('partModal').classList.add('active');
        document.getElementById('partName').focus();
    },

    hide() {
        document.getElementById('partModal').classList.remove('active');
        this.currentPart = null;
    },

    resetForm() {
        document.getElementById('partName').value = '';
        document.getElementById('partIPN').value = '';
        const descEl = document.getElementById('partDescription');
        if (descEl) descEl.value = '';
        const catEl = document.getElementById('partCategory');
        if (catEl) catEl.value = '';
        document.getElementById('partMinStock').value = '0';
        document.getElementById('partDeliveryDays').value = '3';
        document.getElementById('partAvgSoldDay').value = '0';
        this.updateJitDisplay();
        const locEl = document.getElementById('partLocation');
        if (locEl) locEl.value = '';
        const qtyEl = document.getElementById('partInitialQty');
        if (qtyEl) qtyEl.value = '1';
        const priceEl = document.getElementById('partPurchasePrice');
        if (priceEl) priceEl.value = '';
    },

    async populateCategories() {
        const select = document.getElementById('partCategory');
        if (!select) return;
        select.innerHTML = '<option value="">No Category</option>';
        try {
            const categories = await api.request('/api/categories');
            categories.forEach(cat => {
                const opt = document.createElement('option');
                opt.value = cat.id;
                opt.textContent = cat.name;
                select.appendChild(opt);
            });
            // Re-select current value if editing
            if (this.currentPart && this.currentPart.category_id) {
                select.value = this.currentPart.category_id;
            }
        } catch (e) {
            console.warn('Failed to load categories:', e.message);
        }
    },

    async populateLocations() {
        const select = document.getElementById('partLocation');
        if (!select) return;
        select.innerHTML = '<option value="">Select shelf/bin...</option>';
        try {
            const shelves = await api.request('/api/shelves');
            shelves.forEach(s => {
                const opt = document.createElement('option');
                opt.value = s.id;
                opt.textContent = s.label || `${s.zone_name}-${s.col}-${s.level}`;
                select.appendChild(opt);
            });
            console.log(`Loaded ${shelves.length} shelves into location dropdown`);
        } catch (e) {
            console.warn('Failed to load shelves:', e.message);
        }
    },

    updateJitDisplay() {
        const minStock = parseFloat(document.getElementById('partMinStock')?.value) || 0;
        const deliveryDays = parseFloat(document.getElementById('partDeliveryDays')?.value) || 0;
        const avgSoldDay = parseFloat(document.getElementById('partAvgSoldDay')?.value) || 0;
        const rop = Math.ceil((deliveryDays * avgSoldDay) + minStock);
        const display = document.getElementById('jitRoPDisplay');
        if (display) {
            display.textContent = rop;
            display.style.background = rop === 0 ? 'var(--text-muted)' : 'var(--accent)';
        }
        return rop;
    },

    getJitConfig(partPk) {
        try {
            const config = JSON.parse(localStorage.getItem('jit_config') || '{}');
            return config[partPk] || { delivery_days: 3, avg_sold_day: 0 };
        } catch { return { delivery_days: 3, avg_sold_day: 0 }; }
    },

    saveJitConfig(partPk, deliveryDays, avgSoldDay) {
        try {
            const config = JSON.parse(localStorage.getItem('jit_config') || '{}');
            config[partPk] = { delivery_days: deliveryDays, avg_sold_day: avgSoldDay };
            localStorage.setItem('jit_config', JSON.stringify(config));
        } catch (e) { console.warn('Failed to save JIT config:', e); }
    },

    async submit(e) {
        e.preventDefault();

        const name = document.getElementById('partName').value.trim();
        const sku = document.getElementById('partIPN').value.trim();
        const description = document.getElementById('partDescription')?.value.trim() || '';
        const categoryId = document.getElementById('partCategory')?.value || null;
        const minStock = parseInt(document.getElementById('partMinStock').value) || 0;

        if (!name) { toast.show('Name is required', 'error'); return; }

        const jitData = {
            delivery_days: parseFloat(document.getElementById('partDeliveryDays')?.value) || 3,
            avg_sold_day: parseFloat(document.getElementById('partAvgSoldDay')?.value) || 0
        };

        try {
            let productId;

            if (this.mode === 'create') {
                if (!sku) { toast.show('EAN/SKU is required', 'error'); return; }

                const result = await api.request('/api/products', {
                    method: 'POST',
                    body: JSON.stringify({
                        ean: sku,
                        name,
                        sku,
                        category_id: categoryId || undefined,
                        description: description || undefined,
                        default_reorder_point: minStock,
                    })
                });
                productId = result.id;

                // Create initial stock lot if qty provided
                const qty = parseInt(document.getElementById('partInitialQty')?.value) || 0;
                const price = parseFloat(document.getElementById('partPurchasePrice')?.value) || 0;
                const shelfId = document.getElementById('partLocation')?.value || null;

                if (qty > 0) {
                    await api.request('/api/stock-lots', {
                        method: 'POST',
                        body: JSON.stringify({
                            ean: result.ean,
                            quantity: qty,
                            unit_cost: price,
                            marketplace: 'manual',
                            shelf_id: shelfId || undefined,
                        })
                    });
                    toast.show(`Created: ${name} with ${qty} units`);
                } else {
                    toast.show(`Created: ${name}`);
                }
            } else {
                // Update existing product
                const ean = this.currentPart.ean;
                await api.request(`/api/products/${encodeURIComponent(ean)}`, {
                    method: 'PATCH',
                    body: JSON.stringify({
                        name,
                        sku: sku || undefined,
                        category_id: categoryId || undefined,
                        description: description || undefined,
                        default_reorder_point: minStock,
                    })
                });
                productId = this.currentPart.pk;
                toast.show(`Updated: ${name}`);
            }

            this.saveJitConfig(productId, jitData.delivery_days, jitData.avg_sold_day);
            this.hide();
            await catalog.reload();

        } catch (e) {
            toast.show(`Error: ${e.message}`, 'error');
        }
    },

    showDelete(part) {
        this.currentPart = part;
        const title = document.getElementById('deleteModalTitle');
        if (title) title.textContent = `Delete "${part.name}"?`;
        document.getElementById('deleteModal').classList.add('active');
    },

    hideDelete() {
        document.getElementById('deleteModal').classList.remove('active');
    },

    async confirmDelete() {
        if (!this.currentPart) return;
        try {
            await api.request(`/api/products/${encodeURIComponent(this.currentPart.ean)}`, { method: 'DELETE' });
            toast.show(`Deleted: ${this.currentPart.name}`, 'success');
            this.hideDelete();
            this.currentPart = null;
            await catalog.reload();
        } catch (e) {
            toast.show(`Delete failed: ${e.message}`, 'error');
        }
    }
};

window.partManager = partManager;
