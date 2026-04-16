/**
 * =============================================================================
 * INTERWALL INVENTORY OS - Builds Page (T-C08)
 * =============================================================================
 */

const builds = (() => {
    let knownMarketplaces = [];

    let allBuilds = [];
    let allModels = [];
    let currentBuild = null;
    let workspaceComponents = [];
    let workspaceXrefs = [];
    let workspaceOpen = false;
    let pricingState = { overhead: '', commission: '', tokens: [], mode: 'guided' };

    function init() {
        document.getElementById('builds-new-btn')?.addEventListener('click', () => openWorkspace(null));
        document.getElementById('builds-search')?.addEventListener('input', renderBuildList);
        document.getElementById('builds-attention-toggle')?.addEventListener('change', renderBuildList);
    }

    async function render() {
        try {
            const [buildsResp, modelsResp, xrefResp] = await Promise.all([
                api.listBuilds(),
                api.listItemGroups({ per_page: 200 }),
                api.listExternalXrefs({ per_page: 200 }),
            ]);
            allBuilds = buildsResp.items || [];
            allModels = modelsResp.items || [];
            const allXrefs = xrefResp.items || [];
            knownMarketplaces = [...new Set(allXrefs.map(x => x.marketplace))].sort();
        } catch (e) {
            console.error('Failed to load builds data:', e);
            allBuilds = [];
            allModels = [];
        }
        renderBuildList();
    }

    function renderBuildList() {
        const container = document.getElementById('builds-list');
        if (!container) return;

        const search = (document.getElementById('builds-search')?.value || '').toLowerCase();
        const attentionOnly = document.getElementById('builds-attention-toggle')?.checked || false;

        let filtered = allBuilds;
        if (search) {
            filtered = filtered.filter(b =>
                (b.build_code || '').toLowerCase().includes(search) ||
                (b.name || '').toLowerCase().includes(search)
            );
        }

        if (filtered.length === 0) {
            container.innerHTML = '<div class="builds-empty">No Builds saved yet.</div>';
            return;
        }

        // We need xref counts per build - fetch inline or use cached
        container.innerHTML = filtered.map(b => {
            const compCount = b.component_count || 0;
            return `
                <div class="builds-card" data-code="${b.build_code}">
                    <div class="builds-card-main">
                        <span class="builds-card-code">${b.build_code}</span>
                        <span class="builds-card-name">${b.name || ''}</span>
                        <span class="builds-card-models">${compCount} Model${compCount !== 1 ? 's' : ''}</span>
                    </div>
                    <div class="builds-card-actions">
                        ${b.is_auto_generated ? '<span class="builds-badge-auto">Auto</span>' : `<button class="btn-secondary btn-sm builds-manage-btn" data-code="${b.build_code}">Manage</button>`}
                    </div>
                </div>`;
        }).join('');

        container.querySelectorAll('.builds-manage-btn').forEach(btn => {
            btn.addEventListener('click', () => openWorkspace(btn.dataset.code));
        });

        // Load xref counts asynchronously to show mapping status
        loadXrefCounts(filtered);
    }

    async function loadXrefCounts(buildsList) {
        for (const b of buildsList) {
            try {
                const resp = await api.listExternalXrefs({ build_code: b.build_code });
                const xrefs = resp.items || [];
                const card = document.querySelector(`.builds-card[data-code="${b.build_code}"]`);
                if (!card) continue;
                const mapped = knownMarketplaces.filter(m => xrefs.some(x => x.marketplace === m));
                const missing = knownMarketplaces.filter(m => !xrefs.some(x => x.marketplace === m));
                const badgesEl = card.querySelector('.builds-card-main');
                if (!badgesEl) continue;
                const existingBadges = badgesEl.querySelector('.builds-mapping-badges');
                if (existingBadges) existingBadges.remove();
                const badges = document.createElement('div');
                badges.className = 'builds-mapping-badges';
                if (missing.length === 0) {
                    badges.innerHTML = '<span class="builds-badge-ok">All clear</span>';
                } else {
                    badges.innerHTML = missing.map(m =>
                        `<span class="builds-badge-missing">${m} Missing</span>`
                    ).join('') + mapped.map(m =>
                        `<span class="builds-badge-mapped">${m} Mapped</span>`
                    ).join('');
                }
                badgesEl.appendChild(badges);
            } catch (_) {}
        }

        // Now apply attention filter if active
        const attentionOnly = document.getElementById('builds-attention-toggle')?.checked || false;
        if (attentionOnly) {
            document.querySelectorAll('.builds-card').forEach(card => {
                const hasMissing = card.querySelector('.builds-badge-missing');
                if (!hasMissing) card.style.display = 'none';
            });
        }
    }

    async function openWorkspace(buildCode) {
        workspaceOpen = true;
        workspaceComponents = [];
        workspaceXrefs = [];
        currentBuild = null;
        pricingState = { overhead: '', commission: '', tokens: [], mode: 'guided' };

        const overlay = document.getElementById('builds-workspace-overlay');
        const ws = document.getElementById('builds-workspace');
        if (!overlay || !ws) return;

        document.getElementById('builds-page-base').classList.add('builds-dimmed');
        overlay.classList.add('active');
        ws.classList.add('active');

        if (buildCode) {
            try {
                const build = await api.getBuild(buildCode);
                currentBuild = build;
                workspaceComponents = (build.components || []).map(c => ({
                    item_group_id: c.item_group_id,
                    item_group_name: c.item_group_name || '',
                    item_group_code: c.item_group_code || '',
                    quantity: c.quantity,
                }));
                const xrefResp = await api.listExternalXrefs({ build_code: buildCode });
                workspaceXrefs = xrefResp.items || [];
            } catch (e) {
                console.error('Failed to load build:', e);
            }
        }

        renderWorkspace();
        renderModelsLibrary();

        // Focus build_code if new
        if (!buildCode) {
            document.getElementById('ws-build-code')?.focus();
        }
    }

    function closeWorkspace() {
        workspaceOpen = false;
        document.getElementById('builds-workspace-overlay')?.classList.remove('active');
        document.getElementById('builds-workspace')?.classList.remove('active');
        document.getElementById('builds-page-base')?.classList.remove('builds-dimmed');
    }

    function renderWorkspace() {
        // Left rail
        renderLeftRail();
        // Center
        renderCenter();
        // Right rail pricing
        renderPricingRail();
        // SKU strip in center
        renderSkuStrip();
    }

    function renderLeftRail() {
        const codeInput = document.getElementById('ws-build-code');
        const noteInput = document.getElementById('ws-build-note');
        if (codeInput) codeInput.value = currentBuild?.build_code || '';
        if (noteInput) noteInput.value = currentBuild?.name || '';

        // Mapping readiness
        const readiness = document.getElementById('ws-mapping-readiness');
        if (readiness) {
            readiness.innerHTML = knownMarketplaces.map(m => {
                const mapped = workspaceXrefs.some(x => x.marketplace === m);
                return `<div class="ws-mapping-chip ${mapped ? 'mapped' : 'missing'}">
                    <span class="ws-mapping-mp">${m}</span>
                    <span class="ws-mapping-status">${mapped ? 'Mapped' : 'Missing'}</span>
                    ${!mapped ? '<span class="ws-mapping-warn">!</span>' : ''}
                </div>`;
            }).join('');
        }

        // Saved builds switcher
        const switcher = document.getElementById('ws-saved-builds');
        if (switcher) {
            switcher.innerHTML = allBuilds.filter(b => !b.is_auto_generated).map(b => {
                const active = currentBuild && currentBuild.build_code === b.build_code;
                return `<div class="ws-saved-item ${active ? 'active' : ''}" data-code="${b.build_code}">
                    <span class="ws-saved-code">${b.build_code}</span>
                    <span class="ws-saved-name">${b.name || ''}</span>
                </div>`;
            }).join('') || '<div class="builds-empty">No saved builds</div>';

            switcher.querySelectorAll('.ws-saved-item').forEach(el => {
                el.addEventListener('click', () => {
                    closeWorkspace();
                    openWorkspace(el.dataset.code);
                });
            });
        }
    }

    function renderCenter() {
        const container = document.getElementById('ws-composition');
        if (!container) return;

        if (workspaceComponents.length === 0) {
            container.innerHTML = `<div class="ws-comp-empty">
                <p>Select a Model from the right rail to start this Build.</p>
            </div>`;
            return;
        }

        container.innerHTML = workspaceComponents.map((c, i) => `
            <div class="ws-comp-line" data-idx="${i}">
                <div class="ws-comp-info">
                    <span class="ws-comp-num">${i + 1}.</span>
                    <div class="ws-comp-detail">
                        <span class="ws-comp-name">${c.item_group_name || c.item_group_code || 'Unknown'}</span>
                        <span class="ws-comp-code">Model: ${c.item_group_code || c.item_group_id}</span>
                    </div>
                </div>
                <div class="ws-comp-controls">
                    <label class="ws-qty-label">Qty</label>
                    <input type="number" class="ws-qty-input" value="${c.quantity}" min="1" data-idx="${i}">
                    <button class="btn-sm btn-danger ws-remove-btn" data-idx="${i}">Remove</button>
                </div>
            </div>
        `).join('');

        container.querySelectorAll('.ws-qty-input').forEach(inp => {
            inp.addEventListener('change', e => {
                const idx = parseInt(e.target.dataset.idx);
                workspaceComponents[idx].quantity = Math.max(1, parseInt(e.target.value) || 1);
            });
        });

        container.querySelectorAll('.ws-remove-btn').forEach(btn => {
            btn.addEventListener('click', e => {
                const idx = parseInt(e.target.dataset.idx);
                workspaceComponents.splice(idx, 1);
                renderCenter();
                renderSkuStrip();
            });
        });
    }

    function renderSkuStrip() {
        const strip = document.getElementById('ws-sku-strip');
        if (!strip) return;
        strip.innerHTML = knownMarketplaces.map(m => {
            const xref = workspaceXrefs.find(x => x.marketplace === m);
            return `<span class="ws-sku-chip ${xref ? 'mapped' : 'missing'}">${m} ${xref ? 'OK' : 'Missing'}</span>`;
        }).join('');
    }

    function renderPricingRail() {
        const overhead = document.getElementById('ws-pricing-overhead');
        const commission = document.getElementById('ws-pricing-commission');
        if (overhead) overhead.value = pricingState.overhead;
        if (commission) commission.value = pricingState.commission;

        overhead?.addEventListener('input', e => { pricingState.overhead = e.target.value; renderPricingPreview(); });
        commission?.addEventListener('input', e => { pricingState.commission = e.target.value; renderPricingPreview(); });

        renderPricingPreview();
    }

    function renderPricingPreview() {
        const preview = document.getElementById('ws-pricing-preview');
        if (!preview) return;
        const oh = pricingState.overhead || '0';
        const comm = pricingState.commission || '0';
        preview.textContent = `((subtotal + ${oh}) * ${comm}%) + VAT`;
    }

    function renderModelsLibrary() {
        const container = document.getElementById('ws-models-list');
        const searchInput = document.getElementById('ws-models-search');
        if (!container) return;

        const doRender = () => {
            const q = (searchInput?.value || '').toLowerCase();
            let models = allModels;
            if (q) {
                models = models.filter(m =>
                    (m.name || '').toLowerCase().includes(q) ||
                    (m.code || '').toLowerCase().includes(q)
                );
            }

            if (models.length === 0) {
                container.innerHTML = '<div class="builds-empty">No Models match this search.</div>';
                return;
            }

            container.innerHTML = models.map(m => `
                <div class="ws-model-card" data-id="${m.id}">
                    <div class="ws-model-info">
                        <span class="ws-model-code">${m.code || ''}</span>
                        <span class="ws-model-name">${m.name}</span>
                    </div>
                    <button class="btn-sm builds-action-btn ws-model-add" data-id="${m.id}" data-code="${m.code || ''}" data-name="${m.name}">Add to Build</button>
                </div>
            `).join('');

            container.querySelectorAll('.ws-model-add').forEach(btn => {
                btn.addEventListener('click', () => addModelToBuild(btn.dataset.id, btn.dataset.code, btn.dataset.name));
            });
        };

        searchInput?.addEventListener('input', doRender);
        doRender();
    }

    function addModelToBuild(id, code, name) {
        const existing = workspaceComponents.find(c => c.item_group_id === id);
        if (existing) {
            existing.quantity += 1;
            renderCenter();
            // Highlight the existing line
            const line = document.querySelector(`.ws-comp-line[data-idx="${workspaceComponents.indexOf(existing)}"]`);
            if (line) {
                line.classList.add('ws-comp-highlight');
                setTimeout(() => line.classList.remove('ws-comp-highlight'), 600);
            }
            return;
        }
        workspaceComponents.push({
            item_group_id: id,
            item_group_name: name,
            item_group_code: code,
            quantity: 1,
        });
        renderCenter();
    }

    // SKU mapping workspace tab
    function renderSkuTab() {
        const container = document.getElementById('ws-sku-detail');
        if (!container) return;

        container.innerHTML = knownMarketplaces.map(m => {
            const xref = workspaceXrefs.find(x => x.marketplace === m);
            return `<div class="ws-sku-row">
                <span class="ws-sku-mp">${m}</span>
                <span class="ws-sku-status ${xref ? 'mapped' : 'missing'}">${xref ? 'Mapped' : 'Missing'}</span>
                <span class="ws-sku-value">${xref ? xref.external_sku : 'No mapping configured'}</span>
                <div class="ws-sku-actions">
                    ${xref
                        ? `<button class="btn-sm btn-danger ws-sku-remove" data-id="${xref.id}">Remove</button>`
                        : `<button class="btn-sm btn-secondary ws-sku-add" data-mp="${m}">Add</button>`
                    }
                </div>
            </div>`;
        }).join('');

        container.querySelectorAll('.ws-sku-remove').forEach(btn => {
            btn.addEventListener('click', async () => {
                try {
                    await api.deleteExternalXref(btn.dataset.id);
                    workspaceXrefs = workspaceXrefs.filter(x => x.id !== btn.dataset.id);
                    renderSkuTab();
                    renderSkuStrip();
                    renderLeftRail();
                } catch (e) {
                    notifications.show('Failed to remove mapping: ' + e.message, 'error');
                }
            });
        });

        container.querySelectorAll('.ws-sku-add').forEach(btn => {
            btn.addEventListener('click', () => {
                const bc = currentBuild?.build_code || document.getElementById('ws-build-code')?.value;
                if (!bc) { notifications.show('Save the Build first before adding mappings.', 'warning'); return; }
                const sku = prompt(`Enter external SKU for ${btn.dataset.mp}:`);
                if (!sku) return;
                addXref(btn.dataset.mp, sku, bc);
            });
        });
    }

    async function addXref(marketplace, externalSku, buildCode) {
        try {
            const result = await api.createExternalXref({ marketplace, external_sku: externalSku, build_code: buildCode });
            workspaceXrefs.push(result);
            renderSkuTab();
            renderSkuStrip();
            renderLeftRail();
        } catch (e) {
            notifications.show('Failed to add mapping: ' + e.message, 'error');
        }
    }

    async function saveBuild() {
        const codeInput = document.getElementById('ws-build-code');
        const noteInput = document.getElementById('ws-build-note');
        const buildCode = codeInput?.value?.trim() || '';
        const name = noteInput?.value?.trim() || '';

        const saveBtn = document.getElementById('ws-save-btn');
        if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving...'; }

        try {
            if (currentBuild) {
                // Update metadata
                if (name !== currentBuild.name) {
                    await api.patchBuild(currentBuild.build_code, { name });
                }
                // Replace components
                await api.replaceComponents(currentBuild.build_code, {
                    components: workspaceComponents.map(c => ({
                        item_group_id: c.item_group_id,
                        quantity: c.quantity,
                    })),
                });
                notifications.show('Build saved.', 'success');
            } else {
                // Create new build
                const result = await api.createBuild({
                    build_code: buildCode || null,
                    name,
                    components: workspaceComponents.map(c => ({
                        item_group_id: c.item_group_id,
                        quantity: c.quantity,
                    })),
                });
                currentBuild = result;
                if (codeInput) codeInput.value = result.build_code;
                notifications.show(`Build ${result.build_code} created.`, 'success');
            }
            await render();
            renderLeftRail();
        } catch (e) {
            // Inline error
            const errEl = document.getElementById('ws-save-error');
            if (errEl) { errEl.textContent = e.message; errEl.style.display = 'block'; }
            else notifications.show('Save failed: ' + e.message, 'error');
        } finally {
            if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save Build'; }
        }
    }

    // Mobile tab switching
    function switchMobileTab(tab) {
        document.querySelectorAll('.ws-mobile-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
        document.querySelectorAll('.ws-panel').forEach(p => p.classList.toggle('active', p.dataset.panel === tab));
    }

    // Expose
    return {
        init,
        render,
        openWorkspace,
        closeWorkspace,
        saveBuild,
        switchMobileTab,
        renderSkuTab,
    };
})();

window.builds = builds;
