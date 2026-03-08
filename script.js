// ═══════════════════════════════════════════════════════════════════════════════
// VESSELTRACKER v5.5 ENHANCED — All Features + Mobile Fixes
// ═══════════════════════════════════════════════════════════════════════════════

// CONFIG
const CONFIG = {
    USERNAME: 'asmahri2-afk',
    REPO: 'VesselTracker',
    BRANCH: 'main',
    RENDER_API: 'https://vessel-api-s85s.onrender.com',
    WEATHER_API: 'https://api.open-meteo.com/v1/forecast',
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

// GLOBAL STATE
const S = {
    isApiBusy: false,
    vesselsDataMap: new Map(),
    staticCache: new Map(),
    portsData: {},
    currentSortKey: localStorage.getItem('vt_sort') || 'PRIORITY',
    currentStatusFilter: 'ALL',
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

// DOM ELEMENTS
const el = {
    headerClock: document.getElementById('headerClock'),
    lastUpdatedTime: document.getElementById('lastUpdatedTime'),
    addBtn: document.getElementById('addBtn'),
    addCard: document.getElementById('addCard'),
    imoInput: document.getElementById('imoInput'),
    namePreview: document.getElementById('namePreview'),
    statusFilter: document.getElementById('statusFilter'),
    ageFilter: document.getElementById('ageFilter'),
    sortSelect: document.getElementById('sortSelect'),
    vesselsContainer: document.getElementById('vesselsContainer'),
    confirmModal: document.getElementById('confirmModal'),
    confirmText: document.getElementById('confirmText'),
    confirmCancel: document.getElementById('confirmCancel'),
    confirmOk: document.getElementById('confirmOk'),
    alertPanel: document.getElementById('alertPanel'),
    alertOverlay: document.getElementById('alertOverlay'),
    alertList: document.getElementById('alertList'),
    alertBadge: document.getElementById('alertBadge'),
    listView: document.getElementById('listView'),
    mapView: document.getElementById('mapView'),
    viewListBtn: document.getElementById('viewListBtn'),
    viewMapBtn: document.getElementById('viewMapBtn'),
    map: document.getElementById('map'),
    systemHealth: document.getElementById('systemHealth'),
    dataStats: document.getElementById('dataStats'),
    vesselCount: document.getElementById('vesselCount'),
    apiStatus: document.getElementById('apiStatus'),
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
    filterSection: document.getElementById('filterSection'),
    fabFilter: document.getElementById('fabFilter'),
    filterCloseBtn: document.getElementById('filterCloseBtn'),
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
    // Try ISO first
    const iso = new Date(s);
    if (!isNaN(iso.getTime()) && s.includes('T')) return iso;
    // "Mar 07, 2026 00:05 UTC" format
    const m = s.replace(' UTC', '').trim().match(/^(\w{3})\s+(\d{1,2}),\s+(\d{4})\s+(\d{2}):(\d{2})$/);
    if (m) {
        const months = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
        const mo = months[m[1]];
        if (mo === undefined) return null;
        return new Date(Date.UTC(+m[3], mo, +m[2], +m[4], +m[5]));
    }
    // "2026-03-07 00:05:00 UTC" format
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
        if (ms < 60000) {
            a = 'Just now';
            c = 'age-recent';
        } else if (h < 1) {
            const minutes = Math.floor(ms / 60000);
            a = `${minutes}m ago`;
            c = minutes <= 30 ? 'age-recent' : 'age-moderate';
        } else if (h < 24) {
            a = `${h.toFixed(1)}h ago`;
            c = h <= 3 ? 'age-recent' : 'age-moderate';
        } else {
            a = `${Math.floor(h / 24)}d ago`;
            c = 'age-stale';
        }
        if (ms > CONFIG.CRITICAL_THRESHOLD_MS) c = 'status-critical';
        return { ageText: a, ageClass: c, rawAgeMs: ms };
    } catch {
        return { ageText: 'Error', ageClass: 'age-stale', rawAgeMs: Infinity };
    }
}

function formatLocalTime(s) {
    if (!s) return 'N/A';
    try {
        const d = parseAisTimestamp(s) || new Date(s);
        if (isNaN(d.getTime())) return 'Invalid';
        const diff = d.getTime() - Date.now();
        const abs = Math.abs(diff);
        if (abs < 60000) return 'Arriving Now';
        if (diff > 0) {
            if (diff < 3600000) return `in ${Math.floor(abs / 60000)}m`;
            if (diff < 86400000) return `in ${Math.floor(abs / 3600000)}h`;
        } else {
            if (abs < 3600000) return `${Math.floor(abs / 60000)}m ago`;
            if (abs < 86400000) return `${Math.floor(abs / 3600000)}h ago`;
        }
        return d.toLocaleDateString(navigator.language, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch {
        return s;
    }
}

function formatEtaCountdown(utcString) {
    if (!utcString) return null;
    try {
        const eta = parseAisTimestamp(utcString) || new Date(utcString);
        if (isNaN(eta.getTime())) return null;
        const diff = eta - Date.now();
        const abs = Math.abs(diff);
        const h = Math.floor(abs / 3600000);
        const m = Math.floor((abs % 3600000) / 60000);
        const s = Math.floor((abs % 60000) / 1000);
        const p = v => String(v).padStart(2, '0');
        if (abs < 60000) return { text: 'Arriving Now', cls: 'arrived' };
        if (diff > 0) return { text: `ETA ${h > 0 ? h + 'h ' : ''}${p(m)}m ${p(s)}s`, cls: '' };
        return { text: `${h > 0 ? h + 'h ' : ''}${p(m)}m overdue`, cls: 'overdue' };
    } catch {
        return null;
    }
}

function startEtaCountdowns() {
    if (S.etaInterval) clearInterval(S.etaInterval);
    S.etaInterval = setInterval(() => {
        document.querySelectorAll('[data-eta]').forEach(e => {
            try {
                const r = formatEtaCountdown(e.getAttribute('data-eta'));
                if (r) {
                    e.textContent = r.text;
                    e.className = `eta-countdown ${r.cls}`;
                }
            } catch { }
        });
    }, 1000);
}

function getVesselStatus(v) {
    if (!v || !v.name || v.sog === undefined || v.sog === null) return 'DATA PENDING';
    const sog = parseFloat(v.sog);
    const dd = parseFloat(v.destination_distance_nm);
    const nd = parseFloat(v.nearest_distance_nm);
    const dest = (v.destination || '').toUpperCase();
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
    for (const [k, v] of Object.entries(m)) {
        if (u.includes(k) || k.includes(u)) return v;
    }
    const pm = f.match(/\(([A-Z]{2})\)/);
    if (pm) return pm[1];
    return null;
}

function isPriority(imo) {
    return S.priorities.includes(imo);
}

// ═══════════════════════════════════════════════════════════════════════════════
// WEATHER
// ═══════════════════════════════════════════════════════════════════════════════

const _weatherPending = new Set();

async function fetchAndRenderWeather(imo, lat, lon) {
    if (!lat || !lon) return;
    const c = document.getElementById(`weather-${imo}`);
    if (!c) return;
    
    const cached = S.weatherCache.get(imo);
    if (cached && Date.now() - cached.ts < 30 * 60000) {
        const p = [];
        if (cached.wave != null) p.push(`<span class="tag weather">🌊 ${Number(cached.wave).toFixed(1)}m</span>`);
        if (cached.wind != null) p.push(`<span class="tag weather">💨 ${Number(cached.wind).toFixed(0)}kn</span>`);
        if (p.length) c.innerHTML = p.join('');
        return;
    }
    
    if (_weatherPending.has(imo)) return;
    _weatherPending.add(imo);
    
    try {
        const [mr, wr] = await Promise.all([
            fetch(`https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lon}&current=wave_height`),
            fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=wind_speed_10m&wind_speed_unit=kn`)
        ]);
        const md = await mr.json();
        const wd = await wr.json();
        const result = { wave: md.current?.wave_height, wind: wd.current?.wind_speed_10m, ts: Date.now() };
        S.weatherCache.set(imo, result);
        
        const el2 = document.getElementById(`weather-${imo}`);
        if (!el2) return;
        const p = [];
        if (result.wave != null) p.push(`<span class="tag weather">🌊 ${Number(result.wave).toFixed(1)}m</span>`);
        if (result.wind != null) p.push(`<span class="tag weather">💨 ${Number(result.wind).toFixed(0)}kn</span>`);
        if (p.length) el2.innerHTML = p.join('');
    } catch (e) {
        console.warn(`Weather fetch failed for ${imo}:`, e.message);
    } finally {
        _weatherPending.delete(imo);
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ALERTS SYSTEM
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
    
    S.alerts.unshift({
        id: Date.now() + Math.random(),
        type, imo, vessel, msg,
        icon: icons[type] || '•',
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        read: false
    });
    
    if (S.alerts.length > 60) S.alerts.pop();
    localStorage.setItem('vt_alerts', JSON.stringify(S.alerts));
    renderAlerts();
    updateAlertBadge();
}

function renderAlerts() {
    if (!S.alerts.length) {
        el.alertList.innerHTML = '<div class="alert-empty">📡 Monitoring fleet activity...</div>';
        return;
    }
    el.alertList.innerHTML = S.alerts.map(a => `
        <div class="alert-item ${a.read ? '' : 'unread'} type-${a.type}">
            <div><span style="margin-right:4px;">${a.icon}</span><span class="alert-msg">${escapeHtml(a.msg)}</span></div>
            <div class="alert-time">${a.time} · IMO ${a.imo}</div>
        </div>
    `).join('');
}

function updateAlertBadge() {
    const n = S.alerts.filter(a => !a.read).length;
    if (el.alertBadge) {
        el.alertBadge.textContent = n;
        el.alertBadge.classList.toggle('hidden', n === 0);
    }
}

function toggleAlertPanel() {
    const open = el.alertPanel.classList.toggle('open');
    el.alertOverlay.classList.toggle('show', open);
    if (open) markAllAlertsRead();
}

function closeAlertPanel() {
    el.alertPanel.classList.remove('open');
    el.alertOverlay.classList.remove('show');
}

function markAllAlertsRead() {
    S.alerts.forEach(a => a.read = true);
    localStorage.setItem('vt_alerts', JSON.stringify(S.alerts));
    renderAlerts();
    updateAlertBadge();
}

function clearAlerts() {
    S.alerts = [];
    localStorage.setItem('vt_alerts', JSON.stringify(S.alerts));
    renderAlerts();
    updateAlertBadge();
}

// ═══════════════════════════════════════════════════════════════════════════════
// SANCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

async function loadSanctionsLists() {
    try {
        console.log('🔍 Loading sanctions from:', CONFIG.SANCTIONS_URL);
        const res = await fetchWithTimeout(CONFIG.SANCTIONS_URL, { cache: 'no-cache' }, 10000);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        console.log('📄 Raw data:', { entries: data.entries?.length, total: data.total });
        
        const dmap = new Map();
        let databaseTotal = data.total || 0;  // Get total from database
        
        // Handle new format: entries array with lists field
        if (data.entries && Array.isArray(data.entries)) {
            console.log(`✅ Parsing ${data.entries.length} entries from new format`);
            data.entries.forEach(e => {
                const imo = String(e.imo).replace(/\D/g, '');
                if (!dmap.has(imo)) dmap.set(imo, []);
                const lists = Array.isArray(e.lists) ? e.lists.join(', ') : e.lists || 'Unknown';
                dmap.get(imo).push({ list: lists, name: e.name || `IMO ${imo}`, reason: e.program || '' });
            });
        }
        // Handle old format: separate arrays by list type
        else {
            console.log('⚠️ Parsing old format');
            function addD(imo, list, name, reason) {
                if (!dmap.has(imo)) dmap.set(imo, []);
                dmap.get(imo).push({ list, name, reason });
            }
            if (data.OFAC_SDN) data.OFAC_SDN.forEach(e => addD(String(e.imo).replace(/\D/g, ''), 'OFAC', e.name, e.reason));
            if (data.UN_UNSC) data.UN_UNSC.forEach(e => addD(String(e.imo).replace(/\D/g, ''), 'UN', e.name, ''));
            if (data.EU_CONSOLIDATED) data.EU_CONSOLIDATED.forEach(e => addD(String(e.imo).replace(/\D/g, ''), 'EU', e.name, ''));
        }
        
        S.sanctionedImos = new Set(dmap.keys());
        S.sanctionDetails = dmap;
        S.sanctionsLoaded = true;
        
        const fleetCount = S.sanctionedImos.size;
        const displayCount = databaseTotal > 0 ? databaseTotal : fleetCount;
        console.log(`✅ Sanctions DB: ${displayCount} vessels, Fleet: ${fleetCount} match`);
        console.log('Sample sanctioned IMOs:', Array.from(S.sanctionedImos).slice(0, 10));
        
        const updated = data.updated ? ' · ' + new Date(data.updated).toLocaleDateString() : '';
        if (el.sanctionsStatus) {
            el.sanctionsStatus.innerHTML = `<span style="color:var(--success);font-size:.68rem;font-family:var(--mono);">✓ Monitoring ${displayCount} sanctioned vessels${updated}</span>`;
        }
    } catch (e) {
        console.error('❌ Sanctions load failed:', e.message);
        if (el.sanctionsStatus) {
            el.sanctionsStatus.innerHTML = `<span style="color:var(--warning);font-size:.68rem;font-family:var(--mono);">⚠ Sanctions unavailable</span>`;
        }
    }
}

function checkFleetSanctions() {
    for (const imo of S.trackedImosCache) {
        if (S.sanctionedImos.has(imo) && !S.alerts.some(a => a.type === 'sanctioned' && a.imo === imo)) {
            const d = S.sanctionDetails.get(imo) || [];
            const lists = [...new Set(d.map(x => x.list))].join(', ');
            const v = S.vesselsDataMap.get(imo);
            pushAlert('sanctioned', imo, v?.name || `IMO ${imo}`, `🚨 SANCTIONED: ${lists}`);
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// STORAGE & UTILITIES
// ═══════════════════════════════════════════════════════════════════════════════

function saveToLocalStorage() {
    try {
        localStorage.setItem('vt_cache', JSON.stringify({
            vessels: Array.from(S.vesselsDataMap.entries()),
            tracked: S.trackedImosCache,
            timestamp: Date.now()
        }));
    } catch (e) {
        console.warn(e);
    }
}

function loadCachedData() {
    try {
        const raw = localStorage.getItem('vt_cache');
        if (!raw) return false;
        const data = JSON.parse(raw);
        if (Date.now() - data.timestamp > 3600000) return false;
        S.vesselsDataMap = new Map(data.vessels || []);
        S.trackedImosCache = data.tracked || [];
        if (S.trackedImosCache.length > 0) {
            renderVessels(S.trackedImosCache);
            return true;
        }
    } catch (e) {
        console.warn(e);
    }
    return false;
}

function getNotes(imo) {
    return localStorage.getItem(`vt_notes_${imo}`) || '';
}

function saveNotes(imo, text) {
    localStorage.setItem(`vt_notes_${imo}`, text);
    const s = document.getElementById(`notes-saved-${imo}`);
    if (s) {
        s.classList.add('show');
        setTimeout(() => s.classList.remove('show'), 1800);
    }
}

function onNoteInput(imo, ta) {
    clearTimeout(S.noteTimers[imo]);
    S.noteTimers[imo] = setTimeout(() => saveNotes(imo, ta.value), 600);
}

function togglePriority(imo) {
    if (isPriority(imo)) {
        S.priorities = S.priorities.filter(x => x !== imo);
    } else {
        S.priorities.push(imo);
        pushAlert('priority', imo, imo, `IMO ${imo} flagged as Priority`);
    }
    localStorage.setItem('vt_priorities', JSON.stringify(S.priorities));
    renderVessels(S.trackedImosCache);
}

function toggleDetails(imo) {
    const el = document.getElementById(`details-${imo}`);
    if (el) el.classList.toggle('show');
}

function showLoading(msg = 'Loading...') {
    el.loadingText.textContent = msg;
    el.loadingOverlay.classList.remove('hidden');
}

function hideLoading() {
    el.loadingOverlay.classList.add('hidden');
}

function updateStatus(msg, type = 'info') {
    el.statusMsg.textContent = msg;
    el.statusMsg.className = `status-msg ${type === 'info' ? '' : type}`;
    if (type === 'success') {
        setTimeout(() => {
            if (el.statusMsg.textContent === msg) {
                el.statusMsg.textContent = 'Ready';
                el.statusMsg.className = 'status-msg';
            }
        }, 5000);
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// API & GITHUB
// ═══════════════════════════════════════════════════════════════════════════════

async function fetchWithTimeout(url, options = {}, timeout = 8000) {
    const ctrl = new AbortController();
    const id = setTimeout(() => ctrl.abort(), timeout);
    try {
        const r = await fetch(url, { ...options, signal: ctrl.signal });
        clearTimeout(id);
        return r;
    } catch (e) {
        clearTimeout(id);
        throw e;
    }
}

async function checkApiStatus() {
    try {
        await fetchWithTimeout(`${CONFIG.RENDER_API}/ping`, { method: 'GET' }, 5000);
        el.apiStatus.textContent = 'API: Online';
        el.apiStatus.style.cssText = 'border-color:rgba(16,185,129,.4);color:var(--success);';
    } catch {
        try {
            await fetchWithTimeout(`${CONFIG.RAW_BASE}${CONFIG.TRACKED_PATH}`, { method: 'HEAD' }, 5000);
            el.apiStatus.textContent = 'API: Limited';
            el.apiStatus.style.cssText = 'border-color:rgba(245,158,11,.4);color:var(--warning);';
        } catch {
            el.apiStatus.textContent = 'API: Offline';
            el.apiStatus.style.cssText = 'border-color:rgba(239,68,68,.4);color:var(--danger);';
        }
    }
}

async function fetchGitHubData(path, fallback = null) {
    const url = `${CONFIG.RAW_BASE}${path}?_=${Date.now()}`;
    const res = await fetchWithTimeout(url, { cache: 'no-cache' }, 10000);
    if (!res.ok) throw new Error(`GitHub raw ${res.status}: ${path}`);
    try {
        const data = await res.json();
        return { data, sha: null, lastMod: Date.now(), source: 'raw' };
    } catch {
        return { data: fallback, sha: null, lastMod: Date.now(), source: 'error' };
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// LOAD DATA
// ═══════════════════════════════════════════════════════════════════════════════

async function loadData() {
    if (S.isApiBusy) return;
    S.isApiBusy = true;
    if (el.refreshButton) el.refreshButton.disabled = true;
    
    try {
        const [ti, vi, si, pi] = await Promise.all([
            fetchGitHubData(CONFIG.TRACKED_PATH, []),
            fetchGitHubData(CONFIG.VESSELS_PATH, {}),
            fetchGitHubData(CONFIG.STATIC_CACHE_PATH, {}),
            fetchGitHubData(CONFIG.PORTS_PATH, {})
        ]);
        
        const tracked = (Array.isArray(ti.data) ? ti.data : ti.data?.tracked_imos || []).map(String);
        S.trackedImosCache = tracked;
        
        const vl = vi.data && typeof vi.data === 'object' && !Array.isArray(vi.data) ? Object.values(vi.data).filter(v => v?.imo) : [];
        const nm = new Map();
        vl.forEach(v => nm.set(String(v.imo), v));
        S.vesselsDataMap = nm;
        S.staticCache = new Map(Object.entries(si.data || {}));
        S.portsData = pi.data || {};
        
        S.lastDataModified = new Date();
        saveToLocalStorage();
        generateAlerts(nm, tracked);
        updateAlertBadge();
        updateSystemHealth(vi.lastMod, vl.length, vi.source);
        updateFleetKPI(tracked);
        
        if (el.vesselCount) el.vesselCount.textContent = `${tracked.length} vessel${tracked.length !== 1 ? 's' : ''} tracked`;
        if (el.dataStats) el.dataStats.textContent = `${vl.length} in database · ${vi.source}`;
        if (el.lastUpdatedTime) {
            const locale = i18n.currentLang === 'FR' ? 'fr-FR' : 'en-US';
            el.lastUpdatedTime.textContent = S.lastDataModified.toLocaleString(locale, {
                month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
            });
        }
        
        renderVessels(S.trackedImosCache);
    } catch (err) {
        console.error('Load error:', err);
        updateStatus(`Error: ${err.message}`, 'error');
    } finally {
        S.isApiBusy = false;
        if (el.refreshButton) el.refreshButton.disabled = false;
    }
}

function generateAlerts(newMap, trackedImos) {
    const isFirst = S.previousVesselStates.size === 0;
    for (const imo of trackedImos) {
        const v = newMap.get(imo);
        if (!v) continue;
        const ns = getVesselStatus(v);
        const prev = S.previousVesselStates.get(imo);
        const age = formatSignalAge(v.last_pos_utc);
        
        if (!isFirst && prev) {
            if (prev.status !== ns) {
                if (ns === 'STALLED') pushAlert('stalled', imo, v.name, `${v.name || 'IMO ' + imo} has stopped moving`);
                if (ns === 'AT PORT') pushAlert('arrived', imo, v.name, `${v.name || 'IMO ' + imo} arrived at port`);
                if (ns === 'AT ANCHOR') pushAlert('arrived', imo, v.name, `${v.name || 'IMO ' + imo} now at anchor`);
            }
            if (age.rawAgeMs > CONFIG.STALE_THRESHOLD_MS && prev.signalAgeMs <= CONFIG.STALE_THRESHOLD_MS) {
                pushAlert('stale', imo, v.name, `${v.name || 'IMO ' + imo} AIS signal lost (${age.ageText})`);
            }
            const dd = parseFloat(v.destination_distance_nm);
            if (!isNaN(dd) && dd <= 50 && (prev.destDist == null || prev.destDist > 50)) {
                pushAlert('approaching', imo, v.name, `${v.name || 'IMO ' + imo} approaching (${dd.toFixed(0)} nm)`);
            }
        }
        S.previousVesselStates.set(imo, { status: ns, signalAgeMs: age.rawAgeMs, destDist: parseFloat(v.destination_distance_nm) || null });
    }
    if (S.sanctionsLoaded) checkFleetSanctions();
}

function updateSystemHealth(lastMod, count, source) {
    const health = Math.min(100, Math.floor(100 * count / 1000));
    if (el.systemHealth) {
        el.systemHealth.innerHTML = `System health: <span style="color:${health > 70 ? 'var(--success)' : health > 40 ? 'var(--warning)' : 'var(--danger)'};">${health}%</span>`;
    }
}

function updateFleetKPI(trackedImos) {
    let underway = 0, atPort = 0, atAnchor = 0, stalled = 0;
    trackedImos.forEach(imo => {
        const v = S.vesselsDataMap.get(imo);
        if (!v) return;
        const status = getVesselStatus(v);
        if (status === 'UNDERWAY') underway++;
        else if (status === 'AT PORT') atPort++;
        else if (status === 'AT ANCHOR') atAnchor++;
        else if (status === 'STALLED') stalled++;
    });
    if (el.kpiTotal) el.kpiTotal.textContent = trackedImos.length;
    if (el.kpiUnderway) el.kpiUnderway.textContent = underway;
    if (el.kpiAtPort) el.kpiAtPort.textContent = atPort;
    if (el.kpiAtAnchor) el.kpiAtAnchor.textContent = atAnchor;
    if (el.kpiStalled) el.kpiStalled.textContent = stalled;
}

// ═══════════════════════════════════════════════════════════════════════════════
// VESSEL MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

function removeIMO(imo) {
    el.confirmText.textContent = `${i18n.currentLang === 'FR' ? 'Supprimer ce navire ?' : 'Remove this vessel?'}`;
    el.confirmModal.style.display = 'flex';
    S.vesselToRemove = imo;
}

function removeIMOConfirmed(imo) {
    S.trackedImosCache = S.trackedImosCache.filter(x => x !== imo);
    S.priorities = S.priorities.filter(x => x !== imo);
    renderVessels(S.trackedImosCache);
    updateFleetKPI(S.trackedImosCache);
    pushAlert('removed', imo, imo, `IMO ${imo} removed from tracking`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// RENDERING
// ═══════════════════════════════════════════════════════════════════════════════

function renderVessels(tracked) {
    if (!tracked || tracked.length === 0) {
        el.vesselsContainer.innerHTML = `<div class="empty-state"><div class="icon">🚢</div><p>No vessels tracked yet.</p><small>Add an IMO number above</small></div>`;
        return;
    }
    
    const ORDER = { UNDERWAY: 0, 'AT PORT': 1, 'AT ANCHOR': 2, STALLED: 3, 'DATA PENDING': 4 };
    const items = tracked.map(imo => {
        const v = S.vesselsDataMap.get(imo) || {};
        const status = getVesselStatus(v);
        const ageData = formatSignalAge(v.last_pos_utc);
        const prio = isPriority(imo);
        const sanc = S.sanctionedImos.has(imo);
        return { imo, v, status, ageData, name: v.name || 'Loading...', rawAgeMs: ageData.rawAgeMs, isPending: !v.name, prio, sanc };
    }).filter(({ imo, v, status }) => {
        if (el.statusFilter.value !== 'ALL' && status !== el.statusFilter.value) return false;
        if (el.ageFilter.value !== 'ALL') {
            const ageData = formatSignalAge(v.last_pos_utc);
            const ageHours = ageData.rawAgeMs / (1000 * 60 * 60);
            if (el.ageFilter.value === '1H' && ageHours > 1) return false;
            if (el.ageFilter.value === '6H' && ageHours > 6) return false;
            if (el.ageFilter.value === '24H' && ageHours > 24) return false;
            if (el.ageFilter.value === 'STALE' && ageHours <= 24) return false;
        }
        return true;
    });
    
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
            
            const vName = escapeHtml(v.name || 'Loading...');
            const vDest = escapeHtml(v.destination_port || v.destination || '—');
            const vFlag = escapeHtml(v.flag || '—');
            const loaHtml = v.length_overall_m ? `<span class="vessel-loa">${Number(v.length_overall_m).toFixed(0)}m</span>` : '';
            const etaR = formatEtaCountdown(v.eta_utc);
            
            const sancBanner = sanc ? `<div class="sanction-banner"><div class="sanction-banner-icon">🚨</div><div class="sanction-banner-body"><div class="sanction-banner-title">SANCTIONED</div><div class="sanction-banner-detail">${escapeHtml((S.sanctionDetails.get(imo) || [])[0]?.name || 'Sanctions List')}</div></div></div>` : '';
            
            const card = document.createElement('div');
            card.className = `vessel-card ${sanc ? 'sanctioned' : prio ? 'priority' : sc}`;
            card.innerHTML = `${sancBanner}
                <div class="vessel-card-inner">
                    ${prio && !sanc ? `<div class="priority-indicator"></div>` : ''}
                    <div class="vessel-main" onclick="toggleDetails('${imo}')">
                        <div class="vessel-top">
                            <div>
                                <div class="vessel-name-block">
                                    ${fh}<span class="vessel-name">${vName}</span>
                                    ${sanc ? `<span class="tag sanction-tag">🚨 Sanctioned</span>` : prio ? `<span style="font-size:.82rem;">🚩</span>` : ''} ${loaHtml}
                                </div>
                                <div class="vessel-imo">IMO ${imo}</div>
                            </div>
                            <span class="tag ${tc}">${status}</span>
                        </div>
                        ${isPending ? `<div style="display:flex;align-items:center;gap:8px;padding:8px 0;color:var(--text-soft);font-size:.76rem;"><div class="spinner" style="width:14px;height:14px;margin:0;"></div>Waiting for data...</div>` : `
                            <div class="vessel-meta">
                                <div class="meta-row"><span class="meta-label">Signal</span><span class="meta-val ${ageData.ageClass}">${ageData.ageText}</span></div>
                                <div class="meta-row"><span class="meta-label">Speed</span><span class="meta-val">${v.sog != null ? Number(v.sog).toFixed(1) + ' kn' : '—'}</span></div>
                                <div class="meta-row"><span class="meta-label">Course</span><span class="meta-val">${v.cog != null ? Number(v.cog).toFixed(0) + '°' : '—'}</span></div>
                                <div class="meta-row"><span class="meta-label">Position</span><span class="meta-val"><span class="tag position">${v.lat != null ? Number(v.lat).toFixed(3) : '—'}, ${v.lon != null ? Number(v.lon).toFixed(3) : '—'}</span></span></div>
                                <div class="meta-row"><span class="meta-label">Nearest Port</span><span class="meta-val">${v.nearest_port ? escapeHtml(v.nearest_port) + ' ' + (v.nearest_distance_nm ? Number(v.nearest_distance_nm).toFixed(0) + ' nm' : '') : '—'}</span></div>
                                ${v.destination_port ? `<div class="meta-row"><span class="meta-label">Destination</span><span class="meta-val">${escapeHtml(v.destination_port)} ${v.destination_distance_nm ? Number(v.destination_distance_nm).toFixed(0) + ' nm' : ''}</span></div>` : ''}
                                ${etaR ? `<div class="meta-row"><span class="meta-label">ETA</span><span class="meta-val"><span class="eta-countdown ${etaR.cls}" data-eta="${escapeHtml(v.eta_utc || '')}">${etaR.text}</span></span></div>` : ''}
                            </div>
                            <div class="tag-row">
                                <div id="weather-${imo}" style="display:contents;"></div>
                            </div>
                            <div class="hint-text">Tap to expand · ${vFlag}</div>
                        `}
                    </div>
                </div>
                <div id="details-${imo}" class="vessel-expanded">
                    <div class="section-mini-title">📋 Vessel Details</div>
                    <div class="expanded-grid">
                        <div class="exp-item"><div class="exp-label">Ship Type</div><div class="exp-val">${escapeHtml(v.ship_type || '—')}</div></div>
                        <div class="exp-item"><div class="exp-label">Flag</div><div class="exp-val">${escapeHtml(v.flag || '—')}</div></div>
                        <div class="exp-item"><div class="exp-label">DWT</div><div class="exp-val">${v.deadweight_t ? formatNumber(Number(v.deadweight_t) / 1000) + 'k t' : '—'}</div></div>
                        <div class="exp-item"><div class="exp-label">Gross Tonnage</div><div class="exp-val">${v.gross_tonnage ? Number(v.gross_tonnage).toLocaleString() + ' t' : '—'}</div></div>
                        <div class="exp-item"><div class="exp-label">Built</div><div class="exp-val">${escapeHtml(v.year_of_build || '—')}</div></div>
                        <div class="exp-item"><div class="exp-label">Length</div><div class="exp-val">${v.length_overall_m ? Number(v.length_overall_m).toFixed(1) + ' m' : '—'}</div></div>
                        <div class="exp-item"><div class="exp-label">Beam</div><div class="exp-val">${v.beam_m ? Number(v.beam_m).toFixed(1) + ' m' : '—'}</div></div>
                        <div class="exp-item"><div class="exp-label">Draught</div><div class="exp-val">${v.draught_m ? escapeHtml(v.draught_m) : '—'}</div></div>
                        <div class="exp-item"><div class="exp-label">MMSI</div><div class="exp-val">${escapeHtml(v.mmsi || '—')}</div></div>
                        <div class="exp-item"><div class="exp-label">AIS Source</div><div class="exp-val">${escapeHtml(v.ais_source || '—')}</div></div>
                    </div>
                    <div class="section-divider"></div>
                    <div class="section-mini-title">📋 Notes</div>
                    <textarea id="notes-${imo}" oninput="onNoteInput('${imo}',this)" placeholder="Agent contact, cargo, special instructions...">${escapeHtml(getNotes(imo))}</textarea>
                    <span id="notes-saved-${imo}" class="notes-saved">✓ Saved</span>
                </div>
                <div class="vessel-footer">
                    <span class="vessel-footer-meta">AIS: ${escapeHtml(v.ais_source || '—')} · ${ageData.ageText}</span>
                    <div class="vessel-footer-actions">
                        <button class="${prio ? 'urgent-btn' : 'ghost'}" style="padding:5px 9px;font-size:.68rem;" onclick="event.stopPropagation();togglePriority('${imo}')">${prio ? '🚩 Priority' : '⑁ Flag'}</button>
                        <button class="danger" style="padding:5px 9px;font-size:.68rem;" onclick="event.stopPropagation();removeIMO('${imo}')">Remove</button>
                    </div>
                </div>
            `;
            el.vesselsContainer.appendChild(card);
            
            if (v.lat != null && v.lon != null) {
                console.log(`🌊 Fetching weather for IMO ${imo} at ${v.lat}, ${v.lon}`);
                fetchAndRenderWeather(imo, v.lat, v.lon);
            }
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
    S.mapInstance = L.map('map').setView([20, 0], 3);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap',
        maxZoom: 19
    }).addTo(S.mapInstance);
    S.mapInitialized = true;
}

function renderMap() {
    if (!S.mapInitialized) initMap();
    S.mapMarkers.forEach(m => S.mapInstance.removeLayer(m));
    S.mapMarkers = [];
    
    S.trackedImosCache.forEach(imo => {
        const v = S.vesselsDataMap.get(imo);
        if (!v || v.lat == null || v.lon == null) return;
        
        // Apply same filters
        const status = getVesselStatus(v);
        if (el.statusFilter.value !== 'ALL' && status !== el.statusFilter.value) return;
        if (el.ageFilter.value !== 'ALL') {
            const ageData = formatSignalAge(v.last_pos_utc);
            const ageHours = ageData.rawAgeMs / (1000 * 60 * 60);
            if (el.ageFilter.value === '1H' && ageHours > 1) return;
            if (el.ageFilter.value === '6H' && ageHours > 6) return;
            if (el.ageFilter.value === '24H' && ageHours > 24) return;
            if (el.ageFilter.value === 'STALE' && ageHours <= 24) return;
        }
        
        const colors = { UNDERWAY: '#0ea5e9', 'AT PORT': '#10b981', 'AT ANCHOR': '#14b8a6', STALLED: '#f59e0b', 'DATA PENDING': '#666' };
        const color = colors[status] || '#0ea5e9';
        const marker = L.circleMarker([v.lat, v.lon], {
            radius: 6,
            fillColor: color,
            color: '#fff',
            weight: 2,
            opacity: 1,
            fillOpacity: 0.8
        }).bindPopup(`<strong>${escapeHtml(v.name || 'Loading')}</strong><br>IMO: ${imo}<br>Status: ${status}`);
        marker.addTo(S.mapInstance);
        S.mapMarkers.push(marker);
    });
}

function toggleView(view) {
    S.currentView = view;
    if (view === 'list') {
        if (el.listView) el.listView.style.display = 'block';
        if (el.mapView) el.mapView.style.display = 'none';
        if (el.viewListBtn) el.viewListBtn.classList.add('active');
        if (el.viewMapBtn) el.viewMapBtn.classList.remove('active');
    } else {
        if (el.listView) el.listView.style.display = 'none';
        if (el.mapView) el.mapView.style.display = 'block';
        if (el.viewListBtn) el.viewListBtn.classList.remove('active');
        if (el.viewMapBtn) el.viewMapBtn.classList.add('active');
        setTimeout(() => {
            if (S.mapInstance) S.mapInstance.invalidateSize();
            renderMap();
        }, 100);
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// CLOCK
// ═══════════════════════════════════════════════════════════════════════════════

function tickClock() {
    const n = new Date();
    const p = v => String(v).padStart(2, '0');
    if (el.headerClock) el.headerClock.textContent = `${p(n.getUTCHours())}:${p(n.getUTCMinutes())}:${p(n.getUTCSeconds())} UTC`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// EVENT LISTENERS
// ═══════════════════════════════════════════════════════════════════════════════

function setupEventListeners() {
    // Clock
    setInterval(tickClock, 1000);
    tickClock();
    
    // Add vessel
    if (el.addBtn) {
        el.addBtn.addEventListener('click', async () => {
            const imo = el.imoInput.value.trim();
            if (!imo || !/^\d{7}$/.test(imo)) {
                updateStatus(i18n.currentLang === 'FR' ? 'IMO invalide' : 'Invalid IMO', 'error');
                return;
            }
            if (S.trackedImosCache.includes(imo)) {
                updateStatus(i18n.currentLang === 'FR' ? 'Déjà suivi' : 'Already tracked', 'warning');
                return;
            }
            S.trackedImosCache.push(imo);
            el.imoInput.value = '';
            renderVessels(S.trackedImosCache);
            updateFleetKPI(S.trackedImosCache);
            pushAlert('added', imo, imo, `IMO ${imo} added to tracking`);
            loadData();
        });
    }
    
    // Filters
    if (el.statusFilter) el.statusFilter.addEventListener('change', () => renderVessels(S.trackedImosCache));
    if (el.ageFilter) el.ageFilter.addEventListener('change', () => renderVessels(S.trackedImosCache));
    if (el.sortSelect) {
        el.sortSelect.addEventListener('change', () => {
            S.currentSortKey = el.sortSelect.value;
            localStorage.setItem('vt_sort', S.currentSortKey);
            renderVessels(S.trackedImosCache);
        });
    }
    
    // Mobile filter
    if (el.fabFilter) {
        el.fabFilter.addEventListener('click', () => {
            if (el.filterSection) el.filterSection.classList.add('visible');
        });
    }
    if (el.filterCloseBtn) {
        el.filterCloseBtn.addEventListener('click', () => {
            if (el.filterSection) el.filterSection.classList.remove('visible');
        });
    }
    
    // Map
    if (el.viewListBtn) el.viewListBtn.addEventListener('click', () => toggleView('list'));
    if (el.viewMapBtn) el.viewMapBtn.addEventListener('click', () => toggleView('map'));
    
    // Language
    const langToggle = document.getElementById('langToggle');
    if (langToggle) {
        langToggle.addEventListener('click', () => {
            const newLang = i18n.currentLang === 'EN' ? 'FR' : 'EN';
            i18n.setLang(newLang);
            langToggle.textContent = newLang === 'FR' ? 'EN' : 'FR';
            renderVessels(S.trackedImosCache);
        });
    }
    
    // Alerts
    el.alertOverlay.addEventListener('click', closeAlertPanel);
    
    // Confirm modal
    if (el.confirmCancel) {
        el.confirmCancel.addEventListener('click', () => {
            el.confirmModal.style.display = 'none';
            S.vesselToRemove = null;
        });
    }
    if (el.confirmOk) {
        el.confirmOk.addEventListener('click', () => {
            if (S.vesselToRemove) removeIMOConfirmed(S.vesselToRemove);
            el.confirmModal.style.display = 'none';
        });
    }
    
    // Refresh
    if (el.refreshButton) el.refreshButton.addEventListener('click', loadData);
    
    // Alerts panel
    const alertsBtn = document.getElementById('alertsBtn');
    if (alertsBtn) alertsBtn.addEventListener('click', toggleAlertPanel);
}

// ═══════════════════════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════════════════════

function init() {
    console.log('🚢 VesselTracker v5.5');
    i18n.init();
    
    if (el.sortSelect) el.sortSelect.value = S.currentSortKey;
    
    renderAlerts();
    updateAlertBadge();
    
    if (loadCachedData()) {
        updateStatus('Loaded from cache', 'success');
    }
    
    setupEventListeners();
    
    loadData();
    checkApiStatus();
    loadSanctionsLists().catch(e => console.warn('Sanctions:', e));
    
    S.refreshInterval = setInterval(loadData, CONFIG.REFRESH_INTERVAL);
    
    if (window.innerWidth < 641) {
        if (el.fabFilter) el.fabFilter.style.display = 'flex';
        if (el.filterSection) el.filterSection.classList.remove('visible');
    }
    
    window.addEventListener('resize', () => {
        if (window.innerWidth > 640) {
            if (el.fabFilter) el.fabFilter.style.display = 'none';
            if (el.filterSection) el.filterSection.classList.remove('visible');
        } else {
            if (el.fabFilter) el.fabFilter.style.display = 'flex';
        }
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
