import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { createAgentsService } from "../../dist/apps/api/modules/agents/service.js";
import { createChannelsService } from "../../dist/apps/api/modules/channels/service.js";
import { createConfigService } from "../../dist/apps/api/modules/config/service.js";
import { createModelGatewayService } from "../../dist/apps/api/modules/model-gateway/service.js";

function makeTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "studio-openclaw-config-web-"));
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function createStudioConfig(root) {
  return {
    pluginId: "studio",
    pluginName: "Tracevane",
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

function baseOpenClawConfig(root) {
  return {
    agents: {
      defaults: {
        model: "openai/gpt-5.4",
        thinkingDefault: "medium",
        sandbox: {
          mode: "off",
          workspaceAccess: "rw",
        },
      },
      list: [],
    },
    tools: {
      profile: "full",
      exec: {
        host: "auto",
        ask: "off",
        security: "full",
        timeoutSec: 45,
      },
    },
    plugins: {
      entries: {
        studio: {
          enabled: true,
          config: {},
        },
      },
    },
    channels: {},
    tui: {
      footer: {
        showRemoteHost: true,
      },
    },
    messages: {
      usageTemplate: {
        enabled: true,
        template: "Tokens: {{tokens}}",
      },
    },
    gateway: {
      auth: {
        token: "test-gateway-token",
      },
    },
  };
}

function buildConfigPayload(summary) {
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
      extra: provider.extra,
    })),
    openclaw: summary.openclaw,
  };
}

function openClawValidateAvailable() {
  try {
    execFileSync("openclaw", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function validateOpenClawConfig(configFile, label) {
  try {
    execFileSync("openclaw", ["config", "validate"], {
      env: {
        ...process.env,
        OPENCLAW_CONFIG_PATH: configFile,
      },
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 30_000,
    });
  } catch (error) {
    const stdout = error?.stdout ? String(error.stdout) : "";
    const stderr = error?.stderr ? String(error.stderr) : "";
    assert.fail(
      [
        `${label} wrote an OpenClaw config that failed latest schema validation.`,
        stdout.trim(),
        stderr.trim(),
        `Config file: ${configFile}`,
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }
}

test(
  "web-facing OpenClaw config writers keep saves valid for the installed schema",
  { skip: openClawValidateAvailable() ? false : "openclaw CLI is not available" },
  async () => {
    const root = makeTempRoot();
    const config = createStudioConfig(root);
    writeJson(config.openclawConfigFile, baseOpenClawConfig(root));
    validateOpenClawConfig(config.openclawConfigFile, "baseline");

    const configService = createConfigService(config);
    configService.saveConfig(buildConfigPayload(configService.getSummary()));
    validateOpenClawConfig(config.openclawConfigFile, "System Config save");

    const channelService = createChannelsService(config);
    channelService.createChannel("discord", true);
    validateOpenClawConfig(config.openclawConfigFile, "Channels create provider");
    channelService.updateChannel("discord", {
      enabled: true,
      streaming: "partial",
      dmPolicy: "open",
      groupPolicy: "open",
      responsePrefix: "[oc]",
      config: {
        mentionRequired: true,
      },
    });
    validateOpenClawConfig(config.openclawConfigFile, "Channels provider settings save");
    channelService.updateAccount("discord", "default", {
      id: "default",
      enabled: true,
      streaming: "partial",
      dmPolicy: "open",
      groupPolicy: "open",
    });
    validateOpenClawConfig(config.openclawConfigFile, "Channels account create");
    await channelService.updateAccountAccess("discord", "default", {
      allowFrom: ["discord:user:test"],
      groupAllowFrom: ["discord:guild:test"],
    });
    validateOpenClawConfig(config.openclawConfigFile, "Channels access save");
    channelService.createBinding({
      type: "agent",
      agentId: "main",
      channel: "discord",
      accountId: "default",
      peerKind: "direct",
      peerId: "user-test",
      label: "Writer route",
      comment: "Schema validation smoke",
    });
    validateOpenClawConfig(config.openclawConfigFile, "Channels binding save");

    const agentService = createAgentsService(config);
    agentService.createAgent({
      id: "writer",
      name: "Writer",
      model: "openai/gpt-5.4",
      sandboxMode: "off",
      workspaceAccess: "rw",
      toolsProfile: "coding",
      fsWorkspaceOnly: true,
      thinkingDefault: "medium",
      verboseDefault: "full",
      identity: {
        name: "Writer",
        role: "Validation agent",
        mission: "Keep OpenClaw config writes schema-valid.",
      },
    });
    validateOpenClawConfig(config.openclawConfigFile, "Agents create save");
    agentService.updateAgent("writer", {
      name: "Writer Updated",
      model: "openai/gpt-5.4-mini",
      sandboxMode: "off",
      workspaceAccess: "rw",
      toolsProfile: "minimal",
      fsWorkspaceOnly: true,
      heartbeat: {
        every: "30m",
      },
      runtime: {
        type: "default",
      },
    });
    validateOpenClawConfig(config.openclawConfigFile, "Agents update save");

    const modelGatewayService = createModelGatewayService(config, {
      homeDir: path.join(root, "home"),
    });
    modelGatewayService.upsertProvider(undefined, {
      provider: {
        id: "compat-provider",
        name: "Compat Provider",
        enabled: true,
        appScopes: ["openclaw"],
        baseUrl: "https://compat.example.test/v1",
        apiFormat: "openai_chat",
        authStrategy: "bearer",
        models: {
          defaultModel: "compat-main",
          models: [
            {
              id: "compat-main",
              contextWindow: 128000,
              maxOutputTokens: 8192,
            },
          ],
        },
      },
      secret: {
        apiKey: "sk-upstream-compat",
      },
    });
    modelGatewayService.updateClientAuth(undefined, {
      apiKey: "sk-local-compat",
    });
    modelGatewayService.updateAppConnectionProfile(undefined, {
      profile: {
        model: "compat-main",
        appModels: {
          openclaw: "compat-main",
        },
        contextWindow: 128000,
        autoCompactTokenLimit: 100000,
        maxOutputTokens: 8192,
        reasoningEffort: "high",
      },
    });
    modelGatewayService.applyAppConnection(undefined, {
      appId: "openclaw",
    });
    validateOpenClawConfig(config.openclawConfigFile, "Model Gateway OpenClaw app connection apply");

    const finalConfig = readJson(config.openclawConfigFile);
    assert.equal(finalConfig.gateway.auth.token, "test-gateway-token");
    assert.equal(finalConfig.messages.usageTemplate.enabled, true);
    assert.equal(finalConfig.tui.footer.showRemoteHost, true);
    assert.equal(finalConfig.gateway.webchat, undefined);
  },
);
