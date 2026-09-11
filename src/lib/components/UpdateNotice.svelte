<script lang="ts">
	import { pwa } from '$lib/pwa.svelte';
</script>

{#if pwa.updating}
	<div
		class="safe-top pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center px-4 py-3"
		role="status"
	>
		<div
			class="flex items-center gap-2 rounded-full border-2 border-amber-300 bg-asphalt/95 px-4 py-2 shadow-[0_6px_20px_rgba(0,0,0,0.45)] backdrop-blur-sm"
		>
			<span
				class="h-3 w-3 animate-spin rounded-full border-2 border-amber-300 border-t-transparent"
				aria-hidden="true"
			></span>
			<span class="font-display text-sm font-bold text-cream">New version — updating…</span>
		</div>
	</div>
{/if}
