/**
 * base64url and byte helpers shared by the WebRTC handshake codec and Web Push.
 *
 * Both encode binary into URL/header-safe text, and both run in the browser and
 * in a Netlify function, so this sticks to Web platform APIs only.
 */

export function bytesToB64url(bytes: Uint8Array): string {
	let bin = '';
	for (const b of bytes) bin += String.fromCharCode(b);
	return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function b64urlToBytes(s: string): Uint8Array {
	const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
	const bin = atob(b64);
	const out = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
	return out;
}

/** Concatenate byte runs into one buffer. */
export function concat(...parts: Uint8Array[]): Uint8Array {
	const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
	let at = 0;
	for (const p of parts) {
		out.set(p, at);
		at += p.length;
	}
	return out;
}

export const utf8 = (s: string): Uint8Array => new TextEncoder().encode(s);

/**
 * Web Crypto wants a plain `ArrayBuffer`-backed view. The arrays here always
 * are one at runtime; this just narrows the generic for TS's stricter lib.
 */
export const buf = (b: Uint8Array): Uint8Array<ArrayBuffer> => b as Uint8Array<ArrayBuffer>;
