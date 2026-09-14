import { describe, it, expect } from 'vitest';
import { encryptPayload } from './encrypt';
import { b64urlToBytes, bytesToB64url, buf, concat, utf8 } from '../bytes';

/** Stand in for a browser's push subscription: a P-256 keypair + auth secret. */
async function makeSubscriber() {
	const pair = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
		'deriveBits'
	])) as CryptoKeyPair;
	const p256dh = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
	const auth = crypto.getRandomValues(new Uint8Array(16));
	return {
		privateKey: pair.privateKey,
		uaPublic: p256dh,
		keys: { p256dh: bytesToB64url(p256dh), auth: bytesToB64url(auth) },
		authSecret: auth
	};
}

async function hmac(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
	const k = await crypto.subtle.importKey(
		'raw',
		buf(key),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);
	return new Uint8Array(await crypto.subtle.sign('HMAC', k, buf(data)));
}

/**
 * The receiving half of RFC 8291, written independently here so the test
 * proves the real thing decrypts rather than just re-running our own maths.
 */
async function decrypt(body: Uint8Array, sub: Awaited<ReturnType<typeof makeSubscriber>>) {
	const salt = body.slice(0, 16);
	const recordSize = new DataView(body.buffer, body.byteOffset).getUint32(16);
	const idLen = body[20];
	const asPublic = body.slice(21, 21 + idLen);
	const ciphertext = body.slice(21 + idLen);

	const asKey = await crypto.subtle.importKey(
		'raw',
		buf(asPublic),
		{ name: 'ECDH', namedCurve: 'P-256' },
		false,
		[]
	);
	const shared = new Uint8Array(
		await crypto.subtle.deriveBits({ name: 'ECDH', public: asKey }, sub.privateKey, 256)
	);

	const keyInfo = concat(utf8('WebPush: info'), new Uint8Array([0]), sub.uaPublic, asPublic);
	const ikm = (await hmac(await hmac(sub.authSecret, shared), concat(keyInfo, new Uint8Array([1])))).slice(0, 32);
	const prk = await hmac(salt, ikm);
	const cek = (
		await hmac(prk, concat(utf8('Content-Encoding: aes128gcm'), new Uint8Array([0, 1])))
	).slice(0, 16);
	const nonce = (
		await hmac(prk, concat(utf8('Content-Encoding: nonce'), new Uint8Array([0, 1])))
	).slice(0, 12);

	const aes = await crypto.subtle.importKey('raw', buf(cek), { name: 'AES-GCM' }, false, [
		'decrypt'
	]);
	const record = new Uint8Array(
		await crypto.subtle.decrypt({ name: 'AES-GCM', iv: buf(nonce) }, aes, buf(ciphertext))
	);
	return { recordSize, asPublic, delimiter: record[record.length - 1], plaintext: record.slice(0, -1) };
}

describe('push payload encryption', () => {
	it('round-trips an invite payload back to the subscriber', async () => {
		const sub = await makeSubscriber();
		const payload = JSON.stringify({ v: 1, code: '4821', from: 'Anna', pid: 'abc123' });

		const body = await encryptPayload(utf8(payload), sub.keys);
		const out = await decrypt(body, sub);

		expect(new TextDecoder().decode(out.plaintext)).toBe(payload);
		expect(out.delimiter).toBe(0x02); // last-record marker
	});

	it('lays the header out the way the spec requires', async () => {
		const sub = await makeSubscriber();
		const body = await encryptPayload(utf8('hi'), sub.keys);

		expect(new DataView(body.buffer, body.byteOffset).getUint32(16)).toBe(4096); // rs
		expect(body[20]).toBe(65); // length of the uncompressed public point
		expect(body.slice(21, 22)[0]).toBe(0x04); // …which is uncompressed
		// salt + rs + idlen + key + (2 bytes plaintext + delimiter + 16 byte tag)
		expect(body.length).toBe(16 + 4 + 1 + 65 + 3 + 16);
	});

	it('uses a fresh salt and ephemeral key every time', async () => {
		const sub = await makeSubscriber();
		const a = await encryptPayload(utf8('same'), sub.keys);
		const b = await encryptPayload(utf8('same'), sub.keys);

		expect(bytesToB64url(a.slice(0, 16))).not.toBe(bytesToB64url(b.slice(0, 16)));
		expect(bytesToB64url(a.slice(21, 86))).not.toBe(bytesToB64url(b.slice(21, 86)));
		// Both still decrypt to the same thing.
		expect(new TextDecoder().decode((await decrypt(a, sub)).plaintext)).toBe('same');
		expect(new TextDecoder().decode((await decrypt(b, sub)).plaintext)).toBe('same');
	});

	it('rejects malformed subscription keys', async () => {
		const sub = await makeSubscriber();
		await expect(encryptPayload(utf8('x'), { ...sub.keys, auth: bytesToB64url(new Uint8Array(8)) }))
			.rejects.toThrow(/auth must be 16 bytes/);
		await expect(
			encryptPayload(utf8('x'), { ...sub.keys, p256dh: bytesToB64url(b64urlToBytes(sub.keys.p256dh).slice(0, 30)) })
		).rejects.toThrow(/p256dh must be 65 bytes/);
	});
});
