<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { game, hasSavedGame } from '$lib/stores/game.svelte';
	import { partners } from '$lib/partners/store.svelte';
	import InstallButton from '$lib/components/InstallButton.svelte';

	let saved = $state(false);
	onMount(() => {
		saved = hasSavedGame();
		partners.load();
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

<main class="safe-top safe-bottom relative mx-auto flex min-h-[100dvh] max-w-md flex-col items-center justify-center px-6 py-10">
	<!-- Floating decorations -->
	<div class="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
		<span class="absolute left-6 top-16 text-3xl opacity-30 [animation:float_6s_ease-in-out_infinite]">🚗</span>
		<span class="absolute right-8 top-28 text-2xl opacity-25 [animation:float_7s_ease-in-out_infinite_0.5s]">⛽</span>
		<span class="absolute bottom-28 left-10 text-2xl opacity-25 [animation:float_5.5s_ease-in-out_infinite_0.2s]">🛞</span>
		<span class="absolute bottom-40 right-10 text-3xl opacity-30 [animation:float_6.5s_ease-in-out_infinite_0.8s]">🏁</span>
	</div>

	<!-- Title card -->
	<div class="relative text-center">
		<div class="mb-3 inline-block">
			<div class="rounded-2xl border-4 border-white/20 bg-white/10 px-8 py-5 backdrop-blur-sm shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
				<p class="font-display text-[0.65rem] font-bold uppercase tracking-[0.3em] text-amber-300/80">The Classic Racing Game</p>
				<h1 class="font-display text-5xl font-black leading-none tracking-tight text-white drop-shadow-[0_3px_0_rgba(0,0,0,0.5)]">
					Mille<br>Bornes
				</h1>
				<p class="mt-1 font-display text-sm font-bold text-white/50">Race to 1000 · match to 3000</p>
			</div>
		</div>
	</div>

	<!-- Action buttons -->
	<div class="relative mt-6 flex w-full flex-col gap-3">
		{#if saved}
			<button
				onclick={resume}
				class="rounded-xl border-2 border-amber-300 bg-amber-400 px-5 py-4 font-display text-lg font-black text-asphalt
					shadow-[0_5px_0_#b45309] transition active:translate-y-1 active:shadow-none"
			>
				▶ Continue game
			</button>
		{/if}
		<button
			onclick={() => start('1p')}
			class="rounded-xl border-2 border-blue-400 bg-mb-blue px-5 py-4 font-display text-lg font-black text-white
				shadow-[0_5px_0_#102f6e] transition active:translate-y-1 active:shadow-none"
		>
			🤖 Solo vs AI
		</button>
		<button
			onclick={() => start('2p')}
			class="rounded-xl border-2 border-red-400 bg-mb-red px-5 py-4 font-display text-lg font-black text-white
				shadow-[0_5px_0_#9b0f0f] transition active:translate-y-1 active:shadow-none"
		>
			🧑‍🤝‍🧑 2 Players (pass &amp; play)
		</button>
		<a
			href="{base}/online"
			class="rounded-xl border-2 border-green-400 bg-mb-green px-5 py-4 text-center font-display text-lg font-black text-white
				shadow-[0_5px_0_#145a14] transition active:translate-y-1 active:shadow-none"
		>
			🛰️ Play online
		</a>
		{#if partners.list.length > 0}
			<a
				href="{base}/online?invite=1"
				class="rounded-xl border-2 border-white/20 bg-white/10 px-5 py-3 text-center font-display text-base font-bold text-white/80
					backdrop-blur-sm transition hover:bg-white/20 active:translate-y-0.5"
			>
				🔔 Invite a partner
			</a>
		{/if}
		<a
			href="{base}/rules"
			class="rounded-xl border-2 border-white/20 bg-white/10 px-5 py-3 text-center font-display text-base font-bold text-white/80
				backdrop-blur-sm transition hover:bg-white/20 active:translate-y-0.5"
		>
			📖 How to play
		</a>
	</div>

	<div class="relative mt-8 flex flex-col items-center gap-3">
		<InstallButton />
		<p class="text-center text-[0.65rem] font-bold uppercase tracking-widest text-white/25">
			Installable · works offline
		</p>
	</div>
</main>

<style>
	@keyframes -global-float {
		0%, 100% { transform: translateY(0) rotate(-4deg); }
		50%       { transform: translateY(-12px) rotate(4deg); }
	}
</style>
