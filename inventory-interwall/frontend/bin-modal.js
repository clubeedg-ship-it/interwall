/**
 * =============================================================================
 * INTERWALL INVENTORY OS - Bin Modal
 * =============================================================================
 */

// =============================================================================
// Bin Modal
// =============================================================================
const binModal = {
    currentCellId: null,

    init() {
        dom.binModalClose.addEventListener('click', () => this.hide());
        dom.binModal.addEventListener('click', (e) => {
            if (e.target === dom.binModal) this.hide();
        });

        // Print label button
        const printBtn = document.getElementById('btnPrintBinLabel');
        if (printBtn) {
            printBtn.addEventListener('click', () => {
                if (this.currentCellId && typeof labels !== 'undefined') {
                    labels.printLocationLabel(this.currentCellId);
                }
            });
        }
    },

    hide() {
        dom.binModal.classList.remove('active');
        this.currentCellId = null;
    }
};

window.binModal = binModal;
