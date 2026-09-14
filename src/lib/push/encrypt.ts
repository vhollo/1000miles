/**
 * Web Push payload encryption — RFC 8291 (`aes128gcm`).
 *
 * The push service is an untrusted relay, so the body is encrypted to a key
 * only the subscriber's browser can derive: an ephemeral ECDH exchange against
 * the subscription's public key, salted with its auth secret.
 *
 * Every length here is at most 32 bytes, so HKDF-Expand is a single HMAC round
 * rather than the full counter loop.
 */

import { b64urlToBytes, buf, concat, utf8 } from '$lib/bytes';

/** One record big enough for any invite we send; also the `rs` header field. */
const RECORD_SIZE = 4096;

export interface SubscriptionKeys {
	/** The subscriber's uncompressed P-256 public point, base64url. */
	p256dh: string;
	/** The subscriber's 16-byte auth secret, base64url. */
	auth: string;
}

/**
 * Encrypt `plaintext` for one subscription, returning the complete request
 * body: `salt(16) ‖ rs(4) ‖ idlen(1) ‖ server public key(65) ‖ ciphertext`.
 */
export async function encryptPayload(
	plaintext: Uint8Array,
	keys: SubscriptionKeys
): Promise<Uint8Array> {
	const uaPublic = b64urlToBytes(keys.p256dh);
	const authSecret = b64urlToBytes(keys.auth);
	if (uaPublic.length !== 65) throw new Error('p256dh must be 65 bytes');
	if (authSecret.length !== 16) throw new Error('auth must be 16 bytes');

	// Ephemeral sender keypair — a fresh one per message, as the RFC requires.
	const pair = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
		'deriveBits'
	])) as CryptoKeyPair;
	const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));

	const uaKey = await crypto.subtle.importKey(
		'raw',
		buf(uaPublic),
		{ name: 'ECDH', namedCurve: 'P-256' },
		false,
		[]
	);
	const shared = new Uint8Array(
		await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, pair.privateKey, 256)
	);

	// Mix the shared secret with the subscription's auth secret, binding the
	// result to both public keys so it can't be replayed to another subscriber.
	const ikm = await expand(
		await extract(authSecret, shared),
		concat(utf8('WebPush: info'), new Uint8Array([0]), uaPublic, asPublic),
		32
	);

	const salt = crypto.getRandomValues(new Uint8Array(16));
	const prk = await extract(salt, ikm);
	const cek = await expand(prk, info('aes128gcm'), 16);
	const nonce = await expand(prk, info('nonce'), 12);

	const aesKey = await crypto.subtle.importKey('raw', buf(cek), { name: 'AES-GCM' }, false, [
		'encrypt'
	]);
	// 0x02 marks the last (only) record; the receiver strips it after decrypting.
	const record = concat(plaintext, new Uint8Array([0x02]));
	const ciphertext = new Uint8Array(
		await crypto.subtle.encrypt({ name: 'AES-GCM', iv: buf(nonce) }, aesKey, buf(record))
	);

	const header = new Uint8Array(5);
	new DataView(header.buffer).setUint32(0, RECORD_SIZE);
	header[4] = asPublic.length;
	return concat(salt, header, asPublic, ciphertext);
}

/* ---- HKDF (RFC 5869), specialised to SHA-256 outputs of ≤32 bytes ------- */

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

const extract = (salt: Uint8Array, ikm: Uint8Array): Promise<Uint8Array> => hmac(salt, ikm);

async function expand(prk: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
	return (await hmac(prk, concat(info, new Uint8Array([1])))).slice(0, length);
}

const info = (name: string): Uint8Array =>
	concat(utf8(`Content-Encoding: ${name}`), new Uint8Array([0]));
