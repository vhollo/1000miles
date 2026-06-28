<script lang="ts">
	import { fade, scale } from 'svelte/transition';
	import { backOut } from 'svelte/easing';
	import type { Snippet } from 'svelte';

	let {
		open = false,
		children,
		labelledby
	}: { open?: boolean; children: Snippet; labelledby?: string } = $props();
</script>

{#if open}
	<div
		class="fixed inset-0 z-50 grid place-items-center p-4"
		role="dialog"
		aria-modal="true"
		aria-labelledby={labelledby}
		transition:fade={{ duration: 150 }}
	>
		<div class="absolute inset-0 bg-asphalt/55 backdrop-blur-sm"></div>
		<div
			class="relative w-full max-w-sm rounded-3xl border-4 border-white bg-cream p-5
				shadow-[0_18px_0_rgba(0,0,0,0.18)]"
			transition:scale={{ duration: 260, start: 0.85, easing: backOut }}
		>
			{@render children()}
		</div>
	</div>
{/if}
