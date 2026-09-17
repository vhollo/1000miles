import { describe, it, expect } from 'vitest';
import { applyMove, createGame, takeableDiscard } from './engine';
import { chooseMove } from './ai';
import { GOAL, totalMiles } from './rules';
import type { Card, DistanceValue, Hazard, Remedy } from './cards';
import type { GameState, PlayerState } from './state';

/* ---- tiny card + state builders --------------------------------------- */

const D = (value: DistanceValue, i = 0): Card => ({ id: `d${value}-${i}`, kind: 'distance', value });
const RM = (remedy: Remedy, i = 0): Card => ({ id: `rm-${remedy}-${i}`, kind: 'remedy', remedy });
const HZ = (hazard: Hazard, i = 0): Card => ({ id: `hz-${hazard}-${i}`, kind: 'hazard', hazard });

function player(p: Partial<PlayerState> & { id: 0 | 1 }): PlayerState {
	return {
		name: p.id === 0 ? 'You' : 'CPU',
		isAI: p.id === 1,
		hand: [],
		distance: [],
		battle: [],
		speed: [],
		safeties: [],
		coupsFourres: 0,
		twoHundredsPlayed: 0,
		skipsDraw: false,
		...p
	};
}

/** distance cards summing to `total` (multiples of 25). */
function miles(total: number): Card[] {
	const out: Card[] = [];
	let remaining = total;
	let i = 0;
	for (const v of [200, 100, 75, 50, 25] as DistanceValue[]) {
		while (remaining >= v) {
			out.push(D(v, i++));
			remaining -= v;
		}
	}
	return out;
}

/** The AI (player 1) to move, stuck under an accident it cannot remedy. */
function stuckAI(hand: Card[], human: PlayerState): GameState {
	return {
		mode: '1p',
		seed: 1,
		players: [human, player({ id: 1, hand, battle: [RM('roll'), HZ('accident')] })],
		current: 1,
		drawPile: [D(25, 9)],
		discardPile: [],
		phase: 'play',
		pending: null,
		lastDiscard: null,
		winner: null,
		deckExhaustedAt: null,
		turn: 4,
		log: [],
		matchTarget: 5000,
		matchScores: [0, 0],
		hand: 1,
		matchWinner: null
	};
}

/** The card the human could claim if the AI made `move` on `s`. */
function giftAfter(s: GameState, move: ReturnType<typeof chooseMove>): Card | null {
	return takeableDiscard(applyMove(s, move));
}

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

describe('AI discards (house rule: the opponent may claim them)', () => {
	it('keeps End of Limit rather than handing it to a speed-limited human', () => {
		const human = player({
			id: 0,
			battle: [RM('roll')],
			speed: [HZ('speedLimit')],
			distance: miles(300)
		});
		const s = stuckAI([RM('endOfLimit'), D(25)], human);

		const move = chooseMove(s);

		expect(move).toEqual({ type: 'discard', cardId: 'd25-0' });
		// They can still claim the 25 — worth 25 miles at the price of a draw —
		// which beats handing them their speed limit back.
		expect(giftAfter(s, move)).toEqual(D(25));
	});

	it('does let the same card go when the human has no speed limit to lift', () => {
		const human = player({ id: 0, battle: [RM('roll')], distance: miles(300) });
		const s = stuckAI([RM('endOfLimit'), D(25)], human);

		// Dead weight for both of us now: the human cannot play it either.
		expect(chooseMove(s)).toEqual({ type: 'discard', cardId: 'rm-endOfLimit-0' });
	});

	it('never discards the mileage that would complete the human\'s trip', () => {
		const human = player({ id: 0, battle: [RM('roll')], distance: miles(925) });
		const s = stuckAI([D(75), D(25)], human);

		const move = chooseMove(s);

		expect(move).toEqual({ type: 'discard', cardId: 'd25-0' });
		const gift = giftAfter(s, move);
		expect(gift && totalMiles(human) + (gift.kind === 'distance' ? gift.value : 0)).not.toBe(GOAL);
	});

	it('spends an unplayable hazard before a remedy the human is waiting for', () => {
		const human = player({
			id: 0,
			battle: [RM('roll'), HZ('outOfGas')], // stopped: cannot be attacked, needs Gasoline
			distance: miles(300)
		});
		const s = stuckAI([RM('gasoline'), HZ('stop')], human);

		const move = chooseMove(s);

		expect(move).toEqual({ type: 'discard', cardId: 'hz-stop-0' });
		expect(giftAfter(s, move)).toBeNull(); // hazards are never claimable
	});

	it('weighs the gift against the points it would cost to deny it', () => {
		const human = player({
			id: 0,
			battle: [RM('roll')],
			speed: [HZ('speedLimit')],
			distance: miles(300)
		});

		// A 25 is cheap enough to throw instead (see above), a 200 is not: the
		// long haul is worth more to us than the limit is to them.
		expect(chooseMove(stuckAI([RM('endOfLimit'), D(200)], human))).toEqual({
			type: 'discard',
			cardId: 'rm-endOfLimit-0'
		});
	});
});
