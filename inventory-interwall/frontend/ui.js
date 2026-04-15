/**
 * =============================================================================
 * INTERWALL INVENTORY OS - UI: Toast, Notification System, Low Stock Alerts
 * =============================================================================
 */

// =============================================================================
// Toast
// =============================================================================
// =============================================================================
// Notification System (Top-Right Stack)
// =============================================================================
const notifications = {
    queue: [],
    maxVisible: 5,

    show(message, type = 'info', options = {}) {
        const id = `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const notif = {
            id,
            message,
            type,  // 'info', 'success', 'error', 'warning'
            title: options.title || this.getDefaultTitle(type),
            autoDismiss: options.autoDismiss !== false,
            timeout: options.timeout || 5000
        };

        this.queue.push(notif);
        this.render();

        if (notif.autoDismiss) {
            setTimeout(() => this.dismiss(id), notif.timeout);
        }
    },

    getDefaultTitle(type) {
        const titles = {
            'info': 'Info',
            'success': 'Success',
            'error': 'Error',
            'warning': 'Warning'
        };
        return titles[type] || 'Notification';
    },

    getIcon(type) {
        const icons = {
            'info': '',
            'success': '',
            'error': '✕',
            'warning': ''
        };
        return icons[type] || '';
    },

    dismiss(id) {
        const index = this.queue.findIndex(n => n.id === id);
        if (index > -1) {
            this.queue.splice(index, 1);
            this.render();
        }
    },

    render() {
        const container = document.getElementById('notificationContainer');
        if (!container) return;

        // Show only the most recent maxVisible notifications
        const visibleNotifs = this.queue.slice(-this.maxVisible);

        container.innerHTML = visibleNotifs.map(notif => `
            <div class="notification ${notif.type}" data-id="${notif.id}">
                <div class="notification-icon">${this.getIcon(notif.type)}</div>
                <div class="notification-content">
                    <div class="notification-title">${typeof sanitize === 'function' ? sanitize(notif.title) : notif.title}</div>
                    <div class="notification-message">${typeof sanitize === 'function' ? sanitize(notif.message) : notif.message}</div>
                </div>
                <button class="notification-dismiss" onclick="notifications.dismiss('${notif.id}')">×</button>
            </div>
        `).join('');
    }
};

// Legacy toast support (backward compatibility)
const toast = {
    show(message, typeOrIsError = false) {
        // Handle both old boolean API and new string type API
        let type;
        if (typeof typeOrIsError === 'string') {
            // New API: toast.show('message', 'success'/'error'/'info'/'warning')
            type = typeOrIsError;
        } else {
            // Old API: toast.show('message', true/false)
            type = typeOrIsError ? 'error' : 'success';
        }
        notifications.show(message, type);
    }
};

// =============================================================================
// Low Stock Alerts System
// =============================================================================
const alerts = {
    lowStockItems: [],
    alertCount: 0,

    /**
     * Initialize alerts system
     */
    init() {
        // No longer creating sidebar widget - alerts now show in catalog view
    },

    /**
     * Check all parts for low stock
     */
    async checkLowStock() {
        this.lowStockItems = [];

        try {
            // Canonical stock from v_part_stock via getProductsWithStock (D-041)
            const parts = await api.getProductsWithStock();

            parts.forEach(part => {
                const minStock = parseFloat(part.minimum_stock) || 0;
                if (minStock <= 0) return;

                const inStock = parseFloat(part.in_stock) || 0;

                state.parts.set(part.pk, part);

                if (inStock < minStock) {
                    this.lowStockItems.push({
                        pk: part.pk,
                        name: part.name,
                        sku: part.IPN || `PK-${part.pk}`,
                        available: inStock,
                        minimum: minStock,
                        shortage: minStock - inStock
                    });
                }
            });

        } catch (e) {
            console.error('Failed to check low stock:', e);
        }

        this.alertCount = this.lowStockItems.length;
        this.updateCatalogCard();
        this.updateWallCells();

        if (this.alertCount > 0) {
            console.log(`${this.alertCount} parts below minimum stock`);
        }

        return this.lowStockItems;
    },

    /**
     * Update the catalog alert card UI
     */
    updateCatalogCard() {
        const card = document.getElementById('lowStockAlertCard');
        const countBadge = document.getElementById('lowStockCount');
        const listEl = document.getElementById('lowStockCardList');

        if (!card) return;

        if (this.alertCount === 0) {
            card.style.display = 'none';
            return;
        }

        card.style.display = 'block';
        if (countBadge) {
            countBadge.textContent = this.alertCount;
        }

        if (listEl) {
            listEl.innerHTML = this.lowStockItems.map(item => `
                <div class="alert-card-item" onclick="catalog.scrollToPart(${item.pk})">
                    <div class="alert-item-name">${sanitize(item.name)}</div>
                    <div class="alert-item-stock">
                        <span class="stock-current">${item.available}</span>
                        <span class="stock-separator">/</span>
                        <span class="stock-minimum">${item.minimum}</span>
                    </div>
                </div>
            `).join('');
        }
    },

    /**
     * Update Wall cell colors based on stock levels
     */
    updateWallCells() {
        // This would update Wall cells when we have live stock data
        // For now, just log the warning state
        this.lowStockItems.forEach(item => {
            console.log(`Low stock: ${item.name} (${item.available}/${item.minimum})`);
        });
    }
};

/**
 * Toggle low stock dropdown visibility
 */
function toggleLowStockDropdown() {
    const dropdown = document.getElementById('lowStockDropdown');
    const expandBtn = document.getElementById('lowStockExpandBtn');

    if (!dropdown || !expandBtn) return;

    const isVisible = dropdown.style.display === 'block';
    dropdown.style.display = isVisible ? 'none' : 'block';
    expandBtn.classList.toggle('expanded', !isVisible);
}

window.notifications = notifications;
window.toast = toast;
window.alerts = alerts;
window.toggleLowStockDropdown = toggleLowStockDropdown;
