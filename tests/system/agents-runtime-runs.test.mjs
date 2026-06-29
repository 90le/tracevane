import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(here, "../..");

const { buildAgentRuntimeRunsPayload } = await import(
  path.join(rootDir, "dist/apps/api/modules/agents/runtime-runs.js")
);

test("agent runtime runs aggregates terminal and IM sessions without Web Chat", () => {
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
      bindings: [
        {
          projectId: "project",
          bindingId: "bind-1",
          platform: "feishu",
          accountId: "feishu-live",
          botId: null,
          peerKind: "user",
          peerId: "ou_x",
          agent: "claude",
          model: "gpt-5.4",
          permissionMode: "default",
          workDir: "/repo",
          requestedMode: "persistent",
          effectiveMode: "persistent",
          reason: "codex-app-server",
        },
      ],
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
  });

  assert.equal(payload.checkedAt, "2026-06-24T00:00:00.000Z");
  assert.equal(payload.totals.total, 2);
  assert.equal(payload.totals.running, 1);
  assert.equal(payload.totals.failed, 1);
  assert.equal(payload.totals.terminal, 1);
  assert.equal(payload.totals.imChannel, 1);
  assert.deepEqual(
    payload.runs.map((run) => run.id),
    ["terminal:term-1", "im:pool-1"],
  );
  assert.equal("chat" in payload.totals, false);
  assert.equal(
    payload.runs.some((run) => run.source === "chat"),
    false,
  );
  const terminal = payload.runs.find((run) => run.id === "terminal:term-1");
  const im = payload.runs.find((run) => run.id === "im:pool-1");
  assert.equal(im.status, "failed");
  assert.equal(im.sourceLabel, "飞书私聊");
  assert.equal(im.primaryHref, "#/im-channels?view=sessions");
  assert.equal(im.canStop, false);
  assert.equal(im.actionLabel, "去 IM 渠道");
  assert.match(im.actionReason, /IM Channels/);
  assert.equal(terminal.cli, "codex");
  assert.equal(terminal.canStop, true);
  assert.equal(terminal.canDelete, false);
  assert.equal(terminal.actionLabel, "可在此停止");
  assert.match(terminal.actionReason, /Agent 终端会话/);
  assert.equal(terminal.primaryHref, "#/ide");
  assert.equal(terminal.evidenceRefs[0].href, "#/ide");
});
