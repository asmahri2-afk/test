// ═══════════════════════════════════════════════════════════════════════════════
// VESSELTRACKER v5.7 – Core Application Logic
// (SOF, Handoffs, Owners, and Admin moved to separate files)
// ═══════════════════════════════════════════════════════════════════════════════

// ── CONFIG ───────────────────────────────────────────────────────────────────
window.CONFIG = window.CONFIG || {
    WORKER_URL: '/api',
    STALE_THRESHOLD_MS: 6 * 3600000,
    CRITICAL_THRESHOLD_MS: 24 * 3600000,
    ARRIVED_THRESHOLD_NM: 30.0,
    REFRESH_INTERVAL: 5 * 60000,
};

// ── STATE ────────────────────────────────────────────────────────────────────
window.S = {
    currentUser: null,
    fleetMode: 'public',
    isApiBusy: false,
    vesselsDataMap: new Map(),
    staticCache: new Map(),
    portsData: {},
    currentSortKey: localStorage.getItem('vt_sort') || 'PRIORITY',
    currentFilter: 'ALL',
    currentAgeFilter: 'ALL',
    searchQuery: '',
    trackedImosCache: [],
    debounceTimer: null,
    refreshInterval: null,
    etaInterval: null,
    vesselToRemove: null,
    currentView: 'list',
    previousVesselStates: new Map(),
    alerts: JSON.parse(localStorage.getItem('vt_alerts') || '[]'),
    priorities: JSON.parse(localStorage.getItem('vt_priorities') || '[]'),
    sanctionedImos: new Set(),
    sanctionDetails: new Map(),
    sanctionsLoaded: false,
    weatherCache: new Map(),
    mapInstance: null,
    mapMarkers: [],
    mapInitialized: false,
    noteTimers: {},
    recentAlertKeys: new Set(),
    lastDataModified: null,
    lastImoLookupData: null,
    lastFlowRunMs: null,
    portCallsCache: new Map(),
    pendingHandoffCount: 0,
    pendingDossierCount: 0,
};

// ── DOM REFS ─────────────────────────────────────────────────────────────────
window.el = {};

// ═══════════════════════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════════════════════

window.escapeHtml = function(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
};

window.getNextScraperRun = function(fromMs) {
    const SCRAPER_START_H = 5;
    const SCRAPER_END_H   = 22;
    const base = new Date(fromMs || Date.now());
    const h = base.getUTCHours();
    const m = base.getUTCMinutes();

    if (h >= SCRAPER_START_H && h < SCRAPER_END_H) {
        const next = new Date(base);
        next.setUTCHours(h + 1, 0, 0, 0);
        if (next.getUTCHours() > SCRAPER_END_H) {
            next.setUTCDate(next.getUTCDate() + 1);
            next.setUTCHours(SCRAPER_START_H, 0, 0, 0);
        }
        return next;
    }

    const next = new Date(base);
    if (h >= SCRAPER_END_H) {
        next.setUTCDate(next.getUTCDate() + 1);
    }
    next.setUTCHours(SCRAPER_START_H, 0, 0, 0);
    return next;
};

window.formatNumber = function(num) {
    if (!num && num !== 0) return 'N/A';
    const n = Number(num);
    if (isNaN(n)) return 'N/A';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
    if (n >= 100) return n.toFixed(0);
    if (n >= 10) return n.toFixed(1);
    return n.toFixed(2);
};

window.parseAisTimestamp = function(s) {
    if (!s) return null;
    const iso = new Date(s);
    if (!isNaN(iso.getTime()) && s.includes('T')) return iso;
    const m = s.replace(' UTC', '').trim().match(/^(\w{3})\s+(\d{1,2}),\s+(\d{4})\s+(\d{2}):(\d{2})$/);
    if (m) {
        const months = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
        const mo = months[m[1]];
        if (mo === undefined) return null;
        return new Date(Date.UTC(+m[3], mo, +m[2], +m[4], +m[5]));
    }
    const m2 = s.replace(' UTC', '').trim().match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/);
    if (m2) return new Date(Date.UTC(+m2[1], +m2[2] - 1, +m2[3], +m2[4], +m2[5], +m2[6] || 0));
    return null;
};

window.formatSignalAge = function(s) {
    if (!s) return { ageText: 'N/A', ageClass: 'age-stale', rawAgeMs: Infinity };
    try {
        const dt = window.parseAisTimestamp(s);
        if (!dt) return { ageText: 'Invalid', ageClass: 'age-stale', rawAgeMs: Infinity };
        const ms = Date.now() - dt.getTime();
        const h = ms / 3600000;
        let a, c;
        if (ms < 60000) { a = i18n.get('justNow'); c = 'age-recent'; }
        else if (h < 1) { const min = Math.floor(ms / 60000); a = i18n.get('timeAgoMin').replace('{n}', min); c = min <= 30 ? 'age-recent' : 'age-moderate'; }
        else if (h < 24) { a = i18n.get('timeAgoHour').replace('{n}', h.toFixed(1)); c = h <= 3 ? 'age-recent' : 'age-moderate'; }
        else { a = i18n.get('timeAgoDay').replace('{n}', Math.floor(h / 24)); c = 'age-stale'; }
        if (ms > window.CONFIG.CRITICAL_THRESHOLD_MS) c = 'status-critical';
        return { ageText: a, ageClass: c, rawAgeMs: ms };
    } catch { return { ageText: 'Error', ageClass: 'age-stale', rawAgeMs: Infinity }; }
};

window.formatLocalTime = function(s) {
    if (!s) return 'N/A';
    try {
        const d = window.parseAisTimestamp(s) || new Date(s);
        if (isNaN(d.getTime())) return 'Invalid';
        const diff = d.getTime() - Date.now(), abs = Math.abs(diff);
        if (abs < 60000) return i18n.get('arrivingNow');
        if (diff > 0) {
            if (diff < 3600000) return i18n.get('timeInMin').replace('{n}', Math.floor(abs / 60000));
            if (diff < 86400000) return i18n.get('timeInHour').replace('{n}', Math.floor(abs / 3600000));
        } else {
            if (abs < 3600000) return i18n.get('timeAgoMin').replace('{n}', Math.floor(abs / 60000));
            if (abs < 86400000) return i18n.get('timeAgoHour').replace('{n}', Math.floor(abs / 3600000));
        }
        return d.toLocaleDateString(navigator.language, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch { return s; }
};

window.formatEtaCountdown = function(utcString) {
    if (!utcString) return null;
    try {
        const eta = window.parseAisTimestamp(utcString) || new Date(utcString);
        if (isNaN(eta.getTime())) return null;
        const diff = eta - Date.now(), abs = Math.abs(diff);
        const h = Math.floor(abs / 3600000), m = Math.floor((abs % 3600000) / 60000), s = Math.floor((abs % 60000) / 1000);
        const p = v => String(v).padStart(2, '0');
        if (abs < 60000) return { text: i18n.get('arrivingNow'), cls: 'arrived' };
        if (diff > 0) return { text: `ETA ${h > 0 ? h + 'h ' : ''}${p(m)}m ${p(s)}s`, cls: '' };
        return { text: h > 0 ? i18n.get('etaOverdue').replace('{h}', h).replace('{m}', p(m)) : i18n.get('etaOverdueMin').replace('{m}', p(m)), cls: 'overdue' };
    } catch { return null; }
};

window.startEtaCountdowns = function() {
    if (window.S.etaInterval) clearInterval(window.S.etaInterval);
    window.S.etaInterval = setInterval(() => {
        document.querySelectorAll('[data-eta]').forEach(e => {
            try {
                const r = window.formatEtaCountdown(e.getAttribute('data-eta'));
                if (r) { e.textContent = r.text; e.className = `eta-countdown ${r.cls}`; }
            } catch { }
        });
    }, 1000);
};

window.getVesselStatus = function(v) {
    if (!v || !v.name || v.sog === undefined || v.sog === null) return 'DATA PENDING';
    const sog = parseFloat(v.sog), dd = parseFloat(v.destination_distance_nm), nd = parseFloat(v.nearest_distance_nm), dest = (v.destination || '').toUpperCase();
    if (sog <= 1.0) {
        if (['ANCHOR', 'ANCH.', 'ANCHORAGE', 'ANCHORING', 'AT ANCHOR'].some(k => dest.includes(k))) return 'AT ANCHOR';
        if ((!isNaN(dd) && dd <= window.CONFIG.ARRIVED_THRESHOLD_NM) || (!isNaN(nd) && nd <= window.CONFIG.ARRIVED_THRESHOLD_NM)) return 'AT PORT';
        return 'STALLED';
    }
    return 'UNDERWAY';
};

window.getStatusLabel = function(status) {
    const map = { 'UNDERWAY': 'statusUnderway', 'AT PORT': 'statusAtPort', 'AT ANCHOR': 'statusAtAnchor', 'STALLED': 'statusStalled', 'DATA PENDING': 'statusPending' };
    return i18n.get(map[status] || 'statusPending');
};

window.parseNum = function(val) {
    if (val === null || val === undefined || val === '-') return null;
    const n = parseFloat(String(val));
    return isNaN(n) ? null : n;
};

window.isPriority = function(imo) { return window.S.priorities.includes(imo); };

window.validateIMO = function(imo) {
    if (!/^\d{7}$/.test(imo)) return false;
    const digits = imo.split('').map(Number);
    const check = digits.slice(0, 6).reduce((sum, d, i) => sum + d * (7 - i), 0) % 10;
    return check === digits[6];
};

// ═══════════════════════════════════════════════════════════════════════════════
// PORT HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

window.getPortDepthInfo = function(portName) {
    if (!portName) return null;
    const port = window.S.portsData[portName.trim().toUpperCase()];
    if (!port) return null;
    const fmt = v => (v && v !== 0) ? `${Number(v).toFixed(1)}m` : 'N/A';
    return { anchor: fmt(port.anchorage_depth), pier: fmt(port.cargo_pier_depth) };
};

window.getPortCompatibility = function(draughtStr, lat, lon) {
    const match = String(draughtStr || '').match(/(\d+\.?\d*)/);
    if (!match) return null;
    const draught = parseFloat(match[1]);
    if (lat == null || lon == null || !window.S.portsData) return null;

    const hav = (la1, lo1, la2, lo2) => {
        const R = 3440.065;
        const toRad = d => d * Math.PI / 180;
        const dLat = toRad(la2 - la1);
        const dLon = toRad(lo2 - lo1);
        const a = Math.sin(dLat / 2) ** 2 +
                  Math.cos(toRad(la1)) * Math.cos(toRad(la2)) * Math.sin(dLon / 2) ** 2;
        return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
    };

    const candidates = [];
    for (const [key, info] of Object.entries(window.S.portsData)) {
        if (!info || info.lat == null || info.lon == null) continue;
        const hasPier   = info.cargo_pier_depth != null && info.cargo_pier_depth > 0;
        const hasAnchor = info.anchorage_depth  != null && info.anchorage_depth  > 0;
        if (!hasPier && !hasAnchor) continue;
        candidates.push({
            name: info.name || key,
            info,
            dist: hav(Number(lat), Number(lon), Number(info.lat), Number(info.lon))
        });
    }
    if (!candidates.length) return null;

    candidates.sort((a, b) => a.dist - b.dist);

    return candidates.slice(0, 3).map(p => {
        const pier   = p.info.cargo_pier_depth || 0;
        const anchor = p.info.anchorage_depth  || 0;
        let status;
        if (draught <= pier - 1)      status = 'ok';
        else if (draught <= pier)     status = 'marginal';
        else if (draught <= anchor)   status = 'anchor-only';
        else                          status = 'incompatible';
        return {
            name: p.name,
            status,
            pierDepth: pier,
            anchorDepth: anchor,
            draught,
            distanceNm: p.dist
        };
    });
};

// ═══════════════════════════════════════════════════════════════════════════════
// WEATHER
// ═══════════════════════════════════════════════════════════════════════════════

const _weatherPending = new Set();

window.fetchAndRenderWeather = async function(imo, lat, lon) {
    if (!lat || !lon) return;
    const container = document.getElementById(`weather-${imo}`);
    if (!container) return;
    const cached = window.S.weatherCache.get(imo);
    if (cached && Date.now() - cached.ts < 30 * 60000) {
        const p = [];
        if (cached.wave != null) p.push(`<span class="tag weather" title="${i18n.get('tipWaveHeight')}">🌊 ${Number(cached.wave).toFixed(1)}m</span>`);
        if (cached.wind != null) p.push(`<span class="tag weather" title="${i18n.get('tipWindSpeed')}">💨 ${Number(cached.wind).toFixed(0)}kn</span>`);
        if (p.length) container.innerHTML = p.join('');
        return;
    }
    if (_weatherPending.has(imo)) return;
    _weatherPending.add(imo);
    try {
        const wr = await window.fetchWithTimeout(
            `${window.CONFIG.WORKER_URL}/weather?lat=${lat}&lon=${lon}`, {}, 8000
        );
        const data = await wr.json();
        const result = { wave: data.wave ?? null, wind: data.wind ?? null, ts: Date.now() };
        window.S.weatherCache.set(imo, result);
        const c2 = document.getElementById(`weather-${imo}`);
        if (!c2) return;
        const p = [];
        if (result.wave != null) p.push(`<span class="tag weather" title="${i18n.get('tipWaveHeight')}">🌊 ${Number(result.wave).toFixed(1)}m</span>`);
        if (result.wind != null) p.push(`<span class="tag weather" title="${i18n.get('tipWindSpeed')}">💨 ${Number(result.wind).toFixed(0)}kn</span>`);
        if (p.length) c2.innerHTML = p.join('');
    } catch (e) {
        console.warn(`Weather fetch failed for ${imo}:`, e.message);
    } finally {
        _weatherPending.delete(imo);
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
// ALERTS
// ═══════════════════════════════════════════════════════════════════════════════

window.pushAlert = function(type, imo, vessel, msg) {
    const icons = { stalled: '🔴', arrived: '⚓', stale: '📡', approaching: '🎯', added: '➕', removed: '➖', sanctioned: '🚨', priority: '🚩' };
    if (type === 'sanctioned' && window.S.alerts.some(a => a.type === 'sanctioned' && a.imo === imo)) return;
    const dedupTypes = ['stalled', 'arrived', 'stale', 'approaching'];
    if (dedupTypes.includes(type)) {
        const key = `${type}:${imo}`;
        if (window.S.recentAlertKeys.has(key)) return;
        window.S.recentAlertKeys.add(key);
        setTimeout(() => window.S.recentAlertKeys.delete(key), 30 * 60 * 1000);
    }
    window.S.alerts.unshift({ id: Date.now() + Math.random(), type, imo, vessel, msg, icon: icons[type] || '•', time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), read: false });
    if (window.S.alerts.length > 60) window.S.alerts.pop();
    localStorage.setItem('vt_alerts', JSON.stringify(window.S.alerts));
    window.renderAlerts();
    window.updateAlertBadge();
};

window.renderAlerts = function() {
    if (!window.S.alerts.length) { window.el.alertList.innerHTML = `<div class="alert-empty">${i18n.get('alertMonitoring')}</div>`; return; }
    window.el.alertList.innerHTML = window.S.alerts.map(a => `
        <div class="alert-item ${a.read ? '' : 'unread'} type-${a.type}">
            <div><span style="margin-right:4px;">${a.icon}</span><span class="alert-msg">${window.escapeHtml(a.msg)}</span></div>
            <div class="alert-time">${a.time} · IMO ${a.imo}</div>
        </div>
    `).join('');
};

window.updateAlertBadge = function() {
    const alertsUnread = window.S.alerts.filter(a => !a.read).length;
    const handoffs = window.S.pendingHandoffCount || 0;
    const dossiers = window.S.pendingDossierCount || 0;
    const n = alertsUnread + handoffs + dossiers;
    [window.el.alertBadge, window.el.navBadge].forEach(b => {
        if (!b) return;
        b.textContent = n > 9 ? '9+' : n;
        b.classList.toggle('hidden', n === 0);
    });
};

window.handleBellClick = function() {
    if ((window.S.pendingHandoffCount || 0) > 0) {
        if (window.checkAndShowHandoffs) window.checkAndShowHandoffs(true);
    } else if ((window.S.pendingDossierCount || 0) > 0) {
        if (window._chkPending) window._chkPending(true);
    } else {
        window.toggleAlertPanel();
    }
};

window.toggleAlertPanel = function() {
    const open = window.el.alertPanel.classList.toggle('open');
    window.el.alertOverlay.classList.toggle('show', open);
    if (open) window.markAllAlertsRead();
};

window.closeAlertPanel = function() { window.el.alertPanel.classList.remove('open'); window.el.alertOverlay.classList.remove('show'); };
window.markAllAlertsRead = function() { window.S.alerts.forEach(a => a.read = true); localStorage.setItem('vt_alerts', JSON.stringify(window.S.alerts)); window.renderAlerts(); window.updateAlertBadge(); };
window.clearAlerts = function() { window.S.alerts = []; localStorage.setItem('vt_alerts', JSON.stringify(window.S.alerts)); window.renderAlerts(); window.updateAlertBadge(); };

// ═══════════════════════════════════════════════════════════════════════════════
// SANCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

window.loadSanctionsLists = async function() {
    try {
        const res = await window.fetchWithTimeout(`${window.CONFIG.WORKER_URL}/data/sanctions`, {}, 12000);
        if (!res.ok) throw new Error(`Sanctions fetch failed: ${res.status}`);
        const entries = await res.json();
        const dmap = new Map();
        entries.forEach(e => {
            const imo = String(e.imo).replace(/\D/g, '');
            if (!dmap.has(imo)) dmap.set(imo, []);
            const lists = Array.isArray(e.lists) ? e.lists.join(', ') : e.lists || 'Unknown';
            dmap.get(imo).push({ list: lists, name: e.name || `IMO ${imo}`, reason: e.program || '' });
        });
        window.S.sanctionedImos = new Set(dmap.keys());
        window.S.sanctionDetails = dmap;
        window.S.sanctionsLoaded = true;
        const html = `<span style="color:var(--success);font-size:.68rem;font-family:var(--mono);">✓ ${i18n.get('monitoringSanctioned').replace('{n}', window.S.sanctionedImos.size.toLocaleString())}</span>`;
        if (window.el.sanctionsStatus) window.el.sanctionsStatus.innerHTML = html;
        const inline = document.getElementById('sanctionsStatusInline');
        if (inline) inline.innerHTML = html;
        window.checkFleetSanctions();
    } catch (e) {
        console.warn('Sanctions load failed:', e.message);
        window.S.sanctionsLoaded = true;
        const html = `<span style="color:var(--warning);font-size:.68rem;font-family:var(--mono);">${i18n.get('sanctionsUnavailable')}</span>`;
        if (window.el.sanctionsStatus) window.el.sanctionsStatus.innerHTML = html;
    }
};

window.checkFleetSanctions = function() {
    if (!window.S.sanctionsLoaded) return;
    let found = false;
    for (const imo of window.S.trackedImosCache) {
        if (window.S.sanctionedImos.has(imo) && !window.S.alerts.some(a => a.type === 'sanctioned' && a.imo === imo)) {
            found = true;
            const d = window.S.sanctionDetails.get(imo) || [];
            const lists = [...new Set(d.map(x => x.list))].join(', ');
            const v = window.S.vesselsDataMap.get(imo);
            window.pushAlert('sanctioned', imo, v?.name || `IMO ${imo}`, i18n.get('sanctionedAlert').replace('{name}', v?.name || 'IMO ' + imo).replace('{lists}', lists || i18n.get('sanctionsList')));
        }
    }
    if (found) { window.renderVessels(window.S.trackedImosCache); window.updateFleetKPI(window.S.trackedImosCache); }
};

// ═══════════════════════════════════════════════════════════════════════════════
// STORAGE
// ═══════════════════════════════════════════════════════════════════════════════

window.saveToLocalStorage = function() {
    try {
        localStorage.setItem('vt_cache', JSON.stringify({ vessels: Array.from(window.S.vesselsDataMap.entries()), tracked: window.S.trackedImosCache, timestamp: Date.now() }));
    } catch (e) { console.warn(e); }
};

window.loadCachedData = function(allowStale = false) {
    try {
        const raw = localStorage.getItem('vt_cache');
        if (!raw) return false;
        const data = JSON.parse(raw);
        const maxAge = allowStale ? 86400000 : 3600000;
        if (Date.now() - data.timestamp > maxAge) return false;
        window.S.vesselsDataMap = new Map(data.vessels || []);
        window.S.trackedImosCache = data.tracked || [];
        if (window.S.trackedImosCache.length > 0) { window.renderVessels(window.S.trackedImosCache); return true; }
    } catch (e) { console.warn(e); }
    return false;
};

window.getNotes = function(imo) { return localStorage.getItem(`vt_notes_${imo}`) || ''; };

window.saveNotes = function(imo, text) {
    localStorage.setItem(`vt_notes_${imo}`, text);
    const s = document.getElementById(`notes-saved-${imo}`);
    if (s) { s.classList.add('show'); setTimeout(() => s.classList.remove('show'), 1800); }
};

window.onNoteInput = function(imo, ta) {
    clearTimeout(window.S.noteTimers[imo]);
    window.S.noteTimers[imo] = setTimeout(() => window.saveNotes(imo, ta.value), 600);
};

window.togglePriority = function(imo) {
    if (window.isPriority(imo)) window.S.priorities = window.S.priorities.filter(x => x !== imo);
    else {
        window.S.priorities.push(imo);
        const vname = window.S.vesselsDataMap.get(imo)?.name || window.S.staticCache.get(imo)?.name || `IMO ${imo}`;
        window.pushAlert('priority', imo, vname, i18n.get('alertPriorityName').replace('{name}', vname));
    }
    localStorage.setItem('vt_priorities', JSON.stringify(window.S.priorities));
    window.renderVessels(window.S.trackedImosCache);
};

window.toggleDetails = function(imo) {
    const exp = document.getElementById(`details-${imo}`);
    if (exp) exp.classList.toggle('open');
};

window.showLoading = function(msg = 'Loading...') { if (window.el.loadingText) window.el.loadingText.textContent = msg; if (window.el.loadingOverlay) window.el.loadingOverlay.classList.remove('hidden'); };
window.hideLoading = function() { if (window.el.loadingOverlay) window.el.loadingOverlay.classList.add('hidden'); };

window.updateStatus = function(msg, type = 'info') {
    if (!window.el.statusMsg) return;
    window.el.statusMsg.textContent = msg;
    window.el.statusMsg.className = `status-msg ${type === 'info' ? '' : type}`;
    if (type === 'success') setTimeout(() => { if (window.el.statusMsg.textContent === msg) { window.el.statusMsg.textContent = i18n.get('ready'); window.el.statusMsg.className = 'status-msg'; } }, 5000);
};

// ═══════════════════════════════════════════════════════════════════════════════
// API & NETWORK
// ═══════════════════════════════════════════════════════════════════════════════

window.fetchWithTimeout = async function(url, options = {}, timeout = 8000) {
    const ctrl = new AbortController();
    const id = setTimeout(() => ctrl.abort(), timeout);
    try {
        const r = await fetch(url, { ...options, signal: ctrl.signal });
        clearTimeout(id);
        if (r.status === 401 && url.includes(window.CONFIG.WORKER_URL) && window.S.currentUser) {
            console.warn('[Auth] 401 from Worker — session expired, logging out');
            window.clearSession();
            window.S.fleetMode = 'public';
            window.updateAuthIcon();
            if (window.el.addCard) window.el.addCard.classList.add('hidden');
            if (window.stopHandoffPolling) window.stopHandoffPolling();
            window.updateHandoffBadge(0);
            window.loadData();
            setTimeout(() => {
                window.showToast('🔒 Session expired — please login again', 'danger', 5000);
                setTimeout(() => window.openAuthModal('login'), 1500);
            }, 300);
        }
        return r;
    }
    catch (e) { clearTimeout(id); throw e; }
};

window.checkApiStatus = async function() {
    try {
        await window.fetchWithTimeout(`${window.CONFIG.WORKER_URL}/ping`, { method: 'GET' }, 5000);
        const s = i18n.get('apiOnline');
        const css = 'border-color:rgba(16,185,129,.4);color:var(--success);';
        if (window.el.apiStatus) { window.el.apiStatus.textContent = s; window.el.apiStatus.style.cssText = css; }
        if (window.el.apiStatusCard) { window.el.apiStatusCard.textContent = s; window.el.apiStatusCard.style.cssText = css; }
    } catch {
        const s = i18n.get('apiOffline');
        const css = 'border-color:rgba(239,68,68,.4);color:var(--danger);';
        if (window.el.apiStatus) { window.el.apiStatus.textContent = s; window.el.apiStatus.style.cssText = css; }
        if (window.el.apiStatusCard) { window.el.apiStatusCard.textContent = s; window.el.apiStatusCard.style.cssText = css; }
    }
};

window.updateLastModified = function(date) {
    if (!date) return;
    window.S.lastDataModified = date;
    const locale = i18n.currentLang === 'FR' ? 'fr-FR' : 'en-US';
    const fmt = date.toLocaleString(locale, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    if (window.el.lastUpdatedTime) window.el.lastUpdatedTime.textContent = fmt;
    if (window.el.lastUpdatedLabel) window.el.lastUpdatedLabel.textContent = `${i18n.get('lastUpdate')}: ${fmt}`;
};

window.updateStaticCache = async function(imo, vd) {
    const name = vd.vessel_name || vd.name || `IMO ${imo}`;
    const entry = {
        imo, name,
        flag:             vd.flag             || '-',
        ship_type:        vd.ship_type         || vd['Type of ship'] || '-',
        length_overall_m: window.parseNum(vd.length_overall_m) ?? '-',
        beam_m:           window.parseNum(vd.beam_m)            ?? '-',
        deadweight_t:     window.parseNum(vd.deadweight_t)      ?? window.parseNum(vd['DWT']) ?? '-',
        gross_tonnage:    window.parseNum(vd.gross_tonnage)     ?? window.parseNum(vd['Gross tonnage']) ?? '-',
        year_of_build:    window.parseNum(vd.year_of_build)     ?? window.parseNum(vd['Year of build']) ?? '-',
        draught_m:        window.parseNum(vd.draught_m)         ?? '-',
        mmsi:             vd.mmsi || vd['MMSI']           || null,
        equasis_owner:    vd.equasis_owner                || null,
        equasis_address:  vd.equasis_address              || null,
        pi_club:          vd.pi_club                      || null,
        call_sign:        vd.call_sign || vd['Call Sign'] || null,
        class_society:    vd.class_society                || null,
    };
    window.S.staticCache.set(imo, entry);

    try {
        const headers = { 'Content-Type': 'application/json' };
        if (window.S.currentUser?.access_token) headers['Authorization'] = `Bearer ${window.S.currentUser.access_token}`;
        await window.fetchWithTimeout(`${window.CONFIG.WORKER_URL}/vessel/cache`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                imo:              String(imo),
                name,
                ship_type:        vd.ship_type || vd['Type of ship'] || null,
                flag:             vd.flag       || null,
                deadweight_t:     window.parseNum(vd.deadweight_t)  ?? window.parseNum(vd['DWT']),
                gross_tonnage:    window.parseNum(vd.gross_tonnage) ?? window.parseNum(vd['Gross tonnage']),
                year_of_build:    window.parseNum(vd.year_of_build) ?? window.parseNum(vd['Year of build']),
                length_overall_m: window.parseNum(vd.length_overall_m),
                beam_m:           window.parseNum(vd.beam_m),
                draught_m:        window.parseNum(vd.draught_m),
                mmsi:             vd.mmsi || vd['MMSI']    || null,
                equasis_owner:    vd.equasis_owner          || null,
                equasis_address:  vd.equasis_address        || null,
                pi_club:          vd.pi_club                || null,
                call_sign:        vd.call_sign || vd['Call Sign'] || null,
                class_society:    vd.class_society          || null,
            }),
        }, 10000);
    } catch (err) {
        console.warn(`Failed to push static cache for IMO ${imo}:`, err);
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
// LOAD DATA
// ═══════════════════════════════════════════════════════════════════════════════

window.renderSkeletons = function(count = 3) {
    if (!window.el.vesselsContainer) return;
    const card = () => `
        <div class="vessel-card skeleton-card">
            <div class="vessel-card-inner">
                <div class="vessel-main" style="pointer-events:none;">
                    <div class="vessel-top" style="margin-bottom:10px;">
                        <div style="display:flex;align-items:center;gap:7px;flex:1;">
                            <span class="sk sk-circle"></span>
                            <div style="flex:1;">
                                <span class="sk sk-line" style="width:55%;display:block;"></span>
                                <span class="sk sk-line" style="width:28%;margin-bottom:0;display:block;"></span>
                            </div>
                        </div>
                        <span class="sk sk-badge"></span>
                    </div>
                    <div class="vessel-meta">
                        <span class="sk sk-line" style="width:80%;display:block;"></span>
                        <span class="sk sk-line" style="width:65%;display:block;"></span>
                        <span class="sk sk-line" style="width:75%;display:block;"></span>
                        <span class="sk sk-line" style="width:50%;margin-bottom:0;display:block;"></span>
                    </div>
                    <div class="tag-row" style="margin-top:10px;">
                        <span class="sk sk-tag"></span>
                        <span class="sk sk-tag"></span>
                        <span class="sk sk-tag"></span>
                    </div>
                </div>
            </div>
        </div>`;
    window.el.vesselsContainer.innerHTML = Array(count).fill(0).map(card).join('');
};

window.loadData = async function() {
    if (window.S.isApiBusy) return;

    if (!window.S.currentUser) {
        window.S.trackedImosCache = [];
        window.S.vesselsDataMap = new Map();
        window.renderVessels([]);
        window.updateFleetKPI([]);
        window.hideLoading();
        return;
    }

    window.S.isApiBusy = true;
    if (window.el.refreshButton) window.el.refreshButton.disabled = true;
    window.updateStatus(i18n.get('refreshing'), 'info');

    const hasCachedVessels = window.S.trackedImosCache.length > 0;
    if (!hasCachedVessels && window.el.vesselsContainer) {
        window.renderSkeletons(3);
    }

    const safetyTimer = setTimeout(() => {
        console.warn('[loadData] Force hiding loading overlay after 15s');
        window.hideLoading();
    }, 15000);

    try {
        const headers = {};
        if (window.S.currentUser?.access_token) {
            headers['Authorization'] = `Bearer ${window.S.currentUser.access_token}`;
        }
        const res = await window.fetchWithTimeout(
            `${window.CONFIG.WORKER_URL}/data/load`,
            { headers },
            15000
        );
        if (!res.ok) throw new Error(`Worker /data/load failed: ${res.status}`);
        const { tracked: trackedRows, vessels: vesselRows, cache: cacheRows, ports: portsRows } = await res.json();

        const tracked = trackedRows.map(r => String(r.imo));
        window.S.trackedImosCache = tracked;

        const nm = new Map();
        vesselRows.forEach(v => nm.set(String(v.imo), v));
        window.S.vesselsDataMap = nm;

        window.S.staticCache = new Map(cacheRows.map(r => [String(r.imo), r]));

        window.S.portsData = {};
        portsRows.forEach(p => { window.S.portsData[p.name.toUpperCase()] = p; });

        const dates = vesselRows.map(v => v.updated_at).filter(Boolean).map(d => new Date(d));
        const lastMod = dates.length ? new Date(Math.max(...dates)) : new Date();
        window.updateLastModified(lastMod);

        window.S.lastFlowRunMs = dates.length ? Math.max(...dates.map(d => d.getTime())) : null;

        window.saveToLocalStorage();
        window.generateAlerts(nm, tracked);
        window.updateAlertBadge();
        window.updateSystemHealth(lastMod.getTime(), vesselRows.length, 'worker');
        window.updateFleetKPI(tracked);
        if (window.el.vesselCount) window.el.vesselCount.textContent = tracked.length === 1 ? i18n.get('vesselTrackedSingle') : i18n.get('vesselTracked').replace('{n}', tracked.length);
        if (window.el.dataStats) window.el.dataStats.textContent = `${vesselRows.length} ${i18n.get('inDatabase')} · worker`;
        window.renderVessels(window.S.trackedImosCache);
        if (window.S.mapInitialized) window.updateMapMarkers();
        window.updateStatus(`${i18n.get('fleetLoaded')} — ${tracked.length} ${i18n.get('vessels')}`, 'success');
        if (window.loadVesselOwners) window.loadVesselOwners();

    } catch (err) {
        console.error('[loadData] Error:', err);
        const gotCache = window.loadCachedData(true);
        if (gotCache) {
            window.updateStatus(i18n.get('cachedDataMsg') + ' — ' + err.message, 'warning');
        } else {
            window.updateStatus(`Load failed: ${err.message}`, 'error');
            if (window.el.vesselsContainer) window.el.vesselsContainer.innerHTML = `
                <div class="empty-state">
                    <div class="icon">⚠️</div>
                    <p style="color:var(--danger);margin-bottom:6px;">${window.escapeHtml(err.message)}</p>
                    <small style="display:block;margin-bottom:16px;">Check your connection or try again</small>
                    <button class="btn-primary" onclick="loadData()" style="font-size:.78rem;padding:8px 18px;">
                        🔄 Retry
                    </button>
                </div>`;
        }
    } finally {
        clearTimeout(safetyTimer);
        window.S.isApiBusy = false;
        if (window.el.refreshButton) window.el.refreshButton.disabled = false;
        window.hideLoading();
    }
};

window.generateAlerts = function(newMap, trackedImos) {
    const isFirst = window.S.previousVesselStates.size === 0;
    for (const imo of trackedImos) {
        const v = newMap.get(imo);
        if (!v) continue;
        const ns = window.getVesselStatus(v), prev = window.S.previousVesselStates.get(imo), age = window.formatSignalAge(v.last_pos_utc);
        if (!isFirst && prev) {
            if (prev.status !== ns) {
                if (ns === 'STALLED') window.pushAlert('stalled', imo, v.name, i18n.get('alertStalled').replace('{name}', v.name || 'IMO ' + imo));
                if (ns === 'AT PORT') window.pushAlert('arrived', imo, v.name, i18n.get('alertArrivedPort').replace('{name}', v.name || 'IMO ' + imo));
                if (ns === 'AT ANCHOR') window.pushAlert('arrived', imo, v.name, i18n.get('alertAtAnchor').replace('{name}', v.name || 'IMO ' + imo));
            }
            if (age.rawAgeMs > window.CONFIG.STALE_THRESHOLD_MS && prev.signalAgeMs <= window.CONFIG.STALE_THRESHOLD_MS) window.pushAlert('stale', imo, v.name, i18n.get('alertSignalLost').replace('{name}', v.name || 'IMO ' + imo).replace('{age}', age.ageText));
            const dd = parseFloat(v.destination_distance_nm);
            if (!isNaN(dd) && dd <= 50 && (prev.destDist == null || prev.destDist > 50)) window.pushAlert('approaching', imo, v.name, i18n.get('alertApproaching').replace('{name}', v.name || 'IMO ' + imo).replace('{dist}', dd.toFixed(0)));
        }
        window.S.previousVesselStates.set(imo, { status: ns, signalAgeMs: age.rawAgeMs, destDist: parseFloat(v.destination_distance_nm) || null });
    }
    if (window.S.sanctionsLoaded) window.checkFleetSanctions();
};

window.updateSystemHealth = function(lastMod, count, source) {
    if (!lastMod) { if (window.el.systemHealth) window.el.systemHealth.textContent = i18n.get('unknown'); return; }
    const ms = Date.now() - lastMod;
    let text, color, bg;
    if (ms < 3600000) { text = i18n.get('healthExcellent'); color = 'var(--success)'; bg = 'rgba(16,185,129,.12)'; }
    else if (ms < window.CONFIG.STALE_THRESHOLD_MS) { text = i18n.get('healthGood'); color = 'var(--warning)'; bg = 'rgba(245,158,11,.12)'; }
    else if (ms < window.CONFIG.CRITICAL_THRESHOLD_MS) { text = i18n.get('healthStale'); color = '#f97316'; bg = 'rgba(249,115,22,.12)'; }
    else { text = i18n.get('healthCritical'); color = 'var(--danger)'; bg = 'rgba(239,68,68,.12)'; }
    if (window.el.systemHealth) { window.el.systemHealth.textContent = text; window.el.systemHealth.style.cssText = `color:${color};background:${bg};border-color:${color}40;`; }
};

window.updateFleetKPI = function(tracked) {
    let uw = 0, ap = 0, aa = 0, st = 0, sanc = 0, totalAgeMs = 0, validAge = 0;
    for (const imo of tracked) {
        const v = window.S.vesselsDataMap.get(imo);
        if (!v) continue;
        const s = window.getVesselStatus(v);
        if (s === 'UNDERWAY') uw++;
        else if (s === 'AT PORT') ap++;
        else if (s === 'AT ANCHOR') aa++;
        else if (s === 'STALLED') st++;
        if (window.S.sanctionedImos.has(imo)) sanc++;
        const a = window.formatSignalAge(v.last_pos_utc);
        if (a.rawAgeMs !== Infinity) { totalAgeMs += a.rawAgeMs; validAge++; }
    }
    if (window.el.kpiTotal) window.el.kpiTotal.textContent = tracked.length;
    if (window.el.kpiUnderway) window.el.kpiUnderway.textContent = uw;
    if (window.el.kpiAtPort) window.el.kpiAtPort.textContent = ap;
    if (window.el.kpiAtAnchor) window.el.kpiAtAnchor.textContent = aa;
    if (window.el.kpiStalled) window.el.kpiStalled.textContent = st;
    if (window.el.kpiSanctioned) window.el.kpiSanctioned.textContent = sanc;
    const hs = tracked.length > 0 ? Math.round(((uw + ap + aa) / tracked.length) * 100) : 100;
    if (window.el.kpiHealth) {
        window.el.kpiHealth.textContent = `${hs}%`;
        window.el.kpiHealth.className = `kpi-value ${hs >= 80 ? 'green' : hs >= 50 ? 'yellow' : 'red'}`;
    }
    if (window.el.kpiHealthFill) {
        window.el.kpiHealthFill.style.width = `${hs}%`;
        window.el.kpiHealthFill.style.background = hs >= 80 ? 'var(--success)' : hs >= 50 ? 'var(--warning)' : 'var(--danger)';
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
// FILTER & SORT
// ═══════════════════════════════════════════════════════════════════════════════

window.passesFilter = function(imo, v, status) {
    const q = window.S.searchQuery;
    if (q && !(v?.name || '').toLowerCase().includes(q) && !imo.includes(q)) return false;
    const f = window.S.currentFilter;
    if (f === 'ALL') return true;
    if (f === 'PRIORITY') return window.isPriority(imo);
    if (f === 'SANCTIONED') return window.S.sanctionedImos.has(imo);
    return status === f;
};

window.passesAgeFilter = function(ageData) {
    if (window.S.currentAgeFilter === 'ALL') return true;
    const h = ageData.rawAgeMs / 3600000;
    if (window.S.currentAgeFilter === '1H') return h <= 1;
    if (window.S.currentAgeFilter === '6H') return h <= 6;
    if (window.S.currentAgeFilter === '24H') return h <= 24;
    if (window.S.currentAgeFilter === 'STALE') return h > 24;
    return true;
};

window.setFilter = function(value, chip) {
    window.S.currentFilter = value;
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    if (chip) chip.classList.add('active');
    window.renderVessels(window.S.trackedImosCache);
};

window.applyMobileFilters = function() {
    if (window.el.sortSelectMobile) {
        window.S.currentSortKey = window.el.sortSelectMobile.value;
        localStorage.setItem('vt_sort', window.S.currentSortKey);
        if (window.el.sortSelect) window.el.sortSelect.value = window.S.currentSortKey;
    }
    if (window.el.ageFilterMobile) {
        window.S.currentAgeFilter = window.el.ageFilterMobile.value;
        if (window.el.ageFilter) window.el.ageFilter.value = window.S.currentAgeFilter;
    }
    const fs = document.getElementById('mobileFilterSheet'); if (fs) { fs.classList.remove('show'); fs.style.display = ''; }
    window.renderVessels(window.S.trackedImosCache);
};

window.closeMobileFilter = function(e) {
    if (e.target === e.currentTarget) window.closeFilterMenu();
};

// ═══════════════════════════════════════════════════════════════════════════════
// VESSEL MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

window.addVessel = async function() {
    const imo = window.el.imoInput.value.trim();
    if (!imo || !/^\d{7}$/.test(imo)) { window.updateStatus(i18n.get('statusInvalidDigits'), 'error'); return; }
    if (!window.validateIMO(imo)) { window.updateStatus(i18n.get('statusInvalidCheck'), 'error'); return; }
    if (window.S.trackedImosCache.includes(imo)) { window.updateStatus(i18n.get('statusAlreadyTracked'), 'warning'); return; }
    if (window.S.isApiBusy) return;
    window.showLoading(i18n.get('addingImo').replace('{imo}', imo));

    let apiData = (window.S.lastImoLookupData && String(window.S.lastImoLookupData.imo) === imo)
        ? window.S.lastImoLookupData
        : window.S.staticCache.get(imo) || null;

    if (!apiData) {
        try {
            const headers = window.S.currentUser?.access_token ? { 'Authorization': `Bearer ${window.S.currentUser.access_token}` } : {};
            const r = await window.fetchWithTimeout(`${window.CONFIG.WORKER_URL}/vessel/preview/${imo}`, { headers }, 20000);
            if (r.ok) { const d = await r.json(); if (d && d.found !== false) apiData = d; }
        } catch (e) { console.warn('Pre-add lookup failed:', e); }
    }

    await window.updateTrackedImos(imo, true, apiData);

    const vesselName = apiData?.vessel_name || apiData?.name || imo;
    window.pushAlert('added', imo, vesselName, i18n.get('alertAdded').replace('{imo}', imo));
    if (window.S.sanctionsLoaded && window.S.sanctionedImos.has(imo)) {
        const d = window.S.sanctionDetails.get(imo) || [];
        window.pushAlert('sanctioned', imo, vesselName, i18n.get('alertSanctioned').replace('{imo}', imo).replace('{lists}', [...new Set(d.map(x => x.list))].join(', ') || i18n.get('sanctionsList')));
    }
    window.S.lastImoLookupData = null;
    window.hideLoading();
};

window.removeIMO = function(imo) {
    const name = window.S.vesselsDataMap.get(imo)?.name || `IMO ${imo}`;
    if (window.el.confirmText) window.el.confirmText.textContent = i18n.get('removeConfirm').replace('{name}', name).replace('{imo}', imo);
    if (window.el.confirmModal) window.el.confirmModal.classList.remove('hidden');
    window.S.vesselToRemove = imo;
};

window.removeIMOConfirmed = async function(imo) {
    window.showLoading(i18n.get('removingImo').replace('{imo}', imo));
    const vname = window.S.vesselsDataMap.get(imo)?.name || window.S.staticCache.get(imo)?.name || `IMO ${imo}`;
    // Clean up note timer to prevent memory leak
    if (window.S.noteTimers[imo]) { clearTimeout(window.S.noteTimers[imo]); delete window.S.noteTimers[imo]; }
    await window.updateTrackedImos(imo, false);
    window.pushAlert('removed', imo, vname, i18n.get('alertRemovedFull').replace('{name}', vname).replace('{imo}', imo));
    window.hideLoading();
};

window.updateTrackedImos = async function(imo, isAdd, apiData = null) {
    window.S.isApiBusy = true;
    if (window.el.refreshButton) window.el.refreshButton.disabled = true;
    
    try {
        window.updateStatus(
            isAdd 
                ? i18n.get('addingAttempt').replace('{n}', 1) 
                : i18n.get('removingAttempt').replace('{n}', 1)
        );
        
        const endpoint = isAdd ? '/vessel/add' : '/vessel/remove';
        const authPayload = window.S.currentUser
            ? { user_token: window.S.currentUser.access_token }
            : {};
        const response = await window.fetchWithTimeout(
            `${window.CONFIG.WORKER_URL}${endpoint}`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    imo: imo,
                    ...authPayload
                })
            },
            10000
        );

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error(`[Worker] ${response.status} on ${endpoint}:`, errorData);
            if (response.status === 401 || response.status === 403)
                console.error('[Worker] Auth rejected — if not logged in, worker may require user_token. Try logging in first.');
            throw new Error(errorData.error || `Worker error ${response.status}`);
        }

        const result = await response.json();
        
        if (isAdd) {
            const nextUpdateStr = (() => {
                const base = window.S.lastFlowRunMs ? window.S.lastFlowRunMs : Date.now();
                const next = window.getNextScraperRun(base);
                const h = next.getUTCHours().toString().padStart(2,'0');
                const mins = next.getUTCMinutes().toString().padStart(2,'0');
                const isNextDay = next.getUTCDate() !== new Date().getUTCDate();
                return (isNextDay ? 'Tomorrow ' : '') + h + ':' + mins + ' UTC';
            })();
            window.updateStatus(
                `${i18n.get('addedImo').replace('{imo}', imo)} — ${i18n.get('nextUpdate')} ${nextUpdateStr}`,
                'success'
            );

            if (apiData) {
                window.updateStaticCache(imo, apiData).catch(e => console.warn('static cache on add:', e));
            }

            if (window.fetchOwner) {
                window.fetchOwner(imo).then(() => {
                    window.renderVessels(window.S.trackedImosCache);
                }).catch(() => {});
            }

            window.el.imoInput.value = '';
            window.el.namePreview.innerHTML = '';
            window.el.addBtn.disabled = true;
            
        } else {
            window.updateStatus(i18n.get('removedImo').replace('{imo}', imo), 'success');
        }
        
        await window.loadData();

    } catch (err) {
        console.error('updateTrackedImos error:', err);
        window.updateStatus(i18n.get('failed').replace('{msg}', err.message), 'error');
        window.saveToLocalStorage();
        window.renderVessels(window.S.trackedImosCache);
    } finally {
        window.S.isApiBusy = false;
        if (window.el.refreshButton) window.el.refreshButton.disabled = false;
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
// IMO INPUT + VESSEL NAME AUTOCOMPLETE
// ═══════════════════════════════════════════════════════════════════════════════

const _equasisRateLimit = { count: 0, resetAt: 0 };
function _equasisAllowed() {
    const now = Date.now();
    if (now > _equasisRateLimit.resetAt) { _equasisRateLimit.count = 0; _equasisRateLimit.resetAt = now + 60000; }
    if (_equasisRateLimit.count >= 3) return false;
    _equasisRateLimit.count++;
    return true;
}

let _acSelectedIdx = -1;
let _acResults     = [];

function _injectAutocompleteStyles() {
    if (document.getElementById('ac-styles')) return;
    const style = document.createElement('style');
    style.id = 'ac-styles';
    style.textContent = `
        .ac-wrap { position:relative; flex:1; }
        #acDropdown {
            position:fixed;
            background:var(--bg-card); border:1px solid var(--border-soft);
            border-radius:var(--radius); z-index:9999;
            box-shadow:0 8px 24px rgba(0,0,0,.55);
            max-height:280px; overflow-y:auto;
            display:none;
        }
        #acDropdown.show { display:block; }
        .ac-item {
            display:flex; align-items:center; gap:9px;
            padding:9px 12px; cursor:pointer;
            border-bottom:1px solid var(--border);
            transition:background .1s;
        }
        .ac-item:last-child { border-bottom:none; }
        .ac-item:hover, .ac-item.ac-active { background:var(--bg-elevated); }
        .ac-item img { flex-shrink:0; border:1px solid var(--border); border-radius:2px; }
        .ac-flag-ph { width:24px; height:17px; background:var(--bg-elevated); border:1px solid var(--border); border-radius:2px; flex-shrink:0; }
        .ac-name { font-size:.84rem; font-weight:700; color:var(--text-main); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; flex:1; }
        .ac-meta { font-size:.66rem; color:var(--text-soft); white-space:nowrap; }
        .ac-imo  { font-family:var(--mono); font-size:.66rem; color:var(--accent); margin-left:auto; flex-shrink:0; }
        .ac-empty { padding:10px 14px; font-size:.78rem; color:var(--text-soft); }
    `;
    document.head.appendChild(style);
}

function _getOrCreateDropdown() {
    let dd = document.getElementById('acDropdown');
    if (dd) return dd;
    dd = document.createElement('div');
    dd.id = 'acDropdown';
    dd.setAttribute('role', 'listbox');
    document.body.appendChild(dd);
    return dd;
}

function _positionDropdown() {
    const dd = document.getElementById('acDropdown');
    if (!dd || !window.el.imoInput) return;
    const rect = window.el.imoInput.getBoundingClientRect();
    dd.style.top    = `${rect.bottom + 4}px`;
    dd.style.left   = `${rect.left}px`;
    dd.style.width  = `${rect.width}px`;
}

function _showDropdown(results) {
    _acResults     = results;
    _acSelectedIdx = -1;
    const dd = _getOrCreateDropdown();
    if (!results.length) {
        dd.innerHTML = `<div class="ac-empty">No vessels found</div>`;
        _positionDropdown();
        dd.classList.add('show');
        return;
    }
    dd.innerHTML = results.map((v, i) => {
        const fc = window.getFlagCode(v.flag);
        const fh = fc
            ? `<img src="https://flagcdn.com/24x18/${fc.toLowerCase()}.png" width="24" height="17" alt="">`
            : `<div class="ac-flag-ph"></div>`;
        const meta = [v.ship_type, v.flag].filter(Boolean).join(' · ');
        return `<div class="ac-item" role="option" data-idx="${i}" onclick="_selectAcItem(${i})">
            ${fh}
            <span class="ac-name">${window.escapeHtml(v.name || 'IMO ' + v.imo)}</span>
            ${meta ? `<span class="ac-meta">${window.escapeHtml(meta)}</span>` : ''}
            <span class="ac-imo">${v.imo}</span>
        </div>`;
    }).join('');
    _positionDropdown();
    dd.classList.add('show');
}

function _hideDropdown() {
    const dd = document.getElementById('acDropdown');
    if (dd) dd.classList.remove('show');
    _acSelectedIdx = -1;
    _acResults     = [];
}

function _acMove(dir) {
    const dd = document.getElementById('acDropdown');
    if (!dd || !dd.classList.contains('show') || !_acResults.length) return;
    const items = dd.querySelectorAll('.ac-item');
    if (_acSelectedIdx >= 0) items[_acSelectedIdx]?.classList.remove('ac-active');
    _acSelectedIdx = Math.max(0, Math.min(_acResults.length - 1, _acSelectedIdx + dir));
    items[_acSelectedIdx]?.classList.add('ac-active');
    items[_acSelectedIdx]?.scrollIntoView({ block: 'nearest' });
}

function _selectAcItem(idx) {
    const v = _acResults[idx];
    if (!v) return;
    _hideDropdown();
    window.el.imoInput.value = v.imo;
    window.el.imoInput.dispatchEvent(new Event('input'));
}

async function _searchVesselsByName(query) {
    if (!window.S.currentUser?.access_token) return [];
    try {
        const r = await window.fetchWithTimeout(
            `${window.CONFIG.WORKER_URL}/vessel/search?q=${encodeURIComponent(query)}`,
            { headers: { 'Authorization': `Bearer ${window.S.currentUser.access_token}` } },
            5000
        );
        if (!r.ok) return [];
        const data = await r.json();
        return data.results || [];
    } catch { return []; }
}

window.setupImoInput = function() {
    if (!window.el.imoInput) return;
    _injectAutocompleteStyles();
    _getOrCreateDropdown();

    document.addEventListener('click', e => {
        const dd = document.getElementById('acDropdown');
        if (e.target !== window.el.imoInput && !dd?.contains(e.target)) _hideDropdown();
    });

    window.addEventListener('scroll', () => {
        if (document.getElementById('acDropdown')?.classList.contains('show')) _positionDropdown();
    }, true);
    window.addEventListener('resize', () => {
        if (document.getElementById('acDropdown')?.classList.contains('show')) _positionDropdown();
    });

    window.el.imoInput.addEventListener('keydown', e => {
        const dd = document.getElementById('acDropdown');
        const ddOpen = dd?.classList.contains('show');
        if (e.key === 'ArrowDown')  { e.preventDefault(); _acMove(1); return; }
        if (e.key === 'ArrowUp')    { e.preventDefault(); _acMove(-1); return; }
        if (e.key === 'Escape')     { _hideDropdown(); return; }
        if (e.key === 'Enter') {
            if (ddOpen && _acSelectedIdx >= 0) { e.preventDefault(); _selectAcItem(_acSelectedIdx); return; }
            if (!window.el.addBtn?.disabled) window.addVessel();
        }
    });

    window.el.imoInput.addEventListener('input', () => {
        clearTimeout(window.S.debounceTimer);
        const raw = window.el.imoInput.value.trim();
        window.el.namePreview.innerHTML = '';
        window.el.imoInput.style.borderColor = '';
        window.el.addBtn.disabled = true;
        window.S.lastImoLookupData = null;

        if (!raw) { _hideDropdown(); return; }

        const isDigitsOnly = /^\d+$/.test(raw);

        if (!isDigitsOnly && raw.length >= 2) {
            window.S.debounceTimer = setTimeout(async () => {
                const results = await _searchVesselsByName(raw);
                _showDropdown(results);
            }, 350);
            return;
        }

        _hideDropdown();

        if (!/^\d{7}$/.test(raw)) {
            if (raw.length > 0 && isDigitsOnly) {
                window.el.namePreview.innerHTML = `<span style="color:var(--danger);font-size:.78rem;">${i18n.get('invalidImoDigits')}</span>`;
            }
            return;
        }
        if (!window.validateIMO(raw)) {
            window.el.imoInput.style.borderColor = 'var(--danger)';
            window.el.namePreview.innerHTML = `<span style="color:var(--danger);font-size:.78rem;">${i18n.get('invalidImoCheck')}</span>`;
            return;
        }
        if (window.S.trackedImosCache.includes(raw)) {
            window.el.imoInput.style.borderColor = 'var(--warning)';
            window.el.namePreview.innerHTML = `<span style="color:var(--warning);font-size:.78rem;">${i18n.get('alreadyTracked')}</span>`;
            return;
        }
        if (!window.S.currentUser) {
            window.el.namePreview.innerHTML = `<span style="color:var(--text-soft);font-size:.78rem;">👤 <a href="#" onclick="openAuthModal('login');return false;" style="color:var(--accent);">Login</a> to look up vessels</span>`;
            window.el.addBtn.disabled = true;
            return;
        }

        const imo = raw;
        window.el.imoInput.style.borderColor = 'var(--success)';
        const isSanc = window.S.sanctionsLoaded && window.S.sanctionedImos.has(imo);
        const warnHtml = isSanc ? `<div style="background:var(--sanction-dim);border:1px solid rgba(255,69,0,.3);border-radius:8px;padding:8px 11px;margin-bottom:6px;font-size:.76rem;"><strong style="color:var(--sanction);">🚨 SANCTIONED VESSEL</strong><div style="color:var(--text-main);margin-top:2px;font-size:.7rem;">${window.escapeHtml([...new Set((window.S.sanctionDetails.get(imo) || []).map(d => d.list))].join(', ') || 'Sanctions list')}</div></div>` : '';

        if (window.S.staticCache.has(imo)) {
            const c = window.S.staticCache.get(imo), fc = window.getFlagCode(c.flag);
            const fh = fc ? `<img src="https://flagcdn.com/24x18/${fc.toLowerCase()}.png" style="width:18px;height:13px;border:1px solid var(--border);border-radius:2px;margin-right:5px;" alt="">` : '';
            const vesselName = c.name || window.S.vesselsDataMap.get(imo)?.name || `IMO ${imo}`;
            const ownerLine = c.equasis_owner ? `<div style="font-size:.72rem;color:var(--text-soft);margin-top:3px;">🏢 ${window.escapeHtml(c.equasis_owner)}${c.mmsi ? ` · 📡 ${window.escapeHtml(c.mmsi)}` : ''}</div>` : '';
            window.el.namePreview.innerHTML = warnHtml + `<div style="display:flex;align-items:center;gap:5px;font-size:.8rem;">${fh}<strong style="color:var(--text-main);">${window.escapeHtml(vesselName)}</strong><span style="font-size:.65rem;background:var(--bg-elevated);padding:1px 5px;border-radius:4px;color:var(--text-soft);">cached</span></div>${ownerLine}`;
            window.el.addBtn.disabled = false;
            return;
        }

        window.S.debounceTimer = setTimeout(async () => {
            window.el.addBtn.disabled = true;
            window.el.namePreview.innerHTML = warnHtml + `<span style="color:var(--text-soft);font-size:.78rem;">${i18n.get('lookingUp')}</span>`;
            try {
                const authHdr = window.S.currentUser?.access_token ? { 'Authorization': `Bearer ${window.S.currentUser.access_token}` } : {};
                let data = null;

                if (_equasisAllowed()) {
                    try {
                        const r = await window.fetchWithTimeout(`${window.CONFIG.WORKER_URL}/vessel/equasis/${imo}`, { headers: authHdr }, 7000);
                        if (r.ok) {
                            const eq = await r.json();
                            if (eq && eq.vessel_name) data = _mergeEquasisData(eq);
                        }
                    } catch { }
                }

                if (!data) {
                    try {
                        const r = await window.fetchWithTimeout(`${window.CONFIG.WORKER_URL}/vessel/preview/${imo}`, { headers: authHdr }, 5000);
                        if (r.ok) { const d = await r.json(); if (d && d.found !== false) data = d; }
                    } catch { }
                }

                if (!data) {
                    window.el.namePreview.innerHTML = warnHtml + `<span style="color:var(--warning);font-size:.78rem;">${i18n.get('lookupFailed').replace('{imo}', imo)}</span>`;
                    window.el.addBtn.disabled = false;
                    return;
                }
                if (data.found === false) {
                    window.el.namePreview.innerHTML = warnHtml + `<span style="color:var(--danger);font-size:.78rem;">${i18n.get('imoNotFound').replace('{imo}', imo)}</span>`;
                    window.el.addBtn.disabled = !isSanc;
                    return;
                }

                const vesselName = data.vessel_name || data.name || `IMO ${imo}`;
                const fc = window.getFlagCode(data.flag);
                const fh = fc ? `<img src="https://flagcdn.com/24x18/${fc.toLowerCase()}.png" style="width:18px;height:13px;border:1px solid var(--border);border-radius:2px;margin-right:5px;" alt="">` : '';
                const ownerLine = data.equasis_owner ? `<div style="font-size:.72rem;color:var(--text-soft);margin-top:3px;">🏢 ${window.escapeHtml(data.equasis_owner)}${data.mmsi || data['MMSI'] ? ` · 📡 ${window.escapeHtml(data.mmsi || data['MMSI'])}` : ''}</div>` : '';

                window.el.namePreview.innerHTML = warnHtml + `
                    <div style="display:flex;align-items:center;gap:5px;font-size:.8rem;">
                        ${fh}<strong style="color:var(--text-main);">${window.escapeHtml(vesselName)}</strong>
                        <span style="color:var(--text-soft);">${window.escapeHtml(data.ship_type || data['Type of ship'] || '')} · ${window.escapeHtml(data.flag || '')}</span>
                    </div>${ownerLine}`;

                window.el.addBtn.disabled = false;
                window.S.lastImoLookupData = data;
                window.updateStaticCache(imo, data).catch(() => {});
            } catch {
                window.el.namePreview.innerHTML = warnHtml + `<span style="color:var(--warning);font-size:.78rem;">${i18n.get('lookupFailed').replace('{imo}', imo)}</span>`;
                window.el.addBtn.disabled = false;
            }
        }, 800);
    });
};

function _mergeEquasisData(eq) {
    return {
        found:           true,
        imo:             eq.imo,
        vessel_name:     eq.vessel_name || eq['vessel_name'],
        ship_type:       eq['Type of ship'] || eq.ship_type || '',
        flag:            eq['Flag'] || eq.flag || '',
        mmsi:            eq['MMSI'] || eq.mmsi || '',
        call_sign:       eq['Call Sign'] || eq.call_sign || '',
        gross_tonnage:   eq['Gross tonnage'] || eq.gross_tonnage || '',
        deadweight_t:    eq['DWT'] || eq.deadweight_t || '',
        year_of_build:   eq['Year of build'] || eq.year_of_build || '',
        equasis_owner:   eq.equasis_owner   || '',
        equasis_address: eq.equasis_address || '',
        pi_club:         eq.pi_club         || '',
        class_society:   eq.class_society   || '',
        ...eq,
    };
}

// ═══════════════════════════════════════════════════════════════════════════════
// RENDER VESSELS
// ═══════════════════════════════════════════════════════════════════════════════

// Reference to owners cache (defined in sof.js, but we need to access it)
window._ownersCache = window._ownersCache || new Map();

window.renderVessels = function(tracked) {
    if (!tracked || tracked.length === 0) {
        if (!window.S.currentUser) {
            window.el.vesselsContainer.innerHTML = `
                <div class="empty-state">
                    <div class="icon">🚢</div>
                    <p style="font-size:1.1rem;font-weight:600;color:var(--text-main);margin-bottom:4px;">VesselTracker</p>
                    <small style="color:var(--text-soft);display:block;margin-bottom:24px;">Please login to access your fleet</small>
                    <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">
                        <button class="btn-primary" onclick="openAuthModal('login')" style="padding:10px 28px;font-size:.88rem;">👤 Login</button>
                        <button class="btn-ghost" onclick="openAuthModal('register')" style="padding:10px 28px;font-size:.88rem;">✚ Create Account</button>
                    </div>
                </div>`;
        } else {
            window.el.vesselsContainer.innerHTML = `<div class="empty-state"><div class="icon">🚢</div><p>${i18n.get('noVessels')}</p><small>${i18n.get('addImoHint')}</small></div>`;
        }
        return;
    }
    const ORDER = { UNDERWAY: 0, 'AT PORT': 1, 'AT ANCHOR': 2, STALLED: 3, 'DATA PENDING': 4 };
    const CI = {
        ok: `<span class="compat-ok">✔</span>`,
        marginal: `<span class="compat-warn">⚠</span>`,
        'anchor-only': `<span class="compat-warn">⚓</span>`,
        incompatible: `<span class="compat-no">✗</span>`,
        unknown: `<span class="compat-unk">?</span>`
    };

    const items = tracked.map(imo => {
        const v = window.S.vesselsDataMap.get(imo) || {};
        const sc2 = window.S.staticCache.get(imo);
        const resolvedName = v.name || sc2?.name || null;
        if (resolvedName && !v.name) v.name = resolvedName;
        const status = window.getVesselStatus(v), ageData = window.formatSignalAge(v.last_pos_utc);
        const prio = window.isPriority(imo), sanc = window.S.sanctionedImos.has(imo);
        const isPending = !window.S.vesselsDataMap.has(imo) || (v.lat == null && v.lon == null && !v.last_pos_utc);
        return { imo, v, sc2, status, ageData, name: resolvedName || i18n.get('loadingDots'), rawAgeMs: ageData.rawAgeMs, isPending, prio, sanc };
    }).filter(({ imo, v, status, ageData }) => window.passesFilter(imo, v, status) && window.passesAgeFilter(ageData));

    items.sort((a, b) => {
        if (window.S.currentSortKey === 'PRIORITY') {
            if (a.sanc !== b.sanc) return a.sanc ? -1 : 1;
            if (a.prio !== b.prio) return a.prio ? -1 : 1;
            return (ORDER[a.status] ?? 5) - (ORDER[b.status] ?? 5);
        }
        switch (window.S.currentSortKey) {
            case 'NAME_ASC': return a.name.localeCompare(b.name);
            case 'NAME_DESC': return b.name.localeCompare(a.name);
            case 'STATUS_ASC': return ((ORDER[a.status] ?? 5) - (ORDER[b.status] ?? 5)) || a.name.localeCompare(b.name);
            case 'AGE_ASC': return a.rawAgeMs - b.rawAgeMs;
            default: return b.rawAgeMs - a.rawAgeMs;
        }
    });

    if (!items.length) {
        window.el.vesselsContainer.innerHTML = `<div class="empty-state"><div class="icon">🔍</div><p>${i18n.get('noMatch')}</p></div>`;
        return;
    }

    [...window.el.vesselsContainer.children].forEach(c => { if (!c.dataset.imo) c.remove(); });

    const existingCards = new Map(
        [...window.el.vesselsContainer.querySelectorAll('[data-imo]')].map(el2 => [el2.dataset.imo, el2])
    );
    const renderedImos = new Set();

    items.forEach(({ imo, v, sc2, status, ageData, isPending, prio, sanc }) => {
        const ownerCache = window._ownersCache || new Map();
        const fingerprint = `${i18n.currentLang}|${isPending}|${status}|${ageData.ageText}|${v.name}|${v.destination}|${v.sog}|${prio}|${sanc}|${ownerCache.has(imo) ? ownerCache.get(imo).name : (sc2?.equasis_owner || '')}`;
        const existing = existingCards.get(imo);
        const wasExpanded = existing?.querySelector('.vessel-expanded')?.classList.contains('open') || false;
        if (existing && existing.dataset.fp === fingerprint) {
            window.el.vesselsContainer.appendChild(existing);
            renderedImos.add(imo);
            return;
        }
        try {
            const sc = { UNDERWAY: 'underway', 'AT PORT': 'at_port', 'AT ANCHOR': 'at_anchor', STALLED: 'stalled' }[status] || '';
            const tc = { UNDERWAY: 'status-underway', 'AT PORT': 'status-at_port', 'AT ANCHOR': 'status-at_anchor', STALLED: 'status-stalled', 'DATA PENDING': 'status-unknown' }[status] || 'status-unknown';
            const fc = window.getFlagCode(v.flag || sc2?.flag);
            const fh = fc ? `<img src="https://flagcdn.com/24x18/${fc.toLowerCase()}.png" class="flag-icon" alt="${window.escapeHtml(v.flag || sc2?.flag || '')}" />` : `<div class="flag-placeholder">🏴</div>`;
            const draughtNum = window.parseNum(v.draught_m || sc2?.draught_m);
            const loaVal = v.length_overall_m || sc2?.length_overall_m;
            const loaHtml = loaVal ? `<span class="vessel-loa">${Number(loaVal).toFixed(0)}m${draughtNum != null ? ' / ' + draughtNum.toFixed(1) + 'm' : ''}</span>` : '';
            const etaR = window.formatEtaCountdown(v.eta_utc);
            const np = v.nearest_port_name || v.nearest_port;
            const di = np ? window.getPortDepthInfo(np) : null;
            const depthHtml = di ? `<span class="tag depth" title="${i18n.get('tipAnchorDepth')}">⚓ ${di.anchor}</span><span class="tag depth" title="${i18n.get('tipPierDepth')}">🏭 ${di.pier}</span>` : '';
            const compat = window.getPortCompatibility(v.draught_m || sc2?.draught_m, v.lat, v.lon);

            const sancBanner = sanc ? `<div class="sanction-banner"><div class="sanction-banner-icon">🚨</div><div><div class="sanction-banner-title">SANCTIONED — ${window.escapeHtml([...new Set((window.S.sanctionDetails.get(imo) || []).map(d => d.list))].join(' · ') || 'Sanctions List')}</div><div class="sanction-banner-detail">${window.escapeHtml((window.S.sanctionDetails.get(imo) || [])[0]?.name || 'Appears on sanctions list')}</div></div></div>` : '';

            const compatHtml = compat ? `
                <div class="section-divider"></div>
                <div class="section-mini-title">${i18n.get('portCompatTitle')} · ${i18n.get('vesselDraught')} ${compat[0].draught}m</div>
                <div class="compat-grid">
                    ${compat.map(p => `<div class="compat-port">${CI[p.status] || CI.unknown}<div><div class="compat-port-name">${window.escapeHtml(p.name)}</div><div class="compat-port-depth">${p.pierDepth != null ? i18n.get('pierLabel') + ' ' + p.pierDepth + 'm / ' + i18n.get('anchLabel') + ' ' + p.anchorDepth + 'm' : i18n.get('noDepthData')}${p.distanceNm != null ? ' · ' + i18n.get('distFromVessel').replace('{n}', Math.round(p.distanceNm)) : ''}</div></div></div>`).join('')}
                </div>` : '';

            const notesHtml = `
                <div class="section-divider"></div>
                <div class="section-mini-title">📋 ${i18n.get('notesLabel')} <span id="notes-saved-${imo}" class="notes-saved">✓ Saved</span></div>
                <textarea id="notes-${imo}" oninput="onNoteInput('${imo}',this)" placeholder="Agent contact, cargo, special instructions...">${window.escapeHtml(window.getNotes(imo))}</textarea>`;

            const card = document.createElement('div');
            card.dataset.imo = imo;
            card.dataset.fp  = fingerprint;
            card.className = `vessel-card ${sanc ? 'sanctioned' : prio ? 'priority' : sc}`;
            card.innerHTML = `
                ${sancBanner}
                <div class="vessel-card-inner">
                    ${prio && !sanc ? `<div class="priority-indicator"></div>` : ''}
                    <div class="vessel-main" onclick="toggleDetails('${imo}')">
                        <div class="vessel-top">
                            <div>
                                <div class="vessel-name-block">
                                    ${fh}
                                    <span class="vessel-name">${window.escapeHtml(v.name || sc2?.name || i18n.get('loadingDots'))}</span>
                                    ${sanc ? `<span class="tag sanction-tag">🚨 Sanctioned</span>` : prio ? `<span style="font-size:.82rem;">🚩</span>` : ''}
                                    ${loaHtml}
                                </div>
                                <div class="vessel-imo">IMO ${imo}</div>
                            </div>
                            <span class="tag ${tc}">${window.getStatusLabel(status)}</span>
                        </div>
                        ${isPending
                    ? (() => {
                        const nextRun = window.getNextScraperRun(window.S.lastFlowRunMs || Date.now());
                        const nextH   = nextRun.getUTCHours().toString().padStart(2,'0');
                        const nextM   = nextRun.getUTCMinutes().toString().padStart(2,'0');
                        const isNextDay = nextRun.getUTCDate() !== new Date().getUTCDate();
                        const nextStr = (isNextDay ? 'Tomorrow ' : '') + nextH + ':' + nextM + ' UTC';
                        const cache   = sc2 || {};
                        const hasAnyCache = cache.flag || cache.ship_type || cache.deadweight_t || cache.year_of_build || cache.call_sign || cache.mmsi || cache.equasis_owner;
                        return `
                        <div class="vessel-meta">
                            ${cache.flag ? `<div class="meta-row"><span class="meta-label">${i18n.get('flagLabel')}</span><span class="meta-val">${window.escapeHtml(cache.flag)}</span></div>` : ''}
                            ${cache.ship_type && cache.ship_type !== '-' ? `<div class="meta-row"><span class="meta-label">${i18n.get('shipType') || 'Type'}</span><span class="meta-val">${window.escapeHtml(cache.ship_type)}</span></div>` : ''}
                            ${cache.deadweight_t && cache.deadweight_t !== '-' ? `<div class="meta-row"><span class="meta-label">${i18n.get('dwt') || 'DWT'}</span><span class="meta-val">${window.formatNumber(Number(cache.deadweight_t)/1000)}k t</span></div>` : ''}
                            ${cache.gross_tonnage ? `<div class="meta-row"><span class="meta-label">${i18n.get('grossTonnage')}</span><span class="meta-val">${Number(cache.gross_tonnage).toLocaleString()} t</span></div>` : ''}
                            ${cache.year_of_build && cache.year_of_build !== '-' ? `<div class="meta-row"><span class="meta-label">${i18n.get('builtYear') || 'Built'}</span><span class="meta-val">${window.escapeHtml(String(cache.year_of_build))}</span></div>` : ''}
                            ${cache.length_overall_m ? `<div class="meta-row"><span class="meta-label">LOA</span><span class="meta-val">${Number(cache.length_overall_m).toFixed(1)} m</span></div>` : ''}
                            ${cache.beam_m ? `<div class="meta-row"><span class="meta-label">${i18n.get('vesselBeam')}</span><span class="meta-val">${Number(cache.beam_m).toFixed(1)} m</span></div>` : ''}
                            ${cache.draught_m ? `<div class="meta-row"><span class="meta-label">${i18n.get('vesselDraught')}</span><span class="meta-val">${Number(cache.draught_m).toFixed(1)} m</span></div>` : ''}
                            ${cache.call_sign ? `<div class="meta-row"><span class="meta-label">Call Sign</span><span class="meta-val">${window.escapeHtml(cache.call_sign)}</span></div>` : ''}
                            ${cache.mmsi ? `<div class="meta-row"><span class="meta-label">MMSI</span><span class="meta-val">${window.escapeHtml(cache.mmsi)}</span></div>` : ''}
                            ${cache.equasis_owner ? `<div class="meta-row"><span class="meta-label">${i18n.get('ownerCompanyLabel').replace(' *','')}</span><span class="meta-val"><a href="#" onclick="event.preventDefault();event.stopPropagation();sofShowOwnerPopup('${imo}','${window.escapeHtml(cache.name || '')}','${window.escapeHtml(cache.equasis_owner)}')" style="color:var(--accent);">${window.escapeHtml(cache.equasis_owner)}</a></span></div>` : ''}
                            ${cache.pi_club ? `<div class="meta-row"><span class="meta-label">P&I Club</span><span class="meta-val">${window.escapeHtml(cache.pi_club)}</span></div>` : ''}
                            ${cache.class_society ? `<div class="meta-row"><span class="meta-label">Class</span><span class="meta-val">${window.escapeHtml(cache.class_society)}</span></div>` : ''}
                            ${!hasAnyCache ? `<div class="meta-row" style="color:var(--text-soft);font-size:.74rem;">${i18n.get('waitData')}</div>` : ''}
                        </div>
                        <div class="tag-row" style="margin-top:6px;">
                            <span class="tag" style="background:var(--bg-elevated);color:var(--text-soft);font-size:.7rem;">
                                ${i18n.get('sofLiveDataAt')} ${nextStr}
                            </span>
                        </div>`;
                    })()
                    : `<div class="vessel-meta">
                            <div class="meta-row"><span class="meta-label">${i18n.get('signalLabel')}</span><span class="meta-val ${ageData.ageClass}">${ageData.ageText}</span></div>
                            <div class="meta-row"><span class="meta-label">${i18n.get('destLabel')}</span><span class="meta-val">${window.escapeHtml(v.destination || '—')}</span></div>
                            <div class="meta-row"><span class="meta-label">${i18n.get('posLabel')}</span><span class="meta-val"><span class="tag position">${v.lat != null ? Number(v.lat).toFixed(3) : '—'}, ${v.lon != null ? Number(v.lon).toFixed(3) : '—'}</span></span></div>
                            <div class="meta-row"><span class="meta-label">${i18n.get('etaLabel')}</span><span class="meta-val">${etaR ? `<span class="eta-countdown ${etaR.cls}" data-eta="${window.escapeHtml(v.eta_utc || '')}">${etaR.text}</span>` : (window.formatLocalTime(v.eta_utc) || '—')}</span></div>
                            <div class="meta-row"><span class="meta-label">${i18n.get('flagLabel')}</span><span class="meta-val">${window.escapeHtml(v.flag || sc2?.flag || '—')}</span></div>
                        </div>
                        <div class="tag-row">
                            ${v.sog != null ? `<span class="tag speed" title="${i18n.get('tipSpeed')}">⚡ ${Number(v.sog).toFixed(1)} kn</span>` : ''}
                            ${v.cog != null ? `<span class="tag" title="${i18n.get('tipCourse')}">🧭 ${Number(v.cog).toFixed(0)}°</span>` : ''}
                            ${np ? `<span class="tag" title="${i18n.get('tipNearestPort')}">🏝 ${window.escapeHtml(np)}${v.nearest_distance_nm ? ' ' + Number(v.nearest_distance_nm).toFixed(0) + ' nm' : ''}</span>` : ''}
                            ${depthHtml}
                            ${v.destination_distance_nm ? `<span class="tag distance" title="${i18n.get('tipDestDistance')}">🎯 ${Number(v.destination_distance_nm).toFixed(0)} nm</span>` : ''}
                            <div id="weather-${imo}" style="display:contents;"></div>
                        </div>
                        <div class="hint-text">${i18n.get('tapExpand')} · ${window.escapeHtml(v.flag || sc2?.flag || '—')}</div>`
                }
                    </div>
                </div>
                <div id="details-${imo}" class="vessel-expanded">
                    <div class="section-mini-title">📋 ${i18n.get('vesselDetails')}</div>
                    <div class="expanded-grid">
                        <div class="exp-item"><div class="exp-label">${i18n.get('shipType')}</div><div class="exp-val">${window.escapeHtml(v.ship_type || sc2?.ship_type || '—')}</div></div>
                        <div class="exp-item"><div class="exp-label">${i18n.get('dwt')}</div><div class="exp-val">${(v.deadweight_t || sc2?.deadweight_t) ? window.formatNumber(Number(v.deadweight_t || sc2?.deadweight_t) / 1000) + 'k t' : '—'}</div></div>
                        <div class="exp-item"><div class="exp-label">${i18n.get('grossTonnage')}</div><div class="exp-val">${(v.gross_tonnage || sc2?.gross_tonnage) ? Number(v.gross_tonnage || sc2?.gross_tonnage).toLocaleString() + ' t' : '—'}</div></div>
                        <div class="exp-item"><div class="exp-label">${i18n.get('builtYear')}</div><div class="exp-val">${window.escapeHtml(v.year_of_build || sc2?.year_of_build || '—')}</div></div>
                        <div class="exp-item"><div class="exp-label">${i18n.get('vesselLength')}</div><div class="exp-val">${(v.length_overall_m || sc2?.length_overall_m) ? Number(v.length_overall_m || sc2?.length_overall_m).toFixed(1) + ' m' : '—'}</div></div>
                        <div class="exp-item"><div class="exp-label">${i18n.get('vesselBeam')}</div><div class="exp-val">${(v.beam_m || sc2?.beam_m) ? Number(v.beam_m || sc2?.beam_m).toFixed(1) + ' m' : '—'}</div></div>
                        <div class="exp-item"><div class="exp-label">${i18n.get('vesselDraught')}</div><div class="exp-val">${window.parseNum(v.draught_m || sc2?.draught_m) != null ? window.parseNum(v.draught_m || sc2?.draught_m).toFixed(1) + ' m' : '—'}</div></div>
                        <div class="exp-item"><div class="exp-label">${i18n.get('mmsiLabel')}</div><div class="exp-val">${window.escapeHtml(v.mmsi || sc2?.mmsi || '—')}</div></div>
                        <div class="exp-item"><div class="exp-label">${i18n.get('aisSourceLabel')}</div><div class="exp-val">${window.escapeHtml(v.ais_source || '—')}</div></div>
                        <div class="exp-item"><div class="exp-label">${i18n.get('flagLabel')}</div><div class="exp-val">${window.escapeHtml(v.flag || sc2?.flag || '—')}</div></div>
                        ${sc2?.call_sign ? `<div class="exp-item"><div class="exp-label">Call Sign</div><div class="exp-val">${window.escapeHtml(sc2.call_sign)}</div></div>` : ''}
                        ${sc2?.pi_club   ? `<div class="exp-item" style="grid-column:1/-1;"><div class="exp-label">🛡 P&I Club</div><div class="exp-val">${window.escapeHtml(sc2.pi_club)}</div></div>` : ''}
                        ${(() => {
                            const ownerCache = window._ownersCache || new Map();
                            const manualOwner  = ownerCache.get(imo);
                            const equasisOwner = sc2?.equasis_owner;
                            if (manualOwner) {
                                return `<div class="exp-item" style="grid-column:1/-1;"><div class="exp-label">🏢 Owners</div><div class="exp-val"><a href="#" onclick="event.preventDefault();event.stopPropagation();showOwnerInfo('${imo}')" style="color:var(--accent);text-decoration:none;font-weight:600;">${window.escapeHtml(manualOwner.name)}</a></div></div>`;
                            } else if (equasisOwner) {
                                return `<div class="exp-item" style="grid-column:1/-1;"><div class="exp-label">🏢 Registered Owner</div><div class="exp-val"><a href="#" onclick="event.preventDefault();event.stopPropagation();sofShowOwnerPopup('${imo}','${window.escapeHtml(v.name||sc2?.name||'')}','${window.escapeHtml(equasisOwner)}')" style="color:var(--accent);text-decoration:none;font-weight:600;">${window.escapeHtml(equasisOwner)}</a><span style="font-size:.65rem;color:var(--text-soft);margin-left:6px;">· tap to add contact</span></div></div>`;
                            }
                            return '';
                        })()}
                    </div>
                    ${compatHtml}
                    ${notesHtml}
                </div>
                <div class="vessel-footer">
                    <span class="vessel-footer-meta">AIS: ${window.escapeHtml(v.ais_source || '—')} · ${ageData.ageText}</span>
                    <div class="vessel-footer-actions">
                        <button class="btn-ghost" style="padding:5px 9px;font-size:.68rem;" onclick="event.stopPropagation();openSOF('${imo}')">📋 SOF</button>
                        <button class="btn-ghost" style="padding:5px 9px;font-size:.68rem;" onclick="event.stopPropagation();openPortCallsEditor('${imo}', '${(v.name || imo).replace(/'/g, "\\'")}')"> 📍 Ports </button>
                        <button class="btn-ghost" style="padding:5px 9px;font-size:.68rem;" onclick="event.stopPropagation();window._dosLazy('${imo}')">📄 Dossier</button>
                        <button class="${prio ? 'btn-urgent' : 'btn-ghost'}" style="padding:5px 9px;font-size:.68rem;" onclick="event.stopPropagation();togglePriority('${imo}')">${prio ? i18n.get('priorityBtn') : i18n.get('flagBtn')}</button>
                        <button class="btn-danger" style="padding:5px 9px;font-size:.68rem;min-width:28px;" onclick="event.stopPropagation();removeIMO('${imo}')" title="${i18n.get('remove')}">✕</button>
                    </div>
                </div>
            `;
            if (existing) existing.remove();
            window.el.vesselsContainer.appendChild(card);
            renderedImos.add(imo);
            if (wasExpanded) { const exp = card.querySelector('.vessel-expanded'); if (exp) exp.classList.add('open'); }

            if (v.lat != null && v.lon != null) window.fetchAndRenderWeather(imo, v.lat, v.lon);
        } catch (err) {
            console.warn(`Card render error IMO ${imo}:`, err);
        }
    });

    existingCards.forEach((node, imo2) => {
        if (!renderedImos.has(imo2)) node.remove();
    });

    window.startEtaCountdowns();
};

// ═══════════════════════════════════════════════════════════════════════════════
// MAP
// ═══════════════════════════════════════════════════════════════════════════════

window.toggleView = function(view) {
    window.S.currentView = view;
    if (view === 'list') {
        window.el.listView.style.display = 'block';
        window.el.mapView.style.display = 'none';
        [window.el.viewListBtn, document.getElementById('viewListBtnInner')].forEach(b => b?.classList.add('active'));
        [window.el.viewMapBtn, document.getElementById('viewMapBtnInner')].forEach(b => b?.classList.remove('active'));
    } else {
        window.el.listView.style.display = 'none';
        window.el.mapView.style.display = 'block';
        [window.el.viewListBtn, document.getElementById('viewListBtnInner')].forEach(b => b?.classList.remove('active'));
        [window.el.viewMapBtn, document.getElementById('viewMapBtnInner')].forEach(b => b?.classList.add('active'));
        setTimeout(() => { window.initMap(); window.S.mapInstance?.invalidateSize(); }, 60);
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
// MOBILE NAV
// ═══════════════════════════════════════════════════════════════════════════════

window.mobileNav = function(tab) {
    ['navFleet', 'navMap', 'navAdd', 'navAlerts', 'navExport'].forEach(id => document.getElementById(id)?.classList.remove('active'));
    if (tab === 'fleet') {
        document.getElementById('navFleet')?.classList.add('active');
        window.el.addCard?.classList.add('hidden');
        window.toggleView('list');
    } else if (tab === 'map') {
        document.getElementById('navMap')?.classList.add('active');
        window.el.addCard?.classList.add('hidden');
        window.toggleView('map');
    } else if (tab === 'add') {
        document.getElementById('navAdd')?.classList.add('active');
        window.el.addCard?.classList.remove('hidden');
        window.el.addCard?.scrollIntoView({ behavior: 'smooth' });
        setTimeout(() => window.el.imoInput?.focus(), 300);
    } else if (tab === 'alerts') {
        document.getElementById('navAlerts')?.classList.add('active');
        window.handleBellClick();
        const restoreFleet = () => {
            document.getElementById('navAlerts')?.classList.remove('active');
            document.getElementById('navFleet')?.classList.add('active');
        };
        window.el.alertOverlay?.addEventListener('click', restoreFleet, { once: true });
        document.querySelector('.alert-panel .btn-secondary')?.addEventListener('click', restoreFleet, { once: true });
    } else if (tab === 'export') {
        document.getElementById('navExport')?.classList.add('active');
        window.exportCSV();
        setTimeout(() => {
            document.getElementById('navExport')?.classList.remove('active');
            document.getElementById('navFleet')?.classList.add('active');
        }, 1200);
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORT CSV
// ═══════════════════════════════════════════════════════════════════════════════

window.exportCSV = function() {
    const h = ['IMO', 'Vessel', 'Status', 'Sanctioned', 'Priority', 'Flag', 'Lat', 'Lon', 'Speed(kn)', 'Course', 'Destination', 'Signal Age', 'DWT', 'Ship Type', 'LOA(m)', 'Built', 'Draught(m)'];
    const rows = window.S.trackedImosCache.map(imo => {
        const v = window.S.vesselsDataMap.get(imo) || {}, a = window.formatSignalAge(v.last_pos_utc);
        return [imo, v.name || '', window.getVesselStatus(v), window.S.sanctionedImos.has(imo) ? 'YES' : 'NO', window.isPriority(imo) ? 'YES' : 'NO', v.flag || '', v.lat || '', v.lon || '', v.sog != null ? Number(v.sog).toFixed(1) : '', v.cog != null ? Number(v.cog).toFixed(0) : '', v.destination || '', a.ageText, v.deadweight_t || '', v.ship_type || '', v.length_overall_m || '', v.year_of_build || '', window.parseNum(v.draught_m) != null ? window.parseNum(v.draught_m).toFixed(1) : ''];
    });
    const csv = [h, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    Object.assign(document.createElement('a'), { href: url, download: `fleet_${new Date().toISOString().slice(0, 10)}.csv` }).click();
    URL.revokeObjectURL(url);
    window.updateStatus(i18n.get('exportSuccess'), 'success');
};

// ═══════════════════════════════════════════════════════════════════════════════
// CLOCK
// ═══════════════════════════════════════════════════════════════════════════════

window.tickClock = function() {
    const n = new Date(), p = v => String(v).padStart(2, '0');
    if (window.el.headerClock) window.el.headerClock.textContent = `${p(n.getUTCHours())}:${p(n.getUTCMinutes())}:${p(n.getUTCSeconds())} UTC`;
};

// ═══════════════════════════════════════════════════════════════════════════════
// PULL TO REFRESH
// ═══════════════════════════════════════════════════════════════════════════════

window.initPullToRefresh = function() {
    let startY = 0, pulling = false;
    document.addEventListener('touchstart', e => { if (window.scrollY === 0) { startY = e.touches[0].clientY; pulling = true; } }, { passive: true });
    document.addEventListener('touchmove', e => { if (!pulling) return; if (e.touches[0].clientY - startY > 60 && window.el.ptrIndicator) { window.el.ptrIndicator.classList.add('show'); window.el.ptrIndicator.textContent = i18n.get('ptrRelease'); } }, { passive: true });
    document.addEventListener('touchend', e => {
        if (!pulling) return;
        pulling = false;
        const dy = e.changedTouches[0].clientY - startY;
        if (dy > 60 && window.el.ptrIndicator) {
            window.el.ptrIndicator.textContent = i18n.get('ptrRefreshing');
            window.loadData().then(() => window.el.ptrIndicator.classList.remove('show'));
        } else if (window.el.ptrIndicator) window.el.ptrIndicator.classList.remove('show');
    });
};

// ═══════════════════════════════════════════════════════════════════════════════
// PORT CALLS EDITOR
// ═══════════════════════════════════════════════════════════════════════════════

function pcFmtDate(iso) {
    if (!iso) return '—';
    try {
        return new Date(iso).toLocaleString('en-GB', {
            day: '2-digit', month: 'short', year: 'numeric',
            hour: '2-digit', minute: '2-digit', timeZone: 'UTC'
        }) + ' UTC';
    } catch { return iso; }
}

function pcToLocalInput(iso) {
    if (!iso) return '';
    return iso.replace('Z', '').replace('+00:00', '').substring(0, 16);
}

function pcToISO(localVal) {
    if (!localVal) return null;
    return localVal.length === 16 ? localVal + ':00.000Z' : localVal + '.000Z';
}

async function pcApiLoad(imo) {
    const token = window.S.currentUser?.access_token || localStorage.getItem('vt_token');
    if (!token) return [];
    window.S.portCallsCache.delete(imo);
    try {
        const r = await fetch(`${window.CONFIG.WORKER_URL}/data/port-calls/${imo}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!r.ok) return [];
        return (await r.json()).portCalls || [];
    } catch { return []; }
}

async function pcApiSave(imo, rowData) {
    const token = window.S.currentUser?.access_token || localStorage.getItem('vt_token');
    try {
        const r = await fetch(`${window.CONFIG.WORKER_URL}/data/port-calls/${imo}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(rowData)
        });
        if (r.ok) window.S.portCallsCache.delete(imo);
        return r.ok;
    } catch { return false; }
}

async function pcApiDelete(id, imo) {
    const token = window.S.currentUser?.access_token || localStorage.getItem('vt_token');
    try {
        const r = await fetch(`${window.CONFIG.WORKER_URL}/data/port-calls/row/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (r.ok && imo) window.S.portCallsCache.delete(imo);
        return r.ok;
    } catch { return false; }
}

window.openPortCallsEditor = async function(imo, vesselName) {
    let overlay = document.getElementById('pc-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'pc-overlay';
        overlay.className = 'pc-overlay';
        overlay.innerHTML = `
            <div class="pc-modal" id="pc-modal">
                <div class="pc-modal-hdr">
                    <div class="pc-modal-title" id="pc-modal-title"></div>
                    <button class="pc-modal-close" id="pc-modal-close">✕</button>
                </div>
                <div class="pc-modal-body" id="pc-modal-body"></div>
            </div>`;
        document.body.appendChild(overlay);
        document.getElementById('pc-modal-close').onclick = () => overlay.classList.remove('open');
        overlay.addEventListener('click', e => { if (e.target === overlay) overlay.classList.remove('open'); });
    }

    document.getElementById('pc-modal-title').textContent = i18n.get('pcTitle').replace('{name}', vesselName);
    document.getElementById('pc-modal-body').innerHTML = `<div class="pc-loading">${i18n.get('pcLoading')}</div>`;
    overlay.classList.add('open');

    const calls = await pcApiLoad(imo);
    pcRender(imo, vesselName, calls);
};

function pcRender(imo, vesselName, calls) {
    const body = document.getElementById('pc-modal-body');
    body.innerHTML = '';

    if (calls.length === 0) {
        body.innerHTML = `<div class="pc-empty">${i18n.get('pcNoData')}</div>`;
    } else {
        const notice = document.createElement('div');
        notice.className = 'pc-notice';
        notice.innerHTML = i18n.get('pcNotice').replace('{n}', calls.length).replace('▌', '<span style="color:var(--accent)">▌</span>');
        body.appendChild(notice);
        calls.forEach((row, i) => body.appendChild(pcBuildViewRow(row, i, imo, vesselName)));
    }

    const addBtn = document.createElement('button');
    addBtn.className = 'pc-add-btn';
    addBtn.textContent = i18n.get('pcAddBtn');
    addBtn.onclick = () => {
        addBtn.style.display = 'none';
        const blankRow = { id: null, port_name: '', country: '', arrived: null, departed: null, duration: '', is_manual: true };
        const formEl = pcBuildEditForm(blankRow, imo, async (saved) => {
            if (saved) {
                const fresh = await pcApiLoad(imo);
                pcRender(imo, vesselName, fresh);
            } else {
                formEl.remove();
                addBtn.style.display = '';
            }
        });
        body.insertBefore(formEl, addBtn);
        formEl.querySelector('.pc-field input')?.focus();
    };
    body.appendChild(addBtn);
}

function pcBuildViewRow(row, idx, imo, vesselName) {
    const el2 = document.createElement('div');
    el2.className = `pc-row${row.is_manual ? ' is-manual' : ''}`;

    el2.innerHTML = `
        <div class="pc-row-view">
            <div class="pc-row-index">${idx + 1}</div>
            <div class="pc-row-info">
                <div class="pc-row-name">
                    ${window.escapeHtml(row.port_name)}
                    ${row.country ? `<span style="font-weight:400;color:var(--text-soft);font-size:.72rem">· ${window.escapeHtml(row.country)}</span>` : ''}
                    ${row.is_manual ? `<span class="pc-manual-badge">${i18n.get('pcManualBadge')}</span>` : ''}
                </div>
                <div class="pc-row-dates">
                    <span title="${i18n.get('pcFieldArrived')}">▶ ${pcFmtDate(row.arrived)}</span>
                    <span title="${i18n.get('pcFieldDeparted')}">◀ ${pcFmtDate(row.departed)}</span>
                </div>
                ${row.duration ? `<div class="pc-row-dur">⏱ ${window.escapeHtml(row.duration)}</div>` : ''}
            </div>
            <div class="pc-row-actions">
                <button class="pc-btn-edit" title="${i18n.get('pcEditBtn')}">✎ ${i18n.get('pcEditBtn')}</button>
                <button class="pc-btn-del" title="Delete">✕</button>
            </div>
        </div>`;

    el2.querySelector('.pc-btn-edit').onclick = () => {
        const viewDiv = el2.querySelector('.pc-row-view');
        viewDiv.style.display = 'none';
        const formEl = pcBuildEditForm(row, imo, async (saved) => {
            if (saved) {
                const fresh = await pcApiLoad(imo);
                pcRender(imo, vesselName, fresh);
            } else {
                formEl.remove();
                viewDiv.style.display = '';
            }
        });
        el2.appendChild(formEl);
    };

    el2.querySelector('.pc-btn-del').onclick = async () => {
        if (!confirm(i18n.get('pcDeleteConfirm').replace('{name}', row.port_name))) return;
        el2.style.opacity = '.4';
        el2.style.pointerEvents = 'none';
        const ok = await pcApiDelete(row.id, imo);
        if (ok) {
            const fresh = await pcApiLoad(imo);
            pcRender(imo, vesselName, fresh);
        } else {
            el2.style.opacity = '';
            el2.style.pointerEvents = '';
            alert(i18n.get('pcDeleteFailed'));
        }
    };

    return el2;
}

function pcBuildEditForm(row, imo, onDone) {
    const el2 = document.createElement('div');
    el2.className = 'pc-edit-form';

    el2.innerHTML = `
        <div class="pc-form-grid">
            <div class="pc-field pc-full">
                <label>${i18n.get('pcFieldName')}</label>
                <input class="f-name" type="text" value="${window.escapeHtml(row.port_name || '')}" placeholder="${i18n.get('pcPlaceholderName')}" autocomplete="off" spellcheck="false">
            </div>
            <div class="pc-field">
                <label>${i18n.get('pcFieldCountry')}</label>
                <input class="f-country" type="text" value="${window.escapeHtml(row.country || '')}" placeholder="${i18n.get('pcPlaceholderCtry')}">
            </div>
            <div class="pc-field">
                <label>${i18n.get('pcFieldDuration')}</label>
                <input class="f-dur" type="text" value="${window.escapeHtml(row.duration || '')}" placeholder="${i18n.get('pcPlaceholderDur')}">
            </div>
            <div class="pc-field">
                <label>${i18n.get('pcFieldArrived')}</label>
                <input class="f-arr" type="datetime-local" value="${pcToLocalInput(row.arrived)}">
            </div>
            <div class="pc-field">
                <label>${i18n.get('pcFieldDeparted')}</label>
                <input class="f-dep" type="datetime-local" value="${pcToLocalInput(row.departed)}">
            </div>
        </div>
        <div class="pc-form-actions">
            <button class="pc-btn-cancel-edit">${i18n.get('cancel')}</button>
            <button class="pc-btn-save">${i18n.get('cmSaveBtn')}</button>
        </div>`;

    const saveBtn = el2.querySelector('.pc-btn-save');

    saveBtn.onclick = async () => {
        const name = el2.querySelector('.f-name').value.trim().toUpperCase();
        if (!name) { el2.querySelector('.f-name').focus(); return; }
        saveBtn.disabled = true;
        saveBtn.textContent = i18n.get('pcSaving');

        const ok = await pcApiSave(imo, {
            id:        row.id || undefined,
            port_name: name,
            country:   el2.querySelector('.f-country').value.trim(),
            arrived:   pcToISO(el2.querySelector('.f-arr').value),
            departed:  pcToISO(el2.querySelector('.f-dep').value),
            duration:  el2.querySelector('.f-dur').value.trim(),
        });

        if (!ok) {
            saveBtn.disabled = false;
            saveBtn.textContent = i18n.get('cmSaveBtn');
            alert(i18n.get('pcSaveFailed'));
            return;
        }
        onDone(true);
    };

    el2.querySelector('.pc-btn-cancel-edit').onclick = () => onDone(false);

    function pcCalcDuration() {
        const arrVal = el2.querySelector('.f-arr').value;
        const depVal = el2.querySelector('.f-dep').value;
        if (!arrVal || !depVal) return;
        const arrMs = new Date(arrVal + ':00Z').getTime();
        const depMs = new Date(depVal + ':00Z').getTime();
        if (isNaN(arrMs) || isNaN(depMs) || depMs <= arrMs) return;
        const totalMin = Math.round((depMs - arrMs) / 60000);
        const d = Math.floor(totalMin / 1440);
        const h = Math.floor((totalMin % 1440) / 60);
        const m = totalMin % 60;
        let str = '';
        if (d > 0) str += d + 'd ';
        if (h > 0 || d > 0) str += h + 'h';
        if (m > 0 && d === 0) str += (str ? ' ' : '') + m + 'm';
        el2.querySelector('.f-dur').value = str.trim();
    }
    el2.querySelector('.f-arr').addEventListener('change', pcCalcDuration);
    el2.querySelector('.f-dep').addEventListener('change', pcCalcDuration);
    pcCalcDuration();

    return el2;
}

// ═══════════════════════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════════════════════

window.init = function() {

    window.loadTheme();

    if (!window.CONFIG.WORKER_URL || window.CONFIG.WORKER_URL === '') {
        console.error('❌ CONFIG.WORKER_URL is empty. Add/remove vessel will not work.');
    }

    // Populate DOM refs
    window.el = {
        headerClock: document.getElementById('headerClock'),
        lastUpdatedTime: document.getElementById('lastUpdatedTime'),
        lastUpdatedLabel: document.getElementById('lastUpdatedLabel'),
        addBtn: document.getElementById('addBtn'),
        addCard: document.getElementById('addCard'),
        imoInput: document.getElementById('imoInput'),
        namePreview: document.getElementById('namePreview'),
        searchInput: document.getElementById('searchInput'),
        ageFilter: document.getElementById('ageFilter'),
        sortSelect: document.getElementById('sortSelect'),
        sortSelectMobile: document.getElementById('sortSelectMobile'),
        ageFilterMobile: document.getElementById('ageFilterMobile'),
        vesselsContainer: document.getElementById('vesselsContainer'),
        confirmModal: document.getElementById('confirmModal'),
        confirmText: document.getElementById('confirmText'),
        confirmCancel: document.getElementById('confirmCancel'),
        confirmOk: document.getElementById('confirmOk'),
        alertPanel: document.getElementById('alertPanel'),
        alertOverlay: document.getElementById('alertOverlay'),
        alertList: document.getElementById('alertList'),
        alertBadge: document.getElementById('alertBadge'),
        navBadge: document.getElementById('navBadge'),
        listView: document.getElementById('listView'),
        mapView: document.getElementById('mapView'),
        viewListBtn: document.getElementById('viewListBtn'),
        viewMapBtn: document.getElementById('viewMapBtn'),
        systemHealth: document.getElementById('systemHealth'),
        dataStats: document.getElementById('dataStats'),
        vesselCount: document.getElementById('vesselCount'),
        apiStatus: document.getElementById('apiStatus'),
        apiStatusCard: document.getElementById('apiStatusCard'),
        sanctionsStatus: document.getElementById('sanctionsStatus'),
        refreshButton: document.getElementById('refreshButton'),
        exportButton: document.getElementById('exportBtn'),
        statusMsg: document.getElementById('statusMsg'),
        loadingOverlay: document.getElementById('loadingOverlay'),
        loadingText: document.getElementById('loadingText'),
        kpiTotal: document.getElementById('kpiTotal'),
        kpiUnderway: document.getElementById('kpiUnderway'),
        kpiAtPort: document.getElementById('kpiAtPort'),
        kpiAtAnchor: document.getElementById('kpiAtAnchor'),
        kpiStalled: document.getElementById('kpiStalled'),
        kpiSanctioned: document.getElementById('kpiSanctioned'),
        kpiHealth: document.getElementById('kpiHealth'),
        kpiHealthFill: document.getElementById('kpiHealthFill'),
        fabFilter: document.getElementById('fabFilter'),
        ptrIndicator: document.getElementById('ptrIndicator'),
    };

    const restoredSession = window.loadSession();
    window.injectAuthModal();
    window.injectSettingsPanel();
    window.injectAuthIcon = function() {
        let desktopBtn = document.getElementById('authIconBtn');
        if (!desktopBtn) {
            const header = document.querySelector('.header-right');
            if (header) {
                desktopBtn = document.createElement('button');
                desktopBtn.id = 'authIconBtn';
                desktopBtn.className = 'icon-btn desktop-only';
                desktopBtn.style.cssText = 'font-size:.78rem;gap:4px;';
                desktopBtn.textContent = '👤 Login';
                const langBtn = document.getElementById('langToggle');
                langBtn ? header.insertBefore(desktopBtn, langBtn) : header.appendChild(desktopBtn);
            }
        }
        if (desktopBtn) desktopBtn.onclick = window.toggleSettingsPanel;

        let mobileBtn = document.getElementById('authIconBtnMobile');
        if (!mobileBtn) {
            const mobileNav = document.querySelector('.bottom-nav');
            if (mobileNav) {
                mobileBtn = document.createElement('div');
                mobileBtn.id = 'authIconBtnMobile';
                mobileBtn.className = 'nav-item';
                mobileBtn.innerHTML = '<span>👤</span><span>Account</span>';
                mobileNav.appendChild(mobileBtn);
            }
        }
        if (mobileBtn) mobileBtn.onclick = window.toggleSettingsPanel;
    };
    window.injectAuthIcon();
    if (restoredSession) {
        window.updateAuthIcon();
    }

    try {
        if (i18n && i18n.init) {
            i18n.init();
        }

        if (window.el.sortSelect) window.el.sortSelect.value = window.S.currentSortKey;
        if (window.el.sortSelectMobile) window.el.sortSelectMobile.value = window.S.currentSortKey;

        window.renderAlerts();
        window.updateAlertBadge();

        if (window.loadCachedData()) window.updateStatus(i18n.get('cachedLoad'), 'success');

        window.setupImoInput();

        if (window.el.addBtn) window.el.addBtn.addEventListener('click', window.addVessel);
        if (window.el.imoInput) {
            window.el.imoInput.addEventListener('keydown', e => { if (e.key === 'Enter' && !window.el.addBtn?.disabled) window.addVessel(); });
        }

        if (window.el.searchInput) {
            window.el.searchInput.addEventListener('input', () => {
                window.S.searchQuery = window.el.searchInput.value.trim().toLowerCase();
                window.renderVessels(window.S.trackedImosCache);
            });
        }

        document.querySelectorAll('.chip[data-filter]').forEach(chip => {
            chip.addEventListener('click', () => window.setFilter(chip.dataset.filter, chip));
        });

        if (window.el.ageFilter) {
            window.el.ageFilter.addEventListener('change', () => {
                window.S.currentAgeFilter = window.el.ageFilter.value;
                if (window.el.ageFilterMobile) window.el.ageFilterMobile.value = window.S.currentAgeFilter;
                window.renderVessels(window.S.trackedImosCache);
            });
        }

        if (window.el.sortSelect) {
            window.el.sortSelect.addEventListener('change', () => {
                window.S.currentSortKey = window.el.sortSelect.value;
                localStorage.setItem('vt_sort', window.S.currentSortKey);
                if (window.el.sortSelectMobile) window.el.sortSelectMobile.value = window.S.currentSortKey;
                window.renderVessels(window.S.trackedImosCache);
            });
        }

        if (window.el.viewListBtn) window.el.viewListBtn.addEventListener('click', () => window.toggleView('list'));
        if (window.el.viewMapBtn) window.el.viewMapBtn.addEventListener('click', () => window.toggleView('map'));

        if (window.el.refreshButton) window.el.refreshButton.addEventListener('click', window.loadData);

        if (window.el.exportButton) window.el.exportButton.addEventListener('click', window.exportCSV);

        if (window.el.alertOverlay) window.el.alertOverlay.addEventListener('click', window.closeAlertPanel);
        const alertsBtn = document.getElementById('alertsBtn');
        if (alertsBtn) alertsBtn.addEventListener('click', window.handleBellClick);

        if (window.el.confirmCancel) window.el.confirmCancel.addEventListener('click', () => { window.el.confirmModal?.classList.add('hidden'); window.S.vesselToRemove = null; });
        if (window.el.confirmOk) window.el.confirmOk.addEventListener('click', () => { if (window.S.vesselToRemove) window.removeIMOConfirmed(window.S.vesselToRemove); window.el.confirmModal?.classList.add('hidden'); });

        const langToggle = document.getElementById('langToggle');
        if (langToggle) {
            const updateLangBtn = () => {
                langToggle.textContent = i18n.currentLang === 'FR' ? '🇫🇷 FR' : '🇬🇧 EN';
                langToggle.title = i18n.currentLang === 'FR' ? 'Switch to English' : 'Passer en français';
            };
            updateLangBtn();
            langToggle.addEventListener('click', () => {
                const newLang = i18n.currentLang === 'EN' ? 'FR' : 'EN';
                i18n.setLang(newLang);
                updateLangBtn();
                if (window.S.lastDataModified) window.updateLastModified(window.S.lastDataModified);
                window.renderVessels(window.S.trackedImosCache);
            });
        }

        if (window.el.addCard) {
            if (!window.S.currentUser || window.innerWidth < 641) {
                window.el.addCard.classList.add('hidden');
            }
        }

        const updateFabVisibility = () => {
            if (window.el.fabFilter) window.el.fabFilter.style.display = window.innerWidth < 641 ? 'flex' : 'none';
        };
        updateFabVisibility();
        window.addEventListener('resize', updateFabVisibility);

        window.initPullToRefresh();

        setInterval(window.tickClock, 1000);
        window.tickClock();

    } catch (initErr) {
        console.error('⚠️ VesselTracker init() error (non-fatal):', initErr);
        window.updateStatus(i18n.get('uiInitError'), 'warning');
    }
    
    window.loadData();
    window.checkApiStatus();
    window.loadSanctionsLists().catch(e => {
        console.warn('Sanctions:', e);
        if (window.el.sanctionsStatus) window.el.sanctionsStatus.innerHTML = `<span style="color:var(--warning);font-size:.68rem;font-family:var(--mono);">${i18n.get('sanctionsUnavailable')}</span>`;
    });

    window.S.refreshInterval = setInterval(() => { window.loadData(); window.checkApiStatus(); }, window.CONFIG.REFRESH_INTERVAL);

    if (window.S.currentUser?.access_token) {
        window.startRealtimeHandoffListener();
        if (window.startDossierRealtimeListener) window.startDossierRealtimeListener();
        if (window.injectHandoffBadge) window.injectHandoffBadge();
        window._handoffShownOnLogin = false;
        window._dosShownOnLogin = false;
        if (window.startHandoffPolling) window.startHandoffPolling();
        if (window.startDossierHandoffPolling) window.startDossierHandoffPolling();
    }
};

window.toggleFilterMenu = function() {
    const filterMenu = document.getElementById('mobileFilterSheet');
    if (filterMenu) {
        filterMenu.classList.toggle('show');
    }
};

window.closeFilterMenu = function(event) {
    const filterMenu = document.getElementById('mobileFilterSheet');
    if (filterMenu) {
        filterMenu.classList.remove('show');
    }
};


// ─────────────────────────────────────────────────────────────────────────────
// DOSSIER — lazy loader + stubs
// ─────────────────────────────────────────────────────────────────────────────
window._dosLazy = function(imo) {
    if (window.openDossier) { window.openDossier(imo); return; }
    // First click: load dossier.js then open
    const s = document.createElement('script');
    s.src = 'js/dossier.js?v=2';
    s.onload = () => window.openDossier(imo);
    s.onerror = () => window.showToast('Erreur chargement Dossier', 'danger');
    document.head.appendChild(s);
};
// Stubs that eagerly load dossier.js in the background when called,
// so realtime + polling start immediately after login even if the
// user has never clicked the Dossier button.
function _dosEagerLoad(thenCall) {
    if (window.openDossier) { if (thenCall) thenCall(); return; }
    const s = document.createElement('script');
    s.src = 'js/dossier.js?v=2';
    s.onload = () => { if (thenCall) thenCall(); };
    document.head.appendChild(s);
}
window.startDossierHandoffPolling = function() {
    _dosEagerLoad(() => { if (window.startDossierHandoffPolling) window.startDossierHandoffPolling(); });
};
window.stopDossierHandoffPolling = function() {
    if (window._dosPoll) { clearInterval(window._dosPoll); window._dosPoll = null; }
};
window.startDossierRealtimeListener = function() {
    _dosEagerLoad(() => { if (window.startDossierRealtimeListener) window.startDossierRealtimeListener(); });
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', window.init);
} else {
    window.init();
}

if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js', { scope: './' })
        .then(reg => console.log('SW registered, scope:', reg.scope))
        .catch(err => console.warn('SW registration failed:', err));
}
