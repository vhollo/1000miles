import { browser } from '$app/environment';
import {
	activePlayer,
	applyMove,
	createGame,
	legalMoves,
	nextHand as dealNextHand,
	playableCardIds
} from '$lib/game/engine';
import { chooseMove } from '$lib/game/ai';
import type { GameState, Move, PlayerIndex } from '$lib/game/state';
import { createGuest, createHost } from '$lib/net/peer';
import { extractCode } from '$lib/net/codec';
import { createRoom, fetchAnswer, fetchOffer, postAnswer } from '$lib/net/signal';
import { redactFor } from '$lib/net/redact';
import { GUEST_SEAT, HOST_SEAT, hostApplyGuestMove } from '$lib/net/session';
import type { Transport } from '$lib/net/transport';
import type { NetMessage } from '$lib/net/protocol';

const STORAGE_KEY = 'millebornes:save:v1';
const AI_DELAY = 750; // ms between AI moves, so the table is readable
const ONLINE_NAMES: [string, string] = ['Host', 'Guest'];

export type Role = 'host' | 'guest' | null;

/**
 * Reactive wrapper around the pure engine. Owns persistence + the AI auto-play
 * loop for offline play, and the host-authoritative protocol for online play.
 * Components only read `state` and call `play()`.
 */
export class GameStore {
	state = $state<GameState | null>(null);
	/** True while the AI is about to move (drives a "thinking" indicator). */
	thinking = $state(false);

	/* online */
	role = $state<Role>(null);
	seat = $state<PlayerIndex>(0);
	connected = $state(false);
	netError = $state<string | null>(null);

	#timer: ReturnType<typeof setTimeout> | null = null;
	#gen = 0; // bumped on new game / clear to invalidate stale AI timers
	#transport: Transport | null = null;
	#acceptAnswer: ((code: string) => Promise<void>) | null = null;

	/* ---- queries ---- */

	get mode(): '1p' | '2p' | null {
		return this.state?.mode ?? null;
	}

	get isOnline(): boolean {
		return this.role !== null;
	}

	/** Whose input is expected (the defender during a Coup Fourré). */
	get active(): PlayerIndex {
		return this.state ? activePlayer(this.state) : 0;
	}

	get legal(): Move[] {
		return this.state ? legalMoves(this.state) : [];
	}

	get playableIds(): Set<string> {
		return this.state ? playableCardIds(this.state) : new Set();
	}

	get isCoupFourre(): boolean {
		return this.state?.phase === 'coupFourre';
	}

	get isOver(): boolean {
		return this.state?.phase === 'gameOver';
	}

	/** Is the player we're waiting on the AI? (true → input is locked) */
	get awaitingAI(): boolean {
		const s = this.state;
		if (!s || s.phase === 'gameOver') return false;
		return s.players[activePlayer(s)].isAI;
	}

	/* ---- offline commands ---- */

	newGame(mode: '1p' | '2p', names?: [string, string]): void {
		this.#resetOnline();
		this.#cancelAI();
		this.#gen++;
		this.state = createGame({ mode, names });
		this.#persist();
		this.#scheduleAI();
	}

	/** Restore an in-progress offline game from localStorage. */
	resume(): boolean {
		if (!browser) return false;
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return false;
		try {
			this.#resetOnline();
			this.#gen++;
			this.state = migrateState(JSON.parse(raw) as GameState);
			this.#scheduleAI();
			return true;
		} catch {
			return false;
		}
	}

	/* ---- the single play entry point ---- */

	play(move: Move): void {
		if (!this.state) return;

		if (this.role === 'guest') {
			// Thin remote: only send on our turn; the host is authoritative.
			if (!this.connected || activePlayer(this.state) !== this.seat) return;
			this.#transport?.send({ t: 'move', move });
			return;
		}

		if (this.role === 'host') {
			if (!this.connected || activePlayer(this.state) !== this.seat) return;
			this.state = applyMove(this.state, move);
			this.#broadcast();
			return;
		}

		// offline: solo / local pass-and-play (unchanged)
		if (this.awaitingAI) return;
		this.state = applyMove(this.state, move);
		this.#persist();
		this.#scheduleAI();
	}

	/** Deal the next hand of the ongoing match (running totals carry over). */
	nextHand(): void {
		if (!this.state) return;
		if (this.role === 'host') {
			this.state = dealNextHand(this.state);
			this.#broadcast();
		} else if (this.role === 'guest') {
			this.#transport?.send({ t: 'nextHand' });
		} else {
			this.state = dealNextHand(this.state);
			this.#persist();
			this.#scheduleAI();
		}
	}

	/** Start a brand-new match. Host re-deals + broadcasts; guest asks the host. */
	rematch(): void {
		if (this.role === 'host') {
			this.state = createGame({ mode: '2p', names: ONLINE_NAMES });
			this.#broadcast();
		} else if (this.role === 'guest') {
			this.#transport?.send({ t: 'rematch' });
		} else if (this.state) {
			this.newGame(this.state.mode, [this.state.players[0].name, this.state.players[1].name]);
		}
	}

	clear(): void {
		this.#cancelAI();
		this.#resetOnline();
		this.#gen++;
		this.state = null;
		if (browser) localStorage.removeItem(STORAGE_KEY);
	}

	/* ---- online setup ---- */

	/** Host: build the channel + offer code to share with the guest. */
	async beginHost(): Promise<string> {
		const { transport, offerCode } = await createHost();
		this.#acceptAnswer = (code) => transport.accept(code);
		this.#attach('host', transport);
		return offerCode;
	}

	/** Host: finish the handshake with the guest's pasted answer. */
	async submitAnswer(code: string): Promise<void> {
		if (!this.#acceptAnswer) throw new Error('not hosting');
		await this.#acceptAnswer(extractCode(code));
	}

	/** Guest: consume the host's offer and return an answer code to send back. */
	async beginGuest(offerCode: string): Promise<string> {
		const { transport, answerCode } = await createGuest(extractCode(offerCode));
		this.#attach('guest', transport);
		return answerCode;
	}

	/** Wire a connected transport into the store (also used by tests via a fake). */
	connectWith(role: 'host' | 'guest', transport: Transport): void {
		this.#attach(role, transport);
	}

	/* ---- online via 4-digit room code (Netlify signaling) ---- */

	/** Host: publish an offer, get a room code, and poll for the guest's answer. */
	async hostRoom(): Promise<string> {
		const { transport, offerCode } = await createHost();
		this.#acceptAnswer = (code) => transport.accept(code);
		this.#attach('host', transport);
		const code = await createRoom(offerCode);
		this.#pollForAnswer(code);
		return code;
	}

	/** Guest: fetch the host's offer for a code and send back the answer. */
	async joinRoom(code: string): Promise<void> {
		const offer = await fetchOffer(code.trim());
		const { transport, answerCode } = await createGuest(offer);
		this.#attach('guest', transport);
		await postAnswer(code.trim(), answerCode);
		this.#watchConnect();
	}

	/* ---- internals ---- */

	#attach(role: 'host' | 'guest', transport: Transport): void {
		this.#cancelAI();
		this.#gen++;
		this.role = role;
		this.seat = role === 'host' ? HOST_SEAT : GUEST_SEAT;
		this.connected = transport.open;
		this.netError = null;
		this.#transport = transport;

		transport.onopen = () => {
			this.connected = true;
			if (role === 'host') this.#broadcast(); // send the starting position
		};
		transport.onclose = () => {
			this.connected = false;
		};
		transport.onmessage = (msg) => this.#handleNet(msg);

		this.state = role === 'host' ? createGame({ mode: '2p', names: ONLINE_NAMES }) : null;
	}

	#handleNet(msg: NetMessage): void {
		switch (msg.t) {
			case 'state':
				if (this.role === 'guest') this.state = migrateState(msg.state);
				break;
			case 'move':
				if (this.role === 'host' && this.state) {
					const next = hostApplyGuestMove(this.state, msg.move);
					if (next) {
						this.state = next;
						this.#broadcast();
					}
				}
				break;
			case 'nextHand':
				if (this.role === 'host') this.nextHand();
				break;
			case 'rematch':
				if (this.role === 'host') this.rematch();
				break;
			case 'bye':
				this.connected = false;
				break;
		}
	}

	#broadcast(): void {
		if (this.role === 'host' && this.#transport && this.state) {
			// `state` is a reactive proxy; snapshot it to a plain object first so
			// `redactFor`'s structuredClone (and the JSON sent over the wire) work.
			const plain = $state.snapshot(this.state) as GameState;
			this.#transport.send({ t: 'state', state: redactFor(plain, GUEST_SEAT) });
		}
	}

	/** Host: poll the room until the guest's answer arrives, then complete. */
	#pollForAnswer(code: string): void {
		const gen = this.#gen;
		const start = Date.now();
		const tick = async () => {
			if (gen !== this.#gen || this.connected) return; // cancelled or done
			if (Date.now() - start > 180_000) {
				this.netError = 'No one joined in time. Start a new room.';
				return;
			}
			try {
				const answer = await fetchAnswer(code);
				if (gen !== this.#gen) return;
				if (answer && this.#acceptAnswer) {
					await this.#acceptAnswer(answer);
					this.#watchConnect();
					return; // channel will open via onopen
				}
			} catch {
				/* transient network hiccup — keep polling */
			}
			setTimeout(tick, 1500);
		};
		setTimeout(tick, 1500);
	}

	/** Flag an error if the peer connection doesn't open shortly after the handshake. */
	#watchConnect(): void {
		const gen = this.#gen;
		setTimeout(() => {
			if (gen === this.#gen && this.isOnline && !this.connected) {
				this.netError = "Couldn't connect. Make sure both devices are online, then try again.";
			}
		}, 20_000);
	}

	#resetOnline(): void {
		if (this.#transport) {
			try {
				this.#transport.send({ t: 'bye' });
			} catch {
				/* channel may already be gone */
			}
			this.#transport.close();
			this.#transport = null;
		}
		this.#acceptAnswer = null;
		this.role = null;
		this.connected = false;
		this.netError = null;
	}

	#scheduleAI(): void {
		this.#cancelAI();
		if (!this.awaitingAI) {
			this.thinking = false;
			return;
		}
		this.thinking = true;
		const gen = this.#gen;
		this.#timer = setTimeout(() => {
			if (gen !== this.#gen || !this.state) return;
			this.state = applyMove(this.state, chooseMove(this.state));
			this.#persist();
			this.#scheduleAI(); // keep going while it's still the AI's turn
		}, AI_DELAY);
	}

	#cancelAI(): void {
		if (this.#timer) {
			clearTimeout(this.#timer);
			this.#timer = null;
		}
		this.thinking = false;
	}

	#persist(): void {
		if (!browser || !this.state || this.isOnline) return;
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
		} catch {
			/* storage full / unavailable — non-fatal */
		}
	}
}

/**
 * Backfill match fields on a state that may predate multi-hand matches
 * (an older localStorage save, or a peer running an older build), so the UI
 * never reads an undefined `matchScores`.
 */
function migrateState(s: GameState): GameState {
	if (typeof s.matchTarget !== 'number') s.matchTarget = 3000;
	if (!Array.isArray(s.matchScores)) s.matchScores = [0, 0];
	if (typeof s.hand !== 'number') s.hand = 1;
	if (s.matchWinner === undefined) s.matchWinner = null;
	return s;
}

export const game = new GameStore();

/** Is there a saved, still-in-progress offline hand to continue? */
export function hasSavedGame(): boolean {
	if (!browser) return false;
	const raw = localStorage.getItem(STORAGE_KEY);
	if (!raw) return false;
	try {
		const s = JSON.parse(raw) as GameState;
		return s.phase !== 'gameOver';
	} catch {
		return false;
	}
}
