// VesselTracker Service Worker — Hybrid Caching (v5.6)
const CACHE_NAME = 'vt-app-shell-v5.6';
const DATA_CACHE_NAME = 'vt-data-cache-v5.6';

// The core static files that make up the UI
const APP_SHELL = [
    './',
    './index.html',
    './styles.css',
    './script.js',
    './translations.js',
    './manifest.json',
    'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.min.css',
    'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.min.js',
    'https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Mono:wght@300;400;500&display=swap'
];

self.addEventListener('install', e => {
    e.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL))
    );
    self.skipWaiting();
});

self.addEventListener('activate', e => {
    // Clean up old cache versions
    e.waitUntil(
        caches.keys().then(keys => Promise.all(
            keys.map(key => {
                if (key !== CACHE_NAME && key !== DATA_CACHE_NAME) {
                    return caches.delete(key);
                }
            })
        ))
    );
    self.clients.claim();
});

self.addEventListener('fetch', e => {
    const url = new URL(e.request.url);

    // 1. Dynamic Data (GitHub raw content, Render API, Cloudflare Workers) -> NETWORK FIRST
    if (url.hostname.includes('api.github.com') ||
        url.hostname.includes('raw.githubusercontent.com') ||
        url.hostname.includes('onrender.com') ||
        url.hostname.includes('workers.dev')) {
        
        e.respondWith(
            fetch(e.request)
                .then(res => {
                    const resClone = res.clone();
                    caches.open(DATA_CACHE_NAME).then(cache => cache.put(e.request, resClone));
                    return res;
                })
                .catch(() => caches.match(e.request)) // Fallback to last known data if offline
        );
    } 
    // 2. Static App Shell -> STALE-WHILE-REVALIDATE
    else {
        e.respondWith(
            caches.match(e.request).then(cachedRes => {
                const fetchPromise = fetch(e.request).then(networkRes => {
                    caches.open(CACHE_NAME).then(cache => cache.put(e.request, networkRes.clone()));
                    return networkRes;
                }).catch(() => {}); // Ignore network errors silently for static assets
                
                return cachedRes || fetchPromise;
            })
        );
    }
});
