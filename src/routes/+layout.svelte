<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import UpdatePrompt from '$lib/components/UpdatePrompt.svelte';
	import { pwa } from '$lib/pwa.svelte';
	import { game } from '$lib/stores/game.svelte';

	let { children } = $props();

	// Keeps an installed PWA on the latest build (see `$lib/pwa.svelte.ts`).
	// Reloading would drop the peer connection, so an online game holds it off.
	pwa.deferSwap = () => game.isOnline;
	pwa.start();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<UpdatePrompt />

{@render children()}
