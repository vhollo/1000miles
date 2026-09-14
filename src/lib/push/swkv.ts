/**
 * A one-key store the page and the service worker can both reach.
 *
 * The worker needs this device's id to re-register a subscription the browser
 * has replaced, but a worker has no `localStorage`. Cache Storage is the only
 * thing both sides share, so the device id is parked there as a tiny response.
 *
 * Eviction is survivable: the page rewrites it on every load.
 */

const CACHE = 'millebornes-kv';
const DID_URL = '/kv/did';

export async function setStoredDid(did: string | null): Promise<void> {
	try {
		const cache = await caches.open(CACHE);
		if (did === null) await cache.delete(DID_URL);
		else await cache.put(DID_URL, new Response(did, { headers: { 'content-type': 'text/plain' } }));
	} catch {
		/* no Cache Storage (private mode) — the page will re-register instead */
	}
}

export async function getStoredDid(): Promise<string | null> {
	try {
		const hit = await (await caches.open(CACHE)).match(DID_URL);
		return hit ? await hit.text() : null;
	} catch {
		return null;
	}
}
