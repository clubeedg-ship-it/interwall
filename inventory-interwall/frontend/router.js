/**
 * =============================================================================
 * INTERWALL INVENTORY OS - Router with Warp Transitions
 * =============================================================================
 */

const router = {
    init() {
        dom.navItems.forEach(item => {
            item.addEventListener('click', () => {
                const view = item.dataset.view;
                this.navigate(view);
            });
        });

        this.restoreSavedView(true);
    },

    navigate(view) {
        if (state.currentView === view) return;

        const currentViewEl = document.querySelector('.view.active');
        const nextViewEl = document.getElementById(`view-${view}`);

        if (currentViewEl && nextViewEl) {
            currentViewEl.classList.add('warping-out');

            setTimeout(() => {
                dom.views.forEach(v => {
                    v.classList.remove('active', 'warping-out', 'hidden');
                });

                nextViewEl.classList.add('active');

                state.currentView = view;
                localStorage.setItem('interwall_view', view);

                dom.navItems.forEach(item => {
                    item.classList.toggle('active', item.dataset.view === view);
                });

                const titles = {
                    wall: 'The Wall',
                    catalog: 'Parts Catalog',
                    profit: 'Profitability',
                    history: 'Batch History',
                    health: 'Health',
                    builds: 'Builds',
                };
                dom.viewTitle.textContent = titles[view] || view;

                if (window.location.hash !== `#${view}`) {
                    window.location.hash = view;
                }

                if (view === 'catalog' && state.catalog.results.length === 0) {
                    catalog.reload();
                }

                if (view === 'profit' && typeof profitEngine !== 'undefined') {
                    profitEngine.render();
                }

                if (view === 'history' && typeof history !== 'undefined') {
                    history.init();
                }

                if (view === 'health' && typeof health !== 'undefined') {
                    health.init();
                }

                if (view === 'builds' && typeof builds !== 'undefined') {
                    builds.render();
                }
            }, 200);
        }
    },

    restoreSavedView(instant = false) {
        const hashView = (window.location.hash || '').replace(/^#/, '').trim();
        const savedView = localStorage.getItem('interwall_view');
        const targetView = hashView || savedView || 'wall';

        console.log(' Checking saved view:', targetView, 'current:', state.currentView, 'instant:', instant);

        if (targetView !== state.currentView) {
            console.log('Restoring view to:', targetView);

            if (instant) {
                dom.views.forEach(v => {
                    v.classList.remove('active', 'warping-out', 'hidden');
                    if (v.id === `view-${targetView}`) {
                        v.classList.add('active');
                    } else {
                        v.classList.add('hidden');
                    }
                });

                dom.navItems.forEach(item => {
                    item.classList.toggle('active', item.dataset.view === targetView);
                });

                const titles = {
                    wall: 'The Wall',
                    catalog: 'Parts Catalog',
                    profit: 'Profitability',
                    history: 'Batch History',
                    health: 'Health',
                    builds: 'Builds',
                };
                dom.viewTitle.textContent = titles[targetView] || targetView;

                state.currentView = targetView;

                if (targetView === 'health' && typeof health !== 'undefined') {
                    health.init();
                }

                if (targetView === 'builds' && typeof builds !== 'undefined') {
                    builds.render();
                }

            } else {
                setTimeout(() => {
                    this.navigate(targetView);
                }, 300);
            }
        }
    }
};

window.router = router;
