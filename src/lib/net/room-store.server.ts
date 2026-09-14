/**
 * The signalling rooms themselves, in Netlify Blobs.
 *
 * Split out of the endpoint so the push-invite endpoint can check that a code
 * refers to a real, live room before it will notify anyone about it.
 */

import { getStore } from '@netlify/blobs';
import { ROOM_TTL_MS } from './signal';

export interface RoomRecord {
	offer: string;
	answer: string | null;
	createdAt: number;
}

const store = () => getStore({ name: 'millebornes-signal', consistency: 'strong' });

/** Read a room, treating an expired one as absent (and tidying it away). */
export async function getRoom(code: string): Promise<RoomRecord | null> {
	const room = (await store().get(code, { type: 'json' })) as RoomRecord | null;
	if (!room) return null;
	if (Date.now() - room.createdAt > ROOM_TTL_MS) {
		await store().delete(code);
		return null;
	}
	return room;
}

export async function saveRoom(code: string, room: RoomRecord): Promise<void> {
	await store().setJSON(code, room);
}

/**
 * Claim an unused 4-digit code. `onlyIfNew` makes the write itself the test,
 * so two hosts creating rooms at the same moment can't land on one code and
 * have the second silently overwrite the first one's offer.
 */
export async function allocRoom(offer: string): Promise<{ code: string; expiresAt: number }> {
	const createdAt = Date.now();
	for (let i = 0; i < 25; i++) {
		const code = String(Math.floor(1000 + Math.random() * 9000));
		if (await getRoom(code)) continue; // taken, and still live
		const res = await store().setJSON(
			code,
			{ offer, answer: null, createdAt } satisfies RoomRecord,
			{ onlyIfNew: true }
		);
		if (res.modified) return { code, expiresAt: createdAt + ROOM_TTL_MS };
	}
	throw new Error('no free room code');
}
