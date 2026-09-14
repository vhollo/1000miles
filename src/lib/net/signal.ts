/**
 * Client for the Netlify signaling function. Trades the long SDP blobs through
 * a tiny 4-digit room code instead of copy/paste.
 */

const BASE = '/api/signal';

/**
 * How long a room stays joinable. Lives here rather than in the endpoint so the
 * client can size its own waiting window to match, instead of guessing.
 */
export const ROOM_TTL_MS = 10 * 60 * 1000;

export interface Room {
	code: string;
	/** Epoch ms after which the room is gone; sent by the server, not assumed. */
	expiresAt: number;
}

/** Host: publish the offer, get a fresh room code. */
export async function createRoom(offer: string): Promise<Room> {
	const res = await fetch(BASE, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ offer })
	});
	if (!res.ok) throw new Error('Could not create a room');
	const { code, expiresAt } = (await res.json()) as { code: string; expiresAt?: number };
	return { code, expiresAt: expiresAt ?? Date.now() + ROOM_TTL_MS };
}

/** Guest: fetch the host's offer for a room code (throws if the code is wrong/expired). */
export async function fetchOffer(code: string): Promise<string> {
	const res = await fetch(`${BASE}?code=${encodeURIComponent(code)}`);
	if (res.status === 404) throw new Error('Room not found');
	if (!res.ok) throw new Error('Could not reach the server');
	const { offer } = (await res.json()) as { offer?: string };
	if (!offer) throw new Error('Room not found');
	return offer;
}

/** Host: poll for the guest's answer (null until they join). */
export async function fetchAnswer(code: string): Promise<string | null> {
	const res = await fetch(`${BASE}?code=${encodeURIComponent(code)}`);
	if (!res.ok) return null;
	const { answer } = (await res.json()) as { answer?: string | null };
	return answer ?? null;
}

/** Guest: send the answer back to the host's room. */
export async function postAnswer(code: string, answer: string): Promise<void> {
	const res = await fetch(`${BASE}?code=${encodeURIComponent(code)}`, {
		method: 'PUT',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ answer })
	});
	if (!res.ok) throw new Error('Could not send the reply');
}
