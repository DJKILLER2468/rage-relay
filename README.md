# Rage Relay

Online trap-platformer race built for Yuvraj Sinha. Two to four players join with a six-character room code, ready up, choose one of three courses, and race. No accounts or downloads are required. Includes solo practice, keyboard/touch controls, four checkpoints, unlimited retries, rematch votes, and same-tab reconnection.

## Rules

First finish recorded by the room wins. Runners can pass through one another. Trap schedules use a shared server clock; collapsing floors are triggered separately for each runner. Deaths cost time and return the runner to their last checkpoint. Four character designs have identical movement and hitboxes. The host selects a course in the lobby; all players receive that choice with the room state.

## Implementation

- React/Vinext client and Cloudflare Worker API.
- Canvas graphics drawn in code; no third-party game art.
- Fixed 120 Hz local physics with coyote time and jump buffering.
- D1 room snapshots, optimistic concurrency control with bounded jittered retries, per-player secret tokens stored only as hashes server-side, round identifiers, and ordered update sequences.
- HTTP state exchange about every 115 ms plus request time. Remote runners are extrapolated briefly from their last velocity and smoothed; the UI reports measured round-trip time. This remains casual multiplayer, not a WebSocket transport or tournament-grade, server-simulated competition. Local movement is immediate; latency and client-side physics can affect finish ordering.
- Three selectable courses have different platform elevations, hazards, timing, and scenery palettes. Room capacity is capped at four players to bound D1 contention.
- Local simulation pauses after a 2.5-second network interruption. Rooms expire after four hours of inactivity.
- `sessionStorage` preserves the player session for same-tab refresh. Invite links contain only the room code.

## Main files

- `game/course.ts`: three maps, checkpoints, hazards, shared trap schedules.
- `game/engine.ts`: movement, jumps, collisions, deaths, finish.
- `game/render.ts`: original Canvas scenery and characters.
- `server/rooms.ts`: multiplayer rules and state transitions.
- `app/game-app.tsx`: lobby, gameplay, networking, touch controls.
- `app/api/rooms/route.ts`: HTTP transport.
- `db/schema.ts` and `drizzle/`: D1 schema and migrations.

## Verification

`node tests/check.mjs` transpiles source into ignored temporary test modules and runs movement, jump range, traps, checkpoints, session isolation, four-player capacity, course selection, concurrent join, ordered update, reconnect, finish, and rematch checks against SQLite.

`node tests/course-run.mjs` follows it with a deterministic physics search through the entire course, using the actual movement and collision code with active traps. This verifies reachability, not human difficulty or play duration.

`node node_modules/typescript/bin/tsc --noEmit` checks types.

Follow the Sites skill for dependency installation, preview, production builds, source synchronization, and deployment. Hosting identity is retained in `.openai/hosting.json`.
