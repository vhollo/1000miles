import { decode, encode } from './codec';
import type { NetMessage } from './protocol';
import type { Transport } from './transport';

// TURN relay candidates can take 2–4s to gather; give 9s before falling back.
const ICE_TIMEOUT = 9000;

class PeerTransport implements Transport {
	onmessage: ((msg: NetMessage) => void) | null = null;
	onopen: (() => void) | null = null;
	onclose: (() => void) | null = null;
	open = false;

	#pc: RTCPeerConnection;
	#ch: RTCDataChannel | null = null;

	constructor(pc: RTCPeerConnection) {
		this.#pc = pc;
		pc.addEventListener('connectionstatechange', () => {
			if (['failed', 'disconnected', 'closed'].includes(pc.connectionState)) {
				if (this.open) {
					this.open = false;
					this.onclose?.();
				}
			}
		});
	}

	attachChannel(ch: RTCDataChannel): void {
		this.#ch = ch;
		ch.onopen = () => {
			this.open = true;
			this.onopen?.();
		};
		ch.onclose = () => {
			if (this.open) {
				this.open = false;
				this.onclose?.();
			}
		};
		ch.onmessage = (e) => {
			try {
				this.onmessage?.(JSON.parse(e.data) as NetMessage);
			} catch {
				/* ignore malformed frames */
			}
		};
	}

	/** Host only: complete the handshake with the guest's answer code. */
	async accept(answerCode: string): Promise<void> {
		const answer = await decode<RTCSessionDescriptionInit>(answerCode);
		await this.#pc.setRemoteDescription(answer);
	}

	send(msg: NetMessage): void {
		if (this.#ch?.readyState === 'open') this.#ch.send(JSON.stringify(msg));
	}

	close(): void {
		try {
			this.#ch?.close();
		} catch {
			/* noop */
		}
		try {
			this.#pc.close();
		} catch {
			/* noop */
		}
		this.open = false;
	}
}

/** Host: create the channel and an offer code to share with the guest. */
export async function createHost(
	iceServers: RTCIceServer[]
): Promise<{ transport: PeerTransport; offerCode: string }> {
	const pc = new RTCPeerConnection({ iceServers });
	const transport = new PeerTransport(pc);
	transport.attachChannel(pc.createDataChannel('game', { ordered: true }));

	await pc.setLocalDescription(await pc.createOffer());
	await iceGatheringComplete(pc);

	return { transport, offerCode: await encode(pc.localDescription) };
}

/** Guest: consume the host's offer and produce an answer code to send back. */
export async function createGuest(
	offerCode: string,
	iceServers: RTCIceServer[]
): Promise<{ transport: PeerTransport; answerCode: string }> {
	const pc = new RTCPeerConnection({ iceServers });
	const transport = new PeerTransport(pc);
	pc.addEventListener('datachannel', (e) => transport.attachChannel(e.channel));

	const offer = await decode<RTCSessionDescriptionInit>(offerCode);
	await pc.setRemoteDescription(offer);
	await pc.setLocalDescription(await pc.createAnswer());
	await iceGatheringComplete(pc);

	return { transport, answerCode: await encode(pc.localDescription) };
}

export type { PeerTransport };

/**
 * Resolve once all ICE candidates are gathered (so they're inlined in the SDP
 * — we have no channel to trickle them). Falls back to a short timeout; on a
 * LAN the host candidates arrive almost immediately.
 */
function iceGatheringComplete(pc: RTCPeerConnection): Promise<void> {
	if (pc.iceGatheringState === 'complete') return Promise.resolve();
	return new Promise((resolve) => {
		const finish = () => {
			pc.removeEventListener('icegatheringstatechange', check);
			clearTimeout(timer);
			resolve();
		};
		const check = () => {
			if (pc.iceGatheringState === 'complete') finish();
		};
		const timer = setTimeout(finish, ICE_TIMEOUT);
		pc.addEventListener('icegatheringstatechange', check);
	});
}
