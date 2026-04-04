/**
 * =============================================================================
 * OMIXIMO INVENTORY OS - EAN Compositions Module
 * =============================================================================
 * Stepped flow: 1) Enter product EAN  2) Add components  3) Save
 * Saved compositions listed below the wizard.
 * =============================================================================
 */

const compositions = {
    currentParentEan: null,
    currentParentName: '',
    currentRows: [],
    _searchTimer: null,

    // ── Step management ──────────────────────────────────────────────────────

    unlockSteps() {
        document.getElementById('comp-step-2').classList.remove('comp-step-locked');
        document.getElementById('comp-step-2').classList.add('comp-step-active');
        document.getElementById('comp-step-3').classList.remove('comp-step-locked');
        document.getElementById('comp-step-1').classList.remove('comp-step-active');
    },

    lockSteps() {
        document.getElementById('comp-step-2').classList.add('comp-step-locked');
        document.getElementById('comp-step-2').classList.remove('comp-step-active');
        document.getElementById('comp-step-3').classList.add('comp-step-locked');
        document.getElementById('comp-step-1').classList.add('comp-step-active');
    },

    showParentCard(ean, name) {
        document.getElementById('comp-parent-ean-display').textContent = ean;
        document.getElementById('comp-parent-name-display').textContent = name || '';
        document.getElementById('comp-parent-card').classList.remove('hidden');
        document.getElementById('comp-parent-input-row').style.display = 'none';
    },

    hideParentCard() {
        document.getElementById('comp-parent-card').classList.add('hidden');
        document.getElementById('comp-parent-input-row').style.display = '';
        const eanInput = document.getElementById('comp-parent-ean');
        eanInput.value = '';
        document.getElementById('comp-parent-name').value = '';
    },

    resetWizard() {
        this.currentParentEan = null;
        this.currentParentName = '';
        this.currentRows = [];
        this.hideParentCard();
        this.lockSteps();
        this.renderRows();
        document.getElementById('comp-parent-ean').focus();
    },

    // ── Confirm parent EAN ───────────────────────────────────────────────────

    async confirmParent() {
        const eanInput = document.getElementById('comp-parent-ean');
        const nameInput = document.getElementById('comp-parent-name');
        const ean = eanInput.value.trim();
        if (!ean) { eanInput.focus(); return; }

        this.currentParentEan = ean;
        this.currentParentName = nameInput.value.trim();

        // Check if product exists, auto-create if not
        try {
            const product = await api.request(`/api/products/${encodeURIComponent(ean)}`);
            if (product && product.name && !this.currentParentName) {
                this.currentParentName = product.name;
            }
        } catch {
            try {
                const newProduct = await api.request('/api/products', {
                    method: 'POST',
                    body: JSON.stringify({
                        ean: ean,
                        name: this.currentParentName || ean,
                        is_composite: true,
                    })
                });
                if (!this.currentParentName && newProduct.name) {
                    this.currentParentName = newProduct.name;
                }
                toast.show(`Created product "${this.currentParentName || ean}"`, 'success');
            } catch (e) {
                toast.show('Failed to create product: ' + e.message, 'error');
                return;
            }
        }

        // Load existing composition if any
        try {
            const rows = await api.request(`/api/compositions/${encodeURIComponent(ean)}`);
            this.currentRows = rows.map(r => ({
                id: r.id, component_ean: r.component_ean,
                component_name: r.component_name, quantity: r.quantity
            }));
        } catch { this.currentRows = []; }

        this.showParentCard(ean, this.currentParentName);
        this.unlockSteps();
        this.renderRows();
    },

    // ── Save ─────────────────────────────────────────────────────────────────

    async save() {
        if (!this.currentParentEan) { toast.show('Enter a product EAN first', 'error'); return; }
        const payload = this.currentRows
            .filter(r => r.component_ean.trim())
            .map(r => ({ component_ean: r.component_ean, quantity: r.quantity }));
        if (payload.length === 0) { toast.show('Add at least one component', 'error'); return; }

        try {
            const result = await api.request(
                `/api/compositions/${encodeURIComponent(this.currentParentEan)}`,
                { method: 'PUT', body: JSON.stringify(payload) }
            );
            toast.show(`Saved ${result.component_count} component(s)`, 'success');
            this.resetWizard();
            this.loadList();
        } catch (e) { toast.show(e.message || 'Save failed', 'error'); }
    },

    // ── Saved compositions list ──────────────────────────────────────────────

    async loadList() {
        const container = document.getElementById('comp-list');
        if (!container) return;

        try {
            const data = await api.request('/api/compositions');
            if (!data || data.length === 0) {
                container.innerHTML = '<p class="comp-list-empty">No compositions saved yet.</p>';
                return;
            }
            container.innerHTML = data.map(comp => `
                <div class="comp-list-card" data-ean="${sanitize(comp.parent_ean)}">
                    <div class="comp-list-card-info">
                        <div>
                            <span class="comp-list-card-ean">${sanitize(comp.parent_ean)}</span>
                            <span class="comp-list-card-name">${sanitize(comp.parent_name)}</span>
                        </div>
                        <div class="comp-list-card-components">
                            ${comp.components.map(c =>
                                `<span class="comp-list-chip">${sanitize(c.component_name || c.component_ean)}<span class="chip-qty"> x${c.quantity}</span></span>`
                            ).join('')}
                        </div>
                    </div>
                    <div class="comp-list-card-actions">
                        <button class="btn-icon comp-list-edit" data-ean="${sanitize(comp.parent_ean)}" title="Edit">&#9998;</button>
                    </div>
                </div>
            `).join('');

            // Click card or edit button to load into wizard
            container.querySelectorAll('.comp-list-card').forEach(card => {
                card.addEventListener('click', () => {
                    const ean = card.dataset.ean;
                    document.getElementById('comp-parent-ean').value = ean;
                    this.confirmParent();
                    // Scroll to top of compositions view
                    document.getElementById('view-compositions').scrollTo({ top: 0, behavior: 'smooth' });
                });
            });
        } catch (e) {
            container.innerHTML = '<p class="comp-list-empty">Failed to load compositions.</p>';
        }
    },

    // ── Add / Remove rows ────────────────────────────────────────────────────

    addRow() {
        this.currentRows.push({ component_ean: '', quantity: 1, component_name: '' });
        this.renderRows();
        const inputs = document.querySelectorAll('#comp-rows .comp-ean-input');
        if (inputs.length > 0) inputs[inputs.length - 1].focus();
    },

    removeRow(index) {
        this.currentRows.splice(index, 1);
        this.renderRows();
    },

    // ── Component search dropdown ────────────────────────────────────────────

    showDropdown(input, products, rowIndex) {
        this.closeAllDropdowns();
        const wrapper = input.closest('.comp-ean-wrapper');
        if (!wrapper) return;

        let dropdown = wrapper.querySelector('.comp-ean-dropdown');
        if (!dropdown) {
            dropdown = document.createElement('ul');
            dropdown.className = 'comp-ean-dropdown comp-dropdown';
            wrapper.appendChild(dropdown);
        }

        if (products.length === 0) {
            dropdown.innerHTML = '<li class="comp-no-results">No products found</li>';
            return;
        }

        dropdown.innerHTML = products.slice(0, 8).map(p =>
            `<li class="comp-result-item" data-ean="${sanitize(p.ean)}" data-name="${sanitize(p.name)}">
                <span class="comp-result-ean">${sanitize(p.ean)}</span>
                <span class="comp-result-name">${sanitize(p.name)}</span>
            </li>`
        ).join('');

        dropdown.querySelectorAll('.comp-result-item').forEach(li => {
            li.addEventListener('mousedown', (e) => {
                e.preventDefault();
                const ean = li.dataset.ean;
                const name = li.dataset.name;
                this.currentRows[rowIndex].component_ean = ean;
                this.currentRows[rowIndex].component_name = name;
                input.value = ean;
                const nameLabel = input.closest('tr').querySelector('.comp-name-label');
                if (nameLabel) nameLabel.textContent = name;
                this.closeAllDropdowns();
            });
        });
    },

    closeAllDropdowns() {
        document.querySelectorAll('.comp-ean-dropdown').forEach(d => d.remove());
    },

    handleEanInput(input, rowIndex, immediate) {
        clearTimeout(this._searchTimer);
        const query = input.value.trim();
        if (!immediate && query.length < 2) { this.closeAllDropdowns(); return; }

        const delay = immediate ? 0 : 250;
        this._searchTimer = setTimeout(async () => {
            try {
                const products = await api.request(`/api/products?q=${encodeURIComponent(query)}`);
                this.showDropdown(input, products, rowIndex);
            } catch { this.closeAllDropdowns(); }
        }, delay);
    },

    // ── Render ───────────────────────────────────────────────────────────────

    renderRows() {
        const container = document.getElementById('comp-rows');
        if (!container) return;
        if (this.currentRows.length === 0) {
            container.innerHTML = '<tr><td colspan="4" class="comp-empty">No components yet. Click "+ Add Component" to start.</td></tr>';
            return;
        }
        container.innerHTML = this.currentRows.map((row, i) => `
            <tr>
                <td>
                    <div class="comp-ean-wrapper">
                        <input class="comp-ean-input input-field input-mono" type="text"
                               value="${sanitize(row.component_ean)}" data-index="${i}"
                               placeholder="Type EAN or name..." autocomplete="off" />
                    </div>
                </td>
                <td><input class="comp-qty-input input-field" type="number" value="${sanitize(String(row.quantity))}" data-index="${i}" min="1" /></td>
                <td><span class="comp-name-label">${sanitize(row.component_name || '')}</span></td>
                <td><button class="btn-icon comp-remove-btn" data-index="${i}" title="Remove">&#x2715;</button></td>
            </tr>
        `).join('');

        container.querySelectorAll('.comp-ean-input').forEach(input => {
            const idx = parseInt(input.dataset.index, 10);
            input.addEventListener('input', () => this.handleEanInput(input, idx));
            input.addEventListener('focus', () => this.handleEanInput(input, idx, true));
            input.addEventListener('blur', () => { setTimeout(() => this.closeAllDropdowns(), 150); });
            input.addEventListener('change', async () => {
                const ean = input.value.trim();
                this.currentRows[idx].component_ean = ean;
                this.currentRows[idx].component_name = '';
                if (ean) {
                    try {
                        const product = await api.request(`/api/products/${encodeURIComponent(ean)}`);
                        if (product && product.name) {
                            this.currentRows[idx].component_name = product.name;
                            const nameLabel = input.closest('tr').querySelector('.comp-name-label');
                            if (nameLabel) nameLabel.textContent = product.name;
                        }
                    } catch { /* not found */ }
                }
            });
        });

        container.querySelectorAll('.comp-qty-input').forEach(input => {
            input.addEventListener('change', (e) => {
                const idx = parseInt(e.target.dataset.index, 10);
                this.currentRows[idx].quantity = Math.max(1, parseInt(e.target.value, 10) || 1);
            });
        });

        container.querySelectorAll('.comp-remove-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.removeRow(parseInt(e.target.dataset.index, 10));
            });
        });
    },

    // ── Init ─────────────────────────────────────────────────────────────────

    init() {
        const confirmBtn = document.getElementById('comp-parent-confirm');
        const eanInput = document.getElementById('comp-parent-ean');

        if (confirmBtn) confirmBtn.addEventListener('click', () => this.confirmParent());
        if (eanInput) eanInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); this.confirmParent(); }
        });

        const addBtn = document.getElementById('comp-add-row-btn');
        if (addBtn) addBtn.addEventListener('click', () => this.addRow());

        const saveBtn = document.getElementById('comp-save-btn');
        if (saveBtn) saveBtn.addEventListener('click', () => this.save());

        const clearBtn = document.getElementById('comp-parent-clear');
        if (clearBtn) clearBtn.addEventListener('click', () => this.resetWizard());

        document.addEventListener('click', (e) => {
            if (!e.target.closest('.comp-ean-wrapper')) this.closeAllDropdowns();
        });

        document.getElementById('comp-step-1').classList.add('comp-step-active');
        this.renderRows();
        this.loadList();
        console.log('compositions module initialised');
    }
};

window.compositions = compositions;
