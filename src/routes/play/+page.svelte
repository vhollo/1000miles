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

	const viewer = $derived<PlayerIndex>(
		game.isOnline ? game.seat : game.mode === '1p' ? 0 : game.active
	);

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

	const label = $derived(game.isOnline ? 'En ligne' : game.mode === '1p' ? 'Solo' : '2 Joueurs');
</script>

<svelte:head>
	<title>Mille Bornes — En jeu</title>
</svelte:head>

{#if ready}
	<div class="flex min-h-[100dvh] flex-col">
		<header class="flex items-center justify-between border-b border-[#C4A878]/50 bg-[#EDE0BE]/80 px-4 py-2 backdrop-blur-sm">
			<button
				onclick={quit}
				class="rounded-[3px] border border-[#C4A878]/80 bg-[#FBF5E4] px-3 py-1.5 font-body text-xs font-semibold text-[#1C120A]/60
					shadow-[0_2px_0_rgba(0,0,0,0.08)] transition hover:bg-white active:translate-y-0.5 active:shadow-none"
			>
				← Quitter
			</button>
			<div class="text-center leading-tight">
				<p class="flex items-center justify-center gap-1.5 font-display text-sm font-bold text-[#1C120A]/50">
					{#if game.isOnline}
						<span class="h-2 w-2 rounded-full {game.connected ? 'bg-[#1A5430]' : 'bg-[#9A1020]'}"></span>
					{/if}
					{label}{#if game.state} · Manche {game.state.hand}{/if}
				</p>
				{#if game.state?.matchScores}
					<p class="font-body text-xs tabular-nums text-[#1C120A]/40">
						{game.state.matchScores[0]} – {game.state.matchScores[1]}
						<span class="text-[#1C120A]/30">/ {game.state.matchTarget}</span>
					</p>
				{/if}
			</div>
			<span class="w-16"></span>
		</header>

		<div class="relative flex-1">
			{#if game.state}
				<Board {viewer} />
			{:else}
				<div class="grid h-full place-items-center text-center">
					<div>
						<p class="font-display text-lg font-bold text-[#1C120A]/50">Connexion…</p>
					</div>
				</div>
			{/if}

			{#if covered}
				<div
					class="absolute inset-0 z-40 grid place-items-center bg-[#EDE0BE]/95 backdrop-blur-md"
					transition:fly={{ y: 20, duration: 200 }}
				>
					<div class="text-center px-8">
						<div class="mb-4 flex items-center gap-3">
							<hr class="flex-1 border-[#B8880E]/50" />
							<span class="text-[#B8880E]">✦</span>
							<hr class="flex-1 border-[#B8880E]/50" />
						</div>
						<p class="font-body text-sm uppercase tracking-widest text-[#1C120A]/40">
							Passez l'appareil à
						</p>
						<h2 class="font-display text-3xl font-bold italic text-[#1C120A]">
							{game.state?.players[game.active].name}
						</h2>
						<div class="my-4 flex items-center gap-3">
							<hr class="flex-1 border-[#B8880E]/50" />
							<span class="text-[#B8880E]">✦</span>
							<hr class="flex-1 border-[#B8880E]/50" />
						</div>
						<button
							onclick={() => (covered = false)}
							class="rounded-[3px] border border-[#0F2042] bg-[#1B3A6B] px-8 py-4 font-display text-lg font-bold text-[#EDE0BE]
								shadow-[0_5px_0_#0A1428] transition active:translate-y-1 active:shadow-none"
						>
							Prêt
						</button>
					</div>
				</div>
			{/if}

			{#if game.isOnline && !game.connected && game.state}
				<div class="absolute inset-0 z-40 grid place-items-center bg-[#EDE0BE]/95 backdrop-blur-md">
					<div class="text-center px-8">
						<h2 class="font-display text-2xl font-bold text-[#1C120A]">Connexion perdue</h2>
						<p class="mt-1 font-body text-sm text-[#1C120A]/60">La connexion avec l'adversaire a été interrompue.</p>
						<button
							onclick={quit}
							class="mt-6 rounded-[3px] border border-[#6A0818] bg-[#9A1020] px-8 py-4 font-display text-lg font-bold text-[#EDE0BE]
								shadow-[0_5px_0_#4A0410] transition active:translate-y-1 active:shadow-none"
						>
							Retour au menu
						</button>
					</div>
				</div>
			{/if}
		</div>
	</div>
{/if}
