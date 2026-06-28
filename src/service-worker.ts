/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

import { build, files, prerendered, version } from '$service-worker';

const sw = self as unknown as ServiceWorkerGlobalScope;

const CACHE = `millebornes-${version}`;
const ASSETS = [...build, ...files, ...prerendered];

sw.addEventListener('install', (event) => {
	event.waitUntil(
		caches
			.open(CACHE)
			.then((cache) => cache.addAll(ASSETS))
			.then(() => sw.skipWaiting())
	);
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
