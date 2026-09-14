<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import Modal from '$lib/components/Modal.svelte';
	import UpdateNotice from '$lib/components/UpdateNotice.svelte';
	import { pwa } from '$lib/pwa.svelte';
	import { game } from '$lib/stores/game.svelte';
	import { partners } from '$lib/partners/store.svelte';

	let { children } = $props();

	// Keeps an installed PWA on the latest build, self-applying (see `$lib/pwa.svelte.ts`).
	// Reloading would drop the peer connection, so an online game holds it off.
	pwa.deferSwap = () => game.isOnline;
	pwa.start();

	/** An invitation that arrived while the app was already open. */
	let pending = $state<{ code: string; from: string } | null>(null);

	onMount(() => {
		partners.load();
		// The store greets peers with this; keep it in step with the saved name.
		game.identity = { peerId: partners.identity.peerId, name: partners.identity.name };

		// Housekeeping that must not interrupt anyone: refresh the server's copy
		// of our push subscription, and retry any withdrawal that failed earlier.
		void partners.refresh();
		void partners.flushRevocations();

		if (!('serviceWorker' in navigator)) return;
		const onMessage = (event: MessageEvent) => {
			const data = event.data as { type?: string; code?: string; from?: string } | null;
			if (data?.type !== 'MB_INVITE' || !data.code) return;
			const invite = { code: data.code, from: data.from || 'A friend' };
			// Mid-game, ask first — joining would abandon whatever is on the table.
			if (game.state && !game.isOver) pending = invite;
			else accept(invite);
		};
		navigator.serviceWorker.addEventListener('message', onMessage);
		return () => navigator.serviceWorker.removeEventListener('message', onMessage);
	});

	// Keep the greeting name current if it is changed mid-session.
	$effect(() => {
		game.identity = { peerId: partners.identity.peerId, name: partners.identity.name };
	});

	function accept(invite: { code: string; from: string }) {
		pending = null;
		game.clear();
		goto(`${base}/online#c=${invite.code}&n=${encodeURIComponent(invite.from)}`);
	}
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<UpdateNotice />

<Modal open={pending !== null} labelledby="invite-title">
	<h2 id="invite-title" class="font-display text-xl font-black text-asphalt">
		{pending?.from} wants to play
	</h2>
	<p class="mt-1 text-sm text-asphalt/60">
		{game.isOnline
			? 'Joining them will end the game you are in.'
			: 'Your current game is saved — you can pick it up again later.'}
	</p>
	<div class="mt-4 flex gap-2">
		<button
			onclick={() => (pending = null)}
			class="flex-1 rounded-2xl bg-white px-4 py-3 font-display font-bold text-asphalt/70 shadow-[0_3px_0_rgba(0,0,0,0.1)] transition active:translate-y-0.5"
		>
			Stay here
		</button>
		<button
			onclick={() => pending && accept(pending)}
			class="flex-1 rounded-2xl bg-violet-500 px-4 py-3 font-display font-bold text-white shadow-[0_4px_0_#6d28d9] transition active:translate-y-0.5 active:shadow-none"
		>
			Join {pending?.from}
		</button>
	</div>
</Modal>

{@render children()}
