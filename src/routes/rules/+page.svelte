<script lang="ts">
	import { base } from '$app/paths';
	import { HAZARD_META, REMEDY_META, SAFETY_META, type Hazard, type Remedy, type Safety } from '$lib/game/cards';

	const hazards = Object.keys(HAZARD_META) as Hazard[];
	const remedies = Object.keys(REMEDY_META) as Remedy[];
	const safeties = Object.keys(SAFETY_META) as Safety[];
</script>

<svelte:head>
	<title>How to play — Mille Bornes</title>
</svelte:head>

<main class="safe-top safe-bottom mx-auto max-w-md px-5 pb-6">
	<a href="{base}/" class="text-sm font-bold text-road-600">← Back</a>
	<h1 class="mt-3 font-display text-3xl font-extrabold text-asphalt">How to play</h1>

	<section class="mt-5 rounded-2xl border-2 border-white bg-white/70 p-4">
		<h2 class="font-display text-lg font-extrabold text-asphalt">🏁 Goal</h2>
		<p class="mt-1 text-sm text-asphalt/75">
			Be the first to travel <strong>exactly 1000 miles</strong> by playing distance cards. You can
			only drive when you have a green light and no hazard is blocking you.
		</p>
	</section>

	<section class="mt-4 rounded-2xl border-2 border-white bg-white/70 p-4">
		<h2 class="font-display text-lg font-extrabold text-asphalt">🔁 Your turn</h2>
		<p class="mt-1 text-sm text-asphalt/75">
			Draw a card, then play one or discard one. Tap a card to play it or discard it. You need a
			<strong>Roll (🟢)</strong> before your first mile, and again after any blocking hazard.
		</p>
	</section>

	<section class="mt-4 rounded-2xl border-2 border-amber-200 bg-amber-50 p-4">
		<h2 class="font-display text-lg font-extrabold text-amber-600">🗑️ House rule — Take the discard</h2>
		<p class="mt-1 text-sm text-asphalt/75">
			If your opponent discards a card <em>you</em> can play, tap the discard pile and confirm to
			play it <strong>straight off the pile</strong> — the miles go on your road, the remedy onto
			your table. That play is <strong>your move for the turn</strong>. It cost you nothing from
			hand, so you pay by <strong>starting your next turn without a draw</strong>.
		</p>
		<p class="mt-2 text-xs text-asphalt/55">
			Only the card they just threw away, only while it's still on top, and only if it's legal for
			you right now — mileage, remedies and safeties. Their discarded hazards stay in the bin. Once
			the deck runs dry there's no draw left to forfeit, so it's free — which is exactly when the
			card you need is the one they just binned.
		</p>
	</section>

	<section class="mt-4 rounded-2xl border-2 border-white bg-white/70 p-4">
		<h2 class="font-display text-lg font-extrabold text-rose-600">💥 Hazards — attack opponents</h2>
		<ul class="mt-2 space-y-1">
			{#each hazards as h (h)}
				<li class="flex items-center gap-2 text-sm text-asphalt/75">
					<span class="text-lg">{HAZARD_META[h].emoji}</span>
					<strong>{HAZARD_META[h].label}</strong>
				</li>
			{/each}
		</ul>
		<p class="mt-2 text-xs text-asphalt/55">
			You can only attack an opponent who is rolling. Speed Limit caps them at 50 mi until they clear it.
		</p>
	</section>

	<section class="mt-4 rounded-2xl border-2 border-white bg-white/70 p-4">
		<h2 class="font-display text-lg font-extrabold text-emerald-600">🔧 Remedies — fix yourself</h2>
		<ul class="mt-2 grid grid-cols-2 gap-1">
			{#each remedies as r (r)}
				<li class="flex items-center gap-2 text-sm text-asphalt/75">
					<span class="text-lg">{REMEDY_META[r].emoji}</span>
					<strong>{REMEDY_META[r].label}</strong>
				</li>
			{/each}
		</ul>
	</section>

	<section class="mt-4 rounded-2xl border-2 border-violet-200 bg-violet-50 p-4">
		<h2 class="font-display text-lg font-extrabold text-violet-600">🛡️ Safeties &amp; Coup Fourré</h2>
		<ul class="mt-2 space-y-1">
			{#each safeties as s (s)}
				<li class="flex items-center gap-2 text-sm text-asphalt/75">
					<span class="text-lg">{SAFETY_META[s].emoji}</span>
					<strong>{SAFETY_META[s].label}</strong>
				</li>
			{/each}
		</ul>
		<p class="mt-2 text-sm text-asphalt/75">
			A safety makes you immune forever and lets you play again. If an opponent plays the matching
			hazard <em>just</em> as you hold its safety, reveal it for a <strong>Coup Fourré</strong>:
			<strong class="text-violet-600">+300 points</strong> and you steal the turn!
		</p>
	</section>

	<section class="mt-4 rounded-2xl border-2 border-white bg-white/70 p-4">
		<h2 class="font-display text-lg font-extrabold text-asphalt">🏆 Scoring</h2>
		<ul class="mt-2 space-y-0.5 text-sm text-asphalt/75">
			<li>Distance — 1 pt per mile</li>
			<li>Each safety — 100 · all four — +300</li>
			<li>Each Coup Fourré — 300</li>
			<li>Trip completed — 400</li>
			<li>Safe trip (no 200s) — 300</li>
			<li>Delayed action / Shutout — 300 / 500</li>
		</ul>
	</section>

	<a
		href="{base}/"
		class="mt-6 block rounded-2xl bg-road-500 px-5 py-4 text-center font-display text-lg font-extrabold text-white
			shadow-[0_5px_0_var(--color-road-700)] transition active:translate-y-1 active:shadow-none"
	>
		Let's drive →
	</a>
</main>
