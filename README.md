# 🏎️ Mille Bornes — 1000 Miles

A playful, installable **PWA** of the classic French racing card game. Race to **exactly 1000 miles**,
fend off opponents with hazards, defend with safeties, and pull off a triumphant **Coup Fourré**.

- **Solo vs CPU** — heuristic AI opponent.
- **2 Players (pass & play)** — share one device; the screen hides each player's hand on hand-off.
- **Play online** — share a 4-digit room code, or hold the two phones together and pair by QR code:
  peer-to-peer WebRTC with no server in the middle, so it also works on a network with no internet.
- **Saved partners** — the two devices swap nicknames when they connect, so you can keep someone and
  invite them again later with a push notification they tap to join.
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
src/lib/net/
  peer.ts            WebRTC data channel + SDP handshake
  codec.ts           deflate + base64url for the handshake blobs
  qr.ts              dependency-free QR encoder for on-screen pairing
  signal.ts          client for the 4-digit room-code endpoint
  handshake.ts       who's who, once the channel opens
src/lib/partners/
  file.ts            the saved partner list (pure), types.ts, store.svelte.ts
src/lib/push/
  vapid.ts           ES256 request signing (RFC 8292)
  encrypt.ts         aes128gcm payload encryption (RFC 8291)
  send.ts            the one call that talks to a push service
  store.ts           devices, capabilities and rate limits in Netlify Blobs
  client.ts          permission, subscription and invites, browser side
src/lib/stores/
  game.svelte.ts     runes store: persistence + AI auto-play loop
src/lib/components/   Card, Hand, Tableau, Odometer, Board, Modal, Scoreboard, …
src/routes/          / (menu) · /play (board) · /rules (how-to) · /online (pairing)
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

Netlify (`@sveltejs/adapter-netlify`): prerendered pages and assets are served statically, and
`/api/*` falls through to a single function. `npm run build` writes both.

### Environment

All optional — the game plays without any of them.

| Variable | What it buys you |
| --- | --- |
| `METERED_API_KEY`, `METERED_APP_NAME` | Proper TURN relays, so peers behind mobile CGNAT can still connect. Falls back to public STUN. |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Push invitations to saved partners. Without them `/api/push/*` answers 503 and the UI hides the option. |

Generate a VAPID pair with no install:

```sh
node -e "crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']).then(async k=>{const j=await crypto.subtle.exportKey('jwk',k.privateKey);const p=Buffer.from(await crypto.subtle.exportKey('raw',k.publicKey));console.log('VAPID_PUBLIC_KEY',p.toString('base64url'));console.log('VAPID_PRIVATE_KEY',j.d)})"
```

Then `netlify env:set VAPID_PUBLIC_KEY "…"` and so on. Rotating the public key invalidates every
existing subscription — browsers bind it at subscribe time — so partners have to re-enable
notifications afterwards.

### Working on push locally

Neither `npm run dev` (no service worker: registration is skipped in dev) nor `npm run preview`
(no functions, so `/api/*` 404s) can exercise it. Use `npx netlify serve` against a fresh build.
