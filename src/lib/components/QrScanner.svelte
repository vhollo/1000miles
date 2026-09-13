<script lang="ts">
	import { browser } from '$app/environment';

	let { onscan, hint = '' }: { onscan: (text: string) => void; hint?: string } = $props();

	/**
	 * Not in lib.dom, and not everywhere at runtime either — Chrome on Android
	 * has it, Safari does not. Where it's missing we point people at the
	 * phone's own camera app instead (see `unsupported`).
	 */
	type BarcodeDetectorLike = { detect(source: CanvasImageSource): Promise<{ rawValue: string }[]> };
	type BarcodeDetectorCtor = new (opts: { formats: string[] }) => BarcodeDetectorLike;

	const detectorCtor = browser
		? ((window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector ?? null)
		: null;
	// The camera needs a secure context: https, or localhost while developing.
	const unsupported = browser && (!detectorCtor || !window.isSecureContext);

	let video = $state<HTMLVideoElement | null>(null);
	let scanning = $state(false);
	let error = $state<string | null>(null);
	let stream: MediaStream | null = null;
	let timer: ReturnType<typeof setInterval> | null = null;

	async function start() {
		error = null;
		try {
			stream = await navigator.mediaDevices.getUserMedia({
				video: { facingMode: { ideal: 'environment' } }
			});
		} catch (e) {
			error =
				e instanceof DOMException && e.name === 'NotAllowedError'
					? 'Camera access was blocked. Allow it, or paste the code instead.'
					: 'No camera available — paste the code instead.';
			return;
		}
		scanning = true;
		// The <video> only exists once `scanning` flips, so wait for the DOM.
		await Promise.resolve();
		if (!video || !stream) return;
		video.srcObject = stream;
		await video.play().catch(() => {});

		const detector = new detectorCtor!({ formats: ['qr_code'] });
		timer = setInterval(async () => {
			if (!video || video.readyState < 2) return;
			try {
				const [found] = await detector.detect(video);
				if (found?.rawValue) {
					stop();
					onscan(found.rawValue);
				}
			} catch {
				/* a dropped frame — keep looking */
			}
		}, 200);
	}

	function stop() {
		if (timer) clearInterval(timer);
		timer = null;
		stream?.getTracks().forEach((t) => t.stop());
		stream = null;
		scanning = false;
	}

	// Release the camera when this component goes away.
	$effect(() => stop);
</script>

{#if unsupported}
	<p class="text-xs text-white/50">
		This browser can't scan in-page — use your phone's camera app on the QR code, or paste the code
		below.
	</p>
{:else if scanning}
	<div class="overflow-hidden rounded-xl border-2 border-amber-300/60 bg-black">
		<!-- svelte-ignore a11y_media_has_caption -->
		<video bind:this={video} playsinline muted class="aspect-square w-full object-cover"></video>
	</div>
	<button
		onclick={stop}
		class="mt-2 w-full rounded-xl border border-white/30 bg-white/20 px-3 py-2 text-sm font-bold text-white backdrop-blur-sm transition active:translate-y-0.5"
	>
		Stop scanning
	</button>
{:else}
	<button
		onclick={start}
		class="w-full rounded-xl border-2 border-amber-300 bg-amber-400 px-3 py-2.5 font-display font-black text-asphalt shadow-[0_3px_0_#a16207] transition active:translate-y-0.5 active:shadow-none"
	>
		📷 Scan their QR code
	</button>
	{#if hint}
		<p class="mt-1 text-xs text-white/50">{hint}</p>
	{/if}
{/if}

{#if error}
	<p class="mt-2 text-xs font-semibold text-red-300">{error}</p>
{/if}
