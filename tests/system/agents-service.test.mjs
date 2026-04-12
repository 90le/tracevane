import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  buildAgentRosterSummary,
  buildAgentWorkspaceSummary,
  createAgentsService,
} from "../../dist/apps/api/modules/agents/service.js";

function makeTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "studio-agents-service-"));
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeText(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, value, "utf8");
}

function createStudioConfig(root) {
  return {
    pluginId: "studio",
    pluginName: "OpenClaw Studio",
    version: "0.1.0",
    port: 3760,
    autoStart: true,
    openclawRoot: root,
    openclawConfigFile: path.join(root, "openclaw.json"),
    projectRoot: "/tmp/openclaw-studio-extension",
    webDistDir: "/tmp/openclaw-studio-extension/apps/web-vue/dist",
    gatewayPort: 31879,
    gatewayWsUrl: "ws://127.0.0.1:31879",
    gatewayControlUiBasePath: "",
    transport: {
      standalone: { enabled: true, port: 3760 },
      gateway: { enabled: true, basePath: "/studio" },
    },
  };
}

function seedAgent(root, agentId, identityMarkdown) {
  const workspace =
    agentId === "main"
      ? path.join(root, "workspace")
      : path.join(root, `workspace-${agentId}`);
  writeText(path.join(workspace, "IDENTITY.md"), identityMarkdown);
  writeJson(
    path.join(root, "agents", agentId, "sessions", "sessions.json"),
    {},
  );
  return workspace;
}

test("buildAgentRosterSummary marks default rail and keeps descending activity order", () => {
  const summary = buildAgentRosterSummary({
    agents: [
      {
        id: "writer",
        isDefault: false,
        lastActiveAt: "2026-04-09T10:00:00.000Z",
      },
      {
        id: "main",
        isDefault: true,
        lastActiveAt: "2026-04-11T10:00:00.000Z",
      },
      {
        id: "ops",
        isDefault: false,
        lastActiveAt: "2026-04-10T10:00:00.000Z",
      },
    ],
    defaultAgentId: "main",
  });

  assert.deepEqual(
    summary.defaultRailAgents.map((agent) => agent.id),
    ["main"],
  );
  assert.deepEqual(
    summary.regularRailAgents.map((agent) => agent.id),
    ["ops", "writer"],
  );
  assert.deepEqual(summary.order.map((agent) => agent.id), [
    "main",
    "ops",
    "writer",
  ]);
});

test("buildAgentWorkspaceSummary returns selected context and stage counts", () => {
  const summary = buildAgentWorkspaceSummary({
    selectedAgentId: "main",
    detail: {
      bindings: [{ id: "b1" }, { id: "b2" }],
      docs: [{ name: "IDENTITY.md" }],
      recentSessions: [{ id: "s1" }, { id: "s2" }, { id: "s3" }],
    },
  });

  assert.equal(summary.selectedAgentId, "main");
  assert.equal(summary.hasSelection, true);
  assert.equal(summary.stageCounts.bindings, 2);
  assert.equal(summary.stageCounts.docs, 1);
  assert.equal(summary.stageCounts.sessions, 3);
});

test("agent detail exposes advanced 4.8 fields and raw config snapshot", () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  seedAgent(
    root,
    "main",
    [
      "# IDENTITY.md",
      "",
      "- **Name:** Main Agent",
      "- **Role:** Primary executor",
      "- **Emoji:** 🤖",
      "- **Style:** decisive",
      "- **Theme:** bold-console",
      "",
      "## Mission",
      "",
      "Ship production-ready changes.",
      "",
    ].join("\n"),
  );

  writeJson(config.openclawConfigFile, {
    agents: {
      defaults: {
        model: {
          primary: "openai/gpt-5.4",
          fallbacks: ["openai/gpt-5.4-mini"],
        },
        thinkingDefault: "adaptive",
        verboseDefault: "full",
      },
      list: [
        {
          id: "main",
          name: "Main Agent",
          model: {
            primary: "openai/gpt-5.4",
            fallbacks: ["openai/gpt-5.4-mini"],
          },
          workspace: path.join(root, "workspace"),
          sandbox: {
            mode: "all",
            workspaceAccess: "rw",
            backend: "docker",
            scope: "agent",
          },
          tools: {
            profile: "coding",
            fs: { workspaceOnly: true },
            allow: ["web.search"],
          },
          thinkingDefault: "high",
          verboseDefault: "on",
          reasoningDefault: "stream",
          fastModeDefault: true,
          systemPromptOverride: "You are precise.",
          skills: ["agent-browser", "webapp-testing"],
          memorySearch: { enabled: true, topK: 8 },
          humanDelay: { mode: "natural", minMs: 800, maxMs: 2500 },
          heartbeat: { every: "30m" },
          groupChat: { replyToMentionsOnly: true },
          subagents: { allowAgents: ["writer"] },
          params: { temperature: 0.2 },
        },
      ],
    },
  });

  const service = createAgentsService(config);
  const detail = service.getDetail("main");

  assert.ok(detail);
  assert.equal(detail.agent.model, "openai/gpt-5.4 (+1)");
  assert.equal(detail.agent.identity.theme, "bold-console");
  assert.deepEqual(detail.editor.modelRaw, {
    primary: "openai/gpt-5.4",
    fallbacks: ["openai/gpt-5.4-mini"],
  });
  assert.equal(detail.editor.systemPromptOverride, "You are precise.");
  assert.deepEqual(detail.editor.skills, ["agent-browser", "webapp-testing"]);
  assert.deepEqual(detail.editor.memorySearch, { enabled: true, topK: 8 });
  assert.deepEqual(detail.editor.humanDelay, {
    mode: "natural",
    minMs: 800,
    maxMs: 2500,
  });
  assert.deepEqual(detail.editor.heartbeat, { every: "30m" });
  assert.deepEqual(detail.editor.groupChat, { replyToMentionsOnly: true });
  assert.deepEqual(detail.editor.subagents, { allowAgents: ["writer"] });
  assert.deepEqual(detail.editor.params, { temperature: 0.2 });
  assert.equal(detail.rawConfig.systemPromptOverride, "You are precise.");
});

test("agent update preserves object model configs and advanced fields", () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  seedAgent(
    root,
    "main",
    "# IDENTITY.md\n\n- **Name:** Main Agent\n\n## Mission\n\nShip.\n",
  );

  writeJson(config.openclawConfigFile, {
    agents: {
      list: [
        {
          id: "main",
          name: "Main Agent",
          model: {
            primary: "openai/gpt-5.4",
            fallbacks: ["openai/gpt-5.4-mini"],
          },
          workspace: path.join(root, "workspace"),
          sandbox: {
            mode: "all",
            workspaceAccess: "rw",
            backend: "docker",
            scope: "agent",
          },
          tools: {
            profile: "coding",
            fs: { workspaceOnly: true },
            allow: ["web.search"],
          },
          systemPromptOverride: "Old prompt",
          skills: ["agent-browser"],
          memorySearch: { enabled: true },
        },
      ],
    },
  });

  const service = createAgentsService(config);
  service.updateAgent("main", {
    name: "Main Agent Updated",
    modelRaw: {
      primary: "openai/gpt-5.4",
      fallbacks: ["openai/gpt-5.4-mini"],
    },
    sandboxMode: "all",
    workspaceAccess: "rw",
    sandboxRaw: {
      backend: "docker",
      scope: "agent",
    },
    toolsProfile: "coding",
    fsWorkspaceOnly: true,
    toolsRaw: {
      allow: ["web.search", "web.open"],
    },
    systemPromptOverride: "New prompt",
    skills: ["agent-browser", "webapp-testing"],
    memorySearch: { enabled: true, topK: 16 },
    humanDelay: { mode: "natural", minMs: 500, maxMs: 1200 },
    heartbeat: { every: "10m" },
    groupChat: { replyToMentionsOnly: true },
    subagents: { allowAgents: ["writer", "reviewer"] },
    params: { temperature: 0.1 },
  });

  const nextConfig = JSON.parse(
    fs.readFileSync(config.openclawConfigFile, "utf8"),
  );
  const nextAgent = nextConfig.agents.list[0];
  assert.deepEqual(nextAgent.model, {
    primary: "openai/gpt-5.4",
    fallbacks: ["openai/gpt-5.4-mini"],
  });
  assert.equal(nextAgent.systemPromptOverride, "New prompt");
  assert.deepEqual(nextAgent.skills, ["agent-browser", "webapp-testing"]);
  assert.deepEqual(nextAgent.memorySearch, { enabled: true, topK: 16 });
  assert.deepEqual(nextAgent.humanDelay, {
    mode: "natural",
    minMs: 500,
    maxMs: 1200,
  });
  assert.deepEqual(nextAgent.heartbeat, { every: "10m" });
  assert.deepEqual(nextAgent.groupChat, { replyToMentionsOnly: true });
  assert.deepEqual(nextAgent.subagents, {
    allowAgents: ["writer", "reviewer"],
  });
  assert.deepEqual(nextAgent.params, { temperature: 0.1 });
  assert.equal(nextAgent.sandbox.backend, "docker");
  assert.equal(nextAgent.sandbox.scope, "agent");
  assert.equal(nextAgent.sandbox.mode, "all");
  assert.equal(nextAgent.tools.profile, "coding");
  assert.equal(nextAgent.tools.fs.workspaceOnly, true);
  assert.deepEqual(nextAgent.tools.allow, ["web.search", "web.open"]);
});

test("agent create supports advanced identity and model overrides", () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  writeJson(config.openclawConfigFile, { agents: { list: [] } });

  const service = createAgentsService(config);
  service.createAgent({
    id: "writer",
    name: "Writer",
    modelRaw: {
      primary: "openai/gpt-5.4",
      fallbacks: ["openai/gpt-5.4-mini"],
    },
    systemPromptOverride: "Write clearly.",
    skills: ["webapp-testing"],
    identity: {
      name: "Writer",
      theme: "calm-minimal",
      mission: "Draft and refine user-facing copy.",
    },
  });

  const nextConfig = JSON.parse(
    fs.readFileSync(config.openclawConfigFile, "utf8"),
  );
  const writer = nextConfig.agents.list.find((agent) => agent.id === "writer");
  assert.deepEqual(writer.model, {
    primary: "openai/gpt-5.4",
    fallbacks: ["openai/gpt-5.4-mini"],
  });
  assert.equal(writer.systemPromptOverride, "Write clearly.");
  assert.deepEqual(writer.skills, ["webapp-testing"]);

  const identityDoc = fs.readFileSync(
    path.join(root, "workspace-writer", "IDENTITY.md"),
    "utf8",
  );
  assert.match(identityDoc, /Theme:\*\* calm-minimal/);
  assert.match(identityDoc, /Draft and refine user-facing copy\./);
});

test("agents summary and detail expose synthetic default agent when no agents list exists", () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  seedAgent(
    root,
    "main",
    "# IDENTITY.md\n\n- **Name:** Main Agent\n\n## Mission\n\nShip.\n",
  );
  writeJson(config.openclawConfigFile, {
    agents: {
      defaults: {
        model: {
          primary: "openai/gpt-5.4",
        },
        workspace: path.join(root, "workspace"),
        sandbox: {
          mode: "off",
          workspaceAccess: "rw",
        },
      },
    },
  });

  const service = createAgentsService(config);
  const summary = service.getSummary();
  const detail = service.getDetail("main");

  assert.equal(summary.defaultAgentId, "main");
  assert.equal(summary.count, 1);
  assert.equal(summary.agents[0]?.id, "main");
  assert.equal(summary.agents[0]?.model, "openai/gpt-5.4");
  assert.ok(detail);
  assert.equal(detail.agent.id, "main");
  assert.equal(detail.agent.workspace, path.join(root, "workspace"));
});

test("agent delete is conservative by default and keeps workspace and agentDir", () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  const workspace = path.join(root, "workspace-writer");
  const agentDir = path.join(root, "agents", "writer", "agent");
  const sessionsDir = path.join(root, "agents", "writer", "sessions");
  const logsDir = path.join(root, "agents", "writer", "logs");

  writeText(path.join(workspace, "IDENTITY.md"), "# IDENTITY.md\n");
  writeText(path.join(agentDir, "agent.json"), "{}");
  writeJson(path.join(sessionsDir, "sessions.json"), {
    one: { sessionId: "one" },
  });
  writeText(path.join(logsDir, "runtime.log"), "ok");
  writeJson(config.openclawConfigFile, {
    agents: {
      list: [
        {
          id: "writer",
          name: "Writer",
          workspace,
          agentDir,
        },
      ],
    },
    bindings: [
      { agentId: "writer", type: "route", match: { channel: "webchat" } },
    ],
  });

  const service = createAgentsService(config);
  const result = service.deleteAgent("writer");

  const nextConfig = JSON.parse(
    fs.readFileSync(config.openclawConfigFile, "utf8"),
  );
  assert.equal(nextConfig.agents.list.length, 0);
  assert.equal((nextConfig.bindings || []).length, 0);
  assert.equal(fs.existsSync(workspace), true);
  assert.equal(fs.existsSync(agentDir), true);
  assert.equal(fs.existsSync(sessionsDir), false);
  assert.equal(fs.existsSync(logsDir), false);
  assert.equal(result.deletion?.options.deleteWorkspace, false);
  assert.equal(result.deletion?.options.deleteAgentDir, false);
  assert.ok(result.message.includes("preserved: workspace, agentDir"));
});

test("agent delete removes workspace and agentDir when explicitly requested", () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  const workspace = path.join(root, "workspace-reviewer");
  const agentDir = path.join(root, "agents", "reviewer", "agent");

  writeText(path.join(workspace, "IDENTITY.md"), "# IDENTITY.md\n");
  writeText(path.join(agentDir, "agent.json"), "{}");
  writeJson(
    path.join(root, "agents", "reviewer", "sessions", "sessions.json"),
    {},
  );
  writeText(path.join(root, "agents", "reviewer", "logs", "runtime.log"), "ok");
  writeJson(config.openclawConfigFile, {
    agents: {
      list: [
        {
          id: "reviewer",
          name: "Reviewer",
          workspace,
          agentDir,
        },
      ],
    },
  });

  const service = createAgentsService(config);
  const result = service.deleteAgent("reviewer", {
    deleteWorkspace: true,
    deleteAgentDir: true,
  });

  assert.equal(fs.existsSync(workspace), false);
  assert.equal(fs.existsSync(agentDir), false);
  assert.equal(fs.existsSync(path.join(root, "agents", "reviewer")), false);
  assert.equal(result.deletion?.options.deleteWorkspace, true);
  assert.equal(result.deletion?.options.deleteAgentDir, true);
  assert.ok(result.message.includes("deleted:"));
});

test("agent bindings expose stable ids and preserve team and role match facets", () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  seedAgent(
    root,
    "main",
    "# IDENTITY.md\n\n- **Name:** Main Agent\n\n## Mission\n\nShip.\n",
  );

  writeJson(config.openclawConfigFile, {
    agents: {
      list: [
        {
          id: "main",
          name: "Main Agent",
          workspace: path.join(root, "workspace"),
        },
      ],
    },
    channels: {
      slack: {
        enabled: true,
        accounts: {
          ops: {
            enabled: true,
          },
        },
      },
    },
    bindings: [
      {
        agentId: "main",
        match: {
          channel: "slack",
          accountId: "ops",
          teamId: "team-1",
          roles: ["ops", "triage"],
          peer: {
            kind: "channel",
            id: "C-1",
          },
        },
      },
    ],
  });

  const service = createAgentsService(config);
  const detail = service.getDetail("main");

  assert.ok(detail);
  assert.equal(detail.bindings.length, 1);
  assert.notEqual(detail.bindings[0].id, "0");
  assert.equal(detail.bindings[0].teamId, "team-1");
  assert.deepEqual(detail.bindings[0].roles, ["ops", "triage"]);

  service.updateBinding("main", detail.bindings[0].id, {
    type: "route",
    channel: "slack",
    accountId: "ops",
    peerKind: "channel",
    peerId: "C-1",
    teamId: "team-2",
    roles: ["ops"],
  });

  const nextConfig = JSON.parse(fs.readFileSync(config.openclawConfigFile, "utf8"));
  assert.equal(nextConfig.bindings[0].match.teamId, "team-2");
  assert.deepEqual(nextConfig.bindings[0].match.roles, ["ops"]);
});

test("agent createBinding keeps channel-compatible raw bindings for standard routes", () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  seedAgent(
    root,
    "main",
    "# IDENTITY.md\n\n- **Name:** Main Agent\n\n## Mission\n\nShip.\n",
  );

  writeJson(config.openclawConfigFile, {
    agents: {
      list: [
        {
          id: "main",
          name: "Main Agent",
          workspace: path.join(root, "workspace"),
        },
      ],
    },
    channels: {
      discord: {
        enabled: true,
        accounts: {
          support: {
            enabled: true,
          },
        },
      },
    },
    bindings: [],
  });

  const service = createAgentsService(config);
  const response = service.createBinding("main", {
    type: "route",
    channel: "discord",
    accountId: "support",
    peerKind: "channel",
    peerId: "42",
    roles: ["support"],
  });

  assert.ok(response.detail);
  assert.equal(response.detail.bindings.length, 1);
  assert.notEqual(response.detail.bindings[0].id, "0");

  const nextConfig = JSON.parse(fs.readFileSync(config.openclawConfigFile, "utf8"));
  assert.equal(nextConfig.bindings[0].type, undefined);
  assert.deepEqual(nextConfig.bindings[0].match.roles, ["support"]);
});
