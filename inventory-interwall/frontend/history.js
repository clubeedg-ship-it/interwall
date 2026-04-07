/**
 * =============================================================================
 * INTERWALL INVENTORY OS - History & Archive System
 * =============================================================================
 */

// =============================================================================
// History & Archive System
// =============================================================================
const history = {
    movements: [],
    filters: {},
    loading: false,

    async init() {
        console.log('Initializing History view...');
        await this.loadMovements();
        this.render();
    },

    async loadMovements(filters = {}) {
        this.loading = true;
        this.showLoading();

        try {
            // Use InvenTree's stock tracking API
            // GET /api/stock/track/ returns stock movement history
            const params = new URLSearchParams({
                limit: 100,
                ordering: '-date',  // Most recent first
                ...filters
            });

            const response = await api.request(`/stock/track/?${params}`);
            this.movements = response.results || response || [];

            console.log(`Loaded ${this.movements.length} stock movements`);
        } catch (e) {
            console.error('Failed to load stock movements:', e);
            notifications.show('Failed to load history', 'error');
            this.movements = [];
        } finally {
            this.loading = false;
        }
    },

    showLoading() {
        const timeline = document.getElementById('historyTimeline');
        if (!timeline) return;

        timeline.innerHTML = `
            <div class="history-loading">
                <div class="spinner"></div>
                <p>Loading history...</p>
            </div>
        `;
    },

    render() {
        const timeline = document.getElementById('historyTimeline');
        if (!timeline) return;

        if (this.movements.length === 0) {
            timeline.innerHTML = `
                <div class="history-empty">
                    <div class="history-empty-icon"></div>
                    <div class="history-empty-text">No stock movements found</div>
                    <div class="history-empty-hint">Stock movements will appear here as you add, remove, or transfer inventory</div>
                </div>
            `;
            return;
        }

        timeline.innerHTML = this.movements.map(movement => this.renderMovement(movement)).join('');
    },

    renderMovement(movement) {
        const type = this.getMovementType(movement);
        const icon = this.getIcon(type);
        const date = new Date(movement.date);
        const formattedDate = this.formatDate(date);

        // Get part name from state if available
        const partName = movement.item_detail?.part_detail?.name ||
                        movement.part_detail?.name ||
                        `Part #${movement.item || movement.part}`;

        return `
            <div class="history-item">
                <div class="history-item-icon ${type}">
                    ${icon}
                </div>
                <div class="history-item-content">
                    <div class="history-item-header">
                        <span class="history-item-type ${type}">${this.getTypeLabel(type)}</span>
                        <span class="history-item-timestamp">${formattedDate}</span>
                    </div>
                    <div class="history-item-title">${partName}</div>
                    <div class="history-item-details">
                        ${this.renderDetails(movement, type)}
                    </div>
                    ${movement.notes ? `<div class="history-item-notes">${movement.notes}</div>` : ''}
                </div>
            </div>
        `;
    },

    getMovementType(movement) {
        // InvenTree tracking types: ADD, REMOVE, MOVE, UPDATE, etc.
        const trackingType = movement.tracking_type || '';

        if (trackingType.includes('ADD') || trackingType.includes('RECEIVE')) return 'add';
        if (trackingType.includes('REMOVE') || trackingType.includes('CONSUME')) return 'remove';
        if (trackingType.includes('MOVE') || trackingType.includes('TRANSFER')) return 'move';
        return 'update';
    },

    getIcon(type) {
        const icons = {
            'add': '',
            'remove': '',
            'move': '',
            'update': ''
        };
        return icons[type] || '';
    },

    getTypeLabel(type) {
        const labels = {
            'add': 'Stock Added',
            'remove': 'Stock Removed',
            'move': 'Transferred',
            'update': 'Updated'
        };
        return labels[type] || 'Stock Movement';
    },

    renderDetails(movement, type) {
        let details = [];

        // Quantity
        if (movement.quantity) {
            details.push(`
                <div class="history-detail-item">
                    <span class="history-detail-label">Quantity</span>
                    <span class="history-detail-value mono highlight">${movement.quantity}</span>
                </div>
            `);
        }

        // Location (from/to)
        if (type === 'move') {
            if (movement.location_detail) {
                details.push(`
                    <div class="history-detail-item">
                        <span class="history-detail-label">To Location</span>
                        <span class="history-detail-value">${movement.location_detail.name || 'Unknown'}</span>
                    </div>
                `);
            }
        } else if (movement.location_detail) {
            details.push(`
                <div class="history-detail-item">
                    <span class="history-detail-label">Location</span>
                    <span class="history-detail-value">${movement.location_detail.name || 'Unknown'}</span>
                </div>
            `);
        }

        // User
        if (movement.user_detail) {
            details.push(`
                <div class="history-detail-item">
                    <span class="history-detail-label">User</span>
                    <span class="history-detail-value">${movement.user_detail.username || 'Unknown'}</span>
                </div>
            `);
        }

        // Tracking type
        if (movement.tracking_type) {
            details.push(`
                <div class="history-detail-item">
                    <span class="history-detail-label">Type</span>
                    <span class="history-detail-value">${movement.tracking_type}</span>
                </div>
            `);
        }

        return details.join('');
    },

    formatDate(date) {
        const now = new Date();
        const diff = now - date;
        const seconds = Math.floor(diff / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (days > 7) {
            return date.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        } else if (days > 0) {
            return `${days} day${days > 1 ? 's' : ''} ago`;
        } else if (hours > 0) {
            return `${hours} hour${hours > 1 ? 's' : ''} ago`;
        } else if (minutes > 0) {
            return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
        } else {
            return 'Just now';
        }
    },

    async applyFilters() {
        const type = document.getElementById('historyFilterType')?.value;
        const startDate = document.getElementById('historyStartDate')?.value;
        const endDate = document.getElementById('historyEndDate')?.value;

        this.filters = {};

        if (type) {
            this.filters.tracking_type = type;
        }

        if (startDate) {
            this.filters.min_date = startDate;
        }

        if (endDate) {
            this.filters.max_date = endDate;
        }

        await this.loadMovements(this.filters);
        this.render();
    },

    clearFilters() {
        // Reset filter inputs
        const typeFilter = document.getElementById('historyFilterType');
        const startDate = document.getElementById('historyStartDate');
        const endDate = document.getElementById('historyEndDate');

        if (typeFilter) typeFilter.value = '';
        if (startDate) startDate.value = '';
        if (endDate) endDate.value = '';

        this.filters = {};
        this.loadMovements();
        this.render();
    }
};

window.history = history;
