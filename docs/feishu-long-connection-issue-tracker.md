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

## Parity Matrix

| Contract | CC Go | OpenClaw Node/TS | Studio delta / decision |
| --- | --- | --- | --- |
| Same app delivery | `ws_shared.go` uses one `app_id|domain` owner and fans out events because Feishu load-balances duplicate WS clients. | One monitor owns one SDK WS client; cleanup closes it on abort. | Studio keeps in-process grouping and upgrades the owner lock to an OS-user global lock so systemd/dev daemons cannot both own the same app. |
| SDK connection loop | `startWebSocketMode` lets the official Go SDK own the long-connection loop. | `createFeishuWSClient` passes only `appId`, `appSecret`, `domain`, `loggerLevel`, optional proxy `agent`; no custom `wsConfig`, `autoReconnect`, or handshake timeout. | Studio now matches this default: no `wsConfig.pingTimeout`, no startup/verified ingress renewal by default. False-online is diagnosed with dispatcher/business ingress counters instead of periodic socket rebuilding. |
| Fast ingress ACK | Message/menu handlers snapshot and filter quickly, then dispatch Agent work asynchronously. | `fireAndForget` handlers claim/dedup, enqueue, and return without blocking SDK dispatch. | Studio already backgrounds normal message/menu dispatch; card execution remains separated from navigation and must avoid slow visible callback work. |
| Duplicate/replay | CC has message cache and shared WS fan-out. | Persistent dedup warmup plus in-flight claims and sequential queue. | Studio keeps messageId-first persistent dedup, in-flight run queue, and runtime event evidence. |

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
- Runtime logs also showed repeated SDK ping-timeout reconnects:
  `no pong/inbound within 60s of last ping, terminating to trigger reconnect`.
  The Node SDK type contract documents this as a client-side liveness watchdog:
  after a server ping, no inbound frame within the window means the connection is
  dead and the SDK should terminate the socket to run its standard reconnect
  flow.
- After rebuild/restart at `2026-06-08T12:33:30Z`, runtime reported
  `pingTimeoutSeconds=0`, `reconnects=0`, and owner lock path under
  `~/.config/openclaw-studio/channel-connectors/feishu-ws-global-locks`.
  A 75s read-only soak produced 81 samples, 0 violations, and no new
  ping-timeout reconnect log events. No user message was sent during this soak,
  so ingress remains pending live validation.
- At `2026-06-08T20:42+08:00`, the user sent a new Feishu message after the
  `pingTimeoutSeconds=0` restart. Runtime still showed `connected=true`,
  `ingressVerified=false`, `receivedMessages=0`, `lastReceivedAt=null`, and
  `feishu-events.jsonl` had not changed since `20:20:22+08:00`. This proves
  OpenClaw-style no-ping Node WS options are insufficient in this environment.
- Local duplicate-client check found Studio is the only process using app
  `cli_a9280cc8eab85cca`; the old `cc-connect` process uses a different
  Feishu app. Duplicate same-app delivery theft is not the current primary
  cause.
- After restart at `2026-06-08T12:58:00Z`, a real Feishu message entered at
  `12:58:25Z` and completed reply at `12:58:27Z`. A later user report said a
  new message again did not arrive; runtime still showed historical
  `ingressVerified=true`. Root delta: `receivedMessages > 0` proved only a past
  event, not current ingress freshness.
- The production guard now treats ingress as a lease: after a real event, the
  verified lease renews every 120s of silence by rebuilding the SDK client. This
  is intentionally separate from old connected-idle rebuilds and is grounded in
  the live "once verified, later silent" failure above.
- A 180s watcher from `2026-06-08T13:17:39Z` to `13:20:39Z` with
  `--require-ingress-verified` failed after the user sent a message:
  `connected=true`, `ingressVerified=false`, `receivedMessages=0`, and no new
  Feishu event entered. Later SDK ping-timeout reconnects also did not produce a
  real message callback, so the issue is still open at the Feishu ingress layer.
- Studio now records SDK dispatcher callbacks separately from business message
  ingress. If the SDK callback fires but Studio cannot handle or verify the
  event, smoke classifies `sdk_event_no_handler`,
  `sdk_event_verification_failed`, or `sdk_event_invoke_failed`.

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
- `client.ts createEventDispatcher`: creates `EventDispatcher` with
  `verificationToken` and `encryptKey`; Studio keeps the same credential
  contract even though long-connection SDK invoke uses `needCheck=false`.
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

- One user-global owner lock per Feishu app/domain.
- Official Node SDK `WSClient` + `EventDispatcher`.
- `EventDispatcher` uses binding metadata `verificationToken` / `encryptKey`,
  matching OpenClaw's Node contract.
- Fast background dispatch for normal message/menu events.
- Runtime distinguishes `connected` from `ingressVerified` / `ingressState`.
- Runtime also exposes `dispatcherCallbacks`, `lastDispatcherCallbackAt`,
  `lastDispatcherEventType`, `dispatcherVerificationConfigured`, and
  `dispatcherEncryptConfigured` to distinguish SDK-not-receiving,
  dispatcher-not-handling, and business/Agent failures.
- `pingTimeoutSeconds` default is 0, matching OpenClaw's TypeScript connector
  and CC Go's SDK-owned keepalive model. `wsConfig.pingTimeout` can still be
  explicitly enabled per binding with `feishuPingTimeoutSeconds` /
  `pingTimeoutSeconds`, but it is diagnostic/opt-in rather than the default.
- Owner lock path is user-global:
  `~/.config/openclaw-studio/channel-connectors/feishu-ws-global-locks`.
- `ingressUnverifiedRenewMax` default is 0 and
  `verifiedIngressSilentRenewAfterMs` default is 0. Startup and verified-ingress
  lease renewals remain metadata opt-ins for diagnostics only; default runtime
  stability must come from SDK reconnect plus single owner, not periodic socket
  rebuilding.
- `connectedIdleRenewAfterMs=0`.
- `zeroInboundRenewAfterMs=0`.
- `connected` is only transport state. Acceptance requires real dispatcher or
  business ingress evidence (`dispatcherCallbacks` / `receivedMessages`).

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

3. Live soak:
   - Restart daemon, wait for connected, then send Feishu messages at 0s, 30s,
     90s, after the 120s lease renewal, and after code rebuild.
   - Each message must appear in `feishu-events.jsonl` and produce reply
     evidence.
   - If a message does not enter, capture runtime, log tail, process list, and
     owner lock file before restarting anything.

4. Duplicate-client proof:
   - Record every local process that can hold the same Feishu app credentials.
   - Verify Studio owner lock detects same app/domain conflicts.
   - Check old `cc-connect` and dev daemons use different or same Feishu app IDs.

5. Final implementation:
   - Port missing CC/OpenClaw contracts first.
   - Only then consider additional Studio guardrails.
   - Update this document and close the issue only after repeated live evidence.

## Feedback Log

- 2026-06-08: User reported Feishu did not reply while Octo remained normal.
  Runtime showed false online before later messages arrived. Action: created this
  tracker and set rule that restart-based recovery is not the primary solution.
- 2026-06-08: Removed Studio's default Feishu Node SDK `wsConfig.pingTimeout`
  injection and moved the same-app owner lock to a user-global path. Evidence:
  build passed, Channel Connectors system tests passed, daemon restarted with
  `pingTimeoutSeconds=0`, and 75s read-only soak had no reconnect violations.
- 2026-06-08: User sent a real Feishu message after the no-ping restart and it
  did not enter Studio. Historical attempt: enabled SDK half-open liveness by
  default. This was later superseded after CC/OpenClaw parity review showed it
  caused repeated socket churn in Studio's runtime.
- 2026-06-08: A 3-minute post-restart watch still saw no new Feishu event before
  the SDK liveness guard fired and reconnected. Historical attempt: enabled
  startup-only ingress renewal by default. This was later superseded; renewal is
  now opt-in diagnostics only.
- 2026-06-08: User sent another Feishu message while Studio reported connected;
  no SDK business event arrived. Action: added OpenClaw-style dispatcher
  credential configuration and runtime dispatcher callback diagnostics. This is
  not marked solved until a real Feishu message increments `dispatcherCallbacks`
  and `receivedMessages` and replies consistently.
- 2026-06-08: Rechecked against CC Go and OpenClaw after another "not online"
  report. The 21:32 CST message did enter Studio and executed `new`, but the
  remaining custom liveness defaults were causing repeated socket churn
  (`no pong/inbound within 60s`, startup renewal, verified-ingress renewal).
  Action: reverted Feishu defaults to SDK-owned keepalive (`pingTimeoutSeconds=0`,
  ingress renewals disabled) and kept dispatcher/business ingress diagnostics as
  the proof of delivery.
- 2026-06-08: User's 21:37 CST Feishu text `1` entered Studio and completed an
  Agent reply, proving business ingress can work but the old renewal defaults
  kept churning afterward. After the 21:42 CST restart with SDK-owned defaults,
  a 75s smoke showed `pingTimeoutSeconds=0`, renewal defaults at 0,
  `connected=true`, `reconnects=0`, and no new violation logs. No post-restart
  user message has been observed yet.
