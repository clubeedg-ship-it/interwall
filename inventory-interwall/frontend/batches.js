/**
 * =============================================================================
 * INTERWALL INVENTORY OS - Batches View (T-C06, D-043)
 *
 * Lists every stock lot (active + optionally depleted) with a ledger-powered
 * history toggle. Reads canonical data from /api/stock-lots and
 * /api/stock-lots/history. No business values in localStorage (D-040).
 * Gradients use THRESHOLDS from config.js (D-045).
 * =============================================================================
 */
const batches = {
    items: [],
    showHistory: false,
    selectedId: null,
    loading: false,

    async init() {
        this.bindControls();
        await this.reload();
    },

    async render() {
        if (!this.items.length && !this.loading) {
            await this.reload();
        } else {
            this.draw();
        }
    },

    bindControls() {
        const toggle = document.getElementById('batchesHistoryToggle');
        if (toggle && !toggle.dataset.bound) {
            toggle.addEventListener('change', async (e) => {
                this.showHistory = !!e.target.checked;
                await this.reload();
            });
            toggle.dataset.bound = '1';
        }
        const panelClose = document.getElementById('batchesPanelClose');
        if (panelClose && !panelClose.dataset.bound) {
            panelClose.addEventListener('click', () => this.closePanel());
            panelClose.dataset.bound = '1';
        }
    },

    async reload() {
        this.loading = true;
        this.drawLoading();
        try {
            const rows = this.showHistory
                ? await api.getBatchHistory({ limit: 200 })
                : await api.getBatches();
            this.items = Array.isArray(rows) ? rows : [];
        } catch (e) {
            console.error('Batches: load failed', e);
            this.items = [];
        } finally {
            this.loading = false;
            this.draw();
        }
    },

    drawLoading() {
        const grid = document.getElementById('batchesGrid');
        if (!grid) return;
        grid.innerHTML = `
            <div class="batches-loading">
                <div class="spinner"></div>
                <p>Loading batches...</p>
            </div>
        `;
    },

    draw() {
        const grid = document.getElementById('batchesGrid');
        if (!grid) return;
        if (!this.items.length) {
            grid.innerHTML = `
                <div class="batches-empty">
                    <div class="batches-empty-text">No batches to display</div>
                </div>
            `;
            return;
        }
        grid.innerHTML = this.items.map(item => this.renderCard(item)).join('');
        grid.querySelectorAll('[data-batch-id]').forEach(card => {
            card.addEventListener('click', () => {
                this.openPanel(card.getAttribute('data-batch-id'));
            });
        });
    },

    renderCard(item) {
        const id = String(item.id);
        const isHistory = this.showHistory;
        const depleted = !!item.depleted;
        const remaining = Number(
            isHistory ? item.remaining_qty : item.quantity
        ) || 0;
        const initial = isHistory ? Number(item.initial_qty) || 0 : null;
        const unitCost = Number(item.unit_cost) || 0;
        const productName = item.product_name || '';
        const ean = item.ean || '';
        const received = this.formatDate(item.received_at);
        const shelf = !isHistory ? this.formatShelf(item) : '';

        const healthClass = depleted
            ? 'batch-card-depleted'
            : this.healthClass(remaining);

        const metaRow = isHistory
            ? `<span class="batch-meta-label">Initial</span>
               <span class="batch-meta-value mono">${sanitize(String(initial))}</span>`
            : `<span class="batch-meta-label">Shelf</span>
               <span class="batch-meta-value">${sanitize(shelf || '—')}</span>`;

        return `
            <div class="batch-card ${healthClass}" data-batch-id="${sanitize(id)}">
                <div class="batch-card-header">
                    <span class="batch-card-name">${sanitize(productName)}</span>
                    ${depleted
                        ? '<span class="batch-card-badge depleted">DEPLETED</span>'
                        : ''}
                </div>
                <div class="batch-card-ean mono">${sanitize(ean)}</div>
                <div class="batch-card-metrics">
                    <div class="batch-metric">
                        <span class="batch-metric-value mono">${sanitize(String(remaining))}</span>
                        <span class="batch-metric-label">remaining</span>
                    </div>
                    <div class="batch-metric">
                        <span class="batch-metric-value mono">€${sanitize(unitCost.toFixed(2))}</span>
                        <span class="batch-metric-label">unit cost</span>
                    </div>
                </div>
                <div class="batch-card-meta">
                    ${metaRow}
                </div>
                <div class="batch-card-footer">
                    <span class="batch-card-received">${sanitize(received)}</span>
                </div>
            </div>
        `;
    },

    /**
     * JIT-health gradient based on remaining qty vs THRESHOLDS (D-045).
     * green (healthy) → yellow (warning) → red (critical).
     */
    healthClass(remaining) {
        const t = window.THRESHOLDS || {};
        if (remaining <= (t.STOCK_CRITICAL ?? 5)) return 'batch-card-critical';
        if (remaining <= (t.STOCK_WARNING ?? 15)) return 'batch-card-warning';
        return 'batch-card-healthy';
    },

    formatShelf(item) {
        if (!item || !item.shelf_label) return '';
        return String(item.shelf_label);
    },

    formatDate(s) {
        if (!s) return '';
        try {
            const d = new Date(s);
            if (isNaN(d.getTime())) return String(s);
            return d.toLocaleString('en-GB', {
                year: 'numeric', month: 'short', day: '2-digit',
                hour: '2-digit', minute: '2-digit',
            });
        } catch (_) { return String(s); }
    },

    async openPanel(batchId) {
        this.selectedId = batchId;
        const panel = document.getElementById('batchesPanel');
        const body = document.getElementById('batchesPanelBody');
        const title = document.getElementById('batchesPanelTitle');
        if (!panel || !body) return;
        panel.classList.add('open');

        let item = this.items.find(b => String(b.id) === String(batchId));
        let movements = item && Array.isArray(item.movements) ? item.movements : null;

        if (!movements) {
            // Active-view card doesn't carry movements; fetch history once.
            try {
                const rows = await api.getBatchHistory({ limit: 200 });
                const match = (Array.isArray(rows) ? rows : [])
                    .find(r => String(r.id) === String(batchId));
                if (match) {
                    movements = match.movements || [];
                    if (!item) item = match;
                }
            } catch (e) {
                console.error('Batches: panel history fetch failed', e);
            }
        }

        if (title && item) {
            title.textContent = `${item.product_name || ''} · ${item.ean || ''}`;
        }

        if (!movements || movements.length === 0) {
            body.innerHTML = `
                <div class="batch-panel-empty">No ledger movements for this batch.</div>
            `;
            return;
        }
        body.innerHTML = movements.map(m => this.renderMovement(m)).join('');
    },

    renderMovement(m) {
        const qty = Number(m.qty_delta) || 0;
        const sign = qty > 0 ? '+' : '';
        const kind = qty > 0 ? 'in' : 'out';
        const ts = this.formatDate(m.ts);
        const unit = Number(m.unit_cost) || 0;
        const tx = m.transaction_id ? String(m.transaction_id) : '';
        return `
            <div class="batch-movement ${kind}">
                <span class="batch-movement-ts">${sanitize(ts)}</span>
                <span class="batch-movement-qty mono">${sanitize(sign + qty)}</span>
                <span class="batch-movement-unit mono">€${sanitize(unit.toFixed(2))}</span>
                <span class="batch-movement-tx mono">${sanitize(tx)}</span>
            </div>
        `;
    },

    closePanel() {
        this.selectedId = null;
        const panel = document.getElementById('batchesPanel');
        if (panel) panel.classList.remove('open');
    },
};

window.batches = batches;
