# Rage Relay multiplayer audit

This audit distinguishes automated coverage from behavior confirmed on independent devices. The room transport and state cadence are covered by a deterministic simulation; real browser and mobile network behavior still needs live playtesting.

## Implemented and checked

| Area | Implementation | Verification |
|---|---|---|
| Room state | A Durable Object owns each room's player list, readiness, next-map votes, selected course, campaign round, start time, and trap clock. | Unit checks cover four slots, host-only course selection, readiness, and shared countdown. |
| Network transport | Each player uses an authenticated WebSocket. Movement is sent at 25 Hz; the room broadcasts snapshots at 25 Hz. No D1 request loop remains. | Four-client simulation with 150 ms one-way delay and 5% packet loss. |
| Remote movement | The client buffers 125 ms of room snapshots and interpolates between server-timestamped states. | Interpolation unit check; simulated clients receive all four player streams. |
| Physics | Browser simulation uses a fixed 60 Hz step; horizontal and vertical platform collisions resolve separately. | 60 Hz movement, jump, pit crossing, landing, and side-block checks. |
| RTT and sync diagnostics | WebSocket heartbeat estimates RTT; the race screen shows RTT, room rate, physics rate, interpolation buffer, and snapshot age. | Type-check and production build. |
| Session privacy | Room tokens are hashed in Durable Object storage and excluded from room snapshots. | Snapshot test checks no token hash is exposed. |

## Remaining risks

| Priority | Risk | Current limit |
|---|---|---|
| High | Competitive fairness | Clients still predict their own movement. The room validates bounds, sequence order, checkpoints, and finish conditions but does not replay every physics step. Suitable for casual rooms, not ranked play. |
| High | Real-world network behavior | The automated simulation is deterministic and does not reproduce browser suspension, Wi-Fi handoff, mobile power saving, or Cloudflare regional routing. Test with two to four independent devices and separate networks. |
| Medium | Disconnect semantics | A socket reconnects with the same session. The shared clock continues during a disconnect; prolonged loss can prevent that player from voting to advance. |
| Medium | Duplicate tabs | Two tabs using the same session can submit competing sequence numbers. A connection lease is not implemented. |
| Medium | Public abuse | Room creation and code guessing have no explicit per-IP rate limit. |
| Low | Accessibility and device differences | Canvas play, fast traps, touch controls, and fullscreen behavior still need device-specific review. |

## Release checks

1. Run `node tests/check.mjs` and `node tests/course-run.mjs`.
2. Run `node node_modules/typescript/bin/tsc --noEmit` and the production build.
3. Play the same room from two to four devices; verify readiness, movement, finish order, map voting, reconnect, and rematch.
4. Repeat on separate Wi-Fi and mobile connections while watching RTT and the sync-debug overlay.
