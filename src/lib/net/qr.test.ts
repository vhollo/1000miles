import { describe, it, expect } from 'vitest';
import { encodeQr, type QrMatrix } from './qr';

/** Render a matrix as one string per row, '#' for dark. */
const art = (m: QrMatrix): string[] => m.map((row) => row.map((c) => (c ? '#' : '.')).join(''));

/** FNV-1a over the modules — a compact fingerprint for the larger symbols. */
function fingerprint(m: QrMatrix): string {
	let h = 0x811c9dc5;
	for (const row of m) {
		for (const cell of row) {
			h ^= cell ? 1 : 0;
			h = Math.imul(h, 0x01000193) >>> 0;
		}
	}
	return h.toString(16).padStart(8, '0');
}

/** A payload shaped like a real handshake link, at a realistic length. */
function handshakeLink(length: number): string {
	const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
	let s = 'https://millebornes.example/online#j=';
	for (let i = 0; s.length < length; i++) s += alphabet[(i * 37 + 11) % alphabet.length];
	return s;
}

describe('qr', () => {
	it('encodes a short payload to the expected version 1 symbol', () => {
		// Golden symbol, cross-checked against a reference encoder and decoded
		// back to 'MILLE BORNES' with an independent QR decoder.
		expect(art(encodeQr('MILLE BORNES', 'L'))).toEqual([
			'#######.#...#.#######',
			'#.....#.##.#..#.....#',
			'#.###.#.#####.#.###.#',
			'#.###.#.#.#.#.#.###.#',
			'#.###.#..####.#.###.#',
			'#.....#.#.#.#.#.....#',
			'#######.#.#.#.#######',
			'.....................',
			'##..###.....#..#.####',
			'.#.....####.#......##',
			'#..#..#..##.###.#..#.',
			'#.####..######.#...#.',
			'#.#.#.######..#...#..',
			'........##..###..#.##',
			'#######...##..#.##.#.',
			'#.....#.###.##.##....',
			'#.###.#.#...###...#..',
			'#.###.#..####...##.##',
			'#.###.#..##...####...',
			'#.....#.#....#..#....',
			'#######.########..#.#'
		]);
	});

	it('encodes a handshake-sized link at both ECC levels', () => {
		// Both fingerprints come from symbols an independent decoder read back
		// correctly, so a change here means the encoder drifted.
		const link = handshakeLink(700);
		const low = encodeQr(link, 'L');
		const medium = encodeQr(link, 'M');

		expect(low.length).toBe(89); // version 18
		expect(fingerprint(low)).toBe('cc321b7e');
		expect(medium.length).toBe(101); // version 21 — more ECC needs more room
		expect(fingerprint(medium)).toBe('a81e798f');
	});

	it('picks the smallest version that fits the payload', () => {
		// Version 1-L holds 17 bytes; 18 has to step up to version 2 (25x25).
		expect(encodeQr('x'.repeat(17), 'L').length).toBe(21);
		expect(encodeQr('x'.repeat(18), 'L').length).toBe(25);
		// Every version is 4 modules wider than the last.
		for (const len of [1, 100, 500, 1000, 2000]) {
			const size = encodeQr('x'.repeat(len), 'L').length;
			expect((size - 17) % 4).toBe(0);
		}
	});

	it('keeps the function patterns intact', () => {
		const m = encodeQr(handshakeLink(700), 'L');
		const size = m.length;

		// Finder pattern cores, in three corners.
		for (const [ox, oy] of [
			[0, 0],
			[size - 7, 0],
			[0, size - 7]
		]) {
			expect(m[oy][ox]).toBe(true);
			expect(m[oy + 1][ox + 1]).toBe(false);
			expect(m[oy + 3][ox + 3]).toBe(true);
		}

		// Timing patterns alternate the whole way across, including where the
		// format information areas border them.
		for (let i = 8; i < size - 8; i++) {
			expect(m[6][i]).toBe(i % 2 === 0);
			expect(m[i][6]).toBe(i % 2 === 0);
		}
		expect(m[6][8]).toBe(true);
		expect(m[8][6]).toBe(true);

		// The module below the bottom-left finder is always dark.
		expect(m[size - 8][8]).toBe(true);
	});

	it('records the chosen mask in both copies of the format bits', () => {
		const m = encodeQr(handshakeLink(700), 'L');
		const size = m.length;

		const first = [
			...[0, 1, 2, 3, 4, 5].map((i) => m[i][8]),
			m[7][8],
			m[8][8],
			m[8][7],
			...[9, 10, 11, 12, 13, 14].map((i) => m[8][14 - i])
		];
		const second = [
			...Array.from({ length: 8 }, (_, i) => m[8][size - 1 - i]),
			...Array.from({ length: 7 }, (_, i) => m[size - 15 + (i + 8)][8])
		];
		expect(second).toEqual(first);

		// Unmask the format bits; the top 5 are the ECC designator and the mask.
		const format = (first.reduce((acc, bit, i) => acc | (Number(bit) << i), 0) ^ 0x5412) >>> 10;
		expect(format >>> 3).toBe(0b01); // level L
		expect(readEccDesignator(encodeQr(handshakeLink(700), 'M'))).toBe(0b00); // level M
	});

	/** Read the ECC designator back out of a symbol's first format-bit copy. */
	function readEccDesignator(m: QrMatrix): number {
		const bits = [
			...[0, 1, 2, 3, 4, 5].map((i) => m[i][8]),
			m[7][8],
			m[8][8],
			m[8][7],
			...[9, 10, 11, 12, 13, 14].map((i) => m[8][14 - i])
		];
		return ((bits.reduce((acc, bit, i) => acc | (Number(bit) << i), 0) ^ 0x5412) >>> 13) & 0b11;
	}

	it('refuses a payload past the version 40 capacity', () => {
		expect(() => encodeQr('x'.repeat(2953), 'L')).not.toThrow();
		expect(() => encodeQr('x'.repeat(2954), 'L')).toThrow(/too long/);
		// Level M spends more codewords on ECC, so it runs out sooner.
		expect(() => encodeQr('x'.repeat(2332), 'M')).toThrow(/too long/);
	});
});
