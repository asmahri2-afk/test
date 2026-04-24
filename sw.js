// VesselTracker Service Worker — network-first, no caching
const VERSION = 'vt-v5.7';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => {
    // Wipe ALL old caches from previous versions
    e.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys.map(k => caches.delete(k))))
            .then(() => clients.claim())
    );
});
self.addEventListener('fetch', e => {
    // Skip cross-origin requests entirely — let the browser handle them.
    // Intercepting external APIs (open-meteo, Supabase, etc.) causes CORS
    // failures and "Failed to convert value to Response" errors when the
    // catch() branch returns undefined (nothing cached).
    if (new URL(e.request.url).origin !== self.location.origin) return;

    // Same-origin only: network-first, never serve stale data
    e.respondWith(
        fetch(e.request, { cache: 'no-store' }).catch(() => caches.match(e.request))
    );
});
