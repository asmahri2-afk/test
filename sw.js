// VesselTracker Service Worker — network-first, no caching
const VERSION = 'vt-v5.5';

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
    // Always go to network first — never serve stale data
    e.respondWith(
        fetch(e.request, { cache: 'no-store' }).catch(() => caches.match(e.request))
    );
});
