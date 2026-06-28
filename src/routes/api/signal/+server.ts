import { json } from '@sveltejs/kit';
import { getStore } from '@netlify/blobs';
import type { RequestHandler } from './$types';

/**
 * Rendezvous for the WebRTC handshake. A 4-digit room code maps to the host's
 * `offer` and (later) the guest's `answer`, kept in Netlify Blobs for a few
 * minutes. The code is just a key — the long SDP lives here so peers never paste.
 *
 *   POST /api/signal              { offer }   -> { code }
 *   GET  /api/signal?code=1234                -> { offer, answer }
 *   PUT  /api/signal?code=1234     { answer }  -> { ok: true }
 */

export const prerender = false;

const TTL_MS = 10 * 60 * 1000; // rooms expire after 10 minutes

interface Room {
	offer: string;
	answer: string | null;
	createdAt: number;
}

const store = () => getStore({ name: 'millebornes-signal', consistency: 'strong' });
type Store = ReturnType<typeof store>;

export const POST: RequestHandler = async ({ request }) => {
	const { offer } = await readJson(request);
	if (typeof offer !== 'string' || !offer) return json({ error: 'offer required' }, { status: 400 });
	const s = store();
	const code = await allocCode(s);
	await s.setJSON(code, { offer, answer: null, createdAt: Date.now() } satisfies Room);
	return json({ code });
};

export const GET: RequestHandler = async ({ url }) => {
	const code = url.searchParams.get('code');
	if (!code) return json({ error: 'code required' }, { status: 400 });
	const room = await getRoom(store(), code);
	if (!room) return json({ error: 'not found' }, { status: 404 });
	return json({ offer: room.offer, answer: room.answer });
};

export const PUT: RequestHandler = async ({ url, request }) => {
	const code = url.searchParams.get('code');
	if (!code) return json({ error: 'code required' }, { status: 400 });
	const s = store();
	const room = await getRoom(s, code);
	if (!room) return json({ error: 'not found' }, { status: 404 });
	const { answer } = await readJson(request);
	if (typeof answer !== 'string' || !answer) return json({ error: 'answer required' }, { status: 400 });
	room.answer = answer;
	await s.setJSON(code, room);
	return json({ ok: true });
};

async function getRoom(s: Store, code: string): Promise<Room | null> {
	const room = (await s.get(code, { type: 'json' })) as Room | null;
	if (!room) return null;
	if (Date.now() - room.createdAt > TTL_MS) {
		await s.delete(code);
		return null;
	}
	return room;
}

/** Pick an unused 4-digit code. */
async function allocCode(s: Store): Promise<string> {
	for (let i = 0; i < 25; i++) {
		const code = String(Math.floor(1000 + Math.random() * 9000));
		if (!(await getRoom(s, code))) return code;
	}
	throw new Error('no free room code');
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
	try {
		return (await request.json()) as Record<string, unknown>;
	} catch {
		return {};
	}
}
