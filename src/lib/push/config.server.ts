import { env } from '$env/dynamic/private';
import type { VapidConfig } from './vapid';

/**
 * The application server keys, from the Netlify environment.
 *
 * Generate a pair (no install needed):
 *   node -e "crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify'])\
 *     .then(async k=>{const j=await crypto.subtle.exportKey('jwk',k.privateKey);\
 *     const p=Buffer.from(await crypto.subtle.exportKey('raw',k.publicKey));\
 *     console.log('public',p.toString('base64url'));console.log('private',j.d)})"
 *
 * Then:
 *   netlify env:set VAPID_PUBLIC_KEY  "<public>"
 *   netlify env:set VAPID_PRIVATE_KEY "<private>"
 *   netlify env:set VAPID_SUBJECT     "mailto:you@example.com"
 *
 * Changing the public key invalidates every existing subscription, because
 * browsers bind it at subscribe time — see the re-subscribe check in
 * `$lib/push/client`.
 */
export function vapidConfig(): VapidConfig | null {
	const publicKey = env.VAPID_PUBLIC_KEY;
	const privateKey = env.VAPID_PRIVATE_KEY;
	if (!publicKey || !privateKey) return null;
	return { publicKey, privateKey, subject: env.VAPID_SUBJECT || 'https://millebornes.netlify.app' };
}
