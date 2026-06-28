import { other, type GameState, type PlayerIndex } from './state';
import { totalMiles } from './rules';

export interface ScoreLine {
	label: string;
	points: number;
}

export interface ScoreBreakdown {
	lines: ScoreLine[];
	total: number;
}

/** Itemised score for one player at the end of a hand. */
export function computeScore(s: GameState, player: PlayerIndex): ScoreBreakdown {
	const p = s.players[player];
	const opp = s.players[other(player)];
	const lines: ScoreLine[] = [];

	const miles = totalMiles(p);
	lines.push({ label: `Distance — ${miles} miles`, points: miles });

	const safetyCount = p.safeties.length;
	if (safetyCount > 0) lines.push({ label: `Safeties ×${safetyCount}`, points: safetyCount * 100 });
	if (safetyCount === 4) lines.push({ label: 'All 4 Safeties', points: 300 });
	if (p.coupsFourres > 0) {
		lines.push({ label: `Coup Fourré ×${p.coupsFourres}`, points: p.coupsFourres * 300 });
	}

	// Completion bonuses only for the player who reached 1000.
	if (s.winner === player) {
		lines.push({ label: 'Trip Completed', points: 400 });
		if (p.twoHundredsPlayed === 0) lines.push({ label: 'Safe Trip (no 200s)', points: 300 });
		if (s.deckExhaustedAt !== null) lines.push({ label: 'Delayed Action', points: 300 });
		if (totalMiles(opp) === 0) lines.push({ label: 'Shutout', points: 500 });
	}

	const total = lines.reduce((a, l) => a + l.points, 0);
	return { lines, total };
}

export interface HandResult {
	/** Itemised score for THIS hand. */
	scores: [ScoreBreakdown, ScoreBreakdown];
	/** Who completed the 1000-mile trip this hand, if anyone. */
	tripWinner: PlayerIndex | null;
	/** Who scored more this hand. */
	handWinner: PlayerIndex | null;
	/** Running match totals (already include this hand). */
	matchScores: [number, number];
	matchTarget: number;
	/** Set once the match is decided. */
	matchWinner: PlayerIndex | null;
	hand: number;
}

export function handResult(s: GameState): HandResult {
	const scores: [ScoreBreakdown, ScoreBreakdown] = [computeScore(s, 0), computeScore(s, 1)];
	let handWinner: PlayerIndex | null = null;
	if (scores[0].total > scores[1].total) handWinner = 0;
	else if (scores[1].total > scores[0].total) handWinner = 1;
	return {
		scores,
		tripWinner: s.winner,
		handWinner,
		matchScores: s.matchScores,
		matchTarget: s.matchTarget,
		matchWinner: s.matchWinner,
		hand: s.hand
	};
}
