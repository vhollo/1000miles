<script lang="ts">
	import { encodeQr, type EccLevel, type QrMatrix } from '$lib/net/qr';

	let {
		value,
		ecc = 'L',
		alt = 'Pairing QR code'
	}: { value: string; ecc?: EccLevel; alt?: string } = $props();

	/** Quiet zone in modules — scanners need a light margin to find the symbol. */
	const QUIET = 4;

	let matrix = $derived.by<QrMatrix | null>(() => {
		try {
			return encodeQr(value, ecc);
		} catch {
			return null; // payload past the version 40 capacity
		}
	});
	let size = $derived((matrix?.length ?? 0) + QUIET * 2);

	/**
	 * One path for the whole symbol rather than a rect per module: a handshake
	 * link is a ~100x100 grid, and 10k elements would crawl. Runs of adjacent
	 * dark modules merge into a single wide rectangle.
	 */
	let path = $derived.by(() => {
		if (!matrix) return '';
		const parts: string[] = [];
		for (let y = 0; y < matrix.length; y++) {
			let run = 0;
			for (let x = 0; x <= matrix.length; x++) {
				if (matrix[y][x]) {
					run++;
					continue;
				}
				if (run > 0) parts.push(`M${x - run + QUIET} ${y + QUIET}h${run}v1h-${run}z`);
				run = 0;
			}
		}
		return parts.join('');
	});
</script>

{#if matrix}
	<svg
		viewBox="0 0 {size} {size}"
		role="img"
		aria-label={alt}
		class="h-auto w-full max-w-[19rem] rounded-xl bg-white shadow-[0_4px_24px_rgba(0,0,0,0.35)]"
		shape-rendering="crispEdges"
	>
		<rect width={size} height={size} fill="#fff" />
		<path d={path} fill="#000" />
	</svg>
{/if}
