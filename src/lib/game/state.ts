import type { Card, Hazard, Safety } from './cards';

export type PlayerIndex = 0 | 1;

export interface PlayerState {
	id: PlayerIndex;
	name: string;
	isAI: boolean;
	hand: Card[];
	/** Played mileage cards (sum = distance travelled). */
	distance: Card[];
	/** Battle stack: roll / stop / blocking-hazards / their remedies. Top = last. */
	battle: Card[];
	/** Speed stack: speedLimit / endOfLimit. Top = last. */
	speed: Card[];
	/** Revealed safety cards. */
	safeties: Safety[];
	/** Number of Coups Fourrés achieved (each worth +300). */
	coupsFourres: number;
	/** How many 200-mile cards played (max 2 per player). */
	twoHundredsPlayed: number;
}

export type Phase = 'play' | 'coupFourre' | 'gameOver';

/** A hazard awaiting a Coup Fourré decision from its target. */
export interface PendingHazard {
	hazard: Hazard;
	card: Card;
	by: PlayerIndex;
	target: PlayerIndex;
}

export interface LogEntry {
	text: string;
	player?: PlayerIndex;
	kind?: 'play' | 'attack' | 'remedy' | 'safety' | 'coupFourre' | 'win' | 'discard' | 'info';
}

export interface GameState {
	mode: '1p' | '2p';
	seed: number;
	players: [PlayerState, PlayerState];
	current: PlayerIndex;
	drawPile: Card[];
	discardPile: Card[];
	phase: Phase;
	pending: PendingHazard | null;
	winner: PlayerIndex | null;
	/** Turn number at which the draw pile first emptied (null = still cards left). */
	deckExhaustedAt: number | null;
	turn: number;
	log: LogEntry[];

	/* ---- match (multiple hands to `matchTarget` points) ---- */
	/** Points needed to win the whole match. */
	matchTarget: number;
	/** Running match totals, carried across hands. */
	matchScores: [number, number];
	/** 1-based hand (deal) number within the match. */
	hand: number;
	/** Set once a player reaches `matchTarget` after a hand — the match is over. */
	matchWinner: PlayerIndex | null;
}

export type Move =
	| { type: 'play'; cardId: string; target?: PlayerIndex }
	| { type: 'discard'; cardId: string }
	| { type: 'coupFourre'; cardId: string }
	| { type: 'declineCoupFourre' };

export const other = (p: PlayerIndex): PlayerIndex => (p === 0 ? 1 : 0);
