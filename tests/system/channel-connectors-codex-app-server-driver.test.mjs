import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  CodexAppServerSession,
} from "../../dist/apps/api/modules/channel-connectors/codex-app-server-driver.js";
import {
  isChannelConnectorProcessProgressEvent,
} from "../../dist/apps/api/modules/channel-connectors/agent-runner.js";

class FakeCodexAppServerTransport {
  messages = [];
  closed = [];
  messageCallbacks = [];
  closeCallbacks = [];
  nextThreadId = "thread-app-server-1";
  nextTurnId = 1;
  completeTurns = true;
  emitTurnCompleted = true;
  responseDelayMs = 0;
  deltaChunks = null;
  completedText = null;
  userMessageEchoText = null;
  completedItems = null;
  toolItems = [];

  send(message) {
    this.messages.push(message);
    if (!message.method) return;
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
          const finalText = typeof this.completedText === "string"
            ? this.completedText
            : `reply for ${message.params.clientUserMessageId}`;
          const deltaChunks = Array.isArray(this.deltaChunks) && this.deltaChunks.length
            ? this.deltaChunks
            : [finalText];
          this.emit({
            method: "turn/started",
            params: {
              threadId: this.nextThreadId,
              turn: { id: turnId, status: "running" },
            },
          });
          if (typeof this.userMessageEchoText === "string") {
            this.emit({
              method: "item/completed",
              params: {
                threadId: this.nextThreadId,
                turnId,
                completedAtMs: Date.now(),
                item: {
                  type: "userMessage",
                  id: "user-1",
                  text: this.userMessageEchoText,
                },
              },
            });
          }
          for (const delta of deltaChunks) {
            this.emit({
              method: "item/agentMessage/delta",
              params: {
                threadId: this.nextThreadId,
                turnId,
                itemId: "agent-1",
                delta,
              },
            });
          }
          const completedItems = Array.isArray(this.completedItems)
            ? this.completedItems
            : [
              ...this.toolItems,
              {
                type: "agentMessage",
                id: "agent-1",
                text: finalText,
              },
            ];
          for (const item of completedItems) {
            this.emit({
              method: "item/completed",
              params: {
                threadId: this.nextThreadId,
                turnId,
                completedAtMs: Date.now(),
                item,
              },
            });
          }
          if (this.emitTurnCompleted) {
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
          }
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

async function waitFor(assertion, timeoutMs = 1000) {
  const startedAt = Date.now();
  let lastError = null;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const value = assertion();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  if (lastError) throw lastError;
  throw new Error("Timed out waiting for condition.");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function emitCodexTurnReply(transport, input = {}) {
  const turnId = input.turnId || "turn-1";
  const text = input.text || "approval finished";
  transport.emit({
    method: "item/agentMessage/delta",
    params: {
      threadId: transport.nextThreadId,
      turnId,
      itemId: "agent-approval",
      delta: text,
    },
  });
  transport.emit({
    method: "item/completed",
    params: {
      threadId: transport.nextThreadId,
      turnId,
      completedAtMs: Date.now(),
      item: {
        type: "agentMessage",
        id: "agent-approval",
        text,
      },
    },
  });
  transport.emit({
    method: "turn/completed",
    params: {
      threadId: transport.nextThreadId,
      turn: {
        id: turnId,
        status: "completed",
        items: [],
        error: null,
        durationMs: 5,
      },
    },
  });
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
  const assistantProgress = progress.filter((event) => event.type === "assistant");
  assert.deepEqual(assistantProgress.map((event) => event.text), ["reply for m-1", "reply for m-2"]);
  assert.deepEqual(assistantProgress.map((event) => event.phase), ["final", "final"]);
  assert.equal(assistantProgress.some((event) => isChannelConnectorProcessProgressEvent(event)), false);
});

test("Codex app-server driver forwards image inputs and preserves image args", async () => {
  const transport = new FakeCodexAppServerTransport();
  const session = new CodexAppServerSession({
    sessionId: "session-vision",
    transport,
    model: "gpt-5.5",
    cwd: "/tmp/project",
    permissionMode: "suggest",
  });
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "studio-codex-vision-"));
  const imagePath = path.join(tempDir, "photo.png");
  fs.writeFileSync(imagePath, Buffer.from("fake-png"));
  const request = agentTurnRequest({ messageId: "m-vision", content: "识别这张图片" });
  request.project = { ...request.project, model: "gpt-5.5" };
  request.modelCapabilities = { vision: true };
  request.message = {
    ...request.message,
    payload: { type: 2, content: "", name: "photo.png" },
    attachments: [{
      kind: "image",
      platform: "feishu",
      fileName: "photo.png",
      mimeType: "image/png",
      localPath: imagePath,
    }],
  };

  const result = await session.runTurn({
    mode: "persistent",
    key: {
      bindingId: "octo-codex",
      projectId: "codex-app-server",
      sessionKey: "dmwork:dm:user-1",
      agent: "codex",
      model: "gpt-5.5",
      workDir: "/tmp/project",
    },
    messageId: "m-vision",
    agentTurnRequest: request,
    runOneShot: async () => {
      throw new Error("one-shot should not run for app-server driver");
    },
  });

  const turnStart = transport.messages.find((message) => message.method === "turn/start");
  assert.equal(result.ok, true);
  assert.equal(result.args.includes("--image"), true);
  assert.equal(result.args[result.args.indexOf("--image") + 1], imagePath);
  assert.deepEqual(turnStart.params.input[1], { type: "localImage", path: imagePath });
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("Codex app-server driver preserves completed markdown and outbound file manifests", async () => {
  const transport = new FakeCodexAppServerTransport();
  transport.deltaChunks = [
    "给你发一个TOOLS.md文件，里面是小丘的角色分工图和工具使用规范：",
    "```studio-channel-files",
    "[{\"path\":\"workspace/TOOLS.md\",\"name\":\"TOOLS.md\",\"caption\":\"小丘角色分工与工具规范\"}]",
    "```",
  ];
  transport.completedText = [
    "给你发一个 TOOLS.md 文件，里面是小丘的角色分工图和工具使用规范：",
    "",
    "```studio-channel-files",
    "[{\"path\":\"workspace/TOOLS.md\",\"name\":\"TOOLS.md\",\"caption\":\"小丘角色分工与工具规范\"}]",
    "```",
  ].join("\n");
  const session = new CodexAppServerSession({
    sessionId: "session-manifest",
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
    messageId: "m-file",
    agentTurnRequest: agentTurnRequest({ messageId: "m-file", content: "发个文件给我" }),
    onProgress: (event) => progress.push(event),
    runOneShot: async () => {
      throw new Error("one-shot should not run for app-server driver");
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.replyText, transport.completedText);
  assert.match(result.replyText, /：\n\n```studio-channel-files\n\[/);
  assert.equal(progress.some((event) => event.rawType === "item/agentMessage/delta"), false);
  const assistantProgress = progress.filter((event) => event.type === "assistant");
  assert.equal(assistantProgress.length, 1);
  assert.equal(assistantProgress[0].text, transport.completedText);
  assert.equal(assistantProgress[0].phase, "final");
  assert.equal(isChannelConnectorProcessProgressEvent(assistantProgress[0]), false);
});

test("Codex app-server driver preserves tool command output", async () => {
  const transport = new FakeCodexAppServerTransport();
  transport.toolItems = [
    {
      type: "commandExecution",
      command: "cat TOOLS.md",
      exitCode: 0,
      aggregatedOutput: "alpha\n  beta\n\ngamma",
    },
  ];
  const session = new CodexAppServerSession({
    sessionId: "session-tool-output",
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
    messageId: "m-tool",
    agentTurnRequest: agentTurnRequest({ messageId: "m-tool", content: "调用工具" }),
    onProgress: (event) => progress.push(event),
    runOneShot: async () => {
      throw new Error("one-shot should not run for app-server driver");
    },
  });

  const tool = progress.find((event) => event.type === "tool" && event.itemType === "commandExecution");
  assert.equal(result.ok, true);
  assert.ok(tool);
  assert.match(tool.text, /command=cat TOOLS\.md/);
  assert.match(tool.text, /exit=0/);
  assert.match(tool.text, /output:\nalpha\n  beta\n\ngamma/);
});

test("Codex app-server driver maps agent messages before later tools as process progress", async () => {
  const transport = new FakeCodexAppServerTransport();
  transport.completedItems = [
    {
      type: "agentMessage",
      id: "agent-process-1",
      text: "准备执行第一条命令。",
    },
    {
      type: "commandExecution",
      command: "pwd",
      exitCode: 0,
      aggregatedOutput: "/tmp/project",
    },
    {
      type: "agentMessage",
      id: "agent-process-2",
      text: "最终总结。",
    },
  ];
  const session = new CodexAppServerSession({
    sessionId: "session-process-progress",
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
    messageId: "m-process-progress",
    agentTurnRequest: agentTurnRequest({ messageId: "m-process-progress", content: "先说一句，再调用工具" }),
    onProgress: (event) => progress.push(event),
    runOneShot: async () => {
      throw new Error("one-shot should not run for app-server driver");
    },
  });

  const assistantProgress = progress.filter((event) => event.type === "assistant");
  assert.equal(result.ok, true);
  assert.equal(result.replyText, "最终总结。");
  assert.deepEqual(assistantProgress.map((event) => event.text), ["准备执行第一条命令。", "最终总结。"]);
  assert.deepEqual(assistantProgress.map((event) => event.phase), ["intermediate", "final"]);
  assert.equal(isChannelConnectorProcessProgressEvent(assistantProgress[0]), true);
  assert.equal(isChannelConnectorProcessProgressEvent(assistantProgress[1]), false);
  assert.equal(progress.at(-1).type, "completed");
});

test("Codex app-server driver hides internal user prompt echoes from progress", async () => {
  const transport = new FakeCodexAppServerTransport();
  transport.userMessageEchoText = [
    "Recent messages in this IM session before this turn:",
    "user: secret local prompt context",
  ].join("\n");
  transport.completedText = "public assistant reply";
  const session = new CodexAppServerSession({
    sessionId: "session-user-echo",
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
    messageId: "m-user-echo",
    agentTurnRequest: agentTurnRequest({ messageId: "m-user-echo" }),
    onProgress: (event) => progress.push(event),
    runOneShot: async () => {
      throw new Error("one-shot should not run for app-server driver");
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.replyText, "public assistant reply");
  assert.equal(progress.some((event) => /Recent messages in this IM session/.test(event.text || "")), false);
  assert.equal(progress.some((event) => event.itemType === "userMessage"), false);
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

test("Codex app-server driver answers command approval requests through the permission resolver", async () => {
  const transport = new FakeCodexAppServerTransport();
  transport.completeTurns = false;
  const session = new CodexAppServerSession({
    sessionId: "session-command-approval",
    transport,
    model: "gpt-5",
    cwd: "/tmp/project",
    permissionMode: "suggest",
  });
  const progress = [];
  let permissionRequest = null;

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
    messageId: "m-command-approval",
    agentTurnRequest: {
      ...agentTurnRequest({ messageId: "m-command-approval" }),
      resolvePermission: async (request) => {
        permissionRequest = request;
        return { behavior: "allow", updatedInput: request.input };
      },
    },
    onProgress: (event) => progress.push(event),
    runOneShot: async () => {
      throw new Error("one-shot should not run for app-server driver");
    },
  });

  await waitFor(() => transport.messages.find((message) => message.method === "turn/start"));
  transport.emit({
    id: "approval-command-1",
    method: "item/commandExecution/requestApproval",
    params: {
      command: "cat TOOLS.md",
      cwd: "/tmp/project",
    },
  });
  const response = await waitFor(() => transport.messages.find((message) => message.id === "approval-command-1" && message.result));
  assert.equal(permissionRequest.requestId, "approval-command-1");
  assert.equal(permissionRequest.subtype, "item/commandExecution/requestApproval");
  assert.equal(permissionRequest.toolName, "Bash");
  assert.equal(permissionRequest.input.command, "cat TOOLS.md");
  assert.deepEqual(response.result, { decision: "accept" });
  assert.ok(progress.some((event) => event.rawType === "item/commandExecution/requestApproval" && /command=cat TOOLS\.md/.test(event.text || "")));

  emitCodexTurnReply(transport, { text: "command approved" });
  const result = await run;
  assert.equal(result.ok, true);
  assert.equal(result.replyText, "command approved");
});

test("Codex app-server driver answers file-change approval denial", async () => {
  const transport = new FakeCodexAppServerTransport();
  transport.completeTurns = false;
  const session = new CodexAppServerSession({
    sessionId: "session-file-approval",
    transport,
    model: "gpt-5",
    cwd: "/tmp/project",
    permissionMode: "suggest",
  });
  let permissionRequest = null;

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
    messageId: "m-file-approval",
    agentTurnRequest: {
      ...agentTurnRequest({ messageId: "m-file-approval" }),
      resolvePermission: async (request) => {
        permissionRequest = request;
        return { behavior: "deny", message: "no patch" };
      },
    },
    runOneShot: async () => {
      throw new Error("one-shot should not run for app-server driver");
    },
  });

  await waitFor(() => transport.messages.find((message) => message.method === "turn/start"));
  transport.emit({
    id: "approval-file-1",
    method: "item/fileChange/requestApproval",
    params: {
      reason: "modify package files",
      changes: [{ path: "package.json" }],
    },
  });
  const response = await waitFor(() => transport.messages.find((message) => message.id === "approval-file-1" && message.result));
  assert.equal(permissionRequest.toolName, "Patch");
  assert.equal(permissionRequest.input.reason, "modify package files");
  assert.deepEqual(response.result, { decision: "decline" });

  emitCodexTurnReply(transport, { text: "file denied" });
  const result = await run;
  assert.equal(result.ok, true);
  assert.equal(result.replyText, "file denied");
});

test("Codex app-server driver answers permissions approval with turn-scoped permissions", async () => {
  const transport = new FakeCodexAppServerTransport();
  transport.completeTurns = false;
  const session = new CodexAppServerSession({
    sessionId: "session-permissions-approval",
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
    messageId: "m-permissions-approval",
    agentTurnRequest: {
      ...agentTurnRequest({ messageId: "m-permissions-approval" }),
      resolvePermission: async (request) => {
        assert.equal(request.toolName, "Permissions");
        assert.deepEqual(request.input.permissions, { network: true });
        return { behavior: "allow", updatedInput: request.input };
      },
    },
    runOneShot: async () => {
      throw new Error("one-shot should not run for app-server driver");
    },
  });

  await waitFor(() => transport.messages.find((message) => message.method === "turn/start"));
  transport.emit({
    id: "approval-permissions-1",
    method: "item/permissions/requestApproval",
    params: {
      permissions: { network: true },
      reason: "fetch dependency metadata",
    },
  });
  const response = await waitFor(() => transport.messages.find((message) => message.id === "approval-permissions-1" && message.result));
  assert.deepEqual(response.result, {
    permissions: { network: true },
    scope: "turn",
  });

  emitCodexTurnReply(transport, { text: "permissions approved" });
  const result = await run;
  assert.equal(result.ok, true);
  assert.equal(result.replyText, "permissions approved");
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
  assert.equal(result.ok, false);
  assert.equal(result.status, "cancelled");
  assert.match(result.error, /cancelled/);
  assert.equal(transport.messages.filter((message) => message.method === "turn/interrupt").length, 1);
  assert.equal(transport.messages.find((message) => message.method === "turn/interrupt").params.turnId, "turn-1");
});

test("Codex app-server driver treats turn timeout as an idle timeout", async () => {
  const transport = new FakeCodexAppServerTransport();
  transport.completeTurns = false;
  const session = new CodexAppServerSession({
    sessionId: "session-turn-idle-timeout",
    transport,
    model: "gpt-5.5",
    cwd: "/tmp/project",
    permissionMode: "suggest",
    turnTimeoutMs: 35,
  });
  const progress = [];

  const run = session.runTurn({
    mode: "persistent",
    key: {
      bindingId: "octo-codex",
      projectId: "codex-app-server",
      sessionKey: "dmwork:dm:user-1",
      agent: "codex",
      model: "gpt-5.5",
      workDir: "/tmp/project",
    },
    messageId: "m-turn-idle-timeout",
    agentTurnRequest: agentTurnRequest({ messageId: "m-turn-idle-timeout", model: "gpt-5.5" }),
    onProgress: (event) => progress.push(event),
    runOneShot: async () => {
      throw new Error("one-shot should not run for app-server driver");
    },
  });

  await waitFor(() => transport.messages.find((message) => message.method === "turn/start"));
  await sleep(0);
  transport.emit({
    method: "turn/started",
    params: {
      threadId: transport.nextThreadId,
      turn: { id: "turn-1", status: "running" },
    },
  });
  await sleep(25);
  transport.emit({
    method: "item/completed",
    params: {
      threadId: transport.nextThreadId,
      turnId: "turn-1",
      item: {
        type: "agentMessage",
        id: "agent-1",
        text: "long turn is still working",
      },
    },
  });
  await sleep(25);
  transport.emit({
    method: "item/completed",
    params: {
      threadId: transport.nextThreadId,
      turnId: "turn-1",
      item: {
        type: "commandExecution",
        id: "tool-1",
        command: "printf ok",
        exitCode: 0,
        aggregatedOutput: "ok",
      },
    },
  });
  await sleep(25);
  transport.emit({
    method: "turn/completed",
    params: {
      threadId: transport.nextThreadId,
      turn: { id: "turn-1", status: "completed" },
    },
  });

  const result = await run;
  assert.equal(result.ok, true);
  assert.equal(result.replyText, "long turn is still working");
  assert.equal(transport.messages.filter((message) => message.method === "turn/interrupt").length, 0);
  assert.equal(progress.some((event) => event.rawType === "turn/timeout"), false);
  assert.ok(progress.some((event) => event.type === "tool" && /output:\nok/.test(event.text)));
});

test("Codex app-server driver times out unfinished turns and sends interrupt", async () => {
  const transport = new FakeCodexAppServerTransport();
  transport.emitTurnCompleted = false;
  transport.completedText = "assistant output before stall";
  const session = new CodexAppServerSession({
    sessionId: "session-turn-timeout",
    transport,
    model: "gpt-5",
    cwd: "/tmp/project",
    permissionMode: "suggest",
    turnTimeoutMs: 5,
  });
  const progress = [];

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
      messageId: "m-turn-timeout",
      agentTurnRequest: agentTurnRequest({ messageId: "m-turn-timeout" }),
      onProgress: (event) => progress.push(event),
      runOneShot: async () => {
        throw new Error("one-shot fallback is owned by the outer session pool");
      },
    }),
    /timed out/,
  );

  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(transport.messages.filter((message) => message.method === "turn/interrupt").length, 1);
  assert.equal(transport.messages.find((message) => message.method === "turn/interrupt").params.reason, "turn-timeout");
  assert.ok(progress.some((event) => event.rawType === "turn/timeout" && event.type === "failed"));
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
