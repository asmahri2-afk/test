// ═══════════════════════════════════════════════════════════════════
// js/push.js — Push Notification Module for VesselTracker v5.7
// ═══════════════════════════════════════════════════════════════════
// Loaded eagerly on every page. Handles:
//   • Browser push subscription (VAPID / Web Push API)
//   • Subscribe / unsubscribe / test via Cloudflare Worker
//   • Devices list management
//   • Auto-resubscribe on page load (keeps subscription alive)
//   • Settings panel rendering (🔔 Push Notifications section)
//   • Service Worker message handling (notification-click deep links)
// ═══════════════════════════════════════════════════════════════════

(function () {
    'use strict';

    // ── VAPID public key (matches Cloudflare Worker secret) ───────────
    const VAPID_PUBLIC_KEY = 'BIV_FWwckcMdt31ubkGAJ2RuG6nao-957perdAjMORpNrUGZM1Gt-3WRxEJiSWvciQb6cex6Nw1Doz8ra1lXj3g';

    // ── Helpers ───────────────────────────────────────────────────────
    function urlBase64ToUint8Array(base64String) {
        const padding = '='.repeat((4 - base64String.length % 4) % 4);
        const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
        const raw = atob(base64);
        return new Uint8Array([...raw].map(c => c.charCodeAt(0)));
    }

    function getDeviceLabel() {
        const ua = navigator.userAgent;
        let browser = 'Browser';
        if (/Edg\//i.test(ua))         browser = 'Edge';
        else if (/Chrome/i.test(ua))   browser = 'Chrome';
        else if (/Firefox/i.test(ua))  browser = 'Firefox';
        else if (/Safari/i.test(ua))   browser = 'Safari';

        let os = '';
        if (/Windows/i.test(ua))              os = 'Windows';
        else if (/Macintosh|Mac OS/i.test(ua)) os = 'macOS';
        else if (/Android/i.test(ua))          os = 'Android';
        else if (/iPhone|iPad|iPod/i.test(ua)) os = 'iOS';
        else if (/Linux/i.test(ua))            os = 'Linux';

        return os ? `${browser} · ${os}` : browser;
    }

    function escapeHtml(s) {
        const d = document.createElement('div');
        d.textContent = s;
        return d.innerHTML;
    }

    function timeAgo(iso) {
        if (!iso) return '';
        const diff = Date.now() - new Date(iso).getTime();
        const m = Math.floor(diff / 60000);
        if (m < 1)  return window.i18n ? i18n.get('justNow') : 'Just now';
        if (m < 60) return window.i18n ? i18n.get('timeAgoMin').replace('{n}', m) : `${m}m ago`;
        const h = Math.floor(m / 60);
        if (h < 24) return window.i18n ? i18n.get('timeAgoHour').replace('{n}', h) : `${h}h ago`;
        const d = Math.floor(h / 24);
        return window.i18n ? i18n.get('timeAgoDay').replace('{n}', d) : `${d}d ago`;
    }

    function workerUrl(path) {
        const base = window.CONFIG?.WORKER_URL || 'https://vesseltracker.asmahri1.workers.dev';
        return `${base}${path}`;
    }

    function authHeaders() {
        const h = { 'Content-Type': 'application/json' };
        if (window.S?.currentUser?.access_token) {
            h['Authorization'] = `Bearer ${window.S.currentUser.access_token}`;
        }
        return h;
    }

    // ══════════════════════════════════════════════════════════════════
    // PUBLIC API
    // ══════════════════════════════════════════════════════════════════

    /** Is Web Push supported on this browser? */
    window.pushSupported = function () {
        return 'serviceWorker' in navigator
            && 'PushManager' in window
            && 'Notification' in window;
    };

    /** Current permission: 'default' | 'granted' | 'denied' | 'unsupported' */
    window.pushPermission = function () {
        return window.pushSupported() ? Notification.permission : 'unsupported';
    };

    /** Is this device currently subscribed? */
    window.pushIsSubscribed = async function () {
        if (!window.pushSupported()) return false;
        try {
            const reg = await navigator.serviceWorker.ready;
            const sub = await reg.pushManager.getSubscription();
            return !!sub;
        } catch (_) { return false; }
    };

    // ── Subscribe ─────────────────────────────────────────────────────
    window.pushSubscribe = async function () {
        if (!window.pushSupported()) throw new Error(i18n.get('pushNotSupported'));
        if (!window.S?.currentUser?.access_token) throw new Error('Not logged in');

        // 1. Ask permission
        const perm = await Notification.requestPermission();
        if (perm !== 'granted') throw new Error(i18n.get('pushBlocked'));

        // 2. Subscribe to browser push manager
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
        });
        const j = sub.toJSON();

        // 3. Send subscription to Cloudflare Worker (upsert)
        const res = await fetch(workerUrl('/push/subscribe'), {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({
                endpoint:     j.endpoint,
                p256dh:       j.keys.p256dh,
                auth:         j.keys.auth,
                user_agent:   navigator.userAgent,
                device_label: getDeviceLabel()
            })
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || `HTTP ${res.status}`);
        }
        console.log('[Push] Subscribed:', getDeviceLabel());
        return true;
    };

    // ── Unsubscribe ───────────────────────────────────────────────────
    window.pushUnsubscribe = async function () {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (!sub) return true;

        const endpoint = sub.endpoint;
        await sub.unsubscribe();

        // Tell server to delete this subscription
        if (window.S?.currentUser?.access_token) {
            try {
                await fetch(workerUrl('/push/unsubscribe'), {
                    method: 'POST',
                    headers: authHeaders(),
                    body: JSON.stringify({ endpoint })
                });
            } catch (e) {
                console.warn('[Push] Server unsubscribe failed:', e.message);
            }
        }
        console.log('[Push] Unsubscribed');
        return true;
    };

    // ── Test push ─────────────────────────────────────────────────────
    window.pushTestSend = async function () {
        if (!window.S?.currentUser?.access_token) throw new Error('Not logged in');
        const res = await fetch(workerUrl('/push/test'), {
            method: 'POST',
            headers: authHeaders()
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || `HTTP ${res.status}`);
        }
        return true;
    };

    // ── Load devices list ─────────────────────────────────────────────
    window.pushLoadDevices = async function () {
        if (!window.S?.currentUser?.access_token) return [];
        try {
            const res = await fetch(workerUrl('/push/devices'), {
                method: 'GET',
                headers: authHeaders()
            });
            if (!res.ok) return [];
            const data = await res.json();
            return Array.isArray(data) ? data : (data.devices || []);
        } catch (_) { return []; }
    };

    // ── Delete a specific device subscription ─────────────────────────
    window.pushDeleteDevice = async function (subId) {
        if (!window.S?.currentUser?.access_token) return false;
        try {
            const res = await fetch(workerUrl('/push/devices/' + subId), {
                method: 'DELETE',
                headers: authHeaders()
            });
            return res.ok;
        } catch (_) { return false; }
    };

    // ══════════════════════════════════════════════════════════════════
    // AUTO-RESUBSCRIBE — runs on every page load when logged in.
    // Refreshes the server record (endpoint may have rotated, or the
    // user may have logged in on a device that was already subscribed
    // by another account).
    // ══════════════════════════════════════════════════════════════════
    window.pushAutoResubscribe = async function () {
        if (!window.pushSupported()) return;
        if (Notification.permission !== 'granted') return;
        if (!window.S?.currentUser?.access_token) return;

        try {
            const reg = await navigator.serviceWorker.ready;
            const sub = await reg.pushManager.getSubscription();
            if (!sub) return; // user explicitly unsubscribed — respect that

            const j = sub.toJSON();
            await fetch(workerUrl('/push/subscribe'), {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({
                    endpoint:     j.endpoint,
                    p256dh:       j.keys.p256dh,
                    auth:         j.keys.auth,
                    user_agent:   navigator.userAgent,
                    device_label: getDeviceLabel()
                })
            });
            console.log('[Push] Auto-resubscribe OK');
        } catch (e) {
            console.warn('[Push] Auto-resubscribe failed:', e.message);
        }
    };

    // ══════════════════════════════════════════════════════════════════
    // SETTINGS PANEL — renders the 🔔 Push Notifications section
    // ══════════════════════════════════════════════════════════════════
    window.pushRenderSettings = async function () {
        const container = document.getElementById('pushSettingsContent');
        if (!container) return;

        const supported  = window.pushSupported();
        const permission = window.pushPermission();
        const subscribed = supported ? await window.pushIsSubscribed() : false;

        // iOS detection — push only works when installed to home screen
        const isIOS       = /iPhone|iPad|iPod/.test(navigator.userAgent);
        const isStandalone = window.matchMedia('(display-mode: standalone)').matches
                          || window.navigator.standalone === true;
        const iosNeedsPWA  = isIOS && !isStandalone;

        let html = '';

        // ── Status + action button ────────────────────────────────────
        if (!supported) {
            html += `<div style="color:var(--danger);font-size:.78rem;padding:6px 0;">❌ ${i18n.get('pushNotSupported')}</div>`;
        } else if (permission === 'denied') {
            html += `<div style="color:var(--danger);font-size:.78rem;padding:6px 0;">🚫 ${i18n.get('pushBlocked')}</div>`;
        } else if (subscribed) {
            html += `<div style="color:var(--success);font-size:.78rem;padding:6px 0;">✅ ${i18n.get('pushActiveDevice')}</div>`;
            html += `<div style="display:flex;gap:8px;margin-top:6px;">`;
            html += `<button onclick="pushTestClick()" class="btn-ghost" style="flex:1;padding:8px;font-size:.78rem;">🔔 ${i18n.get('pushTestBtn')}</button>`;
            html += `<button onclick="pushToggle(false)" class="btn-ghost" style="flex:1;padding:8px;font-size:.78rem;color:var(--danger);border-color:rgba(239,68,68,.3);">🔕 ${i18n.get('pushDisableBtn')}</button>`;
            html += `</div>`;
        } else {
            html += `<div style="color:var(--text-soft);font-size:.78rem;padding:6px 0;">💤 ${i18n.get('pushInactiveDevice')}</div>`;
            html += `<button onclick="pushToggle(true)" class="btn-primary" style="width:100%;padding:10px;font-size:.82rem;margin-top:4px;">🔔 ${i18n.get('pushEnableBtn')}</button>`;
        }

        // ── iOS hint ──────────────────────────────────────────────────
        if (iosNeedsPWA) {
            html += `<div style="font-size:.72rem;color:var(--warning);background:rgba(234,179,8,.08);border-radius:8px;padding:8px 10px;margin-top:8px;line-height:1.5;">📲 ${i18n.get('pushIosHint')}</div>`;
        }

        // ── Message area + devices list placeholder ───────────────────
        html += `<div id="pushMsg" style="font-size:.78rem;min-height:18px;margin-top:8px;"></div>`;
        html += `<div id="pushDevicesList" style="margin-top:10px;"></div>`;

        container.innerHTML = html;

        // ── Load devices list if relevant ─────────────────────────────
        if (supported && permission === 'granted') {
            _renderDevicesList();
        }
    };

    // ── Devices list rendering ────────────────────────────────────────
    async function _renderDevicesList() {
        const el = document.getElementById('pushDevicesList');
        if (!el) return;

        try {
            const devices = await window.pushLoadDevices();
            if (!devices.length) { el.innerHTML = ''; return; }

            let html = `<div style="font-size:.76rem;color:var(--text-soft);font-weight:600;margin-bottom:6px;">${i18n.get('pushDevicesTitle')} (${devices.length})</div>`;
            for (const d of devices) {
                const label = escapeHtml(d.device_label || 'Unknown');
                const ago   = timeAgo(d.last_seen_at);
                html += `
                <div style="display:flex;align-items:center;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border);font-size:.74rem;">
                    <div style="min-width:0;">
                        <div style="color:var(--text-main);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${label}</div>
                        <div style="color:var(--text-soft);font-size:.68rem;">${ago}</div>
                    </div>
                    <button onclick="pushRemoveDevice('${d.id}')" style="background:none;border:none;color:var(--danger);cursor:pointer;font-size:.85rem;padding:2px 8px;flex-shrink:0;" title="${i18n.get('pushRemoveConfirm')}">🗑</button>
                </div>`;
            }
            el.innerHTML = html;
        } catch (_) {
            el.innerHTML = '';
        }
    }

    // ══════════════════════════════════════════════════════════════════
    // UI EVENT HANDLERS (called from onclick in settings panel)
    // ══════════════════════════════════════════════════════════════════

    window.pushToggle = async function (enable) {
        const msg = document.getElementById('pushMsg');
        try {
            if (enable) {
                if (msg) msg.innerHTML = `<span style="color:var(--text-soft);">${i18n.get('pushEnabling')}</span>`;
                await window.pushSubscribe();
                if (msg) msg.innerHTML = `<span style="color:var(--success);">✅ ${i18n.get('pushEnabled')}</span>`;
            } else {
                if (msg) msg.innerHTML = `<span style="color:var(--text-soft);">${i18n.get('pushDisabling')}</span>`;
                await window.pushUnsubscribe();
                if (msg) msg.innerHTML = `<span style="color:var(--success);">✅ ${i18n.get('pushDisabled')}</span>`;
            }
            setTimeout(() => window.pushRenderSettings(), 1000);
        } catch (e) {
            if (msg) msg.innerHTML = `<span style="color:var(--danger);">❌ ${e.message}</span>`;
        }
    };

    window.pushTestClick = async function () {
        const msg = document.getElementById('pushMsg');
        try {
            if (msg) msg.innerHTML = `<span style="color:var(--text-soft);">${i18n.get('pushTestSending')}</span>`;
            await window.pushTestSend();
            if (msg) msg.innerHTML = `<span style="color:var(--success);">✅ ${i18n.get('pushTestSuccess')}</span>`;
        } catch (e) {
            if (msg) msg.innerHTML = `<span style="color:var(--danger);">❌ ${i18n.get('pushTestFailed')}: ${e.message}</span>`;
        }
    };

    window.pushRemoveDevice = async function (subId) {
        if (!confirm(i18n.get('pushRemoveConfirm'))) return;
        const ok = await window.pushDeleteDevice(subId);
        if (ok) _renderDevicesList();
    };

    // ══════════════════════════════════════════════════════════════════
    // SERVICE WORKER MESSAGE LISTENER
    // Handles notification-click deep links and resubscribe requests
    // ══════════════════════════════════════════════════════════════════
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.addEventListener('message', (e) => {
            if (!e.data?.kind) return;

            // User tapped a notification → deep-link to vessel
            if (e.data.kind === 'notification-click') {
                const imo = e.data.data?.imo;
                if (imo && window.openVesselCard) {
                    window.openVesselCard(imo);
                } else if (imo && window.scrollToVessel) {
                    window.scrollToVessel(imo);
                }
            }

            // Browser rotated push keys → re-register silently
            if (e.data.kind === 'push-resubscribe-needed') {
                console.log('[Push] Resubscribe requested by SW');
                window.pushAutoResubscribe();
            }
        });
    }

    console.log('[Push] Module loaded');
})();
