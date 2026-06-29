<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { game } from '$lib/stores/game.svelte';
	import SignalExchange from '$lib/components/SignalExchange.svelte';

	type Mode = 'menu' | 'host' | 'join' | 'manual';
	let mode = $state<Mode>('menu');

	let roomCode = $state('');
	let joinCode = $state('');
	let busy = $state(false);
	let error = $state<string | null>(null);

	let manualStep = $state<'choose' | 'host' | 'joinInput' | 'guest'>('choose');
	let offerCode = $state('');
	let answerCode = $state('');
	let pasteValue = $state('');
	let origin = $state('');

	onMount(() => {
		origin = location.origin;
		const hash = new URLSearchParams(location.hash.slice(1));
		const invite = hash.get('j');
		if (invite) {
			history.replaceState(null, '', location.pathname);
			mode = 'manual';
			void manualJoin(invite);
		}
	});

	$effect(() => {
		if (game.connected) goto(`${base}/play`);
	});
	$effect(() => {
		if (game.netError) {
			error = game.netError;
			busy = false;
		}
	});

	async function hostGame() {
		mode = 'host';
		busy = true;
		error = null;
		try {
			roomCode = await game.hostRoom();
		} catch {
			error = 'Impossible de créer la salle. Êtes-vous connecté ?';
		}
		busy = false;
	}

	async function joinGame() {
		busy = true;
		error = null;
		try {
			await game.joinRoom(joinCode);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Impossible de rejoindre cette salle.';
			busy = false;
		}
	}

	function shareLink(key: 'j' | 'a', code: string): string {
		return origin ? `${origin}${base}/online#${key}=${code}` : '';
	}
	async function manualHost() {
		manualStep = 'host';
		busy = true;
		error = null;
		try {
			offerCode = await game.beginHost();
		} catch {
			error = "Impossible de démarrer l'hébergement.";
		}
		busy = false;
	}
	async function manualJoin(invite: string) {
		manualStep = 'guest';
		busy = true;
		error = null;
		try {
			answerCode = await game.beginGuest(invite);
		} catch {
			error = "Code d'invitation invalide.";
			manualStep = 'joinInput';
		}
		busy = false;
	}
	async function manualConnect() {
		busy = true;
		error = null;
		try {
			await game.submitAnswer(pasteValue);
		} catch {
			error = "Code de réponse invalide.";
		}
		busy = false;
	}

	function cancel() {
		game.clear();
		goto(`${base}/`);
	}
</script>

<svelte:head>
	<title>En ligne — Mille Bornes</title>
</svelte:head>

<main class="mx-auto flex min-h-[100dvh] max-w-sm flex-col px-6 py-6">
	<button onclick={cancel} class="self-start font-body text-sm font-semibold text-[#1B3A6B]">← Retour</button>

	<div class="mt-4 flex items-center gap-3">
		<hr class="flex-1 border-[#B8880E]/50" />
		<span class="text-[#B8880E]">✦</span>
		<hr class="flex-1 border-[#B8880E]/50" />
	</div>
	<h1 class="mt-3 font-display text-3xl font-bold italic text-[#1C120A]">En ligne</h1>

	{#if error}
		<p class="mt-3 rounded-[3px] border border-[#9A1020]/30 bg-[#9A1020]/10 px-3 py-2 font-body text-sm text-[#9A1020]">{error}</p>
	{/if}

	<div class="mt-6 flex flex-1 flex-col gap-3">
		{#if mode === 'menu'}
			<button
				onclick={hostGame}
				class="rounded-[3px] border border-[#0F2042] bg-[#1B3A6B] px-5 py-4 text-left
					font-display text-base font-bold text-[#EDE0BE]
					shadow-[0_4px_0_#0A1428] transition active:translate-y-1 active:shadow-none"
			>
				Créer une salle
				<span class="mt-0.5 block font-body text-sm font-normal text-[#EDE0BE]/70">Obtenez un code à partager</span>
			</button>
			<button
				onclick={() => { mode = 'join'; error = null; }}
				class="rounded-[3px] border border-[#6A0818] bg-[#9A1020] px-5 py-4 text-left
					font-display text-base font-bold text-[#EDE0BE]
					shadow-[0_4px_0_#4A0410] transition active:translate-y-1 active:shadow-none"
			>
				Rejoindre une salle
				<span class="mt-0.5 block font-body text-sm font-normal text-[#EDE0BE]/70">Entrez un code à 4 chiffres</span>
			</button>
			<button
				onclick={() => { mode = 'manual'; error = null; }}
				class="mt-1 text-center font-body text-sm text-[#1C120A]/45 underline"
			>
				Connexion manuelle (même Wi-Fi)
			</button>

		{:else if mode === 'host'}
			{#if busy && !roomCode}
				<p class="font-body italic text-[#1C120A]/60">Création de la salle…</p>
			{:else if roomCode}
				<div class="rounded-[3px] border-2 border-[#B8880E]/60 bg-[#FBF5E4] p-6 text-center">
					<p class="font-body text-xs uppercase tracking-widest text-[#1C120A]/40">Code de salle</p>
					<p class="my-3 font-display text-6xl font-black tracking-[0.2em] tabular-nums text-[#1B3A6B]">
						{roomCode}
					</p>
					<p class="font-body text-sm text-[#1C120A]/55">Communiquez ce code à votre adversaire.</p>
				</div>
				<div class="flex items-center justify-center gap-2 text-[#1C120A]/50">
					<span class="h-2.5 w-2.5 animate-ping rounded-full bg-[#1B3A6B]/60"></span>
					<span class="font-body italic">En attente…</span>
				</div>
			{/if}

		{:else if mode === 'join'}
			<div class="rounded-[3px] border border-[#C4A878]/80 bg-[#FBF5E4] p-4">
				<label for="code" class="font-display text-sm font-bold text-[#1C120A]">
					Code de salle (4 chiffres)
				</label>
				<input
					id="code"
					bind:value={joinCode}
					inputmode="numeric"
					maxlength="4"
					placeholder="1234"
					class="mt-2 w-full rounded-[3px] border border-[#C4A878]/60 bg-[#EDE0BE]/60 py-3 text-center
						font-display text-4xl font-bold tracking-[0.3em] tabular-nums text-[#1C120A]
						outline-none focus:border-[#1B3A6B] focus:ring-1 focus:ring-[#1B3A6B]/40"
				/>
				<button
					onclick={joinGame}
					disabled={busy || joinCode.trim().length < 4}
					class="mt-3 w-full rounded-[3px] border border-[#6A0818] bg-[#9A1020] px-4 py-3
						font-display font-bold text-[#EDE0BE]
						shadow-[0_3px_0_#4A0410] transition active:translate-y-0.5 active:shadow-none
						disabled:border-[#C4A878]/40 disabled:bg-[#C4A878]/30 disabled:text-[#9A8A6A] disabled:shadow-none"
				>
					{busy ? 'Connexion…' : 'Rejoindre'}
				</button>
			</div>

		{:else if mode === 'manual'}
			{#if manualStep === 'choose'}
				<p class="font-body text-sm italic text-[#1C120A]/55">Les deux appareils doivent être sur le même Wi-Fi.</p>
				<button
					onclick={manualHost}
					class="rounded-[3px] border border-[#0F2042] bg-[#1B3A6B] px-5 py-4
						font-display font-bold text-[#EDE0BE]
						shadow-[0_4px_0_#0A1428] transition active:translate-y-1 active:shadow-none"
				>
					Hôte — créer une invitation
				</button>
				<button
					onclick={() => (manualStep = 'joinInput')}
					class="rounded-[3px] border border-[#6A0818] bg-[#9A1020] px-5 py-4
						font-display font-bold text-[#EDE0BE]
						shadow-[0_4px_0_#4A0410] transition active:translate-y-1 active:shadow-none"
				>
					Invité — coller une invitation
				</button>

			{:else if manualStep === 'host'}
				{#if busy && !offerCode}
					<p class="font-body italic text-[#1C120A]/60">Génération de l'invitation…</p>
				{:else}
					<SignalExchange
						code={offerCode}
						link={shareLink('j', offerCode)}
						label="1 · Envoyez cette invitation à votre ami"
						hint="Partagez le lien ou copiez le code."
					/>
					<div class="rounded-[3px] border border-[#C4A878]/80 bg-[#FBF5E4] p-3">
						<p class="mb-1 font-display text-sm font-bold text-[#1C120A]">2 · Collez la réponse de votre ami</p>
						<textarea
							bind:value={pasteValue}
							rows="3"
							placeholder="Collez le code de réponse…"
							class="w-full rounded-[3px] border border-[#C4A878]/50 bg-[#EDE0BE]/60 p-2 font-mono text-xs text-[#1C120A] outline-none focus:border-[#1B3A6B]"
						></textarea>
						<button
							onclick={manualConnect}
							disabled={busy || !pasteValue.trim()}
							class="mt-2 w-full rounded-[3px] border border-[#0E3020] bg-[#1A5430] px-3 py-2.5
								font-display font-bold text-[#EDE0BE]
								shadow-[0_3px_0_#091E18] transition active:translate-y-0.5 active:shadow-none
								disabled:border-[#C4A878]/40 disabled:bg-[#C4A878]/30 disabled:text-[#9A8A6A] disabled:shadow-none"
						>
							{busy ? 'Connexion…' : 'Connecter'}
						</button>
					</div>
				{/if}

			{:else if manualStep === 'joinInput'}
				<div class="rounded-[3px] border border-[#C4A878]/80 bg-[#FBF5E4] p-3">
					<p class="mb-1 font-display text-sm font-bold text-[#1C120A]">Collez l'invitation</p>
					<textarea
						bind:value={pasteValue}
						rows="3"
						placeholder="Collez le code ou le lien d'invitation…"
						class="w-full rounded-[3px] border border-[#C4A878]/50 bg-[#EDE0BE]/60 p-2 font-mono text-xs text-[#1C120A] outline-none focus:border-[#1B3A6B]"
					></textarea>
					<button
						onclick={() => manualJoin(pasteValue)}
						disabled={busy || !pasteValue.trim()}
						class="mt-2 w-full rounded-[3px] border border-[#6A0818] bg-[#9A1020] px-3 py-2.5
							font-display font-bold text-[#EDE0BE]
							shadow-[0_3px_0_#4A0410] transition active:translate-y-0.5 active:shadow-none
							disabled:border-[#C4A878]/40 disabled:bg-[#C4A878]/30 disabled:text-[#9A8A6A] disabled:shadow-none"
					>
						{busy ? 'Lecture…' : 'Générer la réponse'}
					</button>
				</div>

			{:else if manualStep === 'guest'}
				{#if busy && !answerCode}
					<p class="font-body italic text-[#1C120A]/60">Génération de la réponse…</p>
				{:else}
					<SignalExchange
						code={answerCode}
						link={shareLink('a', answerCode)}
						label="Renvoyez cette réponse à l'hôte"
						hint="L'hôte collera ce code pour terminer la connexion."
					/>
					<div class="flex items-center justify-center gap-2 text-[#1C120A]/50">
						<span class="h-2.5 w-2.5 animate-ping rounded-full bg-[#1B3A6B]/60"></span>
						<span class="font-body italic">En attente de l'hôte…</span>
					</div>
				{/if}
			{/if}
		{/if}
	</div>
</main>
