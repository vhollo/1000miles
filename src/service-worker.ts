/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

import { build, files, prerendered, version } from '$service-worker';
import { getStoredDid } from '$lib/push/swkv';

const sw = self as unknown as ServiceWorkerGlobalScope;

const CACHE = `millebornes-${version}`;
const ASSETS = [...build, ...files, ...prerendered];

sw.addEventListener('install', (event) => {
	event.waitUntil(
		(async () => {
			const cache = await caches.open(CACHE);
			await cache.addAll(ASSETS);
			// On the very first install nothing is running yet, so take over at
			// once. For an update we wait: swapping under a live page would pull
			// the build assets it is still using out from under it. The client
			// activates us with SKIP_WAITING when it is ready to reload.
			if (!sw.registration.active) await sw.skipWaiting();
		})()
	);
});

// Sent by the client (see `$lib/pwa.svelte.ts`) once it is ready to reload.
sw.addEventListener('message', (event) => {
	if ((event.data as { type?: string } | null)?.type === 'SKIP_WAITING') sw.skipWaiting();
});

sw.addEventListener('activate', (event) => {
	event.waitUntil(
		(async () => {
			for (const key of await caches.keys()) {
				if (key !== CACHE) await caches.delete(key);
			}
			await sw.clients.claim();
		})()
	);
});

sw.addEventListener('fetch', (event) => {
	if (event.request.method !== 'GET') return;

	const url = new URL(event.request.url);
	if (url.origin !== location.origin) return; // let the font CDN etc. pass through
	// Signalling, ICE and push are live state — a cached copy is at best stale
	// and at worst a room that closed minutes ago.
	if (url.pathname.startsWith('/api/')) return;

	event.respondWith(
		(async () => {
			const cache = await caches.open(CACHE);

			// Precached build assets are immutable — serve them from cache first.
			if (ASSETS.includes(url.pathname)) {
				const hit = await cache.match(url.pathname);
				if (hit) return hit;
			}

			try {
				const res = await fetch(event.request);
				if (res.ok && res.type === 'basic') cache.put(event.request, res.clone());
				return res;
			} catch {
				const hit = await cache.match(event.request);
				if (hit) return hit;
				// Offline SPA fallback for client-side navigations.
				if (event.request.mode === 'navigate') {
					const shell = (await cache.match('/')) ?? (await cache.match('/index.html'));
					if (shell) return shell;
				}
				throw new Error('offline: resource not cached');
			}
		})()
	);
});

/* ---- push invites ------------------------------------------------------- */

/**
 * A partner has opened a room and wants us in it.
 *
 * Always shows something: browsers treat a silent push as an abuse of the
 * permission and will eventually withdraw it. If the payload is missing or
 * unreadable (some services deliver a bare wake-up), the notification still
 * says enough to be worth tapping.
 */
sw.addEventListener('push', (event) => {
	event.waitUntil(
		(async () => {
			let data: { code?: unknown; from?: unknown; pid?: unknown } = {};
			try {
				data = event.data ? (event.data.json() as typeof data) : {};
			} catch {
				/* not our payload — fall through to the generic notice */
			}

			const from = typeof data.from === 'string' ? data.from.slice(0, 24) : 'A friend';
			const code = typeof data.code === 'string' && /^\d{4}$/.test(data.code) ? data.code : null;
			const pid = typeof data.pid === 'string' ? data.pid.slice(0, 16) : 'x';

			await sw.registration.showNotification(`${from} wants to play`, {
				body: code ? 'Tap to join the game.' : 'Open Mille Bornes to join.',
				icon: '/icons/icon-192.png',
				badge: '/icons/icon-badge-96.png',
				// One live invite per partner: a newer one replaces the last.
				tag: `mb-invite-${pid}`,
				// The name rides along so an expired invite can offer to invite back.
				data: {
					url: code ? `/online#c=${code}&n=${encodeURIComponent(from)}` : '/online',
					code,
					from
				}
			});
		})()
	);
});

/**
 * Tapping the notification.
 *
 * If the app is already open, focus it and hand the invite over rather than
 * navigating: the page may be mid-game and needs to ask before abandoning it.
 */
sw.addEventListener('notificationclick', (event) => {
	event.notification.close();
	const data = (event.notification.data ?? {}) as { url?: string; code?: string; from?: string };

	event.waitUntil(
		(async () => {
			const windows = await sw.clients.matchAll({ type: 'window', includeUncontrolled: true });
			for (const client of windows) {
				if (new URL(client.url).origin !== location.origin) continue;
				await client.focus();
				client.postMessage({ type: 'MB_INVITE', code: data.code, from: data.from });
				return;
			}
			await sw.clients.openWindow(data.url ?? '/online');
		})()
	);
});

/**
 * The browser replaced our subscription. Re-subscribe with the same server key
 * and tell the server where we moved to, quoting the old endpoint so it can
 * find the existing device rather than creating a second one.
 */
sw.addEventListener('pushsubscriptionchange', (event) => {
	const change = event as PushSubscriptionChangeEvent;
	event.waitUntil(
		(async () => {
			try {
				const res = await fetch('/api/push/key');
				if (!res.ok) return;
				const { key } = (await res.json()) as { key: string };

				const sub = await sw.registration.pushManager.subscribe({
					userVisibleOnly: true,
					applicationServerKey: key
				});
				await fetch('/api/push/device', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({
						did: await getStoredDid(),
						oldEndpoint: change.oldSubscription?.endpoint,
						sub: sub.toJSON()
					})
				});
			} catch {
				// Nothing more to try from here; the page re-registers on next open.
			}
		})()
	);
});

/** Not in the DOM typings yet. */
interface PushSubscriptionChangeEvent extends ExtendableEvent {
	readonly oldSubscription: PushSubscription | null;
	readonly newSubscription: PushSubscription | null;
}
