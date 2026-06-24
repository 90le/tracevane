import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(here, "../..");

const { buildAgentRuntimeRunsPayload } = await import(
  path.join(rootDir, "dist/apps/api/modules/agents/runtime-runs.js")
);

test("agent runtime runs aggregates terminal, IM, and chat sessions", () => {
  const payload = buildAgentRuntimeRunsPayload({
    checkedAt: "2026-06-24T00:00:00.000Z",
    terminalSessions: {
      sessions: [
        {
          sessionId: "term-1",
          title: "Codex workspace",
          profileId: "codex",
          targetKind: "local",
          cwd: "/repo",
          pinned: false,
          source: "manual",
          sourceModule: "terminal",
          sourceAction: "codex",
          originRoute: "/cli-agents",
          status: "running",
          controllerClientId: null,
          observerClientIds: [],
          createdAt: "2026-06-24T00:00:01.000Z",
          lastActiveAt: "2026-06-24T00:00:04.000Z",
          lastAttachedAt: null,
          canResume: true,
          resumeKey: null,
          handoffContext: null,
          recentOutputSummary: null,
          controlState: "observer",
          observerCount: 0,
          updatedAt: "2026-06-24T00:00:04.000Z",
        },
      ],
    },
    channelSessions: {
      ok: true,
      checkedAt: "2026-06-24T00:00:00.000Z",
      defaultMode: "persistent",
      implementation: "native-cli-session-drivers",
      persistentDriverReady: true,
      policy: { idleTimeoutMs: 1, maxSessions: 4, fallbackOnCrash: true },
      requestedPersistentBindings: [],
      bindings: [],
      activeSessions: [
        {
          poolKey: "pool-1",
          sessionId: "im-1",
          bindingId: "bind-1",
          projectId: "project",
          sessionKey: "feishu-thread",
          agent: "claude",
          model: "gpt-5.4",
          permissionMode: "default",
          workDir: "/repo",
          createdAt: "2026-06-24T00:00:02.000Z",
          lastUsedAt: "2026-06-24T00:00:05.000Z",
          running: 0,
          turnCount: 2,
          idleMs: 1000,
          lastError: "upstream failed",
        },
      ],
      recentEvents: [],
    },
    chatBootstrap: {
      checkedAt: "2026-06-24T00:00:00.000Z",
      organizer: { folders: [], folderOrder: [], childFolderOrder: {}, rootSessionOrder: [], folderSessionOrder: {}, sessionFolderMap: {} },
      sessions: [
        {
          key: "chat-idle-history",
          agentId: "main",
          sessionId: "old",
          kind: "local",
          label: "Old idle chat",
          derivedTitle: "Old idle chat",
          lastMessagePreview: null,
          updatedAt: "2026-06-23T00:00:03.000Z",
          presentation: { archived: false, archivedAt: null, customLabel: null },
          source: { source: "local", channel: null, accountId: null, to: null, threadId: null },
          deliveryContext: { target: null, mode: "local" },
          permissions: { canSend: true, canAbort: true, canReset: true, canDelete: true },
          runtime: {
            gatewayConnected: false,
            sessionWritable: true,
            activeRunId: null,
            state: "idle",
            lastEventAt: null,
            lastAckAt: null,
            lastErrorCode: null,
            lastErrorMessage: null,
          },
        },
        {
          key: "chat-1",
          agentId: "opencode",
          sessionId: "s1",
          kind: "local",
          label: "Chat work",
          derivedTitle: "Chat title",
          lastMessagePreview: null,
          updatedAt: "2026-06-24T00:00:03.000Z",
          presentation: { archived: false, archivedAt: null, customLabel: null },
          source: { source: "local", channel: null, accountId: null, to: null, threadId: null },
          deliveryContext: { target: null, mode: "local" },
          permissions: { canSend: true, canAbort: true, canReset: true, canDelete: true },
          runtime: {
            gatewayConnected: true,
            sessionWritable: true,
            activeRunId: "run-1",
            state: "streaming",
            lastEventAt: "2026-06-24T00:00:06.000Z",
            lastAckAt: null,
            lastErrorCode: null,
            lastErrorMessage: null,
          },
        },
      ],
      selectedSessionKey: null,
      history: null,
      queue: null,
      controls: null,
      diagnostics: { ok: true, notes: [], warnings: [], errors: [] },
    },
  });

  assert.equal(payload.checkedAt, "2026-06-24T00:00:00.000Z");
  assert.equal(payload.totals.total, 3);
  assert.equal(payload.totals.running, 2);
  assert.equal(payload.totals.failed, 1);
  assert.equal(payload.totals.terminal, 1);
  assert.equal(payload.totals.imChannel, 1);
  assert.equal(payload.totals.chat, 1);
  assert.deepEqual(payload.runs.map((run) => run.id), ["chat:chat-1", "im:pool-1", "terminal:term-1"]);
  assert.equal(payload.runs.some((run) => run.id === "chat:chat-idle-history"), false);
  assert.equal(payload.runs[1].status, "failed");
  assert.equal(payload.runs[2].cli, "codex");
});
