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
			? { text: 'Bloqué', tone: 'bg-[#9A1020]/15 text-[#9A1020] ring-[#9A1020]/30' }
			: rolling
				? { text: 'En route', tone: 'bg-[#1A5430]/15 text-[#1A5430] ring-[#1A5430]/30' }
				: { text: 'Arrêté', tone: 'bg-[#3A4050]/10 text-[#3A4050]/80 ring-[#3A4050]/20' }
	);
</script>

<section
	class="border bg-[#FBF5E4] p-3 transition-all duration-300 rounded-[3px]
		{isActive
			? 'border-[#B8880E] shadow-[0_0_0_3px_rgba(184,136,14,0.25)]'
			: 'border-[#C4A878]/60 shadow-[1px_2px_6px_rgba(0,0,0,0.12)]'}"
>
	<header class="mb-2 flex items-center justify-between gap-2">
		<div class="flex items-center gap-2">
			<span
				class="grid h-8 w-8 place-items-center rounded-full border text-lg
					{isViewer ? 'border-[#1B3A6B]/30 bg-[#1B3A6B]/10' : 'border-[#9A1020]/30 bg-[#9A1020]/10'}"
			>
				{player.isAI ? '🤖' : isViewer ? '🧑' : '🧑‍🤝‍🧑'}
			</span>
			<div class="leading-tight">
				<p class="font-display text-sm font-bold text-[#1C120A]">{player.name}</p>
				<div class="flex items-center gap-1">
					<span class="rounded-sm px-1.5 py-px text-[0.6rem] font-bold uppercase tracking-wide ring-1 {status.tone}">
						{status.text}
					</span>
					{#if limited}
						<span class="rounded-sm bg-[#8A5A08]/15 px-1.5 py-px text-[0.6rem] font-bold uppercase tracking-wide text-[#8A5A08] ring-1 ring-[#8A5A08]/30">
							50 km/h
						</span>
					{/if}
				</div>
			</div>
		</div>

		<!-- Safety badges -->
		<div class="flex gap-1">
			{#each ALL_SAFETIES as s (s)}
				{@const owned = player.safeties.includes(s)}
				<span
					title={SAFETY_META[s].label}
					class="grid h-7 w-7 place-items-center rounded-[3px] border text-sm
						{owned
							? 'border-[#4A1260] bg-[#4A1260] text-white shadow-sm'
							: 'border-[#C4A878]/40 bg-[#F0E8D0]/60 opacity-30'}"
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

		<!-- Current battle / speed cards -->
		<div class="flex items-end gap-1.5">
			{#if bt}
				<Card card={bt} size="sm" />
			{:else}
				<div class="grid h-[4.5rem] w-12 place-items-center rounded-[3px] border border-dashed border-[#C4A878]/60 text-[0.55rem] font-bold uppercase tracking-wide text-[#9A8A6A]">
					garage
				</div>
			{/if}
			{#if st}
				<Card card={st} size="sm" />
			{/if}
		</div>
	</div>
</section>
