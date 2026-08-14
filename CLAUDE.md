# CLAUDE.md

Guidance for AI assistants working in this repository.

## What this is

**Mille Bornes — 1000 Miles**: an installable PWA of the classic French racing card game.
Two players race to exactly 1000 miles across a multi-hand match (first to 3000 points).

Three ways to play:

- **Solo vs CPU** — heuristic AI (`src/lib/game/ai.ts`).
- **2 players, pass & play** — one device; the board is covered on hand-off.
- **Online** — peer-to-peer WebRTC, host-authoritative, brokered by a 4-digit room code.

## Commands

```sh
npm install                  # first run also triggers `svelte-kit sync` via `prepare`
npm run dev                  # vite dev --host (port 5173)
npm test                     # vitest run — 7 files / 45 tests, ~1s
npm run test:watch
npm run check                # svelte-kit sync && svelte-check (must be 0 errors)
npm run build                # -> build/  (Netlify adapter)
npm run preview              # serve the production build (port 4173)
node scripts/gen-icons.mjs   # regenerate PNG icons from static/icons/icon.svg (needs sharp)
```

`npm test` and `npm run check` are the gate for any change. Both currently pass clean —
keep them that way. There is no ESLint or Prettier config in the repo; match the
surrounding style by hand (tabs for indent, single quotes, semicolons, ~100 col lines).

## Architecture

The central design decision: **the game engine is pure and framework-free**, wrapped by a
thin reactive store. The engine never imports Svelte, which keeps rules unit-testable,
makes the AI trivial to drive, and lets the same reducer run identically on both peers.

```
src/lib/game/          pure engine — no Svelte, no browser APIs
  cards.ts             106-card deck, card types, hazard↔remedy↔safety tables, display metadata
  rng.ts               mulberry32 seedable PRNG + Fisher–Yates shuffle
  rules.ts             predicates: isRolling, isSpeedLimited, canPlayDistance, canAttackWith, …
  engine.ts            createGame · nextHand · applyMove (pure reducer) · legalMoves · activePlayer
  scoring.ts           computeScore / handResult
  ai.ts                chooseMove — ranked heuristic, no search
src/lib/net/           online play
  protocol.ts          NetMessage union sent over the DataChannel
  transport.ts         Transport interface (peer.ts implements it; tests fake it)
  peer.ts              WebRTC RTCPeerConnection + DataChannel
  codec.ts             deflate-raw + base64url encoding of SDP blobs; extractCode()
  signal.ts            client for /api/signal (room codes)
  session.ts           HOST_SEAT/GUEST_SEAT, hostApplyGuestMove (authoritative validation)
  redact.ts            strip hidden info before the host broadcasts state
src/lib/stores/
  game.svelte.ts       GameStore — runes class: persistence, AI loop, online orchestration
src/lib/components/    Card, Hand, Tableau, Board, Odometer, Modal, Scoreboard,
                       InstallButton, SignalExchange
src/routes/            / (menu) · /play (board) · /rules · /online (matchmaking)
  api/signal/          POST/GET/PUT room broker, backed by Netlify Blobs
  api/ice/             ICE/TURN server config (Metered.ca creds or public fallback)
src/service-worker.ts  offline app-shell cache
```

### Layering rule

`components → store → engine`. Components read `game.state` and call `game.play(move)`;
they never call `applyMove` directly. Nothing in `src/lib/game/` may import from `$app/*`,
`svelte`, or `src/lib/net/`. `src/lib/net/` may import the engine, never the store.

### The reducer contract

`applyMove(state, move)` is pure: it clones and returns a new `GameState`, never mutates the
input. **Illegal moves are silently ignored** (returns the cloned state unchanged) rather
than throwing — callers gate on `legalMoves` / `playableCardIds` first.

The clone in `engine.ts` is deliberately shallow-per-container (`clonePlayer`/`clone`), not
`structuredClone`: card objects are immutable and only ever moved between piles, so sharing
their references is safe and much cheaper. Preserve that property — if you ever mutate a
`Card` in place you will corrupt every pile that references it.

### Key state invariants

- `battle` holds roll / stop / blocking hazards / remedies; `speed` holds only
  speedLimit / endOfLimit. Only the **top** card of each stack matters.
- A hazard is only ever stacked on top of a green light, so `isRolling` can be derived
  purely from the top of `battle`. Don't add a separate boolean flag.
- `activePlayer(s)` ≠ `s.current` during a Coup Fourré: the *defender* is the one whose
  input is expected. Always use `activePlayer` for "whose turn is it, UI-wise".
- `phase` is `'play' | 'coupFourre' | 'gameOver'`. `'gameOver'` ends a *hand*, not
  necessarily the match — `matchWinner` marks the match being decided.
- Match fields (`matchTarget`, `matchScores`, `hand`, `matchWinner`) were added after the
  original save format. `migrateState()` in the store backfills them for old localStorage
  saves and for peers on older builds. If you add a state field, add a backfill there too.

## The store (`game.svelte.ts`)

A Svelte 5 runes class exported as a singleton `game`. It owns everything the pure engine
can't: `localStorage` persistence (key `millebornes:save:v1`), the AI auto-play timer
(750 ms per move), and the online session.

`play(move)` is the single entry point and branches on `role`:

- **offline** — apply locally, persist, schedule the AI if it's their turn.
- **host** — apply locally if it's our seat, then broadcast the redacted state.
- **guest** — send the move to the host and wait; never applies locally.

`#gen` is a generation counter bumped on every new game / attach / clear. Any async
continuation (AI timer, answer polling, connect watchdog) captures `gen` and bails if it
changed. Follow that pattern for new async work — it's the only thing preventing stale
timers from a previous game clobbering the current one.

## Online play

Host-authoritative, so a tampered client can't cheat:

1. Host calls `hostRoom()` → creates an `RTCPeerConnection`, encodes the offer SDP
   (`codec.ts`), POSTs it to `/api/signal`, gets a **4-digit room code**, polls for the answer.
2. Guest calls `joinRoom(code)` → GETs the offer, produces an answer, PUTs it back.
3. Channel opens → host broadcasts `{ t: 'state', state: redactFor(state, GUEST_SEAT) }`.
4. Guest sends `{ t: 'move', move }`; the host runs `hostApplyGuestMove`, which rejects the
   move unless it is genuinely the guest's turn **and** structurally matches a `legalMoves`
   entry. Then it re-broadcasts.

`redactFor` zeroes `seed`, replaces the draw pile with placeholders and hides the opponent's
hand — count-preserving, so the UI still renders the right number of card backs. Never send
raw state to the guest.

Two gotchas:

- `#broadcast` calls `$state.snapshot()` before `redactFor`, because `structuredClone` cannot
  clone a Svelte reactive proxy. Any new code that clones or serialises `this.state` needs
  the same treatment.
- There is a manual fallback path (`beginHost`/`beginGuest` + `SignalExchange`) for when
  `/api/signal` is unreachable — peers copy/paste the compressed SDP codes or a share link
  (`/online#j=<code>` / `#a=<code>`, parsed by `extractCode`). Keep both paths working.

Rooms live in Netlify Blobs with a 10-minute TTL. TURN credentials come from `/api/ice`,
which uses `METERED_API_KEY` + `METERED_APP_NAME` when set (Netlify env vars) and otherwise
falls back to public STUN + the Metered open-relay TURN servers.

## Rendering & routing

`src/routes/+layout.ts` sets `ssr = false` and `prerender = true`: every page is a
prerendered shell hydrated on the client, so the game runs fully offline. The API routes
opt back out with `export const prerender = false` and deploy as Netlify Functions.

Consequences to respect:

- No server-side data loading. Don't add `+page.server.ts` for game routes.
- Anything touching `localStorage`, `navigator`, or `location` must be inside `onMount`,
  an `$effect`, or guarded by `browser` from `$app/environment`.
- Internal links use `{base}` from `$app/paths`.

Runes mode is forced project-wide in `vite.config.ts` (except `node_modules`). Use
`$state`/`$derived`/`$props`/`$effect` — no `export let`, no legacy stores.

## Testing

`vitest.config.ts` deliberately does **not** load the SvelteKit Vite plugin: all tests are
pure TypeScript in the `node` environment, with only the `$lib` alias mapped. There are no
component tests and no jsdom.

- `src/lib/game/engine.test.ts` — rules invariants, built from tiny hand-crafted states
  (`D`/`RM`/`HZ`/`SF` builders at the top of the file). Reuse those helpers.
- `src/lib/game/ai.test.ts` — self-play across 40 seeds; asserts hands terminate and that
  the AI actually completes trips.
- `src/lib/net/*.test.ts` — codec round-trips, redaction, host validation of guest moves,
  and the signal endpoint against an in-memory `@netlify/blobs` mock.

New logic belongs in `src/lib/game/` or `src/lib/net/` where it can be tested this way. If
you find yourself wanting to test a component, that's usually a sign the logic should move
down into the engine.

## PWA

`src/service-worker.ts` precaches `build`/`files`/`prerendered` under a versioned cache,
serves immutable build assets cache-first, and falls back to the cached shell for offline
navigations. `static/manifest.webmanifest` plus `static/icons/*` (regenerated from
`icon.svg` by `scripts/gen-icons.mjs`) cover install. Adding a static asset that must work
offline means making sure it lands in `build`/`files`.

## Styling

TailwindCSS v4, configured entirely in `src/app.css` via `@theme` — there is no
`tailwind.config.js`. Custom tokens: the `road-*` scale, `mb-red` / `mb-green` / `mb-blue`,
`felt` / `felt-light`, `cream`, `asphalt`, and the `font-display` / `font-body` families.
Use those tokens rather than raw hex. The visual language is a green felt table with
authentic Mille Bornes card faces; buttons use a chunky `shadow-[0_5px_0_…]` + `active:translate-y-1`
press effect. `prefers-reduced-motion` is honoured globally in `app.css`.

## Deployment

Netlify. `netlify.toml` runs `npm run build` and publishes `build/`;
`@sveltejs/adapter-netlify` emits the prerendered pages plus a `sveltekit-render` function
for `/api/*`. No manual redirects are needed.

Note: the README's Stack section still says `@sveltejs/adapter-static` — the project moved to
`@sveltejs/adapter-netlify` when the signaling endpoint was added. Trust `vite.config.ts`.
