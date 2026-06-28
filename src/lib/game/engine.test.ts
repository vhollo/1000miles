import { describe, it, expect } from 'vitest';
import {
	buildDeck,
	type Card,
	type DistanceValue,
	type Hazard,
	type Remedy,
	type Safety
} from './cards';
import {
	canAttackWith,
	canPlayDistance,
	canPlayRemedy,
	isRolling,
	isSpeedLimited,
	totalMiles
} from './rules';
import { applyMove, createGame, legalMoves, nextHand } from './engine';
import type { GameState, PlayerState } from './state';
import { computeScore } from './scoring';

/* ---- tiny card + state builders --------------------------------------- */

const D = (value: DistanceValue, i = 0): Card => ({ id: `d${value}-${i}`, kind: 'distance', value });
const RM = (remedy: Remedy, i = 0): Card => ({ id: `rm-${remedy}-${i}`, kind: 'remedy', remedy });
const HZ = (hazard: Hazard, i = 0): Card => ({ id: `hz-${hazard}-${i}`, kind: 'hazard', hazard });
const SF = (safety: Safety): Card => ({ id: `sf-${safety}`, kind: 'safety', safety });

function player(p: Partial<PlayerState> & { id: 0 | 1 }): PlayerState {
	return {
		name: p.id === 0 ? 'P0' : 'P1',
		isAI: false,
		hand: [],
		distance: [],
		battle: [],
		speed: [],
		safeties: [],
		coupsFourres: 0,
		twoHundredsPlayed: 0,
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

function state(p0: PlayerState, p1: PlayerState, over: Partial<GameState> = {}): GameState {
	return {
		mode: '2p',
		seed: 1,
		players: [p0, p1],
		current: 0,
		drawPile: [],
		discardPile: [],
		phase: 'play',
		pending: null,
		winner: null,
		deckExhaustedAt: null,
		turn: 1,
		log: [],
		matchTarget: 3000,
		matchScores: [0, 0],
		hand: 1,
		matchWinner: null,
		...over
	};
}

/* ---- deck ------------------------------------------------------------- */

describe('deck', () => {
	it('has exactly 106 cards in the right proportions', () => {
		const deck = buildDeck();
		expect(deck.length).toBe(106);

		const count = (pred: (c: Card) => boolean) => deck.filter(pred).length;
		expect(count((c) => c.kind === 'distance')).toBe(46);
		expect(count((c) => c.kind === 'hazard')).toBe(18);
		expect(count((c) => c.kind === 'remedy')).toBe(38);
		expect(count((c) => c.kind === 'safety')).toBe(4);

		expect(count((c) => c.kind === 'distance' && c.value === 200)).toBe(4);
		expect(count((c) => c.kind === 'remedy' && c.remedy === 'roll')).toBe(14);
		expect(count((c) => c.kind === 'hazard' && c.hazard === 'stop')).toBe(5);

		// unique ids
		expect(new Set(deck.map((c) => c.id)).size).toBe(106);
	});
});

/* ---- dealing ---------------------------------------------------------- */

describe('createGame', () => {
	it('deals 6 each and draws the first player up to 7', () => {
		const g = createGame({ mode: '1p', seed: 42 });
		expect(g.players[0].hand.length).toBe(7); // current player has drawn
		expect(g.players[1].hand.length).toBe(6);
		expect(g.drawPile.length).toBe(106 - 12 - 1);
		expect(g.players[1].isAI).toBe(true);
		expect(g.phase).toBe('play');
	});

	it('is deterministic for a given seed', () => {
		const a = createGame({ mode: '2p', seed: 7 });
		const b = createGame({ mode: '2p', seed: 7 });
		expect(a.players[0].hand.map((c) => c.id)).toEqual(b.players[0].hand.map((c) => c.id));
	});
});

/* ---- rolling / movement ----------------------------------------------- */

describe('rolling & distance', () => {
	it('cannot move without a green light', () => {
		const p = player({ id: 0 });
		expect(isRolling(p)).toBe(false);
		expect(canPlayDistance(p, 100)).toBe(false);
	});

	it('rolls after a Roll card', () => {
		const p = player({ id: 0, battle: [RM('roll')] });
		expect(isRolling(p)).toBe(true);
		expect(canPlayDistance(p, 100)).toBe(true);
	});

	it('Right of Way is a permanent green light', () => {
		const p = player({ id: 0, safeties: ['rightOfWay'] });
		expect(isRolling(p)).toBe(true);
	});

	it('must land on exactly 1000', () => {
		const p = player({ id: 0, battle: [RM('roll')], distance: miles(975) });
		expect(canPlayDistance(p, 50)).toBe(false); // would be 1025
		expect(canPlayDistance(p, 25)).toBe(true); // exactly 1000
	});

	it('allows at most two 200-mile cards', () => {
		const p = player({ id: 0, battle: [RM('roll')], twoHundredsPlayed: 2 });
		expect(canPlayDistance(p, 200)).toBe(false);
		expect(canPlayDistance(p, 100)).toBe(true);
	});

	it('Speed Limit restricts to 25/50', () => {
		const p = player({ id: 0, battle: [RM('roll')], speed: [HZ('speedLimit')] });
		expect(isSpeedLimited(p)).toBe(true);
		expect(canPlayDistance(p, 75)).toBe(false);
		expect(canPlayDistance(p, 50)).toBe(true);
	});

	it('Right of Way ignores Speed Limit', () => {
		const p = player({
			id: 0,
			battle: [RM('roll')],
			speed: [HZ('speedLimit')],
			safeties: ['rightOfWay']
		});
		expect(isSpeedLimited(p)).toBe(false);
		expect(canPlayDistance(p, 200)).toBe(true);
	});
});

/* ---- remedies --------------------------------------------------------- */

describe('remedies', () => {
	it('repairs only clears an accident', () => {
		expect(canPlayRemedy(player({ id: 0, battle: [HZ('accident')] }), 'repairs')).toBe(true);
		expect(canPlayRemedy(player({ id: 0, battle: [HZ('flatTire')] }), 'repairs')).toBe(false);
	});

	it('roll is the initial green light and clears a stop', () => {
		expect(canPlayRemedy(player({ id: 0 }), 'roll')).toBe(true);
		expect(canPlayRemedy(player({ id: 0, battle: [HZ('stop')] }), 'roll')).toBe(true);
		expect(canPlayRemedy(player({ id: 0, battle: [RM('roll')] }), 'roll')).toBe(false);
	});
});

/* ---- attacks ---------------------------------------------------------- */

describe('attacks', () => {
	it('can only hit a rolling, unprotected opponent', () => {
		expect(canAttackWith(player({ id: 1, battle: [RM('roll')] }), 'accident')).toBe(true);
		expect(canAttackWith(player({ id: 1 }), 'accident')).toBe(false); // not rolling
		expect(canAttackWith(player({ id: 1, battle: [RM('roll')], safeties: ['drivingAce'] }), 'accident')).toBe(false);
	});

	it('speed limit can hit a stopped opponent but not twice', () => {
		expect(canAttackWith(player({ id: 1 }), 'speedLimit')).toBe(true);
		expect(canAttackWith(player({ id: 1, speed: [HZ('speedLimit')] }), 'speedLimit')).toBe(false);
	});
});

/* ---- applyMove integration -------------------------------------------- */

describe('applyMove', () => {
	it('reaching 1000 wins the hand', () => {
		const p0 = player({ id: 0, battle: [RM('roll')], distance: miles(975), hand: [D(25)] });
		const p1 = player({ id: 1 });
		const next = applyMove(state(p0, p1), { type: 'play', cardId: 'd25-0' });
		expect(totalMiles(next.players[0])).toBe(1000);
		expect(next.winner).toBe(0);
		expect(next.phase).toBe('gameOver');
	});

	it('an illegal play is a no-op', () => {
		const p0 = player({ id: 0, hand: [D(100)] }); // not rolling
		const before = state(p0, player({ id: 1 }));
		const after = applyMove(before, { type: 'play', cardId: 'd100-0' });
		expect(after.players[0].hand.length).toBe(1);
		expect(after.players[0].distance.length).toBe(0);
	});

	it('a hazard is blocked by an existing safety (no window)', () => {
		const p0 = player({ id: 0, hand: [HZ('accident')] });
		const p1 = player({ id: 1, battle: [RM('roll')], safeties: ['drivingAce'] });
		const after = applyMove(state(p0, p1), { type: 'play', cardId: 'hz-accident-0', target: 1 });
		expect(after.phase).toBe('play');
		expect(after.players[0].hand.length).toBe(1); // attack rejected
	});
});

/* ---- coup fourré ------------------------------------------------------ */

describe('coup fourré', () => {
	function setup() {
		const p0 = player({ id: 0, hand: [HZ('accident')] });
		const p1 = player({ id: 1, battle: [RM('roll')], hand: [SF('drivingAce'), D(100)] });
		// give a draw pile so the defender can draw a replacement + start their turn
		return applyMove(state(p0, p1, { drawPile: [D(50, 9), D(25, 9)] }), {
			type: 'play',
			cardId: 'hz-accident-0',
			target: 1
		});
	}

	it('opens a window when the target holds the matching safety', () => {
		const g = setup();
		expect(g.phase).toBe('coupFourre');
		expect(g.pending?.hazard).toBe('accident');
		const moves = legalMoves(g);
		expect(moves.some((m) => m.type === 'coupFourre')).toBe(true);
		expect(moves.some((m) => m.type === 'declineCoupFourre')).toBe(true);
	});

	it('playing the safety scores +300 and steals the turn', () => {
		const g = applyMove(setup(), { type: 'coupFourre', cardId: 'sf-drivingAce' });
		expect(g.phase).toBe('play');
		expect(g.current).toBe(1);
		expect(g.players[1].coupsFourres).toBe(1);
		expect(g.players[1].safeties).toContain('drivingAce');
		// the nullified accident is in the discard, not on the defender
		expect(g.players[1].battle.some((c) => c.kind === 'hazard')).toBe(false);
		expect(g.discardPile.some((c) => c.kind === 'hazard' && c.hazard === 'accident')).toBe(true);
	});

	it('declining lets the hazard land and ends the attacker turn', () => {
		const g = applyMove(setup(), { type: 'declineCoupFourre' });
		expect(g.phase).toBe('play');
		expect(g.current).toBe(1);
		expect(g.players[1].battle.at(-1)).toMatchObject({ hazard: 'accident' });
	});
});

/* ---- scoring ---------------------------------------------------------- */

describe('scoring', () => {
	it('awards completion bonuses to the winner', () => {
		// 2×200 + 6×100 = 1000, using the max two 200s (so NOT a safe trip)
		const p0 = player({
			id: 0,
			distance: [D(200, 1), D(200, 2), D(100, 1), D(100, 2), D(100, 3), D(100, 4), D(100, 5), D(100, 6)],
			twoHundredsPlayed: 2,
			safeties: ['drivingAce', 'extraTank', 'punctureProof', 'rightOfWay'],
			coupsFourres: 1
		});
		const p1 = player({ id: 1 }); // 0 miles -> shutout
		const s = state(p0, p1, { winner: 0, phase: 'gameOver' });
		const b = computeScore(s, 0);
		const labels = b.lines.map((l) => l.label);
		expect(labels).toContain('Trip Completed');
		expect(labels).toContain('All 4 Safeties');
		expect(labels).toContain('Shutout');
		expect(labels).not.toContain('Safe Trip (no 200s)'); // two 200s used
		// 1000(dist) + 400(4 safeties) + 300(all four) + 300(coup) + 400(trip) + 500(shutout)
		expect(b.total).toBe(1000 + 400 + 300 + 300 + 400 + 500);
	});

	it('safe trip bonus when no 200s used', () => {
		const p0 = player({ id: 0, distance: miles(900), twoHundredsPlayed: 0 });
		// force a no-200 distance set
		p0.distance = [D(100, 1), D(100, 2), D(100, 3), D(100, 4), D(100, 5), D(100, 6), D(100, 7), D(100, 8), D(100, 9), D(100, 10)];
		const s = state(p0, player({ id: 1, distance: miles(75) }), { winner: 0, phase: 'gameOver' });
		const b = computeScore(s, 0);
		expect(b.lines.map((l) => l.label)).toContain('Safe Trip (no 200s)');
	});
});

/* ---- match (multiple hands to 3000) ----------------------------------- */

describe('match', () => {
	it('starts a 3000-point match at hand 1, scores 0-0', () => {
		const g = createGame({ mode: '2p', seed: 1 });
		expect(g.matchTarget).toBe(3000);
		expect(g.matchScores).toEqual([0, 0]);
		expect(g.hand).toBe(1);
		expect(g.matchWinner).toBeNull();
	});

	it('tallies the hand into the running total when a hand ends', () => {
		const p0 = player({ id: 0, battle: [RM('roll')], distance: miles(975), hand: [D(25)] });
		const after = applyMove(state(p0, player({ id: 1 })), { type: 'play', cardId: 'd25-0' });
		expect(after.phase).toBe('gameOver');
		expect(after.matchScores[0]).toBe(computeScore(after, 0).total);
		expect(after.matchScores[1]).toBe(computeScore(after, 1).total);
		expect(after.matchWinner).toBeNull(); // a single hand can't reach 3000 here? assert below target
		expect(after.matchScores[0]).toBeLessThan(3000);
	});

	it('declares a match winner once a player crosses the target', () => {
		const p0 = player({ id: 0, battle: [RM('roll')], distance: miles(975), hand: [D(25)] });
		const before = state(p0, player({ id: 1 }), { matchScores: [2900, 100] });
		const after = applyMove(before, { type: 'play', cardId: 'd25-0' });
		expect(after.matchScores[0]).toBeGreaterThanOrEqual(3000);
		expect(after.matchWinner).toBe(0);
	});

	it('nextHand carries totals over, increments hand, and re-deals', () => {
		const done = state(player({ id: 0 }), player({ id: 1 }), {
			phase: 'gameOver',
			winner: 0,
			matchScores: [1400, 600],
			hand: 2
		});
		const fresh = nextHand(done);
		expect(fresh.matchScores).toEqual([1400, 600]); // preserved
		expect(fresh.hand).toBe(3);
		expect(fresh.matchWinner).toBeNull();
		expect(fresh.phase).toBe('play');
		expect(fresh.players[0].distance).toEqual([]);
		expect(fresh.players[0].safeties).toEqual([]);
		// dealt a fresh hand: 6 each + the starter drew to 7
		const handSizes = [fresh.players[0].hand.length, fresh.players[1].hand.length].sort();
		expect(handSizes).toEqual([6, 7]);
		expect(fresh.drawPile.length).toBe(106 - 12 - 1);
	});
});
