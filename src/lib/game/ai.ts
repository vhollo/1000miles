import type { Card, Hazard } from './cards';
import { legalMoves, takeableDiscard } from './engine';
import { GOAL, canPlayDistance, canPlayRemedy, isRolling, isSpeedLimited, totalMiles } from './rules';
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

	// House rule: take the opponent's discard when it beats the blind draw it
	// costs us next turn. Taking is free of the turn itself, so the AI claims the
	// card and then picks a real move on the next pass.
	const claim = moves.find((m) => m.type === 'takeDiscard');
	if (claim && holdValue(me, takeableDiscard(s)!) >= DRAW_WORTH) return claim;

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

	// 9. Discard the least useful card.
	return discardChoice(me);
}

/**
 * What an unseen card off the deck is worth on average, in `holdValue` terms —
 * the bar the opponent's discard has to clear to be worth taking.
 */
const DRAW_WORTH = 18;

/**
 * Roughly what holding `c` is worth to `me` *right now* — used to decide the
 * house-rule take. Situational on purpose: the Gasoline we're waiting on beats
 * a mileage card we can't legally play yet.
 */
function holdValue(me: PlayerState, c: Card): number {
	switch (c.kind) {
		case 'safety':
			return 100;
		case 'remedy':
			if (c.remedy === 'endOfLimit') return isSpeedLimited(me) ? 40 : 5;
			if (c.remedy === 'roll') return isRolling(me) ? 8 : 45;
			return canPlayRemedy(me, c.remedy) ? 50 : 6; // the fix we're actually stuck on
		case 'distance':
			if (totalMiles(me) + c.value === GOAL) return 200; // wins the hand
			return canPlayDistance(me, c.value) ? 10 + c.value / 10 : c.value / 20;
		case 'hazard':
			return 12;
	}
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

/** Score a card's "discardability" (higher = let it go first). */
function discardScore(c: Card, hand: Card[]): number {
	switch (c.kind) {
		case 'safety':
			return -100; // never willingly discard a safety
		case 'distance':
			return -10 - c.value / 100; // distance is points; keep big ones longest
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

function discardChoice(me: PlayerState): Move {
	let worst = me.hand[0];
	let worstScore = -Infinity;
	for (const c of me.hand) {
		const sc = discardScore(c, me.hand);
		if (sc > worstScore) {
			worstScore = sc;
			worst = c;
		}
	}
	return { type: 'discard', cardId: worst.id };
}
