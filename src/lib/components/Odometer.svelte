<script lang="ts">
	import { Tween } from 'svelte/motion';
	import { cubicOut } from 'svelte/easing';

	let { miles, accent = 'road' }: { miles: number; accent?: 'road' | 'rose' } = $props();

	const shown = Tween.of(() => miles, { duration: 700, easing: cubicOut });

	const pct = $derived(Math.min(100, (miles / 1000) * 100));
	const fill = $derived(accent === 'rose' ? 'bg-[#9A1020]' : 'bg-[#1B3A6B]');
</script>

<div class="w-full">
	<div class="mb-1 flex items-baseline justify-between">
		<span class="font-display text-2xl font-bold tabular-nums text-[#1C120A]">{Math.round(shown.current)}</span>
		<span class="font-body text-[0.65rem] uppercase tracking-widest text-[#1C120A]/40">/ 1000 km</span>
	</div>
	<div class="relative h-2.5 overflow-hidden rounded-sm border border-[#C4A878]/50 bg-[#EDE0BE]">
		<!-- dashed road centre line -->
		<div
			class="absolute inset-y-1/2 left-0 h-px w-full -translate-y-1/2
				bg-[repeating-linear-gradient(90deg,transparent_0_5px,rgba(255,255,255,.5)_5px_10px)]"
		></div>
		<div
			class="relative h-full rounded-sm {fill} transition-[width] duration-700 ease-out"
			style="width: {pct}%"
		></div>
	</div>
	<!-- the little car rolling along -->
	<div class="relative mt-0.5 h-4">
		<span
			class="absolute -translate-x-1/2 transition-[left] duration-700 ease-out"
			style="left: {pct}%"
		>
			<span class="inline-block text-sm [transform:scaleX(-1)]">🏎️</span>
		</span>
	</div>
</div>
