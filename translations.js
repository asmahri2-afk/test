// ═══════════════════════════════════════════════════════════════════════════════
// VESSELTRACKER — i18n  (EN / FR)
// Exposes a global `i18n` object used by script.js
// ═══════════════════════════════════════════════════════════════════════════════

const _translations = {
    EN: {
        tracked:        'Fleet',
        underway:       'Underway',
        port:           'At Port',
        atPort:         'Port',
        atAnchor:       'Anchor',
        stalled:        'Stalled',
        status:         'Sanctioned',
        lastUpdate:     'Updated',
        fleetHealth:    'Fleet Health',
        addVessel:      'Add Vessel',
        track:          'Add',
        imoHint:        'Enter a valid 7-digit IMO number to track the vessel',
        all:            'All',
        priority:       'Priority',
        sanctioned:     'Sanctioned',
        oldestSignal:   'Oldest Signal',
        newestSignal:   'Newest Signal',
        statusAsc:      'By Status',
        nameAsc:        'Name A–Z',
        nameDesc:       'Name Z–A',
        last1Hour:      'Last 1 hour',
        last6Hours:     'Last 6 hours',
        last24Hours:    'Last 24 hours',
        stale:          'Stale (>24h)',
        confirm:        'Confirm',
        cancel:         'Cancel',
        remove:         'Remove',
        warnings:       'Alerts',
        search:         'Search',
        warning:        'Warning',
        critical:       'Critical',
        readAll:        'Read All',
        clear:          'Clear',
        applyFilters:   'Apply Filters',
        sortBy:         'Sort By',
        signalAge:      'Signal Age',
        filtersSort:    'Filters & Sort',
        // vessel card labels
        signalLabel:    'Signal',
        destLabel:      'Dest.',
        posLabel:       'Position',
        etaLabel:       'ETA',
        tapExpand:      'Tap to expand',
        waitData:       'Waiting for data...',
        vesselDetails:  'Vessel Details',
        shipType:       'Ship Type',
        dwt:            'DWT',
        grossTonnage:   'Gross Tonnage',
        builtYear:      'Built',
        vesselLength:   'Length',
        vesselBeam:     'Beam',
        vesselDraught:  'Draught',
        mmsiLabel:      'MMSI',
        aisSourceLabel: 'AIS Source',
        flagLabel:      'Flag',
        portCompatTitle:'Port Compatibility',
        noDepthData:    'No depth data',
        notesLabel:     'Notes',
        flagBtn:        '⑁ Flag',
        priorityBtn:    '🚩 Priority',
        statusUnderway: 'UNDERWAY',
        statusAtPort:   'AT PORT',
        statusAtAnchor: 'AT ANCHOR',
        statusStalled:  'STALLED',
        statusPending:  'DATA PENDING',
    },
    FR: {
        tracked:        'Flotte',
        underway:       'En navigation',
        port:           'Au port',
        atPort:         'Port',
        atAnchor:       'Au mouillage',
        stalled:        'Arrêté',
        status:         'Sanctionné',
        lastUpdate:     'Mis à jour',
        fleetHealth:    'Santé flotte',
        addVessel:      'Ajouter un navire',
        track:          'Ajouter',
        imoHint:        'Entrez un numéro IMO valide à 7 chiffres',
        all:            'Tous',
        priority:       'Priorité',
        sanctioned:     'Sanctionné',
        oldestSignal:   'Signal le plus ancien',
        newestSignal:   'Signal le plus récent',
        statusAsc:      'Par statut',
        nameAsc:        'Nom A–Z',
        nameDesc:       'Nom Z–A',
        last1Hour:      'Dernière heure',
        last6Hours:     'Dernières 6h',
        last24Hours:    'Dernières 24h',
        stale:          'Obsolète (>24h)',
        confirm:        'Confirmer',
        cancel:         'Annuler',
        remove:         'Supprimer',
        warnings:       'Alertes',
        search:         'Recherche',
        warning:        'Alerte',
        critical:       'Critique',
        readAll:        'Tout lire',
        clear:          'Effacer',
        applyFilters:   'Appliquer',
        sortBy:         'Trier par',
        signalAge:      'Âge du signal',
        filtersSort:    'Filtres & Tri',
        // vessel card labels
        signalLabel:    'Signal',
        destLabel:      'Dest.',
        posLabel:       'Position',
        etaLabel:       'ETA',
        tapExpand:      'Toucher pour détailler',
        waitData:       'Chargement...',
        vesselDetails:  'Détails navire',
        shipType:       'Type navire',
        dwt:            'TPL',
        grossTonnage:   'Jauge brute',
        builtYear:      'Construit',
        vesselLength:   'Longueur',
        vesselBeam:     'Largeur',
        vesselDraught:  'Tirant d\'eau',
        mmsiLabel:      'MMSI',
        aisSourceLabel: 'Source AIS',
        flagLabel:      'Pavillon',
        portCompatTitle:'Compat. port',
        noDepthData:    'Données indisponibles',
        notesLabel:     'Notes',
        flagBtn:        '⑁ Marquer',
        priorityBtn:    '🚩 Priorité',
        statusUnderway: 'EN ROUTE',
        statusAtPort:   'AU PORT',
        statusAtAnchor: 'AU MOUILLAGE',
        statusStalled:  'ARRÊTÉ',
        statusPending:  'EN ATTENTE',
    }
};

// ─── i18n object ─────────────────────────────────────────────────────────────
// script.js checks: typeof i18n === 'undefined'
// and uses: i18n.currentLang, i18n.get(key), i18n.setLang(l), i18n.updateDOM()
window.i18n = {
    /** Active language – uppercase, e.g. 'EN' or 'FR' */
    currentLang: (localStorage.getItem('lang') || 'EN').toUpperCase(),

    /**
     * Return a translated string for key, falling back gracefully.
     */
    get(key) {
        return (_translations[this.currentLang] && _translations[this.currentLang][key]) ||
               (_translations['EN'] && _translations['EN'][key]) ||
               key;
    },

    /**
     * Switch language, persist, and refresh DOM.
     */
    setLang(lang) {
        const upper = String(lang).toUpperCase();
        if (!_translations[upper]) return;
        this.currentLang = upper;
        localStorage.setItem('lang', upper);
        this.updateDOM();
    },

    /**
     * Update all [data-i18n] text content and [data-i18n-placeholder] placeholders.
     */
    updateDOM() {
        const t = _translations[this.currentLang] || _translations['EN'];
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.dataset.i18n;
            if (t[key] !== undefined) el.textContent = t[key];
        });
        document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
            const key = el.dataset.i18nPlaceholder;
            if (t[key] !== undefined) el.placeholder = t[key];
        });
        // Force <select> elements to repaint their displayed text after option labels change.
        // Some browsers (especially Safari/Chrome on iOS) cache the rendered option label.
        document.querySelectorAll('select').forEach(sel => {
            const v = sel.value;
            sel.value = '';
            sel.value = v;
        });
    },

    init() {
        this.updateDOM();
    }
};

document.addEventListener('DOMContentLoaded', () => i18n.init());
