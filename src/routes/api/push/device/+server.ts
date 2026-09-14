import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { readJson, str } from '$lib/server/http';
import { readSubscription } from '$lib/push/validate';
import {
	deleteDevice,
	findDeviceByEndpoint,
	getDevice,
	indexEndpoint,
	mintSecret,
	putDevice,
	unindexEndpoint
} from '$lib/push/store';

/**
 * A device registering the push subscription its browser handed it.
 *
 * The device id it gets back is a handle for managing itself — refreshing the
 * subscription, minting capabilities, unsubscribing. It is never shared with a
 * peer; peers only ever hold tokens, which point here indirectly.
 */
export const prerender = false;

export const POST: RequestHandler = async ({ request }) => {
	const body = await readJson(request);
	const sub = readSubscription(body.sub);
	if (!sub) return json({ error: 'a valid subscription is required' }, { status: 400 });

	// Three ways to recognise a returning device, in descending confidence. The
	// middle one is how `pushsubscriptionchange` reconnects a device whose
	// endpoint the browser has just replaced.
	const claimed = str(body.did);
	const previous = str(body.oldEndpoint);
	const did =
		(claimed && (await getDevice(claimed)) ? claimed : null) ??
		(previous ? await findDeviceByEndpoint(previous) : null) ??
		(await findDeviceByEndpoint(sub.endpoint));

	const now = Date.now();
	const existing = did ? await getDevice(did) : null;
	if (did && existing) {
		// The browser may have handed out a new endpoint; move the index with it.
		if (existing.sub.endpoint !== sub.endpoint) await unindexEndpoint(existing.sub.endpoint);
		await putDevice(did, { ...existing, sub, lastSeenAt: now });
		await indexEndpoint(sub.endpoint, did);
		return json({ did });
	}

	const fresh = mintSecret();
	await putDevice(fresh, {
		sub,
		createdAt: now,
		lastSeenAt: now,
		tokens: [],
		rx: { day: '', n: 0 }
	});
	await indexEndpoint(sub.endpoint, fresh);
	return json({ did: fresh });
};

/** Turning notifications off: drops the device and every capability it issued. */
export const DELETE: RequestHandler = async ({ url }) => {
	const did = url.searchParams.get('did');
	if (!did) return json({ error: 'did required' }, { status: 400 });
	await deleteDevice(did);
	return json({ ok: true });
};
