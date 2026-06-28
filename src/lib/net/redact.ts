import type { Card } from '$lib/game/cards';
import { other, type GameState, type PlayerIndex } from '$lib/game/state';

/** A count-preserving placeholder for a card the recipient must not see. */
function hiddenCard(i: number): Card {
	return { id: `hidden-${i}`, kind: 'distance', value: 25 };
}

/**
 * Produce a copy of the state safe to send to `seat`: the deck order is wiped
 * (`seed` zeroed + draw pile placeholdered) and the opponent's hand is hidden,
 * so a tampered guest can neither predict draws nor peek. All public info —
 * tableaus, discards, the log, the pending hazard — is preserved, and the
 * recipient's own hand is left intact.
 */
export function redactFor(state: GameState, seat: PlayerIndex): GameState {
	const opp = other(seat);
	const view = structuredClone(state);
	view.seed = 0;
	view.drawPile = view.drawPile.map((_, i) => hiddenCard(i));
	view.players[opp].hand = view.players[opp].hand.map((_, i) => hiddenCard(i + 1000));
	return view;
}
