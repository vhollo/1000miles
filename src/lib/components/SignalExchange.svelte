<script lang="ts">
	let {
		code,
		link = '',
		label,
		hint = ''
	}: { code: string; link?: string; label: string; hint?: string } = $props();

	let copied = $state<'' | 'code' | 'link'>('');

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

<div class="rounded-2xl border-2 border-white bg-white/70 p-3">
	<p class="mb-1 font-display text-sm font-extrabold text-asphalt">{label}</p>
	<div
		class="max-h-16 overflow-y-auto rounded-xl bg-asphalt/5 p-2 font-mono text-[0.6rem] leading-snug break-all text-asphalt/60 select-all"
	>
		{code}
	</div>
	<div class="mt-2 flex gap-2">
		<button
			onclick={() => copy(code, 'code')}
			class="flex-1 rounded-xl bg-asphalt px-3 py-2 text-sm font-bold text-cream transition active:translate-y-0.5"
		>
			{copied === 'code' ? '✓ Copied' : 'Copy code'}
		</button>
		{#if link}
			<button
				onclick={share}
				class="flex-1 rounded-xl bg-road-500 px-3 py-2 text-sm font-bold text-white transition active:translate-y-0.5"
			>
				{copied === 'link' ? '✓ Copied' : '📤 Share link'}
			</button>
		{/if}
	</div>
	{#if hint}
		<p class="mt-2 text-xs text-asphalt/50">{hint}</p>
	{/if}
</div>
