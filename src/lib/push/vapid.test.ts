import { describe, it, expect } from 'vitest';
import { vapidAuthHeader, importVapidKey, type VapidConfig } from './vapid';
import { b64urlToBytes, buf, utf8 } from '../bytes';

/** Generate a VAPID keypair the same way the setup instructions do. */
async function makeKeys(): Promise<{ cfg: VapidConfig; verifyKey: CryptoKey }> {
	const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
		'sign',
		'verify'
	])) as CryptoKeyPair;
	const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
	const raw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
	return {
		cfg: {
			publicKey: bytes(raw),
			privateKey: jwk.d as string,
			subject: 'mailto:test@example.com'
		},
		verifyKey: pair.publicKey
	};
}
const bytes = (b: Uint8Array) =>
	btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const decodeJson = (part: string) =>
	JSON.parse(new TextDecoder().decode(b64urlToBytes(part))) as Record<string, unknown>;

describe('vapid', () => {
	it('signs a token the push service can verify', async () => {
		const { cfg, verifyKey } = await makeKeys();

		const header = await vapidAuthHeader('https://fcm.googleapis.com/fcm/send/abc123', cfg);
		const [, jwt, key] = header.match(/^vapid t=([^,]+), k=(.+)$/) ?? [];

		expect(key).toBe(cfg.publicKey);
		const [h, p, sig] = jwt.split('.');
		expect(decodeJson(h)).toEqual({ typ: 'JWT', alg: 'ES256' });

		// The signature is raw r‖s over "header.payload" — verify it for real.
		const ok = await crypto.subtle.verify(
			{ name: 'ECDSA', hash: 'SHA-256' },
			verifyKey,
			buf(b64urlToBytes(sig)),
			buf(utf8(`${h}.${p}`))
		);
		expect(ok).toBe(true);
		expect(b64urlToBytes(sig).length).toBe(64);
	});

	it('scopes the audience to the push service origin, not the endpoint', async () => {
		const { cfg } = await makeKeys();
		const header = await vapidAuthHeader('https://updates.push.services.mozilla.com/wpush/v2/gAAA', cfg);
		const claims = decodeJson(header.split('.')[1]);

		expect(claims.aud).toBe('https://updates.push.services.mozilla.com');
		expect(claims.sub).toBe('mailto:test@example.com');

		const hours = ((claims.exp as number) - Math.floor(Date.now() / 1000)) / 3600;
		expect(hours).toBeGreaterThan(0);
		expect(hours).toBeLessThanOrEqual(24); // push services reject longer
	});

	it('rejects a public key that is not an uncompressed P-256 point', async () => {
		const { cfg } = await makeKeys();
		await expect(importVapidKey({ ...cfg, publicKey: bytes(new Uint8Array(65)) })).rejects.toThrow(
			/uncompressed P-256 point/
		);
		await expect(
			importVapidKey({ ...cfg, publicKey: bytes(b64urlToBytes(cfg.publicKey).slice(0, 40)) })
		).rejects.toThrow(/65-byte/);
	});
});
