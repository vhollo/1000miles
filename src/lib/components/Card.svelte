<script lang="ts">
	import { cardMeta, type Card, type CardMeta, type CardKind } from '$lib/game/cards';

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

	/* Vintage header-band colour per hue */
	const BAND: Record<CardMeta['hue'], string> = {
		road:    'bg-[#1B3A6B]',
		rose:    'bg-[#9A1020]',
		emerald: 'bg-[#1A5430]',
		amber:   'bg-[#8A5A08]',
		violet:  'bg-[#4A1260]',
		slate:   'bg-[#3A4050]',
		sky:     'bg-[#1A4870]'
	};

	/* Authentic French category labels */
	const KIND_LABEL: Record<CardKind, string> = {
		distance: 'Distance',
		hazard:   'Attaque',
		remedy:   'Parade',
		safety:   'Botte'
	};

	/* Number colour per hue (for distance cards) */
	const NUM_COLOR: Record<CardMeta['hue'], string> = {
		road:    'text-[#1B3A6B]',
		rose:    'text-[#9A1020]',
		emerald: 'text-[#1A5430]',
		amber:   'text-[#8A5A08]',
		violet:  'text-[#4A1260]',
		slate:   'text-[#3A4050]',
		sky:     'text-[#1A4870]'
	};

	const SIZE: Record<Size, string> = {
		sm: 'w-12 h-[4.5rem]',
		md: 'w-16 h-24',
		lg: 'w-20 h-[7.5rem]'
	};

	const BAND_TEXT: Record<Size, string> = {
		sm: 'text-[6px]',
		md: 'text-[7px]',
		lg: 'text-[8px]'
	};

	const NUM_SIZE: Record<Size, string> = {
		sm: 'text-xl',
		md: 'text-2xl',
		lg: 'text-3xl'
	};

	const EMOJI_SIZE: Record<Size, string> = {
		sm: 'text-base',
		md: 'text-xl',
		lg: 'text-2xl'
	};

	const LABEL_SIZE: Record<Size, string> = {
		sm: 'text-[6px]',
		md: 'text-[8px]',
		lg: 'text-[9px]'
	};
</script>

<button
	type="button"
	{onclick}
	disabled={!onclick}
	aria-label={meta.label}
	class="card-face group relative shrink-0 select-none overflow-hidden rounded-[3px]
		border border-[#C4A878] bg-[#FBF5E4] flex flex-col
		shadow-[1px_3px_8px_rgba(0,0,0,0.28)]
		transition-all duration-200
		{SIZE[size]}
		{onclick ? 'cursor-pointer' : 'cursor-default'}
		{selected ? '-translate-y-3 ring-2 ring-[#B8880E] shadow-[2px_10px_18px_rgba(0,0,0,0.35)]' : ''}
		{playable ? 'hover:-translate-y-2' : ''}
		{dim ? 'opacity-40 saturate-50' : ''}"
>
	{#if faceDown}
		<!-- Classic hatched card back -->
		<span class="flex h-full w-full flex-col bg-[#1B3A6B]">
			<span class="flex flex-1 items-center justify-center"
				style="background-image: repeating-linear-gradient(45deg, rgba(255,255,255,0.06) 0, rgba(255,255,255,0.06) 1px, transparent 0, transparent 50%); background-size: 8px 8px;">
				<span class="border border-[#8090B0]/50 px-1 py-0.5 text-[6px] font-bold uppercase tracking-[0.2em] text-[#8090B0]">
					M · B
				</span>
			</span>
		</span>
	{:else}
		<!-- Category band -->
		<span class="block w-full py-[3px] text-center font-bold uppercase tracking-[0.15em] text-white {BAND[meta.hue]} {BAND_TEXT[size]}">
			{KIND_LABEL[card.kind]}
		</span>

		<!-- Card body -->
		<span class="relative flex flex-1 flex-col items-center justify-around px-1 py-1">
			{#if isDistance}
				<span class="font-display font-bold leading-none {NUM_SIZE[size]} {NUM_COLOR[meta.hue]}">
					{meta.label}
				</span>
				<span class="font-body uppercase tracking-widest text-[#9A8A6A] {LABEL_SIZE[size]}">miles</span>
			{:else}
				<span class="leading-none {EMOJI_SIZE[size]}">{meta.emoji}</span>
				<span class="text-center font-body font-semibold leading-tight text-[#2C1C0C] {LABEL_SIZE[size]}">
					{meta.label}
				</span>
			{/if}

			{#if playable}
				<span class="pointer-events-none absolute inset-x-0 bottom-0 h-[2px] bg-[#B8880E]"></span>
			{/if}
		</span>

		<!-- Thin inner border inset for double-border effect -->
		<span class="pointer-events-none absolute inset-[3px] rounded-[2px] border border-[#C4A878]/40"></span>
	{/if}
</button>
