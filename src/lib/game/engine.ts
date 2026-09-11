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
import { acts, asObject } from './text';

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
		twoHundredsPlayed: 0,
		skipsDraw: false
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
		lastDiscard: null,
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
		lastDiscard: s.lastDiscard ? { ...s.lastDiscard } : null,
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
	else if (move.type === 'takeDiscard') doTakeDiscard(s, cur, move.cardId);
	else if (move.type === 'play') doPlay(s, cur, move);
	return s;
}

function doDiscard(s: GameState, cur: PlayerState, cardId: string): void {
	const card = removeFromHand(cur, cardId);
	if (!card) return;
	s.discardPile.push(card);
	s.lastDiscard = { by: cur.id, cardId: card.id };
	log(s, { text: `${acts(cur.name, 'discard')} ${cardMeta(card).label}`, player: cur.id, kind: 'discard' });
	advanceTurn(s);
}

function doPlay(s: GameState, cur: PlayerState, move: Extract<Move, { type: 'play' }>): void {
	const card = cur.hand.find((c) => c.id === move.cardId);
	if (!card) return;
	playCard(s, cur, card, move.target);
}

/**
 * House rule — take: play the card the opponent just discarded, straight off
 * the pile. That play *is* your move for the turn, and because it cost you
 * nothing from hand you also forfeit next turn's draw (free once the deck is
 * spent — there is no draw left to give up).
 */
function doTakeDiscard(s: GameState, cur: PlayerState, cardId: string): void {
	const card = takeableDiscard(s);
	if (!card || card.id !== cardId) return;

	// Booked before the play, which hands the turn on and draws for the opponent.
	cur.skipsDraw = s.drawPile.length > 0;
	playCard(s, cur, card, undefined, 'discard');
}

/**
 * Play `card` for `cur`. `from` says where it comes from: the hand, or the top
 * of the discard pile under the house rule. Illegal plays are rejected *before*
 * the card is removed, so a rejected move leaves the state untouched.
 */
function playCard(
	s: GameState,
	cur: PlayerState,
	card: Card,
	target: PlayerIndex | undefined,
	from: 'hand' | 'discard' = 'hand'
): void {
	const suffix = from === 'discard' ? ' from the discard pile' : '';
	const take = () => {
		if (from === 'hand') removeFromHand(cur, card.id);
		else s.discardPile.pop();
	};

	switch (card.kind) {
		case 'distance': {
			if (!canPlayDistance(cur, card.value)) return;
			take();
			cur.distance.push(card);
			if (card.value === 200) cur.twoHundredsPlayed++;
			log(s, {
				text: `${acts(cur.name, 'drive')} ${card.value} miles${suffix}`,
				player: cur.id,
				kind: 'play'
			});
			if (totalMiles(cur) === GOAL) {
				win(s, cur.id);
				return;
			}
			advanceTurn(s);
			return;
		}
		case 'remedy': {
			if (!canPlayRemedy(cur, card.remedy)) return;
			take();
			if (card.remedy === 'endOfLimit') cur.speed.push(card);
			else cur.battle.push(card);
			log(s, {
				text: `${acts(cur.name, 'play')} ${cardMeta(card).label}${suffix}`,
				player: cur.id,
				kind: 'remedy'
			});
			advanceTurn(s);
			return;
		}
		case 'safety': {
			take();
			revealSafety(s, cur, card.safety);
			log(s, {
				text: `${acts(cur.name, 'reveal')} ${cardMeta(card).label}${suffix}`,
				player: cur.id,
				kind: 'safety'
			});
			extraTurn(s); // a safety grants another turn
			return;
		}
		case 'hazard': {
			const targetIdx = target ?? other(cur.id);
			const victim = s.players[targetIdx];
			if (!canAttackWith(victim, card.hazard)) return;
			take();

			// Open a Coup Fourré window if the target holds the matching safety.
			const matching = SAFETY_FOR[card.hazard];
			const held = victim.hand.find((c) => c.kind === 'safety' && c.safety === matching);
			if (held) {
				s.pending = { hazard: card.hazard, card, by: cur.id, target: targetIdx };
				s.phase = 'coupFourre';
				log(s, {
					text: `${acts(cur.name, 'attack')} ${asObject(victim.name)} with ${cardMeta(card).label}…`,
					player: cur.id,
					kind: 'attack'
				});
				return; // wait for the target's decision
			}

			landHazard(victim, card);
			log(s, {
				text: `${acts(cur.name, 'hit')} ${asObject(victim.name)} with ${cardMeta(card).label}`,
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
			text: `${acts(target.name, 'play')} ${cardMeta(card).label} — Coup Fourré! (+300)`,
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
		text: `${acts(target.name, 'take')} the ${cardMeta(pending.card).label}`,
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
	log(s, { text: `${acts(s.players[winner].name, 'complete')} the trip — ${GOAL} miles! 🏁`, kind: 'win' });
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

/** Draw a card for `p`, returning it — or `null` when the deck is spent. */
function drawOne(s: GameState, p: PlayerState): Card | null {
	if (s.drawPile.length > 0) {
		const card = s.drawPile.pop()!;
		p.hand.push(card);
		return card;
	}
	if (s.deckExhaustedAt === null) s.deckExhaustedAt = s.turn;
	return null;
}

/**
 * The draw that opens a turn. A player who took the opponent's discard owes one
 * (house rule), and pays it here — once.
 */
function drawForTurn(s: GameState, p: PlayerState): void {
	if (p.skipsDraw) {
		p.skipsDraw = false;
		log(s, {
			text: `${acts(p.name, 'skip')} the draw — the price of taking the discard`,
			player: p.id,
			kind: 'info'
		});
		return;
	}
	drawOne(s, p);
}

/** Begin the current player's turn: draw, or skip/finish if nobody can move. */
function startTurn(s: GameState): void {
	const p = s.players[s.current];
	drawForTurn(s, p);
	// Out of cards and out of deck — but the opponent's discard can still revive
	// a player with nothing in hand, so it counts as having a move.
	if (s.drawPile.length === 0 && p.hand.length === 0 && !takeableDiscard(s)) {
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
	drawForTurn(s, p);
	if (p.hand.length === 0 && s.drawPile.length === 0 && !takeableDiscard(s)) {
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

/**
 * House rule — take. The card the opponent just discarded, when the player to
 * move may claim it against next turn's draw; otherwise `null`.
 *
 * Deliberately narrow: only the *top* of the pile, only while it is still the
 * card the *opponent* discarded (any later push — a nullified Coup Fourré
 * hazard, a hazard cleared by a safety — closes the window), and only cards
 * that help you — their discarded hazards stay in the bin.
 *
 * An empty deck does *not* close the window: that is exactly the endgame where
 * the card you need is the one they just threw away. With no draw left to
 * forfeit the take is simply free.
 */
export function takeableDiscard(s: GameState): Card | null {
	if (s.phase !== 'play') return null;
	const last = s.lastDiscard;
	if (!last || last.by === s.current) return null;
	const top = s.discardPile[s.discardPile.length - 1];
	if (!top || top.id !== last.cardId) return null;

	const p = s.players[s.current];
	switch (top.kind) {
		case 'distance':
			return canPlayDistance(p, top.value) ? top : null;
		case 'remedy':
			return canPlayRemedy(p, top.remedy) ? top : null;
		case 'safety':
			return top;
		case 'hazard':
			return null;
	}
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
	// House rule: claim the card the opponent threw away, against next turn's draw.
	const take = takeableDiscard(s);
	if (take) moves.push({ type: 'takeDiscard', cardId: take.id });

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
