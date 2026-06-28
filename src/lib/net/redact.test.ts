import { describe, it, expect } from 'vitest';
import { redactFor } from './redact';
import { createGame } from '$lib/game/engine';

describe('redactFor', () => {
	it('hides the deck order and the opponent hand from the guest', () => {
		const s = createGame({ mode: '2p', seed: 5 });
		const view = redactFor(s, 1); // guest = seat 1, opponent = seat 0

		// seed wiped so the deck order can't be reconstructed
		expect(view.seed).toBe(0);

		// draw pile count preserved, but contents are opaque placeholders
		expect(view.drawPile.length).toBe(s.drawPile.length);
		expect(view.drawPile.every((c) => c.id.startsWith('hidden-'))).toBe(true);

		// opponent hand hidden, count preserved
		expect(view.players[0].hand.length).toBe(s.players[0].hand.length);
		expect(view.players[0].hand.every((c) => c.id.startsWith('hidden-'))).toBe(true);

		// the guest's own hand is fully intact
		expect(view.players[1].hand).toEqual(s.players[1].hand);

		// public state preserved
		expect(view.current).toBe(s.current);
		expect(view.phase).toBe(s.phase);
		expect(view.discardPile).toEqual(s.discardPile);

		// original state untouched
		expect(s.seed).toBe(5);
		expect(s.drawPile.some((c) => c.id.startsWith('hidden-'))).toBe(false);
	});
});
