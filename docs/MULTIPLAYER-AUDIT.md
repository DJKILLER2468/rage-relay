# Rage Relay multiplayer issue audit

This is a practical risk review of the current four-player web game. “Fixed” means the code now has an explicit mitigation and a regression check; it does not mean every browser, phone, network, or hostile client has been tested.

## Addressed in this revision

| Area | Failure mode | Mitigation |
|---|---|---|
| Room capacity | A third player was rejected because the server and UI assumed exactly two participants. | Up to four stable slots, with an explicit full-room error. |
| Concurrent room writes | Simultaneous syncs could lose an optimistic D1 update or return a conflict. | Bounded jittered compare-and-swap retries; clients retry a busy-room response without rolling back their locally simulated runner. |
| Remote movement | The rival appeared to pause between HTTP snapshots. | Short bounded position prediction using the latest velocity, then smoothing; visible round-trip time helps distinguish a laggy network from a rendering stall. |
| Content variety | “Three stages” were sections of a single map. | Three selectable course variants with different platform heights, hazards, timing, and scene palettes. The host's choice is stored in room state. |
| Race readiness | The start condition only handled a two-player room. | Every joined player must ready; the race starts when at least two and at most four are present and ready. |
| Player identity | The design only had two characters and colors. | Four distinct character silhouettes and colors; movement and hitboxes stay identical. |

## Known risks that still need testing or a larger backend change

| Priority | Area | Risk | Current state / next engineering step |
|---|---|---|---|
| High | Latency and server load | Each active player still makes an HTTP request that reads and writes the whole room in D1 roughly every 115 ms. Four players increase write contention. | Cloudflare Workers run at the edge, but D1 is the authoritative shared store. A Durable Object/WebSocket room coordinator would remove most per-frame D1 writes and push snapshots immediately. The current Sites project contract only declares D1/R2 bindings; DO support is not configured or verified. |
| High | Competitive fairness | Movement physics run in each browser. The server checks update ordering, bounds, checkpoint progression, and finish timing, but it does not replay every jump/collision. A modified client could still submit plausible cheating movement. | Acceptable only for casual friend races. A server-authoritative simulation is required for ranked play or prizes. |
| High | Public abuse | Room creation and join attempts have no per-IP or per-token rate limit. A public service can be spammed, rooms can be filled, or room-code guesses can consume work. | Add rate limits, abuse telemetry, and a short ban/backoff policy at the edge before broad promotion. Do not put a third-party anti-bot challenge in the fast reconnect path. |
| Medium | Real-device verification | A successful local test cannot prove two phones on different networks stay synchronized under packet loss or high latency. | Test two to four independent devices, Wi-Fi plus mobile data, background/resume, and network loss. Record measured RTT and failed sync counts. |
| Medium | Disconnect semantics | A temporary disconnect preserves a session, but the race clock continues. Explicitly leaving marks the player departed and forfeits that slot for the current run. | Decide whether to add a short reconnect grace period, pause a lobby, and show a clear forfeiture timer. |
| Medium | Duplicate tabs | Two tabs holding the same session token can send competing sequence numbers for one player slot. | Add a short-lived connection lease or reject the older tab when a new connection takes over. |
| Medium | Room lifecycle | Rooms expire after four idle hours and a bounded cleanup runs on creation. A high volume of abandoned rooms can still increase storage and cleanup work. | Monitor row counts and failed cleanup; use scheduled bounded cleanup if volume warrants it. |
| Medium | Data minimization | Room snapshots expose names, positions, readiness, and finish results to room participants. Tokens are hashed server-side and omitted from snapshots. | Keep names short and sanitized; avoid adding chat or persistent player profiles without moderation and privacy rules. |
| Medium | Browser/network failures | Slow responses can time out, mobile browsers can suspend timers, and captive portals can return HTML instead of JSON. | Retry transient failures, clear sessions on expired-room/auth errors, and show RTT/connection state. Add explicit timeout and offline/reconnect tests. |
| Medium | Race end/rematch | Multiple players may finish close together, vote at different times, or leave before a rematch begins. | Finish order is recorded once by the room; rematches reset every active player. Verify two simultaneous finish packets and partial-room departure on real clients. |
| Low | Device compatibility | Small screens, touch capture, orientation changes, reduced motion, and fullscreen behavior differ by browser. | Keep the touch fallback; verify iOS Safari and Android Chrome. Check that pointer cancellation always releases movement input. |
| Low | Accessibility | The Canvas view is not a full text equivalent, and fast visual traps can be difficult for players with visual or motor impairments. | Add scalable UI, color-independent player labels, reduced-flash options, and text progress summaries. |
| Low | Privacy/security headers | Public rooms are unauthenticated by account identity; the room code is the invite secret. The API already rejects cross-origin writes and limits request body size. | Add rate limits and security headers, and avoid placing player tokens in invite URLs or logs. |
| Low | Observability | Failures are currently mostly visible as generic reconnect messages; there is no live dashboard for room contention or latency percentiles. | Add privacy-safe aggregate metrics (RTT bands, CAS retries, timeouts, room start/finish counts) before high traffic. Never log raw session tokens. |

## Minimum release gate

1. Run unit and full-course simulation checks for all three courses.
2. Build and type-check the production app.
3. Join the same room from at least two independent clients; verify movement, selected course, readiness, finish ordering, reconnect, rematch, and room isolation.
4. Repeat over separate networks with throttled latency and packet loss.
5. Revisit whether D1 polling is adequate for the expected audience. If not, add a supported WebSocket room coordinator before advertising a low-latency competitive experience.
