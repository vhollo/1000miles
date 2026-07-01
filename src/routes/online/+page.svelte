<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { game } from '$lib/stores/game.svelte';
	import SignalExchange from '$lib/components/SignalExchange.svelte';

	type Mode = 'menu' | 'host' | 'join' | 'manual';
	let mode = $state<Mode>('menu');

	let roomCode = $state(''); // host's 4-digit code
	let joinCode = $state(''); // guest's input
	let busy = $state(false);
	let error = $state<string | null>(null);

	// manual fallback state
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

	// Both peers jump to the board the instant the channel opens.
	$effect(() => {
		if (game.connected) goto(`${base}/play`);
	});
	// Surface connection errors raised by the store (e.g. nobody joined).
	$effect(() => {
		if (game.netError) {
			error = game.netError;
			busy = false;
		}
	});

	/* ---- room code (online via Netlify) ---- */
	async function hostGame() {
		mode = 'host';
		busy = true;
		error = null;
		try {
			roomCode = await game.hostRoom();
		} catch {
			error = 'Could not create a room. Are you online?';
		}
		busy = false;
	}

	async function joinGame() {
		busy = true;
		error = null;
		try {
			await game.joinRoom(joinCode);
			// success navigates via the connected effect
		} catch (e) {
			error = e instanceof Error ? e.message : 'Could not join that room.';
			busy = false;
		}
	}

	/* ---- manual / offline fallback ---- */
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
			error = 'Could not start hosting.';
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
			error = "Couldn't read that invite.";
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
			error = "Couldn't read that reply.";
		}
		busy = false;
	}

	function cancel() {
		game.clear();
		goto(`${base}/`);
	}
</script>

<svelte:head>
	<title>Play online — Mille Bornes</title>
</svelte:head>

<main class="mx-auto flex min-h-[100dvh] max-w-md flex-col px-5 py-6">
	<button onclick={cancel} class="self-start text-sm font-bold text-road-600">← Back</button>
	<h1 class="mt-3 font-display text-3xl font-extrabold text-asphalt">Play online</h1>

	{#if error}
		<p class="mt-3 rounded-xl bg-rose-100 px-3 py-2 text-sm font-semibold text-rose-700">{error}</p>
	{/if}

	<div class="mt-6 flex flex-1 flex-col gap-4">
		{#if mode === 'menu'}
			<button
				onclick={hostGame}
				class="rounded-2xl bg-road-500 px-5 py-5 text-left font-display text-lg font-extrabold text-white shadow-[0_5px_0_var(--color-road-700)] transition active:translate-y-1 active:shadow-none"
			>
				📡 Host a game
				<span class="block text-sm font-semibold opacity-80">Get a room code to share</span>
			</button>
			<button
				onclick={() => {
					mode = 'join';
					error = null;
				}}
				class="rounded-2xl bg-rose-500 px-5 py-5 text-left font-display text-lg font-extrabold text-white shadow-[0_5px_0_#be123c] transition active:translate-y-1 active:shadow-none"
			>
				🔢 Join a game
				<span class="block text-sm font-semibold opacity-80">Enter a 4-digit room code</span>
			</button>
			<button
				onclick={() => {
					mode = 'manual';
					error = null;
				}}
				class="mt-2 text-center text-sm font-bold text-asphalt/50 underline"
			>
				No internet? Connect manually (same Wi-Fi)
			</button>
		{:else if mode === 'host'}
			{#if busy && !roomCode}
				<p class="font-display font-bold text-asphalt/60">Creating room…</p>
			{:else if roomCode}
				<div class="rounded-3xl border-4 border-road-200 bg-white/80 p-6 text-center">
					<p class="font-display text-sm font-bold uppercase tracking-widest text-asphalt/40">
						Room code
					</p>
					<p class="my-2 font-display text-6xl font-extrabold tracking-[0.2em] text-road-600 tabular-nums">
						{roomCode}
					</p>
					<p class="text-sm text-asphalt/60">Tell your friend this code to join.</p>
				</div>
				<div class="flex items-center justify-center gap-2 text-asphalt/60">
					<span class="h-3 w-3 animate-ping rounded-full bg-road-400"></span>
					<span class="font-display font-bold">Waiting for them to join…</span>
				</div>
			{/if}
		{:else if mode === 'join'}
			<div class="rounded-2xl border-2 border-white bg-white/70 p-4">
				<label for="code" class="font-display text-sm font-extrabold text-asphalt">
					Enter the room code
				</label>
				<input
					id="code"
					bind:value={joinCode}
					inputmode="numeric"
					maxlength="4"
					placeholder="1234"
					class="mt-2 w-full rounded-xl bg-asphalt/5 py-3 text-center font-display text-4xl font-extrabold tracking-[0.3em] tabular-nums text-asphalt outline-none ring-road-300 focus:ring-2"
				/>
				<button
					onclick={joinGame}
					disabled={busy || joinCode.trim().length < 4}
					class="mt-3 w-full rounded-xl bg-rose-500 px-4 py-3 font-display font-bold text-white shadow-[0_4px_0_#be123c] transition active:translate-y-0.5 active:shadow-none disabled:bg-slate-300 disabled:shadow-none"
				>
					{busy ? 'Connecting…' : 'Join'}
				</button>
			</div>
		{:else if mode === 'manual'}
			{#if manualStep === 'choose'}
				<p class="text-sm text-asphalt/60">Both devices must be on the same Wi-Fi.</p>
				<button
					onclick={manualHost}
					class="rounded-2xl bg-road-500 px-5 py-4 font-display font-extrabold text-white shadow-[0_4px_0_var(--color-road-700)] transition active:translate-y-1 active:shadow-none"
				>
					📡 Host (create an invite)
				</button>
				<button
					onclick={() => (manualStep = 'joinInput')}
					class="rounded-2xl bg-rose-500 px-5 py-4 font-display font-extrabold text-white shadow-[0_4px_0_#be123c] transition active:translate-y-1 active:shadow-none"
				>
					🔗 Join (paste an invite)
				</button>
			{:else if manualStep === 'host'}
				{#if busy && !offerCode}
					<p class="font-display font-bold text-asphalt/60">Generating invite…</p>
				{:else}
					<SignalExchange
						code={offerCode}
						link={shareLink('j', offerCode)}
						label="1 · Send this invite to your friend"
						hint="Share the link or copy the code."
					/>
					<div class="rounded-2xl border-2 border-white bg-white/70 p-3">
						<p class="mb-1 font-display text-sm font-extrabold text-asphalt">2 · Paste their reply</p>
						<textarea
							bind:value={pasteValue}
							rows="3"
							placeholder="Paste the reply code or link…"
							class="w-full rounded-xl bg-asphalt/5 p-2 font-mono text-xs text-asphalt outline-none ring-road-300 focus:ring-2"
						></textarea>
						<button
							onclick={manualConnect}
							disabled={busy || !pasteValue.trim()}
							class="mt-2 w-full rounded-xl bg-emerald-500 px-3 py-2.5 font-display font-bold text-white shadow-[0_3px_0_#15803d] transition active:translate-y-0.5 active:shadow-none disabled:bg-slate-300 disabled:shadow-none"
						>
							{busy ? 'Connecting…' : 'Connect'}
						</button>
					</div>
				{/if}
			{:else if manualStep === 'joinInput'}
				<div class="rounded-2xl border-2 border-white bg-white/70 p-3">
					<p class="mb-1 font-display text-sm font-extrabold text-asphalt">Paste the invite</p>
					<textarea
						bind:value={pasteValue}
						rows="3"
						placeholder="Paste the invite code or link…"
						class="w-full rounded-xl bg-asphalt/5 p-2 font-mono text-xs text-asphalt outline-none ring-road-300 focus:ring-2"
					></textarea>
					<button
						onclick={() => manualJoin(pasteValue)}
						disabled={busy || !pasteValue.trim()}
						class="mt-2 w-full rounded-xl bg-rose-500 px-3 py-2.5 font-display font-bold text-white shadow-[0_3px_0_#be123c] transition active:translate-y-0.5 active:shadow-none disabled:bg-slate-300 disabled:shadow-none"
					>
						{busy ? 'Reading…' : 'Generate reply'}
					</button>
				</div>
			{:else if manualStep === 'guest'}
				{#if busy && !answerCode}
					<p class="font-display font-bold text-asphalt/60">Generating reply…</p>
				{:else}
					<SignalExchange
						code={answerCode}
						link={shareLink('a', answerCode)}
						label="Send this reply back to the host"
						hint="They'll paste it to finish connecting."
					/>
					<div class="flex items-center justify-center gap-2 text-asphalt/60">
						<span class="h-3 w-3 animate-ping rounded-full bg-road-400"></span>
						<span class="font-display font-bold">Waiting for the host…</span>
					</div>
				{/if}
			{/if}
		{/if}
	</div>
</main>
