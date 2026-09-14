/**
 * Server-side records behind push invites, in Netlify Blobs.
 *
 * Three kinds of record:
 *   dev/<did>              a device and its push subscription
 *   ep/<hash(endpoint)>    endpoint → device, for `pushsubscriptionchange`
 *   tok/<hash(token)>      one partner's capability to invite that device
 *
 * Tokens are stored hashed, so a leak of the store yields no working
 * capability. A device id is a handle its own owner uses to manage itself;
 * a token is a bearer secret held by exactly one partner.
 */

import { getStore } from '@netlify/blobs';
import { bytesToB64url, buf, utf8 } from '$lib/bytes';
import type { PushSubscriptionRecord } from './send';

/** Most partners one device can hand out invite rights to. */
export const MAX_TOKENS_PER_DEVICE = 20;
/** Quiet period between two invites on the same token. */
export const INVITE_COOLDOWN_MS = 30_000;
export const MAX_INVITES_PER_TOKEN_PER_DAY = 20;
/** Ceiling across every partner, so one device can't be buried in invites. */
export const MAX_PUSHES_PER_DEVICE_PER_DAY = 40;
/** A device nobody has opened in this long is assumed abandoned. */
export const DEVICE_IDLE_DAYS = 180;

export interface Counter {
	day: string;
	n: number;
	lastAt?: number;
}

export interface DeviceRecord {
	sub: PushSubscriptionRecord;
	createdAt: number;
	lastSeenAt: number;
	/** Hashes of the tokens this device minted, so deleting it revokes them all. */
	tokens: string[];
	/** Pushes received today, across all partners. */
	rx: Counter;
}

export interface TokenRecord {
	did: string;
	/** The name the minting device gave this partner. Server-pinned: it is what
	 *  the notification says, so a token holder can't choose their own label. */
	label: string;
	createdAt: number;
	/** Invites sent on this token today. */
	tx: Counter;
}

const store = () => getStore({ name: 'millebornes-push', consistency: 'strong' });

/* ---- keys -------------------------------------------------------------- */

/** Opaque 32-byte identifier, URL-safe. Used for device ids and tokens. */
export const mintSecret = (): string => bytesToB64url(crypto.getRandomValues(new Uint8Array(32)));

export async function hashKey(value: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', buf(utf8(value)));
	return bytesToB64url(new Uint8Array(digest));
}

/* ---- records ----------------------------------------------------------- */

export async function getDevice(did: string): Promise<DeviceRecord | null> {
	return (await store().get(`dev/${did}`, { type: 'json' })) as DeviceRecord | null;
}

export async function putDevice(did: string, rec: DeviceRecord): Promise<void> {
	await store().setJSON(`dev/${did}`, rec);
}

/** Remove a device, its endpoint index and every capability it handed out. */
export async function deleteDevice(did: string): Promise<void> {
	const s = store();
	const rec = await getDevice(did);
	if (rec) {
		await s.delete(`ep/${await hashKey(rec.sub.endpoint)}`);
		for (const hash of rec.tokens) await s.delete(`tok/${hash}`);
	}
	await s.delete(`dev/${did}`);
}

export async function getToken(hash: string): Promise<TokenRecord | null> {
	return (await store().get(`tok/${hash}`, { type: 'json' })) as TokenRecord | null;
}

export async function putToken(hash: string, rec: TokenRecord): Promise<void> {
	await store().setJSON(`tok/${hash}`, rec);
}

export async function deleteToken(hash: string): Promise<void> {
	await store().delete(`tok/${hash}`);
}

export async function findDeviceByEndpoint(endpoint: string): Promise<string | null> {
	const rec = (await store().get(`ep/${await hashKey(endpoint)}`, { type: 'json' })) as {
		did: string;
	} | null;
	return rec?.did ?? null;
}

export async function indexEndpoint(endpoint: string, did: string): Promise<void> {
	await store().setJSON(`ep/${await hashKey(endpoint)}`, { did });
}

export async function unindexEndpoint(endpoint: string): Promise<void> {
	await store().delete(`ep/${await hashKey(endpoint)}`);
}

/* ---- rate limiting ------------------------------------------------------ */

/**
 * Bump a daily counter, or report that the ceiling is reached.
 *
 * Best-effort by construction: Blobs has no atomic increment, so two requests
 * racing can both pass. The real gate on inviting is holding a token at all —
 * this only keeps a legitimate one from being used as a firehose.
 */
export function spend(counter: Counter | undefined, limit: number, now = Date.now()): Counter | null {
	const day = new Date(now).toISOString().slice(0, 10);
	const current = counter?.day === day ? counter : { day, n: 0 };
	if (current.n >= limit) return null;
	return { day, n: current.n + 1, lastAt: now };
}

/** True while a token is still inside its cooldown window. */
export const tooSoon = (tx: Counter | undefined, now = Date.now()): boolean =>
	tx?.lastAt !== undefined && now - tx.lastAt < INVITE_COOLDOWN_MS;

export const isIdle = (rec: DeviceRecord, now = Date.now()): boolean =>
	now - rec.lastSeenAt > DEVICE_IDLE_DAYS * 86_400_000;
