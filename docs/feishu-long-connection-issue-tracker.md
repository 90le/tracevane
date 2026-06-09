# Feishu Long Connection Issue Tracker

> Status: active validation
> Updated: 2026-06-09
> Scope: Studio native Channel Connectors Feishu long-connection ingress.

This is the single tracker for Feishu "connected but no reply" incidents. New
feedback must update this file before code changes.

## Reference

- CC Go: `release/openclaw-studio-0.1.70/resources/codex-stack/cc-connect-source/platform/feishu`
- Latest OpenClaw local checkout: `.tmp/openclaw-latest-src`
- Latest checked OpenClaw `origin/main`: `f57c3b55fdc4b714300480ed8240c988e85a83c7`
- Commit time: `2026-06-09T15:45:19+09:00`
- Feishu lifecycle files checked: `extensions/feishu/src/client.ts`,
  `extensions/feishu/src/monitor.transport.ts`
- SDK: OpenClaw uses `@larksuiteoapi/node-sdk@1.66.0`; Studio currently uses
  `@larksuiteoapi/node-sdk@1.66.1`
- Feishu official long-connection docs:
  `https://open.larkoffice.com/document/uAjLw4CM/ukTMukTMukTM/event-subscription-guide/callback-subscription/configure-callback-request-address`
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
- Studio does not arm the SDK lower-case `wsConfig.pingTimeout` by default:
  `pingTimeoutSeconds=0`.
- OpenClaw passes upper-case `PingTimeout`; the installed SDK's active watchdog
  knob is lower-case `pingTimeout`. Translating OpenClaw's upper-case config into
  lower-case made Studio stricter than OpenClaw and caused false reconnect churn.
- Studio now records SDK application-level control frames: outbound `ping`,
  inbound `pong`, `pingIntervalMs`, `sentPings`, `receivedPongs` and
  `transportVerified`.
- Studio recycles a connected client only after an observed outbound `ping`
  misses its `pongTimeoutMs` window; default `pongTimeoutMs=210000`. This
  intentionally covers more than two current observed `90000ms` Feishu ping
  intervals because a `30000ms` window caused a false recycle during live
  validation.
- If SDK state is `reconnecting` for more than `10s`, Studio closes that same
  cycle and lets the OpenClaw-style outer loop recreate the client.
- Connected-idle, zero-inbound, verified-ingress and generic watchdog rebuilds
  remain disabled by default.
- Startup ingress validation remains available only as an explicit diagnostic
  option. Default `ingressUnverifiedAfterMs=0` and
  `ingressUnverifiedRenewMax=0`; no business message during idle time must not
  cause proactive reconnects.

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

2026-06-09 earlier pingTimeout finding:

- Studio had previously translated OpenClaw upper-case `PingTimeout:3` to active
  lower-case SDK `pingTimeout:3`.
- Live logs showed `no pong/inbound within 3s`; Feishu replies delayed until SDK
  reconnect stabilized.
- Default was corrected to `pingTimeoutSeconds=0`.

2026-06-09 stability reassessment:

- This is not a message-order bug. The earlier Octo-first reproduction exposed a
  broader Feishu design risk: SDK `connected` can be true while real business
  ingress is not proven.
- Bounded startup validation was a mitigation, not final proof that the Feishu
  channel has Octo-level stability; it is no longer the default path.
- Official SDK source shows `EventDispatcher.invoke()` is awaited before the ACK
  response is sent. Therefore every WS handler must stay synchronous-light and
  queue work immediately.
- Official SDK source also shows default `reconnectCount=-1`, `pingInterval`
  comes from Feishu server config, and `pingTimeout` is disabled unless caller
  sets lower-case `wsConfig.pingTimeout`; this can leave silent-alive cases
  unless Studio adds independent health proof or uses another ingress mode.

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
  ping/pong, and timeout must be the server ping interval plus conservative
  latency. Studio's `210000ms` default intentionally covers the observed
  `90000ms` interval by more than two cycles.
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

- `npm run typecheck -- --pretty false`
- `npm run build:api`
- `node --test tests/system/channel-connectors-feishu-long-connection-script.test.mjs`
- `node --test --test-name-pattern "Feishu long-connection ingress|Feishu dispatcher parity diagnostics" tests/system/channel-connectors-service.test.mjs`
- Restarted `openclaw-studio-channel-connectors.service`, PID `2667130`.
- Runtime after restart must expose `pingTimeoutSeconds=0`,
  `pongTimeoutMs=210000`, `ingressUnverifiedAfterMs=0` and
  `ingressUnverifiedRenewMax=0`.
- Live smoke at `2026-06-09T10:45:55Z` ran for `100000ms` with
  `violations=0` and proved ping/pong instrumentation. It also revealed
  `pongTimeoutMs=30000` could falsely recycle after a later ping was not answered
  within 30s.
- Default `pongTimeoutMs` was raised to `210000` and `MAX_FEISHU_PONG_TIMEOUT_MS`
  to `600000`.
- Live smoke at `2026-06-09T10:53:20Z` ran for `100000ms` with
  `violations=0`. Runtime showed `pingIntervalMs=90000`, `sentPings=1`,
  `receivedPongs=2`, `transportVerified=true`, `reconnectingRecycles=0`,
  `ingressUnverifiedAfterMs=0`, and no reconnect/rebuild cycles. No fresh user
  message was sent during this final smoke, so `ingressVerified=false` is
  expected and must not trigger reconnect.
- Old ping-timeout, zero-inbound, connected-idle, generic watchdog and default
  startup-ingress recycle paths must remain absent.

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
