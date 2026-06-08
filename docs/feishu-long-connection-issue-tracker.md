# Feishu Long Connection Issue Tracker

> Status: active investigation
> Updated: 2026-06-08
> Scope: Feishu long-connection ingress for Studio native Channel Connectors.

This is the temporary single source of truth for Feishu "connected but no reply"
incidents. Keep this document updated until the issue is closed. Do not spread
new hypotheses across progress docs.

## Problem

Observed user-facing symptom:

- User sends a Feishu bot message.
- Studio daemon sometimes reports `connected=true`.
- No new `im.message.receive_v1` event appears in `feishu-events.jsonl`.
- Octo continues to work, so the failure is likely Feishu ingress, not Agent,
  model, Gateway, or outbound reply.

Acceptance criterion:

- A Feishu message sent by the user is delivered into Studio quickly and
  consistently after daemon start, service restart, code rebuild, and idle
  periods.
- The solution must be based on CC Go parity first, then OpenClaw Node/TS parity,
  then Studio integration. Automatic reconnect/restart can be a diagnostic or
  last-resort guard, not the primary fix.

## Hard Rule

Do not treat "restart the socket/daemon and it works this time" as solved.

Before changing production logic, update this document with:

1. CC Go source location and behavior contract.
2. OpenClaw Node/TS source location and behavior contract.
3. Studio current behavior and exact delta.
4. Test or live-smoke evidence that proves the delta is closed.

## Reference Sources

CC Go source:

- `release/openclaw-studio-0.1.70/resources/codex-stack/cc-connect-source/platform/feishu/feishu.go`
- `release/openclaw-studio-0.1.70/resources/codex-stack/cc-connect-source/platform/feishu/ws_shared.go`
- `release/openclaw-studio-0.1.70/resources/codex-stack/cc-connect-source/platform/feishu/*_test.go`

OpenClaw Feishu Node/TS source:

- `/home/binbin/.openclaw/projects/openclaw/v2026.4.21/extensions/feishu/src/client.ts`
- `/home/binbin/.openclaw/projects/openclaw/v2026.4.21/extensions/feishu/src/monitor.account.ts`
- `/home/binbin/.openclaw/projects/openclaw/v2026.4.21/extensions/feishu/src/monitor.transport.ts`
- `/home/binbin/.openclaw/projects/openclaw/v2026.4.21/extensions/feishu/src/monitor.startup.ts`
- `/home/binbin/.openclaw/projects/openclaw/v2026.4.21/extensions/feishu/src/monitor.state.ts`
- `/home/binbin/.openclaw/projects/openclaw/v2026.4.21/extensions/feishu/src/config-schema.ts`
- OpenClaw tests: `monitor.*.test.ts`, `client.test.ts`, `config-schema.test.ts`,
  `monitor.cleanup.test.ts`, `monitor.webhook-*.test.ts`.

Official Feishu constraints:

- Long connection event delivery is cluster mode, not broadcast: multiple
  clients for the same app receive a random subset of events.
- Long connection handlers must complete quickly; slow event handling triggers
  retry semantics.
- Long connection is for enterprise self-built apps and requires the local
  client to be online when saving the subscription mode.
- Official doc: `https://open.feishu.cn/document/server-docs/event-subscription-guide/event-subscription-configure-/request-url-configuration-case`

## Current Evidence

2026-06-08:

- Before the latest restart, runtime showed `connected=true`,
  `ingressState=silent`, `ingressVerified=false`, and no user message entered
  `feishu-events.jsonl`. This is a Feishu ingress false-online state.
- Later real messages did enter:
  - `2026-06-08T11:37:58Z`: user message `把docs文档总结发我` entered and
    completed reply at `2026-06-08T11:39:02Z`.
  - `2026-06-08T11:58:46Z`: user message `say hi` entered and completed reply.
  - `2026-06-08T12:07:30Z`, `12:09:07Z`, `12:09:46Z`: three Feishu messages
    entered after daemon restart; latest live smoke showed `ingressVerified=true`
    and `receivedMessages=3`.
- This proves the link can work, but not that the false-online root cause is
  closed.

## CC Go Contract To Port

Already identified:

- `ws_shared.go`: one `app_id|domain` WebSocket owner per process, with fan-out
  to all platform instances.
- `feishu.go Start`: fetch bot open_id before WebSocket mode, then register the
  shared WS owner.
- `OnP2MessageReceiveV1`: synchronous fan-out to all sibling platforms; each
  sibling applies its own `allow_chat` / filters.
- `OnP2CardActionTrigger`: try siblings and return the first non-nil callback
  response.
- `OnP2BotMenuV6`: fan-out to siblings.
- `startWebSocketMode`: use the official Go SDK client and let the SDK own its
  own connection loop.
- `onMessage`: do fast filtering/dedup/snapshot work, then call handler async.
- `Stop`: unregister shared WS and close the primary client only when this
  platform is the owner.

Studio status:

- In-process shared grouping exists.
- Cross-process owner lock exists and is stricter than CC Go, because Studio can
  run through systemd and dev processes.
- Need deeper parity review for bot open_id discovery, group mention filtering,
  exact callback ACK shape, stop/unregister semantics, and fan-out behavior when
  the owner exits while secondary bindings remain.

## OpenClaw Node/TS Contract To Port

OpenClaw is especially relevant because it uses the same Node SDK family.

Identified behavior:

- `client.ts createFeishuWSClient`: creates a fresh `WSClient` per monitor,
  supports proxy agent, and does not cache the WS client.
- `monitor.account.ts monitorSingleAccount`: resolves bot identity first,
  validates `connectionMode`, warms dedup from disk, registers event handlers,
  then chooses `monitorWebhook` or `monitorWebSocket`.
- `monitor.transport.ts monitorWebSocket`: starts `wsClient.start({ eventDispatcher })`
  and closes it on abort; the transport itself stays thin.
- `monitor.transport.ts monitorWebhook`: full signed webhook mode with body
  guards, signature validation, rate limit, and status recording.
- `monitor.state.ts`: centralized cleanup for WS clients and HTTP servers.
- `config-schema.ts`: first-class `connectionMode: "websocket" | "webhook"`,
  with required `verificationToken` and `encryptKey` validation in webhook mode.

Studio gaps to verify:

- Whether Studio constructs `WSClient` options exactly like OpenClaw, including
  domain and proxy handling.
- Whether Studio should use OpenClaw's monitor lifecycle and abort/cleanup shape
  instead of custom callback-heavy daemon ownership.
- Whether Studio should add OpenClaw-style webhook mode as a first-class
  alternative, not a short-term workaround, for users who can provide a public
  callback URL.
- Whether Studio status should record transport-mode health separately from
  business Agent runs.

## Current Studio Behavior

Current implementation after the latest investigation:

- One local owner lock per Feishu app/domain.
- Official Node SDK `WSClient` + `EventDispatcher`.
- Fast background dispatch for normal message/menu events.
- Runtime distinguishes `connected` from `ingressVerified` / `ingressState`.
- `pingTimeoutSeconds` default is 60.
- `connectedIdleRenewAfterMs=0`.
- `zeroInboundRenewAfterMs=0`.
- Startup ingress renewal is disabled by default. It may exist only as explicit
  opt-in diagnostic code while this issue is open; it is not an acceptance
  criterion.

## Working Hypotheses

Likely:

- SDK transport readiness and Feishu event delivery readiness are different
  states; `connected=true` alone is insufficient.
- Feishu cluster delivery plus multiple clients for the same app can cause
  messages to be routed away from Studio. Studio must prove there is exactly one
  live owner for the app, including old dev processes and external tools.
- Node SDK behavior may differ from Go SDK; OpenClaw parity is the strongest
  implementation reference for Studio.

Not yet proven:

- Whether current false-online cases are caused by duplicate clients, Node SDK
  reconnect semantics, stale Feishu subscription state, dev rebuild timing, or
  slow callback/ACK handling.

## Next Investigation Tasks

1. CC Go parity audit:
   - Map every Feishu startup, shared WS, handler registration, callback, dedup,
     bot identity, group mention, and Stop path to Studio.
   - Add a checklist row for each missing or divergent behavior.

2. OpenClaw Node parity audit:
   - Compare Studio `WSClient` construction with OpenClaw `createFeishuWSClient`.
   - Compare monitor startup/shutdown with OpenClaw `monitorSingleAccount` and
     `monitorWebSocket`.
   - Compare webhook-mode validation and decide whether Studio should port it
     as a real feature.

3. Duplicate-client proof:
   - Record every local process that can hold the same Feishu app credentials.
   - Verify Studio owner lock detects same app/domain conflicts.
   - Check old `cc-connect` and dev daemons use different or same Feishu app IDs.

4. Live soak:
   - Restart daemon, wait for connected, then send Feishu messages at 0s, 30s,
     90s, 5min, and after code rebuild.
   - Each message must appear in `feishu-events.jsonl` and produce reply evidence.
   - If a message does not enter, capture runtime, log tail, process list, and
     owner lock file before restarting anything.

5. Final implementation:
   - Port missing CC/OpenClaw contracts first.
   - Only then consider additional Studio guardrails.
   - Update this document and close the issue only after repeated live evidence.

## Feedback Log

- 2026-06-08: User reported Feishu did not reply while Octo remained normal.
  Runtime showed false online before later messages arrived. Action: created this
  tracker and set rule that restart-based recovery is not the primary solution.
