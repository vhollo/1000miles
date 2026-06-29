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

<main class="relative mx-auto flex min-h-[100dvh] max-w-sm flex-col items-center justify-center px-8 py-12">

	<!-- Title block -->
	<div class="w-full text-center">
		<!-- Decorative rule -->
		<div class="mb-4 flex items-center gap-3">
			<hr class="flex-1 border-[#B8880E]/50" />
			<span class="text-[#B8880E] text-lg">✦</span>
			<hr class="flex-1 border-[#B8880E]/50" />
		</div>

		<p class="font-body text-[0.7rem] font-semibold uppercase tracking-[0.3em] text-[#1C120A]/50">
			Jeu de cartes — 1954
		</p>
		<h1 class="mt-1 font-display text-5xl font-black italic leading-none text-[#1B3A6B]">
			Mille<br>Bornes
		</h1>
		<p class="mt-2 font-body text-sm text-[#1C120A]/55">
			La course aux 1000 km · objectif 3000 pts
		</p>

		<div class="my-4 flex items-center gap-3">
			<hr class="flex-1 border-[#B8880E]/50" />
			<span class="text-[#B8880E] text-lg">✦</span>
			<hr class="flex-1 border-[#B8880E]/50" />
		</div>
	</div>

	<!-- Buttons -->
	<div class="mt-2 flex w-full flex-col gap-2.5">
		{#if saved}
			<button
				onclick={resume}
				class="w-full rounded-[3px] border border-[#8A5A08] bg-[#B8880E] px-5 py-3.5
					font-display text-base font-bold text-white
					shadow-[0_4px_0_#6A3C04] transition active:translate-y-1 active:shadow-none"
			>
				▶ Continuer la partie
			</button>
		{/if}
		<button
			onclick={() => start('1p')}
			class="w-full rounded-[3px] border border-[#0F2042] bg-[#1B3A6B] px-5 py-3.5
				font-display text-base font-bold text-[#EDE0BE]
				shadow-[0_4px_0_#0A1428] transition active:translate-y-1 active:shadow-none"
		>
			Solo contre l'ordinateur
		</button>
		<button
			onclick={() => start('2p')}
			class="w-full rounded-[3px] border border-[#6A0818] bg-[#9A1020] px-5 py-3.5
				font-display text-base font-bold text-[#EDE0BE]
				shadow-[0_4px_0_#4A0410] transition active:translate-y-1 active:shadow-none"
		>
			2 Joueurs (passer l'appareil)
		</button>
		<a
			href="{base}/online"
			class="block w-full rounded-[3px] border border-[#0E3020] bg-[#1A5430] px-5 py-3.5
				text-center font-display text-base font-bold text-[#EDE0BE]
				shadow-[0_4px_0_#091E18] transition active:translate-y-1 active:shadow-none"
		>
			En ligne (même réseau)
		</a>
		<a
			href="{base}/rules"
			class="block w-full rounded-[3px] border border-[#C4A878]/80 bg-[#FBF5E4] px-5 py-3
				text-center font-display text-sm font-bold text-[#1C120A]/70
				shadow-[0_3px_0_rgba(0,0,0,0.08)] transition active:translate-y-0.5 active:shadow-none"
		>
			Règles du jeu
		</a>
	</div>

	<div class="mt-8 flex flex-col items-center gap-2">
		<InstallButton />
		<p class="text-center font-body text-[0.65rem] uppercase tracking-widest text-[#1C120A]/30">
			Installable · fonctionne hors ligne
		</p>
	</div>
</main>
