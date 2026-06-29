import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

export const prerender = false;

/**
 * Returns ICE server config for WebRTC peer connections.
 *
 * With METERED_API_KEY + METERED_APP_NAME env vars set (Netlify env), returns
 * fresh per-session credentials from Metered.ca — these work reliably across
 * all NAT types including mobile carrier CGNAT.
 *
 * Without them, falls back to STUN + the Metered open-relay community TURN
 * server (limited bandwidth, fine for a hobby project).
 *
 * To enable proper TURN:
 *   1. Sign up at dashboard.metered.ca (free tier: 50 GB/month)
 *   2. Create an app, copy the App Name and API Key
 *   3. netlify env:set METERED_API_KEY "your-key"
 *      netlify env:set METERED_APP_NAME "your-app-name"
 */
export const GET = async () => {
	const apiKey = env.METERED_API_KEY;
	const appName = env.METERED_APP_NAME;

	if (apiKey && appName) {
		try {
			const res = await fetch(
				`https://${appName}.metered.live/api/v1/turn/credentials?apiKey=${encodeURIComponent(apiKey)}`
			);
			if (res.ok) {
				const iceServers = (await res.json()) as RTCIceServer[];
				return json({ iceServers });
			}
		} catch {
			/* fall through to community relay */
		}
	}

	return json({
		iceServers: [
			{ urls: 'stun:stun.l.google.com:19302' },
			{ urls: 'stun:stun1.l.google.com:19302' },
			{
				urls: 'turn:openrelay.metered.ca:80',
				username: 'openrelayproject',
				credential: 'openrelayproject'
			},
			{
				urls: 'turn:openrelay.metered.ca:443',
				username: 'openrelayproject',
				credential: 'openrelayproject'
			},
			{
				urls: 'turn:openrelay.metered.ca:443?transport=tcp',
				username: 'openrelayproject',
				credential: 'openrelayproject'
			}
		]
	});
};
