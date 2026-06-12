# Feishu Long Connection Issue Tracker

> Status: active validation
> Updated: 2026-06-12
> Scope: Studio native Channel Connectors Feishu long-connection ingress.

This is the single tracker for Feishu "connected but no reply" incidents. New Feishu long-connection fixes must update this file before or with code changes.

## 1. References

- CC Go: `release/openclaw-studio-0.1.70/resources/codex-stack/cc-connect-source/platform/feishu`
- Latest OpenClaw local source: `/home/binbin/.openclaw/projects/openclaw/latest/extensions/feishu`
- OpenClaw Feishu lifecycle files checked: `extensions/feishu/src/client.ts`, `extensions/feishu/src/monitor.transport.ts`
- SDK: OpenClaw uses `@larksuiteoapi/node-sdk@1.66.0`; Studio currently uses `@larksuiteoapi/node-sdk@1.66.1`
- Feishu official docs:
  - `https://open.feishu.cn/document/server-side-sdk/nodejs-sdk/preparation-before-development`
  - `https://open.feishu.cn/document/server-side-sdk/nodejs-sdk/handling-events`
  - `https://open.feishu.cn/document/server-side-sdk/nodejs-sdk/handling-callbacks`
- Lark Node SDK issues checked: reconnect timer leak, `WSClient.start()` early resolve.

## 2. Current Diagnosis

The recurring failure is not model latency, menu rendering, verification token, Agent queueing, or local `cc-connect` interference.

Decisive user evidence:

- When Feishu does not reply, manually restarting Channel Connectors makes the same bot receive messages again.
- Official Feishu long-connection check can report failure while Studio previously still showed `connected=true`.
- Octo stays stable under the same workload, so the Channel daemon and Agent runner are not the primary fault class.

Conclusion: Studio must treat Feishu SDK `connected` as insufficient and manage a self-healing owner cycle.

## 3. Current Contract

- One Feishu app/domain has one Studio OS-user owner lock; the owner fans out to matching bindings.
- Each owner cycle creates one official SDK `WSClient` and one `EventDispatcher`.
- WS handshake has a 15s timeout.
- `wsConfig.pingTimeout` uses lower-case SDK field and defaults to 3s.
- Studio wraps SDK ping scheduling and clamps effective ping interval to 10s by default.
- `pongTimeoutMs` defaults to 8000ms.
- Transport stale window defaults to `pingIntervalMs + pongTimeoutMs + 5000`, currently 23000ms.
- SDK terminal error, long `reconnecting`, pong overdue, or transport stale closes the current cycle and lets the outer OpenClaw-style loop rebuild.
- Connected-idle, zero-inbound and verified-ingress rebuilds stay disabled by default; idle bot should not churn only because no business message arrived.
- Handler ACK must be fast. Message receive, bot menu and card action all dispatch business work asynchronously.
- Feishu `create_time` and per-session waterline skip older redelivery after a newer user message has already been processed.
- Runtime and health expose SDK state, owner lock, ping/pong, raw event frame counters, dispatcher callback counters, pong overdue and transport stale.

## 4. What Not To Do

- Do not rely on `verificationToken` for long-connection delivery. It is only for webhook/callback validation paths.
- Do not claim stability from "service active" or SDK `connected` alone.
- Do not add business-idle restart loops without new evidence; idle periods are valid.
- Do not block SDK event ACK on attachment download, Agent run, card patch or final reply.
- Do not run multiple local Feishu owners for the same app.

## 5. Verification

Required for any Feishu long-connection claim:

- `npm run typecheck:api`
- `npm run build:api`
- `node --test tests/system/channel-connectors-service.test.mjs`
- Restart Channel daemon, then send a fresh Feishu private message and verify immediate Agent reply.
- Compare Studio runtime/health with official Feishu connection check.
- Confirm `connected=false` or unhealthy when pong is overdue or transport is stale.
- Confirm old redelivered Feishu messages are skipped after newer message waterline advances.

## 6. If It Reappears

Collect these first, then patch:

- `runtime.json` Feishu owner section.
- Latest `channel-connectors.log` entries for `feishu.*`, ping/pong and lifecycle.
- Official Feishu connection check result and timestamp.
- Whether Octo still replies immediately.
- Whether manual daemon restart immediately restores Feishu.

Then compare with CC Go/OpenClaw source before designing new behavior.
