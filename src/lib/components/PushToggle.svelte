<script lang="ts">
	import { partners } from '$lib/partners/store.svelte';
	import { disablePush, enablePush, isIos, isStandalone, pushSupported } from '$lib/push/client';

	let { compact = false }: { compact?: boolean } = $props();

	let busy = $state(false);
	let permission = $state<NotificationPermission | 'unsupported'>('unsupported');

	// Read once on mount: `Notification.permission` isn't reactive, and asking
	// for it during render would run on the server too.
	$effect(() => {
		permission = pushSupported() ? Notification.permission : 'unsupported';
	});

	/** iOS only delivers push to an app on the Home Screen, never a Safari tab. */
	let needsInstall = $derived(isIos() && !isStandalone());

	async function turnOn() {
		busy = true;
		const did = await enablePush(partners.identity.did);
		if (did) partners.setDid(did);
		permission = Notification.permission;
		busy = false;
	}

	async function turnOff() {
		busy = true;
		await disablePush(partners.identity.did);
		partners.setDid(null);
		busy = false;
	}
</script>

{#if permission === 'unsupported'}
	<p class="text-xs text-white/50">This browser can't show notifications.</p>
{:else if needsInstall}
	<p class="text-xs text-white/50">
		To get invitations on your iPhone, add Mille Bornes to your Home Screen first: tap Share, then
		“Add to Home Screen”.
	</p>
{:else if permission === 'denied'}
	<p class="text-xs text-white/50">
		Notifications are blocked for this site. You can turn them back on in your browser settings.
	</p>
{:else if permission === 'granted' && partners.identity.did}
	<div class="flex items-center justify-between gap-2">
		<p class="text-xs font-bold text-white/60">✓ Partners can invite you</p>
		<button
			onclick={turnOff}
			disabled={busy}
			class="rounded-full bg-white/15 px-3 py-1.5 text-xs font-bold text-white/80 ring-1 ring-white/20 backdrop-blur-sm transition active:translate-y-0.5"
		>
			Turn off
		</button>
	</div>
{:else}
	<button
		onclick={turnOn}
		disabled={busy}
		class="w-full rounded-xl border-2 border-amber-300 bg-amber-400 px-3 py-2.5 font-display font-black text-asphalt shadow-[0_3px_0_#a16207] transition active:translate-y-0.5 active:shadow-none disabled:opacity-60"
	>
		{busy ? 'Just a moment…' : '🔔 Let partners invite me'}
	</button>
	{#if !compact}
		<p class="mt-1 text-xs text-white/50">
			They'll be able to send you a notification when they want to play. Nothing else.
		</p>
	{/if}
{/if}
