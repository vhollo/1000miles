<script lang="ts">
	import { game } from '$lib/stores/game.svelte';
	import { partners } from '$lib/partners/store.svelte';
	import { pushSupported } from '$lib/push/client';
	import PushToggle from './PushToggle.svelte';

	/** How long the host will wait for a guest who never says they're ready. */
	const READY_GRACE_MS = 10_000;

	let saving = $state(false);
	let saved = $state(false);
	let couldNotInvite = $state(false);
	let ready = $state(false);
	let waitedForReady = $state(false);

	let peer = $derived(game.peer);
	let known = $derived(peer ? partners.byPeerId(peer.peerId) : undefined);
	let theySavedUs = $derived(!!known?.theirToken);
	let isHost = $derived(game.role === 'host');

	// A peer on an older build never introduces itself; there is nothing to save
	// and nobody to invite later, so the lobby just gets out of the way.
	let oldBuild = $derived(game.namesSettled && !peer);

	$effect(() => {
		const timer = setTimeout(() => (waitedForReady = true), READY_GRACE_MS);
		return () => clearTimeout(timer);
	});

	// The peer handed us the right to invite them — store it against them.
	$effect(() => {
		const token = game.peerToken;
		const id = peer?.peerId;
		if (!token || !id) return;
		partners.save(id, peer!.name);
		partners.patch(id, { theirToken: token });
	});

	/**
	 * Remember this partner, and give them what they need to invite us back.
	 * The push side is allowed to fail: being remembered by name is still worth
	 * something, and the room code always works.
	 */
	async function savePartner() {
		if (!peer) return;
		saving = true;
		partners.save(peer.peerId, peer.name);
		partners.markPlayed(peer.peerId);

		const token = await partners.issueToken(peer.peerId);
		if (token) game.sendPartnerToken(token);
		else couldNotInvite = true;

		saved = true;
		saving = false;
	}

	function imReady() {
		ready = true;
		game.markReady();
	}
</script>

<div class="flex flex-col gap-4">
	{#if !game.namesSettled}
		<div class="flex items-center justify-center gap-2 text-white/60">
			<span class="h-3 w-3 animate-ping rounded-full bg-amber-400"></span>
			<span class="font-display font-bold">Saying hello…</span>
		</div>
	{:else}
		<div
			class="rounded-2xl border-2 border-white/20 bg-white/10 p-4 text-center backdrop-blur-sm shadow-[0_4px_24px_rgba(0,0,0,0.3)]"
		>
			<p class="font-display text-sm font-bold uppercase tracking-widest text-white/50">
				Connected to
			</p>
			<p class="mt-1 font-display text-3xl font-black text-white">
				{peer ? peer.name : 'your opponent'}
			</p>
			{#if oldBuild}
				<p class="mt-2 text-xs text-white/50">
					They're on an older version of the app, so we can't remember them yet.
				</p>
			{:else if known && !saved}
				<p class="mt-2 text-sm text-white/60">Good to see them again 👋</p>
			{/if}
		</div>

		{#if peer && !known && !saved}
			<div class="rounded-2xl border-2 border-white/20 bg-white/10 p-4 backdrop-blur-sm">
				<p class="font-display font-black text-white">Save {peer.name} as a partner?</p>
				<p class="mt-1 mb-3 text-sm text-white/60">
					Then either of you can start the next game with one tap, without swapping codes.
				</p>
				<button
					onclick={savePartner}
					disabled={saving}
					class="w-full rounded-xl border-2 border-green-400 bg-mb-green px-4 py-3 font-display font-black text-white shadow-[0_4px_0_#145a14] transition active:translate-y-0.5 active:shadow-none disabled:opacity-60"
				>
					{saving ? 'Saving…' : `💾 Save ${peer.name}`}
				</button>
				{#if pushSupported()}
					<div class="mt-3 border-t border-white/10 pt-3">
						<PushToggle compact />
					</div>
				{/if}
			</div>
		{:else if saved}
			<p class="rounded-xl bg-white/10 px-3 py-2 text-sm font-semibold text-white/70">
				✓ {peer?.name} saved.
				{#if couldNotInvite}
					Notifications are off, so they can't ping you yet — you can turn them on any time.
				{:else if theySavedUs}
					You've both saved each other.
				{/if}
			</p>
		{/if}

		{#if isHost}
			<button
				onclick={() => game.startOnline()}
				disabled={!game.peerReady && !waitedForReady && !oldBuild}
				class="rounded-xl border-2 border-blue-400 bg-mb-blue px-5 py-4 font-display text-lg font-black text-white shadow-[0_5px_0_#102f6e] transition active:translate-y-1 active:shadow-none disabled:border-gray-500 disabled:bg-gray-500 disabled:shadow-none"
			>
				{game.peerReady || oldBuild ? '▶ Start the game' : waitedForReady ? '▶ Start anyway' : 'Waiting for them…'}
			</button>
		{:else if ready}
			<div class="flex items-center justify-center gap-2 text-white/50">
				<span class="h-3 w-3 animate-ping rounded-full bg-amber-400"></span>
				<span class="font-display font-bold">Waiting for {peer?.name ?? 'the host'} to start…</span>
			</div>
		{:else}
			<button
				onclick={imReady}
				class="rounded-xl border-2 border-green-400 bg-mb-green px-5 py-4 font-display text-lg font-black text-white shadow-[0_5px_0_#145a14] transition active:translate-y-1 active:shadow-none"
			>
				✋ I'm ready
			</button>
		{/if}
	{/if}
</div>
