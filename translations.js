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
        // nav & section titles
        trackedFleet:   'Tracked Fleet',
        navFleet:       'Fleet',
        navMap:         'Map',
        navAdd:         'Add',
        navAlerts:      'Alerts',
        navExport:      'Export',
        viewList:       '≡ List',
        viewMap:        '⊕ Map',
        searchPlaceholder: 'Search name or IMO...',
        // status / loading messages
        ready:          'Ready',
        refreshing:     'Refreshing...',
        loadingFleet:   'Loading fleet data…',
        connectingGit:  'Connecting to GitHub',
        loadingVessel:  'Loading vessel data...',
        loadingDots:    'Loading...',
        fleetLoaded:    'Fleet loaded',
        vessels:        'vessels',
        inDatabase:     'in database',
        cachedLoad:     'Loaded from cache',
        checking:       'Checking...',
        unknown:        'Unknown',
        // health labels
        healthExcellent:'● Excellent',
        healthGood:     '● Good',
        healthStale:    '● Stale',
        healthCritical: '● Critical',
        // API status
        apiOnline:      'API: Online',
        apiLimited:     'API: Limited',
        apiOffline:     'API: Offline',
        apiChecking:    'API: Checking...',
        // sanctions
        monitoringSanctioned: 'Monitoring {n} sanctioned vessels',
        sanctionsUnavailable: '⚠ Sanctions unavailable',
        sanctionedAlert:      '🚨 SANCTIONED: {name} on {lists}',
        sanctionsList:        'sanctions list',
        // IMO validation
        invalidImoDigits: '✕ Must be exactly 7 digits',
        invalidImoCheck:  '✕ Invalid IMO checksum',
        alreadyTracked:   '⚠ Already tracked',
        imoNotFound:      '✕ IMO {imo} not found',
        lookingUp:        '🔍 Looking up...',
        lookupFailed:     '⚠ Lookup failed — you can still add IMO {imo}',
        statusAlreadyTracked: 'Already tracked',
        statusInvalidDigits:  'Invalid IMO — must be 7 digits',
        statusInvalidCheck:   'Invalid IMO — checksum failed',
        // add/remove ops
        addingImo:      'Adding IMO {imo}...',
        removingImo:    'Removing IMO {imo}...',
        addingAttempt:  'Adding ({n}/2)...',
        removingAttempt:'Removing ({n}/2)...',
        addedImo:       'Added IMO {imo}',
        removedImo:     'Removed IMO {imo}',
        retrying:       'Retrying...',
        failed:         'Failed: {msg}',
        // alerts / events
        alertMonitoring:     '📡 Monitoring fleet activity...',
        alertStalled:        '{name} has stopped moving',
        alertArrivedPort:    '{name} arrived at port',
        alertAtAnchor:       '{name} now at anchor',
        alertSignalLost:     '{name} AIS signal lost ({age})',
        alertApproaching:    '{name} approaching ({dist} nm)',
        alertAdded:          'IMO {imo} added to fleet tracking',
        alertRemoved:        'IMO {imo} removed from fleet',
        alertPriority:       'IMO {imo} flagged as Priority',
        alertSanctioned:     '🚨 SANCTIONED VESSEL added: IMO {imo} on {lists}',
        // empty states
        noVessels:      'No vessels tracked yet.',
        addImoHint:     'Add an IMO number above',
        noMatch:        'No vessels match this filter.',
        removeConfirm:  'Remove "{name}" (IMO {imo}) from fleet tracking?',
        // time
        justNow:        'Just now',
        arrivingNow:    'Arriving Now',
        timeAgoMin:     '{n}m ago',
        timeAgoHour:    '{n}h ago',
        timeAgoDay:     '{n}d ago',
        timeInMin:      'in {n}m',
        timeInHour:     'in {n}h',
        etaLabel2:      'ETA {h}h {m}m {s}s',
        etaOverdue:     '{h}h {m}m overdue',
        etaOverdueMin:  '{m}m overdue',
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
        // nav & section titles
        trackedFleet:   'Flotte suivie',
        navFleet:       'Flotte',
        navMap:         'Carte',
        navAdd:         'Ajouter',
        navAlerts:      'Alertes',
        navExport:      'Exporter',
        viewList:       '≡ Liste',
        viewMap:        '⊕ Carte',
        searchPlaceholder: 'Recherche nom ou IMO...',
        // status / loading messages
        ready:          'Prêt',
        refreshing:     'Actualisation...',
        loadingFleet:   'Chargement flotte…',
        connectingGit:  'Connexion à GitHub',
        loadingVessel:  'Chargement navires...',
        loadingDots:    'Chargement...',
        fleetLoaded:    'Flotte chargée',
        vessels:        'navires',
        inDatabase:     'en base',
        cachedLoad:     'Chargé depuis le cache',
        checking:       'Vérification...',
        unknown:        'Inconnu',
        // health labels
        healthExcellent:'● Excellent',
        healthGood:     '● Bon',
        healthStale:    '● Obsolète',
        healthCritical: '● Critique',
        // API status
        apiOnline:      'API: En ligne',
        apiLimited:     'API: Limité',
        apiOffline:     'API: Hors ligne',
        apiChecking:    'API: Vérification...',
        // sanctions
        monitoringSanctioned: 'Surveillance de {n} navires sanctionnés',
        sanctionsUnavailable: '⚠ Sanctions indisponibles',
        sanctionedAlert:      '🚨 SANCTIONNÉ : {name} sur {lists}',
        sanctionsList:        'liste des sanctions',
        // IMO validation
        invalidImoDigits: '✕ Exactement 7 chiffres requis',
        invalidImoCheck:  '✕ Somme de contrôle IMO invalide',
        alreadyTracked:   '⚠ Déjà suivi',
        imoNotFound:      '✕ IMO {imo} introuvable',
        lookingUp:        '🔍 Recherche en cours...',
        lookupFailed:     '⚠ Échec — vous pouvez quand même ajouter l\'IMO {imo}',
        statusAlreadyTracked: 'Déjà suivi',
        statusInvalidDigits:  'IMO invalide — 7 chiffres requis',
        statusInvalidCheck:   'IMO invalide — somme de contrôle incorrecte',
        // add/remove ops
        addingImo:      'Ajout IMO {imo}...',
        removingImo:    'Suppression IMO {imo}...',
        addingAttempt:  'Ajout ({n}/2)...',
        removingAttempt:'Suppression ({n}/2)...',
        addedImo:       'IMO {imo} ajouté',
        removedImo:     'IMO {imo} supprimé',
        retrying:       'Nouvelle tentative...',
        failed:         'Échec : {msg}',
        // alerts / events
        alertMonitoring:     '📡 Surveillance de la flotte...',
        alertStalled:        '{name} s\'est immobilisé',
        alertArrivedPort:    '{name} arrivé au port',
        alertAtAnchor:       '{name} au mouillage',
        alertSignalLost:     '{name} signal AIS perdu ({age})',
        alertApproaching:    '{name} approche ({dist} nm)',
        alertAdded:          'IMO {imo} ajouté au suivi',
        alertRemoved:        'IMO {imo} retiré de la flotte',
        alertPriority:       'IMO {imo} marqué Priorité',
        alertSanctioned:     '🚨 NAVIRE SANCTIONNÉ ajouté : IMO {imo} sur {lists}',
        // empty states
        noVessels:      'Aucun navire suivi.',
        addImoHint:     'Ajoutez un numéro IMO ci-dessus',
        noMatch:        'Aucun navire ne correspond au filtre.',
        removeConfirm:  'Supprimer « {name} » (IMO {imo}) du suivi ?',
        // time
        justNow:        'À l\'instant',
        arrivingNow:    'Arrivée imminente',
        timeAgoMin:     'il y a {n}m',
        timeAgoHour:    'il y a {n}h',
        timeAgoDay:     'il y a {n}j',
        timeInMin:      'dans {n}m',
        timeInHour:     'dans {n}h',
        etaLabel2:      'ETA {h}h {m}m {s}s',
        etaOverdue:     '{h}h {m}m de retard',
        etaOverdueMin:  '{m}m de retard',
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
