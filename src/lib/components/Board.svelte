<script lang="ts">
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { cardMeta, SAFETY_FOR, SAFETY_META } from '$lib/game/cards';
	import { other, type Move, type PlayerIndex } from '$lib/game/state';
	import { game } from '$lib/stores/game.svelte';
	import Card from './Card.svelte';
	import Hand from './Hand.svelte';
	import Modal from './Modal.svelte';
	import Scoreboard from './Scoreboard.svelte';
	import Tableau from './Tableau.svelte';

	let { viewer }: { viewer: PlayerIndex } = $props();
	let selectedId = $state<string | null>(null);

	const s = $derived(game.state!);
	const oppIdx = $derived(other(viewer));
	const me = $derived(s.players[viewer]);
	const opp = $derived(s.players[oppIdx]);
	const active = $derived(game.active);
	const interactive = $derived(s.phase === 'play' && active === viewer && !me.isAI);

	$effect(() => {
		if (!interactive || (selectedId && !me.hand.some((c) => c.id === selectedId))) {
			selectedId = null;
		}
	});

	const selectedCard = $derived(me.hand.find((c) => c.id === selectedId) ?? null);
	const canPlaySelected = $derived(!!selectedId && game.playableIds.has(selectedId));

	function onselect(id: string) {
		selectedId = selectedId === id ? null : id;
	}

	function playSelected() {
		if (!selectedId) return;
		const move = game.legal.find((m) => m.type === 'play' && m.cardId === selectedId);
		if (move) game.play(move);
		selectedId = null;
	}

	function discardSelected() {
		if (!selectedId) return;
		game.play({ type: 'discard', cardId: selectedId });
		selectedId = null;
	}

	function resolveCoup(move: Move) {
		game.play(move);
	}

	const coupForMe = $derived(game.isCoupFourre && active === viewer && s.pending);
	const coupSafety = $derived(s.pending ? SAFETY_FOR[s.pending.hazard] : null);
	const coupMoves = $derived(coupForMe ? game.legal : []);

	const banner = $derived.by(() => {
		if (game.isOver) return null;
		if (game.isCoupFourre) {
			return active === viewer
				? { text: 'Coup Fourré — à vous !', tone: 'text-[#4A1260]' }
				: { text: `${s.players[active].name} contre…`, tone: 'text-[#1C120A]/50' };
		}
		if (interactive) return { text: 'Votre tour — jouez une carte', tone: 'text-[#1B3A6B]' };
		return { text: `${s.players[active].name} joue…`, tone: 'text-[#1C120A]/50' };
	});

	const discardTop = $derived(s.discardPile.at(-1) ?? null);
</script>

<div class="mx-auto flex h-full max-w-md flex-col gap-2 px-3 py-2 md:max-w-2xl lg:max-w-3xl">
	<!-- Opponent -->
	<Tableau player={opp} isActive={active === oppIdx} isViewer={false} />

	<!-- Centre: draw / discard + status ticker -->
	<div class="flex items-center justify-between gap-3 px-1">
		<div class="flex items-center gap-2">
			<!-- Draw pile -->
			<div class="relative h-[4.5rem] w-12 shrink-0">
				<div class="absolute inset-0 rounded-[3px] border border-[#0A1428] bg-[#0F1C3A]"></div>
				<div class="absolute inset-0 -translate-x-0.5 -translate-y-0.5 grid place-items-center rounded-[3px] border border-[#8090B0]/40 bg-[#1B3A6B]"
					style="background-image: repeating-linear-gradient(45deg, rgba(255,255,255,0.04) 0, rgba(255,255,255,0.04) 1px, transparent 0, transparent 50%); background-size: 8px 8px;">
					<span class="text-[7px] font-bold tracking-widest text-[#8090B0]">M·B</span>
				</div>
				<span class="absolute -bottom-1.5 left-1/2 -translate-x-1/2 rounded-sm border border-[#0A1428] bg-[#1C120A] px-1.5 text-[0.6rem] font-bold text-[#EDE0BE]">
					{s.drawPile.length}
				</span>
			</div>
			<!-- Discard pile -->
			{#if discardTop}
				<Card card={discardTop} size="sm" />
			{:else}
				<div class="grid h-[4.5rem] w-12 shrink-0 place-items-center rounded-[3px] border border-dashed border-[#C4A878]/60 text-[0.55rem] font-bold uppercase tracking-wide text-[#9A8A6A]">
					défausse
				</div>
			{/if}
		</div>

		<div class="min-w-0 flex-1 text-right">
			{#if banner}
				<p class="truncate font-display text-sm font-bold {banner.tone}">
					{banner.text}{#if game.thinking}<span class="thinking-dots"></span>{/if}
				</p>
			{/if}
			{#if s.log.at(-1)}
				<p class="truncate font-body text-[0.7rem] italic text-[#1C120A]/45">{s.log.at(-1)?.text}</p>
			{/if}
		</div>
	</div>

	<!-- Self -->
	<Tableau player={me} isActive={active === viewer} isViewer={true} />

	<!-- Action bar -->
	<div class="min-h-[2.75rem]">
		{#if interactive && selectedCard}
			<div class="flex items-center justify-center gap-2">
				<button
					onclick={playSelected}
					disabled={!canPlaySelected}
					class="rounded-[3px] border border-[#1A5430] bg-[#1A5430] px-4 py-2 font-display text-sm font-bold text-[#EDE0BE]
						shadow-[0_3px_0_#0E3020] transition active:translate-y-0.5 active:shadow-none
						disabled:cursor-not-allowed disabled:border-[#9A8A6A]/40 disabled:bg-[#C4A878]/30 disabled:text-[#9A8A6A] disabled:shadow-none"
				>
					{selectedCard.kind === 'hazard' ? `Attaquer ${opp.name}` : 'Jouer'}
				</button>
				<button
					onclick={discardSelected}
					class="rounded-[3px] border border-[#C4A878] bg-[#FBF5E4] px-4 py-2 font-display text-sm font-bold text-[#1C120A]
						shadow-[0_3px_0_rgba(0,0,0,0.12)] transition active:translate-y-0.5 active:shadow-none"
				>
					Défausser
				</button>
				<button
					onclick={() => (selectedId = null)}
					class="rounded-[3px] px-3 py-2 text-sm font-bold text-[#1C120A]/40"
				>
					✕
				</button>
			</div>
		{:else if interactive}
			<p class="text-center font-body text-[0.7rem] italic text-[#1C120A]/35">
				Sélectionnez une carte pour jouer ou défausser
			</p>
		{/if}
	</div>

	<!-- Hand -->
	<div class="relative z-10 pb-2">
		<Hand
			cards={me.hand}
			playableIds={game.playableIds}
			{selectedId}
			locked={!interactive}
			{onselect}
		/>
	</div>
</div>

<!-- Coup Fourré prompt -->
<Modal open={!!coupForMe} labelledby="coup-title">
	{#if s.pending && coupSafety}
		<div class="text-center">
			<div class="mb-1 text-4xl">{SAFETY_META[coupSafety].emoji}</div>
			<h2 id="coup-title" class="font-display text-xl font-bold text-[#1C120A]">Coup Fourré ?</h2>
			<p class="mt-1 font-body text-sm text-[#1C120A]/70">
				{s.players[s.pending.by].name} vous attaque avec
				<em>{cardMeta(s.pending.card).label}</em>. Révélez votre
				<em>{SAFETY_META[coupSafety].label}</em> pour
				<strong class="text-[#4A1260]">+300 pts</strong> et volez le tour !
			</p>
			<div class="mt-4 flex flex-col gap-2">
				{#each coupMoves as m (m.type)}
					<button
						onclick={() => resolveCoup(m)}
						class="rounded-[3px] border px-4 py-3 font-display font-bold transition active:translate-y-0.5
							{m.type === 'coupFourre'
							? 'border-[#4A1260] bg-[#4A1260] text-white shadow-[0_4px_0_#2A0840] active:shadow-none'
							: 'border-[#C4A878] bg-[#FBF5E4] text-[#1C120A]/70 shadow-[0_3px_0_rgba(0,0,0,0.1)] active:shadow-none'}"
					>
						{m.type === 'coupFourre' ? 'Coup Fourré ! 🛡️' : 'Accepter l\'attaque'}
					</button>
				{/each}
			</div>
		</div>
	{/if}
</Modal>

<!-- End of hand -->
<Modal open={game.isOver} labelledby="score-title">
	<Scoreboard
		state={s}
		onNextHand={() => {
			game.nextHand();
			selectedId = null;
		}}
		onNewMatch={() => {
			game.rematch();
			selectedId = null;
		}}
		onHome={() => {
			game.clear();
			goto(`${base}/`);
		}}
	/>
</Modal>

<style>
	.thinking-dots::after {
		content: '';
		animation: dots 1.2s steps(4, end) infinite;
	}
	@keyframes dots {
		0%   { content: ''; }
		25%  { content: '.'; }
		50%  { content: '..'; }
		75%  { content: '...'; }
	}
</style>
