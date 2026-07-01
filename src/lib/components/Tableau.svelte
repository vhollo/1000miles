<script lang="ts">
	import { SAFETY_META, type Safety } from '$lib/game/cards';
	import { isRolling, isSpeedLimited, topBattle, topSpeed, totalMiles } from '$lib/game/rules';
	import type { PlayerState } from '$lib/game/state';
	import Card from './Card.svelte';
	import Odometer from './Odometer.svelte';

	let {
		player,
		isActive = false,
		isViewer = false
	}: { player: PlayerState; isActive?: boolean; isViewer?: boolean } = $props();

	const bt = $derived(topBattle(player));
	const st = $derived(topSpeed(player));
	const rolling = $derived(isRolling(player));
	const limited = $derived(isSpeedLimited(player));
	const miles = $derived(totalMiles(player));

	const ALL_SAFETIES: Safety[] = ['drivingAce', 'extraTank', 'punctureProof', 'rightOfWay'];

	const status = $derived(
		bt?.kind === 'hazard'
			? { text: 'Blocked', tone: 'bg-rose-100 text-rose-700 ring-rose-200' }
			: rolling
				? { text: 'Rolling', tone: 'bg-emerald-100 text-emerald-700 ring-emerald-200' }
				: { text: 'Stopped', tone: 'bg-slate-100 text-slate-600 ring-slate-200' }
	);
</script>

<section
	class="rounded-3xl border-2 bg-white/70 p-3 backdrop-blur-sm transition-all duration-300
		{isActive ? 'border-amber-300 shadow-[0_0_0_4px_rgba(252,211,77,0.35)]' : 'border-white/80'}"
>
	<header class="mb-2 flex items-center justify-between gap-2">
		<div class="flex items-center gap-2">
			<span
				class="grid h-8 w-8 place-items-center rounded-full text-lg
					{isViewer ? 'bg-road-100' : 'bg-rose-100'}"
			>
				{player.isAI ? '🤖' : isViewer ? '🧑' : '🧑‍🤝‍🧑'}
			</span>
			<div class="leading-tight">
				<p class="font-display text-sm font-extrabold text-asphalt">{player.name}</p>
				<div class="flex items-center gap-1">
					<span class="rounded-full px-2 py-px text-[0.6rem] font-bold uppercase tracking-wide ring-1 {status.tone}">
						{status.text}
					</span>
					{#if limited}
						<span class="rounded-full bg-amber-100 px-2 py-px text-[0.6rem] font-bold uppercase tracking-wide text-amber-700 ring-1 ring-amber-200">
							50 limit
						</span>
					{/if}
				</div>
			</div>
		</div>

		<!-- Safety slots: all 4 always shown, owned ones lit, empty ones dimmed -->
		<div class="flex gap-1">
			{#each ALL_SAFETIES as s (s)}
				{@const owned = player.safeties.includes(s)}
				<span
					title={SAFETY_META[s].label}
					class="grid h-7 w-7 place-items-center rounded-lg text-sm
						{owned ? 'bg-violet-500 text-white shadow-sm' : 'bg-slate-100 opacity-30'}"
				>
					{SAFETY_META[s].emoji}
				</span>
			{/each}
		</div>
	</header>

	<div class="flex items-end gap-3">
		<div class="min-w-0 flex-1">
			<Odometer {miles} accent={isViewer ? 'road' : 'rose'} />
		</div>

		<!-- current battle / speed cards -->
		<div class="flex items-end gap-1.5">
			{#if bt}
				<Card card={bt} size="sm" />
			{:else}
				<div class="grid h-[4.5rem] w-12 place-items-center rounded-2xl border-2 border-dashed border-asphalt/15 text-[0.55rem] font-bold uppercase text-asphalt/30">
					garage
				</div>
			{/if}
			{#if st}
				<Card card={st} size="sm" />
			{/if}
		</div>
	</div>
</section>
