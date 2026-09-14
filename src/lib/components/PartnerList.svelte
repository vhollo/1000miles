<script lang="ts">
	import { partners } from '$lib/partners/store.svelte';
	import type { Partner } from '$lib/partners/types';

	let {
		oninvite,
		busyPeerId = null
	}: { oninvite: (partner: Partner) => void; busyPeerId?: string | null } = $props();

	let confirming = $state<string | null>(null);

	/** "3 days ago" — precise enough for deciding who to play with. */
	function lastPlayed(at: number | null): string {
		if (!at) return 'not played yet';
		const days = Math.floor((Date.now() - at) / 86_400_000);
		if (days === 0) return 'played today';
		if (days === 1) return 'played yesterday';
		if (days < 30) return `played ${days} days ago`;
		return 'played a while ago';
	}
</script>

<div class="flex flex-col gap-2">
	{#each partners.list as partner (partner.peerId)}
		<div class="rounded-2xl border-2 border-white/20 bg-white/10 p-3 backdrop-blur-sm">
			<div class="flex items-center gap-3">
				<span
					class="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/20 font-display text-lg font-black text-white"
					aria-hidden="true">{partner.name.slice(0, 1).toUpperCase()}</span
				>
				<div class="min-w-0 flex-1">
					<p class="truncate font-display font-black text-white">{partner.name}</p>
					<p class="text-xs text-white/45">{lastPlayed(partner.lastPlayedAt)}</p>
				</div>

				<button
					onclick={() => oninvite(partner)}
					disabled={!partner.theirToken || busyPeerId !== null}
					title={partner.theirToken ? undefined : "They haven't turned notifications on"}
					class="rounded-xl border-2 border-green-400 bg-mb-green px-3 py-2 font-display text-sm font-black text-white shadow-[0_3px_0_#145a14] transition active:translate-y-0.5 active:shadow-none disabled:border-gray-500 disabled:bg-gray-500 disabled:shadow-none"
				>
					{busyPeerId === partner.peerId ? '…' : '🔔 Invite'}
				</button>
				<button
					onclick={() => (confirming = confirming === partner.peerId ? null : partner.peerId)}
					aria-label="Remove {partner.name}"
					class="rounded-full px-2 py-1 text-sm font-bold text-white/40 transition hover:text-white/80"
				>
					✕
				</button>
			</div>

			{#if !partner.theirToken}
				<p class="mt-2 text-xs text-white/45">
					{partner.name} hasn't turned notifications on, so you'll have to share a room code.
				</p>
			{/if}

			{#if confirming === partner.peerId}
				<div class="mt-3 flex items-center gap-2 border-t border-white/10 pt-3">
					<p class="flex-1 text-xs text-white/60">Forget {partner.name}?</p>
					<button
						onclick={() => (confirming = null)}
						class="rounded-full bg-white/15 px-3 py-1.5 text-xs font-bold text-white/80 ring-1 ring-white/20"
					>
						Keep
					</button>
					<button
						onclick={async () => {
							confirming = null;
							await partners.remove(partner.peerId);
						}}
						class="rounded-full bg-mb-red px-3 py-1.5 text-xs font-bold text-white ring-1 ring-red-400/50"
					>
						Forget
					</button>
				</div>
			{/if}
		</div>
	{/each}
</div>
