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
- Handler ACK is fast; attachment download, Agent run, progress card updates and
  final reply run asynchronously.
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

- After the user sends a fresh Feishu message, runtime must move to
  `ingressVerified=true` / `ingressState=receiving` and reset startup recycle
  counters.
- If a future stall appears, capture runtime JSON, log tail, owner lock,
  `systemctl --user status openclaw-studio-channel-connectors.service`, and
  process list before restarting.
