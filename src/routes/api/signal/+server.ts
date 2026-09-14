import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { allocRoom, getRoom, saveRoom } from '$lib/net/room-store.server';
import { readJson } from '$lib/server/http';

/**
 * Rendezvous for the 4-digit room codes: the host parks an SDP offer, the guest
 * picks it up and leaves an answer behind. Rooms expire, and expiry is checked
 * lazily on read — see `$lib/net/room-store.server`.
 */

export const prerender = false;

export const POST: RequestHandler = async ({ request }) => {
	const { offer } = await readJson(request);
	if (typeof offer !== 'string' || !offer) return json({ error: 'offer required' }, { status: 400 });
	const { code, expiresAt } = await allocRoom(offer);
	return json({ code, expiresAt });
};

export const GET: RequestHandler = async ({ url }) => {
	const code = url.searchParams.get('code');
	if (!code) return json({ error: 'code required' }, { status: 400 });
	const room = await getRoom(code);
	if (!room) return json({ error: 'not found' }, { status: 404 });
	return json({ offer: room.offer, answer: room.answer });
};

export const PUT: RequestHandler = async ({ url, request }) => {
	const code = url.searchParams.get('code');
	if (!code) return json({ error: 'code required' }, { status: 400 });
	const room = await getRoom(code);
	if (!room) return json({ error: 'not found' }, { status: 404 });
	const { answer } = await readJson(request);
	if (typeof answer !== 'string' || !answer)
		return json({ error: 'answer required' }, { status: 400 });
	room.answer = answer;
	await saveRoom(code, room);
	return json({ ok: true });
};
