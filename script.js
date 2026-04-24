// ═══════════════════════════════════════════════════════════════════════════════
// VESSELTRACKER v5.7 – Port calls editor with manual entry & team sharing
// ═══════════════════════════════════════════════════════════════════════════════

// ── CONFIG ───────────────────────────────────────────────────────────────────
const CONFIG = {
    WORKER_URL: '/api',
    STALE_THRESHOLD_MS: 6 * 3600000,
    CRITICAL_THRESHOLD_MS: 24 * 3600000,
    ARRIVED_THRESHOLD_NM: 30.0,
    REFRESH_INTERVAL: 5 * 60000,
};

// ═══════════════════════════════════════════════════════════════════════════════
// THEME TOGGLE
// ═══════════════════════════════════════════════════════════════════════════════

function loadTheme() {
    let saved = 'dark';
    try { saved = localStorage.getItem('vt_theme') || 'dark'; } catch(_) {}
    applyTheme(saved);
}

function applyTheme(theme) {
    if (theme === 'light') {
        document.documentElement.setAttribute('data-theme', 'light');
        document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#f0f4f8');
    } else {
        document.documentElement.removeAttribute('data-theme');
        document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#020c1a');
    }
    const btn = document.getElementById('themeToggle');
    if (btn) btn.textContent = theme === 'light' ? '☀️' : '🌙';
}

function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
    const next = current === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem('vt_theme', next); } catch(_) {}
    applyTheme(next);
}

// Strip unit suffixes like "4.6 m" → 4.6, return null if unparseable.
function parseNum(val) {
    if (val === null || val === undefined || val === '-') return null;
    const n = parseFloat(String(val));
    return isNaN(n) ? null : n;
}

// ── STATE ────────────────────────────────────────────────────────────────────
const S = {
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
    portCallsCache: new Map(),        // NEW: cache for port calls data
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

// ═══════════════════════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════════════════════

function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function getNextScraperRun(fromMs) {
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
}

function formatSignalAge(s) {
    if (!s) return { ageText: 'N/A', ageClass: 'age-stale', rawAgeMs: Infinity };
    try {
        const dt = parseAisTimestamp(s);
        if (!dt) return { ageText: 'Invalid', ageClass: 'age-stale', rawAgeMs: Infinity };
        const ms = Date.now() - dt.getTime();
        const h = ms / 3600000;
        let a, c;
        if (ms < 60000) { a = i18n.get('justNow'); c = 'age-recent'; }
        else if (h < 1) { const min = Math.floor(ms / 60000); a = i18n.get('timeAgoMin').replace('{n}', min); c = min <= 30 ? 'age-recent' : 'age-moderate'; }
        else if (h < 24) { a = i18n.get('timeAgoHour').replace('{n}', h.toFixed(1)); c = h <= 3 ? 'age-recent' : 'age-moderate'; }
        else { a = i18n.get('timeAgoDay').replace('{n}', Math.floor(h / 24)); c = 'age-stale'; }
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
}

function formatEtaCountdown(utcString) {
    if (!utcString) return null;
    try {
        const eta = parseAisTimestamp(utcString) || new Date(utcString);
        if (isNaN(eta.getTime())) return null;
        const diff = eta - Date.now(), abs = Math.abs(diff);
        const h = Math.floor(abs / 3600000), m = Math.floor((abs % 3600000) / 60000), s = Math.floor((abs % 60000) / 1000);
        const p = v => String(v).padStart(2, '0');
        if (abs < 60000) return { text: i18n.get('arrivingNow'), cls: 'arrived' };
        if (diff > 0) return { text: `ETA ${h > 0 ? h + 'h ' : ''}${p(m)}m ${p(s)}s`, cls: '' };
        return { text: h > 0 ? i18n.get('etaOverdue').replace('{h}', h).replace('{m}', p(m)) : i18n.get('etaOverdueMin').replace('{m}', p(m)), cls: 'overdue' };
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
    if (sog <= 1.0) {
        if (['ANCHOR', 'ANCH.', 'ANCHORAGE', 'ANCHORING', 'AT ANCHOR'].some(k => dest.includes(k))) return 'AT ANCHOR';
        if ((!isNaN(dd) && dd <= CONFIG.ARRIVED_THRESHOLD_NM) || (!isNaN(nd) && nd <= CONFIG.ARRIVED_THRESHOLD_NM)) return 'AT PORT';
        return 'STALLED';
    }
    return 'UNDERWAY';
}

function getFlagCode(f) {
    if (!f || ['N/A', 'Unknown', '-', ''].includes(f)) return null;
    const m = {
        'ALBANIA': 'AL', 'ANDORRA': 'AD', 'AUSTRIA': 'AT', 'BELARUS': 'BY',
        'BELGIUM': 'BE', 'BOSNIA AND HERZEGOVINA': 'BA', 'BOSNIA & HERZEGOVINA': 'BA',
        'BULGARIA': 'BG', 'CROATIA': 'HR', 'CYPRUS': 'CY', 'CZECHIA': 'CZ',
        'CZECH REPUBLIC': 'CZ', 'DENMARK': 'DK', 'ESTONIA': 'EE', 'FAROE ISLANDS': 'FO',
        'FINLAND': 'FI', 'FRANCE': 'FR', 'GERMANY': 'DE', 'GIBRALTAR': 'GI',
        'GREECE': 'GR', 'GUERNSEY': 'GG', 'HUNGARY': 'HU', 'ICELAND': 'IS',
        'IRELAND': 'IE', 'ISLE OF MAN': 'IM', 'ITALY': 'IT', 'JERSEY': 'JE',
        'KOSOVO': 'XK', 'LATVIA': 'LV', 'LIECHTENSTEIN': 'LI', 'LITHUANIA': 'LT',
        'LUXEMBOURG': 'LU', 'MALTA': 'MT', 'MOLDOVA': 'MD', 'MONACO': 'MC',
        'MONTENEGRO': 'ME', 'NETHERLANDS': 'NL', 'NORTH MACEDONIA': 'MK',
        'NORWAY': 'NO', 'POLAND': 'PL', 'PORTUGAL': 'PT', 'ROMANIA': 'RO',
        'RUSSIA': 'RU', 'RUSSIAN FEDERATION': 'RU', 'SAN MARINO': 'SM',
        'SERBIA': 'RS', 'SLOVAKIA': 'SK', 'SLOVENIA': 'SI', 'SPAIN': 'ES',
        'SVALBARD': 'SJ', 'SWEDEN': 'SE', 'SWITZERLAND': 'CH', 'TURKEY': 'TR',
        'UKRAINE': 'UA', 'UNITED KINGDOM': 'GB', 'UK': 'GB', 'VATICAN': 'VA',
        'HOLY SEE': 'VA',
        'ANTIGUA & BARBUDA': 'AG', 'ANTIGUA AND BARBUDA': 'AG', 'ARGENTINA': 'AR',
        'ARUBA': 'AW', 'BAHAMAS': 'BS', 'BARBADOS': 'BB', 'BELIZE': 'BZ',
        'BERMUDA': 'BM', 'BOLIVIA': 'BO', 'BRAZIL': 'BR', 'CANADA': 'CA',
        'CAYMAN ISLANDS': 'KY', 'CHILE': 'CL', 'COLOMBIA': 'CO', 'COSTA RICA': 'CR',
        'CUBA': 'CU', 'CURACAO': 'CW', 'DOMINICA': 'DM', 'DOMINICAN REPUBLIC': 'DO',
        'ECUADOR': 'EC', 'EL SALVADOR': 'SV', 'FALKLAND ISLANDS': 'FK',
        'FRENCH GUIANA': 'GF', 'GRENADA': 'GD', 'GUADELOUPE': 'GP',
        'GUATEMALA': 'GT', 'GUYANA': 'GY', 'HAITI': 'HT', 'HONDURAS': 'HN',
        'JAMAICA': 'JM', 'MARTINIQUE': 'MQ', 'MEXICO': 'MX', 'MONTSERRAT': 'MS',
        'NETHERLANDS ANTILLES': 'AN', 'NICARAGUA': 'NI', 'PANAMA': 'PA',
        'PARAGUAY': 'PY', 'PERU': 'PE', 'PUERTO RICO': 'PR',
        'SAINT KITTS AND NEVIS': 'KN', 'SAINT KITTS & NEVIS': 'KN',
        'SAINT LUCIA': 'LC', 'SAINT VINCENT': 'VC',
        'SAINT VINCENT AND THE GRENADINES': 'VC', 'SURINAME': 'SR',
        'TRINIDAD AND TOBAGO': 'TT', 'TRINIDAD & TOBAGO': 'TT',
        'TURKS AND CAICOS': 'TC', 'UNITED STATES': 'US', 'USA': 'US',
        'URUGUAY': 'UY', 'US VIRGIN ISLANDS': 'VI', 'VENEZUELA': 'VE',
        'ALGERIA': 'DZ', 'ANGOLA': 'AO', 'BENIN': 'BJ', 'BOTSWANA': 'BW',
        'BURKINA FASO': 'BF', 'BURUNDI': 'BI', 'CABO VERDE': 'CV',
        'CAPE VERDE': 'CV', 'CAMEROON': 'CM', 'CENTRAL AFRICAN REPUBLIC': 'CF',
        'CHAD': 'TD', 'COMOROS': 'KM', 'CONGO': 'CG',
        'DEMOCRATIC REPUBLIC OF CONGO': 'CD', 'DR CONGO': 'CD', 'DRC': 'CD',
        'DJIBOUTI': 'DJ', 'EGYPT': 'EG', 'EQUATORIAL GUINEA': 'GQ',
        'ERITREA': 'ER', 'ESWATINI': 'SZ', 'SWAZILAND': 'SZ', 'ETHIOPIA': 'ET',
        'GABON': 'GA', 'GAMBIA': 'GM', 'GHANA': 'GH', 'GUINEA': 'GN',
        'GUINEA-BISSAU': 'GW', 'IVORY COAST': 'CI', 'CÔTE D\'IVOIRE': 'CI',
        'COTE D\'IVOIRE': 'CI', 'KENYA': 'KE', 'LESOTHO': 'LS', 'LIBERIA': 'LR',
        'LIBYA': 'LY', 'MADAGASCAR': 'MG', 'MALAWI': 'MW', 'MALI': 'ML',
        'MAURITANIA': 'MR', 'MAURITIUS': 'MU', 'MAYOTTE': 'YT', 'MOROCCO': 'MA',
        'MOZAMBIQUE': 'MZ', 'NAMIBIA': 'NA', 'NIGER': 'NE', 'NIGERIA': 'NG',
        'REUNION': 'RE', 'RWANDA': 'RW', 'SAO TOME AND PRINCIPE': 'ST',
        'SENEGAL': 'SN', 'SEYCHELLES': 'SC', 'SIERRA LEONE': 'SL', 'SOMALIA': 'SO',
        'SOUTH AFRICA': 'ZA', 'SOUTH SUDAN': 'SS', 'SUDAN': 'SD',
        'TANZANIA': 'TZ', 'TOGO': 'TG', 'TUNISIA': 'TN', 'UGANDA': 'UG',
        'WESTERN SAHARA': 'EH', 'ZAMBIA': 'ZM', 'ZIMBABWE': 'ZW',
        'BAHRAIN': 'BH', 'IRAN': 'IR', 'IRAQ': 'IQ', 'ISRAEL': 'IL',
        'JORDAN': 'JO', 'KUWAIT': 'KW', 'LEBANON': 'LB', 'OMAN': 'OM',
        'PALESTINE': 'PS', 'QATAR': 'QA', 'SAUDI ARABIA': 'SA', 'SYRIA': 'SY',
        'UAE': 'AE', 'UNITED ARAB EMIRATES': 'AE', 'YEMEN': 'YE',
        'AFGHANISTAN': 'AF', 'ARMENIA': 'AM', 'AZERBAIJAN': 'AZ',
        'BANGLADESH': 'BD', 'BHUTAN': 'BT', 'BRUNEI': 'BN', 'CAMBODIA': 'KH',
        'CHINA': 'CN', 'EAST TIMOR': 'TL', 'TIMOR-LESTE': 'TL', 'GEORGIA': 'GE',
        'HONG KONG': 'HK', 'INDIA': 'IN', 'INDONESIA': 'ID', 'JAPAN': 'JP',
        'KAZAKHSTAN': 'KZ', 'KYRGYZSTAN': 'KG', 'LAOS': 'LA', 'MACAO': 'MO',
        'MACAU': 'MO', 'MALAYSIA': 'MY', 'MALDIVES': 'MV', 'MONGOLIA': 'MN',
        'MYANMAR': 'MM', 'BURMA': 'MM', 'NEPAL': 'NP', 'NORTH KOREA': 'KP',
        'PAKISTAN': 'PK', 'PHILIPPINES': 'PH', 'SINGAPORE': 'SG',
        'SOUTH KOREA': 'KR', 'SRI LANKA': 'LK', 'TAIWAN': 'TW',
        'TAJIKISTAN': 'TJ', 'THAILAND': 'TH', 'TURKMENISTAN': 'TM',
        'UZBEKISTAN': 'UZ', 'VIETNAM': 'VN',
        'AUSTRALIA': 'AU', 'COOK ISLANDS': 'CK', 'FIJI': 'FJ',
        'FRENCH POLYNESIA': 'PF', 'GUAM': 'GU', 'KIRIBATI': 'KI',
        'MARSHALL ISLANDS': 'MH', 'MICRONESIA': 'FM', 'NAURU': 'NR',
        'NEW CALEDONIA': 'NC', 'NEW ZEALAND': 'NZ', 'NIUE': 'NU',
        'NORTHERN MARIANA ISLANDS': 'MP', 'PALAU': 'PW',
        'PAPUA NEW GUINEA': 'PG', 'SAMOA': 'WS', 'SOLOMON ISLANDS': 'SB',
        'TONGA': 'TO', 'TUVALU': 'TV', 'VANUATU': 'VU',
        'WALLIS AND FUTUNA': 'WF',
        'ANGUILLA': 'AI', 'BRITISH VIRGIN ISLANDS': 'VG', 'SAINT HELENA': 'SH',
        'SAINT PIERRE AND MIQUELON': 'PM', 'TRISTAN DA CUNHA': 'SH',
        'KOREA': 'KR', 'KOREA, SOUTH': 'KR', 'KOREA, NORTH': 'KP',
        'LAO': 'LA', 'VIET NAM': 'VN', 'SYRIAN ARAB REPUBLIC': 'SY',
        'LIBYAN ARAB JAMAHIRIYA': 'LY', 'TANZANIAN': 'TZ',
        'DEMOCRATIC PEOPLE\'S REPUBLIC OF KOREA': 'KP',
        'REPUBLIC OF KOREA': 'KR', 'ISLAMIC REPUBLIC OF IRAN': 'IR',
        'ISLAMIC REPUBLIC OF PAKISTAN': 'PK',
    };
    const u = f.toUpperCase().trim();
    if (m[u]) return m[u];
    let best = null, bestLen = 0;
    for (const [k, v] of Object.entries(m)) {
        if ((u.includes(k) || k.includes(u)) && k.length > bestLen) {
            best = v; bestLen = k.length;
        }
    }
    if (best) return best;
    const pm = f.match(/\(([A-Z]{2})\)/);
    if (pm) return pm[1];
    return null;
}

function isPriority(imo) { return S.priorities.includes(imo); }

function getStatusLabel(status) {
    const map = { 'UNDERWAY': 'statusUnderway', 'AT PORT': 'statusAtPort', 'AT ANCHOR': 'statusAtAnchor', 'STALLED': 'statusStalled', 'DATA PENDING': 'statusPending' };
    return i18n.get(map[status] || 'statusPending');
}

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

function getPortCompatibility(draughtStr, lat, lon) {
    const match = String(draughtStr || '').match(/(\d+\.?\d*)/);
    if (!match) return null;
    const draught = parseFloat(match[1]);
    if (lat == null || lon == null || !S.portsData) return null;

    // Haversine distance in nautical miles
    const hav = (la1, lo1, la2, lo2) => {
        const R = 3440.065; // Earth radius in NM
        const toRad = d => d * Math.PI / 180;
        const dLat = toRad(la2 - la1);
        const dLon = toRad(lo2 - lo1);
        const a = Math.sin(dLat / 2) ** 2 +
                  Math.cos(toRad(la1)) * Math.cos(toRad(la2)) * Math.sin(dLon / 2) ** 2;
        return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
    };

    // Collect candidate ports that have at least one valid depth value AND coords
    const candidates = [];
    for (const [key, info] of Object.entries(S.portsData)) {
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
        if (cached.wave != null) p.push(`<span class="tag weather" title="${i18n.get('tipWaveHeight')}">🌊 ${Number(cached.wave).toFixed(1)}m</span>`);
        if (cached.wind != null) p.push(`<span class="tag weather" title="${i18n.get('tipWindSpeed')}">💨 ${Number(cached.wind).toFixed(0)}kn</span>`);
        if (p.length) container.innerHTML = p.join('');
        return;
    }
    if (_weatherPending.has(imo)) return;
    _weatherPending.add(imo);
    try {
        const wr = await fetchWithTimeout(
            `${CONFIG.WORKER_URL}/weather?lat=${lat}&lon=${lon}`, {}, 8000
        );
        const data = await wr.json();
        const result = { wave: data.wave ?? null, wind: data.wind ?? null, ts: Date.now() };
        S.weatherCache.set(imo, result);
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
    if (!S.alerts.length) { el.alertList.innerHTML = `<div class="alert-empty">${i18n.get('alertMonitoring')}</div>`; return; }
    el.alertList.innerHTML = S.alerts.map(a => `
        <div class="alert-item ${a.read ? '' : 'unread'} type-${a.type}">
            <div><span style="margin-right:4px;">${a.icon}</span><span class="alert-msg">${escapeHtml(a.msg)}</span></div>
            <div class="alert-time">${a.time} · IMO ${a.imo}</div>
        </div>
    `).join('');
}

function updateAlertBadge() {
    const alertsUnread = S.alerts.filter(a => !a.read).length;
    const handoffs = S.pendingHandoffCount || 0;
    const n = alertsUnread + handoffs;
    [el.alertBadge, el.navBadge].forEach(b => {
        if (!b) return;
        b.textContent = n > 9 ? '9+' : n;
        b.classList.toggle('hidden', n === 0);
    });
}

function handleBellClick() {
    if ((S.pendingHandoffCount || 0) > 0) {
        checkAndShowHandoffs(true);
    } else {
        toggleAlertPanel();
    }
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
        const res = await fetchWithTimeout(`${CONFIG.WORKER_URL}/data/sanctions`, {}, 12000);
        if (!res.ok) throw new Error(`Sanctions fetch failed: ${res.status}`);
        const entries = await res.json();
        const dmap = new Map();
        entries.forEach(e => {
            const imo = String(e.imo).replace(/\D/g, '');
            if (!dmap.has(imo)) dmap.set(imo, []);
            const lists = Array.isArray(e.lists) ? e.lists.join(', ') : e.lists || 'Unknown';
            dmap.get(imo).push({ list: lists, name: e.name || `IMO ${imo}`, reason: e.program || '' });
        });
        S.sanctionedImos = new Set(dmap.keys());
        S.sanctionDetails = dmap;
        S.sanctionsLoaded = true;
        const html = `<span style="color:var(--success);font-size:.68rem;font-family:var(--mono);">✓ ${i18n.get('monitoringSanctioned').replace('{n}', S.sanctionedImos.size.toLocaleString())}</span>`;
        if (el.sanctionsStatus) el.sanctionsStatus.innerHTML = html;
        const inline = document.getElementById('sanctionsStatusInline');
        if (inline) inline.innerHTML = html;
        checkFleetSanctions();
    } catch (e) {
        console.warn('Sanctions load failed:', e.message);
        S.sanctionsLoaded = true;
        const html = `<span style="color:var(--warning);font-size:.68rem;font-family:var(--mono);">${i18n.get('sanctionsUnavailable')}</span>`;
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
            pushAlert('sanctioned', imo, v?.name || `IMO ${imo}`, i18n.get('sanctionedAlert').replace('{name}', v?.name || 'IMO ' + imo).replace('{lists}', lists || i18n.get('sanctionsList')));
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

function loadCachedData(allowStale = false) {
    try {
        const raw = localStorage.getItem('vt_cache');
        if (!raw) return false;
        const data = JSON.parse(raw);
        const maxAge = allowStale ? 86400000 : 3600000;
        if (Date.now() - data.timestamp > maxAge) return false;
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
    else {
        S.priorities.push(imo);
        const vname = S.vesselsDataMap.get(imo)?.name || S.staticCache.get(imo)?.name || `IMO ${imo}`;
        pushAlert('priority', imo, vname, i18n.get('alertPriorityName').replace('{name}', vname));
    }
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
    if (type === 'success') setTimeout(() => { if (el.statusMsg.textContent === msg) { el.statusMsg.textContent = i18n.get('ready'); el.statusMsg.className = 'status-msg'; } }, 5000);
}

// ═══════════════════════════════════════════════════════════════════════════════
// API & NETWORK
// ═══════════════════════════════════════════════════════════════════════════════

async function fetchWithTimeout(url, options = {}, timeout = 8000) {
    const ctrl = new AbortController();
    const id = setTimeout(() => ctrl.abort(), timeout);
    try {
        const r = await fetch(url, { ...options, signal: ctrl.signal });
        clearTimeout(id);
        if (r.status === 401 && url.includes(CONFIG.WORKER_URL) && S.currentUser) {
            console.warn('[Auth] 401 from Worker — session expired, logging out');
            clearSession();
            S.fleetMode = 'public';
            updateAuthIcon();
            stopHandoffPolling();
            updateHandoffBadge(0);
            loadData();
            setTimeout(() => {
                showToast('🔒 Session expired — please login again', 'danger', 5000);
                setTimeout(() => openAuthModal('login'), 1500);
            }, 300);
        }
        return r;
    }
    catch (e) { clearTimeout(id); throw e; }
}

async function checkApiStatus() {
    try {
        await fetchWithTimeout(`${CONFIG.WORKER_URL}/ping`, { method: 'GET' }, 5000);
        const s = i18n.get('apiOnline');
        const css = 'border-color:rgba(16,185,129,.4);color:var(--success);';
        if (el.apiStatus) { el.apiStatus.textContent = s; el.apiStatus.style.cssText = css; }
        if (el.apiStatusCard) { el.apiStatusCard.textContent = s; el.apiStatusCard.style.cssText = css; }
    } catch {
        const s = i18n.get('apiOffline');
        const css = 'border-color:rgba(239,68,68,.4);color:var(--danger);';
        if (el.apiStatus) { el.apiStatus.textContent = s; el.apiStatus.style.cssText = css; }
        if (el.apiStatusCard) { el.apiStatusCard.textContent = s; el.apiStatusCard.style.cssText = css; }
    }
}

function updateLastModified(date) {
    if (!date) return;
    S.lastDataModified = date;
    const locale = i18n.currentLang === 'FR' ? 'fr-FR' : 'en-US';
    const fmt = date.toLocaleString(locale, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    if (el.lastUpdatedTime) el.lastUpdatedTime.textContent = fmt;
    if (el.lastUpdatedLabel) el.lastUpdatedLabel.textContent = `${i18n.get('lastUpdate')}: ${fmt}`;
}

async function updateStaticCache(imo, vd) {
    const name = vd.vessel_name || vd.name || `IMO ${imo}`;
    const entry = {
        imo, name,
        flag:             vd.flag             || '-',
        ship_type:        vd.ship_type         || vd['Type of ship'] || '-',
        length_overall_m: parseNum(vd.length_overall_m) ?? '-',
        beam_m:           parseNum(vd.beam_m)            ?? '-',
        deadweight_t:     parseNum(vd.deadweight_t)      ?? parseNum(vd['DWT']) ?? '-',
        gross_tonnage:    parseNum(vd.gross_tonnage)     ?? parseNum(vd['Gross tonnage']) ?? '-',
        year_of_build:    parseNum(vd.year_of_build)     ?? parseNum(vd['Year of build']) ?? '-',
        draught_m:        parseNum(vd.draught_m)         ?? '-',
        mmsi:             vd.mmsi || vd['MMSI']           || null,
        equasis_owner:    vd.equasis_owner                || null,
        equasis_address:  vd.equasis_address              || null,
        pi_club:          vd.pi_club                      || null,
        call_sign:        vd.call_sign || vd['Call Sign'] || null,
        class_society:    vd.class_society                || null,
    };
    S.staticCache.set(imo, entry);

    try {
        const headers = { 'Content-Type': 'application/json' };
        if (S.currentUser?.access_token) headers['Authorization'] = `Bearer ${S.currentUser.access_token}`;
        await fetchWithTimeout(`${CONFIG.WORKER_URL}/vessel/cache`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                imo:              String(imo),
                name,
                ship_type:        vd.ship_type || vd['Type of ship'] || null,
                flag:             vd.flag       || null,
                deadweight_t:     parseNum(vd.deadweight_t)  ?? parseNum(vd['DWT']),
                gross_tonnage:    parseNum(vd.gross_tonnage) ?? parseNum(vd['Gross tonnage']),
                year_of_build:    parseNum(vd.year_of_build) ?? parseNum(vd['Year of build']),
                length_overall_m: parseNum(vd.length_overall_m),
                beam_m:           parseNum(vd.beam_m),
                draught_m:        parseNum(vd.draught_m),
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
}

// ═══════════════════════════════════════════════════════════════════════════════
// LOAD DATA
// ═══════════════════════════════════════════════════════════════════════════════

function renderSkeletons(count = 3) {
    if (!el.vesselsContainer) return;
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
    el.vesselsContainer.innerHTML = Array(count).fill(0).map(card).join('');
}

async function loadData() {
    if (S.isApiBusy) return;

    if (!S.currentUser) {
        S.trackedImosCache = [];
        S.vesselsDataMap = new Map();
        renderVessels([]);
        updateFleetKPI([]);
        hideLoading();
        return;
    }

    S.isApiBusy = true;
    if (el.refreshButton) el.refreshButton.disabled = true;
    updateStatus(i18n.get('refreshing'), 'info');

    const hasCachedVessels = S.trackedImosCache.length > 0;
    if (!hasCachedVessels && el.vesselsContainer) {
        renderSkeletons(3);
    }

    // Safety timer: force hide loading overlay after 15 seconds
    const safetyTimer = setTimeout(() => {
        console.warn('[loadData] Force hiding loading overlay after 15s');
        hideLoading();
    }, 15000);

    try {
        const headers = {};
        if (S.currentUser?.access_token) {
            headers['Authorization'] = `Bearer ${S.currentUser.access_token}`;
        }
        const res = await fetchWithTimeout(
            `${CONFIG.WORKER_URL}/data/load`,
            { headers },
            15000
        );
        if (!res.ok) throw new Error(`Worker /data/load failed: ${res.status}`);
        const { tracked: trackedRows, vessels: vesselRows, cache: cacheRows, ports: portsRows } = await res.json();

        const tracked = trackedRows.map(r => String(r.imo));
        S.trackedImosCache = tracked;

        const nm = new Map();
        vesselRows.forEach(v => nm.set(String(v.imo), v));
        S.vesselsDataMap = nm;

        S.staticCache = new Map(cacheRows.map(r => [String(r.imo), r]));

        S.portsData = {};
        portsRows.forEach(p => { S.portsData[p.name.toUpperCase()] = p; });

        const dates = vesselRows.map(v => v.updated_at).filter(Boolean).map(d => new Date(d));
        const lastMod = dates.length ? new Date(Math.max(...dates)) : new Date();
        updateLastModified(lastMod);

        S.lastFlowRunMs = dates.length ? Math.max(...dates.map(d => d.getTime())) : null;

        saveToLocalStorage();
        generateAlerts(nm, tracked);
        updateAlertBadge();
        updateSystemHealth(lastMod.getTime(), vesselRows.length, 'worker');
        updateFleetKPI(tracked);
        if (el.vesselCount) el.vesselCount.textContent = tracked.length === 1 ? i18n.get('vesselTrackedSingle') : i18n.get('vesselTracked').replace('{n}', tracked.length);
        if (el.dataStats) el.dataStats.textContent = `${vesselRows.length} ${i18n.get('inDatabase')} · worker`;
        renderVessels(S.trackedImosCache);
        if (S.mapInitialized) updateMapMarkers();
        updateStatus(`${i18n.get('fleetLoaded')} — ${tracked.length} ${i18n.get('vessels')}`, 'success');
        loadVesselOwners();

    } catch (err) {
        console.error('[loadData] Error:', err);
        const gotCache = loadCachedData(true);
        if (gotCache) {
            updateStatus(i18n.get('cachedDataMsg') + ' — ' + err.message, 'warning');
        } else {
            updateStatus(`Load failed: ${err.message}`, 'error');
            if (el.vesselsContainer) el.vesselsContainer.innerHTML = `
                <div class="empty-state">
                    <div class="icon">⚠️</div>
                    <p style="color:var(--danger);margin-bottom:6px;">${escapeHtml(err.message)}</p>
                    <small style="display:block;margin-bottom:16px;">Check your connection or try again</small>
                    <button class="btn-primary" onclick="loadData()" style="font-size:.78rem;padding:8px 18px;">
                        🔄 Retry
                    </button>
                </div>`;
        }
    } finally {
        clearTimeout(safetyTimer);
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
                if (ns === 'STALLED') pushAlert('stalled', imo, v.name, i18n.get('alertStalled').replace('{name}', v.name || 'IMO ' + imo));
                if (ns === 'AT PORT') pushAlert('arrived', imo, v.name, i18n.get('alertArrivedPort').replace('{name}', v.name || 'IMO ' + imo));
                if (ns === 'AT ANCHOR') pushAlert('arrived', imo, v.name, i18n.get('alertAtAnchor').replace('{name}', v.name || 'IMO ' + imo));
            }
            if (age.rawAgeMs > CONFIG.STALE_THRESHOLD_MS && prev.signalAgeMs <= CONFIG.STALE_THRESHOLD_MS) pushAlert('stale', imo, v.name, i18n.get('alertSignalLost').replace('{name}', v.name || 'IMO ' + imo).replace('{age}', age.ageText));
            const dd = parseFloat(v.destination_distance_nm);
            if (!isNaN(dd) && dd <= 50 && (prev.destDist == null || prev.destDist > 50)) pushAlert('approaching', imo, v.name, i18n.get('alertApproaching').replace('{name}', v.name || 'IMO ' + imo).replace('{dist}', dd.toFixed(0)));
        }
        S.previousVesselStates.set(imo, { status: ns, signalAgeMs: age.rawAgeMs, destDist: parseFloat(v.destination_distance_nm) || null });
    }
    if (S.sanctionsLoaded) checkFleetSanctions();
}

function updateSystemHealth(lastMod, count, source) {
    if (!lastMod) { if (el.systemHealth) el.systemHealth.textContent = i18n.get('unknown'); return; }
    const ms = Date.now() - lastMod;
    let text, color, bg;
    if (ms < 3600000) { text = i18n.get('healthExcellent'); color = 'var(--success)'; bg = 'rgba(16,185,129,.12)'; }
    else if (ms < CONFIG.STALE_THRESHOLD_MS) { text = i18n.get('healthGood'); color = 'var(--warning)'; bg = 'rgba(245,158,11,.12)'; }
    else if (ms < CONFIG.CRITICAL_THRESHOLD_MS) { text = i18n.get('healthStale'); color = '#f97316'; bg = 'rgba(249,115,22,.12)'; }
    else { text = i18n.get('healthCritical'); color = 'var(--danger)'; bg = 'rgba(239,68,68,.12)'; }
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
    const fs = document.getElementById('mobileFilterSheet'); if (fs) { fs.classList.remove('show'); fs.style.display = ''; }
    renderVessels(S.trackedImosCache);
}

function closeMobileFilter(e) {
    if (e.target === e.currentTarget) closeFilterMenu();
}

// ═══════════════════════════════════════════════════════════════════════════════
// VESSEL MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

async function addVessel() {
    const imo = el.imoInput.value.trim();
    if (!imo || !/^\d{7}$/.test(imo)) { updateStatus(i18n.get('statusInvalidDigits'), 'error'); return; }
    if (!validateIMO(imo)) { updateStatus(i18n.get('statusInvalidCheck'), 'error'); return; }
    if (S.trackedImosCache.includes(imo)) { updateStatus(i18n.get('statusAlreadyTracked'), 'warning'); return; }
    if (S.isApiBusy) return;
    showLoading(i18n.get('addingImo').replace('{imo}', imo));

    let apiData = (S.lastImoLookupData && String(S.lastImoLookupData.imo) === imo)
        ? S.lastImoLookupData
        : S.staticCache.get(imo) || null;

    if (!apiData) {
        try {
            const headers = S.currentUser?.access_token ? { 'Authorization': `Bearer ${S.currentUser.access_token}` } : {};
            const r = await fetchWithTimeout(`${CONFIG.WORKER_URL}/vessel/preview/${imo}`, { headers }, 20000);
            if (r.ok) { const d = await r.json(); if (d && d.found !== false) apiData = d; }
        } catch (e) { console.warn('Pre-add lookup failed:', e); }
    }

    await updateTrackedImos(imo, true, apiData);

    const vesselName = apiData?.vessel_name || apiData?.name || imo;
    pushAlert('added', imo, vesselName, i18n.get('alertAdded').replace('{imo}', imo));
    if (S.sanctionsLoaded && S.sanctionedImos.has(imo)) {
        const d = S.sanctionDetails.get(imo) || [];
        pushAlert('sanctioned', imo, vesselName, i18n.get('alertSanctioned').replace('{imo}', imo).replace('{lists}', [...new Set(d.map(x => x.list))].join(', ') || i18n.get('sanctionsList')));
    }
    S.lastImoLookupData = null;
    hideLoading();
}

function removeIMO(imo) {
    const name = S.vesselsDataMap.get(imo)?.name || `IMO ${imo}`;
    if (el.confirmText) el.confirmText.textContent = i18n.get('removeConfirm').replace('{name}', name).replace('{imo}', imo);
    if (el.confirmModal) el.confirmModal.classList.remove('hidden');
    S.vesselToRemove = imo;
}

async function removeIMOConfirmed(imo) {
    showLoading(i18n.get('removingImo').replace('{imo}', imo));
    const vname = S.vesselsDataMap.get(imo)?.name || S.staticCache.get(imo)?.name || `IMO ${imo}`;
    await updateTrackedImos(imo, false);
    pushAlert('removed', imo, vname, i18n.get('alertRemovedFull').replace('{name}', vname).replace('{imo}', imo));
    hideLoading();
}

async function updateTrackedImos(imo, isAdd, apiData = null) {
    S.isApiBusy = true;
    if (el.refreshButton) el.refreshButton.disabled = true;
    
    try {
        updateStatus(
            isAdd 
                ? i18n.get('addingAttempt').replace('{n}', 1) 
                : i18n.get('removingAttempt').replace('{n}', 1)
        );
        
        const endpoint = isAdd ? '/vessel/add' : '/vessel/remove';
        const authPayload = S.currentUser
            ? { user_token: S.currentUser.access_token }
            : {};
        const response = await fetchWithTimeout(
            `${CONFIG.WORKER_URL}${endpoint}`,
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
                const base = S.lastFlowRunMs ? S.lastFlowRunMs : Date.now();
                const next = getNextScraperRun(base);
                const h = next.getUTCHours().toString().padStart(2,'0');
                const mins = next.getUTCMinutes().toString().padStart(2,'0');
                const isNextDay = next.getUTCDate() !== new Date().getUTCDate();
                return (isNextDay ? 'Tomorrow ' : '') + h + ':' + mins + ' UTC';
            })();
            updateStatus(
                `${i18n.get('addedImo').replace('{imo}', imo)} — ${i18n.get('nextUpdate')} ${nextUpdateStr}`,
                'success'
            );

            if (apiData) {
                updateStaticCache(imo, apiData).catch(e => console.warn('static cache on add:', e));
            }

            // Fetch owner immediately so card shows hyperlink
            fetchOwner(imo).then(() => {
                renderVessels(S.trackedImosCache);
            }).catch(() => {});

            el.imoInput.value = '';
            el.namePreview.innerHTML = '';
            el.addBtn.disabled = true;
            
        } else {
            updateStatus(i18n.get('removedImo').replace('{imo}', imo), 'success');
        }
        
        S.isApiBusy = false;
        if (el.refreshButton) el.refreshButton.disabled = false;
        
        await loadData();
        
    } catch (err) {
        console.error('updateTrackedImos error:', err);
        updateStatus(i18n.get('failed').replace('{msg}', err.message), 'error');
        saveToLocalStorage();
        renderVessels(S.trackedImosCache);
    }
    
    S.isApiBusy = false;
    if (el.refreshButton) el.refreshButton.disabled = false;
}

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

// ── Autocomplete state ────────────────────────────────────────────────────────
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
    // Append dropdown to body — escapes any overflow:hidden ancestor (.card etc.)
    dd = document.createElement('div');
    dd.id = 'acDropdown';
    dd.setAttribute('role', 'listbox');
    document.body.appendChild(dd);
    return dd;
}

function _positionDropdown() {
    const dd = document.getElementById('acDropdown');
    if (!dd || !el.imoInput) return;
    const rect = el.imoInput.getBoundingClientRect();
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
        const fc = getFlagCode(v.flag);
        const fh = fc
            ? `<img src="https://flagcdn.com/24x18/${fc.toLowerCase()}.png" width="24" height="17" alt="">`
            : `<div class="ac-flag-ph"></div>`;
        const meta = [v.ship_type, v.flag].filter(Boolean).join(' · ');
        return `<div class="ac-item" role="option" data-idx="${i}" onclick="_selectAcItem(${i})">
            ${fh}
            <span class="ac-name">${escapeHtml(v.name || 'IMO ' + v.imo)}</span>
            ${meta ? `<span class="ac-meta">${escapeHtml(meta)}</span>` : ''}
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
    el.imoInput.value = v.imo;
    el.imoInput.dispatchEvent(new Event('input'));
}

async function _searchVesselsByName(query) {
    if (!S.currentUser?.access_token) return [];
    try {
        const r = await fetchWithTimeout(
            `${CONFIG.WORKER_URL}/vessel/search?q=${encodeURIComponent(query)}`,
            { headers: { 'Authorization': `Bearer ${S.currentUser.access_token}` } },
            5000
        );
        if (!r.ok) return [];
        const data = await r.json();
        return data.results || [];
    } catch { return []; }
}

function setupImoInput() {
    if (!el.imoInput) return;
    _injectAutocompleteStyles();
    _getOrCreateDropdown();

    // Close dropdown when clicking outside (dropdown lives on body, not inside card)
    document.addEventListener('click', e => {
        const dd = document.getElementById('acDropdown');
        if (e.target !== el.imoInput && !dd?.contains(e.target)) _hideDropdown();
    });

    // Reposition on scroll/resize so dropdown tracks the input
    window.addEventListener('scroll', () => {
        if (document.getElementById('acDropdown')?.classList.contains('show')) _positionDropdown();
    }, true);
    window.addEventListener('resize', () => {
        if (document.getElementById('acDropdown')?.classList.contains('show')) _positionDropdown();
    });

    // Keyboard navigation
    el.imoInput.addEventListener('keydown', e => {
        const dd = document.getElementById('acDropdown');
        const ddOpen = dd?.classList.contains('show');
        if (e.key === 'ArrowDown')  { e.preventDefault(); _acMove(1); return; }
        if (e.key === 'ArrowUp')    { e.preventDefault(); _acMove(-1); return; }
        if (e.key === 'Escape')     { _hideDropdown(); return; }
        if (e.key === 'Enter') {
            if (ddOpen && _acSelectedIdx >= 0) { e.preventDefault(); _selectAcItem(_acSelectedIdx); return; }
            if (!el.addBtn?.disabled) addVessel();
        }
    });

    el.imoInput.addEventListener('input', () => {
        clearTimeout(S.debounceTimer);
        const raw = el.imoInput.value.trim();
        el.namePreview.innerHTML = '';
        el.imoInput.style.borderColor = '';
        el.addBtn.disabled = true;
        S.lastImoLookupData = null;

        if (!raw) { _hideDropdown(); return; }

        const isDigitsOnly = /^\d+$/.test(raw);

        // ── NAME SEARCH MODE ─────────────────────────────────────────────────
        if (!isDigitsOnly && raw.length >= 2) {
            S.debounceTimer = setTimeout(async () => {
                const results = await _searchVesselsByName(raw);
                _showDropdown(results);
            }, 350);
            return;
        }

        // ── IMO MODE ─────────────────────────────────────────────────────────
        _hideDropdown();

        if (!/^\d{7}$/.test(raw)) {
            if (raw.length > 0 && isDigitsOnly) {
                el.namePreview.innerHTML = `<span style="color:var(--danger);font-size:.78rem;">${i18n.get('invalidImoDigits')}</span>`;
            }
            return;
        }
        if (!validateIMO(raw)) {
            el.imoInput.style.borderColor = 'var(--danger)';
            el.namePreview.innerHTML = `<span style="color:var(--danger);font-size:.78rem;">${i18n.get('invalidImoCheck')}</span>`;
            return;
        }
        if (S.trackedImosCache.includes(raw)) {
            el.imoInput.style.borderColor = 'var(--warning)';
            el.namePreview.innerHTML = `<span style="color:var(--warning);font-size:.78rem;">${i18n.get('alreadyTracked')}</span>`;
            return;
        }
        if (!S.currentUser) {
            el.namePreview.innerHTML = `<span style="color:var(--text-soft);font-size:.78rem;">👤 <a href="#" onclick="openAuthModal('login');return false;" style="color:var(--accent);">Login</a> to look up vessels</span>`;
            el.addBtn.disabled = true;
            return;
        }

        const imo = raw;
        el.imoInput.style.borderColor = 'var(--success)';
        const isSanc = S.sanctionsLoaded && S.sanctionedImos.has(imo);
        const warnHtml = isSanc ? `<div style="background:var(--sanction-dim);border:1px solid rgba(255,69,0,.3);border-radius:8px;padding:8px 11px;margin-bottom:6px;font-size:.76rem;"><strong style="color:var(--sanction);">🚨 SANCTIONED VESSEL</strong><div style="color:var(--text-main);margin-top:2px;font-size:.7rem;">${escapeHtml([...new Set((S.sanctionDetails.get(imo) || []).map(d => d.list))].join(', ') || 'Sanctions list')}</div></div>` : '';

        if (S.staticCache.has(imo)) {
            const c = S.staticCache.get(imo), fc = getFlagCode(c.flag);
            const fh = fc ? `<img src="https://flagcdn.com/24x18/${fc.toLowerCase()}.png" style="width:18px;height:13px;border:1px solid var(--border);border-radius:2px;margin-right:5px;" alt="">` : '';
            const vesselName = c.name || S.vesselsDataMap.get(imo)?.name || `IMO ${imo}`;
            const ownerLine = c.equasis_owner ? `<div style="font-size:.72rem;color:var(--text-soft);margin-top:3px;">🏢 ${escapeHtml(c.equasis_owner)}${c.mmsi ? ` · 📡 ${escapeHtml(c.mmsi)}` : ''}</div>` : '';
            el.namePreview.innerHTML = warnHtml + `<div style="display:flex;align-items:center;gap:5px;font-size:.8rem;">${fh}<strong style="color:var(--text-main);">${escapeHtml(vesselName)}</strong><span style="font-size:.65rem;background:var(--bg-elevated);padding:1px 5px;border-radius:4px;color:var(--text-soft);">cached</span></div>${ownerLine}`;
            el.addBtn.disabled = false;
            return;
        }

        S.debounceTimer = setTimeout(async () => {
            el.addBtn.disabled = true;
            el.namePreview.innerHTML = warnHtml + `<span style="color:var(--text-soft);font-size:.78rem;">${i18n.get('lookingUp')}</span>`;
            try {
                const authHdr = S.currentUser?.access_token ? { 'Authorization': `Bearer ${S.currentUser.access_token}` } : {};
                let data = null;

                if (_equasisAllowed()) {
                    try {
                        const r = await fetchWithTimeout(`${CONFIG.WORKER_URL}/vessel/equasis/${imo}`, { headers: authHdr }, 7000);
                        if (r.ok) {
                            const eq = await r.json();
                            if (eq && eq.vessel_name) data = _mergeEquasisData(eq);
                        }
                    } catch { }
                }

                if (!data) {
                    try {
                        const r = await fetchWithTimeout(`${CONFIG.WORKER_URL}/vessel/preview/${imo}`, { headers: authHdr }, 5000);
                        if (r.ok) { const d = await r.json(); if (d && d.found !== false) data = d; }
                    } catch { }
                }

                if (!data) {
                    // Lookup timed out or failed — let user add anyway
                    el.namePreview.innerHTML = warnHtml + `<span style="color:var(--warning);font-size:.78rem;">${i18n.get('lookupFailed').replace('{imo}', imo)}</span>`;
                    el.addBtn.disabled = false;
                    return;
                }
                if (data.found === false) {
                    el.namePreview.innerHTML = warnHtml + `<span style="color:var(--danger);font-size:.78rem;">${i18n.get('imoNotFound').replace('{imo}', imo)}</span>`;
                    el.addBtn.disabled = !isSanc;
                    return;
                }

                const vesselName = data.vessel_name || data.name || `IMO ${imo}`;
                const fc = getFlagCode(data.flag);
                const fh = fc ? `<img src="https://flagcdn.com/24x18/${fc.toLowerCase()}.png" style="width:18px;height:13px;border:1px solid var(--border);border-radius:2px;margin-right:5px;" alt="">` : '';
                const ownerLine = data.equasis_owner ? `<div style="font-size:.72rem;color:var(--text-soft);margin-top:3px;">🏢 ${escapeHtml(data.equasis_owner)}${data.mmsi || data['MMSI'] ? ` · 📡 ${escapeHtml(data.mmsi || data['MMSI'])}` : ''}</div>` : '';

                el.namePreview.innerHTML = warnHtml + `
                    <div style="display:flex;align-items:center;gap:5px;font-size:.8rem;">
                        ${fh}<strong style="color:var(--text-main);">${escapeHtml(vesselName)}</strong>
                        <span style="color:var(--text-soft);">${escapeHtml(data.ship_type || data['Type of ship'] || '')} · ${escapeHtml(data.flag || '')}</span>
                    </div>${ownerLine}`;

                el.addBtn.disabled = false;
                S.lastImoLookupData = data;
                updateStaticCache(imo, data).catch(() => {});
            } catch {
                el.namePreview.innerHTML = warnHtml + `<span style="color:var(--warning);font-size:.78rem;">${i18n.get('lookupFailed').replace('{imo}', imo)}</span>`;
                el.addBtn.disabled = false;
            }
        }, 800);
    });
}

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

function renderVessels(tracked) {
    if (!tracked || tracked.length === 0) {
        if (!S.currentUser) {
            el.vesselsContainer.innerHTML = `
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
            el.vesselsContainer.innerHTML = `<div class="empty-state"><div class="icon">🚢</div><p>${i18n.get('noVessels')}</p><small>${i18n.get('addImoHint')}</small></div>`;
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
        const v = S.vesselsDataMap.get(imo) || {};
        const sc2 = S.staticCache.get(imo);
        const resolvedName = v.name || sc2?.name || null;
        if (resolvedName && !v.name) v.name = resolvedName;
        const status = getVesselStatus(v), ageData = formatSignalAge(v.last_pos_utc);
        const prio = isPriority(imo), sanc = S.sanctionedImos.has(imo);
        const isPending = !S.vesselsDataMap.has(imo) || (v.lat == null && v.lon == null && !v.last_pos_utc);
        return { imo, v, sc2, status, ageData, name: resolvedName || i18n.get('loadingDots'), rawAgeMs: ageData.rawAgeMs, isPending, prio, sanc };
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
        el.vesselsContainer.innerHTML = `<div class="empty-state"><div class="icon">🔍</div><p>${i18n.get('noMatch')}</p></div>`;
        return;
    }

    [...el.vesselsContainer.children].forEach(c => { if (!c.dataset.imo) c.remove(); });

    const existingCards = new Map(
        [...el.vesselsContainer.querySelectorAll('[data-imo]')].map(el2 => [el2.dataset.imo, el2])
    );
    const renderedImos = new Set();

    items.forEach(({ imo, v, sc2, status, ageData, isPending, prio, sanc }) => {
        const fingerprint = `${i18n.currentLang}|${isPending}|${status}|${ageData.ageText}|${v.name}|${v.destination}|${v.sog}|${prio}|${sanc}|${_ownersCache.has(imo) ? _ownersCache.get(imo).name : (sc2?.equasis_owner || '')}`;
        const existing = existingCards.get(imo);
        const wasExpanded = existing?.querySelector('.vessel-expanded')?.classList.contains('open') || false;
        if (existing && existing.dataset.fp === fingerprint) {
            el.vesselsContainer.appendChild(existing);
            renderedImos.add(imo);
            return;
        }
        try {
            const sc = { UNDERWAY: 'underway', 'AT PORT': 'at_port', 'AT ANCHOR': 'at_anchor', STALLED: 'stalled' }[status] || '';
            const tc = { UNDERWAY: 'status-underway', 'AT PORT': 'status-at_port', 'AT ANCHOR': 'status-at_anchor', STALLED: 'status-stalled', 'DATA PENDING': 'status-unknown' }[status] || 'status-unknown';
            const fc = getFlagCode(v.flag || sc2?.flag);
            const fh = fc ? `<img src="https://flagcdn.com/24x18/${fc.toLowerCase()}.png" class="flag-icon" alt="${escapeHtml(v.flag || sc2?.flag || '')}" />` : `<div class="flag-placeholder">🏴</div>`;
            const draughtNum = parseNum(v.draught_m || sc2?.draught_m);
            const loaVal = v.length_overall_m || sc2?.length_overall_m;
            const loaHtml = loaVal ? `<span class="vessel-loa">${Number(loaVal).toFixed(0)}m${draughtNum != null ? ' / ' + draughtNum.toFixed(1) + 'm' : ''}</span>` : '';
            const etaR = formatEtaCountdown(v.eta_utc);
            const np = v.nearest_port_name || v.nearest_port;
            const di = np ? getPortDepthInfo(np) : null;
            const depthHtml = di ? `<span class="tag depth" title="${i18n.get('tipAnchorDepth')}">⚓ ${di.anchor}</span><span class="tag depth" title="${i18n.get('tipPierDepth')}">🏭 ${di.pier}</span>` : '';
            const compat = getPortCompatibility(v.draught_m || sc2?.draught_m, v.lat, v.lon);

            const sancBanner = sanc ? `<div class="sanction-banner"><div class="sanction-banner-icon">🚨</div><div><div class="sanction-banner-title">SANCTIONED — ${escapeHtml([...new Set((S.sanctionDetails.get(imo) || []).map(d => d.list))].join(' · ') || 'Sanctions List')}</div><div class="sanction-banner-detail">${escapeHtml((S.sanctionDetails.get(imo) || [])[0]?.name || 'Appears on sanctions list')}</div></div></div>` : '';

            const compatHtml = compat ? `
                <div class="section-divider"></div>
                <div class="section-mini-title">${i18n.get('portCompatTitle')} · ${i18n.get('vesselDraught')} ${compat[0].draught}m</div>
                <div class="compat-grid">
                    ${compat.map(p => `<div class="compat-port">${CI[p.status] || CI.unknown}<div><div class="compat-port-name">${escapeHtml(p.name)}</div><div class="compat-port-depth">${p.pierDepth != null ? i18n.get('pierLabel') + ' ' + p.pierDepth + 'm / ' + i18n.get('anchLabel') + ' ' + p.anchorDepth + 'm' : i18n.get('noDepthData')}${p.distanceNm != null ? ' · ' + i18n.get('distFromVessel').replace('{n}', Math.round(p.distanceNm)) : ''}</div></div></div>`).join('')}
                </div>` : '';

            const notesHtml = `
                <div class="section-divider"></div>
                <div class="section-mini-title">📋 ${i18n.get('notesLabel')} <span id="notes-saved-${imo}" class="notes-saved">✓ Saved</span></div>
                <textarea id="notes-${imo}" oninput="onNoteInput('${imo}',this)" placeholder="Agent contact, cargo, special instructions...">${escapeHtml(getNotes(imo))}</textarea>`;

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
                                    <span class="vessel-name">${escapeHtml(v.name || sc2?.name || i18n.get('loadingDots'))}</span>
                                    ${sanc ? `<span class="tag sanction-tag">🚨 Sanctioned</span>` : prio ? `<span style="font-size:.82rem;">🚩</span>` : ''}
                                    ${loaHtml}
                                </div>
                                <div class="vessel-imo">IMO ${imo}</div>
                            </div>
                            <span class="tag ${tc}">${getStatusLabel(status)}</span>
                        </div>
                        ${isPending
                    ? (() => {
                        const nextRun = getNextScraperRun(S.lastFlowRunMs || Date.now());
                        const nextH   = nextRun.getUTCHours().toString().padStart(2,'0');
                        const nextM   = nextRun.getUTCMinutes().toString().padStart(2,'0');
                        const isNextDay = nextRun.getUTCDate() !== new Date().getUTCDate();
                        const nextStr = (isNextDay ? 'Tomorrow ' : '') + nextH + ':' + nextM + ' UTC';
                        const cache   = sc2 || {};
                        const hasAnyCache = cache.flag || cache.ship_type || cache.deadweight_t || cache.year_of_build || cache.call_sign || cache.mmsi || cache.equasis_owner;
                        return `
                        <div class="vessel-meta">
                            ${cache.flag ? `<div class="meta-row"><span class="meta-label">${i18n.get('flagLabel')}</span><span class="meta-val">${escapeHtml(cache.flag)}</span></div>` : ''}
                            ${cache.ship_type && cache.ship_type !== '-' ? `<div class="meta-row"><span class="meta-label">${i18n.get('shipType') || 'Type'}</span><span class="meta-val">${escapeHtml(cache.ship_type)}</span></div>` : ''}
                            ${cache.deadweight_t && cache.deadweight_t !== '-' ? `<div class="meta-row"><span class="meta-label">${i18n.get('dwt') || 'DWT'}</span><span class="meta-val">${formatNumber(Number(cache.deadweight_t)/1000)}k t</span></div>` : ''}
                            ${cache.gross_tonnage ? `<div class="meta-row"><span class="meta-label">${i18n.get('grossTonnage')}</span><span class="meta-val">${Number(cache.gross_tonnage).toLocaleString()} t</span></div>` : ''}
                            ${cache.year_of_build && cache.year_of_build !== '-' ? `<div class="meta-row"><span class="meta-label">${i18n.get('builtYear') || 'Built'}</span><span class="meta-val">${escapeHtml(String(cache.year_of_build))}</span></div>` : ''}
                            ${cache.length_overall_m ? `<div class="meta-row"><span class="meta-label">LOA</span><span class="meta-val">${Number(cache.length_overall_m).toFixed(1)} m</span></div>` : ''}
                            ${cache.beam_m ? `<div class="meta-row"><span class="meta-label">${i18n.get('vesselBeam')}</span><span class="meta-val">${Number(cache.beam_m).toFixed(1)} m</span></div>` : ''}
                            ${cache.draught_m ? `<div class="meta-row"><span class="meta-label">${i18n.get('vesselDraught')}</span><span class="meta-val">${Number(cache.draught_m).toFixed(1)} m</span></div>` : ''}
                            ${cache.call_sign ? `<div class="meta-row"><span class="meta-label">Call Sign</span><span class="meta-val">${escapeHtml(cache.call_sign)}</span></div>` : ''}
                            ${cache.mmsi ? `<div class="meta-row"><span class="meta-label">MMSI</span><span class="meta-val">${escapeHtml(cache.mmsi)}</span></div>` : ''}
                            ${cache.equasis_owner ? `<div class="meta-row"><span class="meta-label">${i18n.get('ownerCompanyLabel').replace(' *','')}</span><span class="meta-val"><a href="#" onclick="event.preventDefault();event.stopPropagation();sofShowOwnerPopup('${imo}','${escapeHtml(cache.name || '')}','${escapeHtml(cache.equasis_owner)}')" style="color:var(--accent);">${escapeHtml(cache.equasis_owner)}</a></span></div>` : ''}
                            ${cache.pi_club ? `<div class="meta-row"><span class="meta-label">P&I Club</span><span class="meta-val">${escapeHtml(cache.pi_club)}</span></div>` : ''}
                            ${cache.class_society ? `<div class="meta-row"><span class="meta-label">Class</span><span class="meta-val">${escapeHtml(cache.class_society)}</span></div>` : ''}
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
                            <div class="meta-row"><span class="meta-label">${i18n.get('destLabel')}</span><span class="meta-val">${escapeHtml(v.destination || '—')}</span></div>
                            <div class="meta-row"><span class="meta-label">${i18n.get('posLabel')}</span><span class="meta-val"><span class="tag position">${v.lat != null ? Number(v.lat).toFixed(3) : '—'}, ${v.lon != null ? Number(v.lon).toFixed(3) : '—'}</span></span></div>
                            <div class="meta-row"><span class="meta-label">${i18n.get('etaLabel')}</span><span class="meta-val">${etaR ? `<span class="eta-countdown ${etaR.cls}" data-eta="${escapeHtml(v.eta_utc || '')}">${etaR.text}</span>` : (formatLocalTime(v.eta_utc) || '—')}</span></div>
                            <div class="meta-row"><span class="meta-label">${i18n.get('flagLabel')}</span><span class="meta-val">${escapeHtml(v.flag || sc2?.flag || '—')}</span></div>
                        </div>
                        <div class="tag-row">
                            ${v.sog != null ? `<span class="tag speed" title="${i18n.get('tipSpeed')}">⚡ ${Number(v.sog).toFixed(1)} kn</span>` : ''}
                            ${v.cog != null ? `<span class="tag" title="${i18n.get('tipCourse')}">🧭 ${Number(v.cog).toFixed(0)}°</span>` : ''}
                            ${np ? `<span class="tag" title="${i18n.get('tipNearestPort')}">🏝 ${escapeHtml(np)}${v.nearest_distance_nm ? ' ' + Number(v.nearest_distance_nm).toFixed(0) + ' nm' : ''}</span>` : ''}
                            ${depthHtml}
                            ${v.destination_distance_nm ? `<span class="tag distance" title="${i18n.get('tipDestDistance')}">🎯 ${Number(v.destination_distance_nm).toFixed(0)} nm</span>` : ''}
                            <div id="weather-${imo}" style="display:contents;"></div>
                        </div>
                        <div class="hint-text">${i18n.get('tapExpand')} · ${escapeHtml(v.flag || sc2?.flag || '—')}</div>`
                }
                    </div>
                </div>
                <div id="details-${imo}" class="vessel-expanded">
                    <div class="section-mini-title">📋 ${i18n.get('vesselDetails')}</div>
                    <div class="expanded-grid">
                        <div class="exp-item"><div class="exp-label">${i18n.get('shipType')}</div><div class="exp-val">${escapeHtml(v.ship_type || sc2?.ship_type || '—')}</div></div>
                        <div class="exp-item"><div class="exp-label">${i18n.get('dwt')}</div><div class="exp-val">${(v.deadweight_t || sc2?.deadweight_t) ? formatNumber(Number(v.deadweight_t || sc2?.deadweight_t) / 1000) + 'k t' : '—'}</div></div>
                        <div class="exp-item"><div class="exp-label">${i18n.get('grossTonnage')}</div><div class="exp-val">${(v.gross_tonnage || sc2?.gross_tonnage) ? Number(v.gross_tonnage || sc2?.gross_tonnage).toLocaleString() + ' t' : '—'}</div></div>
                        <div class="exp-item"><div class="exp-label">${i18n.get('builtYear')}</div><div class="exp-val">${escapeHtml(v.year_of_build || sc2?.year_of_build || '—')}</div></div>
                        <div class="exp-item"><div class="exp-label">${i18n.get('vesselLength')}</div><div class="exp-val">${(v.length_overall_m || sc2?.length_overall_m) ? Number(v.length_overall_m || sc2?.length_overall_m).toFixed(1) + ' m' : '—'}</div></div>
                        <div class="exp-item"><div class="exp-label">${i18n.get('vesselBeam')}</div><div class="exp-val">${(v.beam_m || sc2?.beam_m) ? Number(v.beam_m || sc2?.beam_m).toFixed(1) + ' m' : '—'}</div></div>
                        <div class="exp-item"><div class="exp-label">${i18n.get('vesselDraught')}</div><div class="exp-val">${parseNum(v.draught_m || sc2?.draught_m) != null ? parseNum(v.draught_m || sc2?.draught_m).toFixed(1) + ' m' : '—'}</div></div>
                        <div class="exp-item"><div class="exp-label">${i18n.get('mmsiLabel')}</div><div class="exp-val">${escapeHtml(v.mmsi || sc2?.mmsi || '—')}</div></div>
                        <div class="exp-item"><div class="exp-label">${i18n.get('aisSourceLabel')}</div><div class="exp-val">${escapeHtml(v.ais_source || '—')}</div></div>
                        <div class="exp-item"><div class="exp-label">${i18n.get('flagLabel')}</div><div class="exp-val">${escapeHtml(v.flag || sc2?.flag || '—')}</div></div>
                        ${sc2?.call_sign ? `<div class="exp-item"><div class="exp-label">Call Sign</div><div class="exp-val">${escapeHtml(sc2.call_sign)}</div></div>` : ''}
                        ${sc2?.pi_club   ? `<div class="exp-item" style="grid-column:1/-1;"><div class="exp-label">🛡 P&I Club</div><div class="exp-val">${escapeHtml(sc2.pi_club)}</div></div>` : ''}
                        ${(() => {
                            const manualOwner  = _ownersCache.get(imo);
                            const equasisOwner = sc2?.equasis_owner;
                            if (manualOwner) {
                                return `<div class="exp-item" style="grid-column:1/-1;"><div class="exp-label">🏢 Owners</div><div class="exp-val"><a href="#" onclick="event.preventDefault();event.stopPropagation();showOwnerInfo('${imo}')" style="color:var(--accent);text-decoration:none;font-weight:600;">${escapeHtml(manualOwner.name)}</a></div></div>`;
                            } else if (equasisOwner) {
                                return `<div class="exp-item" style="grid-column:1/-1;"><div class="exp-label">🏢 Registered Owner</div><div class="exp-val"><a href="#" onclick="event.preventDefault();event.stopPropagation();sofShowOwnerPopup('${imo}','${escapeHtml(v.name||sc2?.name||'')}','${escapeHtml(equasisOwner)}')" style="color:var(--accent);text-decoration:none;font-weight:600;">${escapeHtml(equasisOwner)}</a><span style="font-size:.65rem;color:var(--text-soft);margin-left:6px;">· tap to add contact</span></div></div>`;
                            }
                            return '';
                        })()}
                    </div>
                    ${compatHtml}
                    ${notesHtml}
                </div>
                <div class="vessel-footer">
                    <span class="vessel-footer-meta">AIS: ${escapeHtml(v.ais_source || '—')} · ${ageData.ageText}</span>
                    <div class="vessel-footer-actions">
                        <button class="btn-ghost" style="padding:5px 9px;font-size:.68rem;" onclick="event.stopPropagation();openSOF('${imo}')">📋 SOF</button>
                        <button class="btn-ghost" style="padding:5px 9px;font-size:.68rem;" onclick="event.stopPropagation();openPortCallsEditor('${imo}', '${(v.name || imo).replace(/'/g, "\\'")}')"> 📍 Ports </button>
                        <button class="${prio ? 'btn-urgent' : 'btn-ghost'}" style="padding:5px 9px;font-size:.68rem;" onclick="event.stopPropagation();togglePriority('${imo}')">${prio ? i18n.get('priorityBtn') : i18n.get('flagBtn')}</button>
                        <button class="btn-danger" style="padding:5px 9px;font-size:.68rem;" onclick="event.stopPropagation();removeIMO('${imo}')">${i18n.get('remove')}</button>
                    </div>
                </div>
            `;
            if (existing) existing.remove();
            el.vesselsContainer.appendChild(card);
            renderedImos.add(imo);
            if (wasExpanded) { const exp = card.querySelector('.vessel-expanded'); if (exp) exp.classList.add('open'); }

            if (v.lat != null && v.lon != null) fetchAndRenderWeather(imo, v.lat, v.lon);
        } catch (err) {
            console.warn(`Card render error IMO ${imo}:`, err);
        }
    });

    existingCards.forEach((node, imo2) => {
        if (!renderedImos.has(imo2)) node.remove();
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
        const popup = `<div style="font-family:sans-serif;min-width:185px;">${isSanc ? `<div style="background:rgba(255,69,0,.15);border:1px solid rgba(255,69,0,.3);border-radius:5px;padding:4px 8px;margin-bottom:7px;font-size:.7rem;color:#ff4500;font-weight:700;">🚨 ${i18n.get('mapSanctioned')}</div>` : ''}<div style="font-weight:700;font-size:.9rem;color:var(--text-main);margin-bottom:3px;">${escapeHtml(v.name || 'IMO ' + imo)}</div><div style="font-size:.7rem;color:var(--text-soft);margin-bottom:7px;">IMO ${imo} · ${escapeHtml(v.flag || '—')}</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:3px;font-size:.74rem;color:var(--text-main);"><div><span style="color:var(--text-soft);">${i18n.get('mapStatus')}</span><br><strong style="color:${color};">${getStatusLabel(status)}</strong></div><div><span style="color:var(--text-soft);">${i18n.get('mapSignal')}</span><br><strong>${age.ageText}</strong></div><div><span style="color:var(--text-soft);">${i18n.get('mapSpeed')}</span><br><strong>${v.sog != null ? Number(v.sog).toFixed(1) + ' kn' : '—'}</strong></div><div><span style="color:var(--text-soft);">${i18n.get('mapCourse')}</span><br><strong>${v.cog != null ? Number(v.cog).toFixed(0) + '°' : '—'}</strong></div></div>${v.destination ? `<div style="margin-top:6px;font-size:.7rem;color:var(--text-main);"><span style="color:var(--text-soft);">${i18n.get('mapDest')} </span><strong>${escapeHtml(v.destination)}</strong></div>` : ''}</div>`;
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
        el.addCard?.classList.add('hidden');
        toggleView('list');
    } else if (tab === 'map') {
        document.getElementById('navMap')?.classList.add('active');
        el.addCard?.classList.add('hidden');
        toggleView('map');
    } else if (tab === 'add') {
        document.getElementById('navAdd')?.classList.add('active');
        el.addCard?.classList.remove('hidden');
        el.addCard?.scrollIntoView({ behavior: 'smooth' });
        setTimeout(() => el.imoInput?.focus(), 300);
    } else if (tab === 'alerts') {
        document.getElementById('navAlerts')?.classList.add('active');
        handleBellClick();
        const restoreFleet = () => {
            document.getElementById('navAlerts')?.classList.remove('active');
            document.getElementById('navFleet')?.classList.add('active');
        };
        el.alertOverlay?.addEventListener('click', restoreFleet, { once: true });
        document.querySelector('.alert-panel .btn-secondary')?.addEventListener('click', restoreFleet, { once: true });
    } else if (tab === 'export') {
        document.getElementById('navExport')?.classList.add('active');
        exportCSV();
        setTimeout(() => {
            document.getElementById('navExport')?.classList.remove('active');
            document.getElementById('navFleet')?.classList.add('active');
        }, 1200);
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORT CSV
// ═══════════════════════════════════════════════════════════════════════════════

function exportCSV() {
    const h = ['IMO', 'Vessel', 'Status', 'Sanctioned', 'Priority', 'Flag', 'Lat', 'Lon', 'Speed(kn)', 'Course', 'Destination', 'Signal Age', 'DWT', 'Ship Type', 'LOA(m)', 'Built', 'Draught(m)'];
    const rows = S.trackedImosCache.map(imo => {
        const v = S.vesselsDataMap.get(imo) || {}, a = formatSignalAge(v.last_pos_utc);
        return [imo, v.name || '', getVesselStatus(v), S.sanctionedImos.has(imo) ? 'YES' : 'NO', isPriority(imo) ? 'YES' : 'NO', v.flag || '', v.lat || '', v.lon || '', v.sog != null ? Number(v.sog).toFixed(1) : '', v.cog != null ? Number(v.cog).toFixed(0) : '', v.destination || '', a.ageText, v.deadweight_t || '', v.ship_type || '', v.length_overall_m || '', v.year_of_build || '', parseNum(v.draught_m) != null ? parseNum(v.draught_m).toFixed(1) : ''];
    });
    const csv = [h, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    Object.assign(document.createElement('a'), { href: url, download: `fleet_${new Date().toISOString().slice(0, 10)}.csv` }).click();
    URL.revokeObjectURL(url);
    updateStatus(i18n.get('exportSuccess'), 'success');
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
    document.addEventListener('touchmove', e => { if (!pulling) return; if (e.touches[0].clientY - startY > 60 && el.ptrIndicator) { el.ptrIndicator.classList.add('show'); el.ptrIndicator.textContent = i18n.get('ptrRelease'); } }, { passive: true });
    document.addEventListener('touchend', e => {
        if (!pulling) return;
        pulling = false;
        const dy = e.changedTouches[0].clientY - startY;
        if (dy > 60 && el.ptrIndicator) {
            el.ptrIndicator.textContent = i18n.get('ptrRefreshing');
            loadData().then(() => el.ptrIndicator.classList.remove('show'));
        } else if (el.ptrIndicator) el.ptrIndicator.classList.remove('show');
    });
}

// ═══════════════════════════════════════════════════════════════════════════════
// AUTH & SESSION MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

function saveSession(user) {
    const expires = new Date(Date.now() + 30 * 24 * 3600000).toUTCString();
    document.cookie = `vt_session=${encodeURIComponent(JSON.stringify(user))}; expires=${expires}; path=/; SameSite=Strict`;
    S.currentUser = user;
}

function loadSession() {
    try {
        const match = document.cookie.match(/(?:^|;\s*)vt_session=([^;]+)/);
        if (!match) return;
        const user = JSON.parse(decodeURIComponent(match[1]));
        if (user && user.access_token && user.username && user.user_id) {
            S.currentUser = user;
            S.fleetMode = 'personal';
            return user;
        }
    } catch (e) { console.warn('Session load failed:', e); }
    return null;
}

function clearSession() {
    document.cookie = 'vt_session=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Strict';
    S.currentUser = null;
    S.fleetMode = 'public';
}

const ALLOWED_EMAIL_DOMAINS = ['cma-cgm.com'];

function isAllowedEmailDomain(email) {
    if (!email || !email.includes('@')) return false;
    const domain = email.split('@').pop().toLowerCase();
    return ALLOWED_EMAIL_DOMAINS.includes(domain);
}

async function register(username, pin, email) {
    const res = await fetchWithTimeout(
        `${CONFIG.WORKER_URL}/auth/register`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, pin, email })
        },
        12000
    );
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Registration failed');
    return login(username, pin);
}

async function login(username, pin) {
    const res = await fetchWithTimeout(
        `${CONFIG.WORKER_URL}/auth/login`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, pin })
        },
        12000
    );
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Login failed');
    saveSession({ username: data.username, access_token: data.access_token, user_id: data.user_id });
    S.fleetMode = 'personal';
    updateAuthIcon();
    closeAuthModal();
    if (window.innerWidth >= 641 && el.addCard) el.addCard.classList.remove('hidden');
    loadData();
    loadUserProfile();
    injectHandoffBadge();
    window._handoffShownOnLogin = false;
    startHandoffPolling();
    return data;
}

function logout() {
    clearSession();
    S.fleetMode = 'public';
    updateAuthIcon();
    closeSettingsPanel();
    if (el.addCard) el.addCard.classList.add('hidden');
    loadData();
    stopHandoffPolling();
    updateHandoffBadge(0);
}

async function deleteAccount() {
    if (!S.currentUser) return;

    const pin = prompt('Enter your PIN to confirm account deletion.\n\n⚠️ This will permanently delete your account and all tracked vessels.');
    if (pin === null) return;
    if (!/^\d{4,6}$/.test(pin.trim())) {
        alert('Invalid PIN format — account not deleted.');
        return;
    }

    const msgEl = document.getElementById('cmSettingsMsg');
    if (msgEl) { msgEl.textContent = '⏳ Deleting account...'; msgEl.style.color = 'var(--text-soft)'; }

    try {
        const res = await fetchWithTimeout(
            `${CONFIG.WORKER_URL}/auth/delete`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_token: S.currentUser.access_token, pin: pin.trim() }),
            },
            12000
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Deletion failed');

        clearSession();
        localStorage.removeItem('vt_cache');
        localStorage.removeItem('vt_alerts');
        localStorage.removeItem('vt_priorities');
        S.fleetMode = 'public';
        S.trackedImosCache = [];
        S.vesselsDataMap = new Map();
        S.alerts = [];
        S.priorities = [];
        closeSettingsPanel();
        updateAuthIcon();
        renderVessels([]);
        updateFleetKPI([]);
        updateStatus('Account deleted successfully', 'success');
    } catch (e) {
        if (msgEl) { msgEl.textContent = `✗ ${e.message}`; msgEl.style.color = 'var(--danger)'; }
    }
}

function updateAuthIcon() {
    const label = S.currentUser ? `👤 ${S.currentUser.username}` : '👤 Login';
    const desktopBtn = document.getElementById('authIconBtn');
    const mobileBtn = document.getElementById('authIconBtnMobile');
    if (desktopBtn) {
        const labelSpan = document.getElementById('authIconBtnLabel');
        if (labelSpan) labelSpan.textContent = S.currentUser ? S.currentUser.username : 'Login';
        else desktopBtn.textContent = label;
    }
    if (mobileBtn) mobileBtn.childNodes[1] && (mobileBtn.childNodes[1].textContent = S.currentUser ? S.currentUser.username : 'Account');
}

function openAuthModal(mode) {
    const modal = document.getElementById('authModal');
    if (!modal) return;
    modal.classList.remove('hidden');
    setAuthMode(mode || 'login');
}

function closeAuthModal() {
    const modal = document.getElementById('authModal');
    if (modal) modal.classList.add('hidden');
    const errDiv = document.getElementById('authError');
    if (errDiv) errDiv.textContent = '';
}

function setAuthMode(mode) {
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
}

function toggleAuthMode() {
    const modal = document.getElementById('authModal');
    if (!modal) return;
    const current = modal.dataset.mode || 'login';
    setAuthMode(current === 'login' ? 'register' : 'login');
    const errDiv = document.getElementById('authError');
    if (errDiv) errDiv.textContent = '';
}

async function submitAuth() {
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
        if (!isAllowedEmailDomain(email)) {
            if (errDiv) errDiv.textContent = 'Email must be a company address (@cma-cgm.com)';
            return;
        }
    }

    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = '⏳'; }

    try {
        if (mode === 'register') {
            await register(username, pin, email);
        } else {
            await login(username, pin);
        }
    } catch (e) {
        if (errDiv) errDiv.textContent = e.message || 'Something went wrong';
    } finally {
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = mode === 'register' ? 'Create Account' : 'Login'; }
    }
}

async function loadUserProfile() {
    if (!S.currentUser) return;
    try {
        const res = await fetchWithTimeout(`${CONFIG.WORKER_URL}/user/profile`, {
            headers: { 'Authorization': `Bearer ${S.currentUser.access_token}` }
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
}

async function loadAdminDashboard() {
    const el = document.getElementById('adminContent');
    if (!el || !S.currentUser) return;
    el.innerHTML = '<span style="color:var(--text-soft);font-size:.75rem;">' + i18n.get('loadingDots') + '</span>';
    try {
        const res = await fetchWithTimeout(
            `${CONFIG.WORKER_URL}/admin/data`,
            { headers: { 'Authorization': `Bearer ${S.currentUser.access_token}` } },
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
                        <div style="font-weight:600;font-size:.75rem;color:var(--text-main);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(v.name || 'IMO '+v.imo)}</div>
                        <div style="font-size:.67rem;color:var(--text-soft);">IMO ${v.imo} · ${v.sog != null ? v.sog.toFixed(1)+' kn' : '—'} · ${escapeHtml(v.destination||'—')}</div>
                        <div style="font-size:.67rem;color:var(--text-soft);">🔔 ${fmt(v.last_alert_utc)}</div>
                    </div>
                    <button onclick="adminFleetRemove('${userId}','${v.imo}',this)" style="background:rgba(239,68,68,.12);border:none;color:var(--danger);border-radius:5px;padding:3px 8px;font-size:.68rem;cursor:pointer;flex-shrink:0;">✕</button>
                </div>`).join('');
        };

        const userCards = data.users.map(u => `
            <div id="adminUser_${u.id}" style="background:var(--bg-elevated);border-radius:8px;padding:10px 12px;margin-bottom:8px;">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
                    <span style="font-weight:700;font-size:.8rem;color:var(--text-main);">👤 ${escapeHtml(u.username)}</span>
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
                    <input id="adminPhone_${u.id}" type="tel" placeholder="${i18n.get('adminPhonePlaceholder')}" value="${escapeHtml(u.callmebot_phone||'')}"
                        style="width:100%;background:var(--bg-elevated);border:1px solid var(--border);border-radius:6px;padding:6px 8px;color:var(--text-main);font-size:.73rem;box-sizing:border-box;margin-bottom:5px;">
                    <input id="adminApikey_${u.id}" type="text" placeholder="${i18n.get('adminApiKeyPlaceholder')}" value="${escapeHtml(u.callmebot_apikey||'')}"
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
            ${userCards}
            ${publicBlock}
            <button onclick="loadAdminDashboard()" style="width:100%;padding:6px;font-size:.72rem;background:none;border:1px solid var(--border);border-radius:6px;color:var(--text-soft);cursor:pointer;margin-top:2px;">${i18n.get('adminRefreshBtn')}</button>`;

    } catch(e) {
        el.innerHTML = `<span style="color:var(--danger);font-size:.75rem;">Failed: ${escapeHtml(e.message)}</span>`;
    }
}

function adminToggleEdit(userId) {
    const el = document.getElementById(`adminEdit_${userId}`);
    if (!el) return;
    el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

async function adminToggleAlerts(userId, newState, btn) {
    if (!S.currentUser) return;
    btn.disabled = true;
    try {
        const res = await fetchWithTimeout(`${CONFIG.WORKER_URL}/admin/user/update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                admin_token: S.currentUser.access_token,
                user_id: userId,
                callmebot_enabled: newState,
            })
        }, 8000);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        btn.textContent = newState ? '📱 ON' : 'OFF';
        btn.style.background = newState ? 'rgba(34,197,94,.15)' : 'rgba(100,116,139,.15)';
        btn.style.color = newState ? 'var(--success)' : 'var(--text-soft)';
        btn.onclick = () => adminToggleAlerts(userId, !newState, btn);
    } catch(e) {
        showAdminMsg(userId, `Failed: ${e.message}`, 'danger');
    }
    btn.disabled = false;
}

async function adminSaveSettings(userId) {
    if (!S.currentUser) return;
    const phone  = document.getElementById(`adminPhone_${userId}`)?.value.trim() || '';
    const apikey = document.getElementById(`adminApikey_${userId}`)?.value.trim() || '';
    const enabled = document.querySelector(`#adminUser_${userId} button[onclick*="adminToggleAlerts"]`)
        ?.textContent.includes('ON') || false;
    try {
        const res = await fetchWithTimeout(`${CONFIG.WORKER_URL}/admin/user/update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ admin_token: S.currentUser.access_token, user_id: userId, callmebot_phone: phone, callmebot_apikey: apikey, callmebot_enabled: enabled })
        }, 8000);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        showAdminMsg(userId, i18n.get('adminSaved'), 'success');
    } catch(e) { showAdminMsg(userId, `Failed: ${e.message}`, 'danger'); }
}

async function adminResetPin(userId) {
    if (!S.currentUser) return;
    const pinEl = document.getElementById(`adminPin_${userId}`);
    const pin = pinEl?.value.trim();
    if (!pin || !/^\d{4,6}$/.test(pin)) { showAdminMsg(userId, i18n.get('adminPinInvalid'), 'warning'); return; }
    try {
        const res = await fetchWithTimeout(`${CONFIG.WORKER_URL}/admin/user/pin`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ admin_token: S.currentUser.access_token, user_id: userId, new_pin: pin })
        }, 8000);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        if (pinEl) pinEl.value = '';
        showAdminMsg(userId, i18n.get('adminPinReset'), 'success');
    } catch(e) { showAdminMsg(userId, `Failed: ${e.message}`, 'danger'); }
}

async function adminFleetAdd(userId) {
    if (!S.currentUser) return;
    const imoEl = document.getElementById(`adminImo_${userId}`);
    const imo = imoEl?.value.trim();
    if (!imo || imo.length !== 7) { showAdminMsg(userId, i18n.get('adminImoInvalid'), 'warning'); return; }
    try {
        const res = await fetchWithTimeout(`${CONFIG.WORKER_URL}/admin/fleet/add`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ admin_token: S.currentUser.access_token, user_id: userId, imo })
        }, 8000);
        if (!res.ok) { const d = await res.json(); throw new Error(d.error || `HTTP ${res.status}`); }
        if (imoEl) imoEl.value = '';
        showAdminMsg(userId, `✅ IMO ${imo} added`, 'success');
        setTimeout(loadAdminDashboard, 800);
    } catch(e) { showAdminMsg(userId, `Failed: ${e.message}`, 'danger'); }
}

async function adminFleetRemove(userId, imo, btn) {
    if (!S.currentUser) return;
    if (!confirm(`Remove IMO ${imo} from this user?`)) return;
    btn.disabled = true;
    try {
        const res = await fetchWithTimeout(`${CONFIG.WORKER_URL}/admin/fleet/remove`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ admin_token: S.currentUser.access_token, user_id: userId, imo })
        }, 8000);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        btn.closest('div[style*="border-bottom"]')?.remove();
        showAdminMsg(userId, `✅ IMO ${imo} removed`, 'success');
    } catch(e) { showAdminMsg(userId, `Failed: ${e.message}`, 'danger'); btn.disabled = false; }
}

function showAdminMsg(userId, msg, type) {
    const el = document.getElementById(`adminMsg_${userId}`);
    if (!el) return;
    const color = type === 'success' ? 'var(--success)' : type === 'warning' ? 'var(--warning)' : 'var(--danger)';
    el.innerHTML = `<span style="color:${color};">${msg}</span>`;
    setTimeout(() => { if (el) el.innerHTML = ''; }, 3000);
}

async function saveCallMeBotSettings() {
    if (!S.currentUser) return;
    const phone = document.getElementById('cmPhone')?.value.trim() || '';
    const apikey = document.getElementById('cmApiKey')?.value.trim() || '';
    const enabled = document.getElementById('cmEnabled')?.checked || false;
    const msgEl = document.getElementById('cmSettingsMsg');

    try {
        const res = await fetchWithTimeout(
            `${CONFIG.WORKER_URL}/user/settings`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_token: S.currentUser.access_token,
                    callmebot_phone: phone,
                    callmebot_apikey: apikey,
                    callmebot_enabled: enabled,
                })
            },
            10000
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Save failed');
        if (msgEl) { msgEl.textContent = i18n.get('cmSettingsSaved'); msgEl.style.color = 'var(--success)'; setTimeout(() => { if (msgEl) msgEl.textContent = ''; }, 3000); }
    } catch (e) {
        if (msgEl) { msgEl.textContent = `✗ ${e.message}`; msgEl.style.color = 'var(--danger)'; }
    }
}

async function testCallMeBot() {
    const phone = document.getElementById('cmPhone')?.value.trim() || '';
    const apikey = document.getElementById('cmApiKey')?.value.trim() || '';
    const msgEl = document.getElementById('cmSettingsMsg');

    if (!phone || !apikey) {
        if (msgEl) { msgEl.textContent = i18n.get('cmEnterDetails'); msgEl.style.color = 'var(--danger)'; }
        return;
    }

    if (msgEl) { msgEl.textContent = `⏳ ${i18n.get('cmSendingTest')}`; msgEl.style.color = 'var(--text-soft)'; }

    try {
        const res = await fetchWithTimeout(
            `${CONFIG.WORKER_URL}/callmebot/test`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(S.currentUser?.access_token ? { 'Authorization': `Bearer ${S.currentUser.access_token}` } : {}),
                },
                body: JSON.stringify({ phone, apikey, message: 'VesselTracker test alert 🚢' }),
            },
            15000
        );
        const data = await res.json();
        if (data.success) {
            const resp = (data.response || '').toLowerCase();
            const isRejected = resp.includes('incorrect') || resp.includes('error') || resp.includes('invalid') || resp.includes('not found') || resp.includes('failed');
            if (isRejected) {
                if (msgEl) { msgEl.textContent = i18n.get('cmTestInvalid'); msgEl.style.color = 'var(--danger)'; }
            } else {
                if (msgEl) { msgEl.textContent = i18n.get('cmTestSuccess'); msgEl.style.color = 'var(--success)'; }
            }
        } else {
            const errMsg = data.response || data.error || 'Unknown error';
            if (msgEl) { msgEl.textContent = `${i18n.get('cmTestFailed')} ${errMsg}`; msgEl.style.color = 'var(--danger)'; }
        }
    } catch (e) {
        if (msgEl) { msgEl.textContent = `${i18n.get('cmTestFailed')} ${e.message}`; msgEl.style.color = 'var(--danger)'; }
    }
}

function injectAuthModal() {
    const html = `
    <div id="authModal" class="hidden" style="
        position:fixed;inset:0;z-index:9000;
        display:flex;align-items:center;justify-content:center;
        background:rgba(0,0,0,.65);backdrop-filter:blur(4px);
    " onclick="if(event.target===this)closeAuthModal()">
        <div style="
            background:var(--bg-card);border:1px solid var(--border);
            border-radius:16px;padding:28px 28px 24px;width:min(360px,92vw);
            box-shadow:0 20px 60px rgba(0,0,0,.5);
        ">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">
                <h2 id="authModalTitle" style="font-size:1.1rem;font-weight:700;color:var(--text-main);margin:0;">Login</h2>
                <button onclick="closeAuthModal()" style="background:none;border:none;color:var(--text-soft);font-size:1.3rem;cursor:pointer;padding:2px 6px;border-radius:6px;" title="Close">✕</button>
            </div>
            <div style="display:flex;flex-direction:column;gap:12px;">
                <input id="authUsername" type="text" maxlength="20" placeholder="Username"
                    style="background:var(--bg-elevated);border:1px solid var(--border);border-radius:8px;padding:10px 14px;color:var(--text-main);font-size:.9rem;outline:none;width:100%;box-sizing:border-box;"
                    autocomplete="username" autocapitalize="none" spellcheck="false"
                    onkeydown="if(event.key==='Enter')submitAuth()">
                <div id="authEmailRow" style="display:none;">
                    <input id="authEmail" type="email" placeholder="your.name@cma-cgm.com"
                        style="background:var(--bg-elevated);border:1px solid var(--border);border-radius:8px;padding:10px 14px;color:var(--text-main);font-size:.9rem;outline:none;width:100%;box-sizing:border-box;"
                        autocomplete="email" autocapitalize="none" spellcheck="false"
                        onkeydown="if(event.key==='Enter')submitAuth()">
                    <div style="font-size:.7rem;color:var(--text-soft);margin-top:4px;padding-left:2px;">Company email required (@cma-cgm.com)</div>
                </div>
                <input id="authPin" type="password" maxlength="6" placeholder="PIN (4–6 digits)"
                    style="background:var(--bg-elevated);border:1px solid var(--border);border-radius:8px;padding:10px 14px;color:var(--text-main);font-size:.9rem;outline:none;width:100%;box-sizing:border-box;letter-spacing:4px;"
                    inputmode="numeric" autocomplete="current-password"
                    onkeydown="if(event.key==='Enter')submitAuth()">
                <div id="authError" style="color:var(--danger);font-size:.78rem;min-height:18px;"></div>
                <button id="authSubmitBtn" onclick="submitAuth()" class="btn-primary" style="width:100%;padding:11px;font-size:.9rem;border-radius:8px;">Login</button>
            </div>
            <div style="text-align:center;margin-top:14px;">
                <button id="authToggleLink" onclick="toggleAuthMode()" style="background:none;border:none;color:var(--accent);font-size:.8rem;cursor:pointer;text-decoration:underline;">No account? Create one</button>
            </div>
        </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
}

function injectSettingsPanel() {
    const html = `
    <div id="settingsPanel" style="
        position:fixed;top:0;right:0;height:100%;width:min(340px,96vw);
        background:var(--bg-card);border-left:1px solid var(--border);
        z-index:8500;transform:translateX(100%);transition:transform .28s cubic-bezier(.4,0,.2,1);
        overflow-y:auto;display:flex;flex-direction:column;box-shadow:-8px 0 40px rgba(0,0,0,.35);
    ">
        <div style="padding:20px 20px 0;border-bottom:1px solid var(--border);margin-bottom:16px;">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
                <span data-i18n="settingsTitle" style="font-weight:700;font-size:1rem;color:var(--text-main);">&#9881;&#65039; Account Settings</span>
                <button onclick="closeSettingsPanel()" style="background:none;border:none;color:var(--text-soft);font-size:1.25rem;cursor:pointer;padding:2px 6px;border-radius:6px;">&#x2715;</button>
            </div>
            <div style="padding-bottom:14px;font-size:.82rem;color:var(--text-soft);">
                <span data-i18n="settingsLoggedIn">Logged in as</span> <strong style="color:var(--text-main);" id="settingsUsername"></strong>
            </div>
        </div>
        <div style="padding:0 20px 16px;flex:1;">
            <div data-i18n="whatsappAlerts" style="font-weight:600;font-size:.88rem;color:var(--text-main);margin-bottom:12px;">&#128241; WhatsApp Alerts (CallMeBot)</div>
            <div style="font-size:.76rem;color:var(--text-soft);background:var(--bg-elevated);border-radius:10px;padding:12px 14px;margin-bottom:14px;line-height:1.6;">
                <div data-i18n="cmSetupTitle" style="font-weight:600;color:var(--text-main);margin-bottom:6px;">Setup:</div>
                <div><span data-i18n="cmStep1">Save this number:</span> <strong style="color:var(--accent);font-family:var(--mono);">+34 694 25 79 52</strong></div>
                <div><span data-i18n="cmStep2">Send WhatsApp:</span> <strong style="font-family:var(--mono);">I allow callmebot to send me messages</strong></div>
                <div data-i18n="cmStep3">You'll receive your API key by WhatsApp</div>
                <div data-i18n="cmStep4">Enter your details below</div>
            </div>
            <div style="display:flex;flex-direction:column;gap:10px;">
                <input id="cmPhone" type="tel" data-i18n-placeholder="cmPhonePlaceholder" placeholder="Phone (e.g. +34612345678)"
                    style="background:var(--bg-elevated);border:1px solid var(--border);border-radius:8px;padding:9px 12px;color:var(--text-main);font-size:.83rem;outline:none;width:100%;box-sizing:border-box;">
                <input id="cmApiKey" type="text" data-i18n-placeholder="cmApiKeyPlaceholder" placeholder="CallMeBot API Key"
                    style="background:var(--bg-elevated);border:1px solid var(--border);border-radius:8px;padding:9px 12px;color:var(--text-main);font-size:.83rem;font-family:var(--mono);outline:none;width:100%;box-sizing:border-box;">
                <label style="display:flex;align-items:center;gap:10px;font-size:.83rem;color:var(--text-main);cursor:pointer;">
                    <input id="cmEnabled" type="checkbox" style="width:16px;height:16px;accent-color:var(--accent);">
                    <span data-i18n="cmEnableLabel">Enable WhatsApp Alerts</span>
                </label>
                <div id="cmSettingsMsg" style="font-size:.78rem;min-height:18px;"></div>
                <div style="display:flex;gap:8px;">
                    <button onclick="testCallMeBot()" class="btn-ghost" data-i18n="cmTestBtn" style="flex:1;padding:8px;font-size:.78rem;">&#128242; Test Alert</button>
                    <button onclick="saveCallMeBotSettings()" class="btn-primary" data-i18n="cmSaveBtn" style="flex:1;padding:8px;font-size:.78rem;">&#128190; Save</button>
                </div>
            </div>
        </div>
        <div id="adminSection" style="display:none;padding:0 20px 16px;border-top:1px solid var(--border);margin-top:4px;">
            <div style="font-weight:600;font-size:.88rem;color:var(--accent);margin:14px 0 10px;">🛡 Admin Dashboard</div>
            <div id="adminContent" style="font-size:.78rem;color:var(--text-soft);">Loading...</div>
        </div>
        <div style="padding:16px 20px 24px;border-top:1px solid var(--border);">
            <button onclick="logout()" class="btn-danger" data-i18n="cmLogoutBtn" style="width:100%;padding:10px;font-size:.85rem;border-radius:8px;">&#128682; Logout</button>
            <button onclick="deleteAccount()" class="btn-ghost" style="width:100%;padding:8px;font-size:.75rem;border-radius:8px;margin-top:6px;color:var(--danger);border-color:rgba(239,68,68,.3);">🗑 Delete Account</button>
        </div>
    </div>
    <div id="settingsPanelOverlay" onclick="closeSettingsPanel()" style="
        display:none;position:fixed;inset:0;z-index:8499;background:rgba(0,0,0,.4);
    "></div>`;
    document.body.insertAdjacentHTML('beforeend', html);
}

function openSettingsPanel() {
    const panel = document.getElementById('settingsPanel');
    const overlay = document.getElementById('settingsPanelOverlay');
    if (panel) panel.style.transform = 'translateX(0)';
    if (overlay) overlay.style.display = 'block';
    const un = document.getElementById('settingsUsername');
    if (un && S.currentUser) un.textContent = S.currentUser.username;
    const adminSection = document.getElementById('adminSection');
    if (adminSection) {
        if (S.currentUser && S.currentUser.username === 'asmahri') {
            adminSection.style.display = 'block';
            loadAdminDashboard();
        } else {
            adminSection.style.display = 'none';
        }
    }
}

function closeSettingsPanel() {
    const panel = document.getElementById('settingsPanel');
    const overlay = document.getElementById('settingsPanelOverlay');
    if (panel) panel.style.transform = 'translateX(100%)';
    if (overlay) overlay.style.display = 'none';
}

function toggleSettingsPanel() {
    if (!S.currentUser) { openAuthModal('login'); return; }
    const panel = document.getElementById('settingsPanel');
    if (!panel) return;
    const isOpen = panel.style.transform === 'translateX(0px)' || panel.style.transform === 'translateX(0)';
    if (isOpen) { closeSettingsPanel(); } else { openSettingsPanel(); loadUserProfile(); }
}

function injectAuthIcon() {
    let desktopBtn = document.getElementById('authIconBtn');
    if (!desktopBtn) {
        const header = document.querySelector('.header-right') || document.querySelector('header');
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
    if (desktopBtn) desktopBtn.onclick = toggleSettingsPanel;

    let mobileBtn = document.getElementById('authIconBtnMobile');
    if (!mobileBtn) {
        const mobileNav = document.querySelector('.bottom-nav') || document.querySelector('.mobile-nav') || document.querySelector('.nav-bar') || document.getElementById('mobileNav');
        if (mobileNav) {
            mobileBtn = document.createElement('div');
            mobileBtn.id = 'authIconBtnMobile';
            mobileBtn.className = 'nav-item';
            mobileBtn.innerHTML = '<span>👤</span><span>Account</span>';
            mobileNav.appendChild(mobileBtn);
        }
    }
    if (mobileBtn) mobileBtn.onclick = toggleSettingsPanel;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PORT CALLS EDITOR
// ═══════════════════════════════════════════════════════════════════════════════

// ── Date helpers ──────────────────────────────────────────────────────────────

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

// ── API ────────────────────────────────────────────────────────────────────────

async function pcApiLoad(imo) {
    // Bust cache after any mutation so we always see fresh data
    const token = S.currentUser?.access_token || localStorage.getItem('vt_token');
    if (!token) return [];
    // Invalidate old portCallsCache for this IMO so vessel card refreshes too
    S.portCallsCache.delete(imo);
    try {
        const r = await fetch(`${CONFIG.WORKER_URL}/data/port-calls/${imo}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!r.ok) return [];
        return (await r.json()).portCalls || [];
    } catch { return []; }
}

async function pcApiSave(imo, rowData) {
    const token = S.currentUser?.access_token || localStorage.getItem('vt_token');
    try {
        const r = await fetch(`${CONFIG.WORKER_URL}/data/port-calls/${imo}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(rowData)
        });
        if (r.ok) S.portCallsCache.delete(imo);
        return r.ok;
    } catch { return false; }
}

async function pcApiDelete(id, imo) {
    const token = S.currentUser?.access_token || localStorage.getItem('vt_token');
    try {
        const r = await fetch(`${CONFIG.WORKER_URL}/data/port-calls/row/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (r.ok && imo) S.portCallsCache.delete(imo);
        return r.ok;
    } catch { return false; }
}

// ── Open modal ─────────────────────────────────────────────────────────────────

async function openPortCallsEditor(imo, vesselName) {
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
}

// ── Render list ────────────────────────────────────────────────────────────────

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

// ── Build view row ─────────────────────────────────────────────────────────────

function pcBuildViewRow(row, idx, imo, vesselName) {
    const el2 = document.createElement('div');
    el2.className = `pc-row${row.is_manual ? ' is-manual' : ''}`;

    el2.innerHTML = `
        <div class="pc-row-view">
            <div class="pc-row-index">${idx + 1}</div>
            <div class="pc-row-info">
                <div class="pc-row-name">
                    ${escapeHtml(row.port_name)}
                    ${row.country ? `<span style="font-weight:400;color:var(--text-soft);font-size:.72rem">· ${escapeHtml(row.country)}</span>` : ''}
                    ${row.is_manual ? `<span class="pc-manual-badge">${i18n.get('pcManualBadge')}</span>` : ''}
                </div>
                <div class="pc-row-dates">
                    <span title="${i18n.get('pcFieldArrived')}">▶ ${pcFmtDate(row.arrived)}</span>
                    <span title="${i18n.get('pcFieldDeparted')}">◀ ${pcFmtDate(row.departed)}</span>
                </div>
                ${row.duration ? `<div class="pc-row-dur">⏱ ${escapeHtml(row.duration)}</div>` : ''}
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

// ── Build edit form ────────────────────────────────────────────────────────────

function pcBuildEditForm(row, imo, onDone) {
    const el2 = document.createElement('div');
    el2.className = 'pc-edit-form';

    el2.innerHTML = `
        <div class="pc-form-grid">
            <div class="pc-field pc-full">
                <label>${i18n.get('pcFieldName')}</label>
                <input class="f-name" type="text" value="${escapeHtml(row.port_name || '')}" placeholder="${i18n.get('pcPlaceholderName')}" autocomplete="off" spellcheck="false">
            </div>
            <div class="pc-field">
                <label>${i18n.get('pcFieldCountry')}</label>
                <input class="f-country" type="text" value="${escapeHtml(row.country || '')}" placeholder="${i18n.get('pcPlaceholderCtry')}">
            </div>
            <div class="pc-field">
                <label>${i18n.get('pcFieldDuration')}</label>
                <input class="f-dur" type="text" value="${escapeHtml(row.duration || '')}" placeholder="${i18n.get('pcPlaceholderDur')}">
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

    // ── Auto-calculate duration from arrived / departed ────────────────────
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
    // Run once on open in case both dates already filled (edit mode)
    pcCalcDuration();

    return el2;
}

// ═══════════════════════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════════════════════

function init() {

    loadTheme();

    if (!CONFIG.WORKER_URL || CONFIG.WORKER_URL === '') {
        console.error('❌ CONFIG.WORKER_URL is empty. Add/remove vessel will not work.');
    }

    const restoredSession = loadSession();
    injectAuthModal();
    injectSettingsPanel();
    injectAuthIcon();
    if (restoredSession) {
        updateAuthIcon();
    }

    try {
        if (i18n && i18n.init) {
            i18n.init();
        }

        if (el.sortSelect) el.sortSelect.value = S.currentSortKey;
        if (el.sortSelectMobile) el.sortSelectMobile.value = S.currentSortKey;

        renderAlerts();
        updateAlertBadge();

        if (loadCachedData()) updateStatus(i18n.get('cachedLoad'), 'success');

        setupImoInput();

        if (el.addBtn) el.addBtn.addEventListener('click', addVessel);
        if (el.imoInput) {
            el.imoInput.addEventListener('keydown', e => { if (e.key === 'Enter' && !el.addBtn?.disabled) addVessel(); });
        }

        if (el.searchInput) {
            el.searchInput.addEventListener('input', () => {
                S.searchQuery = el.searchInput.value.trim().toLowerCase();
                renderVessels(S.trackedImosCache);
            });
        }

        document.querySelectorAll('.chip[data-filter]').forEach(chip => {
            chip.addEventListener('click', () => setFilter(chip.dataset.filter, chip));
        });

        if (el.ageFilter) {
            el.ageFilter.addEventListener('change', () => {
                S.currentAgeFilter = el.ageFilter.value;
                if (el.ageFilterMobile) el.ageFilterMobile.value = S.currentAgeFilter;
                renderVessels(S.trackedImosCache);
            });
        }

        if (el.sortSelect) {
            el.sortSelect.addEventListener('change', () => {
                S.currentSortKey = el.sortSelect.value;
                localStorage.setItem('vt_sort', S.currentSortKey);
                if (el.sortSelectMobile) el.sortSelectMobile.value = S.currentSortKey;
                renderVessels(S.trackedImosCache);
            });
        }

        if (el.viewListBtn) el.viewListBtn.addEventListener('click', () => toggleView('list'));
        if (el.viewMapBtn) el.viewMapBtn.addEventListener('click', () => toggleView('map'));

        if (el.refreshButton) el.refreshButton.addEventListener('click', loadData);

        if (el.exportButton) el.exportButton.addEventListener('click', exportCSV);

        if (el.alertOverlay) el.alertOverlay.addEventListener('click', closeAlertPanel);
        const alertsBtn = document.getElementById('alertsBtn');
        if (alertsBtn) alertsBtn.addEventListener('click', handleBellClick);

        if (el.confirmCancel) el.confirmCancel.addEventListener('click', () => { el.confirmModal?.classList.add('hidden'); S.vesselToRemove = null; });
        if (el.confirmOk) el.confirmOk.addEventListener('click', () => { if (S.vesselToRemove) removeIMOConfirmed(S.vesselToRemove); el.confirmModal?.classList.add('hidden'); });

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
                if (S.lastDataModified) updateLastModified(S.lastDataModified);
                renderVessels(S.trackedImosCache);
            });
        }

        if (el.addCard) {
            if (!S.currentUser || window.innerWidth < 641) {
                el.addCard.classList.add('hidden');
            }
        }

        const updateFabVisibility = () => {
            if (el.fabFilter) el.fabFilter.style.display = window.innerWidth < 641 ? 'flex' : 'none';
        };
        updateFabVisibility();
        window.addEventListener('resize', updateFabVisibility);

        initPullToRefresh();

        setInterval(tickClock, 1000);
        tickClock();

    } catch (initErr) {
        console.error('⚠️ VesselTracker init() error (non-fatal):', initErr);
        updateStatus(i18n.get('uiInitError'), 'warning');
    }
    
    loadData();
    checkApiStatus();
    loadSanctionsLists().catch(e => {
        console.warn('Sanctions:', e);
        if (el.sanctionsStatus) el.sanctionsStatus.innerHTML = `<span style="color:var(--warning);font-size:.68rem;font-family:var(--mono);">${i18n.get('sanctionsUnavailable')}</span>`;
    });

    S.refreshInterval = setInterval(() => { loadData(); checkApiStatus(); }, CONFIG.REFRESH_INTERVAL);

    if (S.currentUser?.access_token) {
        injectHandoffBadge();
        window._handoffShownOnLogin = false;
        startHandoffPolling();
    }
}

function toggleFilterMenu() {
    const filterMenu = document.getElementById('mobileFilterSheet');
    if (filterMenu) {
        filterMenu.classList.toggle('show');
    }
}

function closeFilterMenu(event) {
    const filterMenu = document.getElementById('mobileFilterSheet');
    if (filterMenu) {
        filterMenu.classList.remove('show');
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js', { scope: './' })
        .then(reg => console.log('SW registered, scope:', reg.scope))
        .catch(err => console.warn('SW registration failed:', err));
}

// =============================================================================
// SOF, HANDOFF, OWNERS (unchanged, included for completeness)
// =============================================================================
// ... (rest of SOF and owner functions remain exactly as in original) ...

// =============================================================================
// SOF — STATEMENT OF FACTS
// =============================================================================

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

async function sofSaveDraft(imo) {
    const data = sofCollectData(imo);
    const notes = document.getElementById('sof-notes')?.value || '';
    const msg = document.getElementById('sof-save-msg');

    // Save to Supabase if logged in, fallback to localStorage
    if (S.currentUser?.access_token) {
        try {
            if (msg) { msg.style.color = 'var(--text-soft)'; msg.textContent = '💾 Saving...'; }
            const res = await fetchWithTimeout(`${CONFIG.WORKER_URL}/sof/draft`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${S.currentUser.access_token}`,
                },
                body: JSON.stringify({ imo, data, notes }),
            }, 8000);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            if (msg) { msg.style.color = 'var(--success)'; msg.textContent = '✅ Draft saved (shared)'; }
        } catch(e) {
            // Fallback to localStorage on error
            localStorage.setItem(sofDraftKey(imo), JSON.stringify({ ...data, notes }));
            if (msg) { msg.style.color = 'var(--warning)'; msg.textContent = '⚠️ Saved locally (offline)'; }
        }
    } else {
        localStorage.setItem(sofDraftKey(imo), JSON.stringify({ ...data, notes }));
        if (msg) { msg.style.color = 'var(--success)'; msg.textContent = '✅ Draft saved'; }
    }
    setTimeout(() => { const m = document.getElementById('sof-save-msg'); if (m) m.textContent = ''; }, 2500);
}

async function sofLoadDraft(imo) {
    // Try Supabase first if logged in
    if (S.currentUser?.access_token) {
        try {
            const res = await fetchWithTimeout(
                `${CONFIG.WORKER_URL}/sof/draft?imo=${imo}`,
                { headers: { 'Authorization': `Bearer ${S.currentUser.access_token}` } },
                8000
            );
            if (res.ok) {
                const d = await res.json();
                if (d.draft) return { ...d.draft, notes: d.notes, _source: 'supabase', _updated: d.updated_at };
            }
        } catch(_) {}
    }
    // Fallback to localStorage
    const raw = localStorage.getItem(sofDraftKey(imo));
    return raw ? { ...JSON.parse(raw), _source: 'local' } : null;
}

async function sofClearDraft(imo) {
    if (!confirm('Clear all fields and delete saved draft?')) return;
    // Delete from Supabase if logged in
    if (S.currentUser?.access_token) {
        try {
            await fetchWithTimeout(
                `${CONFIG.WORKER_URL}/sof/draft?imo=${imo}`,
                { method: 'DELETE', headers: { 'Authorization': `Bearer ${S.currentUser.access_token}` } },
                8000
            );
        } catch(_) {}
    }
    localStorage.removeItem(sofDraftKey(imo));
    closeSOF();
    openSOF(imo);
}

function openSOF(imo) {
    const v = S.vesselsDataMap.get(imo) || {};
    const cache = S.staticCache.get(imo) || {};
    const name = v.name || cache.name || `IMO ${imo}`;
    const port = v.destination_port || v.nearest_port || '';
    // Auto-fill owner name from vessel_owners cache (saved from previous SOF)
    const cachedOwner = _ownersCache.get(imo);
    const prefillOwners = cachedOwner?.name || '';

    // Remove existing modal
    document.getElementById('sofModal')?.remove();
    document.getElementById('sofOverlay')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'sofOverlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9000;background:rgba(0,0,0,.55);';
    overlay.onclick = (e) => { if (e.target === overlay) closeSOF(); };

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
                <div style="font-size:.72rem;color:var(--text-soft);">${escapeHtml(name)} — IMO ${imo}</div>
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
                <input id="sof-vessel" class="sof-input" type="text" value="${escapeHtml(name)}" placeholder="Vessel name">
            </div>

            <div class="sof-row">
                <label class="sof-label">${i18n.get('sofLabel3')}</label>
                <div style="display:flex;gap:6px;">
                    <select id="sof-port" class="sof-input" style="flex:1;" onchange="sofPortChanged()">
                        <option value="">— Select port —</option>
                        ${MOROCCAN_PORTS.map(p => `<option value="${p}" ${p === port ? 'selected' : ''}>${p}</option>`).join('')}
                    </select>
                    <input id="sof-port-manual" class="sof-input" type="text" placeholder="or type pier/berth" style="flex:1;" value="${escapeHtml(port)}">
                </div>
            </div>

            <div class="sof-row">
                <label class="sof-label">${i18n.get('sofLabel4')}</label>
                <input id="sof-owners" class="sof-input" type="text" value="${escapeHtml(prefillOwners)}" placeholder="Shipowner name">
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
                style="resize:vertical;">${escapeHtml(portHours)}</textarea>
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

            <!-- Notes (saved to Supabase, shared between users) -->
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

    // Add CSS
    sofInjectCSS();

    // Add initial row
    sofAddRow();

    // Load draft asynchronously (Supabase or localStorage)
    sofLoadDraft(imo).then(draft => {
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
            // Apply notes field
            const notesEl = document.getElementById('sof-notes');
            if (notesEl && draft.notes) notesEl.value = draft.notes;
        }
    });
}

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

function sofAddRow(data) {
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
        <td class="sof-td"><input type="text" class="sof-cell" id="sof-r${idx}-remarks" value="${escapeHtml(d.remarks||'')}" placeholder="Remarks..." style="width:100%;min-width:120px;"></td>
        <td class="sof-td"><button onclick="this.closest('tr').remove()" style="background:none;border:none;color:var(--danger);cursor:pointer;font-size:.8rem;padding:2px 4px;">✕</button></td>
    `;
    tbody.appendChild(tr);
}

function sofSetOperation(type) {
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
}

function sofGetOperation() {
    const btn = document.getElementById('sof-op-import');
    return btn && btn.dataset.selected === '0' ? 'export' : 'import';
}

function sofPortChanged() {
    const port = document.getElementById('sof-port')?.value;
    if (!port) return;
    document.getElementById('sof-port-manual').value = port;
    const hours = sofGetPortHours(port);
    if (hours) document.getElementById('sof-port-hours').value = hours;
}

function sofSavePortHoursBtn() {
    const port = document.getElementById('sof-port-manual')?.value.trim() ||
                 document.getElementById('sof-port')?.value;
    const hours = document.getElementById('sof-port-hours')?.value.trim();
    if (!port) return;
    sofSavePortHours(port, hours);
    const msg = document.getElementById('sof-save-msg');
    if (msg) { msg.textContent = `✅ Hours saved for ${port}`; setTimeout(() => { msg.textContent = ''; }, 2500); }
}

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
    // Restore rows
    const tbody = document.getElementById('sof-ops-body');
    if (tbody && d.rows?.length) {
        tbody.innerHTML = '';
        d.rows.forEach(row => sofAddRow(row));
    }
}

function sofFmt(date, time) {
    if (!date) return '';
    const d = date.split('-').reverse().join('/');
    return time ? `${d} at   ${time.replace(':','')} hr` : `${d}`;
}

async function sofDownload(imo) {
    const data = sofCollectData(imo);

    // Save port hours automatically on download
    if (data.port && data.port_hours) sofSavePortHours(data.port, data.port_hours);

    const btn = document.querySelector('#sofModal button[onclick*="sofDownload"]');
    const msg = document.getElementById('sof-save-msg');

    const setStatus = (text, isError) => {
        if (btn) btn.textContent = text;
        if (msg) { msg.style.color = isError ? 'var(--danger)' : 'var(--text-soft)'; msg.textContent = ''; }
    };

    if (btn) { btn.disabled = true; btn.textContent = i18n.get('sofGenerating'); }
    if (msg) { msg.style.color = 'var(--text-soft)'; msg.textContent = i18n.get('sofGenerating'); }

    // Animated dots to show activity
    let dots = 0;
    const animInterval = setInterval(() => {
        dots = (dots + 1) % 4;
        const dotStr = '.'.repeat(dots);
        if (msg && msg.textContent.includes('Generating')) {
            msg.textContent = i18n.get('sofGenerating').replace('...','') + dotStr;
        } else if (msg && msg.textContent.includes('waking')) {
            msg.textContent = `☕ Service waking up${dotStr} (can take ~1 min)`;
        }
    }, 500);

    try {
        // POST to Render API — server-side generation preserves all Excel styles
        const res = await fetchWithTimeout(
            `${CONFIG.WORKER_URL}/sof/generate`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(S.currentUser?.access_token ? { 'Authorization': `Bearer ${S.currentUser.access_token}` } : {}),
                },
                body: JSON.stringify(data),
            },
            120000  // 120s timeout — Render cold start can take ~90s
        );

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.detail || `Server error ${res.status}`);
        }

        // Download the returned xlsx blob
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

        // Show owner confirmation popup after download (non-blocking, 800ms delay)
        setTimeout(() => sofShowOwnerPopup(imo, data.vessel, data.owners), 800);

    } catch(e) {
        clearTimeout(coldStartHint);
        clearInterval(animInterval);
        if (msg) { msg.style.color = 'var(--danger)'; msg.textContent = `❌ ${e.message}`; }
        console.error('SOF download error:', e);
    }

    clearTimeout(coldStartHint);
    clearInterval(animInterval);
    if (btn) { btn.disabled = false; btn.textContent = i18n.get('sofDownloadBtn'); }
    if (msg) setTimeout(() => { if (msg) msg.textContent = ''; }, 4000);
}


function closeSOF() {
    document.getElementById('sofModal')?.remove();
    document.getElementById('sofOverlay')?.remove();
}

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

// =============================================================================
// SOF HANDOFF SYSTEM
// =============================================================================

let _handoffPollInterval = null;

// ── Badge ────────────────────────────────────────────────────────────────────

function injectHandoffBadge() {
    // Merged into the main alerts bell — no separate button injected.
    // Kept as a no-op so existing call sites (init, login flow) stay intact.
}

function updateHandoffBadge(count) {
    S.pendingHandoffCount = count || 0;
    updateAlertBadge();
}

// ── Poll every 60s while logged in ───────────────────────────────────────────

function startHandoffPolling() {
    stopHandoffPolling();
    checkAndShowHandoffs(false); // silent check on start
    _handoffPollInterval = setInterval(() => checkAndShowHandoffs(false), 60000);
}

function stopHandoffPolling() {
    if (_handoffPollInterval) { clearInterval(_handoffPollInterval); _handoffPollInterval = null; }
}

async function checkAndShowHandoffs(forceShowPopup) {
    if (!S.currentUser?.access_token) return;
    try {
        const res = await fetchWithTimeout(`${CONFIG.WORKER_URL}/sof/handoff/pending`, {
            headers: { 'Authorization': `Bearer ${S.currentUser.access_token}` }
        }, 8000);
        if (!res.ok) return;
        const data = await res.json();

        updateHandoffBadge(data.total);

        // Auto-poll path: update badge only. Show incoming popup once at login.
        if (!forceShowPopup) {
            if (data.incoming?.length > 0 && !window._handoffShownOnLogin) {
                window._handoffShownOnLogin = true;
                showHandoffIncomingPopup(data.incoming);
            }
            return;
        }

        // User clicked bell — show whatever is pending. Acks happen inside the notice functions.
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
            // Optimistically clear the handoff portion of the badge (incoming may remain until user responds)
            updateHandoffBadge(data.incoming?.length || 0);
        } else {
            // Count was stale — open the alert panel as fallback so the click still produces feedback
            toggleAlertPanel();
        }
    } catch(_) {}
}

// ── Incoming handoff popup ───────────────────────────────────────────────────

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
                        <strong style="color:var(--accent);">${escapeHtml(h.from_username)}</strong> sent you a SOF
                    </div>
                    <div style="font-size:.75rem;color:var(--text-soft);">🚢 ${escapeHtml(h.vessel_name || 'IMO '+h.imo)} · IMO ${h.imo}</div>
                </div>
            </div>
            ${h.notes ? `<div style="font-size:.75rem;color:var(--text-soft);background:var(--bg-card);border-radius:6px;padding:6px 8px;margin-bottom:8px;font-style:italic;">"${escapeHtml(h.notes)}"</div>` : ''}
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

function closeHandoffPopup() {
    document.getElementById('handoffPopup')?.remove();
    document.getElementById('handoffPopupOverlay')?.remove();
}

async function respondHandoff(id, action) {
    if (!S.currentUser?.access_token) return;
    const msgEl = document.getElementById(`handoff-msg-${id}`);
    const itemEl = document.getElementById(`handoff-item-${id}`);

    try {
        if (msgEl) { msgEl.style.color = 'var(--text-soft)'; msgEl.textContent = action === 'accept' ? i18n.get('handoffAccepting') : i18n.get('handoffDeclining'); }
        const res = await fetchWithTimeout(`${CONFIG.WORKER_URL}/sof/handoff/respond`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${S.currentUser.access_token}` },
            body: JSON.stringify({ id, action }),
        }, 10000);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        if (action === 'accept') {
            if (msgEl) { msgEl.style.color = 'var(--success)'; msgEl.textContent = i18n.get('handoffAccepted'); }
            setTimeout(() => {
                loadData(); // always reload to show vessel card if newly added
            }, 800);
            setTimeout(() => itemEl?.remove(), 2000);
        } else {
            if (msgEl) { msgEl.style.color = 'var(--danger)'; msgEl.textContent = i18n.get('handoffDeclined'); }
            setTimeout(() => itemEl?.remove(), 1500);
        }

        // Update badge
        setTimeout(() => checkAndShowHandoffs(false), 2500);

        // Close popup if no more items
        setTimeout(() => {
            const remaining = document.querySelectorAll('[id^="handoff-item-"]');
            if (!remaining.length) closeHandoffPopup();
        }, 2500);

    } catch(e) {
        if (msgEl) { msgEl.style.color = 'var(--danger)'; msgEl.textContent = `Error: ${e.message}`; }
    }
}

// ── Decline notification to sender ───────────────────────────────────────────

function showHandoffDeclineNotice(declines) {
    const ids = declines.map(d => d.id);
    // Show a toast notification
    declines.forEach(d => {
        showToast(`❌ ${escapeHtml(d.to_username)} declined your SOF for ${escapeHtml(d.vessel_name || 'IMO '+d.imo)}`, 'danger', 6000);
    });
    // Acknowledge so we don't show again
    fetchWithTimeout(`${CONFIG.WORKER_URL}/sof/handoff/ack`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${S.currentUser.access_token}` },
        body: JSON.stringify({ ids }),
    }, 8000).catch(() => {});
}

function showHandoffAcceptNotice(accepts) {
    const ids = accepts.map(a => a.id);
    // Show a success toast per accepted handoff
    accepts.forEach(a => {
        showToast(`✅ ${escapeHtml(a.to_username)} accepted your SOF for ${escapeHtml(a.vessel_name || 'IMO '+a.imo)}`, 'success', 6000);
    });
    // Acknowledge so we don't show again
    fetchWithTimeout(`${CONFIG.WORKER_URL}/sof/handoff/ack`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${S.currentUser.access_token}` },
        body: JSON.stringify({ ids }),
    }, 8000).catch(() => {});
}

function showToast(message, type = 'info', duration = 4000) {
    const toast = document.createElement('div');
    const color = type === 'danger' ? 'var(--danger)' : type === 'success' ? 'var(--success)' : 'var(--accent)';
    toast.style.cssText = `
        position:fixed;bottom:80px;left:50%;transform:translateX(-50%);
        background:var(--bg-card);border:1px solid ${color};border-radius:10px;
        padding:10px 16px;font-size:.8rem;color:var(--text-main);
        z-index:9999;box-shadow:0 4px 20px rgba(0,0,0,.3);
        max-width:320px;text-align:center;
        animation:fadeInUp .3s ease;
    `;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), duration);
}

// ── Send SOF to user ─────────────────────────────────────────────────────────

async function sofShowSendPicker(imo) {
    if (!S.currentUser?.access_token) { openAuthModal('login'); return; }

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

    // Load users
    try {
        const res = await fetchWithTimeout(`${CONFIG.WORKER_URL}/users/list`, {
            headers: { 'Authorization': `Bearer ${S.currentUser.access_token}` }
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
                ${data.users.map(u => `<option value="${u.id}">${escapeHtml(u.username)}</option>`).join('')}
            </select>
        `;
    } catch(e) {
        const listEl = document.getElementById('sofSendUserList');
        if (listEl) listEl.innerHTML = `<div style="font-size:.78rem;color:var(--danger);">Failed to load users: ${escapeHtml(e.message)}</div>`;
    }
}

async function sofSendHandoff(imo) {
    if (!S.currentUser?.access_token) return;
    const toUserId = document.getElementById('sofSendTarget')?.value;
    const notes    = document.getElementById('sofSendNote')?.value.trim() || '';
    const msgEl    = document.getElementById('sofSendMsg');
    const btn      = document.getElementById('sofSendBtn');

    if (!toUserId) { if (msgEl) { msgEl.style.color='var(--danger)'; msgEl.textContent='Select a user first.'; } return; }

    const v = S.vesselsDataMap?.get(imo) || {};
    const vesselName = v.name || `IMO ${imo}`;
    const draftData = sofCollectData(imo);

    if (btn) btn.disabled = true;
    if (msgEl) { msgEl.style.color='var(--text-soft)'; msgEl.textContent=i18n.get('handoffSending'); }

    try {
        const res = await fetchWithTimeout(`${CONFIG.WORKER_URL}/sof/handoff/send`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${S.currentUser.access_token}` },
            body: JSON.stringify({ to_user_id: toUserId, imo, vessel_name: vesselName, draft_data: draftData, notes }),
        }, 10000);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (msgEl) { msgEl.style.color='var(--success)'; msgEl.textContent=`${i18n.get('handoffSentTo')} ${escapeHtml(data.to_username)}!`; }
        setTimeout(() => document.getElementById('sofSendModal')?.remove(), 1800);
    } catch(e) {
        if (msgEl) { msgEl.style.color='var(--danger)'; msgEl.textContent=`Failed: ${e.message}`; }
        if (btn) btn.disabled = false;
    }
}

// =============================================================================
// VESSEL OWNERS
// =============================================================================

// In-memory cache: imo → { name, address, phone, email }
const _ownersCache = new Map();

async function fetchOwner(imo) {
    if (_ownersCache.has(imo)) return _ownersCache.get(imo);
    if (!S.currentUser?.access_token) return null;
    try {
        const res = await fetchWithTimeout(`${CONFIG.WORKER_URL}/vessel/owners/${imo}`, {
            headers: { 'Authorization': `Bearer ${S.currentUser.access_token}` }
        }, 6000);
        if (!res || !res.ok) return null;
        const d = await res.json();
        if (d.owner) { _ownersCache.set(imo, d.owner); return d.owner; }
    } catch(_) {}
    return null;
}

async function saveOwner(imo, name, address, phone, email) {
    if (!S.currentUser?.access_token) return { ok: false, error: 'Not logged in' };
    try {
        const res = await fetchWithTimeout(`${CONFIG.WORKER_URL}/vessel/owners`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${S.currentUser.access_token}` },
            body: JSON.stringify({ imo, name, address, phone, email }),
        }, 8000);
        if (!res) return { ok: false, error: 'No response from server' };
        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            return { ok: false, error: errData.error || `Server error ${res.status}` };
        }
        _ownersCache.set(imo, { name, address, phone, email });
        renderVessels(S.trackedImosCache); // refresh card to show hyperlink
        return { ok: true };
    } catch(e) { return { ok: false, error: e.message }; }
}

// Called after loadData — silently fetches owners for all tracked vessels
async function loadVesselOwners() {
    const uncached = S.trackedImosCache.filter(imo => !_ownersCache.has(imo));
    if (!uncached.length) return;
    await Promise.allSettled(uncached.map(async imo => {
        const owner = await fetchOwner(imo);
        // If no manual owner in DB, seed from equasis data in static cache
        if (!owner) {
            const sc = S.staticCache.get(imo);
            if (sc?.equasis_owner) {
                // Don't write to DB — just populate in-memory so card shows it
                // User must confirm/edit via the "tap to add contact" flow
            }
        }
        if (owner) renderVessels(S.trackedImosCache);
    }));
    // Re-render once after all owners loaded to pick up equasis_owner from static cache
    renderVessels(S.trackedImosCache);
}

// Popup shown after SOF download — confirm & save owner details
function sofShowOwnerPopup(imo, vesselName, prefillName) {
    document.getElementById('ownerPopup')?.remove();
    document.getElementById('ownerPopupOverlay')?.remove();

    const existing = _ownersCache.get(imo);
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
        <div style="font-size:.75rem;color:var(--text-soft);margin-bottom:14px;">Please confirm or complete the owners information for <strong>${escapeHtml(vesselName || 'IMO ' + imo)}</strong> — saved for future SOFs</div>
        <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:14px;">
            <div>
                <label style="font-size:.72rem;color:var(--text-soft);display:block;margin-bottom:3px;">${i18n.get('ownerCompanyLabel')}</label>
                <input id="ownerName" type="text" value="${escapeHtml(name)}" placeholder="${i18n.get('ownerPlaceholderName')}"
                    style="width:100%;background:var(--bg-elevated);border:1px solid var(--border);border-radius:7px;padding:7px 10px;color:var(--text-main);font-size:.82rem;box-sizing:border-box;">
            </div>
            <div>
                <label style="font-size:.72rem;color:var(--text-soft);display:block;margin-bottom:3px;">${i18n.get('ownerAddressLabel')}</label>
                <input id="ownerAddress" type="text" value="${escapeHtml(address)}" placeholder="${i18n.get('ownerPlaceholderAddr')}"
                    style="width:100%;background:var(--bg-elevated);border:1px solid var(--border);border-radius:7px;padding:7px 10px;color:var(--text-main);font-size:.82rem;box-sizing:border-box;">
            </div>
            <div style="display:flex;gap:8px;">
                <div style="flex:1;">
                    <label style="font-size:.72rem;color:var(--text-soft);display:block;margin-bottom:3px;">${i18n.get('ownerPhoneLabel')}</label>
                    <input id="ownerPhone" type="tel" value="${escapeHtml(phone)}" placeholder="+1234567890"
                        style="width:100%;background:var(--bg-elevated);border:1px solid var(--border);border-radius:7px;padding:7px 10px;color:var(--text-main);font-size:.82rem;box-sizing:border-box;">
                </div>
                <div style="flex:1;">
                    <label style="font-size:.72rem;color:var(--text-soft);display:block;margin-bottom:3px;">${i18n.get('ownerEmailLabel')}</label>
                    <input id="ownerEmail" type="email" value="${escapeHtml(email)}" placeholder="contact@owner.com"
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
    overlay.addEventListener('click', e => { if (e.target === overlay) closeOwnerPopup(); });
    setTimeout(() => document.getElementById('ownerName')?.focus(), 100);
}

function closeOwnerPopup() {
    document.getElementById('ownerPopup')?.remove();
    document.getElementById('ownerPopupOverlay')?.remove();
}

async function confirmOwner(imo) {
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

    const result = await saveOwner(imo, name, address, phone, email);
    if (result.ok) {
        if (msgEl) { msgEl.style.color = 'var(--success)'; msgEl.textContent = i18n.get('ownerSaved'); }
        setTimeout(closeOwnerPopup, 800);
    } else {
        if (msgEl) { msgEl.style.color = 'var(--danger)'; msgEl.textContent = `❌ ${result.error}`; }
        if (btn) btn.disabled = false;
    }
}

// Popup shown when clicking owner hyperlink in vessel card
async function showOwnerInfo(imo) {
    let owner = _ownersCache.get(imo);
    if (!owner) owner = await fetchOwner(imo);
    if (!owner) return;

    document.getElementById('ownerInfoPopup')?.remove();
    const popup = document.createElement('div');
    popup.id = 'ownerInfoPopup';
    popup.style.cssText = 'position:fixed;inset:0;z-index:9700;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;padding:16px;';

    const updatedMeta = (() => {
        const parts = [];
        if (owner.updated_by) parts.push(`by ${escapeHtml(owner.updated_by)}`);
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
                <div style="font-weight:700;font-size:.95rem;color:var(--text-main);">🏢 ${escapeHtml(owner.name)}</div>
                <div style="display:flex;gap:6px;align-items:center;">
                    <button onclick="document.getElementById('ownerInfoPopup').remove();sofShowOwnerPopup('${imo}', null, null)" title="Edit owner" style="background:none;border:none;color:var(--accent);font-size:1rem;cursor:pointer;padding:2px 6px;">✏️</button>
                    <button onclick="document.getElementById('ownerInfoPopup').remove()" style="background:none;border:none;color:var(--text-soft);font-size:1.1rem;cursor:pointer;padding:2px 6px;">✕</button>
                </div>
            </div>
            ${owner.address ? `<div style="font-size:.82rem;color:var(--text-soft);margin-bottom:8px;">📍 ${escapeHtml(owner.address)}</div>` : ''}
            ${owner.phone   ? `<div style="font-size:.82rem;color:var(--text-soft);margin-bottom:8px;">📞 <a href="tel:${escapeHtml(owner.phone)}" style="color:var(--accent);">${escapeHtml(owner.phone)}</a></div>` : ''}
            ${owner.email   ? `<div style="font-size:.82rem;color:var(--text-soft);margin-bottom:8px;">✉️ <a href="mailto:${escapeHtml(owner.email)}" style="color:var(--accent);">${escapeHtml(owner.email)}</a></div>` : ''}
            <div style="font-size:.68rem;color:var(--text-soft);margin-top:10px;border-top:1px solid var(--border);padding-top:8px;">
                IMO ${imo}
                ${updatedMeta ? `<span style="display:block;margin-top:3px;">${updatedMeta}</span>` : ''}
            </div>
        </div>
    `;
    document.body.appendChild(popup);
    popup.addEventListener('click', e => { if (e.target === popup) popup.remove(); });
}
