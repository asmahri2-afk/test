// i18n translations – expanded with all UI strings
const translations = {
    EN: {
        // General
        loading: 'Loading...',
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
        releaseToRefresh: '↓ Release to refresh',

        // KPI & status
        tracked: 'Fleet',
        underway: 'Underway',
        atPort: 'At Port',
        atAnchor: 'Anchor',
        stalled: 'Stalled',
        sanctioned: 'Sanctioned',
        fleetHealth: 'Fleet Health',
        lastUpdate: 'Updated',

        // Add vessel
        addVessel: 'Add Vessel',
        imoHint: 'Enter a valid 7‑digit IMO number to track the vessel',

        // Fleet header
        trackedFleet: 'Tracked Fleet',
        list: 'List',
        map: 'Map',
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
        remove: 'Remove',
        flag: 'Flag',
        notes: 'Notes',
        saved: 'Saved',
        portCompatibility: 'Port Compatibility · Draught',
        details: 'Vessel Details',
        shipType: 'Ship Type',
        dwt: 'DWT',
        grossTonnage: 'Gross Tonnage',
        built: 'Built',
        length: 'Length',
        beam: 'Beam',
        draught: 'Draught',
        mmsi: 'MMSI',
        aisSourceLabel: 'AIS Source',
        flagLabel: 'Flag',

        // Empty states
        noVesselsTracked: 'No vessels tracked yet.',
        addAnIMO: 'Add an IMO number above',
        noMatch: 'No vessels match this filter.',
        loadingVesselData: 'Loading vessel data...',

        // Map legend
        legendUnderway: 'Underway',
        legendPort: 'At Port',
        legendAnchor: 'At Anchor',
        legendStalled: 'Stalled',

        // Buttons
        flagPriority: 'Flag',
        priorityFlagged: 'Priority',

        // Alerts types (used in pushAlert)
        stalledAlert: 'has stopped moving',
        arrivedPort: 'arrived at port',
        atAnchorAlert: 'now at anchor',
        signalLost: 'AIS signal lost',
        approaching: 'approaching',
        addedToFleet: 'added to fleet tracking',
        sanctionedVessel: 'SANCTIONED VESSEL',
    },
    FR: {
        // Général
        loading: 'Chargement...',
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
        releaseToRefresh: '↓ Relâcher pour actualiser',

        // KPI & statut
        tracked: 'Flotte',
        underway: 'En route',
        atPort: 'Au port',
        atAnchor: 'À l\'ancre',
        stalled: 'Immobilisé',
        sanctioned: 'Sanctionné',
        fleetHealth: 'Santé flotte',
        lastUpdate: 'Mise à jour',

        // Ajouter navire
        addVessel: 'Ajouter navire',
        imoHint: 'Entrez un numéro IMO valide à 7 chiffres',

        // En‑tête flotte
        trackedFleet: 'Navires suivis',
        list: 'Liste',
        map: 'Carte',
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
        remove: 'Retirer',
        flag: 'Pavillon',
        notes: 'Notes',
        saved: 'Sauvegardé',
        portCompatibility: 'Compatibilité port · Tirant d\'eau',
        details: 'Détails navire',
        shipType: 'Type',
        dwt: 'DWT',
        grossTonnage: 'Tonnage brut',
        built: 'Année const.',
        length: 'Longueur',
        beam: 'Largeur',
        draught: 'Tirant d\'eau',
        mmsi: 'MMSI',
        aisSourceLabel: 'Source AIS',
        flagLabel: 'Pavillon',

        // États vides
        noVesselsTracked: 'Aucun navire suivi.',
        addAnIMO: 'Ajoutez un numéro IMO ci‑dessus',
        noMatch: 'Aucun navire ne correspond.',
        loadingVesselData: 'Chargement des données...',

        // Légende carte
        legendUnderway: 'En route',
        legendPort: 'Au port',
        legendAnchor: 'À l\'ancre',
        legendStalled: 'Immobilisé',

        // Boutons
        flagPriority: 'Marquer',
        priorityFlagged: 'Prioritaire',

        // Types d'alertes
        stalledAlert: 'a cessé de bouger',
        arrivedPort: 'arrivé au port',
        atAnchorAlert: 'maintenant à l\'ancre',
        signalLost: 'signal AIS perdu',
        approaching: 'approche',
        addedToFleet: 'ajouté au suivi',
        sanctionedVessel: 'NAVIRE SANCTIONNÉ',
    }
};

// i18n helper
class i18n {
    static currentLang = localStorage.getItem('lang') || 'EN';

    static get(key) {
        return translations[this.currentLang]?.[key] || key;
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
        // Also update placeholders, etc., if needed
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