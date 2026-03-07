// CONFIG
const CONFIG = {
    USERNAME: 'asmahri2-afk',
    REPO: 'VesselTracker',
    BRANCH: 'main',
    RENDER_API: 'https://vessel-api-s85s.onrender.com',
    WEATHER_API: 'https://api.open-meteo.com/v1/forecast',
    VESSELS_PATH: 'data/vessels_data.json',
    TRACKED_PATH: 'data/tracked_imos.json',
    PORTS_PATH: 'data/ports.json',
    SANCTIONS_URL: 'https://raw.githubusercontent.com/asmahri2-afk/VesselTracker/main/data/sanctioned_imos.json',
    STALE_THRESHOLD_MS: 6 * 3600000,
    CRITICAL_THRESHOLD_MS: 24 * 3600000,
    REFRESH_INTERVAL: 5 * 60000,
};
CONFIG.RAW_BASE = `https://raw.githubusercontent.com/${CONFIG.USERNAME}/${CONFIG.REPO}/${CONFIG.BRANCH}/`;

// GLOBAL STATE
const S = {
    vessel_data: [],
    vesselsDataMap: new Map(),
    trackedImos: new Set(),
    priorityImos: new Set(),
    sanctionedImos: new Set(),
    sanctionDetails: new Map(),
    filteredVessels: [],
    currentSortKey: 'PRIORITY',
    currentStatusFilter: 'ALL',
    currentAgeFilter: 'ALL',
    refreshInterval: null,
    lastDataModified: null,
    map: null,
    mapMarkers: new Map(),
};

// DOM ELEMENTS
const el = {
    headerClock: document.getElementById('headerClock'),
    lastUpdatedTime: document.getElementById('lastUpdatedTime'),
    addBtn: document.getElementById('addBtn'),
    addCard: document.getElementById('addCard'),
    imoInput: document.getElementById('imoInput'),
    statusFilter: document.getElementById('statusFilter'),
    ageFilter: document.getElementById('ageFilter'),
    sortSelect: document.getElementById('sortSelect'),
    vesselsContainer: document.getElementById('vesselsContainer'),
    confirmModal: document.getElementById('confirmModal'),
    confirmCancel: document.getElementById('confirmCancel'),
    confirmOk: document.getElementById('confirmOk'),
    confirmText: document.getElementById('confirmText'),
    alertsBtn: document.getElementById('alertsBtn'),
    alertBadge: document.getElementById('alertBadge'),
    mapToggle: document.getElementById('mapToggle'),
    mapPanel: document.getElementById('mapPanel'),
    leftPanel: document.getElementById('leftPanel'),
    map: document.getElementById('map'),
    mapLegend: document.getElementById('mapLegend'),
    langToggle: document.getElementById('langToggle'),
    filterSection: document.getElementById('filterSection'),
    fabFilter: document.getElementById('fabFilter'),
    filterCloseBtn: document.getElementById('filterCloseBtn'),
    filterInfo: document.getElementById('filterInfo'),
    filteredCount: document.getElementById('filteredCount'),
    totalCount: document.getElementById('totalCount'),
    kpiTracked: document.getElementById('kpiTracked'),
    kpiUnderway: document.getElementById('kpiUnderway'),
    kpiPort: document.getElementById('kpiPort'),
    kpiWarnings: document.getElementById('kpiWarnings'),
};

// UTILITIES
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatNumber(n) {
    return n.toLocaleString('en-US', { maximumFractionDigits: 1 });
}

function validateIMO(imo) {
    if (!/^\d{7}$/.test(imo)) return false;
    const digits = imo.split('').map(Number);
    let checksum = 0;
    for (let i = 0; i < 6; i++) {
        checksum += digits[i] * (8 - i);
    }
    return (10 - (checksum % 10)) % 10 === digits[6];
}

// Parse custom date format: "Mar 5, 2026 09:49 UTC"
function parseCustomDate(dateStr) {
    if (!dateStr) return null;
    try {
        return new Date(dateStr);
    } catch {
        return null;
    }
}

function formatLocalTime(utcStr) {
    if (!utcStr) return null;
    try {
        const date = parseCustomDate(utcStr) || new Date(utcStr);
        const locale = i18n.currentLang === 'FR' ? 'fr-FR' : 'en-US';
        return date.toLocaleString(locale, {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch {
        return null;
    }
}

function formatSignalAge(utcStr) {
    if (!utcStr) return { ageText: '—', ageClass: '', rawAgeMs: Infinity };
    try {
        const lastPos = parseCustomDate(utcStr) || new Date(utcStr);
        if (isNaN(lastPos.getTime())) {
            return { ageText: '—', ageClass: '', rawAgeMs: Infinity };
        }
        const now = new Date();
        const diffMs = now - lastPos;
        const diffHours = diffMs / (1000 * 60 * 60);

        let ageText, ageClass;
        if (diffHours < 0.5) {
            ageText = 'Now';
            ageClass = 'fresh';
        } else if (diffHours < 1) {
            ageText = Math.round(diffHours * 60) + ' min';
            ageClass = 'fresh';
        } else if (diffHours < 6) {
            ageText = Math.round(diffHours) + ' h';
            ageClass = 'recent';
        } else if (diffHours < 24) {
            ageText = Math.round(diffHours) + ' h';
            ageClass = 'aged';
        } else {
            ageText = Math.round(diffHours / 24) + ' d';
            ageClass = 'stale';
        }
        return { ageText, ageClass, rawAgeMs: diffMs };
    } catch {
        return { ageText: '—', ageClass: '', rawAgeMs: Infinity };
    }
}

function formatEtaCountdown(etaStr) {
    if (!etaStr) return null;
    try {
        const eta = parseCustomDate(etaStr) || new Date(etaStr);
        const now = new Date();
        const diffMs = eta - now;
        if (diffMs < 0) return { text: 'Passed', cls: 'passed' };

        const hours = Math.floor(diffMs / (1000 * 60 * 60));
        const days = Math.floor(hours / 24);
        if (hours < 12) {
            return { text: hours + ' h', cls: 'imminent' };
        } else if (hours < 48) {
            return { text: Math.round(hours / 12) / 2 + ' d', cls: 'soon' };
        } else {
            return { text: days + ' d', cls: 'normal' };
        }
    } catch {
        return null;
    }
}

function getVesselStatus(vessel) {
    if (!vessel.name) return 'DATA PENDING';
    const sog = parseFloat(vessel.sog);
    if (isNaN(sog) || sog === null) return 'DATA PENDING';
    if (sog > 0.5) return 'UNDERWAY';
    if (vessel.destination_port || vessel.nearest_port) return 'AT PORT';
    const ageData = formatSignalAge(vessel.last_pos_utc);
    if (ageData.rawAgeMs > 86400000) return 'STALLED';
    return 'AT ANCHOR';
}

function getFlagCode(country) {
    const flagMap = {
        'Panama': 'PA', 'Liberia': 'LR', 'Marshall Islands': 'MH', 'Hong Kong': 'HK',
        'Singapore': 'SG', 'Malta': 'MT', 'Bahamas': 'BS', 'Cyprus': 'CY',
        'Denmark': 'DK', 'United States': 'US', 'China': 'CN', 'Greece': 'GR',
        'Japan': 'JP', 'United Kingdom': 'GB', 'Germany': 'DE', 'Norway': 'NO',
        'Netherlands': 'NL', 'India': 'IN', 'Mexico': 'MX', 'Russia': 'RU'
    };
    return flagMap[country] || null;
}

function isPriority(imo) {
    return S.priorityImos.has(imo);
}

// STORAGE
function saveTrackedVessels() {
    localStorage.setItem('trackedImos', JSON.stringify([...S.trackedImos]));
    localStorage.setItem('priorityImos', JSON.stringify([...S.priorityImos]));
}

function loadTrackedVessels() {
    const tracked = localStorage.getItem('trackedImos');
    const priority = localStorage.getItem('priorityImos');
    if (tracked) S.trackedImos = new Set(JSON.parse(tracked));
    if (priority) S.priorityImos = new Set(JSON.parse(priority));
}

function getNotes(imo) {
    return localStorage.getItem(`notes_${imo}`) || '';
}

function saveNotes(imo, text) {
    localStorage.setItem(`notes_${imo}`, text);
}

// DATA LOADING
async function fetchGitHubData(path) {
    const url = CONFIG.RAW_BASE + path + `?_=${Date.now()}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`GitHub fetch failed: ${response.status}`);
    return await response.json();
}

async function loadData() {
    try {
        console.log('🔄 Loading data from GitHub...');
        
        // Fetch all data in parallel
        const [trackedData, vesselData] = await Promise.all([
            fetchGitHubData(CONFIG.TRACKED_PATH),
            fetchGitHubData(CONFIG.VESSELS_PATH),
        ]);

        // Parse tracked IMOs (array format)
        const tracked = Array.isArray(trackedData) ? trackedData : [];
        S.trackedImos = new Set(tracked.map(String));
        console.log(`✅ Loaded ${S.trackedImos.size} tracked IMOs`);

        // Parse vessel data (object format with IMO keys)
        S.vessel_data = Object.values(vesselData || {});
        updateVesselDataMap();
        console.log(`✅ Loaded ${S.vessel_data.length} vessels in database`);

        // Get last modified from response headers or use current time
        S.lastDataModified = new Date();
        updateLastModifiedDisplay();

        updateKPIs();
        renderVessels(Array.from(S.trackedImos));
        updateMap();
    } catch (err) {
        console.error('❌ Load error:', err);
        // Try to load from cache on error
        alert('Error loading data: ' + err.message);
    }
}

function updateVesselDataMap() {
    S.vesselsDataMap.clear();
    S.vessel_data.forEach(v => {
        if (v.imo) S.vesselsDataMap.set(v.imo, v);
    });
}

function updateKPIs() {
    let underway = 0, atPort = 0, warnings = 0;
    S.trackedImos.forEach(imo => {
        const v = S.vesselsDataMap.get(imo);
        if (!v) return;
        const status = getVesselStatus(v);
        if (status === 'UNDERWAY') underway++;
        else if (status === 'AT PORT') atPort++;
        if (S.sanctionedImos.has(imo)) warnings++;
        if (isPriority(imo)) warnings++;
    });
    el.kpiTracked.textContent = S.trackedImos.size;
    el.kpiUnderway.textContent = underway;
    el.kpiPort.textContent = atPort;
    el.kpiWarnings.textContent = warnings;
}

function updateLastModifiedDisplay() {
    if (S.lastDataModified) {
        const locale = i18n.currentLang === 'FR' ? 'fr-FR' : 'en-US';
        const formatted = new Date(S.lastDataModified).toLocaleString(locale, {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
        el.lastUpdatedTime.textContent = formatted;
    }
}

// VESSEL MANAGEMENT
async function addIMO() {
    const imo = el.imoInput.value.trim();
    if (!imo) return;
    if (!validateIMO(imo)) {
        alert(i18n.currentLang === 'FR' ? 'IMO invalide' : 'Invalid IMO');
        return;
    }
    if (S.trackedImos.has(imo)) {
        alert(i18n.currentLang === 'FR' ? 'Ce navire est déjà suivi' : 'Already tracked');
        return;
    }
    S.trackedImos.add(imo);
    saveTrackedVessels();
    el.imoInput.value = '';
    el.imoInput.style.borderColor = '';
    renderVessels(Array.from(S.trackedImos));
    updateMap();
    loadData();
}

function removeIMO(imo) {
    el.confirmText.textContent = `${i18n.currentLang === 'FR' ? 'Supprimer ce navire ?' : 'Remove this vessel?'}`;
    el.confirmModal.style.display = 'flex';
    S.vesselToRemove = imo;
}

function removeIMOConfirmed(imo) {
    S.trackedImos.delete(imo);
    S.priorityImos.delete(imo);
    saveTrackedVessels();
    renderVessels(Array.from(S.trackedImos));
    updateMap();
    updateKPIs();
}

function togglePriority(imo) {
    if (S.priorityImos.has(imo)) {
        S.priorityImos.delete(imo);
    } else {
        S.priorityImos.add(imo);
    }
    saveTrackedVessels();
    renderVessels(Array.from(S.trackedImos));
    updateMap();
    updateKPIs();
}

function toggleDetails(imo) {
    const detailsEl = document.getElementById(`details-${imo}`);
    if (detailsEl) {
        detailsEl.classList.toggle('show');
    }
}

function onNoteInput(imo, textarea) {
    saveNotes(imo, textarea.value);
    const savedEl = document.getElementById(`notes-saved-${imo}`);
    if (savedEl) {
        savedEl.classList.add('show');
        setTimeout(() => savedEl.classList.remove('show'), 2000);
    }
}

// FILTERING & SORTING
function passesFilter(imo, vessel, status) {
    if (el.statusFilter.value !== 'ALL' && status !== el.statusFilter.value) return false;
    
    if (el.ageFilter.value !== 'ALL') {
        const ageData = formatSignalAge(vessel.last_pos_utc);
        const ageHours = ageData.rawAgeMs / (1000 * 60 * 60);
        switch (el.ageFilter.value) {
            case '1H': if (ageHours > 1) return false; break;
            case '6H': if (ageHours > 6) return false; break;
            case '24H': if (ageHours > 24) return false; break;
            case 'STALE': if (ageHours <= 24) return false; break;
        }
    }
    return true;
}

function applyFilters() {
    S.filteredVessels = [];
    S.trackedImos.forEach(imo => {
        const v = S.vesselsDataMap.get(imo) || {};
        const status = getVesselStatus(v);
        if (passesFilter(imo, v, status)) {
            S.filteredVessels.push({ imo, v, status });
        }
    });
    el.filteredCount.textContent = S.filteredVessels.length;
    el.totalCount.textContent = S.trackedImos.size;
    if (S.trackedImos.size > 0) {
        el.filterInfo.style.display = 'block';
    }
}

// RENDERING
function renderVessels(tracked) {
    applyFilters();
    
    if (!tracked || tracked.length === 0) {
        el.vesselsContainer.innerHTML = `<div class="empty-state"><div class="icon">🚢</div><p>${i18n.get('addVessel')}</p><small>${i18n.get('imoHint')}</small></div>`;
        return;
    }

    const ORDER = { UNDERWAY: 0, 'AT PORT': 1, 'AT ANCHOR': 2, STALLED: 3, 'DATA PENDING': 4 };
    const items = S.filteredVessels.map(({ imo, v, status }) => ({
        imo,
        v,
        status,
        ageData: formatSignalAge(v.last_pos_utc),
        name: v.name || 'Loading...',
        rawAgeMs: formatSignalAge(v.last_pos_utc).rawAgeMs,
        isPending: !v.name,
        prio: isPriority(imo),
        sanc: S.sanctionedImos.has(imo),
    }));

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
        el.vesselsContainer.innerHTML = `<div class="empty-state"><div class="icon">🔍</div><p>${i18n.currentLang === 'FR' ? 'Aucun navire ne correspond.' : 'No vessels match filter.'}</p></div>`;
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

            const card = document.createElement('div');
            card.className = `vessel-card ${sanc ? 'sanctioned' : prio ? 'priority' : sc}`;
            card.innerHTML = `
                <div class="vessel-card-inner">
                    ${prio && !sanc ? `<div class="priority-indicator"></div>` : ''}
                    <div class="vessel-main" onclick="toggleDetails('${imo}')">
                        <div class="vessel-top">
                            <div>
                                <div class="vessel-name-block">
                                    ${fh}
                                    <span class="vessel-name">${vName}</span>
                                    ${sanc ? `<span class="tag sanction-tag">🚨 ${i18n.currentLang === 'FR' ? 'Sanctionné' : 'Sanctioned'}</span>` : prio ? `<span style="font-size:.82rem;">🚩</span>` : ''}
                                    ${loaHtml}
                                </div>
                                <div class="vessel-imo">IMO ${imo}</div>
                            </div>
                            <span class="tag ${tc}">${status}</span>
                        </div>
                        ${isPending ? `<div style="display:flex;align-items:center;gap:8px;padding:8px 0;color:var(--text-soft);font-size:.76rem;">
                            <div class="spinner" style="width:14px;height:14px;margin:0;"></div>
                            ${i18n.currentLang === 'FR' ? 'Attente des données...' : 'Waiting for data...'}
                        </div>` : `
                            <div class="vessel-meta">
                                <div class="meta-row"><span class="meta-label">${i18n.get('signalAge')}</span><span class="meta-val ${ageData.ageClass}">${ageData.ageText}</span></div>
                                <div class="meta-row"><span class="meta-label">${i18n.currentLang === 'FR' ? 'Dest.' : 'Dest.'}</span><span class="meta-val">${vDest}</span></div>
                                <div class="meta-row"><span class="meta-label">${i18n.currentLang === 'FR' ? 'Position' : 'Position'}</span><span class="meta-val"><span class="tag position">${v.lat != null ? Number(v.lat).toFixed(3) : '—'}, ${v.lon != null ? Number(v.lon).toFixed(3) : '—'}</span></span></div>
                            </div>
                            <div class="tag-row">
                                ${v.sog != null ? `<span class="tag speed">⚡ ${Number(v.sog).toFixed(1)} kn</span>` : ''}
                                ${v.cog != null ? `<span class="tag">🧭 ${Number(v.cog).toFixed(0)}°</span>` : ''}
                                ${v.nearest_port ? `<span class="tag">🏝 ${escapeHtml(v.nearest_port)}${v.nearest_distance_nm ? ' ' + Number(v.nearest_distance_nm).toFixed(0) + ' nm' : ''}</span>` : ''}
                            </div>
                            <div class="hint-text">Tap to expand · ${vFlag}</div>
                        `}
                    </div>
                </div>
                <div id="details-${imo}" class="vessel-expanded">
                    <div class="expanded-grid">
                        <div class="exp-item">
                            <div class="exp-label">${i18n.currentLang === 'FR' ? 'Type' : 'Ship Type'}</div>
                            <div class="exp-val">${escapeHtml(v.ship_type || '—')}</div>
                        </div>
                        <div class="exp-item">
                            <div class="exp-label">${i18n.currentLang === 'FR' ? 'TJB' : 'Gross Tonnage'}</div>
                            <div class="exp-val">${v.gross_tonnage ? Number(v.gross_tonnage).toLocaleString() : '—'}</div>
                        </div>
                        <div class="exp-item">
                            <div class="exp-label">${i18n.currentLang === 'FR' ? 'Construit' : 'Built'}</div>
                            <div class="exp-val">${escapeHtml(v.year_of_build || '—')}</div>
                        </div>
                        <div class="exp-item">
                            <div class="exp-label">${i18n.currentLang === 'FR' ? 'Longueur' : 'Length'}</div>
                            <div class="exp-val">${v.length_overall_m ? Number(v.length_overall_m).toFixed(1) + ' m' : '—'}</div>
                        </div>
                    </div>
                    <div class="section-divider"></div>
                    <div class="section-mini-title">📋 Notes</div>
                    <textarea id="notes-${imo}" oninput="onNoteInput('${imo}',this)" placeholder="${i18n.currentLang === 'FR' ? 'Contact agent, cargo, instructions...' : 'Agent contact, cargo, special instructions...'}">${escapeHtml(getNotes(imo))}</textarea>
                </div>
                <div class="vessel-footer">
                    <span class="vessel-footer-meta">AIS: unknown · ${ageData.ageText}</span>
                    <div class="vessel-footer-actions">
                        <button class="${prio ? 'urgent-btn' : 'ghost'}" style="padding:5px 9px;font-size:.68rem;" onclick="event.stopPropagation();togglePriority('${imo}')">${prio ? '🚩 ' + (i18n.currentLang === 'FR' ? 'Priorité' : 'Priority') : '⑁ Flag'}</button>
                        <button class="danger" style="padding:5px 9px;font-size:.68rem;" onclick="event.stopPropagation();removeIMO('${imo}')">${i18n.get('remove')}</button>
                    </div>
                </div>
            `;
            el.vesselsContainer.appendChild(card);
        } catch (err) {
            console.warn(`Card render error IMO ${imo}:`, err);
        }
    });
}

// MAP
function initMap() {
    if (S.map) return;
    S.map = L.map('map').setView([20, 0], 3);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19,
    }).addTo(S.map);
}

function updateMap() {
    if (!el.mapPanel.classList.contains('visible')) return;
    if (!S.map) initMap();

    S.mapMarkers.forEach(m => S.map.removeLayer(m));
    S.mapMarkers.clear();

    S.trackedImos.forEach(imo => {
        const v = S.vesselsDataMap.get(imo);
        if (!v || v.lat == null || v.lon == null) return;

        // Apply same filter as vessels list
        const status = getVesselStatus(v);
        if (!passesFilter(imo, v, status)) return;

        const colors = {
            UNDERWAY: '#0ea5e9',
            'AT PORT': '#10b981',
            'AT ANCHOR': '#14b8a6',
            STALLED: '#f59e0b',
            'DATA PENDING': '#666',
        };
        const color = colors[status] || '#0ea5e9';
        const marker = L.circleMarker([v.lat, v.lon], {
            radius: 6,
            fillColor: color,
            color: '#fff',
            weight: 2,
            opacity: 1,
            fillOpacity: 0.8,
        }).bindPopup(`<strong>${escapeHtml(v.name || 'Loading')}</strong><br>IMO: ${imo}<br>Status: ${status}`);
        marker.addTo(S.map);
        S.mapMarkers.set(imo, marker);
    });
}

// EVENT HANDLERS
function setupEventListeners() {
    el.addBtn.addEventListener('click', addIMO);
    el.imoInput.addEventListener('keypress', e => {
        if (e.key === 'Enter') addIMO();
    });
    
    el.imoInput.addEventListener('input', () => {
        const v = el.imoInput.value.trim();
        if (v.length === 7) {
            el.imoInput.style.borderColor = validateIMO(v) ? 'var(--success)' : 'var(--danger)';
        } else {
            el.imoInput.style.borderColor = '';
        }
    });

    el.statusFilter.addEventListener('change', () => renderVessels(Array.from(S.trackedImos)));
    el.ageFilter.addEventListener('change', () => renderVessels(Array.from(S.trackedImos)));
    el.sortSelect.addEventListener('change', () => {
        S.currentSortKey = el.sortSelect.value;
        renderVessels(Array.from(S.trackedImos));
    });

    el.confirmCancel.addEventListener('click', () => {
        el.confirmModal.style.display = 'none';
        S.vesselToRemove = null;
    });

    el.confirmOk.addEventListener('click', () => {
        if (S.vesselToRemove) removeIMOConfirmed(S.vesselToRemove);
        el.confirmModal.style.display = 'none';
    });

    el.langToggle.addEventListener('click', () => {
        const newLang = i18n.currentLang === 'EN' ? 'FR' : 'EN';
        i18n.setLang(newLang);
        el.langToggle.textContent = newLang === 'FR' ? 'EN' : 'FR';
        renderVessels(Array.from(S.trackedImos));
        updateMap();
    });

    el.mapToggle.addEventListener('click', () => {
        const isVisible = el.mapPanel.classList.contains('visible');
        if (isVisible) {
            el.mapPanel.classList.remove('visible');
            el.leftPanel.classList.remove('hidden');
            el.mapToggle.classList.remove('active');
        } else {
            el.mapPanel.classList.add('visible');
            if (window.innerWidth <= 1024) {
                el.leftPanel.classList.add('hidden');
            }
            el.mapToggle.classList.add('active');
            setTimeout(() => updateMap(), 100);
        }
    });

    el.fabFilter.addEventListener('click', () => {
        el.filterSection.classList.add('visible');
    });

    el.filterCloseBtn.addEventListener('click', () => {
        el.filterSection.classList.remove('visible');
    });

    // Update clock
    setInterval(() => {
        const now = new Date();
        el.headerClock.textContent = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    }, 1000);

    // Update last modified display
    setInterval(updateLastModifiedDisplay, 30000);
}

// INIT
function init() {
    console.log('🚢 VesselTracker v5.5');
    i18n.init();
    loadTrackedVessels();
    setupEventListeners();
    el.sortSelect.value = S.currentSortKey;
    loadData();
    updateLastModifiedDisplay();
    S.refreshInterval = setInterval(loadData, CONFIG.REFRESH_INTERVAL);

    if (window.innerWidth > 640) {
        el.fabFilter.style.display = 'none';
    } else {
        el.filterSection.classList.remove('visible');
    }

    window.addEventListener('resize', () => {
        if (window.innerWidth > 640) {
            el.fabFilter.style.display = 'none';
            el.filterSection.classList.remove('visible');
        } else {
            el.fabFilter.style.display = 'flex';
        }
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
