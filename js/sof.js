// ═══════════════════════════════════════════════════════════════════════════════
// VESSELTRACKER v5.7 – SOF, Handoffs & Owners
// ═══════════════════════════════════════════════════════════════════════════════

// ── Moroccan ports list (used in SOF dropdown) ─────────────────────────────────
const MOROCCAN_PORTS = [
    'AGADIR','CASABLANCA','TANGER MED','TANGER VILLE','NADOR','AL HOCEIMA',
    'MOHAMMEDIA','JORF LASFAR','SAFI','ESSAOUIRA','KENITRA','DAKHLA',
    'DAKHLA ANCH','LAAYOUNE','TAN TAN','CASABLANCA PIER 1','CASABLANCA PIER 2',
    'CASABLANCA PIER 3','CASABLANCA PIER 7','CASABLANCA PIER 13','CASABLANCA PIER 19',
    'CASABLANCA PIER 21','CASABLANCA PIER 33'
];

const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

function getDayName(dateStr) {
    if (!dateStr) return '';
    try { return DAYS[new Date(dateStr).getDay()]; } catch(_) { return ''; }
}

function sofGetPortHours(port) {
    const saved = JSON.parse(localStorage.getItem('sof_port_hours') || '{}');
    return saved[port] || '';
}

function sofSavePortHours(port, hours) {
    const saved = JSON.parse(localStorage.getItem('sof_port_hours') || '{}');
    saved[port] = hours;
    localStorage.setItem('sof_port_hours', JSON.stringify(saved));
}

function sofDraftKey(imo) { return `sof_draft_${imo}`; }

window.sofSaveDraft = async function(imo) {
    const data = sofCollectData(imo);
    const notes = document.getElementById('sof-notes')?.value || '';
    const msg = document.getElementById('sof-save-msg');

    if (window.S.currentUser?.access_token) {
        try {
            if (msg) { msg.style.color = 'var(--text-soft)'; msg.textContent = '💾 Saving...'; }
            const res = await window.fetchWithTimeout(`${window.CONFIG.WORKER_URL}/sof/draft`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${window.S.currentUser.access_token}`,
                },
                body: JSON.stringify({ imo, data, notes }),
            }, 8000);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            if (msg) { msg.style.color = 'var(--success)'; msg.textContent = '✅ Draft saved (shared)'; }
        } catch(e) {
            localStorage.setItem(sofDraftKey(imo), JSON.stringify({ ...data, notes }));
            if (msg) { msg.style.color = 'var(--warning)'; msg.textContent = '⚠️ Saved locally (offline)'; }
        }
    } else {
        localStorage.setItem(sofDraftKey(imo), JSON.stringify({ ...data, notes }));
        if (msg) { msg.style.color = 'var(--success)'; msg.textContent = '✅ Draft saved'; }
    }
    setTimeout(() => { const m = document.getElementById('sof-save-msg'); if (m) m.textContent = ''; }, 2500);
};

window.sofLoadDraft = async function(imo) {
    if (window.S.currentUser?.access_token) {
        try {
            const res = await window.fetchWithTimeout(
                `${window.CONFIG.WORKER_URL}/sof/draft?imo=${imo}`,
                { headers: { 'Authorization': `Bearer ${window.S.currentUser.access_token}` } },
                8000
            );
            if (res.ok) {
                const d = await res.json();
                if (d.draft) return { ...d.draft, notes: d.notes, _source: 'supabase', _updated: d.updated_at };
            }
        } catch(_) {}
    }
    const raw = localStorage.getItem(sofDraftKey(imo));
    return raw ? { ...JSON.parse(raw), _source: 'local' } : null;
};

window.sofClearDraft = async function(imo) {
    if (!confirm('Clear all fields and delete saved draft?')) return;
    if (window.S.currentUser?.access_token) {
        try {
            await window.fetchWithTimeout(
                `${window.CONFIG.WORKER_URL}/sof/draft?imo=${imo}`,
                { method: 'DELETE', headers: { 'Authorization': `Bearer ${window.S.currentUser.access_token}` } },
                8000
            );
        } catch(_) {}
    }
    localStorage.removeItem(sofDraftKey(imo));
    window.closeSOF();
    window.openSOF(imo);
};

window.openSOF = function(imo) {
    const v = window.S.vesselsDataMap.get(imo) || {};
    const cache = window.S.staticCache.get(imo) || {};
    const name = v.name || cache.name || `IMO ${imo}`;
    const port = v.destination_port || v.nearest_port || '';
    const cachedOwner = window._ownersCache?.get(imo);
    const prefillOwners = cachedOwner?.name || '';

    document.getElementById('sofModal')?.remove();
    document.getElementById('sofOverlay')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'sofOverlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9000;background:rgba(0,0,0,.55);';
    overlay.onclick = (e) => { if (e.target === overlay) window.closeSOF(); };

    const modal = document.createElement('div');
    modal.id = 'sofModal';
    modal.style.cssText = `
        position:fixed;top:0;right:0;height:100%;width:min(560px,100vw);
        background:var(--bg-card);border-left:1px solid var(--border);
        z-index:9001;overflow-y:auto;display:flex;flex-direction:column;
        box-shadow:-8px 0 40px rgba(0,0,0,.4);
    `;

    const portHours = sofGetPortHours(port);

    modal.innerHTML = `
        <div style="padding:16px 20px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;background:var(--bg-card);z-index:10;">
            <div>
                <div style="font-weight:700;font-size:.95rem;color:var(--text-main);">${i18n.get('sofTitle')}</div>
                <div style="font-size:.72rem;color:var(--text-soft);">${window.escapeHtml(name)} — IMO ${imo}</div>
            </div>
            <button onclick="closeSOF()" style="background:none;border:none;color:var(--text-soft);font-size:1.2rem;cursor:pointer;padding:4px 8px;">✕</button>
        </div>
        <div style="padding:16px 20px;flex:1;" id="sof-body">

            <!-- SECTION 1: Header Info -->
            <div class="sof-section-title">${i18n.get('sofSectionVesselPort')}</div>

            <div class="sof-row">
                <label class="sof-label">${i18n.get('sofLabel1')}</label>
                <select id="sof-agent" class="sof-input">
                    <option value="CMA CGM">CMA CGM</option>
                    <option value="COMANAV">COMANAV</option>
                </select>
            </div>

            <div class="sof-row">
                <label class="sof-label">${i18n.get('sofOperationType')}</label>
                <div style="display:flex;gap:0;border-radius:8px;overflow:hidden;border:1px solid var(--border);">
                    <button id="sof-op-import" onclick="sofSetOperation('import')"
                        style="flex:1;padding:8px;font-size:.8rem;border:none;cursor:pointer;background:var(--accent);color:#fff;transition:all .2s;">
                        ${i18n.get('sofImportBtn')}
                    </button>
                    <button id="sof-op-export" onclick="sofSetOperation('export')"
                        style="flex:1;padding:8px;font-size:.8rem;border:none;cursor:pointer;background:var(--bg-elevated);color:var(--text-soft);transition:all .2s;">
                        ${i18n.get('sofExportBtn')}
                    </button>
                </div>
            </div>

            <div class="sof-row">
                <label class="sof-label">${i18n.get('sofLabel2')}</label>
                <input id="sof-vessel" class="sof-input" type="text" value="${window.escapeHtml(name)}" placeholder="Vessel name">
            </div>

            <div class="sof-row">
                <label class="sof-label">${i18n.get('sofLabel3')}</label>
                <div style="display:flex;gap:6px;">
                    <select id="sof-port" class="sof-input" style="flex:1;" onchange="sofPortChanged()">
                        <option value="">— Select port —</option>
                        ${MOROCCAN_PORTS.map(p => `<option value="${p}" ${p === port ? 'selected' : ''}>${p}</option>`).join('')}
                    </select>
                    <input id="sof-port-manual" class="sof-input" type="text" placeholder="or type pier/berth" style="flex:1;" value="${window.escapeHtml(port)}">
                </div>
            </div>

            <div class="sof-row">
                <label class="sof-label">${i18n.get('sofLabel4')}</label>
                <input id="sof-owners" class="sof-input" type="text" value="${window.escapeHtml(prefillOwners)}" placeholder="Shipowner name">
            </div>

            <!-- SECTION 2: Dates & Times -->
            <div class="sof-section-title" style="margin-top:16px;">${i18n.get('sofSectionDates')}</div>

            ${sofDateRow('5. Vessel berthed', 'sof-berthed')}
            <div id="sof-op-start-row">${sofDateRow('9. Commenced discharging', 'sof-disch-start')}</div>
            <div id="sof-op-end-row">${sofDateRow('10. Completed discharging', 'sof-disch-end')}</div>
            ${sofDateRow('11. Cargo documents on board', 'sof-cargo-docs')}
            ${sofDateRow('12. Sailing time', 'sof-sailing')}
            ${sofDateRow('15. E.O.S.P', 'sof-eosp')}
            ${sofDateRow('17. NOR tendered', 'sof-nor-tender')}
            ${sofDateRow('18. Vessel dropped anchor', 'sof-anchor-drop')}
            ${sofDateRow('19. Weighed anchor', 'sof-anchor-weigh')}
            ${sofDateRow('20. Pilot on board', 'sof-pilot')}

            <!-- SECTION 3: Cargo -->
            <div class="sof-section-title" style="margin-top:16px;">${i18n.get('sofSectionCargo')}</div>

            <div class="sof-row">
                <label class="sof-label">${i18n.get('sofLabel8')}</label>
                <input id="sof-cargo" class="sof-input" type="text" placeholder="${i18n.get('sofPlaceholderCargo')}">
            </div>
            <div class="sof-row">
                <label class="sof-label">${i18n.get('sofLabel13')}</label>
                <input id="sof-bl-weight" class="sof-input" type="text" placeholder="e.g. 3038.633 MT">
            </div>
            <div class="sof-row">
                <label class="sof-label">${i18n.get('sofLabelBLNum')}</label>
                <input id="sof-bl-number" class="sof-input" type="text" placeholder="${i18n.get('sofPlaceholderBL')}">
            </div>
            <div class="sof-row">
                <label class="sof-label">${i18n.get('sofLabel16')}</label>
                <input id="sof-nor-accepted" class="sof-input" type="text" value="AS PER TERMS AND CONDITIONS OF THE RELEVENT C/P.">
            </div>

            <!-- SECTION 4: Port working hours -->
            <div class="sof-section-title" style="margin-top:16px;">${i18n.get('sofSectionPortHours')}</div>
            <div style="font-size:.72rem;color:var(--text-soft);margin-bottom:8px;">${i18n.get('sofPortHoursHint')}</div>
            <textarea id="sof-port-hours" class="sof-input" rows="3" placeholder="e.g. From Monday to Saturday: 02 Shifts from 0700hrs to 1500hrs & from 1500hrs to 2300hrs. 3rd shift: 2300 to 0700hrs."
                style="resize:vertical;">${window.escapeHtml(portHours)}</textarea>
            <button onclick="sofSavePortHoursBtn()" style="margin-top:4px;padding:4px 12px;font-size:.72rem;background:none;border:1px solid var(--border);border-radius:6px;color:var(--text-soft);cursor:pointer;">${i18n.get('sofSavePortBtn')}</button>

            <!-- SECTION 5: Operations log -->
            <div class="sof-section-title" style="margin-top:16px;">${i18n.get('sofSectionOpsLog')}</div>
            <div style="overflow-x:auto;">
                <table style="width:100%;border-collapse:collapse;font-size:.72rem;" id="sof-ops-table">
                    <thead>
                        <tr style="background:var(--bg-elevated);">
                            <th class="sof-th" style="width:90px;">Date</th>
                            <th class="sof-th" style="width:75px;">Day</th>
                            <th class="sof-th">Work From</th>
                            <th class="sof-th">Work To</th>
                            <th class="sof-th">Stop From</th>
                            <th class="sof-th">Stop To</th>
                            <th class="sof-th" style="width:50px;">Cranes</th>
                            <th class="sof-th" style="width:70px;">Qty</th>
                            <th class="sof-th">Remarks</th>
                            <th class="sof-th" style="width:28px;"></th>
                        </tr>
                    </thead>
                    <tbody id="sof-ops-body"></tbody>
                </table>
            </div>
            <button onclick="sofAddRow()" style="margin-top:8px;width:100%;padding:7px;font-size:.75rem;background:rgba(14,165,233,.1);border:1px dashed var(--accent);border-radius:7px;color:var(--accent);cursor:pointer;">${i18n.get('sofAddRow')}</button>

            <!-- SECTION 6: Remarks -->
            <div class="sof-section-title" style="margin-top:16px;">${i18n.get('sofSectionRemarks')}</div>
            <div class="sof-row">
                <label class="sof-label">${i18n.get('sofLabel21')}</label>
                <textarea id="sof-general-remarks" class="sof-input" rows="3" placeholder="${i18n.get('sofPlaceholderGeneral')}" style="resize:vertical;"></textarea>
            </div>
            <div class="sof-row">
                <label class="sof-label">${i18n.get('sofLabelRemarks')}</label>
                <textarea id="sof-remarks" class="sof-input" rows="2" placeholder="${i18n.get('sofPlaceholderRemarks')}" style="resize:vertical;"></textarea>
            </div>
            <div class="sof-row">
                <label class="sof-label">${i18n.get('sofLabelMaster')}</label>
                <textarea id="sof-master-remarks" class="sof-input" rows="2" placeholder="${i18n.get('sofPlaceholderMaster')}" style="resize:vertical;"></textarea>
            </div>

            <!-- Notes (shared) -->
            <div class="sof-section-title" style="margin-top:16px;">${i18n.get('sofSectionNotes')}</div>
            <div style="font-size:.72rem;color:var(--text-soft);margin-bottom:6px;">${i18n.get('sofNotesHint')}</div>
            <textarea id="sof-notes" class="sof-input" rows="3" placeholder="${i18n.get('sofPlaceholderNotes')}" style="resize:vertical;"></textarea>
            <div id="sof-draft-info" style="font-size:.68rem;color:var(--text-soft);margin-top:4px;"></div>
        </div>

        <!-- Footer actions -->
        <div style="padding:14px 20px;border-top:1px solid var(--border);display:flex;gap:8px;align-items:center;position:sticky;bottom:0;background:var(--bg-card);">
            <span id="sof-save-msg" style="font-size:.72rem;color:var(--success);flex:1;"></span>
            <button onclick="sofShowSendPicker('${imo}')" class="btn-ghost" style="padding:8px 14px;font-size:.78rem;">${i18n.get('sofSendBtn')}</button>
            <button onclick="sofClearDraft('${imo}')" class="btn-ghost" style="padding:8px 14px;font-size:.78rem;color:var(--danger);border-color:rgba(239,68,68,.3);">${i18n.get('sofClearBtn')}</button>
            <button onclick="sofSaveDraft('${imo}')" class="btn-ghost" style="padding:8px 14px;font-size:.78rem;">${i18n.get('sofSaveDraftBtn')}</button>
            <button onclick="sofDownload('${imo}')" class="btn-primary" style="padding:8px 14px;font-size:.78rem;">${i18n.get('sofDownloadBtn')}</button>
        </div>
    `;

    document.body.appendChild(overlay);
    document.body.appendChild(modal);

    sofInjectCSS();
    sofAddRow();

    window.sofLoadDraft(imo).then(draft => {
        if (draft) {
            sofApplyDraft(draft);
            const infoEl = document.getElementById('sof-draft-info');
            if (infoEl) {
                if (draft._source === 'supabase' && draft._updated) {
                    const d = new Date(draft._updated);
                    infoEl.textContent = `${i18n.get('sofDraftShared')} ${d.toLocaleString('en-GB', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' })}`;
                } else if (draft._source === 'local') {
                    infoEl.textContent = i18n.get('sofDraftLocal');
                }
            }
            const notesEl = document.getElementById('sof-notes');
            if (notesEl && draft.notes) notesEl.value = draft.notes;
        }
    });
};

function sofDateRow(label, id) {
    return `
        <div class="sof-row">
            <label class="sof-label">${label}</label>
            <div style="display:flex;gap:6px;align-items:center;">
                <input type="date" id="${id}-date" class="sof-input" style="flex:1;" onchange="document.getElementById('${id}-day') && (document.getElementById('${id}-day').textContent = getDayName(this.value))">
                <input type="time" id="${id}-time" class="sof-input" style="flex:0 0 100px;">
                <span id="${id}-day" style="font-size:.68rem;color:var(--text-soft);min-width:55px;"></span>
            </div>
        </div>`;
}

window.sofAddRow = function(data) {
    const tbody = document.getElementById('sof-ops-body');
    if (!tbody) return;
    const idx = tbody.children.length;
    const d = data || {};
    const tr = document.createElement('tr');
    tr.innerHTML = `
        <td class="sof-td"><input type="date" class="sof-cell" id="sof-r${idx}-date" value="${d.date||''}" onchange="this.closest('tr').querySelector('.sof-day').textContent=getDayName(this.value)"></td>
        <td class="sof-td sof-day" style="font-size:.65rem;color:var(--text-soft);">${d.day||''}</td>
        <td class="sof-td"><input type="time" class="sof-cell" id="sof-r${idx}-wfrom" value="${d.wfrom||''}"></td>
        <td class="sof-td"><input type="time" class="sof-cell" id="sof-r${idx}-wto" value="${d.wto||''}"></td>
        <td class="sof-td"><input type="time" class="sof-cell" id="sof-r${idx}-sfrom" value="${d.sfrom||''}"></td>
        <td class="sof-td"><input type="time" class="sof-cell" id="sof-r${idx}-sto" value="${d.sto||''}"></td>
        <td class="sof-td"><input type="number" class="sof-cell" id="sof-r${idx}-cranes" value="${d.cranes||''}" min="0" max="10" style="width:40px;"></td>
        <td class="sof-td"><input type="text" class="sof-cell" id="sof-r${idx}-qty" value="${d.qty||''}" style="width:60px;"></td>
        <td class="sof-td"><input type="text" class="sof-cell" id="sof-r${idx}-remarks" value="${window.escapeHtml(d.remarks||'')}" placeholder="Remarks..." style="width:100%;min-width:120px;"></td>
        <td class="sof-td"><button onclick="this.closest('tr').remove()" style="background:none;border:none;color:var(--danger);cursor:pointer;font-size:.8rem;padding:2px 4px;">✕</button></td>
    `;
    tbody.appendChild(tr);
};

window.sofSetOperation = function(type) {
    const importBtn = document.getElementById('sof-op-import');
    const exportBtn = document.getElementById('sof-op-export');
    const startRow  = document.getElementById('sof-op-start-row');
    const endRow    = document.getElementById('sof-op-end-row');
    if (!importBtn) return;

    const isExport = type === 'export';
    importBtn.style.background = isExport ? 'var(--bg-elevated)' : 'var(--accent)';
    importBtn.style.color      = isExport ? 'var(--text-soft)' : '#fff';
    exportBtn.style.background = isExport ? 'var(--accent)' : 'var(--bg-elevated)';
    exportBtn.style.color      = isExport ? '#fff' : 'var(--text-soft)';

    const verb = isExport ? 'loading' : 'discharging';
    if (startRow) startRow.innerHTML = sofDateRow(`9. Commenced ${verb}`, 'sof-disch-start');
    if (endRow)   endRow.innerHTML   = sofDateRow(`10. Completed ${verb}`, 'sof-disch-end');

    importBtn.dataset.selected = isExport ? '0' : '1';
};

function sofGetOperation() {
    const btn = document.getElementById('sof-op-import');
    return btn && btn.dataset.selected === '0' ? 'export' : 'import';
}

window.sofPortChanged = function() {
    const port = document.getElementById('sof-port')?.value;
    if (!port) return;
    document.getElementById('sof-port-manual').value = port;
    const hours = sofGetPortHours(port);
    if (hours) document.getElementById('sof-port-hours').value = hours;
};

window.sofSavePortHoursBtn = function() {
    const port = document.getElementById('sof-port-manual')?.value.trim() ||
                 document.getElementById('sof-port')?.value;
    const hours = document.getElementById('sof-port-hours')?.value.trim();
    if (!port) return;
    sofSavePortHours(port, hours);
    const msg = document.getElementById('sof-save-msg');
    if (msg) { msg.textContent = `✅ Hours saved for ${port}`; setTimeout(() => { msg.textContent = ''; }, 2500); }
};

function sofCollectData(imo) {
    const fv = (id) => document.getElementById(id)?.value || '';
    const rows = [];
    const tbody = document.getElementById('sof-ops-body');
    if (tbody) {
        Array.from(tbody.children).forEach((tr, i) => {
            rows.push({
                date:    tr.querySelector(`#sof-r${i}-date`)?.value || '',
                day:     tr.querySelector('.sof-day')?.textContent || '',
                wfrom:   tr.querySelector(`#sof-r${i}-wfrom`)?.value || '',
                wto:     tr.querySelector(`#sof-r${i}-wto`)?.value || '',
                sfrom:   tr.querySelector(`#sof-r${i}-sfrom`)?.value || '',
                sto:     tr.querySelector(`#sof-r${i}-sto`)?.value || '',
                cranes:  tr.querySelector(`#sof-r${i}-cranes`)?.value || '',
                qty:     tr.querySelector(`#sof-r${i}-qty`)?.value || '',
                remarks: tr.querySelector(`#sof-r${i}-remarks`)?.value || '',
            });
        });
    }
    return {
        imo,
        agent:           fv('sof-agent'),
        operation_type:  sofGetOperation(),
        vessel:          fv('sof-vessel'),
        port:            fv('sof-port-manual') || fv('sof-port'),
        owners:          fv('sof-owners'),
        berthed_date:    fv('sof-berthed-date'),    berthed_time:     fv('sof-berthed-time'),
        disch_start_date:fv('sof-disch-start-date'),disch_start_time: fv('sof-disch-start-time'),
        disch_end_date:  fv('sof-disch-end-date'),  disch_end_time:   fv('sof-disch-end-time'),
        cargo_docs_date: fv('sof-cargo-docs-date'), cargo_docs_time:  fv('sof-cargo-docs-time'),
        sailing_date:    fv('sof-sailing-date'),    sailing_time:     fv('sof-sailing-time'),
        eosp_date:       fv('sof-eosp-date'),       eosp_time:        fv('sof-eosp-time'),
        nor_tender_date: fv('sof-nor-tender-date'), nor_tender_time:  fv('sof-nor-tender-time'),
        anchor_drop_date:fv('sof-anchor-drop-date'),anchor_drop_time: fv('sof-anchor-drop-time'),
        anchor_weigh_date:fv('sof-anchor-weigh-date'),anchor_weigh_time:fv('sof-anchor-weigh-time'),
        pilot_date:      fv('sof-pilot-date'),      pilot_time:       fv('sof-pilot-time'),
        cargo:           fv('sof-cargo'),
        bl_weight:       fv('sof-bl-weight'),
        bl_number:       fv('sof-bl-number'),
        nor_accepted:    fv('sof-nor-accepted'),
        port_hours:      fv('sof-port-hours'),
        general_remarks: fv('sof-general-remarks'),
        remarks:         fv('sof-remarks'),
        master_remarks:  fv('sof-master-remarks'),
        rows,
    };
}

function sofApplyDraft(d) {
    const sv = (id, val) => { const el = document.getElementById(id); if (el && val) el.value = val; };
    sv('sof-agent', d.agent); sv('sof-vessel', d.vessel);
    sv('sof-port', d.port); sv('sof-port-manual', d.port);
    sv('sof-owners', d.owners);
    sv('sof-berthed-date', d.berthed_date);       sv('sof-berthed-time', d.berthed_time);
    sv('sof-disch-start-date', d.disch_start_date); sv('sof-disch-start-time', d.disch_start_time);
    sv('sof-disch-end-date', d.disch_end_date);   sv('sof-disch-end-time', d.disch_end_time);
    sv('sof-cargo-docs-date', d.cargo_docs_date); sv('sof-cargo-docs-time', d.cargo_docs_time);
    sv('sof-sailing-date', d.sailing_date);       sv('sof-sailing-time', d.sailing_time);
    sv('sof-eosp-date', d.eosp_date);             sv('sof-eosp-time', d.eosp_time);
    sv('sof-nor-tender-date', d.nor_tender_date); sv('sof-nor-tender-time', d.nor_tender_time);
    sv('sof-anchor-drop-date', d.anchor_drop_date); sv('sof-anchor-drop-time', d.anchor_drop_time);
    sv('sof-anchor-weigh-date', d.anchor_weigh_date); sv('sof-anchor-weigh-time', d.anchor_weigh_time);
    sv('sof-pilot-date', d.pilot_date);           sv('sof-pilot-time', d.pilot_time);
    sv('sof-cargo', d.cargo); sv('sof-bl-weight', d.bl_weight); sv('sof-bl-number', d.bl_number);
    sv('sof-nor-accepted', d.nor_accepted);
    sv('sof-port-hours', d.port_hours);
    sv('sof-general-remarks', d.general_remarks);
    sv('sof-remarks', d.remarks);
    sv('sof-master-remarks', d.master_remarks);
    const tbody = document.getElementById('sof-ops-body');
    if (tbody && d.rows?.length) {
        tbody.innerHTML = '';
        d.rows.forEach(row => window.sofAddRow(row));
    }
}

window.sofDownload = async function(imo) {
    const data = sofCollectData(imo);
    if (data.port && data.port_hours) sofSavePortHours(data.port, data.port_hours);

    const btn = document.querySelector('#sofModal button[onclick*="sofDownload"]');
    const msg = document.getElementById('sof-save-msg');

    if (btn) { btn.disabled = true; btn.textContent = i18n.get('sofGenerating'); }
    if (msg) { msg.style.color = 'var(--text-soft)'; msg.textContent = i18n.get('sofGenerating'); }

    let dots = 0;
    const animInterval = setInterval(() => {
        dots = (dots + 1) % 4;
        const dotStr = '.'.repeat(dots);
        if (msg && msg.textContent.includes('Generating')) {
            msg.textContent = i18n.get('sofGenerating').replace('...','') + dotStr;
        }
    }, 500);

    try {
        const res = await window.fetchWithTimeout(
            `${window.CONFIG.WORKER_URL}/sof/generate`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(window.S.currentUser?.access_token ? { 'Authorization': `Bearer ${window.S.currentUser.access_token}` } : {}),
                },
                body: JSON.stringify(data),
            },
            120000
        );

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.detail || `Server error ${res.status}`);
        }

        const blob = await res.blob();
        const vessel = (data.vessel || 'VESSEL').replace(/\s+/g,'_');
        const port   = (data.port   || 'PORT').replace(/\s+/g,'_');
        const date   = new Date().toISOString().slice(0,10).replace(/-/g,'');
        const filename = `SOF_${vessel}_${port}_${date}.xlsx`;

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = filename;
        document.body.appendChild(a); a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        setTimeout(() => window.sofShowOwnerPopup(imo, data.vessel, data.owners), 800);

    } catch(e) {
        clearInterval(animInterval);
        if (msg) { msg.style.color = 'var(--danger)'; msg.textContent = `❌ ${e.message}`; }
        console.error('SOF download error:', e);
    }

    clearInterval(animInterval);
    if (btn) { btn.disabled = false; btn.textContent = i18n.get('sofDownloadBtn'); }
    if (msg) setTimeout(() => { if (msg) msg.textContent = ''; }, 4000);
};

window.closeSOF = function() {
    document.getElementById('sofModal')?.remove();
    document.getElementById('sofOverlay')?.remove();
};

function sofInjectCSS() {
    if (document.getElementById('sof-styles')) return;
    const style = document.createElement('style');
    style.id = 'sof-styles';
    style.textContent = `
        .sof-section-title{font-weight:600;font-size:.82rem;color:var(--accent);margin-bottom:8px;padding-bottom:4px;border-bottom:1px solid var(--border);}
        .sof-row{display:flex;flex-direction:column;gap:3px;margin-bottom:10px;}
        .sof-label{font-size:.72rem;color:var(--text-soft);}
        .sof-input{background:var(--bg-elevated);border:1px solid var(--border);border-radius:7px;padding:7px 10px;color:var(--text-main);font-size:.8rem;outline:none;width:100%;box-sizing:border-box;}
        .sof-input:focus{border-color:var(--accent);}
        .sof-th{padding:5px 6px;text-align:left;border:1px solid var(--border);font-weight:600;color:var(--text-soft);font-size:.65rem;white-space:nowrap;}
        .sof-td{padding:2px 3px;border:1px solid var(--border);vertical-align:middle;}
        .sof-cell{background:var(--bg-elevated);border:none;color:var(--text-main);font-size:.7rem;padding:3px 4px;width:100%;outline:none;border-radius:3px;}
        .sof-cell:focus{background:var(--bg-card);border:1px solid var(--accent);}
    `;
    document.head.appendChild(style);
}

// ═══════════════════════════════════════════════════════════════════════════════
// HANDOFF SYSTEM
// ═══════════════════════════════════════════════════════════════════════════════

let _handoffPollInterval = null;

window.startHandoffPolling = function() {
    window.stopHandoffPolling();
    window.checkAndShowHandoffs(false);
    _handoffPollInterval = setInterval(() => window.checkAndShowHandoffs(false), 60000);
};

window.stopHandoffPolling = function() {
    if (_handoffPollInterval) { clearInterval(_handoffPollInterval); _handoffPollInterval = null; }
};

window.checkAndShowHandoffs = async function(forceShowPopup) {
    if (!window.S.currentUser?.access_token) return;
    try {
        const res = await window.fetchWithTimeout(`${window.CONFIG.WORKER_URL}/sof/handoff/pending`, {
            headers: { 'Authorization': `Bearer ${window.S.currentUser.access_token}` }
        }, 8000);
        if (!res.ok) return;
        const data = await res.json();

        window.updateHandoffBadge(data.total);

        if (!forceShowPopup) {
            if (data.incoming?.length > 0 && !window._handoffShownOnLogin) {
                window._handoffShownOnLogin = true;
                showHandoffIncomingPopup(data.incoming);
            }
            return;
        }

        let anyShown = false;
        if (data.incoming?.length > 0) {
            showHandoffIncomingPopup(data.incoming);
            anyShown = true;
        }
        if (data.declines?.length > 0) {
            showHandoffDeclineNotice(data.declines);
            anyShown = true;
        }
        if (data.accepts?.length > 0) {
            showHandoffAcceptNotice(data.accepts);
            anyShown = true;
        }

        if (anyShown) {
            window.updateHandoffBadge(data.incoming?.length || 0);
        } else {
            window.toggleAlertPanel();
        }
    } catch(_) {}
};

function showHandoffIncomingPopup(handoffs) {
    document.getElementById('handoffPopup')?.remove();
    document.getElementById('handoffPopupOverlay')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'handoffPopupOverlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9500;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;padding:16px;';

    const popup = document.createElement('div');
    popup.id = 'handoffPopup';
    popup.style.cssText = `
        background:var(--bg-card);border-radius:14px;padding:20px;
        max-width:420px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.4);
        border:1px solid var(--border);
    `;

    const items = handoffs.map(h => `
        <div id="handoff-item-${h.id}" style="background:var(--bg-elevated);border-radius:10px;padding:12px 14px;margin-bottom:10px;border:1px solid var(--border);">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
                <span style="font-size:1rem;">📋</span>
                <div>
                    <div style="font-weight:700;font-size:.85rem;color:var(--text-main);">
                        <strong style="color:var(--accent);">${window.escapeHtml(h.from_username)}</strong> sent you a SOF
                    </div>
                    <div style="font-size:.75rem;color:var(--text-soft);">🚢 ${window.escapeHtml(h.vessel_name || 'IMO '+h.imo)} · IMO ${h.imo}</div>
                </div>
            </div>
            ${h.notes ? `<div style="font-size:.75rem;color:var(--text-soft);background:var(--bg-card);border-radius:6px;padding:6px 8px;margin-bottom:8px;font-style:italic;">"${window.escapeHtml(h.notes)}"</div>` : ''}
            <div style="display:flex;gap:8px;">
                <button onclick="respondHandoff('${h.id}','accept')" class="btn-primary" style="flex:1;padding:7px;font-size:.78rem;">${i18n.get('handoffAcceptBtn')}</button>
                <button onclick="respondHandoff('${h.id}','decline')" class="btn-ghost" style="flex:1;padding:7px;font-size:.78rem;color:var(--danger);">${i18n.get('handoffDeclineBtn')}</button>
            </div>
            <div id="handoff-msg-${h.id}" style="font-size:.72rem;min-height:14px;margin-top:4px;text-align:center;"></div>
        </div>
    `).join('');

    popup.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
            <div style="font-weight:700;font-size:.95rem;color:var(--text-main);">${i18n.get('handoffIncoming')}</div>
            <button onclick="closeHandoffPopup()" style="background:none;border:none;color:var(--text-soft);font-size:1.1rem;cursor:pointer;">✕</button>
        </div>
        ${items}
        <button onclick="closeHandoffPopup()" style="width:100%;padding:8px;font-size:.78rem;background:none;border:1px solid var(--border);border-radius:8px;color:var(--text-soft);cursor:pointer;margin-top:4px;">${i18n.get('handoffRemindLater')}</button>
    `;

    overlay.appendChild(popup);
    document.body.appendChild(overlay);
}

window.closeHandoffPopup = function() {
    document.getElementById('handoffPopup')?.remove();
    document.getElementById('handoffPopupOverlay')?.remove();
};

window.respondHandoff = async function(id, action) {
    if (!window.S.currentUser?.access_token) return;
    const msgEl = document.getElementById(`handoff-msg-${id}`);
    const itemEl = document.getElementById(`handoff-item-${id}`);

    try {
        if (msgEl) { msgEl.style.color = 'var(--text-soft)'; msgEl.textContent = action === 'accept' ? i18n.get('handoffAccepting') : i18n.get('handoffDeclining'); }
        const res = await window.fetchWithTimeout(`${window.CONFIG.WORKER_URL}/sof/handoff/respond`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${window.S.currentUser.access_token}` },
            body: JSON.stringify({ id, action }),
        }, 10000);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        if (action === 'accept') {
            if (msgEl) { msgEl.style.color = 'var(--success)'; msgEl.textContent = i18n.get('handoffAccepted'); }
            setTimeout(() => { window.loadData(); }, 800);
            setTimeout(() => itemEl?.remove(), 2000);
        } else {
            if (msgEl) { msgEl.style.color = 'var(--danger)'; msgEl.textContent = i18n.get('handoffDeclined'); }
            setTimeout(() => itemEl?.remove(), 1500);
        }

        setTimeout(() => window.checkAndShowHandoffs(false), 2500);

        setTimeout(() => {
            const remaining = document.querySelectorAll('[id^="handoff-item-"]');
            if (!remaining.length) window.closeHandoffPopup();
        }, 2500);

    } catch(e) {
        if (msgEl) { msgEl.style.color = 'var(--danger)'; msgEl.textContent = `Error: ${e.message}`; }
    }
};

function showHandoffDeclineNotice(declines) {
    const ids = declines.map(d => d.id);
    declines.forEach(d => {
        window.showToast(`❌ ${window.escapeHtml(d.to_username)} declined your SOF for ${window.escapeHtml(d.vessel_name || 'IMO '+d.imo)}`, 'danger', 6000);
    });
    window.fetchWithTimeout(`${window.CONFIG.WORKER_URL}/sof/handoff/ack`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${window.S.currentUser.access_token}` },
        body: JSON.stringify({ ids }),
    }, 8000).catch(() => {});
}

function showHandoffAcceptNotice(accepts) {
    const ids = accepts.map(a => a.id);
    accepts.forEach(a => {
        window.showToast(`✅ ${window.escapeHtml(a.to_username)} accepted your SOF for ${window.escapeHtml(a.vessel_name || 'IMO '+a.imo)}`, 'success', 6000);
    });
    window.fetchWithTimeout(`${window.CONFIG.WORKER_URL}/sof/handoff/ack`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${window.S.currentUser.access_token}` },
        body: JSON.stringify({ ids }),
    }, 8000).catch(() => {});
}

window.sofShowSendPicker = async function(imo) {
    if (!window.S.currentUser?.access_token) { window.openAuthModal('login'); return; }

    document.getElementById('sofSendModal')?.remove();

    const modal = document.createElement('div');
    modal.id = 'sofSendModal';
    modal.style.cssText = `
        position:fixed;inset:0;z-index:9600;background:rgba(0,0,0,.5);
        display:flex;align-items:center;justify-content:center;padding:16px;
    `;

    modal.innerHTML = `
        <div style="background:var(--bg-card);border-radius:14px;padding:20px;max-width:360px;width:100%;border:1px solid var(--border);">
            <div style="font-weight:700;font-size:.95rem;margin-bottom:14px;color:var(--text-main);">${i18n.get('handoffSendTitle')}</div>
            <div id="sofSendUserList" style="margin-bottom:12px;">
                <div style="font-size:.78rem;color:var(--text-soft);">${i18n.get('handoffLoadingUsers')}</div>
            </div>
            <div style="margin-bottom:10px;">
                <label style="font-size:.72rem;color:var(--text-soft);">${i18n.get('handoffMessageLabel')}</label>
                <input id="sofSendNote" type="text" placeholder="e.g. Please complete section 3..." class="sof-input" style="margin-top:4px;">
            </div>
            <div style="display:flex;gap:8px;">
                <button onclick="document.getElementById('sofSendModal').remove()" class="btn-ghost" style="flex:1;padding:8px;font-size:.78rem;">${i18n.get('cancel')}</button>
                <button onclick="sofSendHandoff('${imo}')" class="btn-primary" style="flex:1;padding:8px;font-size:.78rem;" id="sofSendBtn">${i18n.get('sofSendBtn')}</button>
            </div>
            <div id="sofSendMsg" style="font-size:.72rem;min-height:14px;margin-top:6px;text-align:center;"></div>
        </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });

    try {
        const res = await window.fetchWithTimeout(`${window.CONFIG.WORKER_URL}/users/list`, {
            headers: { 'Authorization': `Bearer ${window.S.currentUser.access_token}` }
        }, 8000);
        const data = await res.json();
        const listEl = document.getElementById('sofSendUserList');
        if (!listEl) return;
        if (!data.users?.length) {
            listEl.innerHTML = '<div style="font-size:.78rem;color:var(--text-soft);">' + i18n.get('handoffNoUsers') + '</div>';
            return;
        }
        listEl.innerHTML = `
            <label style="font-size:.72rem;color:var(--text-soft);">${i18n.get('handoffSendTo')}</label>
            <select id="sofSendTarget" class="sof-input" style="margin-top:4px;">
                ${data.users.map(u => `<option value="${u.id}">${window.escapeHtml(u.username)}</option>`).join('')}
            </select>
        `;
    } catch(e) {
        const listEl = document.getElementById('sofSendUserList');
        if (listEl) listEl.innerHTML = `<div style="font-size:.78rem;color:var(--danger);">Failed to load users: ${window.escapeHtml(e.message)}</div>`;
    }
};

window.sofSendHandoff = async function(imo) {
    if (!window.S.currentUser?.access_token) return;
    const toUserId = document.getElementById('sofSendTarget')?.value;
    const notes    = document.getElementById('sofSendNote')?.value.trim() || '';
    const msgEl    = document.getElementById('sofSendMsg');
    const btn      = document.getElementById('sofSendBtn');

    if (!toUserId) { if (msgEl) { msgEl.style.color='var(--danger)'; msgEl.textContent='Select a user first.'; } return; }

    const v = window.S.vesselsDataMap?.get(imo) || {};
    const vesselName = v.name || `IMO ${imo}`;
    const draftData = sofCollectData(imo);

    if (btn) btn.disabled = true;
    if (msgEl) { msgEl.style.color='var(--text-soft)'; msgEl.textContent=i18n.get('handoffSending'); }

    try {
        const res = await window.fetchWithTimeout(`${window.CONFIG.WORKER_URL}/sof/handoff/send`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${window.S.currentUser.access_token}` },
            body: JSON.stringify({ to_user_id: toUserId, imo, vessel_name: vesselName, draft_data: draftData, notes }),
        }, 10000);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (msgEl) { msgEl.style.color='var(--success)'; msgEl.textContent=`${i18n.get('handoffSentTo')} ${window.escapeHtml(data.to_username)}!`; }
        setTimeout(() => document.getElementById('sofSendModal')?.remove(), 1800);
    } catch(e) {
        if (msgEl) { msgEl.style.color='var(--danger)'; msgEl.textContent=`Failed: ${e.message}`; }
        if (btn) btn.disabled = false;
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
// VESSEL OWNERS
// ═══════════════════════════════════════════════════════════════════════════════

window._ownersCache = window._ownersCache || new Map();

window.fetchOwner = async function(imo) {
    if (window._ownersCache.has(imo)) return window._ownersCache.get(imo);
    if (!window.S.currentUser?.access_token) return null;
    try {
        const res = await window.fetchWithTimeout(`${window.CONFIG.WORKER_URL}/vessel/owners/${imo}`, {
            headers: { 'Authorization': `Bearer ${window.S.currentUser.access_token}` }
        }, 6000);
        if (!res || !res.ok) return null;
        const d = await res.json();
        if (d.owner) { window._ownersCache.set(imo, d.owner); return d.owner; }
    } catch(_) {}
    return null;
};

window.saveOwner = async function(imo, name, address, phone, email) {
    if (!window.S.currentUser?.access_token) return { ok: false, error: 'Not logged in' };
    try {
        const res = await window.fetchWithTimeout(`${window.CONFIG.WORKER_URL}/vessel/owners`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${window.S.currentUser.access_token}` },
            body: JSON.stringify({ imo, name, address, phone, email }),
        }, 8000);
        if (!res) return { ok: false, error: 'No response from server' };
        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            return { ok: false, error: errData.error || `Server error ${res.status}` };
        }
        window._ownersCache.set(imo, { name, address, phone, email });
        if (window.renderVessels) window.renderVessels(window.S.trackedImosCache);
        return { ok: true };
    } catch(e) { return { ok: false, error: e.message }; }
};

window.loadVesselOwners = async function() {
    const uncached = window.S.trackedImosCache.filter(imo => !window._ownersCache.has(imo));
    if (!uncached.length) return;
    await Promise.allSettled(uncached.map(async imo => {
        const owner = await window.fetchOwner(imo);
        if (owner && window.renderVessels) window.renderVessels(window.S.trackedImosCache);
    }));
    if (window.renderVessels) window.renderVessels(window.S.trackedImosCache);
};

window.sofShowOwnerPopup = function(imo, vesselName, prefillName) {
    document.getElementById('ownerPopup')?.remove();
    document.getElementById('ownerPopupOverlay')?.remove();

    const existing = window._ownersCache.get(imo);
    const name    = prefillName || existing?.name || '';
    const address = existing?.address || '';
    const phone   = existing?.phone || '';
    const email   = existing?.email || '';

    const overlay = document.createElement('div');
    overlay.id = 'ownerPopupOverlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9700;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;padding:16px;';

    const popup = document.createElement('div');
    popup.id = 'ownerPopup';
    popup.style.cssText = 'background:var(--bg-card);border-radius:14px;padding:20px;max-width:400px;width:100%;border:1px solid var(--border);box-shadow:0 20px 60px rgba(0,0,0,.4);';

    popup.innerHTML = `
        <div style="font-weight:700;font-size:.95rem;color:var(--text-main);margin-bottom:4px;">${i18n.get('ownerConfirmTitle')}</div>
        <div style="font-size:.75rem;color:var(--text-soft);margin-bottom:14px;">Please confirm or complete the owners information for <strong>${window.escapeHtml(vesselName || 'IMO ' + imo)}</strong> — saved for future SOFs</div>
        <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:14px;">
            <div>
                <label style="font-size:.72rem;color:var(--text-soft);display:block;margin-bottom:3px;">${i18n.get('ownerCompanyLabel')}</label>
                <input id="ownerName" type="text" value="${window.escapeHtml(name)}" placeholder="${i18n.get('ownerPlaceholderName')}"
                    style="width:100%;background:var(--bg-elevated);border:1px solid var(--border);border-radius:7px;padding:7px 10px;color:var(--text-main);font-size:.82rem;box-sizing:border-box;">
            </div>
            <div>
                <label style="font-size:.72rem;color:var(--text-soft);display:block;margin-bottom:3px;">${i18n.get('ownerAddressLabel')}</label>
                <input id="ownerAddress" type="text" value="${window.escapeHtml(address)}" placeholder="${i18n.get('ownerPlaceholderAddr')}"
                    style="width:100%;background:var(--bg-elevated);border:1px solid var(--border);border-radius:7px;padding:7px 10px;color:var(--text-main);font-size:.82rem;box-sizing:border-box;">
            </div>
            <div style="display:flex;gap:8px;">
                <div style="flex:1;">
                    <label style="font-size:.72rem;color:var(--text-soft);display:block;margin-bottom:3px;">${i18n.get('ownerPhoneLabel')}</label>
                    <input id="ownerPhone" type="tel" value="${window.escapeHtml(phone)}" placeholder="+1234567890"
                        style="width:100%;background:var(--bg-elevated);border:1px solid var(--border);border-radius:7px;padding:7px 10px;color:var(--text-main);font-size:.82rem;box-sizing:border-box;">
                </div>
                <div style="flex:1;">
                    <label style="font-size:.72rem;color:var(--text-soft);display:block;margin-bottom:3px;">${i18n.get('ownerEmailLabel')}</label>
                    <input id="ownerEmail" type="email" value="${window.escapeHtml(email)}" placeholder="contact@owner.com"
                        style="width:100%;background:var(--bg-elevated);border:1px solid var(--border);border-radius:7px;padding:7px 10px;color:var(--text-main);font-size:.82rem;box-sizing:border-box;">
                </div>
            </div>
        </div>
        <div id="ownerMsg" style="font-size:.72rem;min-height:14px;margin-bottom:8px;"></div>
        <div style="display:flex;gap:8px;">
            <button onclick="closeOwnerPopup()" class="btn-ghost" style="flex:1;padding:8px;font-size:.78rem;">${i18n.get('ownerSkipBtn')}</button>
            <button onclick="confirmOwner('${imo}')" class="btn-primary" style="flex:1;padding:8px;font-size:.78rem;" id="ownerSaveBtn">${i18n.get('ownerConfirmBtn')}</button>
        </div>
    `;

    overlay.appendChild(popup);
    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => { if (e.target === overlay) window.closeOwnerPopup(); });
    setTimeout(() => document.getElementById('ownerName')?.focus(), 100);
};

window.closeOwnerPopup = function() {
    document.getElementById('ownerPopup')?.remove();
    document.getElementById('ownerPopupOverlay')?.remove();
};

window.confirmOwner = async function(imo) {
    const name    = document.getElementById('ownerName')?.value.trim();
    const address = document.getElementById('ownerAddress')?.value.trim() || '';
    const phone   = document.getElementById('ownerPhone')?.value.trim() || '';
    const email   = document.getElementById('ownerEmail')?.value.trim() || '';
    const msgEl   = document.getElementById('ownerMsg');
    const btn     = document.getElementById('ownerSaveBtn');

    if (!name) {
        if (msgEl) { msgEl.style.color = 'var(--danger)'; msgEl.textContent = i18n.get('ownerRequired'); }
        return;
    }
    if (btn) btn.disabled = true;
    if (msgEl) { msgEl.style.color = 'var(--text-soft)'; msgEl.textContent = i18n.get('ownerSaving'); }

    const result = await window.saveOwner(imo, name, address, phone, email);
    if (result.ok) {
        if (msgEl) { msgEl.style.color = 'var(--success)'; msgEl.textContent = i18n.get('ownerSaved'); }
        setTimeout(window.closeOwnerPopup, 800);
    } else {
        if (msgEl) { msgEl.style.color = 'var(--danger)'; msgEl.textContent = `❌ ${result.error}`; }
        if (btn) btn.disabled = false;
    }
};

window.showOwnerInfo = async function(imo) {
    let owner = window._ownersCache.get(imo);
    if (!owner) owner = await window.fetchOwner(imo);
    if (!owner) return;

    document.getElementById('ownerInfoPopup')?.remove();
    const popup = document.createElement('div');
    popup.id = 'ownerInfoPopup';
    popup.style.cssText = 'position:fixed;inset:0;z-index:9700;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;padding:16px;';

    const updatedMeta = (() => {
        const parts = [];
        if (owner.updated_by) parts.push(`by ${window.escapeHtml(owner.updated_by)}`);
        if (owner.updated_at) {
            try {
                const d = new Date(owner.updated_at);
                parts.push(`on ${d.toLocaleDateString([], { day:'2-digit', month:'short', year:'numeric' })}`);
            } catch {}
        }
        return parts.length ? `✏️ Updated ${parts.join(' ')}` : '';
    })();

    popup.innerHTML = `
        <div style="background:var(--bg-card);border-radius:14px;padding:20px;max-width:360px;width:100%;border:1px solid var(--border);box-shadow:0 20px 60px rgba(0,0,0,.4);">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
                <div style="font-weight:700;font-size:.95rem;color:var(--text-main);">🏢 ${window.escapeHtml(owner.name)}</div>
                <div style="display:flex;gap:6px;align-items:center;">
                    <button onclick="document.getElementById('ownerInfoPopup').remove();sofShowOwnerPopup('${imo}', null, null)" title="Edit owner" style="background:none;border:none;color:var(--accent);font-size:1rem;cursor:pointer;padding:2px 6px;">✏️</button>
                    <button onclick="document.getElementById('ownerInfoPopup').remove()" style="background:none;border:none;color:var(--text-soft);font-size:1.1rem;cursor:pointer;padding:2px 6px;">✕</button>
                </div>
            </div>
            ${owner.address ? `<div style="font-size:.82rem;color:var(--text-soft);margin-bottom:8px;">📍 ${window.escapeHtml(owner.address)}</div>` : ''}
            ${owner.phone   ? `<div style="font-size:.82rem;color:var(--text-soft);margin-bottom:8px;">📞 <a href="tel:${window.escapeHtml(owner.phone)}" style="color:var(--accent);">${window.escapeHtml(owner.phone)}</a></div>` : ''}
            ${owner.email   ? `<div style="font-size:.82rem;color:var(--text-soft);margin-bottom:8px;">✉️ <a href="mailto:${window.escapeHtml(owner.email)}" style="color:var(--accent);">${window.escapeHtml(owner.email)}</a></div>` : ''}
            <div style="font-size:.68rem;color:var(--text-soft);margin-top:10px;border-top:1px solid var(--border);padding-top:8px;">
                IMO ${imo}
                ${updatedMeta ? `<span style="display:block;margin-top:3px;">${updatedMeta}</span>` : ''}
            </div>
        </div>
    `;
    document.body.appendChild(popup);
    popup.addEventListener('click', e => { if (e.target === popup) popup.remove(); });
};
// ── Real‑time handoff listener (robust) ─────────────────────────────────────
window.startRealtimeHandoffListener = function() {
    if (!window.S.currentUser) return;

    // Cleanup any existing channel to avoid duplicates
    if (window._handoffChannel) {
        window.supabaseClient?.removeChannel(window._handoffChannel);
        window._handoffChannel = null;
    }

    try {
        // Ensure Supabase client exists; create if not (once)
        const supabaseUrl = 'https://rpzcphszvdgjsqnhwdhm.supabase.co';
        const supabaseAnonKey = 'sb_publishable_DXgi3J0tJyM1azdSzGycFQ_l2hsut64';
        if (!window.supabaseClient) {
            // Lazy-load Supabase JS if not already on the page (~175KB, only needed for realtime)
            if (typeof supabase === 'undefined') {
                const script = document.createElement('script');
                script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
                script.onload = () => {
                    window.supabaseClient = supabase.createClient(supabaseUrl, supabaseAnonKey);
                    // Retry now that the lib is loaded
                    window.startRealtimeHandoffListener();
                };
                script.onerror = () => console.error('[REALTIME] Failed to load Supabase JS');
                document.head.appendChild(script);
                return; // Will be called again from onload above
            }
            window.supabaseClient = supabase.createClient(supabaseUrl, supabaseAnonKey);
        }

        const channel = window.supabaseClient.channel(`handoffs-${window.S.currentUser.user_id}`);
        window._handoffChannel = channel; // Save for later cleanup

        channel.on(
            'postgres_changes',
            {
                event: 'INSERT',
                schema: 'public',
                table: 'sof_handoffs',          // verify your actual table name
                filter: `to_user_id=eq.${window.S.currentUser.user_id}`
            },
            (payload) => {
                const newHandoff = payload.new;
                window.showToast(
                    `📋 New SOF from ${newHandoff.from_username || 'a colleague'} — IMO ${newHandoff.imo}`,
                    'success',
                    8000
                );
                window.updateHandoffBadge((window.S.pendingHandoffCount || 0) + 1);
                window.checkAndShowHandoffs(true);
            }
        );

        channel.subscribe((status) => {
            console.log('[REALTIME] Handoff subscription status:', status);
        });

        console.log('[REALTIME] Listening for handoffs...');
    } catch (error) {
        console.error('[REALTIME] Failed to start listener:', error);
        // Silently fail – do not block the UI
    }
};

// ── Auto-start for returning users ───────────────────────────────────────────
// init() in app.js runs before sof.js executes (defer script order), so the
// stubs in auth.js were still active. Now that sof.js is loaded with real
// implementations, start if a session is already active.
(function() {
    if (window.S?.currentUser?.access_token) {
        window.startRealtimeHandoffListener();
        window._handoffShownOnLogin = false;
        window.startHandoffPolling();
        console.log('[SOF] Auto-started handoff listener for restored session.');
    }
})();
