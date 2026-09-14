/**
 * The browser half of push: permission, subscription, and the calls that mint,
 * withdraw and spend invite capabilities.
 *
 * Everything here is best-effort. Notifications are a convenience on top of
 * the room-code flow, so a failure anywhere returns a value the caller can
 * shrug off rather than throwing.
 */

import { browser } from '$app/environment';
import { b64urlToBytes, bytesToB64url, buf } from '$lib/bytes';
import { setStoredDid } from './swkv';

export type InviteResult = 'ok' | 'gone' | 'rate-limited' | 'no-room' | 'error';

export const pushSupported = (): boolean =>
	browser && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

/**
 * iOS only allows push for an app added to the Home Screen — in a Safari tab
 * the permission prompt never appears, so the UI has to say so instead.
 */
export const isStandalone = (): boolean =>
	browser &&
	(window.matchMedia('(display-mode: standalone)').matches ||
		(navigator as { standalone?: boolean }).standalone === true);

export const isIos = (): boolean =>
	browser && /iPad|iPhone|iPod/.test(navigator.userAgent) && !('MSStream' in window);

export const permission = (): NotificationPermission | 'unsupported' =>
	pushSupported() ? Notification.permission : 'unsupported';

/**
 * Subscribe this device and register it with the server, returning its id.
 *
 * Must be called from a click handler: it may show the browser's one-and-only
 * permission prompt, and browsers require a user gesture for that.
 */
export async function enablePush(did: string | null): Promise<string | null> {
	if (!pushSupported()) return null;

	const key = await serverKey();
	if (!key) return null;

	if (Notification.permission === 'default') {
		if ((await Notification.requestPermission()) !== 'granted') return null;
	}
	if (Notification.permission !== 'granted') return null;

	try {
		const reg = await navigator.serviceWorker.ready;
		let sub = await reg.pushManager.getSubscription();

		// A subscription is bound to the key it was made with, so a rotated
		// server key means the old one can never be delivered to again.
		if (sub && !matchesKey(sub, key)) {
			await sub.unsubscribe();
			sub = null;
		}
		sub ??= await reg.pushManager.subscribe({
			userVisibleOnly: true,
			applicationServerKey: buf(b64urlToBytes(key))
		});

		const res = await fetch('/api/push/device', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ did, sub: sub.toJSON() })
		});
		if (!res.ok) return null;
		const fresh = ((await res.json()) as { did: string }).did;
		await setStoredDid(fresh);
		return fresh;
	} catch {
		return null;
	}
}

/**
 * Refresh the server's copy of this device's subscription, without ever
 * prompting. Safe to call on every app start.
 */
export async function refreshDevice(did: string | null): Promise<string | null> {
	if (!pushSupported() || Notification.permission !== 'granted') return null;
	try {
		const reg = await navigator.serviceWorker.ready;
		const sub = await reg.pushManager.getSubscription();
		if (!sub) return null;
		const res = await fetch('/api/push/device', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ did, sub: sub.toJSON() })
		});
		if (!res.ok) return null;
		const fresh = ((await res.json()) as { did: string }).did;
		await setStoredDid(fresh);
		return fresh;
	} catch {
		return null;
	}
}

/** Stop receiving invites entirely, and drop every capability we issued. */
export async function disablePush(did: string | null): Promise<void> {
	try {
		const reg = await navigator.serviceWorker.ready;
		await (await reg.pushManager.getSubscription())?.unsubscribe();
	} catch {
		/* already gone */
	}
	if (did) {
		await fetch(`/api/push/device?did=${encodeURIComponent(did)}`, { method: 'DELETE' }).catch(
			() => {}
		);
	}
	await setStoredDid(null);
}

/** Mint the capability we hand to one partner so they can invite us. */
export async function mintToken(did: string, label: string): Promise<string | null> {
	try {
		const res = await fetch('/api/push/token', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ did, label })
		});
		if (!res.ok) return null;
		return ((await res.json()) as { token: string }).token;
	} catch {
		return null;
	}
}

/** Withdraw a capability. `true` also for "already gone", which is the goal. */
export async function revokeToken(did: string, token: string): Promise<boolean> {
	try {
		const res = await fetch('/api/push/token', {
			method: 'DELETE',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ did, token })
		});
		return res.ok || res.status === 404;
	} catch {
		return false;
	}
}

/** Notify a partner that a room is open and waiting for them. */
export async function sendInvite(token: string, code: string): Promise<InviteResult> {
	try {
		const res = await fetch('/api/push/invite', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ token, code })
		});
		if (res.ok) return 'ok';
		if (res.status === 404 || res.status === 410) return 'gone';
		if (res.status === 429) return 'rate-limited';
		if (res.status === 400) return 'no-room';
		return 'error';
	} catch {
		return 'error';
	}
}

async function serverKey(): Promise<string | null> {
	try {
		const res = await fetch('/api/push/key');
		if (!res.ok) return null;
		return ((await res.json()) as { key: string }).key;
	} catch {
		return null;
	}
}

function matchesKey(sub: PushSubscription, key: string): boolean {
	const raw = sub.options?.applicationServerKey;
	if (!raw) return false;
	return bytesToB64url(new Uint8Array(raw)) === key;
}
