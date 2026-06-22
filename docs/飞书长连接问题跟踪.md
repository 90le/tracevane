# Feishu Long Connection Issue Tracker

> Status: stable / monitored
> Updated: 2026-06-17
> Scope: Tracevane native Channel Connectors Feishu long-connection ingress.

This is the single tracker for Feishu "connected but no reply" incidents. New Feishu long-connection fixes must update this file before or with code changes.

## 1. References

- SDK: OpenClaw uses `@larksuiteoapi/node-sdk@1.66.0`; Tracevane currently uses `@larksuiteoapi/node-sdk@1.66.1`
- Feishu official docs:
  - `https://open.feishu.cn/document/server-side-sdk/nodejs-sdk/preparation-before-development`
  - `https://open.feishu.cn/document/server-side-sdk/nodejs-sdk/handling-events`
  - `https://open.feishu.cn/document/server-side-sdk/nodejs-sdk/handling-callbacks`
- Lark Node SDK issues checked: reconnect timer leak, `WSClient.start()` early resolve.
- Future fixes must recheck official Feishu/Lark SDK docs, SDK release notes, GitHub issues/discussions, community failure reports, current Tracevane runtime logs, and live connection evidence before changing behavior.

## 2. Current Diagnosis

The recurring failure is not model latency, menu rendering, verification token, Agent queueing, or local `cc-connect` interference.

Decisive user evidence:

- When Feishu does not reply, manually restarting Channel Connectors makes the same bot receive messages again.
- Official Feishu long-connection check can report failure while Tracevane previously still showed `connected=true`.
- Octo stays stable under the same workload, so the Channel daemon and Agent runner are not the primary fault class.

Conclusion: Tracevane must treat Feishu SDK `connected` as insufficient and manage a self-healing owner cycle.

2026-06-12 live status: user verified Feishu and Octo long connections are both stable. The incident is marked complete and stays in monitored state; any future "connected but no reply" report must reopen this tracker with fresh runtime/log evidence.

## 3. Current Contract

- One Feishu app/domain has one Tracevane OS-user owner lock; the owner fans out to matching bindings.
- Each owner cycle creates one official SDK `WSClient` and one `EventDispatcher`.
- WS handshake has a 15s timeout.
- `wsConfig.pingTimeout` uses lower-case SDK field and defaults to 3s.
- Tracevane wraps SDK ping scheduling and clamps effective ping interval to 10s by default.
- `pongTimeoutMs` defaults to 8000ms.
- Transport stale window defaults to `pingIntervalMs + pongTimeoutMs + 5000`, currently 23000ms.
- SDK terminal error, long `reconnecting`, pong overdue, or transport stale closes the current cycle and lets the outer OpenClaw-style loop rebuild.
- Connected-idle, zero-inbound and verified-ingress rebuilds stay disabled by default; idle bot should not churn only because no business message arrived.
- Handler ACK must be fast. Message receive and bot menu dispatch business work asynchronously.
- Card action handlers must return the command card/toast as the Feishu callback response when possible; do not fire-and-forget card clicks, or stale cards can surface 108002-style unusable interactions.
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
- Compare Tracevane runtime/health with official Feishu connection check.
- Confirm `connected=false` or unhealthy when pong is overdue or transport is stale.
- Confirm old redelivered Feishu messages are skipped after newer message waterline advances.

Latest accepted live claim:

- 2026-06-12: user verified Feishu and Octo long connections remain stable.
- 2026-06-12: user verified Markdown rendering; file/media contract retest is covered in the Channel Connectors system tests.
- 2026-06-13: card action callback path changed from background dispatch to synchronous callback response; `node --test tests/system/channel-connectors-service.test.mjs` passed 104/104.

## 6. If It Reappears

Collect these first, then patch:

- `runtime.json` Feishu owner section.
- Latest `channel-connectors.log` entries for `feishu.*`, ping/pong and lifecycle.
- Official Feishu connection check result and timestamp.
- Whether Octo still replies immediately.
- Whether manual daemon restart immediately restores Feishu.

Then update this tracker with the current official/API/SDK/GitHub/community evidence, Tracevane runtime evidence, selected fix, rejected options and verification plan before designing new behavior.
