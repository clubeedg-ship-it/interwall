/**
 * =============================================================================
 * INTERWALL INVENTORY OS - Health View (T-C10)
 * =============================================================================
 */
const health = {
    initialized: false,
    renderedOnce: false,
    lastRefreshAt: null,
    snapshot: null,
    retryAvailable: false,
    sections: {
        ingestion: { loading: false, error: null, data: [] },
        deadLetter: { loading: false, error: null, data: [] },
        invariants: { loading: false, error: null, data: [] },
        orphans: {
            loading: false,
            error: null,
            data: {
                partsWithoutShelf: [],
                partsWithoutReorder: [],
                buildsWithoutXref: [],
            },
        },
    },
    expectedMarketplaces: [
        { label: 'bol.com', aliases: ['bolcom', 'bol', 'bolcomnl'] },
        { label: 'mediamarkt', aliases: ['mediamarkt', 'mediamarkt'] },
        { label: 'boulanger', aliases: ['boulanger'] },
        { label: 'manual', aliases: ['manual'] },
    ],

    async init() {
        if (!this.initialized) {
            this.bindControls();
            this.initialized = true;
        }
        await this.render();
    },

    async render() {
        if (!this.renderedOnce) {
            this.renderedOnce = true;
            await this.refreshAll();
            return;
        }
        await this.refreshAll();
    },

    bindControls() {
        this.bindClick('healthRefreshAll', () => this.refreshAll());
        this.bindClick('healthRefreshIngestion', () => this.refreshSection('ingestion'));
        this.bindClick('healthRefreshDeadLetter', () => this.refreshSection('deadLetter'));
        this.bindClick('healthRefreshInvariants', () => this.refreshSection('invariants'));
        this.bindClick('healthRefreshOrphans', () => this.refreshSection('orphans'));
    },

    bindClick(id, handler) {
        const el = document.getElementById(id);
        if (!el || el.dataset.bound) return;
        el.addEventListener('click', handler);
        el.dataset.bound = '1';
    },

    async refreshAll() {
        await Promise.all([
            this.refreshSnapshot(),
            this.refreshSection('ingestion'),
            this.refreshSection('deadLetter'),
            this.refreshSection('invariants'),
            this.refreshSection('orphans'),
        ]);
        this.lastRefreshAt = new Date().toISOString();
        this.renderLastRefresh();
    },

    async refreshSnapshot() {
        try {
            this.snapshot = await api.getHealth();
        } catch (e) {
            console.warn('Health snapshot load failed:', e);
            this.snapshot = null;
        }
    },

    async refreshSection(name) {
        const section = this.sections[name];
        if (!section) return;
        section.loading = true;
        section.error = null;
        this.drawSection(name);

        try {
            if (name === 'ingestion') {
                section.data = await api.getHealthIngestionStatus();
            } else if (name === 'deadLetter') {
                section.data = await api.getHealthIngestionDeadLetter();
            } else if (name === 'invariants') {
                section.data = await api.getHealthSalesWithoutLedger();
            } else if (name === 'orphans') {
                const [partsWithoutShelf, partsWithoutReorder, buildsWithoutXref] = await Promise.all([
                    api.getHealthOrphansPartsWithoutShelf(),
                    api.getHealthOrphansPartsWithoutReorder(),
                    api.getHealthOrphansBuildsWithoutXref(),
                ]);
                section.data = { partsWithoutShelf, partsWithoutReorder, buildsWithoutXref };
            }
        } catch (e) {
            section.error = e instanceof Error ? e.message : String(e);
        } finally {
            section.loading = false;
            this.drawSection(name);
        }
    },

    drawSection(name) {
        if (name === 'ingestion') this.renderIngestionSection();
        if (name === 'deadLetter') this.renderDeadLetterSection();
        if (name === 'invariants') this.renderInvariantsSection();
        if (name === 'orphans') this.renderOrphansSection();
    },

    renderLastRefresh() {
        const el = document.getElementById('healthLastRefresh');
        if (!el) return;
        if (!this.lastRefreshAt) {
            el.textContent = 'Not loaded yet';
            el.removeAttribute('title');
            return;
        }
        el.textContent = `Last refresh ${this.relativeTime(this.lastRefreshAt)}`;
        el.title = sanitize(this.lastRefreshAt);
    },

    renderIngestionSection() {
        const body = document.getElementById('healthIngestionBody');
        const badge = document.getElementById('healthIngestionBadge');
        const section = this.sections.ingestion;
        if (!body || !badge) return;
        body.replaceChildren();

        if (section.loading) {
            badge.className = 'stock-badge empty';
            badge.textContent = 'Loading';
            body.appendChild(this.buildNotice('Loading ingestion status...', 'Fetching marketplace status.'));
            return;
        }

        if (section.error) {
            badge.className = 'stock-badge critical';
            badge.textContent = 'Failed';
            body.appendChild(this.buildError(section.error));
            return;
        }

        const rows = Array.isArray(section.data) ? section.data : [];
        const grid = document.createElement('div');
        grid.className = 'health-market-grid';

        let worst = 'healthy';
        this.expectedMarketplaces.forEach((market) => {
            const row = rows.find((item) => this.matchesMarketplace(item?.marketplace, market.aliases));
            const card = this.renderMarketplaceCard(market.label, row);
            worst = this.worstStatus(worst, this.computeMarketplaceStatus(row).className);
            grid.appendChild(card);
        });

        badge.className = `stock-badge ${worst}`;
        badge.textContent = worst === 'healthy' ? 'All clear' : (worst === 'warning' ? 'Attention' : 'Critical');
        body.appendChild(grid);
    },

    renderMarketplaceCard(label, row) {
        const card = document.createElement('article');
        card.className = 'health-market-card';
        card.dataset.healthMarketplace = label;

        const head = document.createElement('div');
        head.className = 'health-market-card-head';
        const title = document.createElement('div');
        title.className = 'health-market-name';
        title.textContent = label;
        const status = this.computeMarketplaceStatus(row);
        const badge = this.buildBadge(status.className, status.label);
        head.appendChild(title);
        head.appendChild(badge);
        card.appendChild(head);

        const metrics = document.createElement('div');
        metrics.className = 'health-metric-block';
        metrics.appendChild(this.metricLine('Last run', this.timestampNode(status.lastRunAt)));
        metrics.appendChild(this.metricLine('Last success', this.timestampNode(row?.last_ok_at)));
        metrics.appendChild(this.metricLine('Last failure', this.timestampNode(row?.last_fail_at, row?.last_fail_at ? null : 'No failure recorded')));
        if (row?.last_7d_counts) {
            const counts = document.createElement('span');
            counts.className = 'health-muted';
            counts.textContent = `7d processed ${Number(row.last_7d_counts.processed) || 0} · failed ${Number(row.last_7d_counts.failed) || 0} · pending ${Number(row.last_7d_counts.pending) || 0}`;
            metrics.appendChild(this.metricLine('Recent volume', counts));
        } else {
            metrics.appendChild(this.metricLine('Recent volume', this.textNode('No ingestion data')));
        }

        card.appendChild(metrics);
        return card;
    },

    renderDeadLetterSection() {
        const body = document.getElementById('healthDeadLetterBody');
        const badge = document.getElementById('healthDeadLetterBadge');
        const section = this.sections.deadLetter;
        if (!body || !badge) return;
        body.replaceChildren();

        if (section.loading) {
            badge.className = 'stock-badge empty';
            badge.textContent = 'Loading';
            body.appendChild(this.buildNotice('Loading dead-letter queue...', 'Fetching dead-letter events.'));
            return;
        }

        if (section.error) {
            badge.className = 'stock-badge critical';
            badge.textContent = 'Failed';
            body.appendChild(this.buildError(section.error));
            return;
        }

        const rows = Array.isArray(section.data) ? section.data : [];
        if (!rows.length) {
            badge.className = 'stock-badge healthy';
            badge.textContent = 'All clear';
            body.appendChild(this.buildNotice('All clear', 'No dead-letter events are waiting for operator action.'));
            return;
        }

        badge.className = 'stock-badge critical';
        badge.textContent = String(rows.length);

        const wrap = document.createElement('div');
        wrap.className = 'health-table-wrap';
        const table = document.createElement('table');
        table.className = 'health-table';
        const thead = document.createElement('thead');
        const headRow = document.createElement('tr');
        ['ID', 'Source', 'Received', 'Error', 'Attempts', 'Action'].forEach((label) => {
            const th = document.createElement('th');
            th.textContent = label;
            headRow.appendChild(th);
        });
        thead.appendChild(headRow);
        table.appendChild(thead);

        const tbody = document.createElement('tbody');
        rows.forEach((row) => {
            const tr = document.createElement('tr');
            tr.appendChild(this.cell(this.shortId(row.id)));
            tr.appendChild(this.cell([row.source, row.marketplace].filter(Boolean).join(' · ') || 'Unknown'));
            tr.appendChild(this.cellNode(this.timestampNode(row.created_at)));
            tr.appendChild(this.cell(this.deadLetterError(row)));
            tr.appendChild(this.cell(String(Number(row.retry_count) || 0)));

            const actionCell = document.createElement('td');
            const retryBtn = document.createElement('button');
            retryBtn.className = 'btn-secondary health-button-disabled';
            retryBtn.textContent = 'Retry';
            retryBtn.disabled = true;
            retryBtn.title = 'Retry wiring pending';
            actionCell.appendChild(retryBtn);
            tr.appendChild(actionCell);
            tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        wrap.appendChild(table);
        body.appendChild(wrap);
    },

    renderInvariantsSection() {
        const body = document.getElementById('healthInvariantsBody');
        const badge = document.getElementById('healthInvariantsBadge');
        const section = this.sections.invariants;
        if (!body || !badge) return;
        body.replaceChildren();

        if (section.loading) {
            badge.className = 'stock-badge empty';
            badge.textContent = 'Loading';
            body.appendChild(this.buildNotice('Loading invariants...', 'Checking money-safety invariants.'));
            return;
        }

        if (section.error) {
            badge.className = 'stock-badge critical';
            badge.textContent = 'Failed';
            body.appendChild(this.buildError(section.error));
            return;
        }

        const rows = Array.isArray(section.data) ? section.data : [];
        const count = this.snapshot?.invariants?.sales_without_ledger ?? rows.length;
        badge.className = `stock-badge ${count > 0 ? 'critical' : 'healthy'}`;
        badge.textContent = count > 0 ? String(count) : 'All clear';

        const grid = document.createElement('div');
        grid.className = 'health-invariant-grid';
        grid.appendChild(this.renderInvariantCard({
            title: 'Sales without ledger row',
            count,
            className: count > 0 ? 'critical' : 'healthy',
            description: 'D-017 detector. This must stay at zero.',
            items: rows.map((row) => ({
                key: row.id,
                title: String(row.id),
                subtitle: [row.product_ean, row.marketplace, row.order_reference].filter(Boolean).join(' · '),
                time: row.created_at,
                action: () => this.openTransactionLink(row.id),
            })),
        }));
        body.appendChild(grid);
    },

    renderInvariantCard(config) {
        const item = document.createElement('details');
        item.className = 'health-list-item';
        item.dataset.healthInvariant = config.title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        if (config.count > 0) item.open = true;

        const summary = document.createElement('summary');
        const main = document.createElement('div');
        main.className = 'health-item-main';
        const titleWrap = document.createElement('div');
        const title = document.createElement('div');
        title.className = 'health-item-name';
        title.textContent = config.title;
        const subtitle = document.createElement('div');
        subtitle.className = 'health-item-detail';
        subtitle.textContent = config.description;
        titleWrap.appendChild(title);
        titleWrap.appendChild(subtitle);
        main.appendChild(titleWrap);
        summary.appendChild(main);

        const meta = document.createElement('div');
        meta.className = 'health-item-meta';
        meta.appendChild(this.buildBadge(config.className, String(config.count), 'count'));
        summary.appendChild(meta);
        item.appendChild(summary);

        const body = document.createElement('div');
        body.className = 'health-list-item-body';
        if (!config.items.length) {
            body.appendChild(this.buildNotice('All clear', 'No offending transactions were found.'));
        } else {
            const list = document.createElement('div');
            list.className = 'health-detail-list';
            config.items.forEach((entry) => list.appendChild(this.renderDetailLinkRow(entry)));
            body.appendChild(list);
        }
        item.appendChild(body);
        return item;
    },

    renderOrphansSection() {
        const body = document.getElementById('healthOrphansBody');
        const badge = document.getElementById('healthOrphansBadge');
        const section = this.sections.orphans;
        if (!body || !badge) return;
        body.replaceChildren();

        if (section.loading) {
            badge.className = 'stock-badge empty';
            badge.textContent = 'Loading';
            body.appendChild(this.buildNotice('Loading orphan checks...', 'Fetching housekeeping signals.'));
            return;
        }

        if (section.error) {
            badge.className = 'stock-badge critical';
            badge.textContent = 'Failed';
            body.appendChild(this.buildError(section.error));
            return;
        }

        const data = section.data || {};
        const cards = [
            {
                title: 'Parts without shelf',
                count: this.snapshot?.orphans?.parts_without_shelf ?? (data.partsWithoutShelf || []).length,
                entries: (data.partsWithoutShelf || []).map((row) => ({
                    key: row.ean || row.product_id,
                    title: row.ean || row.product_id,
                    subtitle: row.name || '',
                    action: () => this.openCatalogFilter(row.ean || row.product_id),
                })),
            },
            {
                title: 'Parts without reorder point',
                count: this.snapshot?.orphans?.parts_without_reorder ?? (data.partsWithoutReorder || []).length,
                entries: (data.partsWithoutReorder || []).map((row) => ({
                    key: row.ean || row.product_id,
                    title: row.ean || row.product_id,
                    subtitle: row.name || '',
                    action: () => this.openCatalogFilter(row.ean || row.product_id),
                })),
            },
            {
                title: 'Builds without marketplace xref',
                count: this.snapshot?.orphans?.builds_without_xref ?? (data.buildsWithoutXref || []).length,
                entries: (data.buildsWithoutXref || []).map((row) => ({
                    key: row.build_code || row.id,
                    title: row.build_code || row.id,
                    subtitle: row.name || '',
                    action: () => this.openBuildComposition(row.build_code || row.id),
                })),
            },
        ];

        const worst = cards.reduce((max, card) => this.worstStatus(max, this.orphanSeverity(card.count)), 'healthy');
        badge.className = `stock-badge ${worst}`;
        badge.textContent = worst === 'healthy' ? 'All clear' : (worst === 'warning' ? 'Attention' : 'Critical');

        const grid = document.createElement('div');
        grid.className = 'health-orphan-grid';
        cards.forEach((card) => grid.appendChild(this.renderOrphanCard(card)));
        body.appendChild(grid);
    },

    renderOrphanCard(card) {
        const item = document.createElement('details');
        item.className = 'health-list-item';
        item.dataset.healthOrphan = card.title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        if (card.count > 0) item.open = true;

        const summary = document.createElement('summary');
        const titleWrap = document.createElement('div');
        const title = document.createElement('div');
        title.className = 'health-item-name';
        title.textContent = card.title;
        titleWrap.appendChild(title);
        summary.appendChild(titleWrap);
        summary.appendChild(this.buildBadge(this.orphanSeverity(card.count), String(card.count), 'count'));
        item.appendChild(summary);

        const body = document.createElement('div');
        body.className = 'health-list-item-body';
        if (!card.entries.length) {
            body.appendChild(this.buildNotice('All clear', 'No orphan records found for this check.'));
        } else {
            const list = document.createElement('div');
            list.className = 'health-detail-list';
            card.entries.forEach((entry) => list.appendChild(this.renderDetailLinkRow(entry)));
            body.appendChild(list);
        }
        item.appendChild(body);
        return item;
    },

    renderDetailLinkRow(entry) {
        const row = document.createElement('div');
        row.className = 'health-list-item';

        const head = document.createElement('div');
        head.className = 'health-list-item-head';

        const info = document.createElement('div');
        const action = document.createElement('a');
        action.href = '#';
        action.className = 'health-mono-link';
        action.textContent = entry.title;
        action.addEventListener('click', (e) => {
            e.preventDefault();
            entry.action();
        });
        info.appendChild(action);

        if (entry.subtitle) {
            const subtitle = document.createElement('div');
            subtitle.className = 'health-item-detail';
            subtitle.textContent = entry.subtitle;
            info.appendChild(subtitle);
        }
        if (entry.time) {
            const time = this.timestampNode(entry.time);
            time.classList.add('health-item-detail');
            info.appendChild(time);
        }
        head.appendChild(info);
        row.appendChild(head);
        return row;
    },

    deadLetterError(row) {
        return row.error_message || row.dead_letter_reason || 'Unknown error';
    },

    shortId(value) {
        const text = value == null ? '' : String(value);
        return text.length > 8 ? text.slice(0, 8) : text;
    },

    computeMarketplaceStatus(row) {
        const lastOk = row?.last_ok_at || null;
        const lastFail = row?.last_fail_at || null;
        const lastRunAt = this.maxTimestamp(lastOk, lastFail);
        if (!lastOk) {
            return { className: 'critical', label: 'No success', lastRunAt };
        }

        const ageHours = this.hoursSince(lastOk);
        const lastRunWasFailure = !!lastFail && lastRunAt === lastFail;
        if (lastRunWasFailure || ageHours >= 24) {
            return { className: 'critical', label: lastRunWasFailure ? 'Failed' : 'Stale', lastRunAt };
        }
        if (ageHours > 1) {
            return { className: 'warning', label: 'Aging', lastRunAt };
        }
        return { className: 'healthy', label: 'Healthy', lastRunAt };
    },

    orphanSeverity(count) {
        if (count <= 0) return 'healthy';
        const limit = Number(THRESHOLDS.HEALTH_ORPHAN_YELLOW_MAX) || 10;
        return count <= limit ? 'warning' : 'critical';
    },

    worstStatus(a, b) {
        const rank = { healthy: 0, warning: 1, critical: 2 };
        return (rank[b] || 0) > (rank[a] || 0) ? b : a;
    },

    matchesMarketplace(value, aliases) {
        const normalized = this.normalizeMarketplace(value);
        return aliases.some((alias) => this.normalizeMarketplace(alias) === normalized);
    },

    normalizeMarketplace(value) {
        return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    },

    maxTimestamp(a, b) {
        if (!a) return b || null;
        if (!b) return a || null;
        return new Date(a) >= new Date(b) ? a : b;
    },

    hoursSince(iso) {
        const ts = new Date(iso).getTime();
        if (!ts) return Number.POSITIVE_INFINITY;
        return (Date.now() - ts) / 36e5;
    },

    relativeTime(iso) {
        if (!iso) return 'Never';
        const date = new Date(iso);
        if (Number.isNaN(date.getTime())) return String(iso);
        const diffMs = date.getTime() - Date.now();
        const absMs = Math.abs(diffMs);
        const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
        const units = [
            ['day', 86400000],
            ['hour', 3600000],
            ['minute', 60000],
            ['second', 1000],
        ];
        for (const [unit, step] of units) {
            if (absMs >= step || unit === 'second') {
                return rtf.format(Math.round(diffMs / step), unit);
            }
        }
        return 'Just now';
    },

    timestampNode(iso, emptyText = 'Never') {
        const span = document.createElement('span');
        span.className = 'health-mono';
        if (!iso) {
            span.textContent = emptyText;
            return span;
        }
        span.textContent = this.relativeTime(iso);
        span.title = sanitize(iso);
        return span;
    },

    metricLine(label, valueNode) {
        const row = document.createElement('div');
        row.className = 'health-metric-line';
        const key = document.createElement('span');
        key.className = 'health-label';
        key.textContent = label;
        row.appendChild(key);
        row.appendChild(valueNode);
        return row;
    },

    buildNotice(title, text) {
        const box = document.createElement('div');
        box.className = 'health-empty';
        box.appendChild(this.buildBadge('healthy', title));
        const msg = document.createElement('span');
        msg.className = 'health-muted';
        msg.textContent = text;
        box.appendChild(msg);
        return box;
    },

    buildError(message) {
        const box = document.createElement('div');
        box.className = 'health-error';
        box.appendChild(this.buildBadge('critical', 'Failed to load'));
        const msg = document.createElement('span');
        msg.textContent = message || 'Unknown error';
        box.appendChild(msg);
        return box;
    },

    buildBadge(className, text, kind = '') {
        const badge = document.createElement('span');
        badge.className = `stock-badge ${className}`;
        if (kind) badge.dataset.healthBadge = kind;
        badge.textContent = text;
        return badge;
    },

    cell(text) {
        const td = document.createElement('td');
        td.textContent = text;
        return td;
    },

    cellNode(node) {
        const td = document.createElement('td');
        td.appendChild(node);
        return td;
    },

    textNode(text) {
        const span = document.createElement('span');
        span.textContent = text;
        return span;
    },

    openCatalogFilter(ean) {
        router.navigate('catalog');
        const search = document.getElementById('catalogSearch');
        if (!search) return;
        search.value = ean;
        search.dispatchEvent(new Event('input', { bubbles: true }));
    },

    openBuildComposition(buildCode) {
        router.navigate('compositions');
        const input = document.getElementById('comp-parent-ean');
        if (!input) return;
        input.value = buildCode;
        if (typeof compositions !== 'undefined' && compositions.confirmParent) {
            compositions.confirmParent();
        }
    },

    openTransactionLink(id) {
        if (typeof window !== 'undefined' && window.open) {
            window.open(`/api/profit/transactions?limit=200&offset=0`, '_blank', 'noopener');
        }
    },
};

window.health = health;
