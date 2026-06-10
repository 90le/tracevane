# Feishu Long Connection Issue Tracker

> Status: active validation
> Updated: 2026-06-10
> Scope: Studio native Channel Connectors Feishu long-connection ingress.

This is the single tracker for Feishu "connected but no reply" incidents. New
feedback must update this file before code changes.

## Reference

- CC Go: `release/openclaw-studio-0.1.70/resources/codex-stack/cc-connect-source/platform/feishu`
- Latest OpenClaw local checkout: `/home/binbin/.openclaw/projects/openclaw/latest/extensions/feishu`
- Latest checked OpenClaw `origin/main`: `f57c3b55fdc4b714300480ed8240c988e85a83c7`
- Commit time: `2026-06-09T15:45:19+09:00`
- Feishu lifecycle files checked: `extensions/feishu/src/client.ts`,
  `extensions/feishu/src/monitor.transport.ts`
- SDK: OpenClaw uses `@larksuiteoapi/node-sdk@1.66.0`; Studio currently uses
  `@larksuiteoapi/node-sdk@1.66.1`
- Feishu official long-connection docs:
  `https://open.larkoffice.com/document/uAjLw4CM/ukTMukTMukTM/event-subscription-guide/callback-subscription/configure-callback-request-address`
- Feishu official Node SDK docs:
  `https://open.feishu.cn/document/server-side-sdk/nodejs-sdk/preparation-before-development`,
  `https://open.feishu.cn/document/server-side-sdk/nodejs-sdk/invoke-server-api`,
  `https://open.feishu.cn/document/server-side-sdk/nodejs-sdk/handling-events`,
  `https://open.feishu.cn/document/server-side-sdk/nodejs-sdk/handling-callbacks`
- Lark Node SDK Channel docs:
  `https://github.com/larksuite/node-sdk/blob/main/docs/channel.md`
- Lark Node SDK issues checked: `#177` reconnect timer leak, `#183`
  `WSClient.start()` early resolve.
- Generic WS heartbeat reference:
  `https://github.com/websockets/ws#how-to-detect-and-close-broken-connections`

Latest OpenClaw diff from the previous local reference did not change the Feishu
WS lifecycle files. The mature reference remains:

- one official `WSClient`
- one `EventDispatcher`
- terminal SDK error ends the current cycle
- recreate a fresh client with `1s..30s` backoff
- no business-idle polling restart loop

## Current Contract

- One Feishu app/domain has one Studio OS-user owner lock; the owner fans out to
  matching bindings.
- Each owner cycle creates one official SDK `WSClient` and one
  `EventDispatcher`.
- Handler ACK must be fast for every WS event. Message receive, bot menu and
  card action all dispatch business work asynchronously; attachment download,
  Agent run, progress card updates and final reply must not run before the SDK
  ACK frame is sent.
- WS handshake has a 15s timeout, matching the official Channel wrapper's
  behavior instead of allowing `wsClient.start()` to hang indefinitely.
- Studio arms the SDK lower-case `wsConfig.pingTimeout` by default:
  `pingTimeoutSeconds=3`. This is the primary protection against half-open
  sockets that still report `connected`.
- OpenClaw's TypeScript plugin passes upper-case `PingTimeout`; the installed
  Node SDK's active watchdog knob is lower-case `pingTimeout`. Live Studio
  evidence and the public OpenClaw/Lark issue `#543` showed that leaving this
  watchdog disabled can keep a dead connection false-ready until manual restart.
- Studio now records SDK application-level control frames: outbound `ping`,
  inbound `pong`, effective `pingIntervalMs`, `sentPings`, `receivedPongs` and
  `transportVerified`.
- Studio wraps the installed SDK `WSClient.pingLoop()` and clamps the effective
  ping interval to `pingIntervalMs=30000` by default. The SDK may overwrite its
  raw interval from Feishu's `pong` payload, but the next loop re-clamps before
  scheduling. This removes the previous 90s false-health window.
- Studio also records raw SDK business frames before `EventDispatcher` parses
  them: `rawEventFrames`, `lifecycleRawEventFrames`, `lastRawEventFrameAt`,
  `lastRawEventFrameType` and handler errors. This separates "Feishu never
  delivered a business frame" from "Studio handler failed after delivery".
- Studio also recycles a connected client after an observed outbound `ping`
  misses its outer `pongTimeoutMs` window; default `pongTimeoutMs=15000`. This
  is a Studio-side fallback if the SDK liveness watchdog does not close the
  socket. The timeout window is measured from the latest outbound `ping`, so a
  healthy connection gets a grace window for the matching pong.
- Runtime and health now expose `sdkConnected`, `pongWaitingForMs`,
  `pongOverdue`, `transportStaleForMs`, `transportStaleAfterMs` and
  `transportStale`. `connected` means SDK connected plus no pong overdue and no
  stale control frames. Default stale window is
  `pingIntervalMs + pongTimeoutMs + 10000 = 55000ms`.
- If SDK state is `reconnecting` for more than `10s`, Studio closes that same
  cycle and lets the OpenClaw-style outer loop recreate the client.
- Connected-idle, zero-inbound, verified-ingress and generic watchdog rebuilds
  remain disabled by default.
- Startup ingress validation remains available as an explicit diagnostic option,
  but is disabled by default. Live evidence showed the primary failure is
  transport-level disconnect/no-pong, and rebuilding a healthy idle connection
  only because no business event arrived can create unnecessary long-connection
  churn. Raw event counters are diagnostic proof, not the default transport
  health gate. `/health` reports `silent` as unhealthy only when that diagnostic
  gate is explicitly enabled.

## Evidence

2026-06-09 latest OpenClaw check:

- `origin/main=f57c3b55fdc4b714300480ed8240c988e85a83c7`
- Feishu lifecycle files unchanged; only Feishu send/comment/streaming-card test
  files changed.
- Conclusion: the OpenClaw answer to copy is lifecycle ownership and terminal
  recreate, not a connected-idle watchdog.

2026-06-09 Octo-first reproduction:

- After restart, Octo traffic worked.
- Feishu runtime reported `connected=true`, `state=connected`,
  `pingTimeoutSeconds=0`, `dispatcherCallbacks=0`, `receivedMessages=0`,
  `lastReceivedAt=null`, `ingressState=warming`.
- The old 210s smoke passed because it only checked "connected/no old logs"; it
  missed "connected but zero real dispatcher callbacks".
- Conclusion: this case is startup ingress not proven, not Agent/session driver
  blocking.

2026-06-10 live reassessment:

- The same Feishu app credentials can fetch the official WebSocket endpoint via
  the SDK's real `POST /callback/ws/endpoint` request, and REST bot info/send
  succeeds. The endpoint itself is not down.
- Long-connection mode does not need webhook `verificationToken`; the Node SDK
  invokes WebSocket events with `needCheck:false`. A configured token is
  harmless but must not be treated as the reason long connection is down.
- Disabling local `cc-connect` did not fix the incident. No second local
  cc-connect/Feishu process was found after that, and the Studio daemon held the
  only visible local Feishu app owner lock.
- Runtime diagnostics showed both cases: when the link is healthy, raw event
  frames and dispatcher callbacks increment immediately; during failures,
  `connected=true` can coexist with zero raw business frames. Manual daemon
  restart restoring delivery means Studio must recycle this false-ready owner
  automatically instead of waiting for a human restart.

2026-06-09 earlier pingTimeout finding, superseded by 2026-06-10 evidence:

- Studio had previously translated OpenClaw upper-case `PingTimeout:3` to active
  lower-case SDK `pingTimeout:3`.
- Live logs showed `no pong/inbound within 3s`; Feishu replies delayed until SDK
  reconnect stabilized.
- Default was temporarily corrected to `pingTimeoutSeconds=0`, but that was
  later proven incomplete: official-tool failure plus no-pong runtime evidence
  showed disabled SDK liveness is exactly the false-ready failure class.

2026-06-10 root-cause narrowing:

- User evidence is decisive: when Feishu does not reply, manually restarting the
  Channel Connectors service makes the bot receive messages again. That points
  at Studio's long-connection lifecycle getting stuck or false-ready, not at
  menu rendering, model latency, verification token, Agent queueing or cc-connect
  interference.
- The fix direction is therefore to make the Feishu owner cycle self-heal in the
  daemon: if a newly connected owner cannot prove real business ingress, recycle
  that SDK client in-process. Do not require the user to restart the whole
  service.
- `verificationToken` remains irrelevant for long-connection delivery. It is
  only used by webhook/callback validation paths.

2026-06-10 pong-overdue bug:

- Immediately after the previous false-ready fix, the official Feishu tool still
  reported the long connection as failed and a fresh user message `test 1` was
  not handled.
- Studio runtime incorrectly showed `connected=true`, `ingressState=receiving`
  and `/health ok`. The important counterexample was:
  `lastPongAt=2026-06-10T07:09:44.689Z`, `lastPingAt=2026-06-10T07:16:40.893Z`,
  `sentPings=7`, `receivedPongs=3`.
- Root cause: the watchdog checked `now - lastPingAt >= pongTimeoutMs`. Because
  the SDK kept emitting new outbound pings, `lastPingAt` moved forward and the
  timeout window was repeatedly reset. A connection with no pongs could remain
  forever "healthy" in Studio.
- Initial fix: calculate pong timeout from the last known healthy transport point
  (`lastPongAt`, falling back to `lastConnectedAt` before first pong). A new ping
  no longer resets the no-pong timeout.
- Follow-up correction: once the SDK lower-case `pingTimeout` is enabled, the
  outer fallback can be short and measured from the latest outbound ping. The
  old `210000ms` window only detected the issue after several minutes; it is not
  acceptable for the user's "official tool says disconnected, Studio says
  connected" case.
- Correction: the earlier startup raw-event auto-rebuild default was too broad
  for an idle bot and could itself create reconnect churn. It is now opt-in;
  ping/pong is the default long-connection health contract.
- UI issue: the Sessions page showed a persistent Agent session as "running /
  idle", which is separate from platform connectivity. The page now surfaces the
  binding's Feishu long-connection health next to each Agent session.

2026-06-10 ping interval / false-health correction:

- After the service was manually restarted, Feishu immediately recovered again.
  That confirmed credentials, bot setup and platform configuration were valid;
  the remaining fault was a stuck/false-ready long-connection owner.
- Live runtime showed `pingTimeoutSeconds=3` but raw SDK
  `pingIntervalMs=90000`, because Feishu's server-provided `pong` config
  overwrote the SDK interval. The lower-case SDK timeout could recover after a
  ping, but the next ping could still be delayed by up to 90s.
- Studio now wraps the SDK ping loop and re-clamps to 30s before each scheduled
  ping. Runtime reports the effective Studio interval.
- A 75s live smoke after restart passed with `violations=0`,
  `pingIntervalMs=30000`, `sentPings=4`, `receivedPongs=5`,
  `transportVerified=true`, `transportStale=false` and no reconnect/stale log
  events.

2026-06-09 stability reassessment:

- This is not a message-order bug. The earlier Octo-first reproduction exposed a
  broader Feishu design risk: SDK `connected` can be true while real business
  ingress is not proven.
- Bounded startup validation is now the default mitigation for the user's
  manual-restart recovery case. It is still not final proof that the Feishu
  channel has Octo-level stability; a fresh inbound Feishu event remains the only
  proof that the current owner is receiving business frames.
- Official SDK source shows `EventDispatcher.invoke()` is awaited before the ACK
  response is sent. Therefore every WS handler must stay synchronous-light and
  queue work immediately.
- Official SDK source also shows default `reconnectCount=-1`, `pingInterval`
  comes from Feishu server config, and `pingTimeout` is disabled unless caller
  sets lower-case `wsConfig.pingTimeout`; Studio now sets it by default and keeps
  independent runtime proof for health/UI.

2026-06-09 external research:

- Feishu official long-connection mode is the SDK-provided WebSocket channel;
  it still requires event handling to finish within 3 seconds, and cluster push
  means multiple clients for the same app do not all receive the same event.
- Lark SDK `Channel` is the official high-level bot wrapper over
  `WSClient`/`EventDispatcher`/`Client`; it documents 15s handshake completion,
  auto-reconnect, message normalization, streaming replies, media upload and
  card interaction support. It is a future migration candidate, not a different
  low-level transport.
- Lark SDK issue `#177` matches the risk of repeatedly forcing reconnect from
  an external health monitor: old SDK versions could leak reconnect timers. The
  installed `1.66.1` source contains a generation guard, so Studio should still
  avoid blind periodic reconnects that recreate this class of failure.
- Lark SDK issue `#183` confirms why Studio must not trust `wsClient.start()`
  alone as readiness proof; `onReady`/handshake timeout/runtime state are the
  correct readiness signals.
- The `ws` project heartbeat guidance matches Studio's current direction:
  broken links can leave both sides unaware, health should be proven with
  ping/pong. Studio now uses the SDK's active `pingTimeout=3` watchdog plus a
  short outer fallback after each outbound ping. The old `210000ms` fallback was
  too slow for real Feishu user traffic and must not be reintroduced as the
  default.
- Slack Socket Mode is not Feishu, but its official ACK rule reinforces the same
  pattern: acknowledge immediately, then run slow business work asynchronously.

## Stability Direction

To reach Octo-level behavior, do not rely on one signal:

1. Keep the official SDK owner loop for compatibility, but require fast ACK,
   handshake timeout, owner lock, terminal-error recreate and runtime evidence.
2. Observe control ping/pong or run a patched WS layer that exposes pong/inbound
   timestamps instead of inferring health from business messages only. Studio now
   wraps the SDK client methods to expose application-level ping/pong runtime
   proof while keeping the official SDK protocol implementation.
3. Evaluate SDK `createLarkChannel` if Studio starts duplicating more of the
   official wrapper surface (normalization, streaming card updates, media,
   safety policy). Do not switch just for startup ordering; it uses the same
   `WSClient` transport and should be justified by reduced maintenance surface.
4. Evaluate webhook or hybrid ingress for production-grade Feishu stability when
   a reliable public callback URL is available. Webhook removes the local
   long-lived socket failure class, but depends on a public endpoint and cannot
   survive that endpoint being down.
5. If Node SDK continues to show silent-alive behavior, replace the transport
   layer with a maintained patched WSClient or a small Studio-owned Feishu WS
   transport copied from the SDK protocol, with explicit ping/pong metrics,
   capped reconnect, jitter and health-state transitions.

## Verification

- `npm run typecheck:api && npm run build:api`
- `node --test tests/system/channel-connectors-feishu-long-connection-script.test.mjs`
- `node --test --test-name-pattern "Feishu long-connection ingress|Feishu dispatcher parity diagnostics" tests/system/channel-connectors-service.test.mjs`
- Restarted `openclaw-studio-channel-connectors.service`, PID `3248732`.
- Runtime after restart must expose `pingTimeoutSeconds=3`,
  `pingIntervalMs=30000`, `pongTimeoutMs=15000`,
  `transportStaleAfterMs=55000`, `ingressUnverifiedAfterMs=0` and
  `ingressUnverifiedRenewMax=0`; Feishu status also includes `sdkConnected`,
  `pongWaitingForMs`, `pongOverdue` and `transportStale`.
- 2026-06-10 regression added: the smoke script fails a connected runtime when
  `pongOverdue=true`, covering the official-tool-disconnected / Studio-connected
  mismatch.
- 2026-06-10 earlier live service evidence: after restart, Studio recycled the
  Feishu SDK client at `15s`, `30s` and `60s` because no raw event arrived, and
  the subsequent owner received real Feishu events. This proved raw-event
  instrumentation worked, but the auto-rebuild default was later corrected to
  avoid idle reconnect churn.
- 2026-06-10 live smoke:
  `node scripts/smoke-channel-connectors-feishu-long-connection.mjs --duration-ms 0 --since 2026-06-10T07:04:50.000Z --bindings feishu-live --json`
  returned `violations=0` and recorded the bounded startup validation cycles as
  expected events.
- Live smoke at `2026-06-09T10:45:55Z` ran for `100000ms` with
  `violations=0` and proved ping/pong instrumentation. It also revealed
  `pongTimeoutMs=30000` could falsely recycle after a later ping was not answered
  within 30s.
- 2026-06-10 later correction: default SDK `pingTimeoutSeconds=3`; default
  Studio fallback `pongTimeoutMs=15000`; `MAX_FEISHU_PONG_TIMEOUT_MS=600000`
  remains only for explicit override.
- Earlier live smoke at `2026-06-09T10:53:20Z` ran for `100000ms` with
  `violations=0`. Runtime showed `pingIntervalMs=90000`, `sentPings=1`,
  `receivedPongs=2`, `transportVerified=true`, `reconnectingRecycles=0`,
  `ingressUnverifiedAfterMs=0`, and no reconnect/rebuild cycles. No fresh user
  message was sent during this final smoke, so `ingressVerified=false` is
  expected under the old contract.
- 2026-06-10 final live smoke:
  `node scripts/smoke-channel-connectors-feishu-long-connection.mjs --duration-ms 75000 --bindings feishu-live --json`
  returned `violations=0` with `pingIntervalMs=30000`, `sentPings=4`,
  `receivedPongs=5`, `transportStale=false`, `reconnectingRecycles=0` and
  `logEvents=0`.
- Old ping-timeout, zero-inbound, connected-idle and generic watchdog rebuild
  paths must remain absent. Startup ingress validation is the intentionally
  allowed bounded exception.

## Next Validation

- Verify fresh Feishu card actions still update/send results after the WS handler
  returns immediately.
- Ask the user to send a fresh Feishu message after code changes when validating
  message-level latency, because runtime ping/pong proof only proves transport
  health.
- If Feishu remains unstable after ping/pong proof and fast ACK, evaluate
  webhook/hybrid or a Studio-owned WS transport before claiming Octo-level
  stability.
- If a future stall appears, capture runtime JSON, log tail, owner lock,
  `systemctl --user status openclaw-studio-channel-connectors.service`, and
  process list before restarting.
