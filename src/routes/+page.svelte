<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { game, hasSavedGame } from '$lib/stores/game.svelte';
	import InstallButton from '$lib/components/InstallButton.svelte';

	let saved = $state(false);
	onMount(() => {
		saved = hasSavedGame();
	});

	function start(mode: '1p' | '2p') {
		game.newGame(mode);
		goto(`${base}/play`);
	}
	function resume() {
		if (game.resume()) goto(`${base}/play`);
		else saved = false;
	}
</script>

<svelte:head>
	<title>Mille Bornes — 1000 Miles</title>
</svelte:head>

<main class="relative mx-auto flex min-h-[100dvh] max-w-md flex-col items-center justify-center px-6 py-10">
	<!-- floating decorations -->
	<div class="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
		<span class="absolute left-6 top-16 text-3xl opacity-60 [animation:float_6s_ease-in-out_infinite]">🛣️</span>
		<span class="absolute right-8 top-28 text-2xl opacity-50 [animation:float_7s_ease-in-out_infinite_0.5s]">⛽</span>
		<span class="absolute bottom-28 left-10 text-2xl opacity-50 [animation:float_5.5s_ease-in-out_infinite_0.2s]">🛞</span>
		<span class="absolute bottom-40 right-10 text-3xl opacity-60 [animation:float_6.5s_ease-in-out_infinite_0.8s]">🏁</span>
	</div>

	<div class="relative text-center">
		<div class="mb-3 inline-grid place-items-center text-6xl drop-shadow-[0_6px_0_rgba(0,0,0,0.12)]">🏎️</div>
		<h1 class="font-display text-5xl font-extrabold leading-none text-asphalt drop-shadow-[0_3px_0_rgba(255,255,255,0.6)]">
			Mille Bornes
		</h1>
		<p class="mt-2 font-display text-lg font-bold text-road-600">Race to 1000 · match to 3000</p>
	</div>

	<div class="relative mt-10 flex w-full flex-col gap-3">
		{#if saved}
			<button
				onclick={resume}
				class="rounded-2xl bg-amber-400 px-5 py-4 font-display text-lg font-extrabold text-asphalt
					shadow-[0_5px_0_#d97706] transition active:translate-y-1 active:shadow-none"
			>
				▶ Continue game
			</button>
		{/if}
		<button
			onclick={() => start('1p')}
			class="rounded-2xl bg-road-500 px-5 py-4 font-display text-lg font-extrabold text-white
				shadow-[0_5px_0_var(--color-road-700)] transition active:translate-y-1 active:shadow-none"
		>
			🤖 Solo vs AI
		</button>
		<button
			onclick={() => start('2p')}
			class="rounded-2xl bg-rose-500 px-5 py-4 font-display text-lg font-extrabold text-white
				shadow-[0_5px_0_#be123c] transition active:translate-y-1 active:shadow-none"
		>
			🧑‍🤝‍🧑 2 Players (pass &amp; play)
		</button>
		<a
			href="{base}/online"
			class="rounded-2xl bg-emerald-500 px-5 py-4 text-center font-display text-lg font-extrabold text-white
				shadow-[0_5px_0_#15803d] transition active:translate-y-1 active:shadow-none"
		>
			🛰️ Play online (same Wi-Fi)
		</a>
		<a
			href="{base}/rules"
			class="rounded-2xl border-2 border-asphalt/10 bg-white/70 px-5 py-3 text-center font-display text-base font-bold text-asphalt/70
				transition hover:bg-white active:translate-y-0.5"
		>
			📖 How to play
		</a>
	</div>

	<div class="relative mt-8 flex flex-col items-center gap-3">
		<InstallButton />
		<p class="text-center text-[0.7rem] font-semibold uppercase tracking-widest text-asphalt/30">
			Installable · works offline
		</p>
	</div>
</main>

<style>
	@keyframes -global-float {
		0%,
		100% {
			transform: translateY(0) rotate(-4deg);
		}
		50% {
			transform: translateY(-12px) rotate(4deg);
		}
	}
</style>
