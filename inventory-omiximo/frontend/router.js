/**
 * =============================================================================
 * OMIXIMO INVENTORY OS - Router with Warp Transitions
 * =============================================================================
 */

// =============================================================================
// Router with Warp Transitions
// =============================================================================
const router = {
    init() {
        dom.navItems.forEach(item => {
            item.addEventListener('click', () => {
                const view = item.dataset.view;
                this.navigate(view);
            });
        });

        // Instant restore on load
        this.restoreSavedView(true);
    },

    navigate(view) {
        // Don't navigate to current view
        if (state.currentView === view) return;

        const currentViewEl = document.querySelector('.view.active');
        const nextViewEl = document.getElementById(`view-${view}`);

        if (currentViewEl && nextViewEl) {
            // Step 1: Warp out current view
            currentViewEl.classList.add('warping-out');

            // Step 2: After warp-out animation, switch views
            setTimeout(() => {
                // Remove active from all views, also remove hidden class
                dom.views.forEach(v => {
                    v.classList.remove('active', 'warping-out', 'hidden');
                });

                // Activate new view (triggers warp-in animation)
                nextViewEl.classList.add('active');

                // Update state and persist
                state.currentView = view;
                localStorage.setItem('omiximo_view', view);

                // Update nav
                dom.navItems.forEach(item => {
                    item.classList.toggle('active', item.dataset.view === view);
                });

                // Update title
                const titles = {
                    wall: 'The Wall',
                    catalog: 'Parts Catalog',
                    profit: 'Profitability',
                    history: 'Batch History'
                };
                dom.viewTitle.textContent = titles[view] || view;

                // Refresh catalog when navigating to it
                if (view === 'catalog' && state.catalog.results.length === 0) {
                    catalog.reload();
                }

                // Render profitability engine when navigating to it
                if (view === 'profit' && typeof profitEngine !== 'undefined') {
                    profitEngine.render();
                }

                // Initialize history view when navigating to it
                if (view === 'history' && typeof history !== 'undefined') {
                    history.init();
                }
            }, 200); // Match warp-out animation duration
        }
    },

    /**
     * Restore saved view from localStorage
     * @param {boolean} instant - If true, switch immediately without animation
     */
    restoreSavedView(instant = false) {
        const savedView = localStorage.getItem('omiximo_view');
        // Default to 'wall' if nothing saved, but don't force it if we are already there
        const targetView = savedView || 'wall';

        console.log(' Checking saved view:', targetView, 'current:', state.currentView, 'instant:', instant);

        if (targetView !== state.currentView) {
            console.log('Restoring view to:', targetView);

            if (instant) {
                // Immediate switch (no animation)
                dom.views.forEach(v => {
                    v.classList.remove('active', 'warping-out', 'hidden');
                    if (v.id === `view-${targetView}`) {
                        v.classList.add('active');
                    } else {
                        v.classList.add('hidden');
                    }
                });

                // Update nav state
                dom.navItems.forEach(item => {
                    item.classList.toggle('active', item.dataset.view === targetView);
                });

                // Update title
                const titles = { wall: 'The Wall', catalog: 'Parts Catalog', profit: 'Profitability', history: 'Batch History' };
                dom.viewTitle.textContent = titles[targetView] || targetView;

                state.currentView = targetView;

            } else {
                // Animated switch
                setTimeout(() => {
                    this.navigate(targetView);
                }, 300);
            }
        }
    }
};

window.router = router;
