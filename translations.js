// i18n translations – COMPLETE with all UI strings
const translations = {
    EN: {
        // Time formatting
        justNow: ' just now',
        minAgo: 'm ago',
        hAgo: 'h ago',
        dAgo: 'd ago',
        arrivingNow: 'Arriving Now',
        in: 'in',
        min: 'm',
        h: 'h',
        m: 'm',
        s: 's',
        overdue: 'overdue',
        eta: 'ETA',
        
        // General
        loading: 'Loading...',
        loadingVesselData: 'Loading vessel data...',
        refreshing: 'Refreshing...',
        ready: 'Ready',
        checking: 'Checking...',
        confirm: 'Confirm',
        cancel: 'Cancel',
        remove: 'Remove',
        filter: 'FILTER',
        applyFilters: 'Apply Filters',
        sortBy: 'Sort By',
        signalAge: 'Signal Age',
        filtersSort: 'Filters & Sort',
        fleet: 'Fleet',
        map: 'Map',
        add: 'Add',
        alerts: 'Alerts',
        export: 'Export',
        readAll: 'Read All',
        clear: 'Clear',
        monitoring: '📡 Monitoring fleet activity...',
        loadingSanctions: 'Loading sanctions...',
        monitoringSanctions: 'Monitoring',
        sanctionsUnavailable: 'Sanctions unavailable',
        releaseToRefresh: '↓ Release to refresh',

        // KPI & status
        tracked: 'Fleet',
        underway: 'Underway',
        atport: 'At Port',
        atanchor: 'At Anchor',
        stalled: 'Stalled',
        sanctioned: 'Sanctioned',
        data_pending: 'Data Pending',
        fleetHealth: 'Fleet Health',
        lastUpdate: 'Updated',
        
        // Health text
        excellent: 'Excellent',
        good: 'Good',
        stale: 'Stale',
        critical: 'Critical',
        unknown: 'Unknown',

        // Add vessel
        addVessel: 'Add Vessel',
        imoHint: 'Enter a valid 7‑digit IMO number to track the vessel',
        invalidIMODigits: '✕ Must be 7 digits',
        invalidIMOChecksum: '✕ Invalid IMO checksum',
        alreadyTracked: '⚠ Already tracked',
        addingVessel: 'Adding vessel',
        removingVessel: 'Removing vessel',
        mustBe7Digits: 'Must be 7 digits',
        imoNotFound: '✕ IMO not found:',
        lookingUp: '🔍 Looking up...',
        lookupFailed: '⚠ Lookup failed',
        youCanStillAdd: 'You can still add IMO',
        cached: 'cached',

        // Fleet header
        trackedFleet: 'Tracked Fleet',
        list: 'List',
        mapNav: 'Map',
        priorityFirst: 'Priority First',
        oldestSignal: 'Oldest Signal',
        newestSignal: 'Newest Signal',
        statusAsc: 'By Status',
        nameAsc: 'Name A–Z',
        nameDesc: 'Name Z–A',
        all: 'All',
        priority: 'Priority',
        allAges: 'All Signal Ages',
        last1Hour: 'Last 1 hour',
        last6Hours: 'Last 6 hours',
        last24Hours: 'Last 24 hours',
        stale: 'Stale (>24h)',
        
        // Vessel card
        signal: 'Signal',
        dest: 'Dest.',
        position: 'Position',
        eta: 'ETA',
        tapToExpand: 'Tap to expand',
        aisSource: 'AIS',
        flag: 'Flag',
        notes: 'Notes',
        saved: 'Saved',
        vessels: 'vessels',
        vesselsTracked: 'vessels tracked',
        inDatabase: 'in database',
        loadedFromCache: 'Loaded from cache',
        showingCached: 'Showing cached data',
        loadFailed: 'Load failed',
        checkNetwork: 'Check network connection',
        fleetLoaded: 'Fleet loaded',
        languageChanged: 'Language changed',
        
        // Vessel details
        details: 'Vessel Details',
        shipType: 'Ship Type',
        dwt: 'DWT',
        grossTonnage: 'Gross Tonnage',
        built: 'Built',
        length: 'Length',
        loaM: 'LOA (m)',
        beam: 'Beam',
        draughtM: 'Draught (m)',
        draught: 'Draught',
        mmsi: 'MMSI',
        aisSourceLabel: 'AIS Source',
        flagLabel: 'Flag',
        portCompatibility: 'Port Compatibility',
        anch: 'Anch.',
        pier: 'Pier',
        noDepthData: 'No depth data',
        appearsOnSanctions: 'Appears on sanctions list',
        sanctionsList: 'Sanctions List',
        sanctionedVessel: 'SANCTIONED VESSEL',
        on: 'on',
        added: 'added',
        
        // Status
        status: 'Status',
        speed: 'Speed',
        speedKn: 'Speed (kn)',
        course: 'Course',
        lat: 'Latitude',
        lon: 'Longitude',
        vessel: 'Vessel',
        sanctioned: 'Sanctioned',
        priority: 'Priority',

        // Empty states
        noVesselsTracked: 'No vessels tracked yet.',
        addAnIMO: 'Add an IMO number above',
        noMatch: 'No vessels match this filter.',

        // Map legend
        legendUnderway: 'Underway',
        legendPort: 'At Port',
        legendAnchor: 'At Anchor',
        legendStalled: 'Stalled',

        // Buttons
        flagPriority: 'Flag',
        priorityFlagged: 'Priority',
        removingVessel: 'Removing vessel',

        // Alerts types
        stalledAlert: 'has stopped moving',
        arrivedPort: 'arrived at port',
        atAnchorAlert: 'now at anchor',
        signalLost: 'AIS signal lost',
        approaching: 'approaching',
        addedToFleet: 'added to fleet tracking',
        removedFromFleet: 'removed from fleet',
        flaggedPriority: 'flagged as priority',
        
        // Export
        exported: 'Fleet exported to CSV',
        
        // Notifications
        writeFailed: 'Write failed:',
        conflictRetry: 'Conflict — please retry.',
        authFailed: 'API auth failed.',
        retrying: 'Retrying...',
        failed: 'Failed',
        added: 'Added',
        removed: 'Removed',
        
        // Confirm
        removeConfirm: 'Remove',
        
        // Notes
        notesPlaceholder: 'Agent contact, cargo, special instructions...',
        
        // Search
        searchVessels: 'Search name or IMO…',
        
        // Port compatibility statuses (icons)
        portOk: '✔',
        portWarn: '⚠',
        portIncompat: '✗',
        portUnknown: '?',
    },
    FR: {
        // Formatage de temps
        justNow: ' à l\'instant',
        minAgo: 'm passé',
        hAgo: 'h passé',
        dAgo: 'j passé',
        arrivingNow: 'Arrivée maintenant',
        in: 'dans',
        min: 'm',
        h: 'h',
        m: 'm',
        s: 's',
        overdue: 'en retard',
        eta: 'ETA',
        
        // Général
        loading: 'Chargement...',
        loadingVesselData: 'Chargement des données...',
        refreshing: 'Actualisation...',
        ready: 'Prêt',
        checking: 'Vérification...',
        confirm: 'Confirmer',
        cancel: 'Annuler',
        remove: 'Supprimer',
        filter: 'FILTRE',
        applyFilters: 'Appliquer filtres',
        sortBy: 'Trier par',
        signalAge: 'Âge du signal',
        filtersSort: 'Filtres & tri',
        fleet: 'Flotte',
        map: 'Carte',
        add: 'Ajouter',
        alerts: 'Alertes',
        export: 'Exporter',
        readAll: 'Tout lire',
        clear: 'Effacer',
        monitoring: '📡 Surveillance de la flotte...',
        loadingSanctions: 'Chargement des sanctions...',
        monitoringSanctions: 'Surveillance',
        sanctionsUnavailable: 'Sanctions indisponibles',
        releaseToRefresh: '↓ Relâcher pour actualiser',

        // KPI & statut
        tracked: 'Flotte',
        underway: 'En route',
        atport: 'Au port',
        atanchor: 'À l\'ancre',
        stalled: 'Immobilisé',
        sanctioned: 'Sanctionné',
        data_pending: 'Données manquantes',
        fleetHealth: 'Santé flotte',
        lastUpdate: 'Mise à jour',
        
        // Texte santé
        excellent: 'Excellent',
        good: 'Bon',
        stale: 'Ancien',
        critical: 'Critique',
        unknown: 'Inconnu',

        // Ajouter navire
        addVessel: 'Ajouter navire',
        imoHint: 'Entrez un numéro IMO valide à 7 chiffres',
        invalidIMODigits: '✕ Doit être 7 chiffres',
        invalidIMOChecksum: '✕ IMO invalide',
        alreadyTracked: '⚠ Déjà suivi',
        addingVessel: 'Ajout navire',
        removingVessel: 'Suppression navire',
        mustBe7Digits: 'Doit être 7 chiffres',
        imoNotFound: '✕ IMO non trouvé:',
        lookingUp: '🔍 Recherche...',
        lookupFailed: '⚠ Recherche échouée',
        youCanStillAdd: 'Vous pouvez ajouter IMO',
        cached: 'en cache',

        // En‑tête flotte
        trackedFleet: 'Navires suivis',
        list: 'Liste',
        mapNav: 'Carte',
        priorityFirst: 'Priorité d\'abord',
        oldestSignal: 'Signal le plus ancien',
        newestSignal: 'Signal le plus récent',
        statusAsc: 'Par statut',
        nameAsc: 'Nom A–Z',
        nameDesc: 'Nom Z–A',
        all: 'Tous',
        priority: 'Priorité',
        allAges: 'Tous âges de signal',
        last1Hour: 'Dernière 1 heure',
        last6Hours: 'Dernières 6 heures',
        last24Hours: 'Dernières 24 heures',
        stale: 'Ancien (>24h)',

        // Carte navire
        signal: 'Signal',
        dest: 'Dest.',
        position: 'Position',
        eta: 'ETA',
        tapToExpand: 'Appuyer pour détailler',
        aisSource: 'AIS',
        flag: 'Pavillon',
        notes: 'Notes',
        saved: 'Sauvegardé',
        vessels: 'navires',
        vesselsTracked: 'navires suivis',
        inDatabase: 'dans base de données',
        loadedFromCache: 'Chargé depuis cache',
        showingCached: 'Affichage données en cache',
        loadFailed: 'Chargement échoué',
        checkNetwork: 'Vérifiez connexion',
        fleetLoaded: 'Flotte chargée',
        languageChanged: 'Langue changée',
        
        // Détails navire
        details: 'Détails navire',
        shipType: 'Type navire',
        dwt: 'DWT',
        grossTonnage: 'Tonnage brut',
        built: 'Année const.',
        length: 'Longueur',
        loaM: 'LOA (m)',
        beam: 'Largeur',
        draughtM: 'Tirant (m)',
        draught: 'Tirant d\'eau',
        mmsi: 'MMSI',
        aisSourceLabel: 'Source AIS',
        flagLabel: 'Pavillon',
        portCompatibility: 'Compatibilité port',
        anch: 'Anc.',
        pier: 'Quai',
        noDepthData: 'Pas de profondeur',
        appearsOnSanctions: 'Apparaît sur listes sanctions',
        sanctionsList: 'Listes sanctions',
        sanctionedVessel: 'NAVIRE SANCTIONNÉ',
        on: 'sur',
        added: 'ajouté',
        
        // Statut
        status: 'Statut',
        speed: 'Vitesse',
        speedKn: 'Vitesse (kn)',
        course: 'Cap',
        lat: 'Latitude',
        lon: 'Longitude',
        vessel: 'Navire',
        sanctioned: 'Sanctionné',
        priority: 'Prioritaire',

        // États vides
        noVesselsTracked: 'Aucun navire suivi.',
        addAnIMO: 'Ajoutez numéro IMO ci‑dessus',
        noMatch: 'Aucun navire ne correspond.',

        // Légende carte
        legendUnderway: 'En route',
        legendPort: 'Au port',
        legendAnchor: 'À l\'ancre',
        legendStalled: 'Immobilisé',

        // Boutons
        flagPriority: 'Marquer',
        priorityFlagged: 'Prioritaire',
        removingVessel: 'Suppression navire',

        // Types d\'alertes
        stalledAlert: 'a cessé de bouger',
        arrivedPort: 'arrivé au port',
        atAnchorAlert: 'maintenant à l\'ancre',
        signalLost: 'signal AIS perdu',
        approaching: 'approche',
        addedToFleet: 'ajouté au suivi',
        removedFromFleet: 'retiré du suivi',
        flaggedPriority: 'marqué prioritaire',
        
        // Export
        exported: 'Flotte exportée en CSV',
        
        // Notifications
        writeFailed: 'Écriture échouée:',
        conflictRetry: 'Conflit — recommencez.',
        authFailed: 'Authentification échouée.',
        retrying: 'Nouvelle tentative...',
        failed: 'Échoué',
        added: 'Ajouté',
        removed: 'Supprimé',
        
        // Confirmation
        removeConfirm: 'Supprimer',
        
        // Notes
        notesPlaceholder: 'Contact agent, cargo, instructions spéciales...',
        
        // Recherche
        searchVessels: 'Rechercher nom ou IMO…',
        
        // Statuts compatibilité port (icônes)
        portOk: '✔',
        portWarn: '⚠',
        portIncompat: '✗',
        portUnknown: '?',
    }
};

// i18n helper
class i18n {
    static currentLang = localStorage.getItem('lang') || 'EN';

    static get(key) {
        const t = translations[this.currentLang];
        if (!t) return key;
        const val = t[key];
        return val !== undefined ? val : key;
    }

    static setLang(lang) {
        this.currentLang = lang;
        localStorage.setItem('lang', lang);
        this.updateDOM();
    }

    static updateDOM() {
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            el.textContent = this.get(key);
        });
    }

    static init() {
        this.updateDOM();
    }
}

// Initialize on load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => i18n.init());
} else {
    i18n.init();
}
