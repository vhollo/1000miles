<script lang="ts">
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { cardMeta, SAFETY_FOR, SAFETY_META } from '$lib/game/cards';
	import { other, type Move, type PlayerIndex } from '$lib/game/state';
	import { game } from '$lib/stores/game.svelte';
	import { GOAL, isRolling, isSpeedLimited, totalMiles } from '$lib/game/rules';
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

	// drop a stale selection if it leaves the hand or it's no longer our turn
	$effect(() => {
		if (!interactive || (selectedId && !me.hand.some((c) => c.id === selectedId))) {
			selectedId = null;
		}
	});

	const selectedCard = $derived(me.hand.find((c) => c.id === selectedId) ?? null);
	const canPlaySelected = $derived(!!selectedId && game.playableIds.has(selectedId));

	const whyNotPlayable = $derived.by((): string | null => {
		if (!selectedCard || canPlaySelected) return null;
		if (selectedCard.kind === 'distance') {
			if (!isRolling(me)) return 'Play a Roll card first to start driving';
			if (isSpeedLimited(me) && selectedCard.value > 50) return 'Speed limit — you can only play 25 or 50 miles';
			if (totalMiles(me) + selectedCard.value > GOAL) return 'Would exceed 1000 miles';
			if (selectedCard.value === 200 && me.twoHundredsPlayed >= 2) return 'Max 2 × 200-mile cards per hand';
		}
		return null;
	});

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

	// Coup Fourré window aimed at the viewer
	const coupForMe = $derived(game.isCoupFourre && active === viewer && s.pending);
	const coupSafety = $derived(s.pending ? SAFETY_FOR[s.pending.hazard] : null);
	const coupMoves = $derived(coupForMe ? game.legal : []);

	const banner = $derived.by(() => {
		if (game.isOver) return null;
		if (game.isCoupFourre) {
			return active === viewer
				? { text: 'Coup Fourré chance!', tone: 'text-violet-600' }
				: { text: `${s.players[active].name} is countering…`, tone: 'text-asphalt/60' };
		}
		if (interactive) return { text: 'Your turn — make a move', tone: 'text-road-600' };
		return { text: `${s.players[active].name} is driving`, tone: 'text-asphalt/60' };
	});

	const discardTop = $derived(s.discardPile.at(-1) ?? null);
</script>

<div class="mx-auto flex h-full max-w-md flex-col gap-2 px-3 py-2 md:max-w-2xl lg:max-w-3xl">
	<!-- Opponent -->
	<Tableau player={opp} isActive={active === oppIdx} isViewer={false} />

	<!-- Centre: draw / discard + status ticker -->
	<div class="flex items-center justify-between gap-3 px-1">
		<div class="flex items-center gap-2">
			<!-- draw pile -->
			<div class="relative h-[4.5rem] w-12 shrink-0">
				<div class="absolute inset-0 rounded-2xl bg-road-900 shadow-[2px_2px_0_rgba(0,0,0,0.2)]"></div>
				<div
					class="absolute inset-0 grid -translate-x-0.5 -translate-y-0.5 place-items-center rounded-2xl bg-road-700 ring-2 ring-white/50"
				>
					<span class="text-lg opacity-80">🛣️</span>
				</div>
				<span
					class="absolute -bottom-1.5 left-1/2 -translate-x-1/2 rounded-full bg-asphalt px-1.5 text-[0.6rem] font-bold text-white"
				>
					{s.drawPile.length}
				</span>
			</div>
			<!-- discard pile -->
			{#if discardTop}
				<Card card={discardTop} size="sm" />
			{:else}
				<div
					class="grid h-[4.5rem] w-12 shrink-0 place-items-center rounded-2xl border-2 border-dashed border-asphalt/15 text-[0.55rem] font-bold uppercase text-asphalt/30"
				>
					disc
				</div>
			{/if}
		</div>

		<div class="min-w-0 flex-1 text-right">
			{#if banner}
				<p class="truncate font-display text-sm font-extrabold {banner.tone}">
					{banner.text}{#if game.thinking}<span class="thinking-dots"></span>{/if}
				</p>
			{/if}
			{#if s.log.at(-1)}
				<p class="truncate text-[0.7rem] text-asphalt/50">{s.log.at(-1)?.text}</p>
			{/if}
		</div>
	</div>

	<!-- Self -->
	<Tableau player={me} isActive={active === viewer} isViewer={true} />

	<!-- Action bar -->
	<div class="min-h-[2.75rem]">
		{#if interactive && selectedCard && whyNotPlayable}
			<p class="mb-1 text-center text-xs font-semibold text-amber-600">{whyNotPlayable}</p>
		{/if}
		{#if interactive && selectedCard}
			<div class="flex items-center justify-center gap-2">
				<button
					onclick={playSelected}
					disabled={!canPlaySelected}
					class="rounded-xl bg-emerald-500 px-4 py-2 font-display text-sm font-bold text-white shadow-[0_3px_0_#15803d]
						transition active:translate-y-0.5 active:shadow-none disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
				>
					{selectedCard.kind === 'hazard' ? `Attack ${opp.name}` : 'Play'}
				</button>
				<button
					onclick={discardSelected}
					class="rounded-xl bg-white px-4 py-2 font-display text-sm font-bold text-asphalt shadow-[0_3px_0_rgba(0,0,0,0.12)]
						transition active:translate-y-0.5 active:shadow-none"
				>
					Discard
				</button>
				<button
					onclick={() => (selectedId = null)}
					class="rounded-xl px-3 py-2 text-sm font-bold text-asphalt/50"
				>
					✕
				</button>
			</div>
		{:else if interactive}
			<p class="text-center text-[0.7rem] font-semibold uppercase tracking-widest text-asphalt/35">
				tap a card to play or discard
			</p>
		{/if}
	</div>

	<!-- Hand (raised above siblings so nothing can ever overlay/block the cards) -->
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
			<h2 id="coup-title" class="font-display text-xl font-extrabold text-asphalt">Coup Fourré?</h2>
			<p class="mt-1 text-sm text-asphalt/70">
				{s.players[s.pending.by].name} hit you with
				<strong>{cardMeta(s.pending.card).label}</strong>. Reveal your
				<strong>{SAFETY_META[coupSafety].label}</strong> now for
				<strong class="text-violet-600">+300</strong> and steal the turn!
			</p>
			<div class="mt-4 flex flex-col gap-2">
				{#each coupMoves as m (m.type)}
					<button
						onclick={() => resolveCoup(m)}
						class="rounded-2xl px-4 py-3 font-display font-bold transition active:translate-y-0.5
							{m.type === 'coupFourre'
							? 'bg-violet-500 text-white shadow-[0_4px_0_#6d28d9] active:shadow-none'
							: 'bg-white text-asphalt/70 shadow-[0_3px_0_rgba(0,0,0,0.1)] active:shadow-none'}"
					>
						{m.type === 'coupFourre' ? 'Coup Fourré! 🛡️' : 'Take the hit'}
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
		0% {
			content: '';
		}
		25% {
			content: '.';
		}
		50% {
			content: '..';
		}
		75% {
			content: '...';
		}
	}
</style>
