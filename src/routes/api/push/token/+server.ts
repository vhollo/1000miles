import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { readJson, str } from '$lib/server/http';
import { cleanName } from '$lib/push/validate';
import {
	MAX_TOKENS_PER_DEVICE,
	deleteToken,
	getDevice,
	getToken,
	hashKey,
	mintSecret,
	putDevice,
	putToken
} from '$lib/push/store';

/**
 * Capabilities: one token per partner, handed to them over the data channel.
 *
 * Holding a token is the only way to notify the device that minted it, which
 * is why a peer id is safe to broadcast and a token is not. Each is revocable
 * on its own, so dropping one partner doesn't disturb the rest.
 */
export const prerender = false;

export const POST: RequestHandler = async ({ request }) => {
	const body = await readJson(request);
	const did = str(body.did);
	if (!did) return json({ error: 'did required' }, { status: 400 });

	const device = await getDevice(did);
	if (!device) return json({ error: 'unknown device' }, { status: 404 });
	if (device.tokens.length >= MAX_TOKENS_PER_DEVICE) {
		return json({ error: 'too many partners' }, { status: 429 });
	}

	const token = mintSecret();
	const hash = await hashKey(token);
	// The label is fixed here, by the person who will receive the notifications.
	// It is what they will read, so the holder can't choose their own billing.
	await putToken(hash, {
		did,
		label: cleanName(body.label, 'A friend'),
		createdAt: Date.now(),
		tx: { day: '', n: 0 }
	});
	await putDevice(did, { ...device, tokens: [...device.tokens, hash] });

	return json({ token });
};

export const DELETE: RequestHandler = async ({ request }) => {
	const body = await readJson(request);
	const did = str(body.did);
	const token = str(body.token);
	if (!did || !token) return json({ error: 'did and token required' }, { status: 400 });

	const hash = await hashKey(token);
	const record = await getToken(hash);
	// Only the device that issued a capability may withdraw it.
	if (!record || record.did !== did) return json({ error: 'unknown token' }, { status: 404 });

	await deleteToken(hash);
	const device = await getDevice(did);
	if (device) await putDevice(did, { ...device, tokens: device.tokens.filter((t) => t !== hash) });

	return json({ ok: true });
};
