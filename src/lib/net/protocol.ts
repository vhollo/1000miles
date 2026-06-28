import type { GameState, Move } from '$lib/game/state';

/** Messages exchanged over the peer-to-peer DataChannel. */
export type NetMessage =
	| { t: 'state'; state: GameState } // host -> guest (redacted)
	| { t: 'move'; move: Move } // guest -> host
	| { t: 'nextHand' } // guest -> host (deal the next hand of the match)
	| { t: 'rematch' } // guest -> host (start a brand-new match)
	| { t: 'bye' }; // either -> either (leaving)
