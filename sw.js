// VesselTracker Service Worker — network-first, no caching, push-enabled
const VERSION = 'vt-v5.7-push';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys.map(k => caches.delete(k))))
            .then(() => clients.claim())
    );
});

// ─────────────────────────────────────────────────────────────────
// Fetch — same-origin, network-first.
// IMPORTANT: bypass interception for /admin/ so cookies work.
// ─────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (e) => {
    const url = new URL(e.request.url);
    if (url.origin !== self.location.origin) return;

    // Do NOT intercept admin pages (or any request under /admin/)
    if (url.pathname.startsWith('/admin/')) return;

    e.respondWith(
        fetch(e.request, { cache: 'no-store' }).catch(() => caches.match(e.request))
    );
});

// ─────────────────────────────────────────────────────────────────
// PUSH NOTIFICATIONS — unchanged
// ─────────────────────────────────────────────────────────────────
const DEFAULT_ICON   = 'icon-192.png';
const DEFAULT_BADGE  = 'icon-512.png';
const FALLBACK_TITLE = '🚢 VesselTracker';

self.addEventListener('push', (event) => {
    let payload = {};
    try {
        payload = event.data ? event.data.json() : {};
    } catch (e) {
        payload = { title: FALLBACK_TITLE, body: event.data?.text() || 'New Update' };
    }
    const title = payload.title || FALLBACK_TITLE;
    const options = {
        body: String(payload.body || 'Vessel update received'),
        icon: payload.icon ? new URL(payload.icon, self.location.origin).href : DEFAULT_ICON,
        badge: payload.badge ? new URL(payload.badge, self.location.origin).href : DEFAULT_BADGE,
        tag: String(payload.tag || `vt-${Date.now()}`),
        renotify: true,
        requireInteraction: false,
        data: { url: payload.url || '/', imo: payload.imo || null }
    };
    event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const target = event.notification.data?.url || '/';
    const targetURL = new URL(target, self.location.origin).href;
    event.waitUntil((async () => {
        const all = await clients.matchAll({ type: 'window', includeUncontrolled: true });
        for (const c of all) {
            if (new URL(c.url).origin === self.location.origin) {
                await c.focus();
                c.postMessage({ kind: 'notification-click', data: event.notification.data });
                return;
            }
        }
        if (clients.openWindow) await clients.openWindow(targetURL);
    })());
});

self.addEventListener('pushsubscriptionchange', (event) => {
    event.waitUntil((async () => {
        const all = await clients.matchAll({ type: 'window', includeUncontrolled: true });
        for (const c of all) all.postMessage({ kind: 'push-resubscribe-needed' });
    })());
});
