import {
	buildDeck,
	cardMeta,
	SAFETY_COVERS,
	SAFETY_FOR,
	type Card,
	type Safety
} from './cards';
import { mulberry32, randomSeed, shuffle } from './rng';
import {
	other,
	type GameState,
	type LogEntry,
	type Move,
	type PlayerIndex,
	type PlayerState
} from './state';
import {
	GOAL,
	canAttackWith,
	canPlayDistance,
	canPlayRemedy,
	topBattle,
	topSpeed,
	totalMiles
} from './rules';
import { computeScore } from './scoring';

export const HAND_SIZE = 6;
export const MATCH_TARGET = 3000;

/* ---- Construction ----------------------------------------------------- */

function makePlayer(id: PlayerIndex, name: string, isAI: boolean): PlayerState {
	return {
		id,
		name,
		isAI,
		hand: [],
		distance: [],
		battle: [],
		speed: [],
		safeties: [],
		coupsFourres: 0,
		twoHundredsPlayed: 0
	};
}

export interface CreateGameOptions {
	mode: '1p' | '2p';
	seed?: number;
	names?: [string, string];
	matchTarget?: number;
}

interface DealOptions {
	mode: '1p' | '2p';
	seed: number;
	p0: PlayerState;
	p1: PlayerState;
	matchTarget: number;
	matchScores: [number, number];
	hand: number;
	startPlayer: PlayerIndex;
}

/** Shuffle, deal six each and draw the starter up to seven — shared by createGame & nextHand. */
function dealHand(o: DealOptions): GameState {
	const deck = shuffle(buildDeck(), mulberry32(o.seed));
	for (let i = 0; i < HAND_SIZE; i++) {
		o.p0.hand.push(deck.pop()!);
		o.p1.hand.push(deck.pop()!);
	}
	const state: GameState = {
		mode: o.mode,
		seed: o.seed,
		players: [o.p0, o.p1],
		current: o.startPlayer,
		drawPile: deck,
		discardPile: [],
		phase: 'play',
		pending: null,
		winner: null,
		deckExhaustedAt: null,
		turn: 0,
		log: [],
		matchTarget: o.matchTarget,
		matchScores: o.matchScores,
		hand: o.hand,
		matchWinner: null
	};
	startTurn(state); // current player draws up to 7
	return state;
}

/** Start a brand-new match (hand 1, scores 0-0). */
export function createGame(opts: CreateGameOptions): GameState {
	const { mode, seed = randomSeed(), names, matchTarget = MATCH_TARGET } = opts;
	const p0 = makePlayer(0, names?.[0] ?? (mode === '1p' ? 'You' : 'Player 1'), false);
	const p1 = makePlayer(1, names?.[1] ?? (mode === '1p' ? 'AI' : 'Player 2'), mode === '1p');

	const state = dealHand({
		mode,
		seed,
		p0,
		p1,
		matchTarget,
		matchScores: [0, 0],
		hand: 1,
		startPlayer: 0
	});
	log(state, { text: `${p0.name} vs ${p1.name} — match to ${matchTarget} points!`, kind: 'info' });
	return state;
}

/** Deal the next hand of an ongoing match, carrying the running totals over. */
export function nextHand(prev: GameState): GameState {
	const seed = (Math.imul(prev.seed + prev.hand, 2654435761) >>> 0) || 1;
	const p0 = makePlayer(0, prev.players[0].name, prev.players[0].isAI);
	const p1 = makePlayer(1, prev.players[1].name, prev.players[1].isAI);

	const state = dealHand({
		mode: prev.mode,
		seed,
		p0,
		p1,
		matchTarget: prev.matchTarget,
		matchScores: [...prev.matchScores] as [number, number],
		hand: prev.hand + 1,
		startPlayer: (prev.hand % 2) as PlayerIndex // alternate who starts each hand
	});
	log(state, {
		text: `Hand ${state.hand} begins — ${state.matchScores[0]} : ${state.matchScores[1]} (to ${state.matchTarget})`,
		kind: 'info'
	});
	return state;
}

/* ---- Pure reducer ----------------------------------------------------- */

/**
 * Fast structural clone. Card objects are immutable and only ever moved
 * between piles, so we can safely share their references and just copy the
 * containers — far cheaper than `structuredClone` (matters for AI search).
 */
function clonePlayer(p: PlayerState): PlayerState {
	return {
		...p,
		hand: p.hand.slice(),
		distance: p.distance.slice(),
		battle: p.battle.slice(),
		speed: p.speed.slice(),
		safeties: p.safeties.slice()
	};
}

function clone(s: GameState): GameState {
	return {
		...s,
		players: [clonePlayer(s.players[0]), clonePlayer(s.players[1])],
		drawPile: s.drawPile.slice(),
		discardPile: s.discardPile.slice(),
		pending: s.pending ? { ...s.pending } : null,
		log: s.log.slice()
	};
}

export function applyMove(state: GameState, move: Move): GameState {
	const s = clone(state);
	if (s.phase === 'gameOver') return s;
	if (s.phase === 'coupFourre') {
		resolveCoupFourre(s, move);
		return s;
	}

	const cur = s.players[s.current];
	if (move.type === 'discard') doDiscard(s, cur, move.cardId);
	else if (move.type === 'play') doPlay(s, cur, move);
	return s;
}

function doDiscard(s: GameState, cur: PlayerState, cardId: string): void {
	const card = removeFromHand(cur, cardId);
	if (!card) return;
	s.discardPile.push(card);
	log(s, { text: `${cur.name} discards ${cardMeta(card).label}`, player: cur.id, kind: 'discard' });
	advanceTurn(s);
}

function doPlay(s: GameState, cur: PlayerState, move: Extract<Move, { type: 'play' }>): void {
	const card = cur.hand.find((c) => c.id === move.cardId);
	if (!card) return;

	switch (card.kind) {
		case 'distance': {
			if (!canPlayDistance(cur, card.value)) return;
			removeFromHand(cur, card.id);
			cur.distance.push(card);
			if (card.value === 200) cur.twoHundredsPlayed++;
			log(s, { text: `${cur.name} drives ${card.value} miles`, player: cur.id, kind: 'play' });
			if (totalMiles(cur) === GOAL) {
				win(s, cur.id);
				return;
			}
			advanceTurn(s);
			return;
		}
		case 'remedy': {
			if (!canPlayRemedy(cur, card.remedy)) return;
			removeFromHand(cur, card.id);
			if (card.remedy === 'endOfLimit') cur.speed.push(card);
			else cur.battle.push(card);
			log(s, { text: `${cur.name} plays ${cardMeta(card).label}`, player: cur.id, kind: 'remedy' });
			advanceTurn(s);
			return;
		}
		case 'safety': {
			removeFromHand(cur, card.id);
			revealSafety(s, cur, card.safety);
			log(s, {
				text: `${cur.name} reveals ${cardMeta(card).label}`,
				player: cur.id,
				kind: 'safety'
			});
			extraTurn(s); // a safety grants another turn
			return;
		}
		case 'hazard': {
			const targetIdx = move.target ?? other(cur.id);
			const target = s.players[targetIdx];
			if (!canAttackWith(target, card.hazard)) return;
			removeFromHand(cur, card.id);

			// Open a Coup Fourré window if the target holds the matching safety.
			const matching = SAFETY_FOR[card.hazard];
			const held = target.hand.find((c) => c.kind === 'safety' && c.safety === matching);
			if (held) {
				s.pending = { hazard: card.hazard, card, by: cur.id, target: targetIdx };
				s.phase = 'coupFourre';
				log(s, {
					text: `${cur.name} attacks ${target.name} with ${cardMeta(card).label}…`,
					player: cur.id,
					kind: 'attack'
				});
				return; // wait for the target's decision
			}

			landHazard(target, card);
			log(s, {
				text: `${cur.name} hits ${target.name} with ${cardMeta(card).label}`,
				player: cur.id,
				kind: 'attack'
			});
			advanceTurn(s);
			return;
		}
	}
}

function resolveCoupFourre(s: GameState, move: Move): void {
	const pending = s.pending;
	if (!pending) return;
	const target = s.players[pending.target];

	if (move.type === 'coupFourre') {
		const safety = SAFETY_FOR[pending.hazard];
		const card = target.hand.find((c) => c.id === move.cardId) ?? findSafety(target, safety);
		if (!card || card.kind !== 'safety') return;
		removeFromHand(target, card.id);
		revealSafety(s, target, card.safety);
		target.coupsFourres++;
		s.discardPile.push(pending.card); // the attack is nullified
		log(s, {
			text: `${target.name} plays ${cardMeta(card).label} — Coup Fourré! (+300)`,
			player: target.id,
			kind: 'coupFourre'
		});
		s.pending = null;
		s.phase = 'play';
		s.current = pending.target; // the defender steals the turn
		drawOne(s, target); // replacement for the safety
		startTurn(s); // …and now takes their turn
		return;
	}

	// Declined: the hazard lands as normal and the attacker's turn ends.
	landHazard(target, pending.card);
	log(s, {
		text: `${target.name} takes the ${cardMeta(pending.card).label}`,
		player: target.id,
		kind: 'attack'
	});
	s.pending = null;
	s.phase = 'play';
	advanceTurn(s); // s.current is still the attacker
}

/* ---- Helpers ---------------------------------------------------------- */

function removeFromHand(p: PlayerState, cardId: string): Card | undefined {
	const i = p.hand.findIndex((c) => c.id === cardId);
	if (i === -1) return undefined;
	return p.hand.splice(i, 1)[0];
}

function findSafety(p: PlayerState, safety: Safety): Card | undefined {
	return p.hand.find((c) => c.kind === 'safety' && c.safety === safety);
}

function landHazard(target: PlayerState, card: Card): void {
	if (card.kind !== 'hazard') return;
	if (card.hazard === 'speedLimit') target.speed.push(card);
	else target.battle.push(card);
}

/** Reveal a safety and clear any matching hazard currently in effect. */
function revealSafety(s: GameState, p: PlayerState, safety: Safety): void {
	if (!p.safeties.includes(safety)) p.safeties.push(safety);
	const bt = topBattle(p);
	if (bt?.kind === 'hazard' && SAFETY_COVERS[safety].includes(bt.hazard)) {
		s.discardPile.push(p.battle.pop()!);
	}
	if (safety === 'rightOfWay') {
		const st = topSpeed(p);
		if (st?.kind === 'hazard' && st.hazard === 'speedLimit') s.discardPile.push(p.speed.pop()!);
	}
}

function win(s: GameState, winner: PlayerIndex): void {
	s.winner = winner;
	s.phase = 'gameOver';
	log(s, { text: `${s.players[winner].name} completes the trip — ${GOAL} miles! 🏁`, kind: 'win' });
	endHand(s);
}

/** Tally this hand's points into the running match totals and decide the match. */
function endHand(s: GameState): void {
	s.matchScores[0] += computeScore(s, 0).total;
	s.matchScores[1] += computeScore(s, 1).total;
	const [a, b] = s.matchScores;
	if ((a >= s.matchTarget || b >= s.matchTarget) && a !== b) {
		s.matchWinner = a > b ? 0 : 1;
	}
}

function drawOne(s: GameState, p: PlayerState): boolean {
	if (s.drawPile.length > 0) {
		p.hand.push(s.drawPile.pop()!);
		return true;
	}
	if (s.deckExhaustedAt === null) s.deckExhaustedAt = s.turn;
	return false;
}

/** Begin the current player's turn: draw, or skip/finish if nobody can move. */
function startTurn(s: GameState): void {
	const p = s.players[s.current];
	drawOne(s, p);
	if (s.drawPile.length === 0 && p.hand.length === 0) {
		const opp = s.players[other(s.current)];
		if (opp.hand.length === 0) {
			s.phase = 'gameOver';
			log(s, { text: 'The deck and both hands are empty — the hand ends.', kind: 'info' });
				endHand(s);
			return;
		}
		s.current = other(s.current);
		startTurn(s);
		return;
	}
	s.turn++;
}

function advanceTurn(s: GameState): void {
	if (s.phase === 'gameOver') return;
	s.current = other(s.current);
	startTurn(s);
}

/** Same player plays again (after revealing a safety). */
function extraTurn(s: GameState): void {
	if (s.phase === 'gameOver') return;
	const p = s.players[s.current];
	drawOne(s, p);
	if (p.hand.length === 0 && s.drawPile.length === 0) {
		advanceTurn(s);
		return;
	}
	s.turn++;
}

function log(s: GameState, entry: LogEntry): void {
	s.log.push(entry);
	if (s.log.length > 60) s.log.shift();
}

/* ---- Queries (used by UI & AI) ---------------------------------------- */

/** Whose input is expected right now (the defender during a Coup Fourré). */
export function activePlayer(s: GameState): PlayerIndex {
	return s.phase === 'coupFourre' && s.pending ? s.pending.target : s.current;
}

export function legalMoves(s: GameState): Move[] {
	if (s.phase === 'gameOver') return [];

	if (s.phase === 'coupFourre' && s.pending) {
		const t = s.players[s.pending.target];
		const safety = SAFETY_FOR[s.pending.hazard];
		const card = findSafety(t, safety);
		const moves: Move[] = [];
		if (card) moves.push({ type: 'coupFourre', cardId: card.id });
		moves.push({ type: 'declineCoupFourre' });
		return moves;
	}

	const p = s.players[s.current];
	const opp = s.players[other(s.current)];
	const moves: Move[] = [];

	for (const c of p.hand) {
		if (c.kind === 'distance' && canPlayDistance(p, c.value)) {
			moves.push({ type: 'play', cardId: c.id });
		} else if (c.kind === 'remedy' && canPlayRemedy(p, c.remedy)) {
			moves.push({ type: 'play', cardId: c.id });
		} else if (c.kind === 'safety') {
			moves.push({ type: 'play', cardId: c.id });
		} else if (c.kind === 'hazard' && canAttackWith(opp, c.hazard)) {
			moves.push({ type: 'play', cardId: c.id, target: opp.id });
		}
	}
	// You may always discard instead of playing.
	for (const c of p.hand) moves.push({ type: 'discard', cardId: c.id });
	return moves;
}

/** Convenience: ids of cards the current player can legally *play* (not discard). */
export function playableCardIds(s: GameState): Set<string> {
	const ids = new Set<string>();
	if (s.phase !== 'play') return ids;
	for (const m of legalMoves(s)) if (m.type === 'play') ids.add(m.cardId);
	return ids;
}
