/**
 * =============================================================================
 * OMIXIMO INVENTORY OS - Auth Module
 * Session cookie auth — login POSTs URLSearchParams to /api/auth/login.
 * No token stored in localStorage; browser session cookie handles auth.
 * =============================================================================
 */

// =============================================================================
// Auth Module
// =============================================================================
const auth = {
    init() {
        const form = document.getElementById('loginForm');
        if (form) {
            form.addEventListener('submit', (e) => this.handleLogin(e));
        }
    },

    /**
     * Legacy compatibility shim — kept so tenant.js does not crash.
     * Returns empty headers; session cookie handles auth automatically.
     * @returns {Object} Empty headers object
     */
    getHeaders() {
        return {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        };
    },

    /**
     * Show the login modal (called by api.request on 401)
     */
    showLoginModal() {
        document.body.classList.add('not-authenticated');
        const modal = document.getElementById('loginModal');
        if (modal) modal.classList.add('active');
        const loginUser = document.getElementById('loginUser');
        if (loginUser) loginUser.focus();
    },

    async handleLogin(e) {
        e.preventDefault();

        const user = document.getElementById('loginUser').value.trim();
        const pass = document.getElementById('loginPass').value;
        const errorEl = document.getElementById('loginError');
        const btnText = document.getElementById('loginBtnText');
        const spinner = document.getElementById('loginSpinner');

        // Show loading
        btnText.textContent = 'Signing in...';
        spinner.classList.remove('hidden');
        errorEl.textContent = '';

        try {
            await this.authenticate(user, pass);
            await this.onAuthSuccess();
        } catch (e) {
            console.error('Login error:', e);
            // Use textContent to avoid XSS from e.message
            const errMsg = document.createElement('span');
            errMsg.textContent = e.message || 'Invalid username or password';
            errorEl.innerHTML = '';
            errorEl.appendChild(errMsg);
            if (window.toast) toast.show(`Login failed: ${e.message}`, 'error');
            btnText.textContent = 'Sign In';
            spinner.classList.add('hidden');
        }
    },

    /**
     * Authenticate via session cookie — POST URLSearchParams to /api/auth/login.
     * NOTE: Do NOT use api.request() here — login must NOT set Content-Type: application/json.
     */
    async authenticate(username, password) {
        const body = new URLSearchParams({ username, password });
        const resp = await fetch('/api/auth/login', {
            method: 'POST',
            body,
            credentials: 'same-origin',
        });
        if (!resp.ok) {
            const data = await resp.json().catch(() => ({}));
            throw new Error(data.detail || 'Invalid username or password');
        }
        return true;
    },

    /**
     * Validate existing session by calling /api/auth/me.
     */
    async validateToken() {
        try {
            const resp = await fetch('/api/auth/me', { credentials: 'same-origin' });
            return resp.ok;
        } catch {
            return false;
        }
    },

    async onAuthSuccess() {
        console.log('Authenticated');

        // Hide login modal
        document.getElementById('loginModal').classList.remove('active');
        document.body.classList.remove('not-authenticated');

        // PHASE 1: Connection check + legacy data loads (fail gracefully)
        console.time('init-phase1');
        await Promise.all([
            checkConnection(),
            loadLocations().catch(e => console.warn('loadLocations skipped:', e.message)),
            wall.loadLiveData().catch(e => console.warn('wall.loadLiveData skipped:', e.message)),
        ]);
        console.timeEnd('init-phase1');

        // PHASE 2: Dependent loads (fail gracefully for legacy InvenTree calls)
        console.time('init-phase2');
        await Promise.all([
            (typeof alerts !== 'undefined' && alerts.checkLowStock) ? alerts.checkLowStock().catch(e => console.warn('alerts skipped:', e.message)) : Promise.resolve(),
            (typeof tenant !== 'undefined') ? tenant.checkSuperAdmin().then(() => tenant.init()).catch(e => console.warn('tenant skipped:', e.message)) : Promise.resolve(),
        ]);
        console.timeEnd('init-phase2');

        // PHASE 3: Profit engine
        console.time('init-phase3');
        if (typeof profitEngine !== 'undefined') {
            await profitEngine.init().catch(e => console.warn('profitEngine init skipped:', e.message));
        }
        console.timeEnd('init-phase3');

        // Lazy load catalog when navigating to it
        const catalogView = document.getElementById('view-catalog');
        if (catalogView && catalogView.classList.contains('active')) {
            catalog.reload(); // Don't await - non-blocking
        }

        // Periodic refresh (fail gracefully)
        setInterval(async () => {
            await checkConnection();
            await wall.loadLiveData().catch(() => {});
            if (typeof alerts !== 'undefined' && alerts.checkLowStock) {
                await alerts.checkLowStock().catch(() => {});
            }
        }, CONFIG.REFRESH_INTERVAL);

        // Hide loading screen
        const loader = document.getElementById('appLoader');
        if (loader) loader.classList.add('hidden');

        toast.show('Welcome back!');
        console.log('Ready');
    },

    async logout() {
        await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
        localStorage.removeItem('inventree_token');  // clean up legacy key if present
        location.reload();
    }
};

window.auth = auth;
