<script lang="ts">
	import { Tween } from 'svelte/motion';
	import { cubicOut } from 'svelte/easing';

	let { miles, accent = 'road' }: { miles: number; accent?: 'road' | 'rose' } = $props();

	// follows `miles` reactively and animates between values
	const shown = Tween.of(() => miles, { duration: 700, easing: cubicOut });

	const pct = $derived(Math.min(100, (miles / 1000) * 100));
	const fill = $derived(accent === 'rose' ? 'bg-rose-500' : 'bg-road-500');
</script>

<div class="w-full">
	<div class="mb-1 flex items-baseline justify-between font-display">
		<span class="text-2xl font-extrabold tabular-nums text-asphalt">{Math.round(shown.current)}</span>
		<span class="text-xs font-bold uppercase tracking-widest text-asphalt/40">/ 1000 mi</span>
	</div>
	<div class="relative h-3 overflow-hidden rounded-full bg-asphalt/10 ring-1 ring-inset ring-asphalt/10">
		<!-- dashed road centre line -->
		<div
			class="absolute inset-y-1/2 left-0 h-px w-full -translate-y-1/2
				bg-[repeating-linear-gradient(90deg,transparent_0_6px,rgba(255,255,255,.6)_6px_12px)]"
		></div>
		<div
			class="relative h-full rounded-full {fill} transition-[width] duration-700 ease-out"
			style="width: {pct}%"
		></div>
	</div>
	<!-- the little car rolling along -->
	<div class="relative mt-0.5 h-4">
		<span
			class="absolute -translate-x-1/2 transition-[left] duration-700 ease-out"
			style="left: {pct}%"
		>
			<!-- the 🏎️ glyph faces left, so flip it to drive toward the finish -->
			<span class="inline-block text-sm [transform:scaleX(-1)]">🏎️</span>
		</span>
	</div>
</div>
