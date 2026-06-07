import test from "node:test";
import assert from "node:assert/strict";

import {
  CodexAppServerSession,
} from "../../dist/apps/api/modules/channel-connectors/codex-app-server-driver.js";

class FakeCodexAppServerTransport {
  messages = [];
  closed = [];
  messageCallbacks = [];
  closeCallbacks = [];
  nextThreadId = "thread-app-server-1";
  nextTurnId = 1;
  completeTurns = true;
  responseDelayMs = 0;

  send(message) {
    this.messages.push(message);
    const id = message.id;
    const respond = (result) => {
      const emit = () => this.emit({ id, result });
      if (this.responseDelayMs > 0) setTimeout(emit, this.responseDelayMs);
      else emit();
    };
    if (message.method === "initialize") {
      respond({
        userAgent: "codex-test",
        codexHome: "/tmp/codex-home",
        platformFamily: "unix",
        platformOs: "linux",
      });
      return;
    }
    if (message.method === "thread/start") {
      respond({
        thread: {
          id: this.nextThreadId,
          sessionId: "session-1",
          turns: [],
        },
        model: "gpt-5",
        modelProvider: "studio_gateway",
        cwd: "/tmp/project",
      });
      return;
    }
    if (message.method === "turn/start") {
      const turnId = `turn-${this.nextTurnId}`;
      this.nextTurnId += 1;
      respond({
        turn: {
          id: turnId,
          status: "running",
          items: [],
          itemsView: "complete",
          error: null,
          startedAt: 1,
          completedAt: null,
          durationMs: null,
        },
      });
      if (this.completeTurns) {
        setTimeout(() => {
          this.emit({
            method: "turn/started",
            params: {
              threadId: this.nextThreadId,
              turn: { id: turnId, status: "running" },
            },
          });
          this.emit({
            method: "item/agentMessage/delta",
            params: {
              threadId: this.nextThreadId,
              turnId,
              itemId: "agent-1",
              delta: `reply for ${message.params.clientUserMessageId}`,
            },
          });
          this.emit({
            method: "item/completed",
            params: {
              threadId: this.nextThreadId,
              turnId,
              completedAtMs: Date.now(),
              item: {
                type: "agentMessage",
                id: "agent-1",
                text: `reply for ${message.params.clientUserMessageId}`,
              },
            },
          });
          this.emit({
            method: "turn/completed",
            params: {
              threadId: this.nextThreadId,
              turn: {
                id: turnId,
                status: "completed",
                items: [],
                error: null,
                durationMs: 5,
              },
            },
          });
        }, 0);
      }
      return;
    }
    if (message.method === "thread/compact/start") {
      const turnId = `turn-${this.nextTurnId}`;
      this.nextTurnId += 1;
      respond({});
      setTimeout(() => {
        this.emit({
          method: "turn/started",
          params: {
            threadId: this.nextThreadId,
            turn: { id: turnId, status: "running" },
          },
        });
        this.emit({
          method: "item/completed",
          params: {
            threadId: this.nextThreadId,
            turnId,
            completedAtMs: Date.now(),
            item: {
              type: "contextCompaction",
              id: "compact-1",
            },
          },
        });
        this.emit({
          method: "warning",
          params: {
            message: "Long threads and multiple compactions can cause the model to be less accurate.",
          },
        });
        this.emit({
          method: "turn/completed",
          params: {
            threadId: this.nextThreadId,
            turn: {
              id: turnId,
              status: "completed",
              items: [],
              error: null,
              durationMs: 5,
            },
          },
        });
      }, 0);
      return;
    }
    if (message.method === "turn/interrupt") {
      respond({});
      setTimeout(() => {
        this.emit({
          method: "turn/completed",
          params: {
            threadId: message.params.threadId,
            turn: {
              id: message.params.turnId,
              status: "cancelled",
              items: [],
              error: null,
              durationMs: 1,
            },
          },
        });
      }, 0);
      return;
    }
    this.emit({ id, error: { message: `unexpected method ${message.method}` } });
  }

  close(reason) {
    this.closed.push(reason);
    for (const callback of this.closeCallbacks) callback(null);
  }

  onMessage(callback) {
    this.messageCallbacks.push(callback);
  }

  onClose(callback) {
    this.closeCallbacks.push(callback);
  }

  emit(message) {
    for (const callback of this.messageCallbacks) callback(message);
  }
}

const project = {
  id: "codex-app-server",
  name: "Codex App Server",
  agent: "codex",
  model: "gpt-5",
  workDir: "/tmp/project",
  permissionMode: "suggest",
  gatewayEndpoint: "http://127.0.0.1:18796/v1",
  gatewayKeyRef: "studio-gateway-client-key",
  appProfileRef: "codex",
  platformBindings: [],
};

const binding = {
  id: "octo-codex",
  platform: "octo",
  accountId: "octo-account",
  botId: "robot-1",
  displayName: "Octo Codex",
  agent: "codex",
  enabled: true,
  allowlist: [],
  adminUsers: [],
  metadata: {},
};

function agentTurnRequest(overrides = {}) {
  return {
    project,
    binding,
    message: {
      messageId: overrides.messageId || "m-1",
      fromUid: "user-1",
      channelId: "user-1",
      channelType: 1,
      payload: {
        type: 1,
        content: overrides.content || "hello codex app server",
      },
    },
    sessionKey: "dmwork:dm:user-1",
    gatewayEndpoint: project.gatewayEndpoint,
    gatewayClientKey: "sk-test",
    nativeCommand: overrides.nativeCommand || null,
  };
}

test("Codex app-server driver starts one thread and reuses it across turns", async () => {
  const transport = new FakeCodexAppServerTransport();
  const session = new CodexAppServerSession({
    sessionId: "session-1",
    transport,
    model: "gpt-5",
    cwd: "/tmp/project",
    permissionMode: "suggest",
  });
  const progress = [];

  const first = await session.runTurn({
    mode: "persistent",
    key: {
      bindingId: "octo-codex",
      projectId: "codex-app-server",
      sessionKey: "dmwork:dm:user-1",
      agent: "codex",
      model: "gpt-5",
      workDir: "/tmp/project",
    },
    messageId: "m-1",
    agentTurnRequest: agentTurnRequest({ messageId: "m-1" }),
    onProgress: (event) => progress.push(event),
    runOneShot: async () => {
      throw new Error("one-shot should not run for app-server driver");
    },
  });
  const second = await session.runTurn({
    mode: "persistent",
    key: {
      bindingId: "octo-codex",
      projectId: "codex-app-server",
      sessionKey: "dmwork:dm:user-1",
      agent: "codex",
      model: "gpt-5",
      workDir: "/tmp/project",
    },
    messageId: "m-2",
    agentTurnRequest: agentTurnRequest({ messageId: "m-2" }),
    onProgress: (event) => progress.push(event),
    runOneShot: async () => {
      throw new Error("one-shot should not run for app-server driver");
    },
  });

  assert.equal(first.ok, true);
  assert.equal(first.replyText, "reply for m-1");
  assert.equal(first.session.codexThreadId, "thread-app-server-1");
  assert.equal(second.replyText, "reply for m-2");
  assert.equal(transport.messages.filter((message) => message.method === "thread/start").length, 1);
  assert.equal(transport.messages.filter((message) => message.method === "turn/start").length, 2);
  assert.equal(transport.messages.find((message) => message.method === "turn/start").params.model, "gpt-5");
  assert.match(transport.messages.find((message) => message.method === "turn/start").params.input[0].text, /hello codex app server/);
  assert.ok(progress.some((event) => event.type === "assistant" && event.text === "reply for m-1"));
});

test("Codex app-server driver maps /compact to native compact request", async () => {
  const transport = new FakeCodexAppServerTransport();
  const session = new CodexAppServerSession({
    sessionId: "session-compact",
    transport,
    model: "gpt-5",
    cwd: "/tmp/project",
    permissionMode: "suggest",
  });

  const progress = [];
  const result = await session.runTurn({
    mode: "persistent",
    key: {
      bindingId: "octo-codex",
      projectId: "codex-app-server",
      sessionKey: "dmwork:dm:user-1",
      agent: "codex",
      model: "gpt-5",
      workDir: "/tmp/project",
    },
    messageId: "m-compact",
    agentTurnRequest: agentTurnRequest({ messageId: "m-compact", nativeCommand: "/compact" }),
    onProgress: (event) => progress.push(event),
    runOneShot: async () => {
      throw new Error("compact should not fall back to one-shot");
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.replyText, "Codex compact 已完成。");
  assert.equal(transport.messages.filter((message) => message.method === "thread/start").length, 1);
  assert.equal(transport.messages.filter((message) => message.method === "thread/compact/start").length, 1);
  assert.equal(transport.messages.find((message) => message.method === "thread/compact/start").params.threadId, "thread-app-server-1");
  assert.ok(progress.some((event) => event.rawType === "item/completed" && event.itemType === "contextCompaction"));
  assert.ok(progress.some((event) => event.rawType === "turn/completed" && event.type === "completed"));
});

test("Codex app-server driver uses real thread sandbox mode and turn sandbox policy shapes", async () => {
  const cases = [
    {
      permissionMode: "read-only",
      threadSandbox: "read-only",
      turnSandboxPolicy: { type: "readOnly", networkAccess: true },
      approvalPolicy: "on-request",
    },
    {
      permissionMode: "auto-edit",
      threadSandbox: "workspace-write",
      turnSandboxPolicy: {
        type: "workspaceWrite",
        writableRoots: [],
        networkAccess: true,
        excludeTmpdirEnvVar: false,
        excludeSlashTmp: false,
      },
      approvalPolicy: "never",
    },
    {
      permissionMode: "yolo",
      threadSandbox: "danger-full-access",
      turnSandboxPolicy: { type: "dangerFullAccess" },
      approvalPolicy: "never",
    },
  ];

  for (const item of cases) {
    const transport = new FakeCodexAppServerTransport();
    const session = new CodexAppServerSession({
      sessionId: `session-${item.permissionMode}`,
      transport,
      model: "gpt-5",
      cwd: "/tmp/project",
      permissionMode: item.permissionMode,
    });

    const result = await session.runTurn({
      mode: "persistent",
      key: {
        bindingId: "octo-codex",
        projectId: "codex-app-server",
        sessionKey: `dmwork:dm:${item.permissionMode}`,
        agent: "codex",
        model: "gpt-5",
        workDir: "/tmp/project",
      },
      messageId: `m-${item.permissionMode}`,
      agentTurnRequest: agentTurnRequest({ messageId: `m-${item.permissionMode}` }),
      runOneShot: async () => {
        throw new Error("one-shot should not run for app-server driver");
      },
    });

    assert.equal(result.ok, true);
    const threadStart = transport.messages.find((message) => message.method === "thread/start");
    const turnStart = transport.messages.find((message) => message.method === "turn/start");
    assert.equal(threadStart.params.sandbox, item.threadSandbox);
    assert.equal(threadStart.params.approvalPolicy, item.approvalPolicy);
    assert.deepEqual(turnStart.params.sandboxPolicy, item.turnSandboxPolicy);
    assert.equal(turnStart.params.approvalPolicy, item.approvalPolicy);
  }
});

test("Codex app-server driver stop sends turn interrupt for active turn", async () => {
  const transport = new FakeCodexAppServerTransport();
  transport.completeTurns = false;
  const session = new CodexAppServerSession({
    sessionId: "session-stop",
    transport,
    model: "gpt-5",
    cwd: "/tmp/project",
    permissionMode: "suggest",
  });
  const run = session.runTurn({
    mode: "persistent",
    key: {
      bindingId: "octo-codex",
      projectId: "codex-app-server",
      sessionKey: "dmwork:dm:user-1",
      agent: "codex",
      model: "gpt-5",
      workDir: "/tmp/project",
    },
    messageId: "m-stop",
    agentTurnRequest: agentTurnRequest({ messageId: "m-stop" }),
    runOneShot: async () => {
      throw new Error("one-shot should not run for app-server driver");
    },
  });

  await new Promise((resolve) => setTimeout(resolve, 0));
  await session.stop("manual-stop");
  const result = await run;
  assert.equal(result.ok, true);
  assert.equal(transport.messages.filter((message) => message.method === "turn/interrupt").length, 1);
  assert.equal(transport.messages.find((message) => message.method === "turn/interrupt").params.turnId, "turn-1");
});

test("Codex app-server driver times out unanswered requests", async () => {
  const transport = new FakeCodexAppServerTransport();
  const originalSend = transport.send.bind(transport);
  transport.send = (message) => {
    if (message.method === "initialize") {
      transport.messages.push(message);
      return;
    }
    originalSend(message);
  };
  const session = new CodexAppServerSession({
    sessionId: "session-timeout",
    transport,
    model: "gpt-5",
    cwd: "/tmp/project",
    permissionMode: "suggest",
    requestTimeoutMs: 5,
  });

  await assert.rejects(
    session.runTurn({
      mode: "persistent",
      key: {
        bindingId: "octo-codex",
        projectId: "codex-app-server",
        sessionKey: "dmwork:dm:user-1",
        agent: "codex",
        model: "gpt-5",
        workDir: "/tmp/project",
      },
      messageId: "m-timeout",
      agentTurnRequest: agentTurnRequest({ messageId: "m-timeout" }),
      runOneShot: async () => {
        throw new Error("one-shot fallback is owned by the outer session pool");
      },
    }),
    /request timed out: initialize/,
  );
});
