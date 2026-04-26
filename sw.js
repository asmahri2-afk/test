// VesselTracker Service Worker — network-first, no caching, push-enabled
const VERSION = 'vt-v5.7-push';

// ─────────────────────────────────────────────────────────────────
// Lifecycle
// ─────────────────────────────────────────────────────────────────
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (e) => {
    // Wipe ALL old caches from previous versions
    e.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys.map(k => caches.delete(k))))
            .then(() => clients.claim())
    );
});

// ─────────────────────────────────────────────────────────────────
// Fetch — unchanged: same-origin network-first, never serve stale
// ─────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (e) => {
    if (new URL(e.request.url).origin !== self.location.origin) return;
    e.respondWith(
        fetch(e.request, { cache: 'no-store' }).catch(() => caches.match(e.request))
    );
});

// ═══════════════════════════════════════════════════════════════════
// PUSH NOTIFICATIONS
// ═══════════════════════════════════════════════════════════════════
// Icon paths are RELATIVE to the SW scope (i.e. /test/ on GitHub Pages).
// Verify these files exist in your repo root — adjust if your icons
// live elsewhere. If a file is missing the notification still shows,
// just without an icon.
const DEFAULT_ICON   = 'icon-192.png';
const DEFAULT_BADGE  = 'icon-72.png';
const FALLBACK_TITLE = '🚢 VesselTracker';

// ─────────────────────────────────────────────────────────────────
// PUSH event — fired when Cloudflare Worker delivers a push.
// Payload shape (sent from worker.js, Phase 4):
//   { title, body, icon?, badge?, tag?, url?, imo?, type? }
// ─────────────────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
    console.log('[SW] Push Received'); // Visible in sw-internals console
    let payload = {};
    
    try {
        payload = event.data ? event.data.json() : {};
        console.log('[SW] Payload:', payload);
    } catch (e) {
        console.error('[SW] JSON Parse Error:', e);
        payload = { title: FALLBACK_TITLE, body: event.data?.text() || 'New Update' };
    }

    const title = payload.title || FALLBACK_TITLE;
    
    // Ensure title and body are NEVER null/undefined for Windows compatibility
    const options = {
        body: String(payload.body || 'Vessel update received'),
        icon: payload.icon ? new URL(payload.icon, self.location.origin).href : DEFAULT_ICON,
        badge: payload.badge ? new URL(payload.badge, self.location.origin).href : DEFAULT_BADGE,
        tag: String(payload.tag || `vt-${Date.now()}`),
        renotify: true,
        requireInteraction: false,
        data: {
            url: payload.url || '/',
            imo: payload.imo || null
        }
    };

    event.waitUntil(
        self.registration.showNotification(title, options)
            .then(() => console.log('[SW] Notification shown'))
            .catch(err => console.error('[SW] showNotification failed:', err))
    );
});

// ─────────────────────────────────────────────────────────────────
// NOTIFICATION CLICK — focus existing tab if open, else launch a new one.
// Sends a postMessage to the page so it can deep-link without reloading.
// ─────────────────────────────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const target    = event.notification.data?.url || '/';
    const targetURL = new URL(target, self.location.origin).href;

    event.waitUntil((async () => {
        const all = await clients.matchAll({ type: 'window', includeUncontrolled: true });
        // 1. If a tab on our origin is already open, focus it and tell
        //    the page where to navigate — no full reload needed.
        for (const c of all) {
            try {
                if (new URL(c.url).origin === self.location.origin) {
                    await c.focus();
                    c.postMessage({
                        kind: 'notification-click',
                        data: event.notification.data
                    });
                    return;
                }
            } catch (_) {}
        }
        // 2. No tab open — launch a fresh one at the deep-link URL.
        if (clients.openWindow) {
            await clients.openWindow(targetURL);
        }
    })());
});

// ─────────────────────────────────────────────────────────────────
// PUSH SUBSCRIPTION CHANGE — rare event (browser key rotation,
// Chrome reinstall, push service rotation). We tell any open tab
// to re-subscribe immediately; if no tab is open, the next visit
// will re-register automatically (handled in Phase 3 frontend).
// ─────────────────────────────────────────────────────────────────
self.addEventListener('pushsubscriptionchange', (event) => {
    event.waitUntil((async () => {
        const all = await clients.matchAll({ type: 'window', includeUncontrolled: true });
        for (const c of all) {
            c.postMessage({ kind: 'push-resubscribe-needed' });
        }
    })());
});
