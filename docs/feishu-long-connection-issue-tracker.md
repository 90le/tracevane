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
- If SDK state is `reconnecting` for more than `10s`, Studio closes that same
  cycle and lets the OpenClaw-style outer loop recreate the client.
- Connected-idle, zero-inbound, verified-ingress and generic watchdog rebuilds
  remain disabled by default.
- Studio adds bounded startup ingress validation: while the current Feishu
  lifecycle has received zero dispatcher callbacks, recycle after `60s`, then
  exponential retry, max `3` cycles. Reason prefix:
  `startup_ingress_unverified_`. Any real dispatcher callback resets this
  counter.

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
- Current bounded startup validation is a mitigation, not final proof that the
  Feishu channel has Octo-level stability.
- Official SDK source shows `EventDispatcher.invoke()` is awaited before the ACK
  response is sent. Therefore every WS handler must stay synchronous-light and
  queue work immediately.
- Official SDK source also shows default `reconnectCount=-1`, `pingInterval`
  comes from Feishu server config, and `pingTimeout` is disabled unless caller
  sets lower-case `wsConfig.pingTimeout`; this can leave silent-alive cases
  unless Studio adds independent health proof or uses another ingress mode.

## Stability Direction

To reach Octo-level behavior, do not rely on one signal:

1. Keep the official SDK owner loop for compatibility, but require fast ACK,
   handshake timeout, owner lock, terminal-error recreate and runtime evidence.
2. Add a stronger health proof path: observe control ping/pong or run a patched
   WS layer that exposes pong/inbound timestamps instead of inferring health from
   business messages only.
3. Evaluate webhook or hybrid ingress for production-grade Feishu stability when
   a reliable public callback URL is available. Webhook removes the local
   long-lived socket failure class, but depends on a public endpoint and cannot
   survive that endpoint being down.
4. If Node SDK continues to show silent-alive behavior, replace the transport
   layer with a maintained patched WSClient or a small Studio-owned Feishu WS
   transport copied from the SDK protocol, with explicit ping/pong metrics,
   capped reconnect, jitter and health-state transitions.

## Verification

- `npm run typecheck -- --pretty false`
- `npm run build:api`
- `node --test tests/system/channel-connectors-feishu-long-connection-script.test.mjs`
- `node --test --test-name-pattern "Feishu long-connection ingress|Feishu dispatcher parity diagnostics" tests/system/channel-connectors-service.test.mjs`
- Restarted `openclaw-studio-channel-connectors.service`, PID `2667130`.
- Runtime after restart exposed `pingTimeoutSeconds=0`,
  `ingressUnverifiedAfterMs=60000`, `ingressUnverifiedRenewMax=3`.
- At `2026-06-09T07:13:40Z`, Feishu had been connected for `63567ms` with zero
  dispatcher callbacks; Studio logged `startup_ingress_unverified_60000ms`,
  recycled the current client, and reconnected with `pingTimeoutSeconds=0`.
- Live smoke since restart passed with `violations=0`; multiple bounded
  `startup_ingress_unverified_*` cycles were observed and no old ping-timeout,
  zero-inbound, connected-idle or generic watchdog violation appeared.

## Next Validation

- Verify fresh Feishu card actions still update/send results after the WS handler
  returns immediately.
- After the user sends a fresh Feishu message, runtime must move to
  `ingressVerified=true` / `ingressState=receiving` and reset startup recycle
  counters.
- Research and prototype the stronger health proof path before claiming Feishu
  has Octo-level stability.
- If a future stall appears, capture runtime JSON, log tail, owner lock,
  `systemctl --user status openclaw-studio-channel-connectors.service`, and
  process list before restarting.
