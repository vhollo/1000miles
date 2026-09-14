import { describe, it, expect, vi, beforeEach } from 'vitest';

// In-memory stand-in for Netlify Blobs (hoisted so the mock factory can use it).
const { mem } = vi.hoisted(() => ({ mem: new Map<string, string>() }));
vi.mock('@netlify/blobs', () => ({
	getStore: () => ({
		async setJSON(k: string, v: unknown, opts?: { onlyIfNew?: boolean }) {
			// `onlyIfNew` is how room codes are claimed without a race — the mock
			// has to report the write being refused, not just swallow it.
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

import { GET, POST, PUT } from '../../routes/api/signal/+server';

// Minimal RequestEvent shim — the handlers only touch `request` and `url`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ev = (opts: { code?: string; body?: unknown }): any => ({
	url: new URL(`http://x/api/signal${opts.code ? `?code=${opts.code}` : ''}`),
	request: new Request('http://x/api/signal', {
		method: 'POST',
		body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined
	})
});

describe('signal endpoint', () => {
	beforeEach(() => mem.clear());

	it('runs the full handshake: create → fetch offer → answer → fetch answer', async () => {
		const created = await (await POST(ev({ body: { offer: 'OFF' } }))).json();
		expect(created.code).toMatch(/^\d{4}$/);
		expect(created.expiresAt).toBeGreaterThan(Date.now());

		const code = created.code;
		const offerRes = await (await GET(ev({ code }))).json();
		expect(offerRes.offer).toBe('OFF');
		expect(offerRes.answer).toBeNull();

		expect((await PUT(ev({ code, body: { answer: 'ANS' } }))).status).toBe(200);

		const answerRes = await (await GET(ev({ code }))).json();
		expect(answerRes.answer).toBe('ANS');
	});

	it('404s an unknown room code', async () => {
		expect((await GET(ev({ code: '0000' }))).status).toBe(404);
	});

	it('never hands the same code to two hosts at once', async () => {
		// Force every candidate onto one code, so the second POST has to be the
		// one that discovers the collision through the conditional write.
		const fixed = vi.spyOn(Math, 'random').mockReturnValue(0);
		try {
			const first = await (await POST(ev({ body: { offer: 'A' } }))).json();
			expect(first.code).toBe('1000');
			await expect(POST(ev({ body: { offer: 'B' } }))).rejects.toThrow(/no free room code/);
			// The first host's offer survived intact.
			expect((await (await GET(ev({ code: '1000' }))).json()).offer).toBe('A');
		} finally {
			fixed.mockRestore();
		}
	});

	it('rejects bad input', async () => {
		expect((await POST(ev({ body: {} }))).status).toBe(400); // no offer
		expect((await GET(ev({}))).status).toBe(400); // no code
	});
});
