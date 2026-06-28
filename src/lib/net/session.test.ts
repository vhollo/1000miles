import { describe, it, expect } from 'vitest';
import { hostApplyGuestMove, sameMove } from './session';
import { redactFor } from './redact';
import type { Card } from '$lib/game/cards';
import type { GameState, Move, PlayerState } from '$lib/game/state';
import type { NetMessage } from './protocol';
import type { Transport } from './transport';

/* ---- builders ---- */

const RM = (remedy: 'roll', i = 0): Card => ({ id: `rm-${remedy}-${i}`, kind: 'remedy', remedy });
const D = (value: 25, i = 0): Card => ({ id: `d${value}-${i}`, kind: 'distance', value });

function player(id: 0 | 1, hand: Card[] = []): PlayerState {
	return {
		id,
		name: id === 0 ? 'Host' : 'Guest',
		isAI: false,
		hand,
		distance: [],
		battle: [],
		speed: [],
		safeties: [],
		coupsFourres: 0,
		twoHundredsPlayed: 0
	};
}

/** A game where it's the guest's (seat 1) turn and they hold a Roll. */
function guestsTurn(): GameState {
	return {
		mode: '2p',
		seed: 9,
		players: [player(0, [D(25)]), player(1, [RM('roll'), D(25, 1)])],
		current: 1,
		drawPile: [],
		discardPile: [],
		phase: 'play',
		pending: null,
		winner: null,
		deckExhaustedAt: null,
		turn: 1,
		log: [],
		matchTarget: 3000,
		matchScores: [0, 0],
		hand: 1,
		matchWinner: null
	};
}

/* ---- pure validation ---- */

describe('hostApplyGuestMove', () => {
	it('applies a legal move on the guest turn', () => {
		const next = hostApplyGuestMove(guestsTurn(), { type: 'play', cardId: 'rm-roll-0' });
		expect(next).not.toBeNull();
		expect(next!.players[1].battle.at(-1)).toMatchObject({ remedy: 'roll' });
	});

	it('rejects a move when it is not the guest turn', () => {
		const s = { ...guestsTurn(), current: 0 as const };
		expect(hostApplyGuestMove(s, { type: 'play', cardId: 'rm-roll-0' })).toBeNull();
	});

	it('rejects an illegal move (card not in hand)', () => {
		expect(hostApplyGuestMove(guestsTurn(), { type: 'play', cardId: 'rm-roll-99' })).toBeNull();
	});
});

describe('sameMove', () => {
	it('matches type + cardId + target', () => {
		expect(sameMove({ type: 'play', cardId: 'a' }, { type: 'play', cardId: 'a' })).toBe(true);
		expect(sameMove({ type: 'play', cardId: 'a' }, { type: 'discard', cardId: 'a' })).toBe(false);
		expect(
			sameMove({ type: 'play', cardId: 'h', target: 1 }, { type: 'play', cardId: 'h', target: 0 })
		).toBe(false);
		expect(sameMove({ type: 'declineCoupFourre' }, { type: 'declineCoupFourre' })).toBe(true);
	});
});

/* ---- end-to-end over a fake transport pair ---- */

function makeFakePair(): [Transport, Transport] {
	const a = fake();
	const b = fake();
	a.peer = b;
	b.peer = a;
	return [a, b];

	function fake() {
		const t: Transport & { peer?: Transport } = {
			open: true,
			onmessage: null,
			onopen: null,
			onclose: null,
			send(msg: NetMessage) {
				// clone to mimic JSON crossing the wire
				t.peer?.onmessage?.(structuredClone(msg));
			},
			close() {
				(t as { open: boolean }).open = false;
			}
		};
		return t;
	}
}

describe('host/guest protocol over a fake transport', () => {
	it('guest move → host validates+applies → guest gets a redacted view', () => {
		const [hostT, guestT] = makeFakePair();
		let hostState = guestsTurn();
		let guestState: GameState | null = null;

		// host side (mirrors GameStore.#handleNet for 'move')
		hostT.onmessage = (msg) => {
			if (msg.t === 'move') {
				const next = hostApplyGuestMove(hostState, msg.move);
				if (next) {
					hostState = next;
					hostT.send({ t: 'state', state: redactFor(hostState, 1) });
				}
			}
		};
		// guest side
		guestT.onmessage = (msg) => {
			if (msg.t === 'state') guestState = msg.state;
		};

		guestT.send({ t: 'move', move: { type: 'play', cardId: 'rm-roll-0' } });

		expect(guestState).not.toBeNull();
		expect(guestState!.players[1].battle.at(-1)).toMatchObject({ remedy: 'roll' });
		expect(guestState!.seed).toBe(0); // arrived redacted
	});

	it('ignores an out-of-turn guest move', () => {
		const [hostT, guestT] = makeFakePair();
		let hostState: GameState = { ...guestsTurn(), current: 0 };
		let received = false;

		hostT.onmessage = (msg) => {
			if (msg.t === 'move') {
				const next = hostApplyGuestMove(hostState, msg.move);
				if (next) {
					hostState = next;
					hostT.send({ t: 'state', state: redactFor(hostState, 1) });
				}
			}
		};
		guestT.onmessage = () => (received = true);

		guestT.send({ t: 'move', move: { type: 'play', cardId: 'rm-roll-0' } });
		expect(received).toBe(false); // host sent nothing back
	});
});
