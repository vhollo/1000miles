import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRoom, fetchAnswer, fetchOffer, postAnswer } from './signal';

const BASE = '/api/signal';
const ok = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('signal client', () => {
	beforeEach(() => vi.restoreAllMocks());

	it('createRoom POSTs the offer and returns the code', async () => {
		const f = vi.fn().mockResolvedValue(ok({ code: '4821' }));
		vi.stubGlobal('fetch', f);
		expect(await createRoom('OFFER')).toBe('4821');
		expect(f.mock.calls[0][0]).toBe(BASE);
		expect(f.mock.calls[0][1].method).toBe('POST');
		expect(JSON.parse(f.mock.calls[0][1].body)).toEqual({ offer: 'OFFER' });
	});

	it('fetchOffer returns the offer, throws on 404', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ok({ offer: 'O', answer: null })));
		expect(await fetchOffer('4821')).toBe('O');

		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ok({}, 404)));
		await expect(fetchOffer('0000')).rejects.toThrow(/not found/i);
	});

	it('fetchAnswer is null until the guest answers, then returns it', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ok({ offer: 'O', answer: null })));
		expect(await fetchAnswer('4821')).toBeNull();

		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ok({ offer: 'O', answer: 'A' })));
		expect(await fetchAnswer('4821')).toBe('A');
	});

	it('postAnswer PUTs to the room', async () => {
		const f = vi.fn().mockResolvedValue(ok({ ok: true }));
		vi.stubGlobal('fetch', f);
		await postAnswer('4821', 'ANS');
		expect(f.mock.calls[0][0]).toBe(`${BASE}?code=4821`);
		expect(f.mock.calls[0][1].method).toBe('PUT');
		expect(JSON.parse(f.mock.calls[0][1].body)).toEqual({ answer: 'ANS' });
	});
});
