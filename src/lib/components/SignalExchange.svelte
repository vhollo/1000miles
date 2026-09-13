<script lang="ts">
	import QrCode from './QrCode.svelte';

	let {
		code,
		link = '',
		label,
		hint = ''
	}: { code: string; link?: string; label: string; hint?: string } = $props();

	let showCode = $state(false);
	let copied = $state<'' | 'code' | 'link'>('');

	// Prefer the link: a phone's built-in camera app can open that directly,
	// while a bare code only means something once it's pasted into this app.
	let payload = $derived(link || code);

	async function copy(text: string, which: 'code' | 'link') {
		try {
			await navigator.clipboard.writeText(text);
			copied = which;
			setTimeout(() => (copied = ''), 1500);
		} catch {
			/* clipboard blocked — the code is still visible to copy by hand */
		}
	}

	async function share() {
		if (navigator.share && link) {
			try {
				await navigator.share({ title: 'Mille Bornes', text: 'Join my game!', url: link });
				return;
			} catch {
				/* user cancelled or unsupported — fall back to copying */
			}
		}
		copy(link, 'link');
	}
</script>

<div class="rounded-xl border-2 border-white/20 bg-white/10 p-3 backdrop-blur-sm">
	<p class="mb-2 font-display text-sm font-black text-white">{label}</p>

	<div class="flex justify-center">
		<QrCode value={payload} alt="QR code to pair the two devices" />
	</div>

	<div class="mt-3 flex gap-2">
		{#if link}
			<button
				onclick={share}
				class="flex-1 rounded-xl border-2 border-blue-400 bg-mb-blue px-3 py-2 text-sm font-bold text-white shadow-[0_3px_0_#102f6e] transition active:translate-y-0.5 active:shadow-none"
			>
				{copied === 'link' ? '✓ Copied' : '📤 Send instead'}
			</button>
		{/if}
		<button
			onclick={() => (showCode = !showCode)}
			class="flex-1 rounded-xl border border-white/30 bg-white/20 px-3 py-2 text-sm font-bold text-white backdrop-blur-sm transition active:translate-y-0.5 hover:bg-white/30"
		>
			{showCode ? 'Hide code' : 'Show code'}
		</button>
	</div>

	{#if showCode}
		<div
			class="mt-2 max-h-16 overflow-y-auto rounded-xl bg-white/90 p-2 font-mono text-[0.6rem] leading-snug break-all text-asphalt select-all"
		>
			{code}
		</div>
		<button
			onclick={() => copy(code, 'code')}
			class="mt-2 w-full rounded-xl border border-white/30 bg-white/20 px-3 py-2 text-sm font-bold text-white backdrop-blur-sm transition active:translate-y-0.5 hover:bg-white/30"
		>
			{copied === 'code' ? '✓ Copied' : 'Copy code'}
		</button>
	{/if}

	{#if hint}
		<p class="mt-2 text-xs text-white/50">{hint}</p>
	{/if}
</div>
