# Feishu Long Connection Issue Tracker

> Status: active validation
> Updated: 2026-06-08
> Scope: Feishu long-connection ingress for Studio native Channel Connectors.

This document is the single tracker for Feishu "connected but no reply"
incidents. Do not spread new hypotheses across progress docs.

## Problem

Observed symptom:

- User sends a Feishu bot message.
- Studio runtime can report `connected=true`.
- No new `im.message.receive_v1` appears, while Octo remains normal.

Acceptance criterion:

- After daemon start, service restart, code rebuild, idle, and SDK reconnect,
  fresh Feishu messages enter Studio quickly and reply without manual restart.
- The solution must be grounded in CC Go and latest OpenClaw/Feishu SDK source,
  not in blind socket restart attempts.

## Reference Sources

CC Go source:

- `release/openclaw-studio-0.1.70/resources/codex-stack/cc-connect-source/platform/feishu/feishu.go`
- `release/openclaw-studio-0.1.70/resources/codex-stack/cc-connect-source/platform/feishu/ws_shared.go`

Latest OpenClaw source checked for this fix:

- `.tmp/openclaw-latest-src` at commit `e3ef136bca8562185b307cf5ff159e0bbd8a9a57`
- Commit time: `2026-06-08T23:38:46+09:00`
- `extensions/feishu/src/client.ts`
- `extensions/feishu/src/monitor.transport.ts`
- `extensions/feishu/src/monitor.account.ts`
- `extensions/feishu/src/monitor.message-handler.ts`

Package cross-check:

- `@openclaw/feishu@2026.6.1`
- `@openclaw/feishu@2026.6.5-beta.2`
- Studio installed Lark SDK: `@larksuiteoapi/node-sdk@1.66.1`

## Current Contract

Studio now copies the latest OpenClaw lifecycle shape:

- One user-global owner lock per Feishu app/domain, because Feishu long
  connection delivery is cluster-mode and duplicate clients can split events.
- One official SDK `WSClient` per owner cycle.
- One `EventDispatcher` with binding `verificationToken` / `encryptKey`.
- Event handlers ACK fast and dispatch Agent work asynchronously.
- Terminal SDK errors end the current cycle, close the client, then create a new
  `WSClient` after OpenClaw-style backoff `1s..30s`.
- SDK liveness is fixed to `wsConfig: { pingTimeout: 3 }`, matching the effective
  Lark SDK option name in Studio's installed SDK.
- Connected-idle, zero-inbound, verified-ingress, and generic watchdog restarts
  are disabled by default.
- Studio adds one bounded improvement over OpenClaw: if the SDK has already
  entered `reconnecting` and stays there for `10s`, Studio ends that same cycle
  and lets the OpenClaw-style outer loop recreate the client. This is not a
  business-idle guess; the SDK has already marked the transport unhealthy.

Runtime proof fields:

- `pingTimeoutSeconds=3`
- `reconnectingRecycleAfterMs=10000`
- `watchdogRestartAfterMs=0`
- `connectedIdleRenewAfterMs=0`
- `zeroInboundRenewAfterMs=0`
- `verifiedIngressSilentRenewAfterMs=0`
- `dispatcherCallbacks` / `lifecycleDispatcherCallbacks`
- `receivedMessages` / `lifecycleReceivedMessages`
- `lockOwnerPid` and user-global lock path

## Evidence

2026-06-08 latest-source parity:

- Latest OpenClaw `monitor.transport.ts` recreates a fresh WS client after SDK
  terminal errors and backs off `1s..30s`.
- Latest OpenClaw `client.ts` expresses `PingInterval:30` / `PingTimeout:3`.
  Studio's installed Lark SDK uses lower-case `wsConfig.pingTimeout`, so Studio
  applies the effective SDK contract.
- Studio removed older default delivery-renewal/watchdog paths that caused
  repeated churn.

2026-06-08 live evidence:

- Five-minute live soak before final restart:
  `node scripts/smoke-channel-connectors-feishu-long-connection.mjs --since 2026-06-08T15:15:45.957Z --duration-ms 300000 --json`
  passed with `violations=0`, `samples=326`, `dispatcherCallbacks=12`,
  `receivedMessages=4`, no watchdog restart, and no reconnect churn.
- Final service restart loaded the rebuilt daemon: `active/enabled`, PID
  `2097069`.
- Runtime at `2026-06-08T15:31:23Z`: `connected=true`,
  `pingTimeoutSeconds=3`, `reconnectingRecycleAfterMs=10000`,
  `watchdogRestartAfterMs=0`, `connectedIdleRenewAfterMs=0`,
  `zeroInboundRenewAfterMs=0`, `verifiedIngressSilentRenewAfterMs=0`, and
  `lockOwnerPid=2097069`.
- Post-restart short smoke:
  `node scripts/smoke-channel-connectors-feishu-long-connection.mjs --duration-ms 15000 --json`
  passed with `violations=0`, `samples=16`.
- Post-patch user message proof: the user sent `Justin`; Feishu delivered
  `im.message.receive_v1` at `2026-06-08T15:55:16.881Z` for message
  `om_x100b6d5a10f0f8a4c0a9b55a14b8674`, and Studio recorded
  `agent.run.finished` at `2026-06-08T15:55:26.892Z`. Runtime at
  `2026-06-08T15:57:12Z` remained `connected=true`, `ingressVerified=true`,
  `ingressState=receiving`, `dispatcherCallbacks=10`,
  `lifecycleDispatcherCallbacks=10`, `receivedMessages=3`,
  `lifecycleReceivedMessages=3`, `lockOwnerPid=2097069`, and all old watchdog /
  delivery-renewal fields stayed `0`.

Automated verification:

- `npm run build:api`
- `node --test tests/system/channel-connectors-feishu-long-connection-script.test.mjs`
- `node --test tests/system/channel-connectors-service.test.mjs --test-name-pattern "Feishu long-connection ingress|Feishu dispatcher parity diagnostics"`

## Open Items

- Keep this tracker open until repeated user-driven Feishu messages continue to
  arrive quickly after a longer idle period and after a real SDK reconnect.
- If a future message stalls, capture runtime, log tail, `systemctl --user status`,
  owner lock file, and process list before restarting anything.
- Continue porting CC Go / OpenClaw Feishu card, callback, webhook, and menu
  behavior as feature work; do not use those features as ad-hoc recovery hacks.
