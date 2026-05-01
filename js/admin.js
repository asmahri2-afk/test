// ═══════════════════════════════════════════════════════════════════════════════
// VESSELTRACKER v5.7 – Admin Dashboard
// (With Full Dashboard button)
// ═══════════════════════════════════════════════════════════════════════════════

window.loadAdminDashboard = async function() {
    const el = document.getElementById('adminContent');
    if (!el || !window.S.currentUser) return;
    el.innerHTML = '<span style="color:var(--text-soft);font-size:.75rem;">' + i18n.get('loadingDots') + '</span>';
    try {
        const res = await window.fetchWithTimeout(
            `${window.CONFIG.WORKER_URL}/admin/data`,
            { headers: { 'Authorization': `Bearer ${window.S.currentUser.access_token}` } },
            10000
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        const fmt = (utc) => {
            if (!utc) return '—';
            try { return new Date(utc).toLocaleString('en-GB', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' }); }
            catch(_) { return utc; }
        };

        const renderVessels = (vessels, userId) => {
            if (!vessels.length) return '<div style="color:var(--text-soft);font-size:.72rem;padding:4px 0;">' + i18n.get('adminNoVessels') + '</div>';
            return vessels.map(v => `
                <div style="display:flex;align-items:center;gap:6px;padding:5px 0;border-bottom:1px solid var(--border);">
                    <div style="flex:1;min-width:0;">
                        <div style="font-weight:600;font-size:.75rem;color:var(--text-main);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${window.escapeHtml(v.name || 'IMO '+v.imo)}</div>
                        <div style="font-size:.67rem;color:var(--text-soft);">IMO ${v.imo} · ${v.sog != null ? v.sog.toFixed(1)+' kn' : '—'} · ${window.escapeHtml(v.destination||'—')}</div>
                        <div style="font-size:.67rem;color:var(--text-soft);">🔔 ${fmt(v.last_alert_utc)}</div>
                    </div>
                    <button onclick="adminFleetRemove('${userId}','${v.imo}',this)" style="background:rgba(239,68,68,.12);border:none;color:var(--danger);border-radius:5px;padding:3px 8px;font-size:.68rem;cursor:pointer;flex-shrink:0;">✕</button>
                </div>`).join('');
        };

        const userCards = data.users.map(u => `
            <div id="adminUser_${u.id}" style="background:var(--bg-elevated);border-radius:8px;padding:10px 12px;margin-bottom:8px;">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
                    <span style="font-weight:700;font-size:.8rem;color:var(--text-main);">👤 ${window.escapeHtml(u.username)}</span>
                    <div style="display:flex;gap:5px;align-items:center;">
                        <button onclick="adminToggleAlerts('${u.id}',${!u.callmebot_enabled},this)"
                            style="font-size:.66rem;padding:2px 7px;border-radius:20px;border:none;cursor:pointer;
                            background:${u.callmebot_enabled ? 'rgba(34,197,94,.15)' : 'rgba(100,116,139,.15)'};
                            color:${u.callmebot_enabled ? 'var(--success)' : 'var(--text-soft)'};">
                            ${u.callmebot_enabled ? '📱 ON' : 'OFF'}
                        </button>
                        <button onclick="adminToggleEdit('${u.id}')" style="font-size:.66rem;padding:2px 7px;border-radius:20px;border:1px solid var(--border);background:none;color:var(--text-soft);cursor:pointer;">✏️</button>
                    </div>
                </div>

                <div id="adminEdit_${u.id}" style="display:none;background:var(--bg-card);border-radius:7px;padding:10px;margin-bottom:8px;border:1px solid var(--border);">
                    <div style="font-size:.72rem;color:var(--text-soft);margin-bottom:6px;">${i18n.get('adminCallMeBotTitle')}</div>
                    <input id="adminPhone_${u.id}" type="tel" placeholder="${i18n.get('adminPhonePlaceholder')}" value="${window.escapeHtml(u.callmebot_phone||'')}"
                        style="width:100%;background:var(--bg-elevated);border:1px solid var(--border);border-radius:6px;padding:6px 8px;color:var(--text-main);font-size:.73rem;box-sizing:border-box;margin-bottom:5px;">
                    <input id="adminApikey_${u.id}" type="text" placeholder="${i18n.get('adminApiKeyPlaceholder')}" value="${window.escapeHtml(u.callmebot_apikey||'')}"
                        style="width:100%;background:var(--bg-elevated);border:1px solid var(--border);border-radius:6px;padding:6px 8px;color:var(--text-main);font-size:.73rem;font-family:var(--mono);box-sizing:border-box;margin-bottom:6px;">
                    <button onclick="adminSaveSettings('${u.id}')" style="width:100%;padding:6px;font-size:.73rem;background:var(--accent);color:#fff;border:none;border-radius:6px;cursor:pointer;margin-bottom:8px;">${i18n.get('adminSaveCallmebot')}</button>

                    <div style="font-size:.72rem;color:var(--text-soft);margin-bottom:6px;">${i18n.get('adminResetPinTitle')}</div>
                    <div style="display:flex;gap:5px;">
                        <input id="adminPin_${u.id}" type="number" placeholder="${i18n.get('adminPinPlaceholder')}" min="1000" max="999999"
                            style="flex:1;background:var(--bg-elevated);border:1px solid var(--border);border-radius:6px;padding:6px 8px;color:var(--text-main);font-size:.73rem;font-family:var(--mono);">
                        <button onclick="adminResetPin('${u.id}')" style="padding:6px 10px;font-size:.73rem;background:rgba(245,158,11,.15);color:var(--warning);border:1px solid rgba(245,158,11,.3);border-radius:6px;cursor:pointer;white-space:nowrap;">${i18n.get('adminSetPinBtn')}</button>
                    </div>
                </div>

                <div style="font-size:.7rem;color:var(--text-soft);margin-bottom:4px;">${u.vessels.length} vessel${u.vessels.length!==1?'s':''} tracked</div>
                <div id="adminFleet_${u.id}">${renderVessels(u.vessels, u.id)}</div>
                <div style="display:flex;gap:5px;margin-top:7px;">
                    <input id="adminImo_${u.id}" type="text" placeholder="${i18n.get('adminAddImoPlaceholder')}" maxlength="7"
                        style="flex:1;background:var(--bg-elevated);border:1px solid var(--border);border-radius:6px;padding:5px 8px;color:var(--text-main);font-size:.73rem;font-family:var(--mono);">
                    <button onclick="adminFleetAdd('${u.id}')" style="padding:5px 10px;font-size:.73rem;background:rgba(14,165,233,.15);color:var(--accent);border:1px solid rgba(14,165,233,.3);border-radius:6px;cursor:pointer;">${i18n.get('adminAddBtn')}</button>
                </div>
                <div id="adminMsg_${u.id}" style="font-size:.68rem;min-height:14px;margin-top:4px;"></div>
            </div>`).join('');

        const publicBlock = data.public_fleet.length ? `
            <div style="background:var(--bg-elevated);border-radius:8px;padding:10px 12px;margin-bottom:8px;">
                <div style="font-weight:700;font-size:.8rem;color:var(--text-main);margin-bottom:4px;">${i18n.get('adminPublicFleet')} (${data.public_fleet.length})</div>
                ${renderVessels(data.public_fleet, '__public__')}
            </div>` : '';

        // Full Dashboard button
        const fullDashboardBtn = `
    <button onclick="window.location.href='admin/index.html?token=' + encodeURIComponent(window.S.currentUser.access_token)"
        style="width:100%;padding:10px;font-size:.8rem;font-weight:600;
               background:var(--accent);color:#fff;border:none;border-radius:8px;
               cursor:pointer;margin-bottom:12px;transition:opacity .15s;"
        onmouseover="this.style.opacity='.85'" onmouseout="this.style.opacity='1'">
        📊 Full Dashboard
    </button>`;

        el.innerHTML = `
            <div style="display:flex;gap:6px;margin-bottom:10px;">
                <div style="flex:1;background:var(--bg-elevated);border-radius:6px;padding:7px;text-align:center;">
                    <div style="font-size:1rem;font-weight:700;color:var(--accent);">${data.total_users}</div>
                    <div style="font-size:.63rem;color:var(--text-soft);">${i18n.get('adminUsersLabel')}</div>
                </div>
                <div style="flex:1;background:var(--bg-elevated);border-radius:6px;padding:7px;text-align:center;">
                    <div style="font-size:1rem;font-weight:700;color:var(--accent);">${data.total_vessels}</div>
                    <div style="font-size:.63rem;color:var(--text-soft);">${i18n.get('adminVesselsLabel')}</div>
                </div>
                <div style="flex:1;background:var(--bg-elevated);border-radius:6px;padding:7px;text-align:center;">
                    <div style="font-size:1rem;font-weight:700;color:var(--accent);">${data.users.filter(u=>u.callmebot_enabled).length}</div>
                    <div style="font-size:.63rem;color:var(--text-soft);">${i18n.get('adminAlertsOnLabel')}</div>
                </div>
            </div>
            ${fullDashboardBtn}
            ${userCards}
            ${publicBlock}
            <button onclick="loadAdminDashboard()" style="width:100%;padding:6px;font-size:.72rem;background:none;border:1px solid var(--border);border-radius:6px;color:var(--text-soft);cursor:pointer;margin-top:2px;">${i18n.get('adminRefreshBtn')}</button>`;

    } catch(e) {
        if (!window.S.currentUser) {
            el.innerHTML = '';
            return;
        }
        el.innerHTML = `<span style="color:var(--danger);font-size:.75rem;">Failed: ${window.escapeHtml(e.message)}</span>`;
    }
};

window.adminToggleEdit = function(userId) {
    const el = document.getElementById(`adminEdit_${userId}`);
    if (!el) return;
    el.style.display = el.style.display === 'none' ? 'block' : 'none';
};

window.adminToggleAlerts = async function(userId, newState, btn) {
    if (!window.S.currentUser) return;
    btn.disabled = true;
    try {
        const res = await window.fetchWithTimeout(`${window.CONFIG.WORKER_URL}/admin/user/update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                admin_token: window.S.currentUser.access_token,
                user_id: userId,
                callmebot_enabled: newState,
            })
        }, 8000);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        btn.textContent = newState ? '📱 ON' : 'OFF';
        btn.style.background = newState ? 'rgba(34,197,94,.15)' : 'rgba(100,116,139,.15)';
        btn.style.color = newState ? 'var(--success)' : 'var(--text-soft)';
        btn.onclick = () => window.adminToggleAlerts(userId, !newState, btn);
    } catch(e) {
        window.showAdminMsg(userId, `Failed: ${e.message}`, 'danger');
    }
    btn.disabled = false;
};

window.adminSaveSettings = async function(userId) {
    if (!window.S.currentUser) return;
    const phone  = document.getElementById(`adminPhone_${userId}`)?.value.trim() || '';
    const apikey = document.getElementById(`adminApikey_${userId}`)?.value.trim() || '';
    const enabled = document.querySelector(`#adminUser_${userId} button[onclick*="adminToggleAlerts"]`)
        ?.textContent.includes('ON') || false;
    try {
        const res = await window.fetchWithTimeout(`${window.CONFIG.WORKER_URL}/admin/user/update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ admin_token: window.S.currentUser.access_token, user_id: userId, callmebot_phone: phone, callmebot_apikey: apikey, callmebot_enabled: enabled })
        }, 8000);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        window.showAdminMsg(userId, i18n.get('adminSaved'), 'success');
    } catch(e) { window.showAdminMsg(userId, `Failed: ${e.message}`, 'danger'); }
};

window.adminResetPin = async function(userId) {
    if (!window.S.currentUser) return;
    const pinEl = document.getElementById(`adminPin_${userId}`);
    const pin = pinEl?.value.trim();
    if (!pin || !/^\d{4,6}$/.test(pin)) { window.showAdminMsg(userId, i18n.get('adminPinInvalid'), 'warning'); return; }
    try {
        const res = await window.fetchWithTimeout(`${window.CONFIG.WORKER_URL}/admin/user/pin`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ admin_token: window.S.currentUser.access_token, user_id: userId, new_pin: pin })
        }, 8000);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        if (pinEl) pinEl.value = '';
        window.showAdminMsg(userId, i18n.get('adminPinReset'), 'success');
    } catch(e) { window.showAdminMsg(userId, `Failed: ${e.message}`, 'danger'); }
};

window.adminFleetAdd = async function(userId) {
    if (!window.S.currentUser) return;
    const imoEl = document.getElementById(`adminImo_${userId}`);
    const imo = imoEl?.value.trim();
    if (!imo || imo.length !== 7) { window.showAdminMsg(userId, i18n.get('adminImoInvalid'), 'warning'); return; }
    try {
        const res = await window.fetchWithTimeout(`${window.CONFIG.WORKER_URL}/admin/fleet/add`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ admin_token: window.S.currentUser.access_token, user_id: userId, imo })
        }, 8000);
        if (!res.ok) { const d = await res.json(); throw new Error(d.error || `HTTP ${res.status}`); }
        if (imoEl) imoEl.value = '';
        window.showAdminMsg(userId, `✅ IMO ${imo} added`, 'success');
        setTimeout(window.loadAdminDashboard, 800);
    } catch(e) { window.showAdminMsg(userId, `Failed: ${e.message}`, 'danger'); }
};

window.adminFleetRemove = async function(userId, imo, btn) {
    if (!window.S.currentUser) return;
    if (!confirm(`Remove IMO ${imo} from this user?`)) return;
    btn.disabled = true;
    try {
        const res = await window.fetchWithTimeout(`${window.CONFIG.WORKER_URL}/admin/fleet/remove`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ admin_token: window.S.currentUser.access_token, user_id: userId, imo })
        }, 8000);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        btn.closest('div[style*="border-bottom"]')?.remove();
        window.showAdminMsg(userId, `✅ IMO ${imo} removed`, 'success');
    } catch(e) { window.showAdminMsg(userId, `Failed: ${e.message}`, 'danger'); btn.disabled = false; }
};

window.showAdminMsg = function(userId, msg, type) {
    const el = document.getElementById(`adminMsg_${userId}`);
    if (!el) return;
    const color = type === 'success' ? 'var(--success)' : type === 'warning' ? 'var(--warning)' : 'var(--danger)';
    el.innerHTML = `<span style="color:${color};">${msg}</span>`;
    setTimeout(() => { if (el) el.innerHTML = ''; }, 3000);
};
