<script lang="ts">
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { cardMeta, HAZARD_META, SAFETY_FOR, SAFETY_META } from '$lib/game/cards';
	import { other, type Move, type PlayerIndex } from '$lib/game/state';
	import { game } from '$lib/stores/game.svelte';
	import { GOAL, isRolling, isSpeedLimited, isProtectedFrom, totalMiles } from '$lib/game/rules';
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
		if (selectedCard.kind === 'hazard') {
			const h = selectedCard.hazard;
			if (isProtectedFrom(opp, h)) return `Opponent has ${SAFETY_META[SAFETY_FOR[h]].label} — immune`;
			if (h === 'speedLimit') return 'Opponent already has a speed limit';
			if (!isRolling(opp)) return 'Opponent is already stopped — can only attack a rolling car';
		}
		if (selectedCard.kind === 'remedy') {
			const r = selectedCard.remedy;
			const topCard = me.battle.at(-1);
			if (r === 'endOfLimit') return 'You are not under a Speed Limit';
			if (r === 'roll') {
				if (me.safeties.includes('rightOfWay')) return 'Right of Way — you never need a Roll card';
				if (isRolling(me)) return 'Already rolling';
				return null;
			}
			const fixes: Record<'repairs' | 'gasoline' | 'spareTire', string> = {
				repairs: 'Accident', gasoline: 'Out of Gas', spareTire: 'Flat Tire'
			};
			const needs = fixes[r as 'repairs' | 'gasoline' | 'spareTire'];
			if (topCard?.kind === 'hazard')
				return `You have ${HAZARD_META[topCard.hazard].label}, not ${needs} — wrong remedy`;
			return `No hazard to fix — only needed after ${needs}`;
		}
		return null;
	});

	function onselect(id: string) {
		takePending = false;
		const card = me.hand.find((c) => c.id === id);
		// Safety cards: play instantly on tap — they can never be discarded usefully
		// and canPlaySafety() is always true, so there's no ambiguity.
		if (card?.kind === 'safety' && game.playableIds.has(id)) {
			const move = game.legal.find((m) => m.type === 'play' && m.cardId === id);
			if (move) { game.play(move); return; }
		}
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

	// House rule — take the opponent's discard, against next turn's draw.
	const takeable = $derived(interactive ? game.takeable : null);

	// It costs a draw, so it asks first rather than firing on the tap.
	let takePending = $state(false);
	$effect(() => {
		if (!takeable) takePending = false;
	});

	function confirmTake() {
		if (!takeable) return;
		game.play({ type: 'takeDiscard', cardId: takeable.id });
		takePending = false;
		selectedId = null;
	}

	// Coup Fourré window aimed at the viewer
	const coupForMe = $derived(game.isCoupFourre && active === viewer && s.pending);
	const coupSafety = $derived(s.pending ? SAFETY_FOR[s.pending.hazard] : null);
	const coupMoves = $derived(coupForMe ? game.legal : []);

	const banner = $derived.by(() => {
		if (game.isOver) return null;
		if (game.isCoupFourre) {
			return active === viewer
				? { text: 'Coup Fourré chance!', tone: 'text-violet-300' }
				: { text: `${s.players[active].name} is countering…`, tone: 'text-white/50' };
		}
		if (interactive) return { text: 'Your turn — make a move', tone: 'text-amber-300' };
		return { text: `${s.players[active].name} is driving`, tone: 'text-white/50' };
	});

	const discardTop = $derived(s.discardPile.at(-1) ?? null);
</script>

<div class="mx-auto flex h-full max-w-md flex-col gap-2 px-3 py-2 md:max-w-2xl lg:max-w-3xl">
	<!-- Opponent -->
	<Tableau player={opp} isActive={active === oppIdx} isViewer={false} />

	<!-- Centre: draw / discard + status ticker -->
	<div class="flex items-center justify-between gap-3 px-1">
		<div class="flex items-center gap-2">
			<!-- draw pile (face-down card stack) -->
			<div class="relative h-[4.5rem] w-12 shrink-0">
				<!-- stack shadow cards -->
				<div class="absolute top-1 left-1 h-full w-full rounded-lg bg-blue-900 opacity-60"></div>
				<div class="absolute top-0.5 left-0.5 h-full w-full rounded-lg bg-blue-800 opacity-70"></div>
				<!-- top card -->
				<div class="absolute inset-0 overflow-hidden rounded-lg border-2 border-gray-300 bg-blue-700">
					<div class="h-full w-full p-[3px]">
						<div class="h-full w-full rounded-md border border-blue-500/40 grid place-items-center"
							style="background: repeating-linear-gradient(0deg,#1e40af 0px,#1e40af 4px,#1d4ed8 4px,#1d4ed8 8px)">
							<div class="grid grid-cols-2 gap-0.5 opacity-30">
								{#each {length: 6} as _}
									<div class="w-2.5 h-3.5 rounded-full border border-red-400"></div>
								{/each}
							</div>
						</div>
					</div>
				</div>
				<span
					class="absolute -bottom-1.5 left-1/2 -translate-x-1/2 rounded-full bg-asphalt px-1.5 text-[0.6rem] font-bold text-white shadow"
				>
					{s.drawPile.length}
				</span>
				<!-- house rule: a draw already spent on the discard pile -->
				{#if me.skipsDraw}
					<span
						class="pointer-events-none absolute -top-2 left-1/2 -translate-x-1/2 rounded-full bg-rose-500 px-1.5 py-px
							text-[0.5rem] font-black uppercase tracking-wide text-white shadow"
						title="You took the discard — no draw next turn"
					>
						no draw
					</span>
				{/if}
			</div>
			<!-- discard pile — tap the top card to claim it (house rule) -->
			{#if discardTop}
				<div class="relative">
					<Card
						card={discardTop}
						size="sm"
						playable={!!takeable}
						selected={takePending}
						label={takeable
							? `Take ${cardMeta(discardTop).label} from the discard pile`
							: cardMeta(discardTop).label}
						onclick={takeable
							? () => ((takePending = !takePending), (selectedId = null))
							: undefined}
					/>
					{#if takeable && !takePending}
						<span
							class="pointer-events-none absolute -top-2 left-1/2 -translate-x-1/2 animate-bounce rounded-full
								bg-amber-300 px-1.5 py-px text-[0.55rem] font-black uppercase tracking-wide text-asphalt shadow"
						>
							take
						</span>
					{/if}
				</div>
			{:else}
				<div
					class="grid h-[4.5rem] w-12 shrink-0 place-items-center rounded-lg border-2 border-dashed border-white/20 text-[0.55rem] font-bold uppercase text-white/30"
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
				<p class="truncate text-[0.7rem] text-white/40">{s.log.at(-1)?.text}</p>
			{/if}
		</div>
	</div>

	<!-- Self -->
	<Tableau player={me} isActive={active === viewer} isViewer={true} />

	<!-- Action bar — fixed height so the hand never shifts when the why-message appears -->
	<div class="flex h-16 flex-col items-center justify-center gap-1">
		<p
			class="text-center text-xs font-semibold {takePending ? 'text-white/70' : 'text-amber-300'}
				{interactive && (takePending || (selectedCard && whyNotPlayable)) ? '' : 'invisible'}"
		>
			{#if takePending}
				You'll keep your hand, but <strong class="text-rose-300">start your next turn without a
					draw</strong>.
			{:else}
				{whyNotPlayable ?? ' '}
			{/if}
		</p>
		{#if interactive && takePending && takeable}
			<div class="flex items-center justify-center gap-2">
				<button
					onclick={confirmTake}
					class="rounded-xl border-2 border-mb-blue bg-mb-blue px-4 py-2 font-display text-sm font-black text-white shadow-[0_3px_0_#102f6e]
						transition active:translate-y-0.5 active:shadow-none"
				>
					Take the {cardMeta(takeable).label}
				</button>
				<button
					onclick={() => (takePending = false)}
					class="rounded-xl px-3 py-2 text-sm font-bold text-white/40 hover:text-white/70"
				>
					✕
				</button>
			</div>
		{:else if interactive && selectedCard}
			<div class="flex items-center justify-center gap-2">
				<button
					onclick={playSelected}
					disabled={!canPlaySelected}
					class="rounded-xl border-2 border-mb-green bg-mb-green px-4 py-2 font-display text-sm font-black text-white shadow-[0_3px_0_#145a14]
						transition active:translate-y-0.5 active:shadow-none disabled:cursor-not-allowed disabled:border-gray-400 disabled:bg-gray-400 disabled:shadow-none"
				>
					{selectedCard.kind === 'hazard' ? `Attack ${opp.name}` : 'Play'}
				</button>
				<button
					onclick={discardSelected}
					class="rounded-xl border-2 border-white/30 bg-white/15 px-4 py-2 font-display text-sm font-bold text-white backdrop-blur-sm
						transition active:translate-y-0.5 hover:bg-white/25"
				>
					Discard
				</button>
				<button
					onclick={() => (selectedId = null)}
					class="rounded-xl px-3 py-2 text-sm font-bold text-white/40 hover:text-white/70"
				>
					✕
				</button>
			</div>
		{:else if interactive && takeable}
			<p class="text-center text-[0.7rem] font-semibold uppercase tracking-widest text-amber-300">
				tap the discard pile to take that {cardMeta(takeable).label}
			</p>
		{:else if interactive}
			<p class="text-center text-[0.7rem] font-semibold uppercase tracking-widest text-white/30">
				tap a card to play or discard
			</p>
		{/if}
	</div>

	<!-- Hand (raised above siblings so nothing can ever overlay/block the cards) -->
	<div class="safe-bottom relative z-10">
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
