/**
 * =============================================================================
 * OMIXIMO INVENTORY OS - Barcode Scanner Handler (Enhanced)
 * =============================================================================
 */

// =============================================================================
// Barcode Scanner Handler (Enhanced)
// =============================================================================
const scanner = {
    audioCtx: null,
    scanHistory: [],
    MAX_HISTORY: 10,

    init() {
        document.addEventListener('keypress', (e) => this.handleKey(e));
        // Initialize audio context on first user interaction
        document.addEventListener('click', () => this.initAudio(), { once: true });
    },

    initAudio() {
        if (!this.audioCtx) {
            this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
    },

    handleKey(e) {
        // Ignore if focused on input
        if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;

        clearTimeout(state.scanTimer);

        if (e.key === 'Enter') {
            if (state.scanBuffer.length > 2) {
                this.process(state.scanBuffer.trim());
            }
            state.scanBuffer = '';
            this.hideIndicator();
            return;
        }

        state.scanBuffer += e.key;
        this.showIndicator();

        state.scanTimer = setTimeout(() => {
            state.scanBuffer = '';
            this.hideIndicator();
        }, CONFIG.SCAN_TIMEOUT);
    },

    showIndicator() {
        dom.scanStatus.classList.add('active');
        dom.scanText.textContent = 'Scanning...';
    },

    hideIndicator() {
        dom.scanStatus.classList.remove('active');
        dom.scanText.textContent = 'Ready';
    },

    /**
     * Play a short beep sound for scan feedback
     */
    playBeep(success = true) {
        if (!CONFIG.SCAN_AUDIO_ENABLED || !this.audioCtx) return;

        const oscillator = this.audioCtx.createOscillator();
        const gainNode = this.audioCtx.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(this.audioCtx.destination);

        oscillator.frequency.value = success ? 880 : 220; // A5 for success, A3 for error
        oscillator.type = 'sine';

        gainNode.gain.setValueAtTime(0.3, this.audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + 0.1);

        oscillator.start(this.audioCtx.currentTime);
        oscillator.stop(this.audioCtx.currentTime + 0.1);
    },

    /**
     * Flash the scan status indicator
     */
    flashIndicator(success = true) {
        dom.scanStatus.classList.add(success ? 'flash-success' : 'flash-error');
        setTimeout(() => {
            dom.scanStatus.classList.remove('flash-success', 'flash-error');
        }, 300);
    },

    /**
     * Log scan to history
     */
    logScan(code, type, success) {
        const entry = {
            code,
            type,
            success,
            timestamp: new Date().toISOString()
        };

        this.scanHistory.unshift(entry);
        if (this.scanHistory.length > this.MAX_HISTORY) {
            this.scanHistory.pop();
        }

        console.log('Scan history:', this.scanHistory);
    },

    async process(code) {
        console.log('Scanned:', code);

        // Check if location code
        if (this.isLocation(code)) {
            const locId = this.parseLocation(code);
            wall.highlightCell(locId);
            this.playBeep(true);
            this.flashIndicator(true);
            this.logScan(code, 'location', true);
            toast.show(`Location: ${locId}`);
            return;
        }

        // Otherwise treat as part SKU
        await this.handlePart(code);
    },

    isLocation(code) {
        return /^(LOC-)?[AB]-?\d-?\d(-[AB])?$/i.test(code);
    },

    parseLocation(code) {
        let loc = code.replace(/^LOC-/i, '');

        // Normalize A11A -> A-1-1-A
        if (!loc.includes('-')) {
            const m = loc.match(/([AB])(\d)(\d)([AB])?/i);
            if (m) {
                loc = `${m[1].toUpperCase()}-${m[2]}-${m[3]}`;
                if (m[4]) loc += `-${m[4].toUpperCase()}`;
            }
        }
        return loc;
    },

    async handlePart(sku) {
        try {
            const parts = await api.searchPart(sku);

            if (parts.length === 0) {
                this.playBeep(false);
                this.flashIndicator(false);
                this.logScan(sku, 'part', false);
                toast.show(`Part not found: ${sku}`, true);
                return;
            }

            const part = parts[0];
            state.selectedPart = part;
            this.playBeep(true);
            this.flashIndicator(true);
            this.logScan(sku, 'part', true);
            handshake.show(part);
        } catch (e) {
            this.playBeep(false);
            this.flashIndicator(false);
            this.logScan(sku, 'part', false);
            toast.show(`Error: ${e.message}`, true);
        }
    }
};

window.scanner = scanner;
