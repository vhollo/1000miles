import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { readJson, str } from '$lib/server/http';
import { vapidConfig } from '$lib/push/config.server';
import { sendPush } from '$lib/push/send';
import { getRoom } from '$lib/net/room-store.server';
import {
	MAX_INVITES_PER_TOKEN_PER_DAY,
	MAX_PUSHES_PER_DEVICE_PER_DAY,
	deleteDevice,
	deleteToken,
	getDevice,
	getToken,
	hashKey,
	putDevice,
	putToken,
	spend,
	tooSoon
} from '$lib/push/store';

/**
 * "Come and play" — the one endpoint that actually sends a notification.
 *
 * The guard that matters most is step 2: the room code must name a real, open
 * game. Without it a stolen token would be a general-purpose way to make
 * someone's phone buzz; with it, the worst a token can do is announce a game
 * that genuinely exists and is waiting for them.
 */
export const prerender = false;

export const POST: RequestHandler = async ({ request }) => {
	const cfg = vapidConfig();
	if (!cfg) return json({ error: 'push is not configured' }, { status: 503 });

	const body = await readJson(request);
	const token = str(body.token);
	const code = str(body.code);
	if (!token || !code || !/^\d{4}$/.test(code)) {
		return json({ error: 'token and a 4-digit code are required' }, { status: 400 });
	}

	// 2. There must be a live room behind the code.
	if (!(await getRoom(code))) {
		return json({ error: 'that room is not open' }, { status: 400 });
	}

	// 3. The capability must exist.
	const hash = await hashKey(token);
	const record = await getToken(hash);
	if (!record) return json({ error: 'unknown token' }, { status: 404 });

	// 4. …and still point at a device with a working subscription.
	const device = await getDevice(record.did);
	if (!device) {
		await deleteToken(hash);
		return json({ error: 'that partner is no longer reachable' }, { status: 410 });
	}

	// 5. Rate limits, in both directions.
	const now = Date.now();
	if (tooSoon(record.tx, now)) {
		return json({ error: 'that invite was just sent' }, { status: 429 });
	}
	const tx = spend(record.tx, MAX_INVITES_PER_TOKEN_PER_DAY, now);
	const rx = spend(device.rx, MAX_PUSHES_PER_DEVICE_PER_DAY, now);
	if (!tx || !rx) return json({ error: 'too many invites today' }, { status: 429 });

	// 6. The notification names the partner using the label THEY chose when they
	// minted this token — never anything the caller supplied.
	const payload = JSON.stringify({ v: 1, code, from: record.label, pid: hash.slice(0, 8) });
	const result = await sendPush(device.sub, payload, cfg, {
		// Collapse key: a fresh invite replaces an undelivered earlier one rather
		// than stacking up behind it.
		topic: `mb${hash.slice(0, 12).replace(/[^A-Za-z0-9]/g, '')}`,
		ttl: 900
	});

	if ('gone' in result) {
		await deleteDevice(record.did);
		return json({ error: 'that partner is no longer reachable' }, { status: 410 });
	}
	if ('error' in result) {
		// The only trace of a failed invite the operator will ever see. No user
		// data here — just which step gave up.
		console.warn('push invite failed:', result.error);
		return json({ error: 'could not send the invite' }, { status: 502 });
	}

	await putToken(hash, { ...record, tx });
	await putDevice(record.did, { ...device, rx });
	return json({ ok: true });
};
