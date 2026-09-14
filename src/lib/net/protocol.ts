import type { GameState, Move } from '$lib/game/state';

/** Messages exchanged over the peer-to-peer DataChannel. */
export type NetMessage =
	| { t: 'state'; state: GameState } // host -> guest (redacted)
	| { t: 'move'; move: Move } // guest -> host
	| { t: 'nextHand' } // guest -> host (deal the next hand of the match)
	| { t: 'rematch' } // guest -> host (start a brand-new match)
	| { t: 'bye' } // either -> either (leaving)
	// Added after the first release. `#handleNet` has no default case and
	// `peer.ts` drops frames it cannot parse, so a peer on an older build
	// simply ignores everything below.
	| { t: 'hello'; proto: 1; peerId: string; name: string } // both, on channel open
	| { t: 'ready' } // guest -> host: done in the lobby
	| { t: 'start' } // host -> guest: leaving the lobby for the board
	| { t: 'partner'; token: string }; // both -> both: you may invite me
