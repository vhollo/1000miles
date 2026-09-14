import { browser } from '$app/environment';
import {
	activePlayer,
	applyMove,
	createGame,
	legalMoves,
	nextHand as dealNextHand,
	playableCardIds,
	takeableDiscard
} from '$lib/game/engine';
import { chooseMove } from '$lib/game/ai';
import type { Card } from '$lib/game/cards';
import type { GameState, Move, PlayerIndex } from '$lib/game/state';
import { createGuest, createHost } from '$lib/net/peer';
import { extractCode } from '$lib/net/codec';
import { createRoom, fetchAnswer, fetchOffer, postAnswer, type Room } from '$lib/net/signal';
import { redactFor } from '$lib/net/redact';
import { GUEST_SEAT, HOST_SEAT, hostApplyGuestMove } from '$lib/net/session';
import type { Transport } from '$lib/net/transport';
import type { NetMessage } from '$lib/net/protocol';
import { HELLO_GRACE_MS, readHello, settleNames, type Hello } from '$lib/net/handshake';

const STORAGE_KEY = 'millebornes:save:v1';
const AI_DELAY = 750; // ms between AI moves, so the table is readable
/** Names used before the peers have introduced themselves. */
const ONLINE_NAMES: [string, string] = ['Host', 'Guest'];
/** How long a host watching a room code on screen waits for someone to join. */
const WATCH_MS = 180_000;
/** Poll briskly for this long, then ease off. */
const EAGER_POLL_MS = 60_000;
const POLL_FAST_MS = 1500;
const POLL_SLOW_MS = 5000;

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
	/** Who is on the other end, once they have said hello. */
	peer = $state<Hello | null>(null);
	/** True once the board names are decided — with or without a greeting. */
	namesSettled = $state(false);
	/** The peer has finished with the lobby. */
	peerReady = $state(false);
	/** The game proper has begun; the lobby hands over to the board. */
	started = $state(false);
	/** A capability the peer just handed us, for the lobby to store. */
	peerToken = $state<string | null>(null);

	/** Our own nickname and peer id, set from the partner store on start-up. */
	identity: Hello = { peerId: '', name: '' };

	#timer: ReturnType<typeof setTimeout> | null = null;
	#gen = 0; // bumped on new game / clear to invalidate stale AI timers
	#transport: Transport | null = null;
	#acceptAnswer: ((code: string) => Promise<void>) | null = null;
	#helloTimer: ReturnType<typeof setTimeout> | null = null;

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

	/**
	 * House rule: the card the opponent just discarded, when the player to move
	 * may claim it. `null` whenever the rule doesn't apply right now.
	 */
	get takeable(): Card | null {
		return this.state ? takeableDiscard(this.state) : null;
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
			// Carry the players' real names into the new match, rather than
			// dropping back to the placeholders.
			const names = this.state
				? ([this.state.players[0].name, this.state.players[1].name] as [string, string])
				: ONLINE_NAMES;
			this.state = createGame({ mode: '2p', names });
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
		const iceServers = await fetchIceServers();
		const { transport, offerCode } = await createHost(iceServers);
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
		const iceServers = await fetchIceServers();
		const { transport, answerCode } = await createGuest(extractCode(offerCode), iceServers);
		this.#attach('guest', transport);
		return answerCode;
	}

	/** Wire a connected transport into the store (also used by tests via a fake). */
	connectWith(role: 'host' | 'guest', transport: Transport): void {
		this.#attach(role, transport);
	}

	/* ---- online via 4-digit room code (Netlify signaling) ---- */

	/**
	 * Host: publish an offer, get a room code, and poll for the guest's answer.
	 *
	 * `waitForRoomLife` keeps polling for as long as the room is actually
	 * joinable. That matters for a pushed invite, which may well be tapped
	 * minutes later; someone watching a room code on screen would rather be
	 * told sooner that nobody came.
	 */
	async hostRoom(opts: { waitForRoomLife?: boolean } = {}): Promise<Room> {
		const iceServers = await fetchIceServers();
		const { transport, offerCode } = await createHost(iceServers);
		this.#acceptAnswer = (code) => transport.accept(code);
		this.#attach('host', transport);
		const room = await createRoom(offerCode);
		this.#pollForAnswer(room, opts.waitForRoomLife ? room.expiresAt - Date.now() : WATCH_MS);
		return room;
	}

	/** Lobby: tell the peer we are done here. */
	markReady(): void {
		this.#transport?.send({ t: 'ready' });
	}

	/** Lobby: hand the peer the capability to invite us later. */
	sendPartnerToken(token: string): void {
		this.#transport?.send({ t: 'partner', token });
	}

	/** Host: leave the lobby. Both sides follow `started` to the board. */
	startOnline(): void {
		if (this.role !== 'host') return;
		this.started = true;
		this.#transport?.send({ t: 'start' });
		this.#broadcast();
	}

	/** Guest: fetch the host's offer for a code and send back the answer. */
	async joinRoom(code: string): Promise<void> {
		const iceServers = await fetchIceServers();
		const offer = await fetchOffer(code.trim());
		const { transport, answerCode } = await createGuest(offer, iceServers);
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
		this.peer = null;
		this.namesSettled = false;
		this.peerReady = false;
		this.started = false;
		this.peerToken = null;
		this.#transport = transport;

		transport.onopen = () => {
			this.connected = true;
			this.#sayHello();
		};
		transport.onclose = () => {
			this.connected = false;
		};
		transport.onmessage = (msg) => this.#handleNet(msg);

		// The host deals only once it knows what to call both players — see
		// `#settleNames`. Until then there is no game, which is what the lobby
		// screen covers.
		this.state = null;
		if (transport.open) this.#sayHello();
	}

	/** Introduce ourselves, and bound how long we wait to hear back. */
	#sayHello(): void {
		const gen = this.#gen;
		this.#transport?.send({
			t: 'hello',
			proto: 1,
			peerId: this.identity.peerId,
			name: this.identity.name
		});
		if (this.#helloTimer) clearTimeout(this.#helloTimer);
		this.#helloTimer = setTimeout(() => {
			// Nothing came back: the peer is on a build from before `hello` existed.
			if (gen === this.#gen && !this.namesSettled) this.#settleNames();
		}, HELLO_GRACE_MS);
	}

	/**
	 * Fix the two board names, and — on the host — deal the opening hand.
	 *
	 * Dealing here rather than in `#attach` is deliberate: `createGame` writes
	 * the players' names into the first log line, so a game created before the
	 * greeting arrives would be stamped "Host vs Guest" forever.
	 */
	#settleNames(): void {
		if (this.namesSettled) return;
		this.namesSettled = true;
		if (this.#helloTimer) {
			clearTimeout(this.#helloTimer);
			this.#helloTimer = null;
		}
		if (this.role !== 'host') return;

		const names = this.peer
			? settleNames(this.identity.name, this.peer)
			: settleNames(this.identity.name, null);
		this.state = createGame({ mode: '2p', names });
		this.#broadcast();
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
			case 'hello': {
				const hello = readHello(msg);
				if (!hello) break;
				this.peer = hello;
				this.#settleNames();
				break;
			}
			case 'ready':
				this.peerReady = true;
				break;
			case 'start':
				// The host has left the lobby; follow them to the board.
				if (this.role === 'guest') this.started = true;
				break;
			case 'partner':
				// Held for the lobby to save; the game store has no business
				// knowing where partner records live.
				if (typeof msg.token === 'string') this.peerToken = msg.token;
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

	/**
	 * Host: poll the room until the guest's answer arrives, then complete.
	 *
	 * Brisk at first, when someone is most likely staring at the screen, then
	 * slower — a long wait for a pushed invite shouldn't mean hundreds of
	 * requests.
	 */
	#pollForAnswer(room: Room, budgetMs: number): void {
		const gen = this.#gen;
		const start = Date.now();
		const tick = async () => {
			if (gen !== this.#gen || this.connected) return; // cancelled or done
			const waited = Date.now() - start;
			if (waited > budgetMs) {
				this.netError = 'No one joined in time. Start a new room.';
				return;
			}
			try {
				const answer = await fetchAnswer(room.code);
				if (gen !== this.#gen) return;
				if (answer && this.#acceptAnswer) {
					await this.#acceptAnswer(answer);
					this.#watchConnect();
					return; // channel will open via onopen
				}
			} catch {
				/* transient network hiccup — keep polling */
			}
			setTimeout(tick, waited < EAGER_POLL_MS ? POLL_FAST_MS : POLL_SLOW_MS);
		};
		setTimeout(tick, POLL_FAST_MS);
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
		if (this.#helloTimer) {
			clearTimeout(this.#helloTimer);
			this.#helloTimer = null;
		}
		this.#acceptAnswer = null;
		this.role = null;
		this.connected = false;
		this.netError = null;
		this.peer = null;
		this.namesSettled = false;
		this.peerReady = false;
		this.started = false;
		this.peerToken = null;
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
async function fetchIceServers(): Promise<RTCIceServer[]> {
	// Direct pairing has to work with no internet at all. Offline, STUN/TURN
	// are unreachable anyway and only make ICE gathering sit and wait, so skip
	// them: the LAN host candidates are all two devices on one network need.
	if (browser && !navigator.onLine) return [];
	try {
		// A captive portal answers slowly rather than failing, so cap the wait.
		const res = await fetch('/api/ice', { signal: AbortSignal.timeout(2500) });
		if (res.ok) {
			const { iceServers } = (await res.json()) as { iceServers: RTCIceServer[] };
			return iceServers;
		}
	} catch {
		/* fall through */
	}
	return [{ urls: 'stun:stun.l.google.com:19302' }];
}

function migrateState(s: GameState): GameState {
	if (typeof s.matchTarget !== 'number') s.matchTarget = 3000;
	if (!Array.isArray(s.matchScores)) s.matchScores = [0, 0];
	if (typeof s.hand !== 'number') s.hand = 1;
	if (s.matchWinner === undefined) s.matchWinner = null;
	if (s.lastDiscard === undefined) s.lastDiscard = null;
	for (const p of s.players) if (p.skipsDraw === undefined) p.skipsDraw = false;
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
