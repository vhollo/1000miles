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
			? `${state.players[r.matchWinner!].name} remporte la partie !`
			: r.tripWinner !== null
				? `${state.players[r.tripWinner].name} atteint 1000 km`
				: `Manche ${r.hand} terminée`
	);
	const pct = (v: number) => Math.min(100, (v / r.matchTarget) * 100);
</script>

<div class="text-center">
	<div class="mb-2 text-4xl">{matchOver ? '🏆' : '🏁'}</div>
	<h2 id="score-title" class="font-display text-2xl font-bold text-[#1C120A]">{headline}</h2>
	<p class="mb-4 font-body text-xs uppercase tracking-widest text-[#1C120A]/40">
		{matchOver ? 'Résultats finaux' : `Manche ${r.hand} · objectif ${r.matchTarget} pts`}
	</p>

	<!-- Divider -->
	<div class="mb-4 flex items-center gap-2">
		<hr class="flex-1 border-[#C4A878]/60" />
		<span class="text-[10px] font-bold uppercase tracking-widest text-[#9A8A6A]">Scores</span>
		<hr class="flex-1 border-[#C4A878]/60" />
	</div>

	<div class="space-y-3 text-left">
		{#each [0, 1] as i (i)}
			{@const p = state.players[i]}
			{@const sb = r.scores[i]}
			{@const highlight = matchOver ? champ === i : leader === i}
			<div
				class="rounded-[3px] border p-3
					{highlight
						? 'border-[#B8880E] bg-[#F8F0D8]'
						: 'border-[#C4A878]/60 bg-[#FBF5E4]'}"
			>
				<div class="mb-1.5 flex items-center justify-between">
					<span class="flex items-center gap-1.5 font-display font-bold text-[#1C120A]">
						{p.isAI ? '🤖' : '🧑'}
						{p.name}
						{#if matchOver && champ === i}<span class="text-base">👑</span>{/if}
					</span>
					<span class="font-body text-sm italic text-[#1C120A]/50">
						+{sb.total} pts
					</span>
				</div>

				<dl class="space-y-0.5">
					{#each sb.lines as line (line.label)}
						<div class="flex justify-between font-body text-xs text-[#1C120A]/65">
							<dt>{line.label}</dt>
							<dd class="font-semibold tabular-nums">+{line.points}</dd>
						</div>
					{/each}
				</dl>

				<!-- Running match total -->
				<div class="mt-2 border-t border-[#C4A878]/40 pt-2">
					<div class="mb-1 flex items-baseline justify-between">
						<span class="font-body text-[0.65rem] uppercase tracking-wide text-[#1C120A]/40">Total</span>
						<span class="font-display text-lg font-bold tabular-nums text-[#1C120A]">
							{r.matchScores[i]}<span class="text-xs text-[#1C120A]/40"> / {r.matchTarget}</span>
						</span>
					</div>
					<div class="h-1.5 overflow-hidden rounded-sm bg-[#C4A878]/30">
						<div
							class="h-full rounded-sm transition-[width] duration-700 ease-out
								{highlight ? 'bg-[#B8880E]' : 'bg-[#1B3A6B]'}"
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
			class="flex-1 rounded-[3px] border border-[#C4A878] bg-[#FBF5E4] px-4 py-3 font-display font-bold text-[#1C120A]
				shadow-[0_3px_0_rgba(0,0,0,0.10)] transition active:translate-y-0.5 active:shadow-none"
		>
			Accueil
		</button>
		{#if matchOver}
			<button
				onclick={onNewMatch}
				class="flex-[1.5] rounded-[3px] border border-[#0F2042] bg-[#1B3A6B] px-4 py-3 font-display font-bold text-[#EDE0BE]
					shadow-[0_4px_0_#0A1428] transition active:translate-y-0.5 active:shadow-none"
			>
				Nouvelle partie
			</button>
		{:else}
			<button
				onclick={onNextHand}
				class="flex-[1.5] rounded-[3px] border border-[#0E3020] bg-[#1A5430] px-4 py-3 font-display font-bold text-[#EDE0BE]
					shadow-[0_4px_0_#091E18] transition active:translate-y-0.5 active:shadow-none"
			>
				Manche suivante →
			</button>
		{/if}
	</div>
</div>
