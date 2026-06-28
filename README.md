# 🏎️ Mille Bornes — 1000 Miles

A playful, installable **PWA** of the classic French racing card game. Race to **exactly 1000 miles**,
fend off opponents with hazards, defend with safeties, and pull off a triumphant **Coup Fourré**.

- **Solo vs CPU** — heuristic AI opponent.
- **2 Players (pass & play)** — share one device; the screen hides each player's hand on hand-off.
- **Full official ruleset** — distance cards, all hazards/remedies, the 4 safeties, Coup Fourré
  bonuses, and the complete scoring breakdown.
- **Works offline** — service-worker cached app shell; installs to the home screen.

## Stack

SvelteKit · Svelte 5 (runes) · TypeScript · TailwindCSS v4 · `@sveltejs/adapter-static` (pure client SPA).

## Architecture

The game is split into a **pure, framework-free engine** wrapped by a thin reactive store. The engine
knows nothing about Svelte, which keeps the rules unit-testable, makes the AI trivial to drive, and
leaves the door open to networked multiplayer (moves are small serialisable JSON).

```
src/lib/game/        pure engine (no Svelte)
  cards.ts           106-card deck + types + display metadata
  rng.ts             seedable PRNG (mulberry32) + shuffle
  rules.ts           predicates: isRolling, canPlayDistance, canAttackWith, …
  engine.ts          createGame · legalMoves · applyMove (pure reducer)
  scoring.ts         computeScore / handResult
  ai.ts              chooseMove heuristic
  *.test.ts          Vitest suites (rules invariants + AI self-play)
src/lib/stores/
  game.svelte.ts     runes store: persistence + AI auto-play loop
src/lib/components/   Card, Hand, Tableau, Odometer, Board, Modal, Scoreboard, …
src/routes/          / (menu) · /play (board) · /rules (how-to)
src/service-worker.ts  offline app-shell cache
```

## Scripts

```sh
npm run dev        # dev server
npm run build      # production build -> build/ (static, deployable anywhere)
npm run preview    # preview the production build
npm test           # run the engine + AI test suites
npm run check      # type-check (svelte-check)
node scripts/gen-icons.mjs   # regenerate PNG app icons from static/icons/icon.svg
```

## Deploying

`npm run build` emits a fully static site to `build/` (with a `200.html` SPA fallback). Drop it on any
static host (Netlify, Vercel, GitHub Pages, a plain bucket).
