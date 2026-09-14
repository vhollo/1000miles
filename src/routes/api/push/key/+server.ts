import { json } from '@sveltejs/kit';
import { vapidConfig } from '$lib/push/config.server';

/**
 * Hands the client the application server key it must subscribe with.
 *
 * Served rather than baked in at build time, so rotating the key doesn't need
 * a rebuild — and so the client can notice a mismatch and re-subscribe.
 */
export const prerender = false;

export const GET = async () => {
	const cfg = vapidConfig();
	if (!cfg) return json({ error: 'push is not configured' }, { status: 503 });
	return json({ key: cfg.publicKey });
};
