import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { createConfigService } from "../../dist/apps/api/modules/config/service.js";
import {
  getStudioChatGlobalHostManagementExecEnabled,
  resetStudioChatManagementPolicyState,
} from "../../dist/lib/studio-chat-management-policy.js";

function makeTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "studio-config-service-"));
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
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

function buildPayload(summary) {
  return {
    defaults: summary.defaults,
    compaction: summary.compaction,
    sandbox: summary.sandbox,
    tools: summary.tools,
    execApprovals: {
      defaults: summary.execApprovals.defaults,
      agents: summary.execApprovals.agents,
    },
    session: summary.session,
    messages: summary.messages,
    providers: summary.providers.map((provider) => ({
      id: provider.id,
      api: provider.api,
      baseUrl: provider.baseUrl,
      models: provider.models,
    })),
  };
}

test("config summary reads canonical plugin load paths and legacy browser SSRF alias", () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  writeJson(config.openclawConfigFile, {
    agents: {
      defaults: {
        verboseDefault: "full",
        systemPromptOverride: "Global prompt override",
        skills: ["agent-browser", "webapp-testing"],
        contextInjection: "continuation-skip",
        bootstrapPromptTruncationWarning: "once",
        userTimezone: "Asia/Shanghai",
        timeFormat: "24",
        envelopeTimezone: "user",
        envelopeTimestamp: "on",
        envelopeElapsed: "off",
        contextTokens: 200000,
        typingMode: "thinking",
        elevatedDefault: "ask",
        blockStreamingDefault: "on",
        blockStreamingBreak: "message_end",
        mediaMaxMb: 32,
        imageMaxDimensionPx: 1400,
        typingIntervalSeconds: 3,
        pdfMaxBytesMb: 12,
        pdfMaxPages: 25,
        imageGenerationModel: {
          primary: "openai/gpt-5.4",
          fallbacks: ["anthropic/claude-sonnet-4-6"],
        },
        videoGenerationModel: "openai/gpt-5.4-mini",
        musicGenerationModel: {
          primary: "google/gemini-3.1-pro-preview",
          fallbacks: ["google/gemini-3-flash-preview"],
        },
        mediaGenerationAutoProviderFallback: false,
        pdfModel: {
          primary: "openai/gpt-5.4-nano",
          fallbacks: ["anthropic/claude-sonnet-4-6"],
        },
        pdfModelFallback: ["anthropic/claude-sonnet-4-6"],
        repoRoot: "/workspace/repo",
        skipBootstrap: true,
        bootstrapMaxChars: 22000,
        bootstrapTotalMaxChars: 160000,
        blockStreamingChunk: { maxChars: 256 },
        blockStreamingCoalesce: { enabled: true },
        llm: { idleTimeoutSeconds: 90 },
        embeddedPi: { projectSettingsPolicy: "trusted" },
        memorySearch: { enabled: true, topK: 8 },
        humanDelay: { mode: "natural", minMs: 800, maxMs: 2500 },
        heartbeat: { every: "30m" },
        params: { cacheRetention: "long", temperature: 0.2 },
        cliBackends: { claude: { command: "claude" } },
        contextPruning: { mode: "cache-ttl", ttl: "30m" },
        models: {
          "openai/gpt-5.4": { alias: "gpt" },
          "anthropic/claude-sonnet-4-6": {
            alias: "",
            params: { cacheRetention: "long" },
            streaming: false,
          },
        },
        subagents: {
          maxConcurrent: 12,
          maxSpawnDepth: 3,
          maxChildrenPerAgent: 7,
          archiveAfterMinutes: 180,
          announceTimeoutMs: 1500,
          model: "openai/gpt-5.4-mini",
          thinking: "low",
          runTimeoutSeconds: 240,
        },
      },
    },
    plugins: {
      enabled: true,
      deny: ["unsafe-plugin"],
      slots: {
        memory: "memory-core",
        contextEngine: "context-engine-default",
      },
      installs: {
        studio: {
          source: "path",
          installPath: "/opt/openclaw/plugins/studio",
          version: "0.1.20",
          installedAt: "2026-04-08T12:00:00.000Z",
        },
      },
      load: {
        paths: ["/opt/openclaw/extensions"],
      },
    },
    browser: {
      profiles: {
        chrome: {
          driver: "openclaw",
          cdpPort: 9222,
          color: "#FF4500",
        },
        attached: {
          driver: "existing-session",
          attachOnly: true,
          cdpUrl: "ws://127.0.0.1:9333/devtools/browser/abc",
          userDataDir: "/tmp/browser-attached",
          color: "#00AAFF",
        },
      },
      ssrfPolicy: {
        allowPrivateNetwork: false,
      },
    },
  });

  const service = createConfigService(config);
  const summary = service.getSummary();

  assert.equal(summary.plugins?.enabled, true);
  assert.deepEqual(summary.plugins?.loadPaths, ["/opt/openclaw/extensions"]);
  assert.deepEqual(summary.plugins?.deny, ["unsafe-plugin"]);
  assert.deepEqual(summary.plugins?.slots, {
    memory: "memory-core",
    contextEngine: "context-engine-default",
  });
  assert.deepEqual(summary.plugins?.installs, [
    {
      id: "studio",
      source: "path",
      spec: undefined,
      installPath: "/opt/openclaw/plugins/studio",
      version: "0.1.20",
      resolvedName: undefined,
      resolvedVersion: undefined,
      resolvedSpec: undefined,
      installedAt: "2026-04-08T12:00:00.000Z",
    },
  ]);
  assert.equal(
    summary.browser?.ssrfPolicy?.dangerouslyAllowPrivateNetwork,
    false,
  );
  assert.deepEqual(summary.browser?.profiles, [
    {
      id: "attached",
      driver: "existing-session",
      attachOnly: true,
      cdpPort: null,
      cdpUrl: "ws://127.0.0.1:9333/devtools/browser/abc",
      userDataDir: "/tmp/browser-attached",
      color: "#00AAFF",
    },
    {
      id: "chrome",
      driver: "openclaw",
      attachOnly: undefined,
      cdpPort: 9222,
      cdpUrl: undefined,
      userDataDir: undefined,
      color: "#FF4500",
    },
  ]);
  assert.equal(summary.defaults.verbose, "full");
  assert.equal(summary.defaults.systemPromptOverride, "Global prompt override");
  assert.deepEqual(summary.defaults.skills, [
    "agent-browser",
    "webapp-testing",
  ]);
  assert.equal(summary.defaults.contextInjection, "continuation-skip");
  assert.equal(summary.defaults.bootstrapPromptTruncationWarning, "once");
  assert.equal(summary.defaults.userTimezone, "Asia/Shanghai");
  assert.equal(summary.defaults.timeFormat, "24");
  assert.equal(summary.defaults.envelopeTimezone, "user");
  assert.equal(summary.defaults.envelopeTimestamp, "on");
  assert.equal(summary.defaults.envelopeElapsed, "off");
  assert.equal(summary.defaults.contextTokens, 200000);
  assert.equal(summary.defaults.typingMode, "thinking");
  assert.equal(summary.defaults.elevated, "ask");
  assert.equal(summary.defaults.blockStreaming, "on");
  assert.equal(summary.defaults.blockStreamingBreak, "message_end");
  assert.equal(summary.defaults.mediaMaxMb, 32);
  assert.equal(summary.defaults.imageMaxDimensionPx, 1400);
  assert.equal(summary.defaults.typingIntervalSeconds, 3);
  assert.equal(summary.defaults.pdfMaxBytesMb, 12);
  assert.equal(summary.defaults.pdfMaxPages, 25);
  assert.equal(summary.defaults.imageGenerationModel, "openai/gpt-5.4");
  assert.deepEqual(summary.defaults.imageGenerationModelFallback, [
    "anthropic/claude-sonnet-4-6",
  ]);
  assert.equal(summary.defaults.videoGenerationModel, "openai/gpt-5.4-mini");
  assert.deepEqual(summary.defaults.videoGenerationModelFallback, []);
  assert.equal(
    summary.defaults.musicGenerationModel,
    "google/gemini-3.1-pro-preview",
  );
  assert.deepEqual(summary.defaults.musicGenerationModelFallback, [
    "google/gemini-3-flash-preview",
  ]);
  assert.equal(summary.defaults.mediaGenerationAutoProviderFallback, false);
  assert.equal(summary.defaults.pdfModel, "openai/gpt-5.4-nano");
  assert.deepEqual(summary.defaults.pdfModelFallback, [
    "anthropic/claude-sonnet-4-6",
  ]);
  assert.equal(summary.defaults.repoRoot, "/workspace/repo");
  assert.equal(summary.defaults.skipBootstrap, true);
  assert.equal(summary.defaults.bootstrapMaxChars, 22000);
  assert.equal(summary.defaults.bootstrapTotalMaxChars, 160000);
  assert.equal(summary.defaults.blockStreamingChunk?.maxChars, 256);
  assert.equal(summary.defaults.blockStreamingCoalesce?.enabled, true);
  assert.equal(summary.defaults.llmIdleTimeoutSeconds, 90);
  assert.equal(summary.defaults.embeddedPiProjectSettingsPolicy, "trusted");
  assert.deepEqual(summary.defaults.memorySearch, { enabled: true, topK: 8 });
  assert.deepEqual(summary.defaults.humanDelay, {
    mode: "natural",
    minMs: 800,
    maxMs: 2500,
  });
  assert.deepEqual(summary.defaults.heartbeat, { every: "30m" });
  assert.deepEqual(summary.defaults.params, {
    cacheRetention: "long",
    temperature: 0.2,
  });
  assert.deepEqual(summary.defaults.cliBackends, {
    claude: { command: "claude" },
  });
  assert.deepEqual(summary.defaults.contextPruning, {
    mode: "cache-ttl",
    ttl: "30m",
  });
  assert.deepEqual(summary.defaults.models, {
    "openai/gpt-5.4": { alias: "gpt" },
    "anthropic/claude-sonnet-4-6": {
      alias: "",
      params: { cacheRetention: "long" },
      streaming: false,
    },
  });
  assert.equal(summary.defaults.subagentModel, "openai/gpt-5.4-mini");
  assert.equal(summary.defaults.subagentThinking, "low");
  assert.equal(summary.defaults.subagentRunTimeoutSeconds, 240);
  assert.equal(summary.defaults.subagentMaxSpawnDepth, 3);
  assert.equal(summary.defaults.subagentMaxChildrenPerAgent, 7);
  assert.equal(summary.defaults.subagentArchiveAfterMinutes, 180);
  assert.equal(summary.defaults.subagentAnnounceTimeoutMs, 1500);
});

test("config save writes canonical plugin and browser fields without legacy aliases", () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  writeJson(config.openclawConfigFile, {
    browser: {
      ssrfPolicy: {
        allowPrivateNetwork: true,
      },
    },
  });

  const service = createConfigService(config);
  const payload = {
    ...buildPayload(service.getSummary()),
    plugins: {
      enabled: false,
      deny: ["unsafe-plugin", "legacy-plugin"],
      loadPaths: ["/opt/openclaw/extensions", "/srv/plugins"],
      slots: {
        memory: "none",
        contextEngine: "context-engine-default",
      },
    },
    defaults: {
      ...service.getSummary().defaults,
      verbose: "on",
      systemPromptOverride: "Override from studio",
      skills: ["agent-browser", "webapp-testing"],
      contextInjection: "always",
      bootstrapPromptTruncationWarning: "always",
      userTimezone: "UTC",
      timeFormat: "12",
      envelopeTimezone: "Asia/Shanghai",
      envelopeTimestamp: "off",
      envelopeElapsed: "on",
      contextTokens: 180000,
      typingMode: "message",
      elevated: "full",
      blockStreaming: "off",
      blockStreamingBreak: "text_end",
      mediaMaxMb: 24,
      imageMaxDimensionPx: 1200,
      typingIntervalSeconds: 4,
      pdfMaxBytesMb: 16,
      pdfMaxPages: 30,
      imageGenerationModel: "openai/gpt-5.4",
      imageGenerationModelFallback: ["anthropic/claude-sonnet-4-6"],
      videoGenerationModel: {
        primary: "openai/gpt-5.4-mini",
        fallbacks: ["openai/gpt-5.4-nano"],
      },
      videoGenerationModelFallback: ["openai/gpt-5.4-nano"],
      musicGenerationModel: "google/gemini-3.1-pro-preview",
      musicGenerationModelFallback: ["google/gemini-3-flash-preview"],
      mediaGenerationAutoProviderFallback: false,
      pdfModel: {
        primary: "openai/gpt-5.4-nano",
        fallbacks: ["anthropic/claude-sonnet-4-6"],
      },
      repoRoot: "/workspace/repo",
      skipBootstrap: true,
      bootstrapMaxChars: 24000,
      bootstrapTotalMaxChars: 180000,
      blockStreamingChunk: { maxChars: 300 },
      blockStreamingCoalesce: { enabled: false },
      llmIdleTimeoutSeconds: 75,
      embeddedPiProjectSettingsPolicy: "ignore",
      memorySearch: { enabled: true, topK: 16 },
      humanDelay: { mode: "custom", minMs: 300, maxMs: 900 },
      heartbeat: { every: "10m", includeReasoning: true },
      params: { cacheRetention: "ephemeral", maxOutputTokens: 1800 },
      cliBackends: { claude: { command: "claude", sessionMode: "always" } },
      contextPruning: { mode: "off", keepLastAssistants: 2 },
      models: {
        "openai/gpt-5.4": { alias: "gpt" },
        "openai/gpt-5.4-mini": {
          alias: "",
          params: { cacheRetention: "long" },
          streaming: true,
        },
      },
      subagentModel: "openai/gpt-5.4",
      subagentThinking: "medium",
      subagentRunTimeoutSeconds: 360,
      subagentMaxSpawnDepth: 2,
      subagentMaxChildrenPerAgent: 4,
      subagentArchiveAfterMinutes: 45,
      subagentAnnounceTimeoutMs: 2000,
    },
    browser: {
      profiles: [
        {
          id: "chrome",
          driver: "clawd",
          cdpPort: 9555,
          color: "#123456",
        },
        {
          id: "remote",
          driver: "existing-session",
          attachOnly: true,
          cdpUrl: "ws://127.0.0.1:9444/devtools/browser/remote",
          userDataDir: "/srv/browser-remote",
          color: "#AA5500",
        },
      ],
      ssrfPolicy: {
        dangerouslyAllowPrivateNetwork: false,
      },
    },
  };

  service.saveConfig(payload);

  const nextConfig = JSON.parse(
    fs.readFileSync(config.openclawConfigFile, "utf8"),
  );
  assert.equal(nextConfig.plugins.enabled, false);
  assert.deepEqual(nextConfig.plugins.load.paths, [
    "/opt/openclaw/extensions",
    "/srv/plugins",
  ]);
  assert.equal(nextConfig.plugins.loadPaths, undefined);
  assert.deepEqual(nextConfig.plugins.deny, ["unsafe-plugin", "legacy-plugin"]);
  assert.deepEqual(nextConfig.plugins.slots, {
    memory: "none",
    contextEngine: "context-engine-default",
  });
  assert.equal(
    nextConfig.browser.ssrfPolicy.dangerouslyAllowPrivateNetwork,
    false,
  );
  assert.equal(nextConfig.browser.ssrfPolicy.allowPrivateNetwork, undefined);
  assert.deepEqual(nextConfig.browser.profiles, {
    chrome: {
      driver: "clawd",
      cdpPort: 9555,
      color: "#123456",
    },
    remote: {
      driver: "existing-session",
      attachOnly: true,
      cdpUrl: "ws://127.0.0.1:9444/devtools/browser/remote",
      userDataDir: "/srv/browser-remote",
      color: "#AA5500",
    },
  });
  assert.equal(nextConfig.agents.defaults.verboseDefault, "on");
  assert.equal(
    nextConfig.agents.defaults.systemPromptOverride,
    "Override from studio",
  );
  assert.deepEqual(nextConfig.agents.defaults.skills, [
    "agent-browser",
    "webapp-testing",
  ]);
  assert.equal(nextConfig.agents.defaults.contextInjection, "always");
  assert.equal(
    nextConfig.agents.defaults.bootstrapPromptTruncationWarning,
    "always",
  );
  assert.equal(nextConfig.agents.defaults.userTimezone, "UTC");
  assert.equal(nextConfig.agents.defaults.timeFormat, "12");
  assert.equal(nextConfig.agents.defaults.envelopeTimezone, "Asia/Shanghai");
  assert.equal(nextConfig.agents.defaults.envelopeTimestamp, "off");
  assert.equal(nextConfig.agents.defaults.envelopeElapsed, "on");
  assert.equal(nextConfig.agents.defaults.contextTokens, 180000);
  assert.equal(nextConfig.agents.defaults.typingMode, "message");
  assert.equal(nextConfig.agents.defaults.elevatedDefault, "full");
  assert.equal(nextConfig.agents.defaults.blockStreamingDefault, "off");
  assert.equal(nextConfig.agents.defaults.blockStreamingBreak, "text_end");
  assert.equal(nextConfig.agents.defaults.mediaMaxMb, 24);
  assert.equal(nextConfig.agents.defaults.imageMaxDimensionPx, 1200);
  assert.equal(nextConfig.agents.defaults.typingIntervalSeconds, 4);
  assert.equal(nextConfig.agents.defaults.pdfMaxBytesMb, 16);
  assert.equal(nextConfig.agents.defaults.pdfMaxPages, 30);
  assert.equal(
    nextConfig.agents.defaults.imageGenerationModel.primary,
    "openai/gpt-5.4",
  );
  assert.deepEqual(nextConfig.agents.defaults.imageGenerationModel.fallbacks, [
    "anthropic/claude-sonnet-4-6",
  ]);
  assert.equal(
    nextConfig.agents.defaults.videoGenerationModel.primary,
    "openai/gpt-5.4-mini",
  );
  assert.deepEqual(nextConfig.agents.defaults.videoGenerationModel.fallbacks, [
    "openai/gpt-5.4-nano",
  ]);
  assert.equal(
    nextConfig.agents.defaults.musicGenerationModel.primary,
    "google/gemini-3.1-pro-preview",
  );
  assert.deepEqual(nextConfig.agents.defaults.musicGenerationModel.fallbacks, [
    "google/gemini-3-flash-preview",
  ]);
  assert.equal(
    nextConfig.agents.defaults.mediaGenerationAutoProviderFallback,
    false,
  );
  assert.equal(
    nextConfig.agents.defaults.pdfModel.primary,
    "openai/gpt-5.4-nano",
  );
  assert.deepEqual(nextConfig.agents.defaults.pdfModel.fallbacks, [
    "anthropic/claude-sonnet-4-6",
  ]);
  assert.equal(nextConfig.agents.defaults.repoRoot, "/workspace/repo");
  assert.equal(nextConfig.agents.defaults.skipBootstrap, true);
  assert.equal(nextConfig.agents.defaults.bootstrapMaxChars, 24000);
  assert.equal(nextConfig.agents.defaults.bootstrapTotalMaxChars, 180000);
  assert.deepEqual(nextConfig.agents.defaults.blockStreamingChunk, {
    maxChars: 300,
  });
  assert.deepEqual(nextConfig.agents.defaults.blockStreamingCoalesce, {
    enabled: false,
  });
  assert.equal(nextConfig.agents.defaults.llm, undefined);
  assert.equal(
    nextConfig.agents.defaults.embeddedPi.projectSettingsPolicy,
    "ignore",
  );
  assert.deepEqual(nextConfig.agents.defaults.memorySearch, {
    enabled: true,
    topK: 16,
  });
  assert.deepEqual(nextConfig.agents.defaults.humanDelay, {
    mode: "custom",
    minMs: 300,
    maxMs: 900,
  });
  assert.deepEqual(nextConfig.agents.defaults.heartbeat, {
    every: "10m",
    includeReasoning: true,
  });
  assert.deepEqual(nextConfig.agents.defaults.params, {
    cacheRetention: "ephemeral",
    maxOutputTokens: 1800,
  });
  assert.deepEqual(nextConfig.agents.defaults.cliBackends, {
    claude: { command: "claude", sessionMode: "always" },
  });
  assert.deepEqual(nextConfig.agents.defaults.contextPruning, {
    mode: "off",
    keepLastAssistants: 2,
  });
  assert.deepEqual(nextConfig.agents.defaults.models, {
    "openai/gpt-5.4": { alias: "gpt" },
    "openai/gpt-5.4-mini": {
      alias: "",
      params: { cacheRetention: "long" },
      streaming: true,
    },
  });
  assert.equal(nextConfig.agents.defaults.subagents.model, "openai/gpt-5.4");
  assert.equal(nextConfig.agents.defaults.subagents.thinking, "medium");
  assert.equal(nextConfig.agents.defaults.subagents.runTimeoutSeconds, 360);
  assert.equal(nextConfig.agents.defaults.subagents.maxSpawnDepth, 2);
  assert.equal(nextConfig.agents.defaults.subagents.maxChildrenPerAgent, 4);
  assert.equal(nextConfig.agents.defaults.subagents.archiveAfterMinutes, 45);
  assert.equal(nextConfig.agents.defaults.subagents.announceTimeoutMs, 2000);
});

test("config save clears optional default overrides when blank or null", () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  writeJson(config.openclawConfigFile, {
    agents: {
      defaults: {
        verboseDefault: "full",
        systemPromptOverride: "to-clear",
        skills: ["agent-browser"],
        contextInjection: "always",
        bootstrapPromptTruncationWarning: "always",
        userTimezone: "Asia/Shanghai",
        timeFormat: "24",
        envelopeTimezone: "user",
        envelopeTimestamp: "on",
        envelopeElapsed: "on",
        contextTokens: 123456,
        typingMode: "thinking",
        elevatedDefault: "ask",
        blockStreamingDefault: "on",
        blockStreamingBreak: "message_end",
        mediaMaxMb: 32,
        imageMaxDimensionPx: 1400,
        typingIntervalSeconds: 3,
        pdfMaxBytesMb: 12,
        pdfMaxPages: 25,
        imageGenerationModel: {
          primary: "openai/gpt-5.4",
          fallbacks: ["anthropic/claude-sonnet-4-6"],
        },
        videoGenerationModel: {
          primary: "openai/gpt-5.4-mini",
          fallbacks: ["openai/gpt-5.4-nano"],
        },
        musicGenerationModel: "google/gemini-3.1-pro-preview",
        mediaGenerationAutoProviderFallback: false,
        pdfModel: {
          primary: "openai/gpt-5.4-nano",
          fallbacks: ["anthropic/claude-sonnet-4-6"],
        },
        repoRoot: "/workspace/repo",
        skipBootstrap: true,
        bootstrapMaxChars: 22000,
        bootstrapTotalMaxChars: 160000,
        blockStreamingChunk: { maxChars: 256 },
        blockStreamingCoalesce: { enabled: true },
        llm: { idleTimeoutSeconds: 90 },
        embeddedPi: { projectSettingsPolicy: "trusted" },
        params: {
          cacheRetention: "long",
        },
        cliBackends: { claude: { command: "claude" } },
        contextPruning: { mode: "cache-ttl", ttl: "30m" },
        models: {
          "openai/gpt-5.4": { alias: "gpt" },
        },
        subagents: {
          model: "openai/gpt-5.4-mini",
          thinking: "low",
          runTimeoutSeconds: 180,
          maxSpawnDepth: 2,
          maxChildrenPerAgent: 4,
          archiveAfterMinutes: 30,
          announceTimeoutMs: 1200,
        },
      },
    },
  });

  const service = createConfigService(config);
  const payload = {
    ...buildPayload(service.getSummary()),
    defaults: {
      ...service.getSummary().defaults,
      verbose: "",
      systemPromptOverride: "",
      skills: [],
      contextInjection: "",
      bootstrapPromptTruncationWarning: "",
      userTimezone: "",
      timeFormat: "",
      envelopeTimezone: "",
      envelopeTimestamp: "",
      envelopeElapsed: "",
      contextTokens: null,
      typingMode: "",
      elevated: "",
      blockStreaming: "",
      blockStreamingBreak: "",
      mediaMaxMb: null,
      imageMaxDimensionPx: null,
      typingIntervalSeconds: null,
      pdfMaxBytesMb: null,
      pdfMaxPages: null,
      imageGenerationModel: "",
      imageGenerationModelFallback: [],
      videoGenerationModel: "",
      videoGenerationModelFallback: [],
      musicGenerationModel: "",
      musicGenerationModelFallback: [],
      mediaGenerationAutoProviderFallback: false,
      pdfModel: "",
      pdfModelFallback: [],
      repoRoot: "",
      skipBootstrap: false,
      bootstrapMaxChars: null,
      bootstrapTotalMaxChars: null,
      blockStreamingChunk: null,
      blockStreamingCoalesce: null,
      llmIdleTimeoutSeconds: null,
      embeddedPiProjectSettingsPolicy: "",
      params: null,
      cliBackends: null,
      contextPruning: null,
      models: null,
      subagentModel: "",
      subagentThinking: "",
      subagentRunTimeoutSeconds: null,
      subagentMaxSpawnDepth: null,
      subagentMaxChildrenPerAgent: null,
      subagentArchiveAfterMinutes: null,
      subagentAnnounceTimeoutMs: null,
    },
  };

  service.saveConfig(payload);

  const nextConfig = JSON.parse(
    fs.readFileSync(config.openclawConfigFile, "utf8"),
  );
  assert.equal(nextConfig.agents.defaults.verboseDefault, undefined);
  assert.equal(nextConfig.agents.defaults.systemPromptOverride, undefined);
  assert.equal(nextConfig.agents.defaults.skills, undefined);
  assert.equal(nextConfig.agents.defaults.contextInjection, undefined);
  assert.equal(
    nextConfig.agents.defaults.bootstrapPromptTruncationWarning,
    undefined,
  );
  assert.equal(nextConfig.agents.defaults.userTimezone, undefined);
  assert.equal(nextConfig.agents.defaults.timeFormat, undefined);
  assert.equal(nextConfig.agents.defaults.envelopeTimezone, undefined);
  assert.equal(nextConfig.agents.defaults.envelopeTimestamp, undefined);
  assert.equal(nextConfig.agents.defaults.envelopeElapsed, undefined);
  assert.equal(nextConfig.agents.defaults.contextTokens, undefined);
  assert.equal(nextConfig.agents.defaults.typingMode, undefined);
  assert.equal(nextConfig.agents.defaults.elevatedDefault, undefined);
  assert.equal(nextConfig.agents.defaults.blockStreamingDefault, undefined);
  assert.equal(nextConfig.agents.defaults.blockStreamingBreak, undefined);
  assert.equal(nextConfig.agents.defaults.mediaMaxMb, undefined);
  assert.equal(nextConfig.agents.defaults.imageMaxDimensionPx, undefined);
  assert.equal(nextConfig.agents.defaults.typingIntervalSeconds, undefined);
  assert.equal(nextConfig.agents.defaults.pdfMaxBytesMb, undefined);
  assert.equal(nextConfig.agents.defaults.pdfMaxPages, undefined);
  assert.equal(nextConfig.agents.defaults.imageGenerationModel, undefined);
  assert.equal(nextConfig.agents.defaults.videoGenerationModel, undefined);
  assert.equal(nextConfig.agents.defaults.musicGenerationModel, undefined);
  assert.equal(
    nextConfig.agents.defaults.mediaGenerationAutoProviderFallback,
    false,
  );
  assert.equal(nextConfig.agents.defaults.pdfModel, undefined);
  assert.equal(nextConfig.agents.defaults.repoRoot, undefined);
  assert.equal(nextConfig.agents.defaults.skipBootstrap, undefined);
  assert.equal(nextConfig.agents.defaults.bootstrapMaxChars, undefined);
  assert.equal(nextConfig.agents.defaults.bootstrapTotalMaxChars, undefined);
  assert.equal(nextConfig.agents.defaults.blockStreamingChunk, undefined);
  assert.equal(nextConfig.agents.defaults.blockStreamingCoalesce, undefined);
  assert.equal(nextConfig.agents.defaults.llm, undefined);
  assert.equal(nextConfig.agents.defaults.embeddedPi, undefined);
  assert.equal(nextConfig.agents.defaults.params, undefined);
  assert.equal(nextConfig.agents.defaults.cliBackends, undefined);
  assert.equal(nextConfig.agents.defaults.contextPruning, undefined);
  assert.equal(nextConfig.agents.defaults.models, undefined);
  assert.equal(nextConfig.agents.defaults.subagents?.model, undefined);
  assert.equal(nextConfig.agents.defaults.subagents?.thinking, undefined);
  assert.equal(
    nextConfig.agents.defaults.subagents?.runTimeoutSeconds,
    undefined,
  );
  assert.equal(nextConfig.agents.defaults.subagents?.maxSpawnDepth, undefined);
  assert.equal(
    nextConfig.agents.defaults.subagents?.maxChildrenPerAgent,
    undefined,
  );
  assert.equal(
    nextConfig.agents.defaults.subagents?.archiveAfterMinutes,
    undefined,
  );
  assert.equal(
    nextConfig.agents.defaults.subagents?.announceTimeoutMs,
    undefined,
  );
});

test("config save clears browser profiles when an empty list is submitted", () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  writeJson(config.openclawConfigFile, {
    browser: {
      profiles: {
        chrome: {
          driver: "openclaw",
          cdpPort: 9222,
          color: "#FF4500",
        },
      },
    },
  });

  const service = createConfigService(config);
  const payload = {
    ...buildPayload(service.getSummary()),
    browser: {
      profiles: [],
    },
  };

  service.saveConfig(payload);

  const nextConfig = JSON.parse(
    fs.readFileSync(config.openclawConfigFile, "utf8"),
  );
  assert.equal(nextConfig.browser.profiles, undefined);
});

test("config summary and save cover current MCP, skills, and browser tab cleanup fields", () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  writeJson(config.openclawConfigFile, {
    mcp: {
      sessionIdleTtlMs: 120000,
      servers: {
        filesystem: {
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-filesystem"],
        },
      },
    },
    skills: {
      allowBundled: ["skill-a", "skill-b"],
      load: {
        extraDirs: ["~/.openclaw/shared-skills"],
        watch: true,
        watchDebounceMs: 250,
      },
      install: {
        preferBrew: true,
        nodeManager: "pnpm",
      },
      limits: {
        maxCandidatesPerRoot: 100,
        maxSkillsLoadedPerSource: 30,
        maxSkillsInPrompt: 12,
        maxSkillsPromptChars: 50000,
        maxSkillFileBytes: 200000,
      },
      entries: {
        "docs-search": {
          enabled: true,
        },
      },
    },
    browser: {
      tabCleanup: {
        enabled: true,
        idleMinutes: 30,
        maxTabsPerSession: 12,
        sweepMinutes: 5,
      },
    },
  });

  const service = createConfigService(config);
  const summary = service.getSummary();
  assert.equal(summary.mcp.sessionIdleTtlMs, 120000);
  assert.equal(summary.mcp.servers.filesystem.command, "npx");
  assert.deepEqual(summary.skills.allowBundled, ["skill-a", "skill-b"]);
  assert.deepEqual(summary.skills.load.extraDirs, ["~/.openclaw/shared-skills"]);
  assert.equal(summary.skills.load.watch, true);
  assert.equal(summary.skills.load.watchDebounceMs, 250);
  assert.equal(summary.skills.install.nodeManager, "pnpm");
  assert.equal(summary.skills.limits.maxCandidatesPerRoot, 100);
  assert.equal(summary.skills.limits.maxSkillsLoadedPerSource, 30);
  assert.equal(summary.skills.limits.maxSkillsInPrompt, 12);
  assert.equal(summary.skills.limits.maxSkillsPromptChars, 50000);
  assert.equal(summary.skills.limits.maxSkillFileBytes, 200000);
  assert.equal(summary.browser.tabCleanup.enabled, true);
  assert.equal(summary.browser.tabCleanup.maxTabsPerSession, 12);

  service.saveConfig({
    ...buildPayload(summary),
    mcp: {
      sessionIdleTtlMs: 240000,
      servers: {
        playwright: {
          command: "npx",
          args: ["-y", "@playwright/mcp"],
        },
      },
    },
    skills: {
      allowBundled: ["skill-c"],
      load: {
        extraDirs: ["~/.openclaw/team-skills"],
        watch: false,
        watchDebounceMs: 500,
      },
      install: {
        preferBrew: false,
        nodeManager: "npm",
      },
      limits: {
        maxCandidatesPerRoot: 120,
        maxSkillsLoadedPerSource: 40,
        maxSkillsInPrompt: 18,
        maxSkillsPromptChars: 65000,
        maxSkillFileBytes: 300000,
      },
      entries: {
        "docs-search": {
          enabled: false,
        },
      },
    },
    browser: {
      tabCleanup: {
        enabled: false,
        idleMinutes: 45,
        maxTabsPerSession: 8,
        sweepMinutes: 10,
      },
    },
  });

  const nextConfig = JSON.parse(
    fs.readFileSync(config.openclawConfigFile, "utf8"),
  );
  assert.equal(nextConfig.mcp.sessionIdleTtlMs, 240000);
  assert.equal(nextConfig.mcp.servers.playwright.command, "npx");
  assert.deepEqual(nextConfig.skills.allowBundled, ["skill-c"]);
  assert.deepEqual(nextConfig.skills.load.extraDirs, ["~/.openclaw/team-skills"]);
  assert.equal(nextConfig.skills.load.watch, false);
  assert.equal(nextConfig.skills.load.watchDebounceMs, 500);
  assert.equal(nextConfig.skills.install.nodeManager, "npm");
  assert.equal(nextConfig.skills.limits.maxCandidatesPerRoot, 120);
  assert.equal(nextConfig.skills.limits.maxSkillsLoadedPerSource, 40);
  assert.equal(nextConfig.skills.limits.maxSkillsInPrompt, 18);
  assert.equal(nextConfig.skills.limits.maxSkillsPromptChars, 65000);
  assert.equal(nextConfig.skills.limits.maxSkillFileBytes, 300000);
  assert.equal(nextConfig.skills.entries["docs-search"].enabled, false);
  assert.equal(nextConfig.browser.tabCleanup.enabled, false);
  assert.equal(nextConfig.browser.tabCleanup.idleMinutes, 45);
});

test("config save disables docker-backed sandbox modes when docker is unavailable and global mode is off", () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  writeJson(config.openclawConfigFile, {
    agents: {
      defaults: {
        sandbox: {
          mode: "all",
          backend: "docker",
          workspaceAccess: "rw",
          scope: "session",
          prune: { idleHours: 24, maxAgeDays: 7 },
        },
      },
      list: [
        {
          id: "main",
          sandbox: {
            mode: "all",
            backend: "docker",
            workspaceAccess: "rw",
          },
        },
        {
          id: "ops",
          sandbox: {
            mode: "agent",
            backend: "ssh",
            workspaceAccess: "rw",
          },
        },
      ],
    },
  });

  const service = createConfigService(config);
  const originalPath = process.env.PATH;
  process.env.PATH = path.join(root, "missing-bin");
  try {
    const summary = service.getSummary();
    service.saveConfig({
      ...buildPayload(summary),
      sandbox: {
        ...summary.sandbox,
        mode: "off",
      },
    });
  } finally {
    process.env.PATH = originalPath;
  }

  const nextConfig = JSON.parse(
    fs.readFileSync(config.openclawConfigFile, "utf8"),
  );
  assert.equal(nextConfig.agents.defaults.sandbox.mode, "off");
  assert.equal(nextConfig.agents.list[0].sandbox.mode, "off");
  assert.equal(nextConfig.agents.list[1].sandbox.mode, "agent");
});

test("config save self-heals strict provider/session fields to avoid host schema restart failures", () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  writeJson(config.openclawConfigFile, {
    models: {
      providers: {
        "custom-llm-gateway-mlamp-cn": {
          api: "openai-responses",
        },
      },
    },
    session: {
      reset: {
        mode: "idle",
        idleMinutes: 0,
      },
    },
  });

  const service = createConfigService(config);
  const summary = service.getSummary();
  service.saveConfig({
    ...buildPayload(summary),
    sessionReset: {
      ...summary.sessionReset,
      mode: "idle",
      idleMinutes: 0,
    },
  });

  const nextConfig = JSON.parse(
    fs.readFileSync(config.openclawConfigFile, "utf8"),
  );
  const customProvider =
    nextConfig.models.providers["custom-llm-gateway-mlamp-cn"];
  assert.equal(typeof customProvider.baseUrl, "string");
  assert.ok(customProvider.baseUrl.length > 0);
  assert.ok(Array.isArray(customProvider.models));
  assert.equal(nextConfig.session.reset.mode, "idle");
  assert.equal(nextConfig.session.reset.idleMinutes > 0, true);
});

test("config save persists and applies the global Studio host-management exec switch", () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  writeJson(config.openclawConfigFile, {
    plugins: {
      entries: {
        studio: {
          enabled: true,
          config: {
            chat: {
              allowHostManagementExecInStudioChat: false,
            },
          },
        },
      },
    },
  });

  resetStudioChatManagementPolicyState();
  const service = createConfigService(config);
  const summary = service.getSummary();
  const payload = {
    ...buildPayload(summary),
    plugins: {
      entries: {
        studio: {
          enabled: true,
          config: {
            chat: {
              allowHostManagementExecInStudioChat: true,
            },
          },
        },
      },
    },
  };

  service.saveConfig(payload);

  const nextConfig = JSON.parse(
    fs.readFileSync(config.openclawConfigFile, "utf8"),
  );
  assert.equal(
    nextConfig.plugins.entries.studio.config.chat
      .allowHostManagementExecInStudioChat,
    true,
  );
  assert.equal(getStudioChatGlobalHostManagementExecEnabled(), true);
});

test("config patch accepts sparse plugin payloads without dropping unrelated plugin config", () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  writeJson(config.openclawConfigFile, {
    models: {
      providers: {
        demo: {
          api: "openai-responses",
          baseUrl: "https://demo.example/v1",
          apiKey: "secret-demo",
          models: [{ id: "demo-model", name: "Demo Model" }],
        },
      },
    },
    plugins: {
      enabled: true,
      allow: ["studio", "alpha"],
      deny: ["unsafe-plugin"],
      load: {
        paths: ["/opt/openclaw/extensions"],
      },
      entries: {
        studio: {
          enabled: true,
          config: {
            chat: {
              allowHostManagementExecInStudioChat: false,
            },
            existingFlag: "keep-me",
          },
        },
        alpha: {
          enabled: true,
          config: {
            nested: {
              value: 42,
            },
          },
        },
      },
    },
  });

  resetStudioChatManagementPolicyState();
  const service = createConfigService(config);
  const response = service.patchConfig({
    plugins: {
      entries: {
        studio: {
          config: {
            chat: {
              allowHostManagementExecInStudioChat: true,
            },
          },
        },
      },
    },
  });

  const nextConfig = JSON.parse(
    fs.readFileSync(config.openclawConfigFile, "utf8"),
  );
  assert.equal(response.success, true);
  assert.equal(
    nextConfig.plugins.entries.studio.config.chat
      .allowHostManagementExecInStudioChat,
    true,
  );
  assert.equal(nextConfig.plugins.entries.studio.config.existingFlag, "keep-me");
  assert.deepEqual(nextConfig.plugins.entries.alpha.config.nested, {
    value: 42,
  });
  assert.deepEqual(nextConfig.plugins.allow, ["studio", "alpha"]);
  assert.deepEqual(nextConfig.plugins.load.paths, ["/opt/openclaw/extensions"]);
  assert.equal(nextConfig.models.providers.demo.apiKey, "secret-demo");
  assert.equal(getStudioChatGlobalHostManagementExecEnabled(), true);
});
