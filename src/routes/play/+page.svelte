<script lang="ts">
	import { onMount } from 'svelte';
	import { fly } from 'svelte/transition';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import Board from '$lib/components/Board.svelte';
	import { game } from '$lib/stores/game.svelte';
	import type { PlayerIndex } from '$lib/game/state';

	let ready = $state(false);

	// Keep the screen awake so mobile browsers don't suspend JS and drop the connection.
	let wakeLock: WakeLockSentinel | null = null;
	async function acquireWakeLock() {
		try {
			if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen');
		} catch { /* not granted — proceed without it */ }
	}
	function onVisibilityChange() {
		if (document.visibilityState === 'visible') acquireWakeLock();
	}

	onMount(() => {
		acquireWakeLock();
		document.addEventListener('visibilitychange', onVisibilityChange);

		// Online guests may arrive a beat before the first state broadcast.
		if (game.state || game.isOnline) {
			ready = true;
			return;
		}
		if (game.resume()) {
			ready = true;
			return;
		}
		goto(`${base}/`);

		return () => {
			wakeLock?.release().catch(() => {});
			document.removeEventListener('visibilitychange', onVisibilityChange);
		};
	});

	// Online: you always sit in your own seat. Offline solo: seat 0; offline 2P:
	// whoever is active (with a hand-off gate between turns).
	const viewer = $derived<PlayerIndex>(
		game.isOnline ? game.seat : game.mode === '1p' ? 0 : game.active
	);

	// Pass-and-play hand-off (offline 2P only).
	let covered = $state(false);
	let prevActive: PlayerIndex | null = null;
	$effect(() => {
		const a = game.active;
		if (!game.isOnline && game.mode === '2p' && !game.isOver) {
			if (prevActive !== null && a !== prevActive) covered = true;
		}
		prevActive = a;
	});

	function quit() {
		game.clear();
		goto(`${base}/`);
	}

	const label = $derived(game.isOnline ? 'Online' : game.mode === '1p' ? 'Solo' : '2 Player');
</script>

<svelte:head>
	<title>Mille Bornes — Playing</title>
</svelte:head>

{#if ready}
	<div class="flex min-h-[100dvh] flex-col">
		<header class="flex items-center justify-between px-4 py-2">
			<button
				onclick={quit}
				class="rounded-full bg-white/70 px-3 py-1.5 text-xs font-bold text-asphalt/70 ring-1 ring-asphalt/10 transition hover:bg-white"
			>
				← Quit
			</button>
			<div class="text-center leading-tight">
				<p
					class="flex items-center justify-center gap-1.5 font-display text-sm font-extrabold text-asphalt/50"
				>
					{#if game.isOnline}
						<span
							class="h-2 w-2 rounded-full {game.connected ? 'bg-emerald-500' : 'bg-rose-500'}"
						></span>
					{/if}
					{label}{#if game.state}
						· Hand {game.state.hand}{/if}
				</p>
				{#if game.state?.matchScores}
					<p class="font-display text-xs font-bold tabular-nums text-asphalt/40">
						{game.state.matchScores[0]} – {game.state.matchScores[1]}
						<span class="font-semibold text-asphalt/30">to {game.state.matchTarget}</span>
					</p>
				{/if}
			</div>
			<span class="w-12"></span>
		</header>

		<div class="relative flex-1">
			{#if game.state}
				<Board {viewer} />
			{:else}
				<div class="grid h-full place-items-center text-center">
					<div>
						<div class="mb-2 text-4xl">🛰️</div>
						<p class="font-display font-bold text-asphalt/60">Connecting…</p>
					</div>
				</div>
			{/if}

			{#if covered}
				<div
					class="absolute inset-0 z-40 grid place-items-center bg-cream/95 backdrop-blur-md"
					transition:fly={{ y: 20, duration: 200 }}
				>
					<div class="text-center">
						<div class="mb-3 text-5xl">🤝</div>
						<p class="font-display text-sm font-bold uppercase tracking-widest text-asphalt/40">
							Pass the device to
						</p>
						<h2 class="font-display text-3xl font-extrabold text-asphalt">
							{game.state?.players[game.active].name}
						</h2>
						<button
							onclick={() => (covered = false)}
							class="mt-6 rounded-2xl bg-road-500 px-8 py-4 font-display text-lg font-extrabold text-white
								shadow-[0_5px_0_var(--color-road-700)] transition active:translate-y-1 active:shadow-none"
						>
							I'm ready
						</button>
					</div>
				</div>
			{/if}

			{#if game.isOnline && !game.connected && game.state}
				<div class="absolute inset-0 z-40 grid place-items-center bg-cream/95 backdrop-blur-md">
					<div class="text-center">
						<div class="mb-3 text-5xl">🔌</div>
						<h2 class="font-display text-2xl font-extrabold text-asphalt">Opponent disconnected</h2>
						<p class="mt-1 text-sm text-asphalt/60">The connection to the other player was lost.</p>
						<button
							onclick={quit}
							class="mt-6 rounded-2xl bg-road-500 px-8 py-4 font-display text-lg font-extrabold text-white
								shadow-[0_5px_0_var(--color-road-700)] transition active:translate-y-1 active:shadow-none"
						>
							Back to menu
						</button>
					</div>
				</div>
			{/if}
		</div>
	</div>
{/if}
