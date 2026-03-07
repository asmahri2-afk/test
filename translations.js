// i18n translations
const translations = {
    EN: {
        tracked: 'Tracked',
        underway: 'Underway',
        port: 'At Port',
        warnings: 'Warnings',
        lastUpdate: 'Last update',
        addVessel: 'Add Vessel',
        track: 'Track',
        imoHint: 'Enter vessel IMO number',
        filter: 'Filter',
        all: 'All',
        atPort: 'At Port',
        atAnchor: 'At Anchor',
        stalled: 'Stalled',
        dataPending: 'Data Pending',
        signalAge: 'Signal Age',
        last1Hour: 'Last 1 hour',
        last6Hours: 'Last 6 hours',
        last24Hours: 'Last 24 hours',
        stale: 'Stale (>24h)',
        sort: 'Sort by',
        priority: 'Priority / Sanctions',
        newestSignal: 'Newest signal',
        oldestSignal: 'Oldest signal',
        nameAsc: 'Name (A-Z)',
        nameDesc: 'Name (Z-A)',
        statusAsc: 'Status',
        ofTotal: 'of',
        confirm: 'Confirm',
        cancel: 'Cancel',
        remove: 'Remove',
        status: 'Status'
    },
    FR: {
        tracked: 'Suivi',
        underway: 'En route',
        port: 'Au port',
        warnings: 'Alertes',
        lastUpdate: 'Dernière mise à jour',
        addVessel: 'Ajouter navire',
        track: 'Suivre',
        imoHint: 'Entrez le numéro IMO du navire',
        filter: 'Filtrer',
        all: 'Tous',
        atPort: 'Au port',
        atAnchor: 'À l\'ancre',
        stalled: 'Immobilisé',
        dataPending: 'Données en attente',
        signalAge: 'Âge du signal',
        last1Hour: 'Dernière 1 heure',
        last6Hours: 'Dernières 6 heures',
        last24Hours: 'Dernières 24 heures',
        stale: 'Ancien (>24h)',
        sort: 'Trier par',
        priority: 'Priorité / Sanctions',
        newestSignal: 'Signal le plus récent',
        oldestSignal: 'Signal le plus ancien',
        nameAsc: 'Nom (A-Z)',
        nameDesc: 'Nom (Z-A)',
        statusAsc: 'Statut',
        ofTotal: 'sur',
        confirm: 'Confirmer',
        cancel: 'Annuler',
        remove: 'Supprimer',
        status: 'Statut'
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
