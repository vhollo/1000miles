/**
 * VAPID (RFC 8292) request signing for Web Push.
 *
 * A push service will only accept a message for a subscription if the sender
 * proves it holds the same application server key the browser subscribed with.
 * That proof is an ES256-signed JWT naming the push service as the audience.
 *
 * Done by hand with Web Crypto rather than pulling in `web-push`: the project
 * has no runtime dependencies, and ECDSA P-256 is one `crypto.subtle` call.
 */

import { b64urlToBytes, bytesToB64url, buf, utf8 } from '$lib/bytes';

export interface VapidConfig {
	/** Uncompressed P-256 public point, base64url — the `applicationServerKey`. */
	publicKey: string;
	/** The private scalar `d`, base64url (the `d` member of the JWK). */
	privateKey: string;
	/** Contact for the push service operator: `mailto:` or `https:`. */
	subject: string;
}

/** How long a signed token stays valid. Push services reject more than 24h. */
const TOKEN_TTL_S = 12 * 60 * 60;

/**
 * Build the `Authorization` header value for one push request.
 * The audience is the push service's origin — never the full endpoint URL.
 */
export async function vapidAuthHeader(endpoint: string, cfg: VapidConfig): Promise<string> {
	const key = await importVapidKey(cfg);
	const claims = {
		aud: new URL(endpoint).origin,
		exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_S,
		sub: cfg.subject
	};

	const signingInput = `${b64urlJson({ typ: 'JWT', alg: 'ES256' })}.${b64urlJson(claims)}`;
	// Web Crypto returns the raw r‖s pair that JWS wants — no DER unwrapping.
	const sig = await crypto.subtle.sign(
		{ name: 'ECDSA', hash: 'SHA-256' },
		key,
		buf(utf8(signingInput))
	);

	const jwt = `${signingInput}.${bytesToB64url(new Uint8Array(sig))}`;
	return `vapid t=${jwt}, k=${cfg.publicKey}`;
}

/**
 * Rebuild the signing key from the two env vars. Web Crypto can't import a
 * bare private scalar, so the public point is split back into x and y to form
 * a complete JWK.
 */
export async function importVapidKey(cfg: VapidConfig): Promise<CryptoKey> {
	const pub = b64urlToBytes(cfg.publicKey);
	if (pub.length !== 65 || pub[0] !== 0x04) {
		throw new Error('VAPID public key must be a 65-byte uncompressed P-256 point');
	}
	const jwk: JsonWebKey = {
		kty: 'EC',
		crv: 'P-256',
		d: cfg.privateKey,
		x: bytesToB64url(pub.slice(1, 33)),
		y: bytesToB64url(pub.slice(33, 65)),
		ext: true
	};
	return crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, [
		'sign'
	]);
}

const b64urlJson = (o: unknown): string => bytesToB64url(utf8(JSON.stringify(o)));
