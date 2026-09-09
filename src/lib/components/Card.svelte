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
		label,
		onclick
	}: {
		card: Card;
		playable?: boolean;
		selected?: boolean;
		dim?: boolean;
		size?: Size;
		faceDown?: boolean;
		/** Overrides the default aria-label (e.g. "Take Gasoline from the discard pile"). */
		label?: string;
		onclick?: () => void;
	} = $props();

	const meta = $derived<CardMeta>(cardMeta(card));

	// Speed animal per distance value — matches the original Mille Bornes cards
	const ANIMALS: Record<number, string> = { 25: '🐌', 50: '🦆', 75: '🦋', 100: '🐇', 200: '🐦' };

	const SIZE: Record<Size, { w: string; h: string; num: string; label: string; icon: string }> = {
		sm: { w: 'w-12', h: 'h-[4.5rem]', num: 'text-xl', label: 'text-[0.44rem]', icon: 'text-lg' },
		md: { w: 'w-16', h: 'h-24', num: 'text-3xl', label: 'text-[0.55rem]', icon: 'text-2xl' },
		lg: { w: 'w-20', h: 'h-[7.5rem]', num: 'text-4xl', label: 'text-[0.65rem]', icon: 'text-3xl' }
	};
	const sz = $derived(SIZE[size]);
</script>

<button
	type="button"
	{onclick}
	disabled={!onclick}
	aria-label={label ?? meta.label}
	class="card-shell relative shrink-0 select-none overflow-hidden rounded-lg border-2 border-gray-300
		shadow-[0_4px_0_rgba(0,0,0,0.25)] transition-all duration-150
		{sz.w} {sz.h}
		{onclick ? 'cursor-pointer' : 'cursor-default'}
		{selected ? '-translate-y-3 ring-4 ring-amber-300 shadow-[0_10px_0_rgba(0,0,0,0.2)]' : ''}
		{playable ? 'hover:-translate-y-2 ring-2 ring-amber-200' : ''}
		{dim ? 'opacity-40' : ''}"
>
	{#if faceDown}
		<!-- Card back: classic Mille Bornes ovals pattern -->
		<div class="h-full w-full bg-blue-700 p-[3px]">
			<div class="h-full w-full rounded-md border-2 border-blue-500/50 grid place-items-center"
				style="background: repeating-linear-gradient(0deg, #1e40af 0px, #1e40af 5px, #1d4ed8 5px, #1d4ed8 10px)">
				<div class="grid grid-cols-2 gap-0.5 opacity-40">
					{#each {length: 6} as _}
						<div class="w-3 h-4 rounded-full border border-red-400 bg-red-600/30"></div>
					{/each}
				</div>
			</div>
		</div>

	{:else if card.kind === 'distance'}
		<!-- Distance card: white, large bold number, speed animal -->
		<div class="h-full w-full bg-white flex flex-col">
			<!-- Top corner: small value + animal -->
			<div class="flex items-center justify-between px-1 pt-0.5 leading-none">
				<span class="font-black text-mb-red" style="font-size:0.5rem">{card.value}</span>
				<span style="font-size:0.65rem">{ANIMALS[card.value] ?? '🚗'}</span>
			</div>
			<!-- Speed dashes strip (evocative of original card's speed bar) -->
			<div class="flex justify-center gap-px px-2 mb-0.5">
				{#each [25, 50, 75, 100, 200] as v}
					<div class="h-0.5 flex-1 rounded-full {card.value >= v ? 'bg-mb-red' : 'bg-gray-200'}"></div>
				{/each}
			</div>
			<!-- Big number -->
			<div class="flex-1 grid place-items-center">
				<span class="font-black text-mb-blue leading-none tracking-tight {sz.num}">{card.value}</span>
			</div>
			<!-- Miles label -->
			<div class="text-center pb-0.5">
				<span class="font-bold uppercase tracking-widest text-gray-400" style="font-size:0.42rem">miles</span>
			</div>
		</div>

	{:else if card.kind === 'hazard'}
		<!-- Hazard: white bg, red top banner, icon -->
		<div class="h-full w-full bg-white flex flex-col">
			<div class="bg-mb-red px-0.5 py-[2px] text-center">
				<span class="font-black text-white leading-none tracking-tight {sz.label}">{meta.short}</span>
			</div>
			<div class="flex-1 grid place-items-center">
				<span class="{sz.icon}">{meta.emoji}</span>
			</div>
			<div class="text-center pb-0.5 px-0.5">
				<span class="font-bold text-mb-red leading-tight {sz.label}">{meta.label}</span>
			</div>
		</div>

	{:else if card.kind === 'remedy'}
		<!-- Remedy: white bg, green top banner, icon -->
		<div class="h-full w-full bg-white flex flex-col">
			<div class="bg-mb-green px-0.5 py-[2px] text-center">
				<span class="font-black text-white leading-none tracking-tight {sz.label}">{meta.short}</span>
			</div>
			<div class="flex-1 grid place-items-center">
				<span class="{sz.icon}">{meta.emoji}</span>
			</div>
			<div class="text-center pb-0.5 px-0.5">
				<span class="font-bold text-mb-green leading-tight {sz.label}">{meta.label}</span>
			</div>
		</div>

	{:else if card.kind === 'safety'}
		<!-- Safety: diagonal green stripes, white text, vehicle icon -->
		<div class="h-full w-full flex flex-col border-green-700"
			style="background: repeating-linear-gradient(135deg, #14532d 0px, #14532d 7px, #15803d 7px, #15803d 14px)">
			<div class="bg-black/30 px-0.5 py-[2px] text-center">
				<span class="font-black text-white leading-none tracking-tight {sz.label}">{meta.short}</span>
			</div>
			<div class="flex-1 grid place-items-center">
				<span class="{sz.icon}">{meta.emoji}</span>
			</div>
			<div class="bg-black/20 text-center pb-0.5 px-0.5 py-[2px]">
				<span class="font-bold text-white/90 leading-tight {sz.label}">{meta.label}</span>
			</div>
		</div>
	{/if}

	<!-- Playable amber glow line -->
	{#if playable}
		<span class="pointer-events-none absolute inset-x-0 -bottom-0.5 h-1 bg-amber-300/90"></span>
	{/if}
</button>
