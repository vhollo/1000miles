<script lang="ts">
	import type { Card as CardT } from '$lib/game/cards';
	import Card from './Card.svelte';

	let {
		cards,
		playableIds,
		selectedId = null,
		locked = false,
		onselect
	}: {
		cards: CardT[];
		playableIds: Set<string>;
		selectedId?: string | null;
		locked?: boolean;
		onselect: (id: string) => void;
	} = $props();
</script>

<div
	class="flex flex-wrap items-end justify-center gap-x-1.5 gap-y-2 px-2 sm:gap-x-2"
	class:pointer-events-none={locked}
>
	{#each cards as card (card.id)}
		<Card
			{card}
			playable={!locked && playableIds.has(card.id)}
			selected={card.id === selectedId}
			dim={locked}
			size="md"
			onclick={() => onselect(card.id)}
		/>
	{/each}
</div>
