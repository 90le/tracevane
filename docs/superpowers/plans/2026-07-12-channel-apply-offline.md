# Channel Connectors First Apply and Offline State Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a first Channel Connectors configuration apply start a stopped guardian and keep Overview/Sessions usable when the guardian is offline.

**Architecture:** Keep generic daemon reload semantics unchanged. The v3 apply transaction alone promotes `daemon_not_running` to an explicit start, while read-only agent-session status gains a typed offline snapshot; mutating session operations still require the live daemon.

**Tech Stack:** Node.js, TypeScript, React, TanStack Query, node:test.

## Global Constraints

- Preserve plan expiry, candidate hashing, atomic config writes, rollback semantics, management authentication, and secret redaction.
- Do not change Codex local configuration or external Feishu/Lark contracts.
- Use the existing cross-platform service manager; add no dependency or parallel supervisor abstraction.
- GET may describe an offline runtime; POST management actions must not report synthetic success.

---

### Task 1: Prove stopped-daemon apply and offline-read behavior

**Files:**
- Modify: `tests/system/channel-connectors-v3-service.test.mjs`

**Interfaces:**
- Consumes: `createChannelConnectorsService`, `planV3Config`, `applyV3Config`, `getAgentSessions`, `manageAgentSessions`.
- Produces: regression coverage for first-start and offline status boundaries.

- [x] **Step 1: Add a stopped-daemon apply test**

Create a fixture manager whose status is stopped, whose reload status remains stopped, and whose start result is running. Assert the call sequence ends in `{ action: "start", mode: "session", apply: true }`, the result is `accepted: true`, `persisted: true`, and `reload.status: "applied"`.

- [x] **Step 2: Add an offline GET / live-only POST test**

Inject `fetchImpl` that throws `TypeError("fetch failed")`. Assert `getAgentSessions()` resolves with `runtimeReachable: false`, `persistentDriverReady: false`, empty active sessions and `unavailableReason: "daemon_unreachable"`; assert `manageAgentSessions({ action: "reap-idle" })` rejects.

- [x] **Step 3: Run the focused red tests**

Run: `npm run build:api && node --test --test-name-pattern="stopped daemon|offline agent-session" tests/system/channel-connectors-v3-service.test.mjs`

Expected: both new assertions fail before implementation.

### Task 2: Start the guardian from the v3 apply transaction

**Files:**
- Modify: `apps/api/modules/channel-connectors/service.ts`
- Test: `tests/system/channel-connectors-v3-service.test.mjs`

**Interfaces:**
- Consumes: existing `manageDaemonService` and `ChannelConnectorsDaemonResponse.skippedReason`.
- Produces: accepted apply result when a stopped owner starts successfully.

- [x] **Step 1: Add the narrow bootstrap branch**

After reload, detect only `daemon_not_running`; invoke the existing start action with the discovered owner mode. Convert a running manager result into an applied reload response using the saved config timestamp. For an unsuccessful session or persistent bootstrap, stop and verify the newly created owner before preserving the existing config rollback path.

- [x] **Step 2: Run focused service tests**

Run: `npm run build:api && node --test --test-name-pattern="stopped daemon|V3 apply|failed V3 reload" tests/system/channel-connectors-v3-service.test.mjs`

Expected: PASS.

### Task 3: Return a typed offline session snapshot

**Files:**
- Modify: `types/channel-connectors.ts`
- Modify: `apps/api/modules/channel-connectors/daemon.ts`
- Modify: `apps/api/modules/channel-connectors/service.ts`
- Test: `tests/system/channel-connectors-v3-service.test.mjs`

**Interfaces:**
- Produces: `runtimeReachable: boolean`, `persistentDriverReady: boolean`, and `unavailableReason: "daemon_unreachable" | null` on `ChannelConnectorAgentSessionDriverStatusResponse`.

- [x] **Step 1: Extend the shared response contract**

Change `persistentDriverReady` from literal `true` to boolean and add the two availability fields. Populate the daemon's live response with `runtimeReachable: true` and `unavailableReason: null`.

- [x] **Step 2: Implement GET-only connection fallback**

Catch only fetch connection failures in `getAgentSessions()`. Build a response from current config/session policy with no active runtime sessions or recent runtime events. Do not catch `manageAgentSessions()` errors.

- [x] **Step 3: Run focused tests and typecheck**

Run: `npm run build:api && node --test tests/system/channel-connectors-v3-service.test.mjs && npm run typecheck`

Expected: PASS.

### Task 4: Present offline state without replacing whole pages

**Files:**
- Modify: `apps/web/src/features/channel-connectors/views/V3OverviewView.tsx`
- Modify: `apps/web/src/features/channel-connectors/views/SessionsView.tsx`

**Interfaces:**
- Consumes: the availability fields from Task 3.
- Produces: inline offline warnings while preserving configured accounts, policies, and empty-session UI.

- [x] **Step 1: Render the availability warning**

Add one existing Aurora-styled warning panel in each view when `runtimeReachable === false`. Keep query error handling for genuine API/config errors.

- [x] **Step 2: Run Web verification**

Run: `npm run typecheck:web`

Expected: PASS.

### Task 5: Document, verify, and integrate

**Files:**
- Modify: `docs/研究先行开发清单.md`
- Modify: `docs/superpowers/specs/2026-07-12-channel-apply-offline-design.md`
- Modify: `docs/superpowers/plans/2026-07-12-channel-apply-offline.md`

**Interfaces:**
- Produces: durable implementation and verification evidence.

- [x] **Step 1: Record the local-contract decision**

Document that no external Feishu/Lark contract changed, generic reload remains non-starting, and GET-only degradation is intentional.

- [x] **Step 2: Run the regression gate**

Run: `npm run typecheck && npm run typecheck:web && node --test tests/system/channel-connectors-v3-service.test.mjs && git diff --check`

Expected: PASS.

- [x] **Step 3: Browser smoke**

Follow: `消息接入 → 渠道账号 → 应用变更 → 弹窗关闭且账号保存/守护启动 → 概览与会话正常渲染` at `http://127.0.0.1:5176/#/im-channels`. Confirm no new console errors and that offline state is truthful if the guardian is deliberately stopped.

- [ ] **Step 4: Commit and merge**

Commit only owned files on `codex/fix-channel-apply-offline`, merge into `main`, restart development on backend `3761` and frontend `5176`, and re-run the HTTP/browser smoke.
