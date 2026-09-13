/**
 * Minimal QR Code encoder (byte mode) — enough to put a handshake link on
 * screen so the other phone can scan it instead of pasting a long code.
 *
 * Dependency-free like `codec.ts`: the handshake has to work with no network
 * at all, so pulling a library (and its bundle weight) for one screen isn't
 * worth it. Implements ISO/IEC 18004 for byte mode at ECC levels L and M,
 * versions 1–40, which covers the ~700–1200 character signalling links.
 */

export type EccLevel = 'L' | 'M';

/** A square grid of modules; `true` is a dark module. */
export type QrMatrix = boolean[][];

/** Total codewords of error correction per block, indexed by version (1–40). */
const ECC_CODEWORDS_PER_BLOCK: Record<EccLevel, readonly number[]> = {
	// prettier-ignore
	L: [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28,
		28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
	// prettier-ignore
	M: [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26,
		26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
};

/** Number of error correction blocks, indexed by version (1–40). */
const ECC_BLOCKS: Record<EccLevel, readonly number[]> = {
	// prettier-ignore
	L: [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7,
		8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
	// prettier-ignore
	M: [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14,
		16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
};

/** 2-bit ECC designator used in the format information bits. */
const ECC_FORMAT_BITS: Record<EccLevel, number> = { L: 1, M: 0 };

/**
 * Encode `text` as a QR symbol, picking the smallest version that fits.
 * Throws if the text is too long for version 40 at the requested ECC level.
 */
export function encodeQr(text: string, ecc: EccLevel = 'L'): QrMatrix {
	const data = new TextEncoder().encode(text);
	const version = pickVersion(data.length, ecc);
	const codewords = addEccAndInterleave(
		buildCodewords(data, version, ecc),
		version,
		ecc,
	);
	return render(codewords, version, ecc);
}

/** Smallest version (1–40) whose data capacity holds `byteLen` bytes. */
function pickVersion(byteLen: number, ecc: EccLevel): number {
	for (let v = 1; v <= 40; v++) {
		// 4 mode bits + an 8- or 16-bit character count header.
		const headerBits = 4 + (v < 10 ? 8 : 16);
		if (dataCodewords(v, ecc) * 8 >= headerBits + byteLen * 8) return v;
	}
	throw new Error('too long for a QR code');
}

/* ---- data codewords ---------------------------------------------------- */

/** Mode indicator, length header, payload, terminator and pad bytes. */
function buildCodewords(
	data: Uint8Array,
	version: number,
	ecc: EccLevel,
): Uint8Array {
	const bits: number[] = [];
	const push = (value: number, width: number) => {
		for (let i = width - 1; i >= 0; i--) bits.push((value >>> i) & 1);
	};

	push(0b0100, 4); // byte mode
	push(data.length, version < 10 ? 8 : 16);
	for (const b of data) push(b, 8);

	const capacityBits = dataCodewords(version, ecc) * 8;
	push(0, Math.min(4, capacityBits - bits.length)); // terminator
	while (bits.length % 8 !== 0) bits.push(0);

	const out = new Uint8Array(capacityBits / 8);
	for (let i = 0; i < bits.length; i++)
		out[i >>> 3] |= bits[i] << (7 - (i & 7));
	// Alternating pad bytes fill whatever capacity the payload left over.
	for (let i = bits.length / 8, pad = 0; i < out.length; i++, pad++) {
		out[i] = pad % 2 === 0 ? 0xec : 0x11;
	}
	return out;
}

/** Split into blocks, append Reed–Solomon parity, then interleave both. */
function addEccAndInterleave(
	data: Uint8Array,
	version: number,
	ecc: EccLevel,
): Uint8Array {
	const numBlocks = ECC_BLOCKS[ecc][version];
	const eccLen = ECC_CODEWORDS_PER_BLOCK[ecc][version];
	const totalCodewords = rawDataModules(version) >>> 3;
	// The last `shortBlocks` blocks are one codeword shorter than the rest.
	const shortBlocks = numBlocks - (totalCodewords % numBlocks);
	const shortLen = Math.floor(totalCodewords / numBlocks) - eccLen;

	const divisor = rsDivisor(eccLen);
	const blocks: Uint8Array[] = [];
	const parities: Uint8Array[] = [];
	for (let i = 0, off = 0; i < numBlocks; i++) {
		const len = shortLen + (i < shortBlocks ? 0 : 1);
		const block = data.subarray(off, off + len);
		off += len;
		blocks.push(block);
		parities.push(rsRemainder(block, divisor));
	}

	const out = new Uint8Array(totalCodewords);
	let pos = 0;
	for (let i = 0; i < shortLen + 1; i++) {
		for (let b = 0; b < numBlocks; b++) {
			// Short blocks have no codeword in the final data column.
			if (i < blocks[b].length) out[pos++] = blocks[b][i];
		}
	}
	for (let i = 0; i < eccLen; i++) {
		for (let b = 0; b < numBlocks; b++) out[pos++] = parities[b][i];
	}
	return out;
}

/* ---- Reed–Solomon over GF(256), primitive polynomial 0x11D ------------- */

function gfMul(a: number, b: number): number {
	let result = 0;
	for (let i = 7; i >= 0; i--) {
		result = (result << 1) ^ ((result >>> 7) * 0x11d);
		result ^= ((b >>> i) & 1) * a;
	}
	return result & 0xff;
}

/** Coefficients of the generator polynomial of the given degree. */
function rsDivisor(degree: number): Uint8Array {
	const result = new Uint8Array(degree);
	result[degree - 1] = 1;
	let root = 1;
	for (let i = 0; i < degree; i++) {
		for (let j = 0; j < degree; j++) {
			result[j] = gfMul(result[j], root);
			if (j + 1 < degree) result[j] ^= result[j + 1];
		}
		root = gfMul(root, 0x02);
	}
	return result;
}

function rsRemainder(data: Uint8Array, divisor: Uint8Array): Uint8Array {
	const result = new Uint8Array(divisor.length);
	for (const b of data) {
		const factor = b ^ result[0];
		result.copyWithin(0, 1);
		result[result.length - 1] = 0;
		for (let i = 0; i < result.length; i++)
			result[i] ^= gfMul(divisor[i], factor);
	}
	return result;
}

/* ---- symbol layout ----------------------------------------------------- */

/** Build the matrix: function patterns, data, then the best-scoring mask. */
function render(
	codewords: Uint8Array,
	version: number,
	ecc: EccLevel,
): QrMatrix {
	const size = version * 4 + 17;
	const modules: QrMatrix = Array.from({ length: size }, () =>
		new Array<boolean>(size).fill(false),
	);
	// Parallel grid marking cells owned by function patterns, which data skips.
	const reserved: boolean[][] = Array.from({ length: size }, () =>
		new Array<boolean>(size).fill(false),
	);

	drawFunctionPatterns(modules, reserved, version);
	drawCodewords(modules, reserved, codewords);

	let best: QrMatrix | null = null;
	let bestPenalty = Infinity;
	for (let mask = 0; mask < 8; mask++) {
		const candidate = modules.map((row) => row.slice());
		applyMask(candidate, reserved, mask);
		drawFormatBits(candidate, ecc, mask);
		const penalty = penaltyScore(candidate);
		if (penalty < bestPenalty) {
			bestPenalty = penalty;
			best = candidate;
		}
	}
	return best as QrMatrix;
}

function drawFunctionPatterns(
	modules: QrMatrix,
	reserved: boolean[][],
	version: number,
): void {
	const size = modules.length;
	const set = (x: number, y: number, dark: boolean) => {
		if (x < 0 || y < 0 || x >= size || y >= size) return;
		modules[y][x] = dark;
		reserved[y][x] = true;
	};

	// Timing patterns.
	for (let i = 0; i < size; i++) {
		set(6, i, i % 2 === 0);
		set(i, 6, i % 2 === 0);
	}

	// Finder patterns plus their separators, in three corners.
	for (const [cx, cy] of [
		[3, 3],
		[size - 4, 3],
		[3, size - 4],
	]) {
		for (let dy = -4; dy <= 4; dy++) {
			for (let dx = -4; dx <= 4; dx++) {
				const dist = Math.max(Math.abs(dx), Math.abs(dy));
				set(cx + dx, cy + dy, dist !== 2 && dist !== 4);
			}
		}
	}

	// Alignment patterns, skipping the three that would collide with finders.
	const positions = alignmentPositions(version);
	for (let i = 0; i < positions.length; i++) {
		for (let j = 0; j < positions.length; j++) {
			const corner =
				(i === 0 && j === 0) ||
				(i === 0 && j === positions.length - 1) ||
				(i === positions.length - 1 && j === 0);
			if (corner) continue;
			for (let dy = -2; dy <= 2; dy++) {
				for (let dx = -2; dx <= 2; dx++) {
					set(
						positions[j] + dx,
						positions[i] + dy,
						Math.max(Math.abs(dx), Math.abs(dy)) !== 1,
					);
				}
			}
		}
	}

	// Reserve the format areas; the real bits are written per mask later.
	// Index 6 is skipped: that cell belongs to the timing pattern, not the
	// format information, and blanking it here would erase a timing module.
	for (let i = 0; i < 9; i++) {
		if (i === 6) continue;
		set(i, 8, false);
		set(8, i, false);
	}
	for (let i = 0; i < 8; i++) {
		set(size - 1 - i, 8, false);
		set(8, size - 1 - i, false);
	}
	set(8, size - 8, true); // the always-dark module

	if (version >= 7) drawVersionBits(set, size, version);
}

function drawVersionBits(
	set: (x: number, y: number, dark: boolean) => void,
	size: number,
	version: number,
): void {
	let rem = version;
	for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
	const bits = (version << 12) | rem;
	for (let i = 0; i < 18; i++) {
		const dark = ((bits >>> i) & 1) !== 0;
		const a = size - 11 + (i % 3);
		const b = Math.floor(i / 3);
		set(a, b, dark);
		set(b, a, dark);
	}
}

function drawFormatBits(modules: QrMatrix, ecc: EccLevel, mask: number): void {
	const size = modules.length;
	const data = (ECC_FORMAT_BITS[ecc] << 3) | mask;
	let rem = data;
	for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
	const bits = ((data << 10) | rem) ^ 0x5412;

	// First copy: down the left of the top-left finder, then along its top.
	for (let i = 0; i <= 5; i++) modules[i][8] = getBit(bits, i);
	modules[7][8] = getBit(bits, 6);
	modules[8][8] = getBit(bits, 7);
	modules[8][7] = getBit(bits, 8);
	for (let i = 9; i < 15; i++) modules[8][14 - i] = getBit(bits, i);

	// Second copy, split between the other two finders.
	for (let i = 0; i < 8; i++) modules[8][size - 1 - i] = getBit(bits, i);
	for (let i = 8; i < 15; i++) modules[size - 15 + i][8] = getBit(bits, i);
}

/** Walk the zigzag of two-module-wide columns, skipping function patterns. */
function drawCodewords(
	modules: QrMatrix,
	reserved: boolean[][],
	codewords: Uint8Array,
): void {
	const size = modules.length;
	let i = 0; // bit index into the codeword stream
	for (let right = size - 1; right >= 1; right -= 2) {
		if (right === 6) right = 5; // the vertical timing pattern isn't a column
		for (let vert = 0; vert < size; vert++) {
			for (let j = 0; j < 2; j++) {
				const x = right - j;
				const upward = ((right + 1) & 2) === 0;
				const y = upward ? size - 1 - vert : vert;
				if (reserved[y][x] || i >= codewords.length * 8) continue;
				modules[y][x] = getBit(codewords[i >>> 3], 7 - (i & 7));
				i++;
			}
		}
	}
}

function applyMask(
	modules: QrMatrix,
	reserved: boolean[][],
	mask: number,
): void {
	const size = modules.length;
	for (let y = 0; y < size; y++) {
		for (let x = 0; x < size; x++) {
			if (reserved[y][x]) continue;
			if (maskAt(mask, x, y)) modules[y][x] = !modules[y][x];
		}
	}
}

function maskAt(mask: number, x: number, y: number): boolean {
	switch (mask) {
		case 0:
			return (x + y) % 2 === 0;
		case 1:
			return y % 2 === 0;
		case 2:
			return x % 3 === 0;
		case 3:
			return (x + y) % 3 === 0;
		case 4:
			return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
		case 5:
			return ((x * y) % 2) + ((x * y) % 3) === 0;
		case 6:
			return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
		default:
			return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
	}
}

/** The four ISO penalty rules, used to pick the least noisy-looking mask. */
function penaltyScore(modules: QrMatrix): number {
	const size = modules.length;
	let score = 0;

	// Rules 1 and 3: long same-colour runs, and finder-like 1:1:3:1:1 patterns.
	// Both are scanned along the rows and then along the columns.
	for (const byRow of [true, false]) {
		for (let a = 0; a < size; a++) {
			const at = (b: number) => (byRow ? modules[a][b] : modules[b][a]);
			const history = [0, 0, 0, 0, 0, 0, 0];
			let runColor = false;
			let runLength = 0;
			for (let b = 0; b < size; b++) {
				if (at(b) === runColor) {
					runLength++;
					if (runLength === 5) score += 3;
					else if (runLength > 5) score++;
				} else {
					addRun(runLength, history, size);
					if (!runColor) score += countFinderPatterns(history) * 40;
					runColor = at(b);
					runLength = 1;
				}
			}
			// Close the final run, counting the quiet zone past the edge as light.
			if (runColor) {
				addRun(runLength, history, size);
				runLength = 0;
			}
			addRun(runLength + size, history, size);
			score += countFinderPatterns(history) * 40;
		}
	}

	// Rule 2: solid 2x2 blocks.
	for (let y = 0; y < size - 1; y++) {
		for (let x = 0; x < size - 1; x++) {
			const c = modules[y][x];
			if (c === modules[y][x + 1] && c === modules[y + 1][x] && c === modules[y + 1][x + 1]) {
				score += 3;
			}
		}
	}

	// Rule 4: deviation from a 50/50 dark/light balance.
	let dark = 0;
	for (const row of modules) for (const cell of row) if (cell) dark++;
	const total = size * size;
	const k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
	score += k * 10;

	return score;
}

/** Push a run length onto the history, newest first. */
function addRun(runLength: number, history: number[], size: number): void {
	// An empty history means this is the leading run, which the quiet zone extends.
	if (history[0] === 0) runLength += size;
	history.pop();
	history.unshift(runLength);
}

/** How many of the two finder-like 1:1:3:1:1 arrangements the history ends in. */
function countFinderPatterns(history: number[]): number {
	const n = history[1];
	const core =
		n > 0 && history[2] === n && history[3] === n * 3 && history[4] === n && history[5] === n;
	return (
		(core && history[0] >= n * 4 && history[6] >= n ? 1 : 0) +
		(core && history[6] >= n * 4 && history[0] >= n ? 1 : 0)
	);
}

/* ---- version arithmetic ------------------------------------------------ */

function alignmentPositions(version: number): number[] {
	if (version === 1) return [];
	const count = Math.floor(version / 7) + 2;
	const step =
		version === 32 ? 26 : Math.ceil((version * 4 + 4) / (count * 2 - 2)) * 2;
	const result = [6];
	for (let pos = version * 4 + 10; result.length < count; pos -= step)
		result.splice(1, 0, pos);
	return result;
}

/** Modules available for data and ECC, once function patterns are removed. */
function rawDataModules(version: number): number {
	let result = (16 * version + 128) * version + 64;
	if (version >= 2) {
		const numAlign = Math.floor(version / 7) + 2;
		result -= (25 * numAlign - 10) * numAlign - 55;
		if (version >= 7) result -= 36;
	}
	return result;
}

function dataCodewords(version: number, ecc: EccLevel): number {
	return (
		(rawDataModules(version) >>> 3) -
		ECC_CODEWORDS_PER_BLOCK[ecc][version] * ECC_BLOCKS[ecc][version]
	);
}

const getBit = (value: number, index: number): boolean =>
	((value >>> index) & 1) !== 0;
