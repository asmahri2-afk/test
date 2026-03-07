// ═══════════════════════════════════════════════════════════════════════════════
// VESSELTRACKER v5.5 FINAL — Complete merged feature set
// ═══════════════════════════════════════════════════════════════════════════════

// ── CONFIG ───────────────────────────────────────────────────────────────────
const CONFIG = {
    USERNAME: 'asmahri2-afk',
    REPO: 'VesselTracker',
    BRANCH: 'main',
    RENDER_API: 'https://vessel-api-s85s.onrender.com',
    WORKER_URL: 'https://vesseltracker.asmahri1.workers.dev',
    VESSELS_PATH: 'data/vessels_data.json',
    TRACKED_PATH: 'data/tracked_imos.json',
    STATIC_CACHE_PATH: 'data/static_vessel_cache.json',
    PORTS_PATH: 'data/ports.json',
    SANCTIONS_URL: 'https://raw.githubusercontent.com/asmahri2-afk/VesselTracker/main/data/sanctioned_imos.json',
    STALE_THRESHOLD_MS: 6 * 3600000,
    CRITICAL_THRESHOLD_MS: 24 * 3600000,
    ARRIVED_THRESHOLD_NM: 30.0,
    REFRESH_INTERVAL: 5 * 60000,
};
CONFIG.RAW_BASE = `https://raw.githubusercontent.com/${CONFIG.USERNAME}/${CONFIG.REPO}/${CONFIG.BRANCH}/`;

// ── STATE ────────────────────────────────────────────────────────────────────
const S = {
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
};

// ── DOM REFS ─────────────────────────────────────────────────────────────────
const el = {
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

// ═══════════════════════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════════════════════

function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function formatNumber(num) {
    if (!num && num !== 0) return 'N/A';
    const n = Number(num);
    if (isNaN(n)) return 'N/A';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
    if (n >= 100) return n.toFixed(0);
    if (n >= 10) return n.toFixed(1);
    return n.toFixed(2);
}

function parseAisTimestamp(s) {
    if (!s) return null;
    const iso = new Date(s);
    if (!isNaN(iso.getTime()) && s.includes('T')) return iso;
    // "Mar 07, 2026 00:05 UTC"
    const m = s.replace(' UTC', '').trim().match(/^(\w{3})\s+(\d{1,2}),\s+(\d{4})\s+(\d{2}):(\d{2})$/);
    if (m) {
        const months = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
        const mo = months[m[1]];
        if (mo === undefined) return null;
        return new Date(Date.UTC(+m[3], mo, +m[2], +m[4], +m[5]));
    }
    // "2026-03-07 00:05:00 UTC"
    const m2 = s.replace(' UTC', '').trim().match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/);
    if (m2) return new Date(Date.UTC(+m2[1], +m2[2] - 1, +m2[3], +m2[4], +m2[5], +m2[6] || 0));
    return null;
}

function formatSignalAge(s) {
    if (!s) return { ageText: 'N/A', ageClass: 'age-stale', rawAgeMs: Infinity };
    try {
        const dt = parseAisTimestamp(s);
        if (!dt) return { ageText: 'Invalid', ageClass: 'age-stale', rawAgeMs: Infinity };
        const ms = Date.now() - dt.getTime();
        const h = ms / 3600000;
        let a, c;
        if (ms < 60000) { a = 'Just now'; c = 'age-recent'; }
        else if (h < 1) { const min = Math.floor(ms / 60000); a = `${min}m ago`; c = min <= 30 ? 'age-recent' : 'age-moderate'; }
        else if (h < 24) { a = `${h.toFixed(1)}h ago`; c = h <= 3 ? 'age-recent' : 'age-moderate'; }
        else { a = `${Math.floor(h / 24)}d ago`; c = 'age-stale'; }
        if (ms > CONFIG.CRITICAL_THRESHOLD_MS) c = 'status-critical';
        return { ageText: a, ageClass: c, rawAgeMs: ms };
    } catch { return { ageText: 'Error', ageClass: 'age-stale', rawAgeMs: Infinity }; }
}

function formatLocalTime(s) {
    if (!s) return 'N/A';
    try {
        const d = parseAisTimestamp(s) || new Date(s);
        if (isNaN(d.getTime())) return 'Invalid';
        const diff = d.getTime() - Date.now(), abs = Math.abs(diff);
        if (abs < 60000) return 'Arriving Now';
        if (diff > 0) {
            if (diff < 3600000) return `in ${Math.floor(abs / 60000)}m`;
            if (diff < 86400000) return `in ${Math.floor(abs / 3600000)}h`;
        } else {
            if (abs < 3600000) return `${Math.floor(abs / 60000)}m ago`;
            if (abs < 86400000) return `${Math.floor(abs / 3600000)}h ago`;
        }
        return d.toLocaleDateString(navigator.language, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch { return s; }
}

function formatEtaCountdown(utcString) {
    if (!utcString) return null;
    try {
        const eta = parseAisTimestamp(utcString) || new Date(utcString);
        if (isNaN(eta.getTime())) return null;
        const diff = eta - Date.now(), abs = Math.abs(diff);
        const h = Math.floor(abs / 3600000), m = Math.floor((abs % 3600000) / 60000), s = Math.floor((abs % 60000) / 1000);
        const p = v => String(v).padStart(2, '0');
        if (abs < 60000) return { text: 'Arriving Now', cls: 'arrived' };
        if (diff > 0) return { text: `ETA ${h > 0 ? h + 'h ' : ''}${p(m)}m ${p(s)}s`, cls: '' };
        return { text: `${h > 0 ? h + 'h ' : ''}${p(m)}m overdue`, cls: 'overdue' };
    } catch { return null; }
}

function startEtaCountdowns() {
    if (S.etaInterval) clearInterval(S.etaInterval);
    S.etaInterval = setInterval(() => {
        document.querySelectorAll('[data-eta]').forEach(e => {
            try {
                const r = formatEtaCountdown(e.getAttribute('data-eta'));
                if (r) { e.textContent = r.text; e.className = `eta-countdown ${r.cls}`; }
            } catch { }
        });
    }, 1000);
}

function getVesselStatus(v) {
    if (!v || !v.name || v.sog === undefined || v.sog === null) return 'DATA PENDING';
    const sog = parseFloat(v.sog), dd = parseFloat(v.destination_distance_nm), nd = parseFloat(v.nearest_distance_nm), dest = (v.destination || '').toUpperCase();
    if (sog <= 0.5) {
        if (['ANCHOR', 'ANCH.', 'ANCHORAGE', 'ANCHORING', 'AT ANCHOR'].some(k => dest.includes(k))) return 'AT ANCHOR';
        if ((!isNaN(dd) && dd <= CONFIG.ARRIVED_THRESHOLD_NM) || (!isNaN(nd) && nd <= CONFIG.ARRIVED_THRESHOLD_NM)) return 'AT PORT';
        return 'STALLED';
    }
    return 'UNDERWAY';
}

function getFlagCode(f) {
    if (!f || ['N/A', 'Unknown', '-', ''].includes(f)) return null;
    const m = { 'PANAMA': 'PA', 'MOROCCO': 'MA', 'MALTA': 'MT', 'ANTIGUA & BARBUDA': 'AG', 'SINGAPORE': 'SG', 'MARSHALL ISLANDS': 'MH', 'HONG KONG': 'HK', 'UNITED STATES': 'US', 'FRANCE': 'FR', 'LIBERIA': 'LR', 'GREECE': 'GR', 'CYPRUS': 'CY', 'BAHAMAS': 'BS', 'NORWAY': 'NO', 'UNITED KINGDOM': 'GB', 'NETHERLANDS': 'NL', 'GERMANY': 'DE', 'ITALY': 'IT', 'SPAIN': 'ES', 'PORTUGAL': 'PT', 'BELGIUM': 'BE', 'DENMARK': 'DK', 'SWEDEN': 'SE', 'FINLAND': 'FI', 'RUSSIA': 'RU', 'CHINA': 'CN', 'JAPAN': 'JP', 'SOUTH KOREA': 'KR', 'TAIWAN': 'TW', 'INDIA': 'IN', 'BRAZIL': 'BR', 'ARGENTINA': 'AR', 'CHILE': 'CL', 'AUSTRALIA': 'AU', 'NEW ZEALAND': 'NZ', 'CANADA': 'CA', 'MEXICO': 'MX', 'SOUTH AFRICA': 'ZA', 'EGYPT': 'EG', 'SAUDI ARABIA': 'SA', 'UAE': 'AE', 'QATAR': 'QA', 'TURKEY': 'TR', 'UKRAINE': 'UA', 'POLAND': 'PL', 'PHILIPPINES': 'PH', 'INDONESIA': 'ID', 'MALAYSIA': 'MY', 'VIETNAM': 'VN', 'THAILAND': 'TH', 'BANGLADESH': 'BD', 'PAKISTAN': 'PK', 'IRAN': 'IR', 'IRAQ': 'IQ', 'COMOROS': 'KM', 'PALAU': 'PW', 'TUVALU': 'TV', 'BELIZE': 'BZ', 'CAMBODIA': 'KH' };
    const u = f.toUpperCase();
    if (m[u]) return m[u];
    for (const [k, v] of Object.entries(m)) { if (u.includes(k) || k.includes(u)) return v; }
    const pm = f.match(/\(([A-Z]{2})\)/);
    if (pm) return pm[1];
    return null;
}

function isPriority(imo) { return S.priorities.includes(imo); }

function validateIMO(imo) {
    if (!/^\d{7}$/.test(imo)) return false;
    const digits = imo.split('').map(Number);
    const check = digits.slice(0, 6).reduce((sum, d, i) => sum + d * (7 - i), 0) % 10;
    return check === digits[6];
}

// ═══════════════════════════════════════════════════════════════════════════════
// PORT HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function getPortDepthInfo(portName) {
    if (!portName) return null;
    const port = S.portsData[portName.trim().toUpperCase()];
    if (!port) return null;
    const fmt = v => (v && v !== 0) ? `${Number(v).toFixed(1)}m` : 'N/A';
    return { anchor: fmt(port.anchorage_depth), pier: fmt(port.cargo_pier_depth) };
}

function getPortCompatibility(draughtStr) {
    const match = String(draughtStr || '').match(/(\d+\.?\d*)/);
    if (!match) return null;
    const draught = parseFloat(match[1]);
    return [
        { name: 'Tan Tan', key: 'TAN TAN' },
        { name: 'Laâyoune', key: 'LAAYOUNE' },
        { name: 'Dakhla', key: 'DAKHLA' }
    ].map(p => {
        const info = S.portsData[p.key];
        if (!info) return { name: p.name, status: 'unknown', pierDepth: null, anchorDepth: null };
        const pier = info.cargo_pier_depth || 0, anchor = info.anchorage_depth || 0;
        let status;
        if (draught <= pier - 1) status = 'ok';
        else if (draught <= pier) status = 'marginal';
        else if (draught <= anchor) status = 'anchor-only';
        else status = 'incompatible';
        return { name: p.name, status, pierDepth: pier, anchorDepth: anchor, draught };
    });
}

// ═══════════════════════════════════════════════════════════════════════════════
// WEATHER
// ═══════════════════════════════════════════════════════════════════════════════

const _weatherPending = new Set();

async function fetchAndRenderWeather(imo, lat, lon) {
    if (!lat || !lon) return;
    const container = document.getElementById(`weather-${imo}`);
    if (!container) return;
    const cached = S.weatherCache.get(imo);
    if (cached && Date.now() - cached.ts < 30 * 60000) {
        const p = [];
        if (cached.wave != null) p.push(`<span class="tag weather">🌊 ${Number(cached.wave).toFixed(1)}m</span>`);
        if (cached.wind != null) p.push(`<span class="tag weather">💨 ${Number(cached.wind).toFixed(0)}kn</span>`);
        if (p.length) container.innerHTML = p.join('');
        return;
    }
    if (_weatherPending.has(imo)) return;
    _weatherPending.add(imo);
    try {
        const [mr, wr] = await Promise.all([
            fetch(`https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lon}&current=wave_height`),
            fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=wind_speed_10m&wind_speed_unit=kn`)
        ]);
        const md = await mr.json(), wd = await wr.json();
        const result = { wave: md.current?.wave_height, wind: wd.current?.wind_speed_10m, ts: Date.now() };
        S.weatherCache.set(imo, result);
        const c2 = document.getElementById(`weather-${imo}`);
        if (!c2) return;
        const p = [];
        if (result.wave != null) p.push(`<span class="tag weather">🌊 ${Number(result.wave).toFixed(1)}m</span>`);
        if (result.wind != null) p.push(`<span class="tag weather">💨 ${Number(result.wind).toFixed(0)}kn</span>`);
        if (p.length) c2.innerHTML = p.join('');
    } catch (e) {
        console.warn(`Weather fetch failed for ${imo}:`, e.message);
    } finally {
        _weatherPending.delete(imo);
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ALERTS
// ═══════════════════════════════════════════════════════════════════════════════

function pushAlert(type, imo, vessel, msg) {
    const icons = { stalled: '🔴', arrived: '⚓', stale: '📡', approaching: '🎯', added: '➕', removed: '➖', sanctioned: '🚨', priority: '🚩' };
    if (type === 'sanctioned' && S.alerts.some(a => a.type === 'sanctioned' && a.imo === imo)) return;
    const dedupTypes = ['stalled', 'arrived', 'stale', 'approaching'];
    if (dedupTypes.includes(type)) {
        const key = `${type}:${imo}`;
        if (S.recentAlertKeys.has(key)) return;
        S.recentAlertKeys.add(key);
        setTimeout(() => S.recentAlertKeys.delete(key), 30 * 60 * 1000);
    }
    S.alerts.unshift({ id: Date.now() + Math.random(), type, imo, vessel, msg, icon: icons[type] || '•', time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), read: false });
    if (S.alerts.length > 60) S.alerts.pop();
    localStorage.setItem('vt_alerts', JSON.stringify(S.alerts));
    renderAlerts();
    updateAlertBadge();
}

function renderAlerts() {
    if (!S.alerts.length) { el.alertList.innerHTML = '<div class="alert-empty">📡 Monitoring fleet activity...</div>'; return; }
    el.alertList.innerHTML = S.alerts.map(a => `
        <div class="alert-item ${a.read ? '' : 'unread'} type-${a.type}">
            <div><span style="margin-right:4px;">${a.icon}</span><span class="alert-msg">${escapeHtml(a.msg)}</span></div>
            <div class="alert-time">${a.time} · IMO ${a.imo}</div>
        </div>
    `).join('');
}

function updateAlertBadge() {
    const n = S.alerts.filter(a => !a.read).length;
    [el.alertBadge, el.navBadge].forEach(b => {
        if (!b) return;
        b.textContent = n;
        b.classList.toggle('hidden', n === 0);
    });
}

function toggleAlertPanel() {
    const open = el.alertPanel.classList.toggle('open');
    el.alertOverlay.classList.toggle('show', open);
    if (open) markAllAlertsRead();
}

function closeAlertPanel() { el.alertPanel.classList.remove('open'); el.alertOverlay.classList.remove('show'); }
function markAllAlertsRead() { S.alerts.forEach(a => a.read = true); localStorage.setItem('vt_alerts', JSON.stringify(S.alerts)); renderAlerts(); updateAlertBadge(); }
function clearAlerts() { S.alerts = []; localStorage.setItem('vt_alerts', JSON.stringify(S.alerts)); renderAlerts(); updateAlertBadge(); }

// ═══════════════════════════════════════════════════════════════════════════════
// SANCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

async function loadSanctionsLists() {
    try {
        const res = await fetchWithTimeout(CONFIG.SANCTIONS_URL, { cache: 'no-cache' }, 10000);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const dmap = new Map();
        const databaseTotal = data.total || 0;
        if (data.entries && Array.isArray(data.entries)) {
            data.entries.forEach(e => {
                const imo = String(e.imo).replace(/\D/g, '');
                if (!dmap.has(imo)) dmap.set(imo, []);
                const lists = Array.isArray(e.lists) ? e.lists.join(', ') : e.lists || 'Unknown';
                dmap.get(imo).push({ list: lists, name: e.name || `IMO ${imo}`, reason: e.program || '' });
            });
        } else {
            function addD(imo, list, name, reason) { if (!dmap.has(imo)) dmap.set(imo, []); dmap.get(imo).push({ list, name, reason }); }
            if (data.OFAC_SDN) data.OFAC_SDN.forEach(e => addD(String(e.imo).replace(/\D/g, ''), 'OFAC', e.name, e.reason));
            if (data.UN_UNSC) data.UN_UNSC.forEach(e => addD(String(e.imo).replace(/\D/g, ''), 'UN', e.name, ''));
            if (data.EU_CONSOLIDATED) data.EU_CONSOLIDATED.forEach(e => addD(String(e.imo).replace(/\D/g, ''), 'EU', e.name, ''));
        }
        S.sanctionedImos = new Set(dmap.keys());
        S.sanctionDetails = dmap;
        S.sanctionsLoaded = true;
        const displayCount = databaseTotal > 0 ? databaseTotal : S.sanctionedImos.size;
        const updated = data.updated ? ' · ' + new Date(data.updated).toLocaleDateString() : '';
        const html = `<span style="color:var(--success);font-size:.68rem;font-family:var(--mono);">✓ Monitoring ${displayCount.toLocaleString()} sanctioned vessels${updated}</span>`;
        if (el.sanctionsStatus) el.sanctionsStatus.innerHTML = html;
        const inline = document.getElementById('sanctionsStatusInline');
        if (inline) inline.innerHTML = html;
        checkFleetSanctions();
    } catch (e) {
        console.warn('Sanctions load failed:', e.message);
        S.sanctionsLoaded = true;
        const html = `<span style="color:var(--warning);font-size:.68rem;font-family:var(--mono);">⚠ Sanctions unavailable</span>`;
        if (el.sanctionsStatus) el.sanctionsStatus.innerHTML = html;
    }
}

function checkFleetSanctions() {
    if (!S.sanctionsLoaded) return;
    let found = false;
    for (const imo of S.trackedImosCache) {
        if (S.sanctionedImos.has(imo) && !S.alerts.some(a => a.type === 'sanctioned' && a.imo === imo)) {
            found = true;
            const d = S.sanctionDetails.get(imo) || [];
            const lists = [...new Set(d.map(x => x.list))].join(', ');
            const v = S.vesselsDataMap.get(imo);
            pushAlert('sanctioned', imo, v?.name || `IMO ${imo}`, `🚨 SANCTIONED: ${v?.name || 'IMO ' + imo} on ${lists || 'sanctions list'}`);
        }
    }
    if (found) { renderVessels(S.trackedImosCache); updateFleetKPI(S.trackedImosCache); }
}

// ═══════════════════════════════════════════════════════════════════════════════
// STORAGE
// ═══════════════════════════════════════════════════════════════════════════════

function saveToLocalStorage() {
    try {
        localStorage.setItem('vt_cache', JSON.stringify({ vessels: Array.from(S.vesselsDataMap.entries()), tracked: S.trackedImosCache, timestamp: Date.now() }));
    } catch (e) { console.warn(e); }
}

function loadCachedData() {
    try {
        const raw = localStorage.getItem('vt_cache');
        if (!raw) return false;
        const data = JSON.parse(raw);
        if (Date.now() - data.timestamp > 3600000) return false;
        S.vesselsDataMap = new Map(data.vessels || []);
        S.trackedImosCache = data.tracked || [];
        if (S.trackedImosCache.length > 0) { renderVessels(S.trackedImosCache); return true; }
    } catch (e) { console.warn(e); }
    return false;
}

function getNotes(imo) { return localStorage.getItem(`vt_notes_${imo}`) || ''; }

function saveNotes(imo, text) {
    localStorage.setItem(`vt_notes_${imo}`, text);
    const s = document.getElementById(`notes-saved-${imo}`);
    if (s) { s.classList.add('show'); setTimeout(() => s.classList.remove('show'), 1800); }
}

function onNoteInput(imo, ta) {
    clearTimeout(S.noteTimers[imo]);
    S.noteTimers[imo] = setTimeout(() => saveNotes(imo, ta.value), 600);
}

function togglePriority(imo) {
    if (isPriority(imo)) S.priorities = S.priorities.filter(x => x !== imo);
    else { S.priorities.push(imo); pushAlert('priority', imo, imo, `IMO ${imo} flagged as Priority`); }
    localStorage.setItem('vt_priorities', JSON.stringify(S.priorities));
    renderVessels(S.trackedImosCache);
}

function toggleDetails(imo) {
    const exp = document.getElementById(`details-${imo}`);
    if (exp) exp.classList.toggle('open');
}

function showLoading(msg = 'Loading...') { if (el.loadingText) el.loadingText.textContent = msg; if (el.loadingOverlay) el.loadingOverlay.classList.remove('hidden'); }
function hideLoading() { if (el.loadingOverlay) el.loadingOverlay.classList.add('hidden'); }

function updateStatus(msg, type = 'info') {
    if (!el.statusMsg) return;
    el.statusMsg.textContent = msg;
    el.statusMsg.className = `status-msg ${type === 'info' ? '' : type}`;
    if (type === 'success') setTimeout(() => { if (el.statusMsg.textContent === msg) { el.statusMsg.textContent = 'Ready'; el.statusMsg.className = 'status-msg'; } }, 5000);
}

// ═══════════════════════════════════════════════════════════════════════════════
// API & NETWORK
// ═══════════════════════════════════════════════════════════════════════════════

async function fetchWithTimeout(url, options = {}, timeout = 8000) {
    const ctrl = new AbortController();
    const id = setTimeout(() => ctrl.abort(), timeout);
    try { const r = await fetch(url, { ...options, signal: ctrl.signal }); clearTimeout(id); return r; }
    catch (e) { clearTimeout(id); throw e; }
}

async function checkApiStatus() {
    try {
        await fetchWithTimeout(`${CONFIG.RENDER_API}/ping`, { method: 'GET' }, 5000);
        const s = 'API: Online';
        const css = 'border-color:rgba(16,185,129,.4);color:var(--success);';
        if (el.apiStatus) { el.apiStatus.textContent = s; el.apiStatus.style.cssText = css; }
        if (el.apiStatusCard) { el.apiStatusCard.textContent = s; el.apiStatusCard.style.cssText = css; }
    } catch {
        try {
            await fetchWithTimeout(`${CONFIG.RAW_BASE}${CONFIG.TRACKED_PATH}`, { method: 'HEAD' }, 5000);
            const s = 'API: Limited';
            const css = 'border-color:rgba(245,158,11,.4);color:var(--warning);';
            if (el.apiStatus) { el.apiStatus.textContent = s; el.apiStatus.style.cssText = css; }
            if (el.apiStatusCard) { el.apiStatusCard.textContent = s; el.apiStatusCard.style.cssText = css; }
        } catch {
            const s = 'API: Offline';
            const css = 'border-color:rgba(239,68,68,.4);color:var(--danger);';
            if (el.apiStatus) { el.apiStatus.textContent = s; el.apiStatus.style.cssText = css; }
            if (el.apiStatusCard) { el.apiStatusCard.textContent = s; el.apiStatusCard.style.cssText = css; }
        }
    }
}

async function fetchGitHubData(path, fallback = null) {
    const url = `${CONFIG.RAW_BASE}${path}?_=${Date.now()}`;
    const res = await fetchWithTimeout(url, { cache: 'no-cache' }, 10000);
    if (!res.ok) throw new Error(`GitHub ${res.status}: ${path}`);
    // Read the actual file modification time from GitHub's Last-Modified header
    const lastModHeader = res.headers.get('Last-Modified');
    const lastMod = lastModHeader ? new Date(lastModHeader).getTime() : Date.now();
    try { const data = await res.json(); return { data, sha: null, lastMod, source: 'raw' }; }
    catch { return { data: fallback, sha: null, lastMod, source: 'error' }; }
}

async function ghPut(path, data, sha, message) {
    const url = `${CONFIG.WORKER_URL}/github-write`;
    const res = await fetchWithTimeout(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path, data, message }) }, 15000);
    if (!res.ok) {
        const txt = await res.text();
        let msg = `Write failed: ${res.status}`;
        if (res.status === 409) msg = 'Conflict — please retry.';
        else if (res.status === 401 || res.status === 403) msg = 'API auth failed.';
        else { try { msg += ` — ${JSON.parse(txt).message}`; } catch { msg += ` — ${txt.substring(0, 80)}`; } }
        throw new Error(msg);
    }
    return res.json();
}

async function updateStaticCache(imo, vd) {
    const entry = { imo, name: vd.name || vd.vessel_name || `IMO ${imo}`, flag: vd.flag || '-', ship_type: vd.ship_type || '-', length_overall_m: vd.length_overall_m ?? '-', beam_m: vd.beam_m ?? '-', deadweight_t: vd.deadweight_t ?? '-', gross_tonnage: vd.gross_tonnage ?? '-', year_of_build: vd.year_of_build ?? '-' };
    S.staticCache.set(imo, entry);
    try {
        const { data: cache } = await fetchGitHubData(CONFIG.STATIC_CACHE_PATH, {});
        const existing = cache[imo];
        if (existing && existing.name && !existing.name.startsWith('IMO ')) return;
        cache[imo] = entry;
        await ghPut(CONFIG.STATIC_CACHE_PATH, cache, null, `Add static data for IMO ${imo}`);
    } catch (e) { console.warn(`Static cache write failed for ${imo}:`, e.message); }
}

// ═══════════════════════════════════════════════════════════════════════════════
// LOAD DATA
// ═══════════════════════════════════════════════════════════════════════════════

async function loadData() {
    if (S.isApiBusy) return;
    S.isApiBusy = true;
    if (el.refreshButton) el.refreshButton.disabled = true;
    updateStatus('Refreshing...', 'info');
    try {
        const [ti, vi, si, pi] = await Promise.all([
            fetchGitHubData(CONFIG.TRACKED_PATH, []),
            fetchGitHubData(CONFIG.VESSELS_PATH, {}),
            fetchGitHubData(CONFIG.STATIC_CACHE_PATH, {}),
            fetchGitHubData(CONFIG.PORTS_PATH, {})
        ]);
        const tracked = (Array.isArray(ti.data) ? ti.data : ti.data?.tracked_imos || []).map(String);
        S.trackedImosCache = tracked;
        let vl = [];
        if (Array.isArray(vi.data)) vl = vi.data;
        else if (vi.data && typeof vi.data === 'object') {
            const first = Object.values(vi.data)[0];
            if (first?.imo) vl = Object.values(vi.data);
            else if (Array.isArray(first)) Object.values(vi.data).forEach(a => { if (Array.isArray(a)) vl = vl.concat(a); });
            else vl = Object.values(vi.data);
        }
        vl = vl.filter(v => v?.imo);
        const nm = new Map();
        vl.forEach(v => nm.set(String(v.imo), v));
        S.vesselsDataMap = nm;
        S.staticCache = new Map(Object.entries(si.data || {}));
        S.portsData = pi.data || {};
        // Use the actual GitHub Last-Modified time (real data freshness), fall back to now
        S.lastDataModified = vi.lastMod ? new Date(vi.lastMod) : new Date();
        saveToLocalStorage();
        generateAlerts(nm, tracked);
        updateAlertBadge();
        updateSystemHealth(vi.lastMod, vl.length, vi.source);
        updateFleetKPI(tracked);
        if (el.vesselCount) el.vesselCount.textContent = `${tracked.length} vessel${tracked.length !== 1 ? 's' : ''} tracked`;
        if (el.dataStats) el.dataStats.textContent = `${vl.length} in database · ${vi.source}`;
        const _locale = (typeof i18n !== 'undefined' && i18n.currentLang === 'FR') ? 'fr-FR' : 'en-US';
        const _fmtOpts = { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' };
        const _fmtTime = S.lastDataModified.toLocaleString(_locale, _fmtOpts);
        if (el.lastUpdatedTime) el.lastUpdatedTime.textContent = _fmtTime;
        if (el.lastUpdatedLabel) el.lastUpdatedLabel.textContent = `Last modified: ${_fmtTime}`;
        renderVessels(S.trackedImosCache);
        if (S.mapInitialized) updateMapMarkers();
        updateStatus(`Fleet loaded — ${tracked.length} vessels`, 'success');
    } catch (err) {
        console.error('Load error:', err);
        if (!loadCachedData()) {
            updateStatus(`Load failed: ${err.message}`, 'error');
            if (el.vesselsContainer) el.vesselsContainer.innerHTML = `<div class="empty-state"><div class="icon">⚠️</div><p style="color:var(--danger);">${escapeHtml(err.message)}</p><small>Check network connection</small></div>`;
        } else updateStatus('Showing cached data (offline)', 'warning');
    } finally {
        S.isApiBusy = false;
        if (el.refreshButton) el.refreshButton.disabled = false;
        hideLoading();
    }
}

function generateAlerts(newMap, trackedImos) {
    const isFirst = S.previousVesselStates.size === 0;
    for (const imo of trackedImos) {
        const v = newMap.get(imo);
        if (!v) continue;
        const ns = getVesselStatus(v), prev = S.previousVesselStates.get(imo), age = formatSignalAge(v.last_pos_utc);
        if (!isFirst && prev) {
            if (prev.status !== ns) {
                if (ns === 'STALLED') pushAlert('stalled', imo, v.name, `${v.name || 'IMO ' + imo} has stopped moving`);
                if (ns === 'AT PORT') pushAlert('arrived', imo, v.name, `${v.name || 'IMO ' + imo} arrived at port`);
                if (ns === 'AT ANCHOR') pushAlert('arrived', imo, v.name, `${v.name || 'IMO ' + imo} now at anchor`);
            }
            if (age.rawAgeMs > CONFIG.STALE_THRESHOLD_MS && prev.signalAgeMs <= CONFIG.STALE_THRESHOLD_MS) pushAlert('stale', imo, v.name, `${v.name || 'IMO ' + imo} AIS signal lost (${age.ageText})`);
            const dd = parseFloat(v.destination_distance_nm);
            if (!isNaN(dd) && dd <= 50 && (prev.destDist == null || prev.destDist > 50)) pushAlert('approaching', imo, v.name, `${v.name || 'IMO ' + imo} approaching (${dd.toFixed(0)} nm)`);
        }
        S.previousVesselStates.set(imo, { status: ns, signalAgeMs: age.rawAgeMs, destDist: parseFloat(v.destination_distance_nm) || null });
    }
    if (S.sanctionsLoaded) checkFleetSanctions();
}

function updateSystemHealth(lastMod, count, source) {
    if (!lastMod) { if (el.systemHealth) el.systemHealth.textContent = 'Unknown'; return; }
    const ms = Date.now() - lastMod;
    let text, color, bg;
    if (ms < 3600000) { text = '● Excellent'; color = 'var(--success)'; bg = 'rgba(16,185,129,.12)'; }
    else if (ms < CONFIG.STALE_THRESHOLD_MS) { text = '● Good'; color = 'var(--warning)'; bg = 'rgba(245,158,11,.12)'; }
    else if (ms < CONFIG.CRITICAL_THRESHOLD_MS) { text = '● Stale'; color = '#f97316'; bg = 'rgba(249,115,22,.12)'; }
    else { text = '● Critical'; color = 'var(--danger)'; bg = 'rgba(239,68,68,.12)'; }
    if (el.systemHealth) { el.systemHealth.textContent = text; el.systemHealth.style.cssText = `color:${color};background:${bg};border-color:${color}40;`; }
}

function updateFleetKPI(tracked) {
    let uw = 0, ap = 0, aa = 0, st = 0, sanc = 0, totalAgeMs = 0, validAge = 0;
    for (const imo of tracked) {
        const v = S.vesselsDataMap.get(imo);
        if (!v) continue;
        const s = getVesselStatus(v);
        if (s === 'UNDERWAY') uw++;
        else if (s === 'AT PORT') ap++;
        else if (s === 'AT ANCHOR') aa++;
        else if (s === 'STALLED') st++;
        if (S.sanctionedImos.has(imo)) sanc++;
        const a = formatSignalAge(v.last_pos_utc);
        if (a.rawAgeMs !== Infinity) { totalAgeMs += a.rawAgeMs; validAge++; }
    }
    if (el.kpiTotal) el.kpiTotal.textContent = tracked.length;
    if (el.kpiUnderway) el.kpiUnderway.textContent = uw;
    if (el.kpiAtPort) el.kpiAtPort.textContent = ap;
    if (el.kpiAtAnchor) el.kpiAtAnchor.textContent = aa;
    if (el.kpiStalled) el.kpiStalled.textContent = st;
    if (el.kpiSanctioned) el.kpiSanctioned.textContent = sanc;
    const hs = tracked.length > 0 ? Math.round(((uw + ap + aa) / tracked.length) * 100) : 100;
    if (el.kpiHealth) {
        el.kpiHealth.textContent = `${hs}%`;
        el.kpiHealth.className = `kpi-value ${hs >= 80 ? 'green' : hs >= 50 ? 'yellow' : 'red'}`;
    }
    if (el.kpiHealthFill) {
        el.kpiHealthFill.style.width = `${hs}%`;
        el.kpiHealthFill.style.background = hs >= 80 ? 'var(--success)' : hs >= 50 ? 'var(--warning)' : 'var(--danger)';
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// FILTER & SORT
// ═══════════════════════════════════════════════════════════════════════════════

function passesFilter(imo, v, status) {
    const q = S.searchQuery;
    if (q && !(v?.name || '').toLowerCase().includes(q) && !imo.includes(q)) return false;
    const f = S.currentFilter;
    if (f === 'ALL') return true;
    if (f === 'PRIORITY') return isPriority(imo);
    if (f === 'SANCTIONED') return S.sanctionedImos.has(imo);
    return status === f;
}

function passesAgeFilter(ageData) {
    if (S.currentAgeFilter === 'ALL') return true;
    const h = ageData.rawAgeMs / 3600000;
    if (S.currentAgeFilter === '1H') return h <= 1;
    if (S.currentAgeFilter === '6H') return h <= 6;
    if (S.currentAgeFilter === '24H') return h <= 24;
    if (S.currentAgeFilter === 'STALE') return h > 24;
    return true;
}

function setFilter(value, chip) {
    S.currentFilter = value;
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    if (chip) chip.classList.add('active');
    renderVessels(S.trackedImosCache);
}

function applyMobileFilters() {
    if (el.sortSelectMobile) {
        S.currentSortKey = el.sortSelectMobile.value;
        localStorage.setItem('vt_sort', S.currentSortKey);
        if (el.sortSelect) el.sortSelect.value = S.currentSortKey;
    }
    if (el.ageFilterMobile) {
        S.currentAgeFilter = el.ageFilterMobile.value;
        if (el.ageFilter) el.ageFilter.value = S.currentAgeFilter;
    }
    document.getElementById('mobileFilterSheet').style.display = 'none';
    renderVessels(S.trackedImosCache);
}

function closeMobileFilter(e) {
    if (e.target === e.currentTarget) document.getElementById('mobileFilterSheet').style.display = 'none';
}

// ═══════════════════════════════════════════════════════════════════════════════
// VESSEL MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

async function addVessel() {
    const imo = el.imoInput.value.trim();
    if (!imo || !/^\d{7}$/.test(imo)) { updateStatus('Invalid IMO — must be 7 digits', 'error'); return; }
    if (!validateIMO(imo)) { updateStatus('Invalid IMO — checksum failed', 'error'); return; }
    if (S.trackedImosCache.includes(imo)) { updateStatus('Already tracked', 'warning'); return; }
    if (S.isApiBusy) return;
    showLoading(`Adding IMO ${imo}...`);
    await updateTrackedImos(imo, true);
    pushAlert('added', imo, imo, `IMO ${imo} added to fleet tracking`);
    if (S.sanctionsLoaded && S.sanctionedImos.has(imo)) {
        const d = S.sanctionDetails.get(imo) || [];
        pushAlert('sanctioned', imo, imo, `🚨 SANCTIONED VESSEL added: IMO ${imo} on ${[...new Set(d.map(x => x.list))].join(', ') || 'sanctions list'}`);
    }
    if (S.staticCache.has(imo)) {
        updateStaticCache(imo, S.staticCache.get(imo)).catch(e => console.warn('Static cache on add:', e));
    } else {
        (async () => {
            try {
                let vd = null;
                for (const ep of [`${CONFIG.RENDER_API}/vessel-full/${imo}`, `${CONFIG.RENDER_API}/vessel/${imo}`]) {
                    try { const r = await fetchWithTimeout(ep, {}, 5000); if (r.ok) { vd = await r.json(); break; } } catch { }
                }
                if (vd && vd.found !== false) await updateStaticCache(imo, vd);
            } catch (e) { console.warn('Static cache lookup on add:', e); }
        })();
    }
    hideLoading();
}

function removeIMO(imo) {
    const name = S.vesselsDataMap.get(imo)?.name || `IMO ${imo}`;
    el.confirmText.textContent = `Remove "${name}" (IMO ${imo}) from fleet tracking?`;
    el.confirmModal.classList.remove('hidden');
    S.vesselToRemove = imo;
}

async function removeIMOConfirmed(imo) {
    showLoading(`Removing IMO ${imo}...`);
    await updateTrackedImos(imo, false);
    hideLoading();
}

async function updateTrackedImos(imo, isAdd) {
    S.isApiBusy = true;
    if (el.refreshButton) el.refreshButton.disabled = true;
    for (let attempt = 1; attempt <= 2; attempt++) {
        try {
            updateStatus(`${isAdd ? 'Adding' : 'Removing'} (${attempt}/2)...`);
            const result = await fetchGitHubData(CONFIG.TRACKED_PATH, []);
            let list = (Array.isArray(result.data) ? result.data : result.data?.tracked_imos || []).map(String).filter(Boolean);
            if (isAdd) { if (!list.includes(imo)) list.push(imo); } else list = list.filter(x => x !== imo);
            list.sort();
            await ghPut(CONFIG.TRACKED_PATH, list, null, `${isAdd ? 'Add' : 'Remove'} IMO ${imo}`);
            updateStatus(`${isAdd ? 'Added' : 'Removed'} IMO ${imo}`, 'success');
            if (isAdd) { el.imoInput.value = ''; el.namePreview.innerHTML = ''; el.addBtn.disabled = true; }
            await loadData();
            break;
        } catch (err) {
            if (attempt < 2) { updateStatus('Retrying...', 'warning'); await new Promise(r => setTimeout(r, 1000)); }
            else {
                updateStatus(`Failed: ${err.message}`, 'error');
                if (isAdd) S.trackedImosCache.push(imo); else S.trackedImosCache = S.trackedImosCache.filter(x => x !== imo);
                saveToLocalStorage();
                renderVessels(S.trackedImosCache);
            }
        }
    }
    S.isApiBusy = false;
    if (el.refreshButton) el.refreshButton.disabled = false;
}

// ═══════════════════════════════════════════════════════════════════════════════
// IMO INPUT LIVE PREVIEW
// ═══════════════════════════════════════════════════════════════════════════════

function setupImoInput() {
    el.imoInput.addEventListener('input', () => {
        clearTimeout(S.debounceTimer);
        const imo = el.imoInput.value.trim();
        el.namePreview.innerHTML = '';
        el.imoInput.style.borderColor = '';
        el.addBtn.disabled = true;

        if (!imo) return;
        if (!/^\d{7}$/.test(imo)) {
            if (imo.length > 0) el.namePreview.innerHTML = `<span style="color:var(--danger);font-size:.78rem;">✕ Must be exactly 7 digits</span>`;
            return;
        }
        if (!validateIMO(imo)) {
            el.imoInput.style.borderColor = 'var(--danger)';
            el.namePreview.innerHTML = `<span style="color:var(--danger);font-size:.78rem;">✕ Invalid IMO checksum</span>`;
            return;
        }
        if (S.trackedImosCache.includes(imo)) {
            el.imoInput.style.borderColor = 'var(--warning)';
            el.namePreview.innerHTML = `<span style="color:var(--warning);font-size:.78rem;">⚠ Already tracked</span>`;
            return;
        }
        el.imoInput.style.borderColor = 'var(--success)';
        const isSanc = S.sanctionsLoaded && S.sanctionedImos.has(imo);
        const warnHtml = isSanc ? `<div style="background:var(--sanction-dim);border:1px solid rgba(255,69,0,.3);border-radius:8px;padding:8px 11px;margin-bottom:6px;font-size:.76rem;"><strong style="color:var(--sanction);">🚨 SANCTIONED VESSEL</strong><div style="color:var(--text-main);margin-top:2px;font-size:.7rem;">${escapeHtml([...new Set((S.sanctionDetails.get(imo) || []).map(d => d.list))].join(', ') || 'Sanctions list')}</div></div>` : '';
        if (S.staticCache.has(imo)) {
            const c = S.staticCache.get(imo), fc = getFlagCode(c.flag);
            const fh = fc ? `<img src="https://flagcdn.com/24x18/${fc.toLowerCase()}.png" style="width:18px;height:13px;border:1px solid var(--border);border-radius:2px;margin-right:5px;" alt="">` : '';
            el.namePreview.innerHTML = warnHtml + `<div style="display:flex;align-items:center;gap:5px;font-size:.8rem;">${fh}<strong style="color:#fff;">${escapeHtml(c.name || 'IMO ' + imo)}</strong><span style="font-size:.65rem;background:var(--bg-elevated);padding:1px 5px;border-radius:4px;color:var(--text-soft);">cached</span></div>`;
            el.addBtn.disabled = false;
            return;
        }
        S.debounceTimer = setTimeout(async () => {
            el.addBtn.disabled = true;
            el.namePreview.innerHTML = warnHtml + `<span style="color:var(--text-soft);font-size:.78rem;">🔍 Looking up...</span>`;
            try {
                let data = null;
                for (const ep of [`${CONFIG.RENDER_API}/vessel-full/${imo}`, `${CONFIG.RENDER_API}/vessel/${imo}`]) {
                    try { const r = await fetchWithTimeout(ep, {}, 5000); if (r.ok) { data = await r.json(); break; } } catch { }
                }
                if (!data || data.found === false) {
                    el.namePreview.innerHTML = warnHtml + `<span style="color:var(--danger);font-size:.78rem;">✕ IMO ${imo} not found</span>`;
                    el.addBtn.disabled = !isSanc;
                    return;
                }
                const fc = getFlagCode(data.flag);
                const fh = fc ? `<img src="https://flagcdn.com/24x18/${fc.toLowerCase()}.png" style="width:18px;height:13px;border:1px solid var(--border);border-radius:2px;margin-right:5px;" alt="">` : '';
                el.namePreview.innerHTML = warnHtml + `<div style="display:flex;align-items:center;gap:5px;font-size:.8rem;">${fh}<strong style="color:#fff;">${escapeHtml(data.name || data.vessel_name || 'IMO ' + imo)}</strong><span style="color:var(--text-soft);">${escapeHtml(data.ship_type || '')} · ${escapeHtml(data.flag || '')}</span></div>`;
                el.addBtn.disabled = false;
                updateStaticCache(imo, data).catch(() => { });
            } catch {
                el.namePreview.innerHTML = warnHtml + `<span style="color:var(--warning);font-size:.78rem;">⚠ Lookup failed — you can still add IMO ${imo}</span>`;
                el.addBtn.disabled = false;
            }
        }, 800);
    });
}

// ═══════════════════════════════════════════════════════════════════════════════
// RENDER VESSELS
// ═══════════════════════════════════════════════════════════════════════════════

function renderVessels(tracked) {
    if (!tracked || tracked.length === 0) {
        el.vesselsContainer.innerHTML = `<div class="empty-state"><div class="icon">🚢</div><p>No vessels tracked yet.</p><small>Add an IMO number above</small></div>`;
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
        const v = S.vesselsDataMap.get(imo) || {};
        const status = getVesselStatus(v), ageData = formatSignalAge(v.last_pos_utc);
        const prio = isPriority(imo), sanc = S.sanctionedImos.has(imo);
        return { imo, v, status, ageData, name: v.name || 'Loading...', rawAgeMs: ageData.rawAgeMs, isPending: !v.name, prio, sanc };
    }).filter(({ imo, v, status, ageData }) => passesFilter(imo, v, status) && passesAgeFilter(ageData));

    items.sort((a, b) => {
        if (S.currentSortKey === 'PRIORITY') {
            if (a.sanc !== b.sanc) return a.sanc ? -1 : 1;
            if (a.prio !== b.prio) return a.prio ? -1 : 1;
            return (ORDER[a.status] ?? 5) - (ORDER[b.status] ?? 5);
        }
        switch (S.currentSortKey) {
            case 'NAME_ASC': return a.name.localeCompare(b.name);
            case 'NAME_DESC': return b.name.localeCompare(a.name);
            case 'STATUS_ASC': return ((ORDER[a.status] ?? 5) - (ORDER[b.status] ?? 5)) || a.name.localeCompare(b.name);
            case 'AGE_ASC': return a.rawAgeMs - b.rawAgeMs;
            default: return b.rawAgeMs - a.rawAgeMs;
        }
    });

    if (!items.length) {
        el.vesselsContainer.innerHTML = `<div class="empty-state"><div class="icon">🔍</div><p>No vessels match this filter.</p></div>`;
        return;
    }

    el.vesselsContainer.innerHTML = '';

    items.forEach(({ imo, v, status, ageData, isPending, prio, sanc }) => {
        try {
            const sc = { UNDERWAY: 'underway', 'AT PORT': 'at_port', 'AT ANCHOR': 'at_anchor', STALLED: 'stalled' }[status] || '';
            const tc = { UNDERWAY: 'status-underway', 'AT PORT': 'status-at_port', 'AT ANCHOR': 'status-at_anchor', STALLED: 'status-stalled', 'DATA PENDING': 'status-unknown' }[status] || 'status-unknown';
            const fc = getFlagCode(v.flag);
            const fh = fc ? `<img src="https://flagcdn.com/24x18/${fc.toLowerCase()}.png" class="flag-icon" alt="${escapeHtml(v.flag || '')}" />` : `<div class="flag-placeholder">🏴</div>`;
            const loaHtml = v.length_overall_m ? `<span class="vessel-loa">${Number(v.length_overall_m).toFixed(0)}m${v.draught_m ? ' / ' + v.draught_m : ''}</span>` : '';
            const etaR = formatEtaCountdown(v.eta_utc);
            const np = v.nearest_port_name || v.nearest_port;
            const di = np ? getPortDepthInfo(np) : null;
            const depthHtml = di ? `<span class="tag depth">⚓ ${di.anchor}</span><span class="tag depth">🏭 ${di.pier}</span>` : '';
            const compat = getPortCompatibility(v.draught_m);

            const sancBanner = sanc ? `<div class="sanction-banner"><div class="sanction-banner-icon">🚨</div><div><div class="sanction-banner-title">SANCTIONED — ${escapeHtml([...new Set((S.sanctionDetails.get(imo) || []).map(d => d.list))].join(' · ') || 'Sanctions List')}</div><div class="sanction-banner-detail">${escapeHtml((S.sanctionDetails.get(imo) || [])[0]?.name || 'Appears on sanctions list')}</div></div></div>` : '';

            const compatHtml = compat ? `
                <div class="section-divider"></div>
                <div class="section-mini-title">Port Compatibility · Draught ${compat[0].draught}m</div>
                <div class="compat-grid">
                    ${compat.map(p => `<div class="compat-port">${CI[p.status] || CI.unknown}<div><div class="compat-port-name">${escapeHtml(p.name)}</div><div class="compat-port-depth">${p.pierDepth != null ? 'Pier ' + p.pierDepth + 'm / Anch ' + p.anchorDepth + 'm' : 'No depth data'}</div></div></div>`).join('')}
                </div>` : '';

            const notesHtml = `
                <div class="section-divider"></div>
                <div class="section-mini-title">📋 Notes <span id="notes-saved-${imo}" class="notes-saved">✓ Saved</span></div>
                <textarea id="notes-${imo}" oninput="onNoteInput('${imo}',this)" placeholder="Agent contact, cargo, special instructions...">${escapeHtml(getNotes(imo))}</textarea>`;

            const card = document.createElement('div');
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
                                    <span class="vessel-name">${escapeHtml(v.name || 'Loading...')}</span>
                                    ${sanc ? `<span class="tag sanction-tag">🚨 Sanctioned</span>` : prio ? `<span style="font-size:.82rem;">🚩</span>` : ''}
                                    ${loaHtml}
                                </div>
                                <div class="vessel-imo">IMO ${imo}</div>
                            </div>
                            <span class="tag ${tc}">${status}</span>
                        </div>
                        ${isPending
                    ? `<div style="display:flex;align-items:center;gap:8px;padding:8px 0;color:var(--text-soft);font-size:.76rem;"><div class="spinner" style="width:14px;height:14px;margin:0;"></div>Waiting for data...</div>`
                    : `<div class="vessel-meta">
                            <div class="meta-row"><span class="meta-label">Signal</span><span class="meta-val ${ageData.ageClass}">${ageData.ageText}</span></div>
                            <div class="meta-row"><span class="meta-label">Dest.</span><span class="meta-val">${escapeHtml(v.destination || '—')}</span></div>
                            <div class="meta-row"><span class="meta-label">Position</span><span class="meta-val"><span class="tag position">${v.lat != null ? Number(v.lat).toFixed(3) : '—'}, ${v.lon != null ? Number(v.lon).toFixed(3) : '—'}</span></span></div>
                            <div class="meta-row"><span class="meta-label">ETA</span><span class="meta-val">${etaR ? `<span class="eta-countdown ${etaR.cls}" data-eta="${escapeHtml(v.eta_utc || '')}">${etaR.text}</span>` : (formatLocalTime(v.eta_utc) || '—')}</span></div>
                        </div>
                        <div class="tag-row">
                            ${v.sog != null ? `<span class="tag speed">⚡ ${Number(v.sog).toFixed(1)} kn</span>` : ''}
                            ${v.cog != null ? `<span class="tag">🧭 ${Number(v.cog).toFixed(0)}°</span>` : ''}
                            ${np ? `<span class="tag">🏝 ${escapeHtml(np)}${v.nearest_distance_nm ? ' ' + Number(v.nearest_distance_nm).toFixed(0) + ' nm' : ''}</span>` : ''}
                            ${depthHtml}
                            ${v.destination_distance_nm ? `<span class="tag distance">🎯 ${Number(v.destination_distance_nm).toFixed(0)} nm</span>` : ''}
                            <div id="weather-${imo}" style="display:contents;"></div>
                        </div>
                        <div class="hint-text">Tap to expand · ${escapeHtml(v.flag || '—')}</div>`
                }
                    </div>
                </div>
                <div id="details-${imo}" class="vessel-expanded">
                    <div class="section-mini-title">📋 Vessel Details</div>
                    <div class="expanded-grid">
                        <div class="exp-item"><div class="exp-label">Ship Type</div><div class="exp-val">${escapeHtml(v.ship_type || '—')}</div></div>
                        <div class="exp-item"><div class="exp-label">DWT</div><div class="exp-val">${v.deadweight_t ? formatNumber(Number(v.deadweight_t) / 1000) + 'k t' : '—'}</div></div>
                        <div class="exp-item"><div class="exp-label">Gross Tonnage</div><div class="exp-val">${v.gross_tonnage ? Number(v.gross_tonnage).toLocaleString() + ' t' : '—'}</div></div>
                        <div class="exp-item"><div class="exp-label">Built</div><div class="exp-val">${escapeHtml(v.year_of_build || '—')}</div></div>
                        <div class="exp-item"><div class="exp-label">Length</div><div class="exp-val">${v.length_overall_m ? Number(v.length_overall_m).toFixed(1) + ' m' : '—'}</div></div>
                        <div class="exp-item"><div class="exp-label">Beam</div><div class="exp-val">${v.beam_m ? Number(v.beam_m).toFixed(1) + ' m' : '—'}</div></div>
                        <div class="exp-item"><div class="exp-label">Draught</div><div class="exp-val">${escapeHtml(v.draught_m || '—')}</div></div>
                        <div class="exp-item"><div class="exp-label">MMSI</div><div class="exp-val">${escapeHtml(v.mmsi || '—')}</div></div>
                        <div class="exp-item"><div class="exp-label">AIS Source</div><div class="exp-val">${escapeHtml(v.ais_source || '—')}</div></div>
                        <div class="exp-item"><div class="exp-label">Flag</div><div class="exp-val">${escapeHtml(v.flag || '—')}</div></div>
                    </div>
                    ${compatHtml}
                    ${notesHtml}
                </div>
                <div class="vessel-footer">
                    <span class="vessel-footer-meta">AIS: ${escapeHtml(v.ais_source || '—')} · ${ageData.ageText}</span>
                    <div class="vessel-footer-actions">
                        <button class="${prio ? 'btn-urgent' : 'btn-ghost'}" style="padding:5px 9px;font-size:.68rem;" onclick="event.stopPropagation();togglePriority('${imo}')">${prio ? '🚩 Priority' : '⑁ Flag'}</button>
                        <button class="btn-danger" style="padding:5px 9px;font-size:.68rem;" onclick="event.stopPropagation();removeIMO('${imo}')">Remove</button>
                    </div>
                </div>
            `;
            el.vesselsContainer.appendChild(card);

            if (v.lat != null && v.lon != null) fetchAndRenderWeather(imo, v.lat, v.lon);
        } catch (err) {
            console.warn(`Card render error IMO ${imo}:`, err);
        }
    });

    startEtaCountdowns();
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAP
// ═══════════════════════════════════════════════════════════════════════════════

function initMap() {
    if (S.mapInitialized) return;
    S.mapInstance = L.map('map', { center: [25, -15], zoom: 5 });
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '© OpenStreetMap, © CARTO', maxZoom: 18
    }).addTo(S.mapInstance);
    S.mapInitialized = true;
    updateMapMarkers();
}

function updateMapMarkers() {
    if (!S.mapInitialized) return;
    S.mapMarkers.forEach(m => m.remove());
    S.mapMarkers = [];
    const colors = { UNDERWAY: '#10b981', 'AT PORT': '#0ea5e9', 'AT ANCHOR': '#f59e0b', STALLED: '#ef4444', 'DATA PENDING': '#4e6a84' };
    for (const imo of S.trackedImosCache) {
        const v = S.vesselsDataMap.get(imo);
        if (!v || v.lat == null || v.lon == null) continue;
        const status = getVesselStatus(v), color = S.sanctionedImos.has(imo) ? '#ff4500' : (colors[status] || '#4e6a84');
        const cog = v.cog ? Number(v.cog) : 0;
        const icon = L.divIcon({
            className: '',
            html: `<div style="transform:rotate(${cog}deg);width:22px;height:22px;"><svg viewBox="0 0 24 24" fill="${color}" style="filter:drop-shadow(0 0 6px ${color}90);"><path d="M12 2L5 20l7-3.5L19 20Z"/></svg></div>`,
            iconSize: [22, 22], iconAnchor: [11, 11], popupAnchor: [0, -12]
        });
        const age = formatSignalAge(v.last_pos_utc), isSanc = S.sanctionedImos.has(imo);
        const popup = `<div style="font-family:sans-serif;min-width:185px;">${isSanc ? `<div style="background:rgba(255,69,0,.15);border:1px solid rgba(255,69,0,.3);border-radius:5px;padding:4px 8px;margin-bottom:7px;font-size:.7rem;color:#ff4500;font-weight:700;">🚨 SANCTIONED</div>` : ''}<div style="font-weight:700;font-size:.9rem;color:#fff;margin-bottom:3px;">${escapeHtml(v.name || 'IMO ' + imo)}</div><div style="font-size:.7rem;color:#94a3b8;margin-bottom:7px;">IMO ${imo} · ${escapeHtml(v.flag || '—')}</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:3px;font-size:.74rem;"><div><span style="color:#64748b;">Status</span><br><strong style="color:${color};">${status}</strong></div><div><span style="color:#64748b;">Signal</span><br><strong>${age.ageText}</strong></div><div><span style="color:#64748b;">Speed</span><br><strong>${v.sog != null ? Number(v.sog).toFixed(1) + ' kn' : '—'}</strong></div><div><span style="color:#64748b;">Course</span><br><strong>${v.cog != null ? Number(v.cog).toFixed(0) + '°' : '—'}</strong></div></div>${v.destination ? `<div style="margin-top:6px;font-size:.7rem;"><span style="color:#64748b;">Dest: </span><strong>${escapeHtml(v.destination)}</strong></div>` : ''}</div>`;
        const marker = L.marker([Number(v.lat), Number(v.lon)], { icon }).bindPopup(popup);
        marker.addTo(S.mapInstance);
        S.mapMarkers.push(marker);
    }
}

function toggleView(view) {
    S.currentView = view;
    if (view === 'list') {
        el.listView.style.display = 'block';
        el.mapView.style.display = 'none';
        [el.viewListBtn, document.getElementById('viewListBtnInner')].forEach(b => b?.classList.add('active'));
        [el.viewMapBtn, document.getElementById('viewMapBtnInner')].forEach(b => b?.classList.remove('active'));
    } else {
        el.listView.style.display = 'none';
        el.mapView.style.display = 'block';
        [el.viewListBtn, document.getElementById('viewListBtnInner')].forEach(b => b?.classList.remove('active'));
        [el.viewMapBtn, document.getElementById('viewMapBtnInner')].forEach(b => b?.classList.add('active'));
        setTimeout(() => { initMap(); S.mapInstance?.invalidateSize(); }, 60);
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MOBILE NAV
// ═══════════════════════════════════════════════════════════════════════════════

function mobileNav(tab) {
    ['navFleet', 'navMap', 'navAdd', 'navAlerts', 'navExport'].forEach(id => document.getElementById(id)?.classList.remove('active'));
    if (tab === 'fleet') {
        document.getElementById('navFleet')?.classList.add('active');
        el.addCard.classList.add('hidden');
        toggleView('list');
    } else if (tab === 'map') {
        document.getElementById('navMap')?.classList.add('active');
        el.addCard.classList.add('hidden');
        toggleView('map');
    } else if (tab === 'add') {
        document.getElementById('navAdd')?.classList.add('active');
        el.addCard.classList.remove('hidden');
        el.addCard.scrollIntoView({ behavior: 'smooth' });
        setTimeout(() => el.imoInput.focus(), 300);
    } else if (tab === 'export') {
        document.getElementById('navExport')?.classList.add('active');
        exportCSV();
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORT CSV
// ═══════════════════════════════════════════════════════════════════════════════

function exportCSV() {
    const h = ['IMO', 'Vessel', 'Status', 'Sanctioned', 'Priority', 'Flag', 'Lat', 'Lon', 'Speed(kn)', 'Course', 'Destination', 'Signal Age', 'DWT', 'Ship Type', 'LOA(m)', 'Built', 'Draught(m)'];
    const rows = S.trackedImosCache.map(imo => {
        const v = S.vesselsDataMap.get(imo) || {}, a = formatSignalAge(v.last_pos_utc);
        return [imo, v.name || '', getVesselStatus(v), S.sanctionedImos.has(imo) ? 'YES' : 'NO', isPriority(imo) ? 'YES' : 'NO', v.flag || '', v.lat || '', v.lon || '', v.sog != null ? Number(v.sog).toFixed(1) : '', v.cog != null ? Number(v.cog).toFixed(0) : '', v.destination || '', a.ageText, v.deadweight_t || '', v.ship_type || '', v.length_overall_m || '', v.year_of_build || '', v.draught_m || ''];
    });
    const csv = [h, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    Object.assign(document.createElement('a'), { href: url, download: `fleet_${new Date().toISOString().slice(0, 10)}.csv` }).click();
    URL.revokeObjectURL(url);
    updateStatus('Fleet report exported', 'success');
}

// ═══════════════════════════════════════════════════════════════════════════════
// CLOCK
// ═══════════════════════════════════════════════════════════════════════════════

function tickClock() {
    const n = new Date(), p = v => String(v).padStart(2, '0');
    if (el.headerClock) el.headerClock.textContent = `${p(n.getUTCHours())}:${p(n.getUTCMinutes())}:${p(n.getUTCSeconds())} UTC`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PULL TO REFRESH
// ═══════════════════════════════════════════════════════════════════════════════

function initPullToRefresh() {
    let startY = 0, pulling = false;
    document.addEventListener('touchstart', e => { if (window.scrollY === 0) { startY = e.touches[0].clientY; pulling = true; } }, { passive: true });
    document.addEventListener('touchmove', e => { if (!pulling) return; if (e.touches[0].clientY - startY > 60 && el.ptrIndicator) { el.ptrIndicator.classList.add('show'); el.ptrIndicator.textContent = '↓ Release to refresh'; } }, { passive: true });
    document.addEventListener('touchend', e => {
        if (!pulling) return;
        pulling = false;
        const dy = e.changedTouches[0].clientY - startY;
        if (dy > 60 && el.ptrIndicator) {
            el.ptrIndicator.textContent = '↻ Refreshing...';
            loadData().then(() => el.ptrIndicator.classList.remove('show'));
        } else if (el.ptrIndicator) el.ptrIndicator.classList.remove('show');
    });
}

// ═══════════════════════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════════════════════

function init() {
    console.log('🚢 VesselTracker v5.5 — Final');

    // i18n shim: only install AFTER DOMContentLoaded so translations.js gets
    // first chance to define window.i18n. If it didn't, provide a safe no-op.
    if (typeof i18n === 'undefined') {
        window.i18n = { currentLang: 'EN', init() { }, setLang(l) { this.currentLang = l; } };
    }
    try { if (i18n.init) i18n.init(); } catch (e) { console.warn('i18n.init failed:', e); }

    // Sort selects
    if (el.sortSelect) el.sortSelect.value = S.currentSortKey;
    if (el.sortSelectMobile) el.sortSelectMobile.value = S.currentSortKey;

    // Render alerts
    renderAlerts();
    updateAlertBadge();

    // Load cache immediately
    if (loadCachedData()) updateStatus('Loaded from cache', 'success');

    // IMO input
    setupImoInput();

    // Add vessel button
    if (el.addBtn) el.addBtn.addEventListener('click', addVessel);
    if (el.imoInput) {
        el.imoInput.addEventListener('keydown', e => { if (e.key === 'Enter' && !el.addBtn.disabled) addVessel(); });
    }

    // Search
    if (el.searchInput) {
        el.searchInput.addEventListener('input', () => {
            S.searchQuery = el.searchInput.value.trim().toLowerCase();
            renderVessels(S.trackedImosCache);
        });
    }

    // Filter chips
    document.querySelectorAll('.chip[data-filter]').forEach(chip => {
        chip.addEventListener('click', () => setFilter(chip.dataset.filter, chip));
    });

    // Age filter (desktop)
    if (el.ageFilter) {
        el.ageFilter.addEventListener('change', () => {
            S.currentAgeFilter = el.ageFilter.value;
            if (el.ageFilterMobile) el.ageFilterMobile.value = S.currentAgeFilter;
            renderVessels(S.trackedImosCache);
        });
    }

    // Sort select (desktop)
    if (el.sortSelect) {
        el.sortSelect.addEventListener('change', () => {
            S.currentSortKey = el.sortSelect.value;
            localStorage.setItem('vt_sort', S.currentSortKey);
            if (el.sortSelectMobile) el.sortSelectMobile.value = S.currentSortKey;
            renderVessels(S.trackedImosCache);
        });
    }

    // View toggles (header buttons)
    if (el.viewListBtn) el.viewListBtn.addEventListener('click', () => toggleView('list'));
    if (el.viewMapBtn) el.viewMapBtn.addEventListener('click', () => toggleView('map'));

    // Refresh button
    if (el.refreshButton) el.refreshButton.addEventListener('click', loadData);

    // Alerts
    el.alertOverlay.addEventListener('click', closeAlertPanel);
    const alertsBtn = document.getElementById('alertsBtn');
    if (alertsBtn) alertsBtn.addEventListener('click', toggleAlertPanel);

    // Confirm modal
    if (el.confirmCancel) el.confirmCancel.addEventListener('click', () => { el.confirmModal.classList.add('hidden'); S.vesselToRemove = null; });
    if (el.confirmOk) el.confirmOk.addEventListener('click', () => { if (S.vesselToRemove) removeIMOConfirmed(S.vesselToRemove); el.confirmModal.classList.add('hidden'); });

    // Language toggle
    const langToggle = document.getElementById('langToggle');
    if (langToggle) {
        langToggle.addEventListener('click', () => {
            const newLang = i18n.currentLang === 'EN' ? 'FR' : 'EN';
            i18n.setLang(newLang);
            langToggle.textContent = newLang === 'FR' ? 'EN' : 'FR';
            renderVessels(S.trackedImosCache);
        });
    }

    // Mobile FAB filter
    if (el.fabFilter) {
        el.fabFilter.addEventListener('click', () => {
            document.getElementById('mobileFilterSheet').style.display = 'flex';
        });
    }

    // Mobile: hide add card initially
    if (window.innerWidth < 641) el.addCard.classList.add('hidden');

    // Responsive FAB visibility
    const updateFabVisibility = () => {
        if (el.fabFilter) el.fabFilter.style.display = window.innerWidth < 641 ? 'flex' : 'none';
    };
    updateFabVisibility();
    window.addEventListener('resize', updateFabVisibility);

    // Pull to refresh
    initPullToRefresh();

    // Clock
    setInterval(tickClock, 1000);
    tickClock();

    // Data
    loadData();
    checkApiStatus();
    loadSanctionsLists().catch(e => {
        console.warn('Sanctions:', e);
        if (el.sanctionsStatus) el.sanctionsStatus.innerHTML = `<span style="color:var(--warning);font-size:.68rem;font-family:var(--mono);">⚠ Sanctions unavailable</span>`;
    });

    // Auto-refresh
    S.refreshInterval = setInterval(loadData, CONFIG.REFRESH_INTERVAL);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

// PWA Service Worker
if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register(
        'data:application/javascript,self.addEventListener("install",()=>self.skipWaiting());self.addEventListener("activate",e=>e.waitUntil(clients.claim()));self.addEventListener("fetch",e=>e.respondWith(fetch(e.request).catch(()=>new Response("Offline"))))'
    ).catch(() => { });
}
