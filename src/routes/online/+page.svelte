<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { game } from '$lib/stores/game.svelte';
	import { partners } from '$lib/partners/store.svelte';
	import { sendInvite } from '$lib/push/client';
	import type { Partner } from '$lib/partners/types';
	import SignalExchange from '$lib/components/SignalExchange.svelte';
	import QrScanner from '$lib/components/QrScanner.svelte';
	import PartnerList from '$lib/components/PartnerList.svelte';
	import NicknamePrompt from '$lib/components/NicknamePrompt.svelte';
	import PushToggle from '$lib/components/PushToggle.svelte';
	import Lobby from '$lib/components/Lobby.svelte';

	type Mode = 'menu' | 'partners' | 'inviting' | 'host' | 'join' | 'direct';
	let mode = $state<Mode>('menu');

	let roomCode = $state(''); // host's 4-digit code
	let joinCode = $state(''); // guest's input
	let busy = $state(false);
	let error = $state<string | null>(null);

	// direct (no-server) pairing state
	let directStep = $state<'choose' | 'host' | 'joinInput' | 'guest'>('choose');
	let offerCode = $state('');
	let answerCode = $state('');
	let pasteValue = $state('');
	let origin = $state('');

	// inviting a saved partner
	let invitee = $state<Partner | null>(null);
	let inviteExpiresAt = $state(0);
	let now = $state(Date.now());
	/** Set when a pushed invite turns out to have expired, so we can offer to invite back. */
	let expiredFrom = $state<string | null>(null);

	/** Asking for a nickname first, then running whatever they were trying to do. */
	let pendingAction = $state<(() => void) | null>(null);

	onMount(() => {
		origin = location.origin;
		partners.load();

		const hash = new URLSearchParams(location.hash.slice(1));
		const invite = hash.get('j');
		const code = hash.get('c');
		if (invite || code) history.replaceState(null, '', location.pathname);

		if (invite) {
			mode = 'direct';
			void directJoin(invite);
		} else if (code) {
			// Arrived from a partner's notification — join their room straight away.
			expiredFrom = hash.get('n');
			mode = 'join';
			joinCode = code;
			void joinGame();
		} else if (new URL(location.href).searchParams.get('invite')) {
			mode = 'partners';
		}

		const tick = setInterval(() => (now = Date.now()), 1000);
		return () => clearInterval(tick);
	});

	// Both peers head for the board once the host leaves the lobby.
	$effect(() => {
		if (game.started) goto(`${base}/play`);
	});
	// A host on a build from before the lobby existed deals and plays immediately;
	// it never says hello, so state arriving with no greeting means: follow them.
	$effect(() => {
		if (game.connected && game.state && game.namesSettled && !game.peer && !game.started) {
			game.started = true;
		}
	});
	// Surface connection errors raised by the store (e.g. nobody joined).
	$effect(() => {
		if (game.netError) {
			error = game.netError;
			busy = false;
		}
	});

	/** Run `action`, asking for a nickname first if we don't have one yet. */
	function withName(action: () => void) {
		if (partners.hasName) action();
		else pendingAction = action;
	}

	/* ---- room code (online via Netlify) ---- */
	async function hostGame() {
		mode = 'host';
		busy = true;
		error = null;
		try {
			roomCode = (await game.hostRoom()).code;
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
			// success shows the lobby via `game.connected`
		} catch (e) {
			const message = e instanceof Error ? e.message : 'Could not join that room.';
			error = expiredFrom
				? `${expiredFrom}'s invitation has expired — their room has closed.`
				: message;
			busy = false;
		}
	}

	/* ---- inviting a saved partner ---- */
	async function invitePartner(partner: Partner) {
		if (!partner.theirToken) return;
		busy = true;
		error = null;
		invitee = partner;
		try {
			// Keep the room open for as long as it lives: a notification may well
			// be answered several minutes later.
			const room = await game.hostRoom({ waitForRoomLife: true });
			roomCode = room.code;
			inviteExpiresAt = room.expiresAt;
			mode = 'inviting';

			const result = await sendInvite(partner.theirToken, room.code);
			if (result === 'gone') {
				// They turned notifications off, or the subscription died.
				partners.patch(partner.peerId, { theirToken: null });
				error = `${partner.name} isn't receiving notifications any more — give them the code below.`;
			} else if (result === 'rate-limited') {
				error = `You've just invited ${partner.name}. Give them a moment.`;
			} else if (result !== 'ok') {
				error = `Couldn't send the invitation — give ${partner.name} the code below.`;
			}
		} catch {
			error = 'Could not create a room. Are you online?';
			mode = 'partners';
		}
		busy = false;
	}

	/** Offer to flip an expired invitation around. */
	function inviteBack() {
		const partner = partners.list.find((p) => p.name === expiredFrom && p.theirToken);
		expiredFrom = null;
		error = null;
		if (partner) withName(() => void invitePartner(partner));
		else mode = 'partners';
	}

	/* ---- direct pairing, with no server in the middle ---- */
	function shareLink(key: 'j' | 'a', code: string): string {
		return origin ? `${origin}${base}/online#${key}=${code}` : '';
	}
	async function directHost() {
		directStep = 'host';
		busy = true;
		error = null;
		try {
			offerCode = await game.beginHost();
		} catch {
			error = 'Could not start hosting.';
		}
		busy = false;
	}
	async function directJoin(invite: string) {
		directStep = 'guest';
		busy = true;
		error = null;
		try {
			answerCode = await game.beginGuest(invite);
		} catch {
			error = "Couldn't read that invite.";
			directStep = 'joinInput';
		}
		busy = false;
	}
	async function directConnect(reply: string) {
		busy = true;
		error = null;
		try {
			await game.submitAnswer(reply);
		} catch {
			error = "Couldn't read that reply.";
		}
		busy = false;
	}

	function cancel() {
		game.clear();
		goto(`${base}/`);
	}

	let minutesLeft = $derived(Math.max(0, Math.ceil((inviteExpiresAt - now) / 60_000)));
	let inLobby = $derived(game.connected && !game.started);
</script>

<svelte:head>
	<title>Play online — Mille Bornes</title>
</svelte:head>

<NicknamePrompt
	open={pendingAction !== null}
	onsave={() => {
		const action = pendingAction;
		pendingAction = null;
		// Re-sync the identity the store greets peers with.
		game.identity = { peerId: partners.identity.peerId, name: partners.identity.name };
		action?.();
	}}
/>

<main class="safe-top safe-bottom mx-auto flex min-h-[100dvh] max-w-md flex-col px-5 pb-6">
	<button onclick={cancel} class="self-start text-sm font-bold text-white/70">← Back</button>
	<h1 class="mt-3 font-display text-3xl font-black text-white">Play online</h1>

	{#if error}
		<p class="mt-3 rounded-xl bg-red-900/60 px-3 py-2 text-sm font-semibold text-red-200 ring-1 ring-red-500/40">
			{error}
			{#if expiredFrom}
				<button onclick={inviteBack} class="mt-1 block font-black text-white underline">
					Invite {expiredFrom} instead
				</button>
			{/if}
		</p>
	{/if}

	<div class="mt-6 flex flex-1 flex-col gap-4">
		{#if inLobby}
			<Lobby />
		{:else if mode === 'menu'}
			{#if partners.list.length > 0}
				<div>
					<p class="mb-2 font-display text-[0.65rem] font-bold uppercase tracking-widest text-white/35">
						Your partners
					</p>
					<PartnerList oninvite={(p) => withName(() => void invitePartner(p))} busyPeerId={busy ? invitee?.peerId ?? null : null} />
				</div>
				<div class="rounded-2xl border-2 border-white/15 bg-white/5 p-3 backdrop-blur-sm">
					<PushToggle />
				</div>
			{/if}

			<button
				onclick={() => withName(hostGame)}
				class="rounded-xl border-2 border-blue-400 bg-mb-blue px-5 py-5 text-left font-display text-lg font-black text-white shadow-[0_5px_0_#102f6e] transition active:translate-y-1 active:shadow-none"
			>
				📡 Host a game
				<span class="block text-sm font-semibold opacity-80">Get a room code to share</span>
			</button>
			<button
				onclick={() =>
					withName(() => {
						mode = 'join';
						error = null;
					})}
				class="rounded-xl border-2 border-red-400 bg-mb-red px-5 py-5 text-left font-display text-lg font-black text-white shadow-[0_5px_0_#9b0f0f] transition active:translate-y-1 active:shadow-none"
			>
				🔢 Join a game
				<span class="block text-sm font-semibold opacity-80">Enter a 4-digit room code</span>
			</button>
			<button
				onclick={() =>
					withName(() => {
						mode = 'direct';
						error = null;
					})}
				class="rounded-xl border-2 border-white/25 bg-white/10 px-5 py-4 text-left font-display font-black text-white/90 backdrop-blur-sm transition active:translate-y-0.5"
			>
				📷 Pair by QR code
				<span class="block text-sm font-semibold text-white/50">
					Phone to phone, no room code — works with no internet
				</span>
			</button>

			{#if partners.hasName}
				<button
					onclick={() => (pendingAction = () => {})}
					class="self-center text-xs font-bold text-white/40 underline"
				>
					You're {partners.identity.name} — change
				</button>
			{/if}
		{:else if mode === 'partners'}
			<PartnerList oninvite={(p) => withName(() => void invitePartner(p))} busyPeerId={busy ? invitee?.peerId ?? null : null} />
			{#if partners.list.length === 0}
				<p class="text-sm text-white/60">
					No partners saved yet. Play someone once and you'll be offered the chance to keep them.
				</p>
			{/if}
			<div class="rounded-2xl border-2 border-white/15 bg-white/5 p-3 backdrop-blur-sm">
				<PushToggle />
			</div>
			<button
				onclick={() => (mode = 'menu')}
				class="self-center text-sm font-bold text-white/50 underline"
			>
				Other ways to play
			</button>
		{:else if mode === 'inviting'}
			<div class="rounded-2xl border-2 border-white/20 bg-white/10 p-6 text-center backdrop-blur-sm shadow-[0_4px_24px_rgba(0,0,0,0.3)]">
				<p class="font-display text-sm font-bold uppercase tracking-widest text-white/50">
					Invited
				</p>
				<p class="mt-1 font-display text-3xl font-black text-white">{invitee?.name}</p>
				<p class="mt-3 text-sm text-white/50">Or read them this code:</p>
				<p class="my-1 font-display text-5xl font-black tracking-[0.2em] text-white tabular-nums drop-shadow-[0_2px_0_rgba(0,0,0,0.4)]">
					{roomCode}
				</p>
				<p class="text-xs text-white/40">
					{minutesLeft > 0 ? `Open for ${minutesLeft} more minute${minutesLeft === 1 ? '' : 's'}` : 'This room has closed'}
				</p>
			</div>
			<div class="flex items-center justify-center gap-2 text-white/50">
				<span class="h-3 w-3 animate-ping rounded-full bg-amber-400"></span>
				<span class="font-display font-bold">Waiting for {invitee?.name}…</span>
			</div>
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
					onclick={() => withName(joinGame)}
					disabled={busy || joinCode.trim().length < 4}
					class="mt-3 w-full rounded-xl border-2 border-red-400 bg-mb-red px-4 py-3 font-display font-black text-white shadow-[0_4px_0_#9b0f0f] transition active:translate-y-0.5 active:shadow-none disabled:border-gray-500 disabled:bg-gray-500 disabled:shadow-none"
				>
					{busy ? 'Connecting…' : 'Join'}
				</button>
			</div>
		{:else if mode === 'direct'}
			{#if directStep === 'choose'}
				<p class="text-sm text-white/60">
					The two phones pair by showing each other a QR code and then talk directly, with no
					server in between. Good on a Wi-Fi that won't let you online, or if the room code isn't
					getting through.
				</p>
				<p class="rounded-xl bg-amber-400/10 px-3 py-2 text-xs text-amber-200/80 ring-1 ring-amber-300/25">
					With no internet at all, both phones need this app <strong>already installed</strong> —
					otherwise the second one has nothing to load.
				</p>
				<button
					onclick={directHost}
					class="rounded-xl border-2 border-blue-400 bg-mb-blue px-5 py-4 font-display font-black text-white shadow-[0_4px_0_#102f6e] transition active:translate-y-1 active:shadow-none"
				>
					📡 Host (show a QR code)
				</button>
				<button
					onclick={() => (directStep = 'joinInput')}
					class="rounded-xl border-2 border-red-400 bg-mb-red px-5 py-4 font-display font-black text-white shadow-[0_4px_0_#9b0f0f] transition active:translate-y-1 active:shadow-none"
				>
					📷 Join (scan their QR code)
				</button>
			{:else if directStep === 'host'}
				{#if busy && !offerCode}
					<p class="font-display font-bold text-white/60">Generating invite…</p>
				{:else}
					<SignalExchange
						code={offerCode}
						link={shareLink('j', offerCode)}
						label="1 · Let your friend scan this"
						hint="No camera? “Send instead” shares the link — AirDrop and Nearby Share both work with no internet."
					/>
					<div class="rounded-xl border-2 border-white/20 bg-white/10 p-3 backdrop-blur-sm">
						<p class="mb-2 font-display text-sm font-black text-white">2 · Scan their reply</p>
						<QrScanner onscan={(v) => directConnect(v)} />
						<details class="mt-2">
							<summary class="cursor-pointer text-xs font-bold text-white/40">
								Paste the reply instead
							</summary>
							<textarea
								bind:value={pasteValue}
								rows="3"
								placeholder="Paste the reply code or link…"
								class="mt-2 w-full rounded-xl bg-white/90 p-2 font-mono text-xs text-asphalt outline-none ring-amber-300 focus:ring-2"
							></textarea>
							<button
								onclick={() => directConnect(pasteValue)}
								disabled={busy || !pasteValue.trim()}
								class="mt-2 w-full rounded-xl border-2 border-green-400 bg-mb-green px-3 py-2.5 font-display font-black text-white shadow-[0_3px_0_#145a14] transition active:translate-y-0.5 active:shadow-none disabled:border-gray-500 disabled:bg-gray-500 disabled:shadow-none"
							>
								{busy ? 'Connecting…' : 'Connect'}
							</button>
						</details>
					</div>
				{/if}
			{:else if directStep === 'joinInput'}
				<div class="rounded-xl border-2 border-white/20 bg-white/10 p-3 backdrop-blur-sm">
					<p class="mb-2 font-display text-sm font-black text-white">Scan your friend's QR code</p>
					<QrScanner onscan={(v) => directJoin(v)} hint="Point the camera at the code on their phone." />
					<details class="mt-2">
						<summary class="cursor-pointer text-xs font-bold text-white/40">
							Paste the invite instead
						</summary>
						<textarea
							bind:value={pasteValue}
							rows="3"
							placeholder="Paste the invite code or link…"
							class="mt-2 w-full rounded-xl bg-white/90 p-2 font-mono text-xs text-asphalt outline-none ring-amber-300 focus:ring-2"
						></textarea>
						<button
							onclick={() => directJoin(pasteValue)}
							disabled={busy || !pasteValue.trim()}
							class="mt-2 w-full rounded-xl border-2 border-red-400 bg-mb-red px-3 py-2.5 font-display font-black text-white shadow-[0_3px_0_#9b0f0f] transition active:translate-y-0.5 active:shadow-none disabled:border-gray-500 disabled:bg-gray-500 disabled:shadow-none"
						>
							{busy ? 'Reading…' : 'Generate reply'}
						</button>
					</details>
				</div>
			{:else if directStep === 'guest'}
				{#if busy && !answerCode}
					<p class="font-display font-bold text-white/60">Generating reply…</p>
				{:else}
					<SignalExchange
						code={answerCode}
						link={shareLink('a', answerCode)}
						label="Now let the host scan this"
						hint="They scan it to finish connecting."
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
