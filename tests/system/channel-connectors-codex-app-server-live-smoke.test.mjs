import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  CodexAppServerSession,
  JsonLineCodexAppServerTransport,
} from "../../dist/apps/api/modules/channel-connectors/codex-app-server-driver.js";

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function envValue(...names) {
  for (const name of names) {
    const value = normalizeString(process.env[name]);
    if (value) return value;
  }
  return "";
}

function tomlString(value) {
  return JSON.stringify(value);
}

function readGatewayClientKeyFromFile(filePath) {
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return normalizeString(raw?.secrets?.["gateway:client-api-key"]?.value);
  } catch {
    return "";
  }
}

function readGatewayClientKey() {
  const envKey = envValue(
    "TRACEVANE_CODEX_APP_SERVER_LIVE_GATEWAY_KEY",
    "TRACEVANE_GATEWAY_API_KEY",
    "OPENCLAW_TRACEVANE_GATEWAY_API_KEY",
    "STUDIO_CODEX_APP_SERVER_LIVE_GATEWAY_KEY",
    "STUDIO_GATEWAY_API_KEY",
    "OPENCLAW_STUDIO_GATEWAY_API_KEY",
  );
  if (envKey) return envKey;
  const home = normalizeString(process.env.HOME) || os.homedir();
  const candidates = [
    path.join(home, ".openclaw", "studio", "model-gateway", "secrets.json"),
    path.join(home, ".config", "openclaw-studio", "model-gateway", "secrets.json"),
  ];
  for (const candidate of candidates) {
    const key = readGatewayClientKeyFromFile(candidate);
    if (key) return key;
  }
  return "";
}

function liveGatewayConfig() {
  return {
    endpoint: envValue(
      "TRACEVANE_CODEX_APP_SERVER_LIVE_GATEWAY_ENDPOINT",
      "TRACEVANE_GATEWAY_ENDPOINT",
      "STUDIO_CODEX_APP_SERVER_LIVE_GATEWAY_ENDPOINT",
      "STUDIO_GATEWAY_ENDPOINT",
    )
      || "http://127.0.0.1:18796/v1",
    key: readGatewayClientKey(),
    model: envValue("TRACEVANE_CODEX_APP_SERVER_LIVE_MODEL", "STUDIO_CODEX_APP_SERVER_LIVE_MODEL") || "gpt-5.4-mini",
    cwd: envValue("TRACEVANE_CODEX_APP_SERVER_LIVE_CWD", "STUDIO_CODEX_APP_SERVER_LIVE_CWD") || process.cwd(),
  };
}

function liveSkip(flagName) {
  const legacyFlagName = flagName.replace(/^TRACEVANE_/, "STUDIO_");
  if (process.env[flagName] !== "1" && process.env[legacyFlagName] !== "1") return `set ${flagName}=1 to run this live Codex app-server smoke`;
  const config = liveGatewayConfig();
  if (!config.key) return "local Tracevane Gateway client key is unavailable";
  return false;
}

function prepareCodexHome(input) {
  fs.rmSync(input.codexHome, { recursive: true, force: true });
  fs.mkdirSync(input.codexHome, { recursive: true, mode: 0o700 });
  const config = [
    "model_provider = \"tracevane_gateway\"",
    `model = ${tomlString(input.model)}`,
    "model_reasoning_effort = \"low\"",
    "responses_websockets = false",
    "responses_websockets_v2 = false",
    "",
    "[model_providers.tracevane_gateway]",
    "name = \"Tracevane Gateway\"",
    `base_url = ${tomlString(input.endpoint)}`,
    "wire_api = \"responses\"",
    "supports_websockets = false",
    "requires_openai_auth = true",
    `experimental_bearer_token = ${tomlString(input.key)}`,
    "responses_websockets_v2 = false",
    "",
  ].join("\n");
  fs.writeFileSync(path.join(input.codexHome, "config.toml"), config, { encoding: "utf8", mode: 0o600 });
}

function createCollector(transport) {
  const messages = [];
  const waiters = [];
  transport.onMessage((message) => {
    if (message.method) messages.push(message);
    for (const waiter of waiters.slice()) {
      if (!waiter.predicate(message)) continue;
      clearTimeout(waiter.timer);
      waiters.splice(waiters.indexOf(waiter), 1);
      waiter.resolve(message);
    }
  });
  return {
    messages,
    waitFor(predicate, timeoutMs, label) {
      const existing = messages.find(predicate);
      if (existing) return Promise.resolve(existing);
      return new Promise((resolve, reject) => {
        const waiter = {
          predicate,
          resolve,
          timer: setTimeout(() => {
            const index = waiters.indexOf(waiter);
            if (index !== -1) waiters.splice(index, 1);
            reject(new Error(`Timed out waiting for ${label}`));
          }, timeoutMs),
        };
        waiters.push(waiter);
      });
    },
  };
}

function captureSentMessages(transport) {
  const sent = [];
  const send = transport.send.bind(transport);
  transport.send = (message) => {
    sent.push(message);
    send(message);
  };
  return sent;
}

function request(transport, method, params, timeoutMs = 10_000) {
  const id = request.nextId;
  request.nextId += 1;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timed out waiting for ${method}`));
    }, timeoutMs);
    const onMessage = (message) => {
      if (message.id !== id) return;
      clearTimeout(timer);
      if (message.error) {
        reject(new Error(message.error.message || `${method} failed`));
        return;
      }
      resolve(message.result || {});
    };
    transport.onMessage(onMessage);
    transport.send({ id, method, params });
  });
}
request.nextId = 1;

function liveAgentTurnRequest(input) {
  const project = {
    id: "codex-live-app-server",
    name: "Codex Live App Server",
    agent: "codex",
    model: input.model,
    workDir: input.cwd,
    permissionMode: input.permissionMode || "read-only",
    gatewayEndpoint: input.endpoint,
    gatewayKeyRef: "tracevane-gateway-client-key",
    appProfileRef: "codex",
    platformBindings: [],
  };
  const binding = {
    id: "live-codex-app-server",
    platform: "octo",
    accountId: "live",
    botId: "live",
    displayName: "Live Codex App Server",
    agent: "codex",
    enabled: true,
    allowlist: [],
    adminUsers: [],
    metadata: {},
  };
  return {
    project,
    binding,
    message: {
      messageId: input.messageId,
      fromUid: "live-user",
      channelId: "live-user",
      channelType: 1,
      payload: {
        type: 1,
        content: input.content,
      },
    },
    sessionKey: "live:dm:codex-app-server",
    gatewayEndpoint: input.endpoint,
    gatewayClientKey: input.key,
    nativeCommand: null,
  };
}

async function initializeThread(input) {
  const initialize = await request(input.transport, "initialize", {
    clientInfo: {
      name: "openclaw-tracevane-channel-connectors-live-smoke",
      title: "Tracevane Channel Connectors Live Smoke",
      version: "0",
    },
    capabilities: {
      experimentalApi: true,
      requestAttestation: false,
      optOutNotificationMethods: [],
    },
  });
  assert.equal(typeof initialize.userAgent, "string");
  assert.equal(initialize.codexHome, input.codexHome);

  input.transport.send({ method: "initialized" });
  const thread = await request(input.transport, "thread/start", {
    model: input.model,
    cwd: input.cwd,
    approvalPolicy: "never",
    sandbox: "read-only",
    serviceName: "openclaw-tracevane-channel-connectors-live-smoke",
    ephemeral: true,
    threadSource: "user",
  });
  assert.equal(typeof thread.thread?.id, "string");
  assert.equal(thread.thread.cwd, input.cwd);
  assert.equal(thread.approvalPolicy, "never");
  assert.equal(thread.sandbox?.type, "readOnly");
  return thread.thread.id;
}

async function runExactReplyTurn(input) {
  let replyText = "";
  input.transport.onMessage((message) => {
    if (message.method !== "item/agentMessage/delta") return;
    const params = message.params || {};
    replyText += normalizeString(params.delta);
  });
  const response = await request(input.transport, "turn/start", {
    threadId: input.threadId,
    clientUserMessageId: input.messageId,
    input: [
      {
        type: "text",
        text: "Reply with exactly: studio-live-ok",
        text_elements: [],
      },
    ],
    cwd: input.cwd,
    model: input.model,
    approvalPolicy: "never",
    sandboxPolicy: { type: "readOnly", networkAccess: true },
  }, 20_000);
  const turnId = normalizeString(response.turn?.id);
  assert.ok(turnId);
  await input.collector.waitFor((message) => {
    if (message.method !== "turn/completed") return false;
    return normalizeString(message.params?.turn?.id) === turnId
      && normalizeString(message.params?.turn?.status) === "completed";
  }, 120_000, "live turn completion");
  assert.equal(replyText.trim(), "studio-live-ok");
  assert.ok(input.collector.messages.some((message) => message.method === "thread/tokenUsage/updated"));
  assert.ok(input.collector.messages.some((message) => message.method === "item/agentMessage/delta"));
  return turnId;
}

test("live Codex app-server accepts Tracevane persistent-session handshake", {
  skip: process.env.TRACEVANE_CODEX_APP_SERVER_LIVE === "1" || process.env.STUDIO_CODEX_APP_SERVER_LIVE === "1"
    ? false
    : "set TRACEVANE_CODEX_APP_SERVER_LIVE=1 to run against the local codex binary",
}, async () => {
  const codexHome = process.env.TRACEVANE_CODEX_APP_SERVER_LIVE_HOME
    || process.env.STUDIO_CODEX_APP_SERVER_LIVE_HOME
    || "/tmp/openclaw-studio-codex-appserver-live-home";
  fs.mkdirSync(codexHome, { recursive: true });
  const cwd = process.env.TRACEVANE_CODEX_APP_SERVER_LIVE_CWD || process.env.STUDIO_CODEX_APP_SERVER_LIVE_CWD || process.cwd();
  const transport = new JsonLineCodexAppServerTransport({
    cwd,
    env: {
      CODEX_HOME: codexHome,
    },
  });

  try {
    const initialize = await request(transport, "initialize", {
      clientInfo: {
        name: "openclaw-tracevane-channel-connectors-live-smoke",
        title: "Tracevane Channel Connectors Live Smoke",
        version: "0",
      },
      capabilities: {
        experimentalApi: true,
        requestAttestation: false,
        optOutNotificationMethods: [],
      },
    });
    assert.equal(typeof initialize.userAgent, "string");
    assert.equal(initialize.codexHome, codexHome);

    transport.send({ method: "initialized" });
    const thread = await request(transport, "thread/start", {
      model: process.env.TRACEVANE_CODEX_APP_SERVER_LIVE_MODEL || process.env.STUDIO_CODEX_APP_SERVER_LIVE_MODEL || "gpt-5",
      cwd,
      approvalPolicy: "never",
      sandbox: "read-only",
      serviceName: "openclaw-tracevane-channel-connectors-live-smoke",
      ephemeral: true,
      threadSource: "user",
    });
    assert.equal(typeof thread.thread?.id, "string");
    assert.equal(thread.thread.cwd, cwd);
    assert.equal(thread.approvalPolicy, "never");
    assert.equal(thread.sandbox?.type, "readOnly");
  } finally {
    transport.close("dispose");
  }
});

test("live Codex app-server completes a real turn through Tracevane Gateway", {
  skip: liveSkip("TRACEVANE_CODEX_APP_SERVER_LIVE_TURN"),
}, async () => {
  const config = liveGatewayConfig();
  const codexHome = envValue("TRACEVANE_CODEX_APP_SERVER_LIVE_TURN_HOME", "STUDIO_CODEX_APP_SERVER_LIVE_TURN_HOME")
    || "/tmp/openclaw-studio-codex-appserver-live-turn-test-home";
  prepareCodexHome({ codexHome, ...config });
  const transport = new JsonLineCodexAppServerTransport({
    cwd: config.cwd,
    env: {
      CODEX_HOME: codexHome,
    },
  });
  const collector = createCollector(transport);

  try {
    const threadId = await initializeThread({ transport, codexHome, cwd: config.cwd, model: config.model });
    await runExactReplyTurn({
      transport,
      collector,
      threadId,
      cwd: config.cwd,
      model: config.model,
      messageId: "studio-live-turn",
    });
  } finally {
    transport.close("dispose");
  }
});

test("live Codex app-server completes native compact through Tracevane Gateway", {
  skip: liveSkip("TRACEVANE_CODEX_APP_SERVER_LIVE_COMPACT"),
}, async () => {
  const config = liveGatewayConfig();
  const codexHome = envValue("TRACEVANE_CODEX_APP_SERVER_LIVE_COMPACT_HOME", "STUDIO_CODEX_APP_SERVER_LIVE_COMPACT_HOME")
    || "/tmp/openclaw-studio-codex-appserver-live-compact-test-home";
  prepareCodexHome({ codexHome, ...config });
  const transport = new JsonLineCodexAppServerTransport({
    cwd: config.cwd,
    env: {
      CODEX_HOME: codexHome,
    },
  });
  const collector = createCollector(transport);

  try {
    const threadId = await initializeThread({ transport, codexHome, cwd: config.cwd, model: config.model });
    await runExactReplyTurn({
      transport,
      collector,
      threadId,
      cwd: config.cwd,
      model: config.model,
      messageId: "studio-live-compact-prep",
    });

    await request(transport, "thread/compact/start", { threadId }, 20_000);
    const compactSignal = await collector.waitFor((message) => {
      if (message.method === "thread/compacted") return true;
      if (message.method !== "item/completed") return false;
      return normalizeString(message.params?.item?.type) === "contextCompaction";
    }, 120_000, "live compact contextCompaction");
    if (compactSignal.method !== "thread/compacted") {
      const compactTurnId = normalizeString(compactSignal.params?.turnId);
      assert.ok(compactTurnId);
      await collector.waitFor((message) => {
        if (message.method !== "turn/completed") return false;
        return normalizeString(message.params?.turn?.id) === compactTurnId
          && normalizeString(message.params?.turn?.status) === "completed";
      }, 120_000, "live compact turn completion");
    }
  } finally {
    transport.close("dispose");
  }
});

test("live Codex app-server interrupts an active Tracevane Gateway turn", {
  skip: liveSkip("TRACEVANE_CODEX_APP_SERVER_LIVE_INTERRUPT"),
}, async () => {
  const config = liveGatewayConfig();
  const codexHome = envValue("TRACEVANE_CODEX_APP_SERVER_LIVE_INTERRUPT_HOME", "STUDIO_CODEX_APP_SERVER_LIVE_INTERRUPT_HOME")
    || "/tmp/openclaw-studio-codex-appserver-live-interrupt-test-home";
  prepareCodexHome({ codexHome, ...config });
  const transport = new JsonLineCodexAppServerTransport({
    cwd: config.cwd,
    env: {
      CODEX_HOME: codexHome,
    },
  });
  const collector = createCollector(transport);
  const sent = captureSentMessages(transport);
  const session = new CodexAppServerSession({
    sessionId: "live-interrupt-session",
    transport,
    model: config.model,
    cwd: config.cwd,
    permissionMode: "yolo",
    requestTimeoutMs: 20_000,
  });
  const abortController = new AbortController();

  try {
    const run = session.runTurn({
      mode: "persistent",
      key: {
        bindingId: "live-codex-app-server",
        projectId: "codex-live-app-server",
        sessionKey: "live:dm:codex-app-server",
        agent: "codex",
        model: config.model,
        workDir: config.cwd,
        permissionMode: "yolo",
      },
      messageId: "studio-live-interrupt",
      agentTurnRequest: liveAgentTurnRequest({
        ...config,
        messageId: "studio-live-interrupt",
        permissionMode: "yolo",
        content: "Run this exact shell command now and do not reply until it exits: sleep 60",
      }),
      signal: abortController.signal,
      runOneShot: async () => {
        throw new Error("live interrupt smoke must not fall back to one-shot");
      },
    });

    await collector.waitFor((message) => message.method === "turn/started", 60_000, "live interrupt turn start");
    abortController.abort();
    const result = await run;
    assert.equal(result.status, "cancelled");
    assert.equal(result.ok, false);
    assert.match(result.error, /cancelled|interrupted/);
    assert.ok(sent.some((message) => message.method === "turn/interrupt"));
    assert.ok(collector.messages.some((message) => {
      if (message.method !== "turn/completed") return false;
      const status = normalizeString(message.params?.turn?.status);
      return status === "cancelled" || status === "interrupted";
    }));
  } finally {
    session.dispose("dispose");
  }
});
