import type { Card, Hazard } from './cards';
import { legalMoves, takeableDiscard } from './engine';
import {
	GOAL,
	canPlayDistance,
	canPlayRemedy,
	isRolling,
	isSpeedLimited,
	totalMiles
} from './rules';
import { other, type GameState, type Move, type PlayerState } from './state';

type PlayMove = Extract<Move, { type: 'play' }>;

/** Heuristic opponent. Returns a single legal move for the active player. */
export function chooseMove(s: GameState): Move {
	// Defending a Coup Fourré window: always reveal the safety — it's a +300 swing.
	if (s.phase === 'coupFourre') {
		const moves = legalMoves(s);
		return moves.find((m) => m.type === 'coupFourre') ?? { type: 'declineCoupFourre' };
	}

	const me = s.players[s.current];
	const opp = s.players[other(s.current)];
	const moves = legalMoves(s);
	const card = (id: string): Card => me.hand.find((c) => c.id === id)!;

	// House rule: play the opponent's discard instead of a card of our own.
	const claim = moves.find((m) => m.type === 'takeDiscard');
	if (claim && worthClaiming(me, takeableDiscard(s)!)) return claim;

	const plays = moves.filter((m): m is PlayMove => m.type === 'play');
	const distancePlays = plays.filter((m) => card(m.cardId).kind === 'distance');
	const remedyPlays = plays.filter((m) => card(m.cardId).kind === 'remedy');
	const safetyPlays = plays.filter((m) => card(m.cardId).kind === 'safety');
	const attackPlays = plays.filter((m) => card(m.cardId).kind === 'hazard');

	const distVal = (m: PlayMove): number => {
		const c = card(m.cardId);
		return c.kind === 'distance' ? c.value : 0;
	};

	// 1. Win immediately if possible.
	const winning = distancePlays.find((m) => totalMiles(me) + distVal(m) === GOAL);
	if (winning) return winning;

	// 2. If stuck, clear the blockage so we can move again.
	if (!isRolling(me)) {
		const fix = remedyPlays.find((m) => {
			const c = card(m.cardId);
			return c.kind === 'remedy' && c.remedy !== 'endOfLimit';
		});
		if (fix) return fix;
		const unblock = safetyPlays.find((m) => safetyUnblocks(me, card(m.cardId)));
		if (unblock) return unblock;
	}

	// 3. Slow a dangerous opponent rather than just cruising.
	const oppClose = totalMiles(opp) >= 700;
	if (attackPlays.length && (oppClose || distancePlays.length === 0)) {
		return bestAttack(attackPlays, card);
	}

	// 4. Lift our own speed limit if we're sitting on long-haul cards.
	if (isSpeedLimited(me)) {
		const eol = remedyPlays.find((m) => {
			const c = card(m.cardId);
			return c.kind === 'remedy' && c.remedy === 'endOfLimit';
		});
		if (eol && me.hand.some((c) => c.kind === 'distance' && c.value > 50)) return eol;
	}

	// 5. Make progress — biggest legal jump.
	if (distancePlays.length) {
		return distancePlays.reduce((best, m) => (distVal(m) > distVal(best) ? m : best));
	}

	// 6. Get rolling.
	const roll = remedyPlays.find((m) => {
		const c = card(m.cardId);
		return c.kind === 'remedy' && c.remedy === 'roll';
	});
	if (roll) return roll;

	// 7. Opportunistic attack.
	if (attackPlays.length) return bestAttack(attackPlays, card);

	// 8. Bank a safety (points + an extra turn) when nothing better.
	if (safetyPlays.length) return safetyPlays[0];

	// 9. Discard the least useful card we can afford to hand over.
	return discardChoice(me, opp);
}

/**
 * Taking now *is* our move for the turn and costs next turn's draw, so it has
 * to beat the best thing we could have done from hand.
 *
 * `takeableDiscard` has already established the card is legal to play right
 * now, which settles safeties and remedies: a takeable remedy is by definition
 * the one we are stuck on, and either way we get to keep our own copy. Only
 * mileage needs weighing, against the longest haul we could play ourselves.
 */
function worthClaiming(me: PlayerState, take: Card): boolean {
	if (take.kind === 'hazard') return false; // never offered, but be explicit
	if (take.kind !== 'distance') return true;
	if (totalMiles(me) + take.value === GOAL) return true; // wins the hand outright
	const ourBest = me.hand.reduce(
		(best, c) =>
			c.kind === 'distance' && canPlayDistance(me, c.value) ? Math.max(best, c.value) : best,
		0
	);
	return take.value >= ourBest; // same miles or better, and our own card survives
}

function safetyUnblocks(me: PlayerState, c: Card): boolean {
	if (c.kind !== 'safety') return false;
	const top = me.battle[me.battle.length - 1];
	if (top?.kind === 'hazard') {
		if (c.safety === 'drivingAce' && top.hazard === 'accident') return true;
		if (c.safety === 'extraTank' && top.hazard === 'outOfGas') return true;
		if (c.safety === 'punctureProof' && top.hazard === 'flatTire') return true;
		if (c.safety === 'rightOfWay' && top.hazard === 'stop') return true;
	}
	return false;
}

const ATTACK_PRIORITY: Record<Hazard, number> = {
	stop: 5,
	accident: 4,
	outOfGas: 3,
	flatTire: 2,
	speedLimit: 1
};

function bestAttack(attacks: PlayMove[], card: (id: string) => Card): PlayMove {
	return attacks.reduce((best, m) => {
		const a = card(m.cardId);
		const b = card(best.cardId);
		const pa = a.kind === 'hazard' ? ATTACK_PRIORITY[a.hazard] : 0;
		const pb = b.kind === 'hazard' ? ATTACK_PRIORITY[b.hazard] : 0;
		return pa > pb ? m : best;
	});
}

/**
 * Score a card's "discardability" — what letting it go costs *us*
 * (higher = let it go first). Mileage is graded by the points it carries, so
 * a 25 is small change we can trade away while a 200 is the card of the hand;
 * that spread is what lets `giftRisk` below trade denial against points.
 */
function discardScore(c: Card, hand: Card[]): number {
	switch (c.kind) {
		case 'safety':
			return -100; // never willingly discard a safety
		case 'distance':
			return -8 - c.value / 10; // distance is points; keep big ones longest
		case 'hazard':
			return 8; // situational ammunition
		case 'remedy': {
			if (c.remedy === 'roll') {
				const rolls = hand.filter((x) => x.kind === 'remedy' && x.remedy === 'roll').length;
				return rolls > 1 ? 6 : 1; // keep at least one Roll
			}
			return 4; // spare remedies
		}
	}
}

/**
 * House rule: a discard lands face up in front of an opponent who may claim it
 * on their very next turn, so every discard is also a *gift*. This scores how
 * much the card would be worth to them right now — 0 when they cannot take it
 * at all — and is subtracted from `discardScore`, so a card that is merely
 * spare to us is never thrown at a player waiting for exactly that card.
 *
 * The eligibility test mirrors `takeableDiscard` from their seat: they may only
 * claim a card they could legally play the moment they pick it up, and their
 * hazards stay in the bin. The weights share `discardScore`'s scale, so a real
 * gift sinks below the cheapest mileage we are holding but still outranks the
 * long hauls: denial is worth a few points, not any number of them.
 */
function giftRisk(c: Card, opp: PlayerState): number {
	switch (c.kind) {
		case 'hazard':
			return 0; // hazards are never takeable
		case 'safety':
			return 40; // always takeable: 100 points, an extra turn, and immunity
		case 'remedy': {
			if (!canPlayRemedy(opp, c.remedy)) return 0;
			// A Roll is what actually restarts them, so it is the worst to hand
			// over. A hazard remedy leaves them still needing one. Lifting a
			// limit only bites while they are moving.
			if (c.remedy === 'roll') return 18;
			if (c.remedy === 'endOfLimit') return isRolling(opp) ? 16 : 8;
			return 12;
		}
		case 'distance': {
			if (!canPlayDistance(opp, c.value)) return 0;
			if (totalMiles(opp) + c.value === GOAL) return 1000; // never hand over the hand
			// The miles we would be donating, at half the weight our own
			// mileage carries: they still pay a draw to pick it up.
			return c.value / 25;
		}
	}
}

function discardChoice(me: PlayerState, opp: PlayerState): Move {
	let worst = me.hand[0];
	let worstScore = -Infinity;
	for (const c of me.hand) {
		const sc = discardScore(c, me.hand) - giftRisk(c, opp);
		if (sc > worstScore) {
			worstScore = sc;
			worst = c;
		}
	}
	return { type: 'discard', cardId: worst.id };
}
