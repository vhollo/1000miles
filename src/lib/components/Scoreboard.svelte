<script lang="ts">
	import type { GameState } from '$lib/game/state';
	import { handResult } from '$lib/game/scoring';

	let {
		state,
		onNextHand,
		onNewMatch,
		onHome
	}: {
		state: GameState;
		onNextHand: () => void;
		onNewMatch: () => void;
		onHome: () => void;
	} = $props();

	const r = $derived(handResult(state));
	const matchOver = $derived(r.matchWinner !== null);
	const champ = $derived(r.matchWinner);
	const leader = $derived(r.matchScores[0] === r.matchScores[1] ? null : r.matchScores[0] > r.matchScores[1] ? 0 : 1);

	const headline = $derived(
		matchOver
			? `${state.players[r.matchWinner!].name} wins the match! 🏆`
			: r.tripWinner !== null
				? `${state.players[r.tripWinner].name} reaches 1000`
				: `Hand ${r.hand} complete`
	);
	const pct = (v: number) => Math.min(100, (v / r.matchTarget) * 100);
</script>

<div class="text-center">
	<div class="relative mb-1 text-5xl">{matchOver ? '🏆' : '🏁'}</div>
	<h2 id="score-title" class="font-display text-2xl font-extrabold text-asphalt">{headline}</h2>
	<p class="mb-4 text-xs font-bold uppercase tracking-widest text-asphalt/40">
		{matchOver ? 'Final standings' : `Hand ${r.hand} · match to ${r.matchTarget}`}
	</p>

	<div class="space-y-3 text-left">
		{#each [0, 1] as i (i)}
			{@const p = state.players[i]}
			{@const sb = r.scores[i]}
			{@const highlight = matchOver ? champ === i : leader === i}
			<div
				class="rounded-2xl border-2 p-3 {highlight
					? 'border-amber-300 bg-amber-50'
					: 'border-white bg-white/70'}"
			>
				<div class="mb-1.5 flex items-center justify-between">
					<span class="flex items-center gap-1.5 font-display font-extrabold text-asphalt">
						{p.isAI ? '🤖' : '🧑'}
						{p.name}
						{#if matchOver && champ === i}<span class="text-base">👑</span>{/if}
					</span>
					<span class="font-display text-sm font-bold tabular-nums text-asphalt/50">
						+{sb.total} this hand
					</span>
				</div>

				<dl class="space-y-0.5">
					{#each sb.lines as line (line.label)}
						<div class="flex justify-between text-xs text-asphalt/70">
							<dt>{line.label}</dt>
							<dd class="font-semibold tabular-nums">+{line.points}</dd>
						</div>
					{/each}
				</dl>

				<!-- running match total -->
				<div class="mt-2 border-t border-asphalt/10 pt-2">
					<div class="mb-1 flex items-baseline justify-between">
						<span class="text-[0.65rem] font-bold uppercase tracking-wide text-asphalt/40">Match</span>
						<span class="font-display text-lg font-extrabold tabular-nums text-asphalt">
							{r.matchScores[i]}<span class="text-xs text-asphalt/40"> / {r.matchTarget}</span>
						</span>
					</div>
					<div class="h-2 overflow-hidden rounded-full bg-asphalt/10">
						<div
							class="h-full rounded-full transition-[width] duration-700 ease-out {highlight
								? 'bg-amber-400'
								: 'bg-road-500'}"
							style="width: {pct(r.matchScores[i])}%"
						></div>
					</div>
				</div>
			</div>
		{/each}
	</div>

	<div class="mt-5 flex gap-2">
		<button
			onclick={onHome}
			class="flex-1 rounded-2xl border-2 border-asphalt/10 bg-white px-4 py-3 font-display font-bold text-asphalt
				shadow-[0_4px_0_rgba(0,0,0,0.12)] transition active:translate-y-0.5 active:shadow-none"
		>
			Home
		</button>
		{#if matchOver}
			<button
				onclick={onNewMatch}
				class="flex-[1.5] rounded-2xl bg-road-500 px-4 py-3 font-display font-bold text-white
					shadow-[0_4px_0_var(--color-road-700)] transition active:translate-y-0.5 active:shadow-none"
			>
				New match
			</button>
		{:else}
			<button
				onclick={onNextHand}
				class="flex-[1.5] rounded-2xl bg-emerald-500 px-4 py-3 font-display font-bold text-white
					shadow-[0_4px_0_#15803d] transition active:translate-y-0.5 active:shadow-none"
			>
				Next hand →
			</button>
		{/if}
	</div>
</div>
