/**
 * Posting one encrypted message to a push service.
 *
 * This is the only module that talks to the outside world, which keeps the
 * endpoints testable by mocking it — and leaves a single seam to swap in the
 * `web-push` package if hand-rolled crypto ever becomes a liability.
 */

import { buf, utf8 } from '$lib/bytes';
import { encryptPayload, type SubscriptionKeys } from './encrypt';
import { vapidAuthHeader, type VapidConfig } from './vapid';

export interface PushSubscriptionRecord {
	endpoint: string;
	keys: SubscriptionKeys;
}

/** `gone` means the subscription is dead and its records should be pruned. */
export type SendResult = { ok: true } | { gone: true } | { error: string };

export interface SendOptions {
	/** Collapse key: a newer message with the same topic replaces an undelivered one. */
	topic?: string;
	/** Seconds the push service should hold an undelivered message. */
	ttl?: number;
}

export async function sendPush(
	sub: PushSubscriptionRecord,
	payload: string,
	vapid: VapidConfig,
	opts: SendOptions = {}
): Promise<SendResult> {
	let body: Uint8Array;
	let auth: string;
	try {
		body = await encryptPayload(utf8(payload), sub.keys);
		auth = await vapidAuthHeader(sub.endpoint, vapid);
	} catch (e) {
		return { error: e instanceof Error ? e.message : 'could not build the push request' };
	}

	const headers: Record<string, string> = {
		authorization: auth,
		'content-encoding': 'aes128gcm',
		'content-type': 'application/octet-stream',
		ttl: String(opts.ttl ?? 900),
		urgency: 'high'
	};
	if (opts.topic) headers.topic = opts.topic;

	let res: Response;
	try {
		res = await fetch(sub.endpoint, { method: 'POST', headers, body: buf(body) });
	} catch {
		return { error: 'could not reach the push service' };
	}

	if (res.ok) return { ok: true };
	// The subscriber unsubscribed, or the browser dropped the registration.
	if (res.status === 404 || res.status === 410) return { gone: true };
	return { error: `push service returned ${res.status}` };
}
