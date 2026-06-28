import { activePlayer, applyMove, legalMoves } from '$lib/game/engine';
import type { GameState, Move } from '$lib/game/state';

/** Fixed seats: host owns the authoritative game, guest is the remote. */
export const HOST_SEAT = 0;
export const GUEST_SEAT = 1;

/** Structural equality for moves (so the host can match a guest move against `legalMoves`). */
export function sameMove(a: Move, b: Move): boolean {
	if (a.type !== b.type) return false;
	const ac = 'cardId' in a ? a.cardId : undefined;
	const bc = 'cardId' in b ? b.cardId : undefined;
	if (ac !== bc) return false;
	const at = 'target' in a ? a.target : undefined;
	const bt = 'target' in b ? b.target : undefined;
	return at === bt;
}

/**
 * Host-authoritative validation. Apply a move received from the guest only if
 * it is genuinely the guest's turn AND the move is legal — otherwise return
 * `null` and the host ignores it (out-of-turn / tampered / stale moves).
 */
export function hostApplyGuestMove(state: GameState, move: Move): GameState | null {
	if (activePlayer(state) !== GUEST_SEAT) return null;
	if (!legalMoves(state).some((m) => sameMove(m, move))) return null;
	return applyMove(state, move);
}
