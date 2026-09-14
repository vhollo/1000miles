/**
 * Working out what the two players are called, once a channel is open.
 *
 * Both peers announce themselves with a `hello` as soon as the data channel
 * opens. The host owns the game state, so it waits for the guest's name before
 * dealing — the alternative, renaming players afterwards, would leave the
 * opening log line ("Host vs Guest — match to 3000 points!") wrong.
 *
 * A peer on an older build never sends `hello`, so the wait is bounded and
 * falls back to the names the game used before this existed.
 */

import { cleanName } from '$lib/push/validate';

/** How long the host waits for a name before dealing anyway. */
export const HELLO_GRACE_MS = 3000;

export interface Hello {
	peerId: string;
	name: string;
}

/**
 * Read an incoming `hello`, or reject it. Names arrive from another device, so
 * they are cleaned here rather than trusted.
 */
export function readHello(msg: { peerId?: unknown; name?: unknown }): Hello | null {
	const peerId = msg.peerId;
	if (typeof peerId !== 'string' || !peerId || peerId.length > 64) return null;
	return { peerId, name: cleanName(msg.name) };
}

/**
 * The two board names, host first. `null` means the grace period expired with
 * no `hello` — an older peer, who will show up as plain "Guest".
 */
export function settleNames(myName: string, hello: Hello | null): [string, string] {
	return [cleanName(myName, 'Host'), hello ? cleanName(hello.name) : 'Guest'];
}
