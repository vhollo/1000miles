import type { NetMessage } from './protocol';

/**
 * Minimal duplex message channel the store talks to. The WebRTC peer
 * ([peer.ts](./peer.ts)) implements it for real; tests implement a fake one,
 * so the store never depends on WebRTC directly.
 */
export interface Transport {
	send(msg: NetMessage): void;
	close(): void;
	readonly open: boolean;

	/** Single-consumer handlers, assigned by the store. */
	onmessage: ((msg: NetMessage) => void) | null;
	onopen: (() => void) | null;
	onclose: (() => void) | null;
}
