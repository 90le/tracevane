# Channel Codex Cross-Platform Incident Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix Windows persistent-session path overflow and prevent incompatible Codex native-thread reuse after model changes.

**Architecture:** Replace full session IDs in directory names with deterministic bounded hashes. Treat agent, model, and workDir as the native execution identity even when the v3 delivery identity remains stable.

**Tech Stack:** Node.js, TypeScript, node:test, Codex CLI/app-server.

## Global Constraints

- Do not modify personal Codex configuration.
- Preserve v3 delivery identity, conversation history, secret redaction, and same-model session continuity.
- Do not depend on Windows long-path registry settings.

---

### Task 1: Bounded persistent-session storage key

**Files:**
- Modify: `apps/api/modules/channel-connectors/daemon.ts`
- Test: `tests/system/channel-connectors-codex-app-server-driver.test.mjs`

**Interfaces:**
- Produces: exported `channelConnectorPersistentSessionStorageKey(sessionId: string): string` returning 32 lowercase hex characters.

- [ ] Add a failing test asserting a 400+ character identity produces a deterministic 32-character key and a Windows root stays below 260 characters.
- [ ] Run `npm run build:api && node --test --test-name-pattern="bounded persistent session" tests/system/channel-connectors-codex-app-server-driver.test.mjs`; expect failure because the helper is missing.
- [ ] Implement SHA-256 truncation and use it for `persistent-sessions/<key>/codex-home`.
- [ ] Re-run the focused test; expect pass.

### Task 2: Native identity boundary on model change

**Files:**
- Modify: `apps/api/modules/channel-connectors/daemon.ts`
- Test: `tests/system/channel-connectors-session-continuity-v3.test.mjs`

**Interfaces:**
- Produces: delivery lookup returns a resumable record only when agent, model, and workDir match.

- [ ] Add failing tests proving same-model lookup resumes while a changed model returns no native session.
- [ ] Run the focused test and observe the changed-model assertion fail.
- [ ] Add the model equality guard at the runtime delivery lookup boundary; keep historical records unchanged.
- [ ] Re-run the test and Channel app-server/agent-runner tests.

### Task 3: Live Windows recovery

**Files:**
- Modify: `docs/研究先行开发清单.md`

- [ ] Build/restart 3761/5176 and reload the Channel daemon.
- [ ] Clear only the stale current delivery session through the existing guarded reset API, not by deleting arbitrary rollout files.
- [ ] Send/execute a local runner smoke that creates the formerly overflowing persistent session path and completes two same-model turns.
- [ ] Confirm the live runtime contains no new `ENOENT mkdir`, `fc_call_`, or `Expected ... ctc` error.
