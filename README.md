# Rage Relay

Online trap-platformer race. Two to four players join with a six-character room code, ready up, and race through a ten-map campaign. No accounts or downloads are required. Includes solo practice, keyboard/touch controls, four checkpoints, unlimited retries, next-map votes, and same-tab reconnection.

**Live game:** https://rage-relay-yuvraj.arcanecamel7.chatgpt.site

## Rules

A finish records a player’s result, but does not end the session. After the finish, players can vote to launch the next map; everyone must vote before the campaign advances. The tenth map ends the campaign. Runners can pass through one another. Trap schedules use a shared server clock; collapsing floors are triggered separately for each runner. Deaths cost time and return the runner to their last checkpoint. Four character designs have identical movement and hitboxes. The host selects the starting map in the lobby; all players receive that choice with the room state.

## Architecture

- The browser runs the canvas game with a fixed 960 × 540 logical view, scaled to fit the screen with letterboxing. Physics advances at 60 Hz. Home and lobby pages remain ordinary scrolling pages; the race uses a full-viewport `100dvh` layout.
- `worker/src/index.ts` is a standalone Cloudflare Worker entry point. It accepts room control requests at `POST /api/rooms` and upgrades `GET /ws/:roomCode` to a Durable Object WebSocket.
- Each room is serialized by one SQLite-backed Durable Object. It owns the room clock, trap phase, ready and campaign votes, and player state. The object broadcasts complete room snapshots at 25 Hz. Player tokens are hashed in persistent room storage and omitted from snapshots.
- WebSocket clients send movement at 25 Hz. Remote runners render from a 125 ms interpolation buffer. The HUD reports RTT and provides a sync-debug overlay. If `NEXT_PUBLIC_ROOM_WS_BASE_URL` is unset, the browser falls back to HTTP room polling at 20 Hz through `/api/rooms`.
- The Worker requires an exact, configured `Origin` allowlist for both WebSocket and HTTP requests. Disconnected player slots remain reserved for 30 seconds so a reconnect can reclaim the same slot.
- Client-side movement prediction keeps controls immediate; physics and finish claims are not fully replayed on the server, so the game remains casual rather than tournament-grade. Rooms expire after four hours of inactivity. `sessionStorage` preserves the player session for same-tab refresh; invite links contain only the room code.

## Deploy the room Worker outside Sites

The standalone Wrangler project lives in `worker/`. It reuses the room implementation in `server/rooms.ts`. Before deploying, edit `worker/wrangler.toml` and set `ALLOWED_ORIGINS` to the exact origin of the website that will connect, without a trailing slash. Multiple origins can be comma-separated.

From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm exec wrangler login
pnpm exec wrangler deploy --config worker/wrangler.toml
```

Wrangler provisions the `ROOMS` binding and its `new_sqlite_classes` migration on the first deploy. The output includes the Worker URL, such as `https://rage-relay-rooms.<your-subdomain>.workers.dev`. Set the game build environment variable to the WebSocket endpoint `NEXT_PUBLIC_ROOM_WS_BASE_URL=wss://rage-relay-rooms.<your-subdomain>.workers.dev/ws` and rebuild/redeploy the frontend. The control API is derived from that URL at `/api/rooms`. To change the allowed website origin after deploying, update `ALLOWED_ORIGINS` in `worker/wrangler.toml` and deploy again.

## Main files

- `game/course.ts`: ten maps, checkpoints, multilevel platforms, hazards, shared trap schedules.
- `game/engine.ts`: movement, jumps, collisions, deaths, finish.
- `game/render.ts`: original Canvas scenery and characters.
- `server/rooms.ts`: multiplayer rules and state transitions.
- `app/game-app.tsx`: lobby, gameplay, networking, touch controls.
- `worker/wrangler.toml` and `worker/src/index.ts`: standalone Worker configuration, Origin enforcement, HTTP control routing, and `/ws/:roomCode` Durable Object routing.
- `server/rooms.ts`: Durable Object room clock, actions, player authentication, broadcasts, and the 30-second reconnect grace period.
- `app/api/rooms/route.ts`: same-origin route used by the frontend fallback and Sites runtime.
- `app/game-app.tsx`: client transport selection, polling fallback, RTT display, fullscreen handling, and touch controls.

## Verification

`node tests/check.mjs` transpiles source into ignored temporary test modules and checks 60 Hz movement, collision, jumps, traps, room ownership, reconnect slot expiry, interpolation, and a four-client network simulation with 150 ms one-way latency and 5% packet loss.

`node tests/course-run.mjs` runs a deterministic physics search through the campaign using the production 60 Hz timestep and active traps. Pass comma-separated map indexes to check a subset, for example `node tests/course-run.mjs 0,9`. This verifies reachability, not human difficulty or campaign speedrun duration.

`node node_modules/typescript/bin/tsc --noEmit` checks types.

`pnpm exec wrangler deploy --config worker/wrangler.toml` deploys only the standalone room server. Frontend builds need `NEXT_PUBLIC_ROOM_WS_BASE_URL` set to the deployed Worker WebSocket URL to use WebSockets; leaving it unset enables HTTP polling.
