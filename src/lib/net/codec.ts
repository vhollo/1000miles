/**
 * Compact, URL-safe encoding for the WebRTC handshake blobs.
 *
 * SDP is verbose but very repetitive, so `deflate-raw` shrinks it a lot before
 * base64url — keeping copy/paste codes and share-links small. Uses only Web
 * platform APIs (also present in Node 18+), so no dependencies and it runs in
 * the Vitest "node" environment too.
 */

export async function encode(obj: unknown): Promise<string> {
	const bytes = new TextEncoder().encode(JSON.stringify(obj));
	return toBase64Url(await deflate(bytes));
}

export async function decode<T = unknown>(code: string): Promise<T> {
	const bytes = fromBase64Url(extractCode(code));
	const json = new TextDecoder().decode(await inflate(bytes));
	return JSON.parse(json) as T;
}

/**
 * Pull the payload out of whatever the user pasted: a raw code, a full
 * share-link, or a URL fragment like `…/online#j=<code>` / `#a=<code>`.
 */
export function extractCode(input: string): string {
	const s = input.trim();
	const tail = s.match(/[#?]([^#?]*)$/);
	const query = tail ? tail[1] : s.includes('=') ? s : '';
	if (query) {
		const params = new URLSearchParams(query);
		for (const key of ['j', 'a', 'd', 'c', 'code']) {
			const v = params.get(key);
			if (v) return v;
		}
	}
	return s;
}

/* ---- internals -------------------------------------------------------- */

const deflate = (bytes: Uint8Array) => pump(bytes, new CompressionStream('deflate-raw'));
const inflate = (bytes: Uint8Array) => pump(bytes, new DecompressionStream('deflate-raw'));

async function pump(bytes: Uint8Array, ts: CompressionStream | DecompressionStream): Promise<Uint8Array> {
	const writer = ts.writable.getWriter();
	// The buffer is a plain ArrayBuffer at runtime; narrow the generic for TS's
	// stricter typed-array lib so `write` accepts it as a BufferSource.
	void writer.write(bytes as Uint8Array<ArrayBuffer>);
	void writer.close();
	return new Uint8Array(await new Response(ts.readable).arrayBuffer());
}

function toBase64Url(bytes: Uint8Array): string {
	let bin = '';
	for (const b of bytes) bin += String.fromCharCode(b);
	return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): Uint8Array {
	const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
	const bin = atob(b64);
	const out = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
	return out;
}
