import { describe, it, expect } from 'vitest';
import { applyMove, createGame } from './engine';
import { chooseMove } from './ai';
import { GOAL, totalMiles } from './rules';

describe('AI self-play', () => {
	it('completes a hand for many seeds without illegal states', () => {
		let winners = 0;
		const CAP = 1500;

		for (let seed = 0; seed < 40; seed++) {
			let s = createGame({ mode: '1p', seed });
			let guard = 0;

			while (s.phase !== 'gameOver') {
				s = applyMove(s, chooseMove(s));
				expect(totalMiles(s.players[0])).toBeLessThanOrEqual(GOAL);
				expect(totalMiles(s.players[1])).toBeLessThanOrEqual(GOAL);
				if (++guard > CAP) throw new Error(`seed ${seed} did not terminate within ${CAP} moves`);
			}

			if (s.winner !== null) {
				winners++;
				expect(totalMiles(s.players[s.winner])).toBe(GOAL);
			}
		}

		// The AI should actually finish trips, not just exhaust the deck every time.
		expect(winners).toBeGreaterThan(0);
	}, 20000);
});
