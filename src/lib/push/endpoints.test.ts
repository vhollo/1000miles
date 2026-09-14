import { describe, it, expect, vi, beforeEach } from 'vitest';
import { bytesToB64url } from '../bytes';

// In-memory stand-in for Netlify Blobs, same shape as the signalling test's.
const { mem } = vi.hoisted(() => ({ mem: new Map<string, string>() }));
vi.mock('@netlify/blobs', () => ({
	getStore: () => ({
		async setJSON(k: string, v: unknown, opts?: { onlyIfNew?: boolean }) {
			if (opts?.onlyIfNew && mem.has(k)) return { modified: false };
			mem.set(k, JSON.stringify(v));
			return { modified: true };
		},
		async get(k: string) {
			const v = mem.get(k);
			return v ? JSON.parse(v) : null;
		},
		async delete(k: string) {
			mem.delete(k);
		}
	})
}));

// The real one reads `$env/dynamic/private`, which only exists inside SvelteKit.
vi.mock('$lib/push/config.server', () => ({
	vapidConfig: () => ({ publicKey: 'pub', privateKey: 'priv', subject: 'mailto:t@example.com' })
}));

const { sent } = vi.hoisted(() => ({ sent: [] as { payload: string; topic?: string }[] }));
const { sendResult } = vi.hoisted(() => ({ sendResult: { current: { ok: true } as unknown } }));
vi.mock('$lib/push/send', () => ({
	sendPush: async (_sub: unknown, payload: string, _cfg: unknown, opts?: { topic?: string }) => {
		sent.push({ payload, topic: opts?.topic });
		return sendResult.current;
	}
}));

import { POST as devicePOST, DELETE as deviceDELETE } from '../../routes/api/push/device/+server';
import { POST as tokenPOST, DELETE as tokenDELETE } from '../../routes/api/push/token/+server';
import { POST as invitePOST } from '../../routes/api/push/invite/+server';
import { allocRoom } from '../net/room-store.server';
import { MAX_TOKENS_PER_DEVICE } from './store';

/* ---- fixtures ---------------------------------------------------------- */

const subscription = (endpoint = 'https://push.example.com/abc') => ({
	endpoint,
	keys: {
		// A 65-byte uncompressed point and a 16-byte auth secret, as a browser gives.
		p256dh: bytesToB64url(Uint8Array.from({ length: 65 }, (_, i) => (i === 0 ? 4 : i))),
		auth: bytesToB64url(new Uint8Array(16).fill(7))
	}
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ev = (body: unknown, query = ''): any => ({
	url: new URL(`http://x/api/push${query}`),
	request: new Request('http://x/api/push', { method: 'POST', body: JSON.stringify(body) })
});

const registerDevice = async (endpoint?: string) =>
	(await (await devicePOST(ev({ sub: subscription(endpoint) }))).json()).did as string;

const mintToken = async (did: string, label: string) =>
	(await (await tokenPOST(ev({ did, label }))).json()).token as string;

/* ---- tests ------------------------------------------------------------- */

describe('push device endpoint', () => {
	beforeEach(() => {
		mem.clear();
		sent.length = 0;
		sendResult.current = { ok: true };
	});

	it('registers a device once and recognises it by endpoint on the way back', async () => {
		const first = await registerDevice();
		const again = await registerDevice();
		expect(again).toBe(first); // not a second device for the same browser
	});

	it('follows a device to a new endpoint after the browser replaces it', async () => {
		const did = await registerDevice('https://push.example.com/old');
		const moved = await (
			await devicePOST(
				ev({ sub: subscription('https://push.example.com/new'), oldEndpoint: 'https://push.example.com/old' })
			)
		).json();
		expect(moved.did).toBe(did);
	});

	it('rejects anything that is not a real subscription', async () => {
		expect((await devicePOST(ev({}))).status).toBe(400);
		expect((await devicePOST(ev({ sub: { endpoint: 'http://insecure/x' } }))).status).toBe(400);
		const short = { ...subscription(), keys: { ...subscription().keys, auth: bytesToB64url(new Uint8Array(8)) } };
		expect((await devicePOST(ev({ sub: short }))).status).toBe(400);
	});
});

describe('push token endpoint', () => {
	beforeEach(() => {
		mem.clear();
		sent.length = 0;
		sendResult.current = { ok: true };
	});

	it('mints a capability for a known device only', async () => {
		expect((await tokenPOST(ev({ did: 'nope', label: 'Bob' }))).status).toBe(404);
		const did = await registerDevice();
		expect(await mintToken(did, 'Bob')).toMatch(/^[A-Za-z0-9_-]+$/);
	});

	it('caps how many partners one device can hand rights to', async () => {
		const did = await registerDevice();
		for (let i = 0; i < MAX_TOKENS_PER_DEVICE; i++) await mintToken(did, `P${i}`);
		expect((await tokenPOST(ev({ did, label: 'one too many' }))).status).toBe(429);
	});

	it('only lets the issuing device revoke, and revoking really works', async () => {
		const did = await registerDevice();
		const other = await registerDevice('https://push.example.com/other');
		const token = await mintToken(did, 'Bob');

		expect((await tokenDELETE(ev({ did: other, token }))).status).toBe(404);
		expect((await tokenDELETE(ev({ did, token }))).status).toBe(200);

		const { code } = await allocRoom('OFFER');
		expect((await invitePOST(ev({ token, code }))).status).toBe(404);
	});
});

describe('push invite endpoint', () => {
	beforeEach(() => {
		mem.clear();
		sent.length = 0;
		sendResult.current = { ok: true };
	});

	it('sends an invite naming the partner the way the recipient labelled them', async () => {
		const did = await registerDevice();
		const token = await mintToken(did, 'Bob');
		const { code } = await allocRoom('OFFER');

		expect((await invitePOST(ev({ token, code }))).status).toBe(200);
		expect(sent).toHaveLength(1);
		const payload = JSON.parse(sent[0].payload);
		expect(payload).toMatchObject({ v: 1, code, from: 'Bob' });
	});

	it('ignores any name the caller tries to supply', async () => {
		const did = await registerDevice();
		const token = await mintToken(did, 'Bob');
		const { code } = await allocRoom('OFFER');

		await invitePOST(ev({ token, code, from: 'Your Bank', label: 'Your Bank' }));
		expect(JSON.parse(sent[0].payload).from).toBe('Bob');
	});

	it('refuses a code that is not an open room', async () => {
		const did = await registerDevice();
		const token = await mintToken(did, 'Bob');

		expect((await invitePOST(ev({ token, code: '9999' }))).status).toBe(400); // no such room
		expect((await invitePOST(ev({ token, code: 'abcd' }))).status).toBe(400); // not 4 digits
		expect(sent).toHaveLength(0);
	});

	it('refuses an unknown token', async () => {
		const { code } = await allocRoom('OFFER');
		expect((await invitePOST(ev({ token: 'made-up', code }))).status).toBe(404);
		expect(sent).toHaveLength(0);
	});

	it('holds a second invite on the same token back', async () => {
		const did = await registerDevice();
		const token = await mintToken(did, 'Bob');
		const first = await allocRoom('OFFER');
		const second = await allocRoom('OFFER');

		expect((await invitePOST(ev({ token, code: first.code }))).status).toBe(200);
		expect((await invitePOST(ev({ token, code: second.code }))).status).toBe(429);
		expect(sent).toHaveLength(1);
	});

	it('prunes a dead subscription and reports it as gone', async () => {
		const did = await registerDevice();
		const token = await mintToken(did, 'Bob');
		const { code } = await allocRoom('OFFER');
		sendResult.current = { gone: true };

		expect((await invitePOST(ev({ token, code }))).status).toBe(410);
		// Both the device and the capabilities it issued are cleared away.
		expect([...mem.keys()].some((k) => k.startsWith('dev/'))).toBe(false);
		expect([...mem.keys()].some((k) => k.startsWith('tok/'))).toBe(false);
	});

	it('stops working once the recipient turns notifications off', async () => {
		const did = await registerDevice();
		const token = await mintToken(did, 'Bob');
		const { code } = await allocRoom('OFFER');

		await deviceDELETE(ev({}, `?did=${encodeURIComponent(did)}`));
		// Deleting the device takes its capabilities with it, so the token is
		// simply unknown by the time it is used. 404 and 410 both mean the same
		// thing to the caller: stop holding this token.
		expect((await invitePOST(ev({ token, code }))).status).toBe(404);
		expect(sent).toHaveLength(0);
	});
});
