/**
 * Input checks for the push endpoints. Everything here crosses a trust
 * boundary: subscriptions come from a browser, labels and names come from a
 * peer over the data channel.
 */

import { b64urlToBytes } from '$lib/bytes';
import type { PushSubscriptionRecord } from './send';

/** Longest nickname or partner label we will store or display. */
export const MAX_NAME = 24;

/** Control characters, which have no place in a name but plenty of uses. */
const CONTROL = /[\u0000-\u001f\u007f]/g;

/**
 * Strip control characters and clamp the length. Applied on the way in AND on
 * the way out: a nickname reaches both the game board and a notification
 * title, and neither should be at the mercy of whatever a peer sent.
 */
export function cleanName(value: unknown, fallback = 'Player'): string {
	if (typeof value !== 'string') return fallback;
	const cleaned = value.replace(CONTROL, '').trim().slice(0, MAX_NAME);
	return cleaned || fallback;
}

/**
 * Accept a `PushSubscription.toJSON()` only if it is shaped like a real one:
 * an https endpoint of sane length, a 65-byte public point and a 16-byte auth
 * secret. Anything else would fail later inside the crypto anyway.
 */
export function readSubscription(value: unknown): PushSubscriptionRecord | null {
	if (!value || typeof value !== 'object') return null;
	const sub = value as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
	const endpoint = sub.endpoint;
	if (typeof endpoint !== 'string' || endpoint.length > 1024) return null;
	try {
		if (new URL(endpoint).protocol !== 'https:') return null;
	} catch {
		return null;
	}
	const p256dh = sub.keys?.p256dh;
	const auth = sub.keys?.auth;
	if (typeof p256dh !== 'string' || typeof auth !== 'string') return null;
	if (byteLength(p256dh) !== 65 || byteLength(auth) !== 16) return null;
	return { endpoint, keys: { p256dh, auth } };
}

function byteLength(b64url: string): number {
	try {
		return b64urlToBytes(b64url).length;
	} catch {
		return -1;
	}
}
