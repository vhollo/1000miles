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

<main class="safe-top safe-bottom mx-auto flex min-h-[100dvh] max-w-md flex-col px-5 pb-6">
	<button onclick={cancel} class="self-start text-sm font-bold text-white/70">← Back</button>
	<h1 class="mt-3 font-display text-3xl font-black text-white">Play online</h1>

	{#if error}
		<p class="mt-3 rounded-xl bg-red-900/60 px-3 py-2 text-sm font-semibold text-red-200 ring-1 ring-red-500/40">{error}</p>
	{/if}

	<div class="mt-6 flex flex-1 flex-col gap-4">
		{#if mode === 'menu'}
			<button
				onclick={hostGame}
				class="rounded-xl border-2 border-blue-400 bg-mb-blue px-5 py-5 text-left font-display text-lg font-black text-white shadow-[0_5px_0_#102f6e] transition active:translate-y-1 active:shadow-none"
			>
				📡 Host a game
				<span class="block text-sm font-semibold opacity-80">Get a room code to share</span>
			</button>
			<button
				onclick={() => {
					mode = 'join';
					error = null;
				}}
				class="rounded-xl border-2 border-red-400 bg-mb-red px-5 py-5 text-left font-display text-lg font-black text-white shadow-[0_5px_0_#9b0f0f] transition active:translate-y-1 active:shadow-none"
			>
				🔢 Join a game
				<span class="block text-sm font-semibold opacity-80">Enter a 4-digit room code</span>
			</button>
			<button
				onclick={() => {
					mode = 'manual';
					error = null;
				}}
				class="mt-2 text-center text-sm font-bold text-white/40 underline"
			>
				No internet? Connect manually (same Wi-Fi)
			</button>
		{:else if mode === 'host'}
			{#if busy && !roomCode}
				<p class="font-display font-bold text-white/60">Creating room…</p>
			{:else if roomCode}
				<div class="rounded-2xl border-2 border-white/20 bg-white/10 p-6 text-center backdrop-blur-sm shadow-[0_4px_24px_rgba(0,0,0,0.3)]">
					<p class="font-display text-sm font-bold uppercase tracking-widest text-white/50">
						Room code
					</p>
					<p class="my-2 font-display text-6xl font-black tracking-[0.2em] text-white tabular-nums drop-shadow-[0_2px_0_rgba(0,0,0,0.4)]">
						{roomCode}
					</p>
					<p class="text-sm text-white/50">Tell your friend this code to join.</p>
				</div>
				<div class="flex items-center justify-center gap-2 text-white/50">
					<span class="h-3 w-3 animate-ping rounded-full bg-amber-400"></span>
					<span class="font-display font-bold">Waiting for them to join…</span>
				</div>
			{/if}
		{:else if mode === 'join'}
			<div class="rounded-2xl border-2 border-white/20 bg-white/10 p-4 backdrop-blur-sm">
				<label for="code" class="font-display text-sm font-black text-white">
					Enter the room code
				</label>
				<input
					id="code"
					bind:value={joinCode}
					inputmode="numeric"
					maxlength="4"
					placeholder="1234"
					class="mt-2 w-full rounded-xl bg-white/90 py-3 text-center font-display text-4xl font-black tracking-[0.3em] tabular-nums text-asphalt outline-none ring-amber-300 focus:ring-2"
				/>
				<button
					onclick={joinGame}
					disabled={busy || joinCode.trim().length < 4}
					class="mt-3 w-full rounded-xl border-2 border-red-400 bg-mb-red px-4 py-3 font-display font-black text-white shadow-[0_4px_0_#9b0f0f] transition active:translate-y-0.5 active:shadow-none disabled:border-gray-500 disabled:bg-gray-500 disabled:shadow-none"
				>
					{busy ? 'Connecting…' : 'Join'}
				</button>
			</div>
		{:else if mode === 'manual'}
			{#if manualStep === 'choose'}
				<p class="text-sm text-white/50">Both devices must be on the same Wi-Fi.</p>
				<button
					onclick={manualHost}
					class="rounded-xl border-2 border-blue-400 bg-mb-blue px-5 py-4 font-display font-black text-white shadow-[0_4px_0_#102f6e] transition active:translate-y-1 active:shadow-none"
				>
					📡 Host (create an invite)
				</button>
				<button
					onclick={() => (manualStep = 'joinInput')}
					class="rounded-xl border-2 border-red-400 bg-mb-red px-5 py-4 font-display font-black text-white shadow-[0_4px_0_#9b0f0f] transition active:translate-y-1 active:shadow-none"
				>
					🔗 Join (paste an invite)
				</button>
			{:else if manualStep === 'host'}
				{#if busy && !offerCode}
					<p class="font-display font-bold text-white/60">Generating invite…</p>
				{:else}
					<SignalExchange
						code={offerCode}
						link={shareLink('j', offerCode)}
						label="1 · Send this invite to your friend"
						hint="Share the link or copy the code."
					/>
					<div class="rounded-xl border-2 border-white/20 bg-white/10 p-3 backdrop-blur-sm">
						<p class="mb-1 font-display text-sm font-black text-white">2 · Paste their reply</p>
						<textarea
							bind:value={pasteValue}
							rows="3"
							placeholder="Paste the reply code or link…"
							class="w-full rounded-xl bg-white/90 p-2 font-mono text-xs text-asphalt outline-none ring-amber-300 focus:ring-2"
						></textarea>
						<button
							onclick={manualConnect}
							disabled={busy || !pasteValue.trim()}
							class="mt-2 w-full rounded-xl border-2 border-green-400 bg-mb-green px-3 py-2.5 font-display font-black text-white shadow-[0_3px_0_#145a14] transition active:translate-y-0.5 active:shadow-none disabled:border-gray-500 disabled:bg-gray-500 disabled:shadow-none"
						>
							{busy ? 'Connecting…' : 'Connect'}
						</button>
					</div>
				{/if}
			{:else if manualStep === 'joinInput'}
				<div class="rounded-xl border-2 border-white/20 bg-white/10 p-3 backdrop-blur-sm">
					<p class="mb-1 font-display text-sm font-black text-white">Paste the invite</p>
					<textarea
						bind:value={pasteValue}
						rows="3"
						placeholder="Paste the invite code or link…"
						class="w-full rounded-xl bg-white/90 p-2 font-mono text-xs text-asphalt outline-none ring-amber-300 focus:ring-2"
					></textarea>
					<button
						onclick={() => manualJoin(pasteValue)}
						disabled={busy || !pasteValue.trim()}
						class="mt-2 w-full rounded-xl border-2 border-red-400 bg-mb-red px-3 py-2.5 font-display font-black text-white shadow-[0_3px_0_#9b0f0f] transition active:translate-y-0.5 active:shadow-none disabled:border-gray-500 disabled:bg-gray-500 disabled:shadow-none"
					>
						{busy ? 'Reading…' : 'Generate reply'}
					</button>
				</div>
			{:else if manualStep === 'guest'}
				{#if busy && !answerCode}
					<p class="font-display font-bold text-white/60">Generating reply…</p>
				{:else}
					<SignalExchange
						code={answerCode}
						link={shareLink('a', answerCode)}
						label="Send this reply back to the host"
						hint="They'll paste it to finish connecting."
					/>
					<div class="flex items-center justify-center gap-2 text-white/50">
						<span class="h-3 w-3 animate-ping rounded-full bg-amber-400"></span>
						<span class="font-display font-bold">Waiting for the host…</span>
					</div>
				{/if}
			{/if}
		{/if}
	</div>
</main>
