<script lang="ts">
	import { cardMeta, type Card, type CardMeta } from '$lib/game/cards';

	type Size = 'sm' | 'md' | 'lg';
	let {
		card,
		playable = false,
		selected = false,
		dim = false,
		size = 'md',
		faceDown = false,
		onclick
	}: {
		card: Card;
		playable?: boolean;
		selected?: boolean;
		dim?: boolean;
		size?: Size;
		faceDown?: boolean;
		onclick?: () => void;
	} = $props();

	const meta = $derived<CardMeta>(cardMeta(card));
	const isDistance = $derived(card.kind === 'distance');

	const HUE: Record<CardMeta['hue'], string> = {
		road: 'from-sky-400 to-blue-600',
		rose: 'from-rose-400 to-red-600',
		emerald: 'from-emerald-400 to-green-600',
		amber: 'from-amber-300 to-orange-500',
		violet: 'from-violet-400 to-fuchsia-600',
		slate: 'from-slate-300 to-slate-500',
		sky: 'from-sky-300 to-cyan-500'
	};

	const SIZE: Record<Size, string> = {
		sm: 'w-12 h-[4.5rem] text-[0.6rem]',
		md: 'w-16 h-24 text-xs',
		lg: 'w-20 h-30 text-sm'
	};
</script>

<button
	type="button"
	{onclick}
	disabled={!onclick}
	aria-label={meta.label}
	class="card-face group relative shrink-0 select-none rounded-2xl bg-gradient-to-b p-[3px]
		shadow-[0_6px_0_rgba(0,0,0,0.18)] transition-all duration-200
		{SIZE[size]} {faceDown ? 'from-road-700 to-road-900' : HUE[meta.hue]}
		{onclick ? 'cursor-pointer' : 'cursor-default'}
		{selected ? '-translate-y-3 ring-4 ring-amber-300 shadow-[0_12px_0_rgba(0,0,0,0.18)]' : ''}
		{playable ? 'hover:-translate-y-2 ring-2 ring-white/70' : ''}
		{dim ? 'opacity-45 saturate-50' : ''}"
>
	{#if faceDown}
		<span class="grid h-full w-full place-items-center rounded-[0.85rem] bg-road-800/60">
			<span class="text-lg opacity-80">🛣️</span>
		</span>
	{:else}
		<span
			class="relative flex h-full w-full flex-col items-center justify-between
				overflow-hidden rounded-[0.85rem] bg-white/92 px-1 py-1.5 text-asphalt"
		>
			<span
				class="self-stretch text-center font-display font-extrabold uppercase leading-none tracking-tight
					{isDistance ? 'text-transparent' : ''}"
			>
				{#if !isDistance}{meta.short}{/if}
			</span>

			{#if isDistance}
				<span class="font-display text-2xl font-extrabold leading-none text-road-600">{meta.label}</span>
				<span class="text-[0.55rem] font-bold uppercase tracking-widest text-road-400">miles</span>
			{:else}
				<span class="text-2xl leading-none drop-shadow-sm">{meta.emoji}</span>
				<span class="self-stretch text-center font-bold leading-tight text-slate-500">{meta.label}</span>
			{/if}

			{#if playable}
				<span class="pointer-events-none absolute inset-x-0 -bottom-0.5 h-1 bg-amber-300/80"></span>
			{/if}
		</span>
	{/if}
</button>
