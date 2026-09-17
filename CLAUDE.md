# CLAUDE.md

Guidance for AI assistants working in this repository.

## What this is

**Mille Bornes — 1000 Miles**: an installable PWA of the classic French racing card game.
Two players race to exactly 1000 miles across a multi-hand match (first to 3000 points).

Three ways to play:

- **Solo vs CPU** — heuristic AI (`src/lib/game/ai.ts`).
- **2 players, pass & play** — one device; the board is covered on hand-off.
- **Online** — peer-to-peer WebRTC, host-authoritative. Three ways to pair: a 4-digit room
  code, a scanned/shared QR link with no server at all, or a push notification to someone
  on your saved partner list.

## Commands

```sh
npm install                  # first run also triggers `svelte-kit sync` via `prepare`
npm run dev                  # vite dev --host (port 5173)
npm test                     # vitest run — 14 files / 107 tests, ~20s
npm run test:watch
npm run check                # svelte-kit sync && svelte-check (must be 0 errors)
npm run build                # -> build/  (Netlify adapter)
npm run preview              # serve the production build (port 4173)
node scripts/gen-icons.mjs   # regenerate PNG icons from static/icons/icon.svg (needs sharp)
```

`npm test` and `npm run check` are the gate for any change. Both currently pass clean —
keep them that way. There is no ESLint or Prettier config in the repo; match the
surrounding style by hand (tabs for indent, single quotes, semicolons, ~100 col lines).

The project has **no runtime dependencies** — `package.json` has `devDependencies` only.
`@netlify/blobs` is supplied by the Netlify runtime, and everything cryptographic is done
against Web Crypto by hand rather than pulling in `web-push`. Keep it that way unless there
is a strong reason not to; it is why the whole app can be served as static files.

## Architecture

The central design decision: **the game engine is pure and framework-free**, wrapped by a
thin reactive store. The engine never imports Svelte, which keeps rules unit-testable,
makes the AI trivial to drive, and lets the same reducer run identically on both peers.

The same split is repeated twice more: `partners/file.ts` is pure and `partners/store.svelte.ts`
is its reactive shell; the push endpoints are thin wrappers over pure helpers in `push/`.

```
src/lib/game/          pure engine — no Svelte, no browser APIs
  cards.ts             106-card deck, card types, hazard↔remedy↔safety tables, display metadata
  rng.ts               mulberry32 seedable PRNG + Fisher–Yates shuffle
  rules.ts             predicates: isRolling, isSpeedLimited, canPlayDistance, canPlayRemedy, …
  state.ts             GameState / PlayerState / Move / Phase types
  engine.ts            createGame · nextHand · applyMove (pure reducer) · legalMoves · activePlayer
  scoring.ts           computeScore / handResult
  ai.ts                chooseMove — ranked heuristic, no search
  text.ts              acts() / asObject() — "You drive" vs "AI drives" for the log
src/lib/net/           online play
  protocol.ts          NetMessage union sent over the DataChannel
  transport.ts         Transport interface (peer.ts implements it; tests fake it)
  peer.ts              WebRTC RTCPeerConnection + DataChannel
  codec.ts             deflate-raw + base64url encoding of SDP blobs; extractCode()
  qr.ts                dependency-free QR encoder (byte mode, ECC L/M, versions 1–40)
  signal.ts            client for /api/signal (room codes); owns ROOM_TTL_MS
  room-store.server.ts the rooms themselves, in Netlify Blobs
  handshake.ts         the `hello` exchange that settles both display names
  session.ts           HOST_SEAT/GUEST_SEAT, hostApplyGuestMove (authoritative validation)
  redact.ts            strip hidden info before the host broadcasts state
src/lib/partners/      who you are, and who you have played with (localStorage)
  types.ts             Identity / Partner / PartnersFile; PARTNERS_KEY, PARTNERS_VERSION
  file.ts              pure load / save / edit functions over a plain object
  store.svelte.ts      `partners` — runes singleton wrapping those functions
src/lib/push/          push invitations
  client.ts            browser half: permission, subscribe, mint/revoke/spend tokens
  swkv.ts              the device id in Cache Storage, so the worker can read it too
  vapid.ts             RFC 8292 ES256 request signing
  encrypt.ts           RFC 8291 `aes128gcm` payload encryption
  send.ts              the one fetch to a push service — the seam the tests mock
  store.ts             server-side records in Netlify Blobs, plus the rate limits
  validate.ts          cleanName / readSubscription — everything crossing a trust boundary
  config.server.ts     VAPID_* env vars (and how to generate a pair)
src/lib/bytes.ts       base64url + byte helpers, shared by the SDP codec and push
src/lib/server/http.ts readJson / str, shared by the API routes
src/lib/pwa.svelte.ts  self-updating service worker registration
src/lib/stores/
  game.svelte.ts       GameStore — runes class: persistence, AI loop, online orchestration
src/lib/components/    Card, Hand, Tableau, Board, Odometer, Modal, Scoreboard, InstallButton,
                       SignalExchange, QrCode, QrScanner, Lobby, PartnerList, PushToggle,
                       NicknamePrompt, UpdateNotice
src/routes/            / (menu) · /play (board) · /rules · /online (pairing + lobby)
  api/signal/          POST/GET/PUT room broker
  api/ice/             ICE/TURN server config (Metered.ca creds or public fallback)
  api/push/key/        GET the VAPID public key
  api/push/device/     POST a subscription → device id · DELETE to unregister
  api/push/token/      POST to mint one partner's invite token · DELETE to revoke it
  api/push/invite/     POST to spend a token: notify that device about a room code
src/service-worker.ts  offline app-shell cache + push / notificationclick / resubscribe
```

### Layering rule

`components → store → engine`. Components read `game.state` and call `game.play(move)`;
they never call `applyMove` directly. Nothing in `src/lib/game/` may import from `$app/*`,
`svelte`, or `src/lib/net/`. `src/lib/net/` may import the engine, never the store.

Anything named `*.server.ts` (`room-store.server.ts`, `config.server.ts`) is server-only —
SvelteKit will fail the build if it is ever reachable from the browser. Secrets live behind
that boundary; `config.server.ts` is the only module that reads the VAPID private key.

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

### The AI and the discard pile

`chooseMove` is a ranked list of heuristics, no search. One rule is easy to break by
accident: under this project's house rule the discard lands face up and the opponent may
claim it on their next turn, so **every discard is also a gift**. `discardScore` says what a
card is worth to us; `giftRisk` says what it would be worth to them *right now* (0 when they
could not legally play it), and the choice is the difference. The weights are deliberately
on one scale — denial is worth a few points, not any number of them — except the card that
would complete their trip, which is priced so high it is never handed over.

## The store (`game.svelte.ts`)

A Svelte 5 runes class exported as a singleton `game`. It owns everything the pure engine
can't: `localStorage` persistence (key `millebornes:save:v1`), the AI auto-play timer
(750 ms per move), and the online session.

`play(move)` is the single entry point and branches on `role`:

- **offline** — apply locally, persist, schedule the AI if it's their turn.
- **host** — apply locally if it's our seat, then broadcast the redacted state.
- **guest** — send the move to the host and wait; never applies locally.

`#gen` is a generation counter bumped on every new game / attach / clear. Any async
continuation (AI timer, answer polling, connect watchdog, hello grace timer) captures `gen`
and bails if it changed. Follow that pattern for new async work — it's the only thing
preventing stale timers from a previous game clobbering the current one.

`identity` is set by the root layout from the partner store, and is what the store announces
to a peer. It is separate from `state`, because it outlives any single game.

## Online play

Host-authoritative, so a tampered client can't cheat.

**Pairing** happens one of three ways, all ending in the same open DataChannel:

1. **Room code** — host calls `hostRoom()`, which creates an `RTCPeerConnection`, encodes
   the offer SDP (`codec.ts`), POSTs it to `/api/signal`, gets a **4-digit room code** and
   polls for the answer. Guest calls `joinRoom(code)`, GETs the offer, answers, PUTs it back.
2. **Direct** — no server at all: the peers show each other the compressed SDP as a QR code
   or a share link (`/online#j=<code>` / `#a=<code>`, parsed by `extractCode`), scanning with
   `QrScanner` or pasting. This is the path that still works on a LAN with no internet.
3. **Push invite** — the host creates a room as in (1) and then asks the server to notify a
   saved partner about the code. See "Push invitations" below.

**Once the channel opens:**

1. Both peers send `{ t: 'hello', proto: 1, peerId, name }`. The host waits up to
   `HELLO_GRACE_MS` (3s) for the guest's name before dealing, so the opening log line is
   right the first time; a peer on an older build never sends one and the wait just expires.
2. Both land in the **lobby** (`Lobby.svelte`, shown while `game.connected && !game.started`).
   The guest signals `{ t: 'ready' }`, the host answers `{ t: 'start' }` and deals.
3. Host broadcasts `{ t: 'state', state: redactFor(state, GUEST_SEAT) }` after every move.
4. Guest sends `{ t: 'move', move }`; the host runs `hostApplyGuestMove`, which rejects the
   move unless it is genuinely the guest's turn **and** structurally matches a `legalMoves`
   entry. Then it re-broadcasts.

`redactFor` zeroes `seed`, replaces the draw pile with placeholders and hides the opponent's
hand — count-preserving, so the UI still renders the right number of card backs. Never send
raw state to the guest.

Three gotchas:

- `#broadcast` calls `$state.snapshot()` before `redactFor`, because `structuredClone` cannot
  clone a Svelte reactive proxy. Any new code that clones or serialises `this.state` needs
  the same treatment.
- `NetMessage` variants added after the first release (`hello`, `ready`, `start`, `partner`)
  must stay ignorable: `#handleNet` has no default case and `peer.ts` drops frames it cannot
  parse, which is what lets an older peer still finish a game. Keep new variants additive.
- Names and labels arriving from a peer go through `cleanName` before they are stored or
  displayed. They reach both the board and a notification title.

Rooms live in Netlify Blobs with a 10-minute TTL (`ROOM_TTL_MS`, read by both the client and
the endpoint so the waiting window matches). TURN credentials come from `/api/ice`, which
uses `METERED_API_KEY` + `METERED_APP_NAME` when set and otherwise falls back to public STUN
plus the Metered open-relay TURN servers.

### Why pairing is QR and not Bluetooth

A browser cannot do device-to-device radio: Web Bluetooth is central-only (two browsers
never see each other) and absent from iOS Safari, there is no web API for Wi-Fi Direct or
AWDL, and Web NFC is Android-only. So offline pairing is WebRTC over the LAN with the
handshake carried by QR or the OS share sheet. This would only change if the app were
wrapped natively.

## Identity and partners

`src/lib/partners/` holds the only long-lived identity in the app, in
`millebornes:partners:v1` — deliberately separate from the saved game, which `game.clear()`
throws away whenever someone backs out.

- `peerId` — a stable public handle for this device, sent to every peer. Knowing it grants
  nothing.
- `name` — the nickname others see (`NicknamePrompt` asks for it before the first game).
- `did` — the server-side handle for this device's push subscription, if registered. This
  one is *ours only* and is never sent to a peer.
- `partners[]` — everyone we have played with, each with the token they gave us (their
  permission to invite them) and the token we gave them.

All the logic is pure in `file.ts` and tested without a browser; `store.svelte.ts` only holds
the current value and writes it back. A revocation that fails is queued and retried by
`flushRevocations()` on the next load, so a partner removed while offline still gets cut off.

## Push invitations

The point: a partner can wake your phone with "come and play", without either of you having
an account. It is a **capability** model, not an identity one.

1. You turn on notifications (`PushToggle`). The browser gives a `PushSubscription`;
   `/api/push/device` stores it and returns a `did`.
2. For each partner you play with, `/api/push/token` mints a random token and you hand it to
   them over the data channel (`{ t: 'partner', token }`). That token is their permission to
   ring your phone, and nothing else.
3. When they later want to play, they create a room and POST the token plus the 4-digit code
   to `/api/push/invite`. The server checks the room actually exists (via
   `room-store.server.ts`), then sends an encrypted push; the worker shows a notification,
   and a tap carries the code straight into the game.

Things to preserve when touching this:

- **Tokens are stored hashed** (`hashKey`), so a dump of the store yields no working
  capability. The device record and the token record are separate blobs on purpose.
- **Every limit is in `store.ts`**, not scattered through the endpoints:
  `MAX_TOKENS_PER_DEVICE` (20), `INVITE_COOLDOWN_MS` (30s), `MAX_INVITES_PER_TOKEN_PER_DAY`
  (20), `MAX_PUSHES_PER_DEVICE_PER_DAY` (40, so one device can't be buried by several
  partners at once), `DEVICE_IDLE_DAYS` (180).
- **A `gone` result prunes**: when a push service reports a dead subscription, `deleteDevice`
  cascades — the endpoint index, every token that device ever issued, and the device record
  itself. Partners then get a 410 and can re-pair. Don't turn this into a retry.
- **Everything client-side is best-effort.** `client.ts` returns a value the caller can
  shrug off instead of throwing — push is a convenience on top of the room-code flow, and
  the app must stay fully usable with it switched off or denied.
- **iOS only allows push for an app added to the Home Screen.** In a Safari tab the prompt
  never appears, so `isStandalone()` / `isIos()` exist to let the UI say so rather than
  offering a button that silently does nothing.
- Changing `VAPID_PUBLIC_KEY` invalidates every existing subscription, because browsers bind
  it at subscribe time. `client.ts` compares the served key and re-subscribes on a mismatch;
  `/api/push/key` serves it at runtime so rotating doesn't need a rebuild.

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

`+layout.svelte` is where the app-wide wiring lives: it loads the partner store, seeds
`game.identity`, starts the PWA updater, and listens for `MB_INVITE` messages from the
service worker — accepting an invite straight away when idle, but asking first if a game is
in progress, since joining would abandon the table.

## Testing

`vitest.config.ts` deliberately does **not** load the SvelteKit Vite plugin: all tests are
pure TypeScript in the `node` environment, with only the `$lib` alias mapped. There are no
component tests and no jsdom.

- `src/lib/game/engine.test.ts` — rules invariants, built from tiny hand-crafted states
  (`D`/`RM`/`HZ`/`SF` builders at the top of the file). Reuse those helpers.
- `src/lib/game/ai.test.ts` — self-play across 40 seeds (hands terminate, trips complete),
  plus hand-built states asserting the AI won't gift a useful card away.
- `src/lib/game/text.test.ts` — the "You drive" / "AI drives" conjugation.
- `src/lib/net/*.test.ts` — codec round-trips, QR encoding, redaction, host validation of
  guest moves, the hello/name handshake, and the signal endpoint against an in-memory
  `@netlify/blobs` mock.
- `src/lib/partners/file.test.ts` — the pure partner-file functions against a fake storage.
- `src/lib/push/*.test.ts` — VAPID signing and payload encryption against known vectors, and
  the four endpoints with `@netlify/blobs`, `config.server` and `send` all mocked. That last
  mock is why `send.ts` is a separate module: it is the only thing that touches the network.

New logic belongs in one of the pure layers where it can be tested this way. If you find
yourself wanting to test a component, that's usually a sign the logic should move down.

## PWA and updates

`src/service-worker.ts` precaches `build`/`files`/`prerendered` under a versioned cache,
serves immutable build assets cache-first, falls back to the cached shell for offline
navigations, and additionally handles `push`, `notificationclick` (focus an open tab or open
the app at the invite) and `pushsubscriptionchange` (re-register the replacement subscription
using the device id parked in Cache Storage by `swkv.ts` — a worker has no `localStorage`).

An updated worker deliberately **waits** rather than calling `skipWaiting()` on install:
swapping under a live page would pull the assets it is still using out from under it. Only
the first install takes over immediately. `src/lib/pwa.svelte.ts` drives the rest — it polls
for a new build on start-up, on refocus and every 15 minutes (an installed app may not do a
full page load for days), then sends `SKIP_WAITING` and reloads, showing `UpdateNotice`
while it happens. `pwa.deferSwap` holds the swap off during an online game, because reloading
would drop the peer connection.

`static/manifest.webmanifest` plus `static/icons/*` (regenerated from `icon.svg` by
`scripts/gen-icons.mjs`, with `icon-badge-96.png` for the notification badge) cover install.
Adding a static asset that must work offline means making sure it lands in `build`/`files`.

## Styling

TailwindCSS v4, configured entirely in `src/app.css` via `@theme` — there is no
`tailwind.config.js`. Custom tokens: the `road-*` scale, `mb-red` / `mb-green` / `mb-blue`,
`felt` / `felt-light`, `cream`, `asphalt`, and the `font-display` / `font-body` families.
Use those tokens rather than raw hex. The visual language is a green felt table with
authentic Mille Bornes card faces; buttons use a chunky `shadow-[0_5px_0_…]` + `active:translate-y-1`
press effect. `prefers-reduced-motion` is honoured globally in `app.css`.

The PWA chrome colours (`theme-color`, the manifest background) are matched to the felt so
the status bar and the area behind the iOS home indicator don't show a pale seam.

## Deployment

Netlify. `netlify.toml` runs `npm run build` and publishes `build/`;
`@sveltejs/adapter-netlify` emits the prerendered pages plus a `sveltekit-render` function
for `/api/*`. No manual redirects are needed.

`netlify.toml` also pins two cache rules, with **lowercase header names** so they merge with
the adapter's generated `_headers` instead of colliding with it: `/service-worker.js` must
revalidate (or an installed app sits on an old build forever), and `/api/*` is `no-store`.

Environment variables (all optional — the app degrades rather than breaking):

| Variable | Effect when unset |
| --- | --- |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | `/api/push/key` returns 503, push UI stays off |
| `METERED_API_KEY` / `METERED_APP_NAME` | falls back to public STUN + open-relay TURN |

`config.server.ts` carries a one-liner for generating a VAPID pair with no install, and
trims the values — a key pasted into the Netlify UI easily picks up a stray newline.

Note: the README's Stack section still says `@sveltejs/adapter-static` — the project moved to
`@sveltejs/adapter-netlify` when the signaling endpoint was added. Trust `vite.config.ts`.
