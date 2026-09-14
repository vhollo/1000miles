/**
 * Who you are online, and who you have played with before.
 *
 * This is the only long-lived identity in the app. It is deliberately separate
 * from the saved game in `millebornes:save:v1`, which `game.clear()` throws
 * away every time someone backs out of a game.
 */

/** Schema version, so a later shape change can migrate rather than guess. */
export const PARTNERS_VERSION = 1;
export const PARTNERS_KEY = 'millebornes:partners:v1';

export interface Identity {
	/** Stable handle for this device, shared with every peer we connect to.
	 *  Public by design: knowing it grants nothing. */
	peerId: string;
	/** The nickname other players see. */
	name: string;
	/** Server-side handle for this device's push subscription, once registered.
	 *  Used only to manage our own subscription — never sent to a peer. */
	did: string | null;
}

export interface Partner {
	peerId: string;
	name: string;
	createdAt: number;
	lastPlayedAt: number | null;
	/** Capability THEY issued: lets us notify THEM. A bearer secret. */
	theirToken: string | null;
	/** Capability WE issued: kept so we can withdraw it if we remove them. */
	ourToken: string | null;
}

export interface PartnersFile {
	v: typeof PARTNERS_VERSION;
	identity: Identity;
	partners: Partner[];
	/** Tokens whose withdrawal failed; retried the next time the app starts. */
	pendingRevocations: string[];
}

/** The minimal storage surface used, so tests can pass a plain Map. */
export interface StorageLike {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
	removeItem(key: string): void;
}
