// Authentication, session, map, toast utilities

window.CONFIG = window.CONFIG || { WORKER_URL: '/api', STALE_THRESHOLD_MS: 6*3600000, CRITICAL_THRESHOLD_MS: 24*3600000, ARRIVED_THRESHOLD_NM: 30.0, REFRESH_INTERVAL: 5*60000 };

// Theme
window.loadTheme = function() {
    let saved = 'dark';
    try { saved = localStorage.getItem('vt_theme') || 'dark'; } catch(_) {}
    window.applyTheme(saved);
};
window.applyTheme = function(theme) {
    if (theme === 'light') {
        document.documentElement.setAttribute('data-theme', 'light');
        document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#f0f4f8');
    } else {
        document.documentElement.removeAttribute('data-theme');
        document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#020c1a');
    }
    const btn = document.getElementById('themeToggle');
    if (btn) btn.textContent = theme === 'light' ? '☀️' : '🌙';
};
window.toggleTheme = function() {
    const current = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
    const next = current === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem('vt_theme', next); } catch(_) {}
    window.applyTheme(next);
};

// Map
window.initMap = function() {
    if (window.S?.mapInitialized) return;
    if (typeof L === 'undefined') {
        // Leaflet not yet loaded — retry after a short delay
        setTimeout(window.initMap, 200);
        return;
    }
    const mapEl = document.getElementById('map');
    if (!mapEl) return;
    window.S.mapInstance = L.map('map', { center: [25, -15], zoom: 5 });
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '© OpenStreetMap, © CARTO', maxZoom: 18
    }).addTo(window.S.mapInstance);
    window.S.mapInitialized = true;
    window.updateMapMarkers();
};
window.updateMapMarkers = function() {
    if (!window.S?.mapInitialized) return;
    window.S.mapMarkers?.forEach(m => m.remove());
    window.S.mapMarkers = [];
    const colors = { UNDERWAY: '#10b981', 'AT PORT': '#0ea5e9', 'AT ANCHOR': '#f59e0b', STALLED: '#ef4444', 'DATA PENDING': '#4e6a84' };
    for (const imo of window.S.trackedImosCache) {
        const v = window.S.vesselsDataMap.get(imo);
        if (!v || v.lat == null || v.lon == null) continue;
        const status = window.getVesselStatus(v);
        const color = window.S.sanctionedImos.has(imo) ? '#ff4500' : (colors[status] || '#4e6a84');
        const cog = v.cog ? Number(v.cog) : 0;
        const icon = L.divIcon({
            className: '',
            html: `<div style="transform:rotate(${cog}deg);width:22px;height:22px;"><svg viewBox="0 0 24 24" fill="${color}" style="filter:drop-shadow(0 0 6px ${color}90);"><path d="M12 2L5 20l7-3.5L19 20Z"/></svg></div>`,
            iconSize: [22, 22], iconAnchor: [11, 11], popupAnchor: [0, -12]
        });
        const age = window.formatSignalAge(v.last_pos_utc);
        const isSanc = window.S.sanctionedImos.has(imo);
        const popup = `<div style="font-family:sans-serif;min-width:185px;">${isSanc ? `<div style="background:rgba(255,69,0,.15);border:1px solid rgba(255,69,0,.3);border-radius:5px;padding:4px 8px;margin-bottom:7px;font-size:.7rem;color:#ff4500;font-weight:700;">🚨 ${i18n.get('mapSanctioned')}</div>` : ''}<div style="font-weight:700;font-size:.9rem;color:var(--text-main);margin-bottom:3px;">${escapeHtml(v.name || 'IMO ' + imo)}</div><div style="font-size:.7rem;color:var(--text-soft);margin-bottom:7px;">IMO ${imo} · ${escapeHtml(v.flag || '—')}</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:3px;font-size:.74rem;color:var(--text-main);"><div><span style="color:var(--text-soft);">${i18n.get('mapStatus')}</span><br><strong style="color:${color};">${window.getStatusLabel(status)}</strong></div><div><span style="color:var(--text-soft);">${i18n.get('mapSignal')}</span><br><strong>${age.ageText}</strong></div><div><span style="color:var(--text-soft);">${i18n.get('mapSpeed')}</span><br><strong>${v.sog != null ? Number(v.sog).toFixed(1) + ' kn' : '—'}</strong></div><div><span style="color:var(--text-soft);">${i18n.get('mapCourse')}</span><br><strong>${v.cog != null ? Number(v.cog).toFixed(0) + '°' : '—'}</strong></div></div>${v.destination ? `<div style="margin-top:6px;font-size:.7rem;color:var(--text-main);"><span style="color:var(--text-soft);">${i18n.get('mapDest')} </span><strong>${escapeHtml(v.destination)}</strong></div>` : ''}</div>`;
        const marker = L.marker([Number(v.lat), Number(v.lon)], { icon }).bindPopup(popup);
        marker.addTo(window.S.mapInstance);
        window.S.mapMarkers.push(marker);
    }
};

// Session & Auth
window.saveSession = function(user) {
    const expires = new Date(Date.now() + 30 * 24 * 3600000).toUTCString();
    const _secure = location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `vt_session=${encodeURIComponent(JSON.stringify(user))}; expires=${expires}; path=/; SameSite=Strict${_secure}`;
    window.S.currentUser = user;
};
window.loadSession = function() {
    try {
        const match = document.cookie.match(/(?:^|;\s*)vt_session=([^;]+)/);
        if (!match) return null;
        const user = JSON.parse(decodeURIComponent(match[1]));
        if (user && user.access_token && user.username && user.user_id) {
            window.S.currentUser = user;
            window.S.fleetMode = 'personal';
            return user;
        }
    } catch (e) { console.warn('Session load failed:', e); }
    return null;
};
window.clearSession = function() {
    const _secureClr = location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `vt_session=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Strict${_secureClr}`;
    window.S.currentUser = null;
    window.S.fleetMode = 'public';
};
window.isAllowedEmailDomain = function(email) {
    if (!email || !email.includes('@')) return false;
    const domain = email.split('@').pop().toLowerCase();
    return ['cma-cgm.com'].includes(domain);
};
window.register = async function(username, pin, email) {
    const res = await window.fetchWithTimeout(`${CONFIG.WORKER_URL}/auth/register`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, pin, email })
    }, 12000);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Registration failed');
    return window.login(username, pin);
};
window.login = async function(username, pin) {
    const res = await window.fetchWithTimeout(`${CONFIG.WORKER_URL}/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, pin })
    }, 12000);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Login failed');
    window.saveSession({ username: data.username, access_token: data.access_token, user_id: data.user_id });
    window.S.fleetMode = 'personal';
    window.updateAuthIcon();
    window.startRealtimeHandoffListener();
    window.closeAuthModal();
    if (window.innerWidth >= 641 && window.el.addCard) window.el.addCard.classList.remove('hidden');
    window.loadData();
    window.loadUserProfile();
    window.injectHandoffBadge();
    window._handoffShownOnLogin = false;
    window._dosShownOnLogin = false;
    window.startHandoffPolling();
    // Single eager load — starts both realtime listener and polling once dossier.js loads
    if (window._dosEagerLoad) {
        window._dosEagerLoad(() => {
            if (window.startDossierRealtimeListener) window.startDossierRealtimeListener();
            if (window.startDossierHandoffPolling) window.startDossierHandoffPolling();
        });
    }
    return data;
};
window.logout = function() {
    window.clearSession();
    window.S.fleetMode = 'public';
    window.updateAuthIcon();
    window.closeSettingsPanel();
    if (window.el.addCard) window.el.addCard.classList.add('hidden');
    window.loadData();
    window.stopHandoffPolling();
    if (window.stopDossierHandoffPolling) window.stopDossierHandoffPolling();
    window.updateHandoffBadge(0);
    window.S.pendingDossierCount = 0;
    window.updateAlertBadge();
};
window.deleteAccount = async function() {
    if (!window.S.currentUser) return;
    const pin = prompt('Enter your PIN to confirm account deletion.\n\n⚠️ This will permanently delete your account and all tracked vessels.');
    if (pin === null) return;
    if (!/^\d{4,6}$/.test(pin.trim())) { alert('Invalid PIN format — account not deleted.'); return; }
    const msgEl = document.getElementById('cmSettingsMsg');
    if (msgEl) { msgEl.textContent = '⏳ Deleting account...'; msgEl.style.color = 'var(--text-soft)'; }
    try {
        const res = await window.fetchWithTimeout(`${CONFIG.WORKER_URL}/auth/delete`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_token: window.S.currentUser.access_token, pin: pin.trim() }),
        }, 12000);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Deletion failed');
        window.clearSession();
        localStorage.removeItem('vt_cache'); localStorage.removeItem('vt_alerts'); localStorage.removeItem('vt_priorities');
        window.S.fleetMode = 'public';
        window.S.trackedImosCache = []; window.S.vesselsDataMap = new Map(); window.S.alerts = []; window.S.priorities = [];
        window.closeSettingsPanel();
        window.updateAuthIcon();
        window.renderVessels([]); window.updateFleetKPI([]);
        window.updateStatus('Account deleted successfully', 'success');
    } catch (e) {
        if (msgEl) { msgEl.textContent = `✗ ${e.message}`; msgEl.style.color = 'var(--danger)'; }
    }
};
window.updateAuthIcon = function() {
    const label = window.S.currentUser ? `👤 ${window.S.currentUser.username}` : '👤 Login';
    const desktopBtn = document.getElementById('authIconBtn');
    const mobileBtn = document.getElementById('authIconBtnMobile');
    if (desktopBtn) {
        const labelSpan = document.getElementById('authIconBtnLabel');
        if (labelSpan) labelSpan.textContent = window.S.currentUser ? window.S.currentUser.username : 'Login';
        else desktopBtn.textContent = label;
    }
    if (mobileBtn) mobileBtn.childNodes[1] && (mobileBtn.childNodes[1].textContent = window.S.currentUser ? window.S.currentUser.username : 'Account');
};
window.openAuthModal = function(mode) {
    const modal = document.getElementById('authModal');
    if (!modal) return;
    modal.classList.remove('hidden');
    window.setAuthMode(mode || 'login');
};
window.closeAuthModal = function() {
    const modal = document.getElementById('authModal');
    if (modal) modal.classList.add('hidden');
    const errDiv = document.getElementById('authError');
    if (errDiv) errDiv.textContent = '';
};
window.setAuthMode = function(mode) {
    const titleEl = document.getElementById('authModalTitle');
    const submitBtn = document.getElementById('authSubmitBtn');
    const toggleLink = document.getElementById('authToggleLink');
    const emailRow = document.getElementById('authEmailRow');
    const modal = document.getElementById('authModal');
    if (!modal) return;
    modal.dataset.mode = mode;
    if (mode === 'register') {
        if (titleEl) titleEl.textContent = 'Create Account';
        if (submitBtn) submitBtn.textContent = 'Create Account';
        if (toggleLink) toggleLink.textContent = 'Already have an account? Login';
        if (emailRow) emailRow.style.display = 'block';
    } else {
        if (titleEl) titleEl.textContent = 'Login';
        if (submitBtn) submitBtn.textContent = 'Login';
        if (toggleLink) toggleLink.textContent = 'No account? Create one';
        if (emailRow) emailRow.style.display = 'none';
        const emailInput = document.getElementById('authEmail');
        if (emailInput) emailInput.value = '';
    }
};
window.toggleAuthMode = function() {
    const modal = document.getElementById('authModal');
    if (!modal) return;
    const current = modal.dataset.mode || 'login';
    window.setAuthMode(current === 'login' ? 'register' : 'login');
    const errDiv = document.getElementById('authError');
    if (errDiv) errDiv.textContent = '';
};
window.submitAuth = async function() {
    const modal = document.getElementById('authModal');
    const usernameInput = document.getElementById('authUsername');
    const pinInput = document.getElementById('authPin');
    const emailInput = document.getElementById('authEmail');
    const errDiv = document.getElementById('authError');
    const submitBtn = document.getElementById('authSubmitBtn');
    if (!modal || !usernameInput || !pinInput) return;
    const mode = modal.dataset.mode || 'login';
    const username = usernameInput.value.trim();
    const pin = pinInput.value.trim();
    const email = emailInput?.value.trim().toLowerCase() || '';
    if (errDiv) errDiv.textContent = '';
    if (username.length < 3) { if (errDiv) errDiv.textContent = 'Username must be at least 3 characters'; return; }
    if (!/^\d{4,6}$/.test(pin)) { if (errDiv) errDiv.textContent = 'PIN must be 4–6 digits'; return; }
    if (mode === 'register') {
        if (!email) { if (errDiv) errDiv.textContent = 'Company email is required'; return; }
        if (!window.isAllowedEmailDomain(email)) { if (errDiv) errDiv.textContent = 'Email must be a company address (@cma-cgm.com)'; return; }
    }
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = '⏳'; }
    try {
        if (mode === 'register') await window.register(username, pin, email);
        else await window.login(username, pin);
    } catch (e) {
        if (errDiv) errDiv.textContent = e.message || 'Something went wrong';
    } finally {
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = mode === 'register' ? 'Create Account' : 'Login'; }
    }
};
window.loadUserProfile = async function() {
    if (!window.S.currentUser) return;
    try {
        const res = await window.fetchWithTimeout(`${CONFIG.WORKER_URL}/user/profile`, {
            headers: { 'Authorization': `Bearer ${window.S.currentUser.access_token}` }
        }, 8000);
        if (!res.ok) return;
        const p = await res.json();
        const phoneInput = document.getElementById('cmPhone');
        const apiKeyInput = document.getElementById('cmApiKey');
        const enabledToggle = document.getElementById('cmEnabled');
        if (phoneInput) phoneInput.value = p.callmebot_phone || '';
        if (apiKeyInput) apiKeyInput.value = p.callmebot_apikey || '';
        if (enabledToggle) enabledToggle.checked = !!p.callmebot_enabled;
    } catch (e) { console.warn('loadUserProfile failed:', e); }
};
window.saveCallMeBotSettings = async function() {
    if (!window.S.currentUser) return;
    const phone = document.getElementById('cmPhone')?.value.trim() || '';
    const apikey = document.getElementById('cmApiKey')?.value.trim() || '';
    const enabled = document.getElementById('cmEnabled')?.checked || false;
    const msgEl = document.getElementById('cmSettingsMsg');
    try {
        const res = await window.fetchWithTimeout(`${CONFIG.WORKER_URL}/user/settings`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_token: window.S.currentUser.access_token, callmebot_phone: phone, callmebot_apikey: apikey, callmebot_enabled: enabled })
        }, 10000);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Save failed');
        if (msgEl) { msgEl.textContent = i18n.get('cmSettingsSaved'); msgEl.style.color = 'var(--success)'; setTimeout(() => { if (msgEl) msgEl.textContent = ''; }, 3000); }
    } catch (e) {
        if (msgEl) { msgEl.textContent = `✗ ${e.message}`; msgEl.style.color = 'var(--danger)'; }
    }
};
window.testCallMeBot = async function() {
    const phone = document.getElementById('cmPhone')?.value.trim() || '';
    const apikey = document.getElementById('cmApiKey')?.value.trim() || '';
    const msgEl = document.getElementById('cmSettingsMsg');
    if (!phone || !apikey) { if (msgEl) { msgEl.textContent = i18n.get('cmEnterDetails'); msgEl.style.color = 'var(--danger)'; } return; }
    if (msgEl) { msgEl.textContent = `⏳ ${i18n.get('cmSendingTest')}`; msgEl.style.color = 'var(--text-soft)'; }
    try {
        const res = await window.fetchWithTimeout(`${CONFIG.WORKER_URL}/callmebot/test`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', ...(window.S.currentUser?.access_token ? { 'Authorization': `Bearer ${window.S.currentUser.access_token}` } : {}) },
            body: JSON.stringify({ phone, apikey, message: 'VesselTracker test alert 🚢' }),
        }, 15000);
        const data = await res.json();
        if (data.success) {
            const resp = (data.response || '').toLowerCase();
            const isRejected = resp.includes('incorrect') || resp.includes('error') || resp.includes('invalid') || resp.includes('not found') || resp.includes('failed');
            if (isRejected) { if (msgEl) { msgEl.textContent = i18n.get('cmTestInvalid'); msgEl.style.color = 'var(--danger)'; } }
            else { if (msgEl) { msgEl.textContent = i18n.get('cmTestSuccess'); msgEl.style.color = 'var(--success)'; } }
        } else {
            const errMsg = data.response || data.error || 'Unknown error';
            if (msgEl) { msgEl.textContent = `${i18n.get('cmTestFailed')} ${errMsg}`; msgEl.style.color = 'var(--danger)'; }
        }
    } catch (e) {
        if (msgEl) { msgEl.textContent = `${i18n.get('cmTestFailed')} ${e.message}`; msgEl.style.color = 'var(--danger)'; }
    }
};

// Settings panel
window.openSettingsPanel = function() {
    if (window.pushRenderSettings) window.pushRenderSettings();
    const panel = document.getElementById('settingsPanel');
    const overlay = document.getElementById('settingsPanelOverlay');
    if (panel) panel.style.transform = 'translateX(0)';
    if (overlay) overlay.style.display = 'block';
    const un = document.getElementById('settingsUsername');
    if (un && window.S.currentUser) un.textContent = window.S.currentUser.username;
    const adminSection = document.getElementById('adminSection');
    if (adminSection) {
        if (window.S.currentUser && window.S.currentUser.username === 'asmahri') {
            adminSection.style.display = 'block';
            window.loadAdminDashboard();
        } else adminSection.style.display = 'none';
    }
};
window.closeSettingsPanel = function() {
    const panel = document.getElementById('settingsPanel');
    const overlay = document.getElementById('settingsPanelOverlay');
    if (panel) panel.style.transform = 'translateX(100%)';
    if (overlay) overlay.style.display = 'none';
};
window.toggleSettingsPanel = function() {
    if (!window.S.currentUser) { window.openAuthModal('login'); return; }
    const panel = document.getElementById('settingsPanel');
    if (!panel) return;
    const isOpen = panel.style.transform === 'translateX(0px)' || panel.style.transform === 'translateX(0)';
    if (isOpen) window.closeSettingsPanel(); else { window.openSettingsPanel(); window.loadUserProfile(); }
};

// Toast
window.showToast = function(message, type = 'info', duration = 4000) {
    const toast = document.createElement('div');
    const color = type === 'danger' ? 'var(--danger)' : type === 'success' ? 'var(--success)' : 'var(--accent)';
    toast.style.cssText = `position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:var(--bg-card);border:1px solid ${color};border-radius:10px;padding:10px 16px;font-size:.8rem;color:var(--text-main);z-index:9999;box-shadow:0 4px 20px rgba(0,0,0,.3);max-width:320px;text-align:center;animation:fadeInUp .3s ease;`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), duration);
};

// Handoff polling (stubs – actual implementation in app.js)
window.startHandoffPolling = function() {};
window.stopHandoffPolling = function() {};
window.updateHandoffBadge = function(count) { window.S.pendingHandoffCount = count || 0; window.updateAlertBadge(); };
window.injectHandoffBadge = function() {};

// Inject auth modal and settings panel HTML (called from app.js init)
window.injectAuthModal = function() {
    if (document.getElementById('authModal')) return;
    const html = `
    <div id="authModal" class="hidden" style="position:fixed;inset:0;z-index:9000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.65);backdrop-filter:blur(4px);" onclick="if(event.target===this)closeAuthModal()">
        <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:16px;padding:28px 28px 24px;width:min(360px,92vw);box-shadow:0 20px 60px rgba(0,0,0,.5);">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">
                <h2 id="authModalTitle" style="font-size:1.1rem;font-weight:700;color:var(--text-main);margin:0;">Login</h2>
                <button onclick="closeAuthModal()" style="background:none;border:none;color:var(--text-soft);font-size:1.3rem;cursor:pointer;padding:2px 6px;border-radius:6px;">✕</button>
            </div>
            <div style="display:flex;flex-direction:column;gap:12px;">
                <input id="authUsername" type="text" maxlength="20" placeholder="Username" style="background:var(--bg-elevated);border:1px solid var(--border);border-radius:8px;padding:10px 14px;color:var(--text-main);font-size:.9rem;outline:none;width:100%;box-sizing:border-box;" autocomplete="username" autocapitalize="none" spellcheck="false" onkeydown="if(event.key==='Enter')submitAuth()">
                <div id="authEmailRow" style="display:none;">
                    <input id="authEmail" type="email" placeholder="your.name@cma-cgm.com" style="background:var(--bg-elevated);border:1px solid var(--border);border-radius:8px;padding:10px 14px;color:var(--text-main);font-size:.9rem;outline:none;width:100%;box-sizing:border-box;" autocomplete="email" autocapitalize="none" spellcheck="false" onkeydown="if(event.key==='Enter')submitAuth()">
                    <div style="font-size:.7rem;color:var(--text-soft);margin-top:4px;padding-left:2px;">Company email required (@cma-cgm.com)</div>
                </div>
                <input id="authPin" type="password" maxlength="6" placeholder="PIN (4–6 digits)" style="background:var(--bg-elevated);border:1px solid var(--border);border-radius:8px;padding:10px 14px;color:var(--text-main);font-size:.9rem;outline:none;width:100%;box-sizing:border-box;letter-spacing:4px;" inputmode="numeric" autocomplete="current-password" onkeydown="if(event.key==='Enter')submitAuth()">
                <div id="authError" style="color:var(--danger);font-size:.78rem;min-height:18px;"></div>
                <button id="authSubmitBtn" onclick="submitAuth()" class="btn-primary" style="width:100%;padding:11px;font-size:.9rem;border-radius:8px;">Login</button>
            </div>
            <div style="text-align:center;margin-top:14px;">
                <button id="authToggleLink" onclick="toggleAuthMode()" style="background:none;border:none;color:var(--accent);font-size:.8rem;cursor:pointer;text-decoration:underline;">No account? Create one</button>
            </div>
        </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
};
window.injectSettingsPanel = function() {
    if (document.getElementById('settingsPanel')) return;
    const html = `
    <div id="settingsPanel" style="position:fixed;top:0;right:0;height:100%;width:min(340px,96vw);background:var(--bg-card);border-left:1px solid var(--border);z-index:8500;transform:translateX(100%);transition:transform .28s cubic-bezier(.4,0,.2,1);overflow-y:auto;display:flex;flex-direction:column;box-shadow:-8px 0 40px rgba(0,0,0,.35);">
        <div style="padding:20px 20px 0;border-bottom:1px solid var(--border);margin-bottom:16px;">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
                <span data-i18n="settingsTitle" style="font-weight:700;font-size:1rem;color:var(--text-main);">⚙️ Account Settings</span>
                <button onclick="closeSettingsPanel()" style="background:none;border:none;color:var(--text-soft);font-size:1.25rem;cursor:pointer;padding:2px 6px;border-radius:6px;">✕</button>
            </div>
            <div style="padding-bottom:14px;font-size:.82rem;color:var(--text-soft);">
                <span data-i18n="settingsLoggedIn">Logged in as</span> <strong style="color:var(--text-main);" id="settingsUsername"></strong>
            </div>
        </div>
        <div style="padding:0 20px 16px;flex:1;">
            <div data-i18n="whatsappAlerts" style="font-weight:600;font-size:.88rem;color:var(--text-main);margin-bottom:12px;">📱 WhatsApp Alerts (CallMeBot)</div>
            <div style="font-size:.76rem;color:var(--text-soft);background:var(--bg-elevated);border-radius:10px;padding:12px 14px;margin-bottom:14px;line-height:1.6;">
                <div data-i18n="cmSetupTitle" style="font-weight:600;color:var(--text-main);margin-bottom:6px;">Setup:</div>
                <div><span data-i18n="cmStep1">Save this number:</span> <strong style="color:var(--accent);font-family:var(--mono);">+34 694 25 79 52</strong></div>
                <div><span data-i18n="cmStep2">Send WhatsApp:</span> <strong style="font-family:var(--mono);">I allow callmebot to send me messages</strong></div>
                <div data-i18n="cmStep3">You'll receive your API key by WhatsApp</div>
                <div data-i18n="cmStep4">Enter your details below</div>
            </div>
            <div style="display:flex;flex-direction:column;gap:10px;">
                <input id="cmPhone" type="tel" data-i18n-placeholder="cmPhonePlaceholder" placeholder="Phone (e.g. +34612345678)" style="background:var(--bg-elevated);border:1px solid var(--border);border-radius:8px;padding:9px 12px;color:var(--text-main);font-size:.83rem;outline:none;width:100%;box-sizing:border-box;">
                <input id="cmApiKey" type="text" data-i18n-placeholder="cmApiKeyPlaceholder" placeholder="CallMeBot API Key" style="background:var(--bg-elevated);border:1px solid var(--border);border-radius:8px;padding:9px 12px;color:var(--text-main);font-size:.83rem;font-family:var(--mono);outline:none;width:100%;box-sizing:border-box;">
                <label style="display:flex;align-items:center;gap:10px;font-size:.83rem;color:var(--text-main);cursor:pointer;">
                    <input id="cmEnabled" type="checkbox" style="width:16px;height:16px;accent-color:var(--accent);">
                    <span data-i18n="cmEnableLabel">Enable WhatsApp Alerts</span>
                </label>
                <div id="cmSettingsMsg" style="font-size:.78rem;min-height:18px;"></div>
                <div style="display:flex;gap:8px;">
                    <button onclick="testCallMeBot()" class="btn-ghost" data-i18n="cmTestBtn" style="flex:1;padding:8px;font-size:.78rem;">📱 Test Alert</button>
                    <button onclick="saveCallMeBotSettings()" class="btn-primary" data-i18n="cmSaveBtn" style="flex:1;padding:8px;font-size:.78rem;">💾 Save</button>
                </div>
            </div>
        </div>
        <div style="margin-top:16px;border-top:1px solid var(--border);padding-top:14px;">
    <div data-i18n="pushTitle" style="font-weight:600;font-size:.88rem;color:var(--text-main);margin-bottom:8px;">🔔 Push Notifications</div>
    <div style="font-size:.76rem;color:var(--text-soft);background:var(--bg-elevated);border-radius:10px;padding:10px 12px;margin-bottom:12px;line-height:1.5;">
        <span data-i18n="pushDescription">Get instant alerts on this device — works even when logged out.</span>
    </div>
    <div id="pushSettingsContent">
        <div style="color:var(--text-soft);font-size:.78rem;">Loading...</div>
    </div>
</div>
        <div id="adminSection" style="display:none;padding:0 20px 16px;border-top:1px solid var(--border);margin-top:4px;">
            <div style="font-weight:600;font-size:.88rem;color:var(--accent);margin:14px 0 10px;">🛡 Admin Dashboard</div>
            <div id="adminContent" style="font-size:.78rem;color:var(--text-soft);">Loading...</div>
        </div>
        <div style="padding:16px 20px 24px;border-top:1px solid var(--border);">
            <button onclick="logout()" class="btn-danger" data-i18n="cmLogoutBtn" style="width:100%;padding:10px;font-size:.85rem;border-radius:8px;">🚪 Logout</button>
            <button onclick="deleteAccount()" class="btn-ghost" style="width:100%;padding:8px;font-size:.75rem;border-radius:8px;margin-top:6px;color:var(--danger);border-color:rgba(239,68,68,.3);">🗑 Delete Account</button>
        </div>
    </div>
    <div id="settingsPanelOverlay" onclick="closeSettingsPanel()" style="display:none;position:fixed;inset:0;z-index:8499;background:rgba(0,0,0,.4);"></div>`;
    document.body.insertAdjacentHTML('beforeend', html);
};
