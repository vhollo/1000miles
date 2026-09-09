<script lang="ts">
	import { pwa } from '$lib/pwa.svelte';
</script>

{#if pwa.ready}
	<div
		class="safe-top pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center px-4 py-3"
		role="status"
	>
		<div
			class="pointer-events-auto flex items-center gap-3 rounded-full border-2 border-amber-300 bg-asphalt/95 px-4 py-2 shadow-[0_6px_20px_rgba(0,0,0,0.45)] backdrop-blur-sm"
		>
			<span class="font-display text-sm font-bold text-cream">✨ New version ready</span>
			<button
				onclick={() => pwa.apply()}
				class="rounded-full bg-amber-400 px-3 py-1 font-display text-sm font-black text-asphalt transition active:translate-y-0.5"
			>
				Update
			</button>
		</div>
	</div>
{/if}
