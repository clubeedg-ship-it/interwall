/**
 * =============================================================================
 * OMIXIMO INVENTORY OS - Settings Panel & Theme
 * =============================================================================
 */

// =============================================================================
// Settings Panel & Theme
// =============================================================================
const settings = {
    panel: null,
    gear: null,
    themeSwitch: null,

    init() {
        this.panel = document.getElementById('settingsPanel');
        this.gear = document.getElementById('settingsGear');
        this.themeSwitch = document.getElementById('themeSwitch');

        if (!this.gear || !this.panel) {
            console.warn('Settings panel elements not found');
            return;
        }

        // Toggle panel on gear click
        this.gear.addEventListener('click', (e) => {
            e.stopPropagation();
            this.togglePanel();
        });

        // Close panel when clicking outside
        document.addEventListener('click', (e) => {
            if (this.panel.classList.contains('active') &&
                !this.panel.contains(e.target) &&
                !this.gear.contains(e.target)) {
                this.closePanel();
            }
        });

        // Theme switch handling
        if (this.themeSwitch) {
            this.themeSwitch.addEventListener('click', () => {
                const current = document.documentElement.dataset.theme || 'dark';
                const newTheme = current === 'dark' ? 'light' : 'dark';
                this.setTheme(newTheme);
            });
        }

        // Initialize theme
        const savedTheme = localStorage.getItem('theme') || 'dark';
        this.setTheme(savedTheme);
    },

    togglePanel() {
        const isActive = this.panel.classList.toggle('active');
        this.gear.classList.toggle('active', isActive);

        if (isActive) {
            this.loadUserInfo();
        }
    },

    closePanel() {
        this.panel.classList.remove('active');
        this.gear.classList.remove('active');
    },

    setTheme(mode) {
        document.documentElement.dataset.theme = mode;
        document.body.dataset.theme = mode;
        localStorage.setItem('theme', mode);

        // Update theme switch buttons
        const options = document.querySelectorAll('.theme-option');
        options.forEach(opt => {
            opt.classList.toggle('active', opt.dataset.theme === mode);
        });
    },

    async loadUserInfo() {
        try {
            const resp = await api.request('/user/me/');
            if (resp) {
                const userName = document.getElementById('userName');
                const userRole = document.getElementById('userRole');
                const userAvatar = document.getElementById('userAvatar');

                if (userName) userName.textContent = resp.username || 'User';
                if (userRole) {
                    if (resp.is_superuser) {
                        userRole.textContent = '⭐ Super Admin';
                    } else if (resp.is_staff) {
                        userRole.textContent = 'Staff';
                    } else {
                        userRole.textContent = 'User';
                    }
                }
                if (userAvatar) {
                    userAvatar.textContent = resp.is_superuser ? '' : '';
                }
            }
        } catch (e) {
            console.warn('Failed to load user info:', e);
        }
    }
};

// Legacy alias for backwards compatibility
const theme = {
    init() {
        settings.init();
    },
    set(mode) {
        settings.setTheme(mode);
    }
};

window.settings = settings;
window.theme = theme;
