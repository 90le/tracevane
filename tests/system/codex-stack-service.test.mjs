import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { createCodexStackService, isCodexStackServiceError } from "../../dist/apps/api/modules/codex-stack/service.js";

function makeTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "studio-codex-stack-"));
}

function writeFile(file, value, mode = 0o644) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, value, { mode });
}

function writeJson(file, value) {
  writeFile(file, `${JSON.stringify(value, null, 2)}\n`, 0o600);
}

function tomlTopLevel(source) {
  const firstSection = source.search(/^\s*\[[^\]]+\]\s*$/m);
  return firstSection === -1 ? source : source.slice(0, firstSection);
}

function createStudioConfig(root) {
  const openclawRoot = path.join(root, ".openclaw");
  fs.mkdirSync(openclawRoot, { recursive: true });
  const projectRoot = path.join(root, "studio");
  return {
    pluginId: "studio",
    pluginName: "OpenClaw Studio",
    version: "0.1.0",
    port: 3760,
    autoStart: true,
    openclawRoot,
    openclawConfigFile: path.join(openclawRoot, "openclaw.json"),
    projectRoot,
    webDistDir: path.join(projectRoot, "apps/web-vue/dist"),
    gatewayPort: 31879,
    gatewayWsUrl: "ws://127.0.0.1:31879",
    gatewayControlUiBasePath: "",
    transport: {
      standalone: { enabled: true, port: 3760 },
      gateway: { enabled: true, basePath: "/studio" },
    },
  };
}

function createBundledInstaller(config, channel) {
  const root = path.join(config.projectRoot, "resources/codex-stack", "codex-docs");
  writeFile(path.join(root, "VERSION"), `${channel || "single"}-test-bundle\n`);
  writeFile(path.join(root, "resources/scripts/auto-setup.sh"), "#!/usr/bin/env bash\necho setup\n", 0o755);
  writeFile(path.join(root, "resources/scripts/health-check.sh"), "#!/usr/bin/env bash\necho '  OK fake check'\n", 0o755);
  writeFile(path.join(root, "resources/scripts/finish-cc-connect-setup.sh"), "#!/usr/bin/env bash\necho finalize\n", 0o755);
  writeFile(path.join(root, "resources/bin/cc-connect"), "bin\n", 0o755);
}

async function waitForJob(service, jobId, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const job = service.getJob(jobId);
    if (job && !["queued", "running"].includes(job.status)) return job;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`job ${jobId} did not finish within ${timeoutMs}ms`);
}

function createGeneratedStackFiles(root) {
  writeFile(path.join(root, ".codex/config.toml"), `
model = "glm-5.1"
base_url = "http://127.0.0.1:18796/v1"

	[model_providers.cpa]
	experimental_bearer_token = "secret-cpa-key-123456"
	model_context_window = 1050000
	model_auto_compact_token_limit = 945000
	`);
  writeFile(path.join(root, ".cli-proxy-api/config.yaml"), `
port: 8317
api-keys:
- "secret-cpa-key-123456"
openai-compatibility:
- name: "bigmodel"
  models:
  - name: "glm-5.1"
  - name: "gpt-5.4"
`);
  writeFile(path.join(root, ".cc-connect/config.toml"), `
[[projects]]
name = "main"
[projects.agent.options]
model = "glm-5.1"
`);
}

function createBoundCcConnectConfig(root) {
  writeFile(path.join(root, ".cc-connect/config.toml"), `
[[projects]]
name = "main"
[projects.agent.options]
model = "glm-5.1"

[[projects.platforms]]
type = "dmwork"
[projects.platforms.options]
account_id = "test"
`);
}

function writeActiveCodexStackJob(config, id = "active-job", overrides = {}) {
  const jobsDir = path.join(config.openclawRoot, "studio/codex-stack/jobs");
  writeJson(path.join(jobsDir, `${id}.json`), {
    id,
    kind: "repair",
    status: "running",
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    finishedAt: null,
    pid: null,
    commandLabel: "repair: run-smoke-matrix",
    logPath: path.join(jobsDir, `${id}.log`),
    logTail: "",
    error: null,
    ...overrides,
  });
}

function compactSmokeResponse(body) {
  return {
    id: "compact_ok",
    status: "completed",
    output: [
      {
        type: "message",
        role: "assistant",
        content: [
          {
            type: "output_text",
            text: `stable compact summary preserving studio-compact-smoke-${body.model}`,
          },
        ],
      },
    ],
  };
}

function passedSmokeChecks(checkedAt) {
  return ["cpa-health", "compact-health", "cpa-chat", "compact-non-stream", "compact-stream", "compact-compact"].map((id) => ({
    id,
    label: id,
    status: "passed",
    startedAt: checkedAt,
    finishedAt: checkedAt,
    error: null,
  }));
}

async function withMockFetch(handler, task) {
  const original = globalThis.fetch;
  globalThis.fetch = handler;
  try {
    await task();
  } finally {
    globalThis.fetch = original;
  }
}

async function withFakeSystemctl(task) {
  const root = makeTempRoot();
  const bin = path.join(root, "bin");
  const logFile = path.join(root, "systemctl.log");
  fs.mkdirSync(bin, { recursive: true });
  writeFile(
    path.join(bin, "systemctl"),
    [
      "#!/usr/bin/env bash",
      "printf '%s\\n' \"$*\" >> \"$FAKE_SYSTEMCTL_LOG\"",
      "exit 0",
      "",
    ].join("\n"),
    0o755,
  );
  const previousPath = process.env.PATH;
  const previousLog = process.env.FAKE_SYSTEMCTL_LOG;
  process.env.PATH = `${bin}${path.delimiter}${previousPath || ""}`;
  process.env.FAKE_SYSTEMCTL_LOG = logFile;
  try {
    await task({
      logFile,
      readCalls: () => fs.existsSync(logFile) ? fs.readFileSync(logFile, "utf8").trim().split(/\r?\n/).filter(Boolean) : [],
    });
  } finally {
    if (previousPath === undefined) delete process.env.PATH;
    else process.env.PATH = previousPath;
    if (previousLog === undefined) delete process.env.FAKE_SYSTEMCTL_LOG;
    else process.env.FAKE_SYSTEMCTL_LOG = previousLog;
  }
}

async function withScriptedSystemctl(scriptBody, task) {
  const root = makeTempRoot();
  const bin = path.join(root, "bin");
  const logFile = path.join(root, "systemctl.log");
  fs.mkdirSync(bin, { recursive: true });
  writeFile(
    path.join(bin, "systemctl"),
    [
      "#!/usr/bin/env bash",
      "printf '%s\\n' \"$*\" >> \"$FAKE_SYSTEMCTL_LOG\"",
      scriptBody,
      "",
    ].join("\n"),
    0o755,
  );
  const previousPath = process.env.PATH;
  const previousLog = process.env.FAKE_SYSTEMCTL_LOG;
  process.env.PATH = `${bin}${path.delimiter}${previousPath || ""}`;
  process.env.FAKE_SYSTEMCTL_LOG = logFile;
  try {
    await task({
      logFile,
      readCalls: () => fs.existsSync(logFile) ? fs.readFileSync(logFile, "utf8").trim().split(/\r?\n/).filter(Boolean) : [],
    });
  } finally {
    if (previousPath === undefined) delete process.env.PATH;
    else process.env.PATH = previousPath;
    if (previousLog === undefined) delete process.env.FAKE_SYSTEMCTL_LOG;
    else process.env.FAKE_SYSTEMCTL_LOG = previousLog;
  }
}

test("codex stack summary resolves bundled installer and masks secrets", async () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  writeJson(config.openclawConfigFile, {
    plugins: {
      entries: {
        studio: {
          config: {
            codexStack: {
              allowManagementActions: false,
            },
          },
        },
      },
    },
  });
  createBundledInstaller(config, "official");
  createBundledInstaller(config, "dmwork");
  createGeneratedStackFiles(root);

  const service = createCodexStackService(config);
  const summary = await service.getSummary();

  assert.equal(summary.installer.kind, "bundled");
  assert.equal(summary.installer.requiredFilesPresent, true);
  assert.equal(summary.management.enabled, false);
  assert.equal(summary.secrets.cpaProxyKey.hasSecret, true);
  assert.equal(summary.secrets.codexAuth.hasSecret, false);
  assert.equal(summary.context.codexOneMillionEnabled, true);
  assert.equal(summary.models.defaultModel, "glm-5.1");
  assert.equal(summary.models.recommendedFrontier, "gpt-5.5");
  assert.equal(summary.installer.cpaLatestVersion, null);
  assert.notEqual(summary.secrets.cpaProxyKey.masked, "secret-cpa-key-123456");
  assert.ok(summary.models.available.includes("glm-5.1"));
});

test("codex stack summary uses live Compact /v1/models as model catalog", async () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  writeJson(config.openclawConfigFile, {});
  createBundledInstaller(config, "official");
  createBundledInstaller(config, "dmwork");
  createGeneratedStackFiles(root);

  await withMockFetch(async (url) => {
    const requestUrl = String(url);
    if (requestUrl.endsWith("/v1/models")) {
      return new Response(JSON.stringify({
        data: [
          { id: "live-cpa-model" },
          { id: "live-cpa-fast" },
        ],
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response("ok", { status: 200 });
  }, async () => {
    const service = createCodexStackService(config);
    const summary = await service.getSummary();

    assert.equal(summary.models.source, "live");
    assert.equal(summary.models.live, true);
    assert.equal(summary.models.error, null);
    assert.equal(summary.models.endpoint, "http://127.0.0.1:18796/v1/models");
    assert.ok(summary.models.available.includes("live-cpa-model"));
    assert.ok(summary.models.available.includes("live-cpa-fast"));
  });
});

test("codex stack default model follows the user/openclaw default before live catalog fallbacks", async () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  writeJson(config.openclawConfigFile, { defaultModel: "openclaw-default-model" });
  createBundledInstaller(config, "official");
  createBundledInstaller(config, "dmwork");

  await withMockFetch(async (url) => {
    const requestUrl = String(url);
    if (requestUrl.endsWith("/v1/models")) {
      return new Response(JSON.stringify({
        data: [{ id: "kimi-k2.6" }, { id: "glm-5.1" }, { id: "gpt-5.5" }],
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response("ok", { status: 200 });
  }, async () => {
    const service = createCodexStackService(config);
    const summary = await service.getSummary();

    assert.equal(summary.models.current, "openclaw-default-model");
    assert.equal(summary.models.defaultModel, "openclaw-default-model");
  });

  await withMockFetch(async (url) => {
    const requestUrl = String(url);
    if (requestUrl.endsWith("/v1/models")) {
      return new Response(JSON.stringify({
        data: [{ id: "glm-5.1" }, { id: "other-model" }],
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response("ok", { status: 200 });
  }, async () => {
    const service = createCodexStackService(config);
    const summary = await service.getSummary();

    assert.equal(summary.models.current, "openclaw-default-model");
    assert.equal(summary.models.defaultModel, "openclaw-default-model");
  });
});

test("codex stack can derive the target model from OpenClaw provider model catalog", async () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  writeJson(config.openclawConfigFile, {
    models: {
      providers: {
        custom: {
          baseUrl: "https://gateway.example.test/v1",
          models: [
            { id: "custom-coder-pro", name: "Custom Coder Pro" },
            "custom-fast",
          ],
        },
      },
    },
  });
  createBundledInstaller(config, "official");
  createBundledInstaller(config, "dmwork");

  await withMockFetch(async (url) => {
    const requestUrl = String(url);
    if (requestUrl.endsWith("/v1/models")) {
      return new Response("unavailable", { status: 503 });
    }
    return new Response("ok", { status: 200 });
  }, async () => {
    const service = createCodexStackService(config);
    const summary = await service.getSummary();

    assert.equal(summary.models.source, "config");
    assert.equal(summary.models.current, "custom-coder-pro");
    assert.equal(summary.models.defaultModel, "custom-coder-pro");
    assert.equal(summary.profile.defaultModel, "custom-coder-pro");
    assert.ok(summary.models.available.includes("custom-fast"));
    assert.ok(!summary.models.available.includes("kimi-k2.6"));
    assert.ok(!summary.models.available.includes("glm-5.1"));
  });
});

test("codex stack summary falls back to config models when /v1/models is unavailable", async () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  writeJson(config.openclawConfigFile, {});
  createBundledInstaller(config, "official");
  createBundledInstaller(config, "dmwork");
  createGeneratedStackFiles(root);

  await withMockFetch(async (url) => {
    const requestUrl = String(url);
    if (requestUrl.endsWith("/v1/models")) {
      return new Response("unavailable", { status: 503 });
    }
    return new Response("ok", { status: 200 });
  }, async () => {
    const service = createCodexStackService(config);
    const summary = await service.getSummary();

    assert.equal(summary.models.source, "config");
    assert.equal(summary.models.live, false);
    assert.match(summary.models.error, /HTTP 503/);
    assert.ok(summary.models.available.includes("glm-5.1"));
    assert.ok(summary.models.available.includes("gpt-5.4"));
  });
});

test("codex stack summary recommends install when required stack files are missing", async () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  writeJson(config.openclawConfigFile, {});
  createBundledInstaller(config, "official");
  createBundledInstaller(config, "dmwork");

  await withMockFetch(async () => new Response("not found", { status: 404 }), async () => {
    const service = createCodexStackService(config);
    const summary = await service.getSummary();

    assert.equal(summary.overallStatus, "needs-setup");
    assert.equal(summary.recommendation.kind, "install");
    assert.equal(summary.recommendation.section, "install");
    assert.equal(summary.recommendation.primaryAction, "open-install");
    assert.equal(summary.recommendation.requiresManagement, false);
    assert.ok(summary.recommendation.reasonCodes.includes("needs-setup"));
  });
});

test("codex stack management guard blocks mutations until explicitly enabled", async () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  writeJson(config.openclawConfigFile, {});
  createBundledInstaller(config, "official");
  createBundledInstaller(config, "dmwork");

  const service = createCodexStackService(config);
  await assert.rejects(
    service.controlService(undefined, "cli-proxy-api.service", "restart"),
    (error) => isCodexStackServiceError(error) && error.statusCode === 403,
  );

  const response = await service.enableManagement();
  assert.equal(response.ok, true);
  const summary = await service.getSummary();
  assert.equal(summary.management.enabled, true);
});

test("codex stack refuses smoke matrix when no target model is selected", async () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  writeJson(config.openclawConfigFile, {
    plugins: {
      entries: {
        studio: {
          config: {
            codexStack: {
              allowManagementActions: true,
            },
          },
        },
      },
    },
  });
  createBundledInstaller(config, "official");
  createBundledInstaller(config, "dmwork");

  const service = createCodexStackService(config);
  const response = await service.startRepair(undefined, { actions: ["run-smoke-matrix"] });
  const job = await waitForJob(service, response.job.id);

  assert.equal(job.status, "failed");
  assert.match(job.error || "", /选择 CPA 目标模型/);
  assert.doesNotMatch(job.logTail, /glm-5\.1|kimi-k2\.6/);
});

test("codex stack service methods normalize missing payloads before reading fields", async () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  writeJson(config.openclawConfigFile, {
    plugins: {
      entries: {
        studio: {
          config: {
            codexStack: {
              allowManagementActions: true,
            },
          },
        },
      },
    },
  });
  createBundledInstaller(config, "official");
  createGeneratedStackFiles(root);
  createBoundCcConnectConfig(root);

  const service = createCodexStackService(config);
  await assert.rejects(
    () => service.startRepair(undefined, undefined),
    (error) => isCodexStackServiceError(error)
      && error.code === "codex_stack_empty_repair"
      && error.statusCode === 400,
  );

  const response = await service.patchConfig(undefined, undefined);
  assert.equal(response.ok, true);
  assert.equal(response.restartRequiredUnits?.length, 0);
});

test("codex stack check runs bundled health script and redacts known secrets", async () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  writeJson(config.openclawConfigFile, {});
  createBundledInstaller(config, "dmwork");
  createGeneratedStackFiles(root);
  writeFile(
    path.join(config.projectRoot, "resources/codex-stack/codex-docs/resources/scripts/health-check.sh"),
    "#!/usr/bin/env bash\necho '  OK secret-cpa-key-123456 is hidden'\n",
    0o755,
  );

  const service = createCodexStackService(config);
  const check = await service.runCheck();

  assert.equal(check.ok, true);
  assert.match(check.outputTail, /\[REDACTED\]/);
  assert.doesNotMatch(check.outputTail, /secret-cpa-key-123456/);
});

test("codex stack rejects unknown service ids and actions before shell execution", async () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  writeJson(config.openclawConfigFile, {
    plugins: {
      entries: {
        studio: {
          config: {
            codexStack: {
              allowManagementActions: true,
            },
          },
        },
      },
    },
  });
  createBundledInstaller(config, "official");
  createBundledInstaller(config, "dmwork");

  const service = createCodexStackService(config);
  await assert.rejects(
    service.controlService(undefined, "evil.service", "restart"),
    (error) => isCodexStackServiceError(error) && error.code === "codex_stack_invalid_service",
  );
  await assert.rejects(
    service.controlService(undefined, "cli-proxy-api.service", "reload-or-run-shell"),
    (error) => isCodexStackServiceError(error) && error.code === "codex_stack_invalid_service_action",
  );
});

test("codex stack service enable keeps running state and autostart in one action", async () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  writeJson(config.openclawConfigFile, {
    plugins: {
      entries: {
        studio: {
          config: {
            codexStack: {
              allowManagementActions: true,
            },
          },
        },
      },
    },
  });
  createBundledInstaller(config, "official");
  createBundledInstaller(config, "dmwork");
  createGeneratedStackFiles(root);

  await withScriptedSystemctl(
    [
      "case \"$*\" in",
      "  \"--user enable --now cli-proxy-api.service\") echo \"enabled\"; exit 0 ;;",
      "  \"--user list-unit-files\"*) echo \"${@: -1} enabled\"; exit 0 ;;",
      "  \"--user is-enabled\"*) echo \"enabled\"; exit 0 ;;",
      "  \"--user is-active\"*) echo \"active\"; exit 0 ;;",
      "esac",
      "exit 0",
    ].join("\n"),
    async ({ readCalls }) => {
      const service = createCodexStackService(config);

      const response = await service.controlService(undefined, "cli-proxy-api.service", "enable");
      const calls = readCalls();

      assert.equal(response.ok, true);
      assert.ok(calls.includes("--user enable --now cli-proxy-api.service"));
      assert.ok(!calls.includes("--user enable cli-proxy-api.service"));
    },
  );
});

test("codex stack service status does not treat inactive as active", async () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  writeJson(config.openclawConfigFile, {
    plugins: {
      entries: {
        studio: {
          config: {
            codexStack: {
              allowManagementActions: true,
            },
          },
        },
      },
    },
  });
  createBundledInstaller(config, "official");
  createBundledInstaller(config, "dmwork");
  createGeneratedStackFiles(root);

  await withScriptedSystemctl(
    [
      "case \"$*\" in",
      "  \"--user list-unit-files\"*) echo \"cli-proxy-api.service enabled\"; exit 0 ;;",
      "  \"--user is-enabled\"*) echo \"enabled\"; exit 0 ;;",
      "  \"--user is-active\"*) echo \"inactive\"; exit 3 ;;",
      "esac",
      "exit 0",
    ].join("\n"),
    async () => {
      const service = createCodexStackService(config);
      const summary = await service.getSummary();
      const cpa = summary.services.find((item) => item.id === "cli-proxy-api.service");
      const compact = summary.services.find((item) => item.id === "cpa-compact-proxy.service");
      const watchdog = summary.services.find((item) => item.id === "codex-stack-watchdog.timer");
      const watchdogComponent = summary.components.find((item) => item.id === "watchdog");

      assert.equal(cpa?.active, false);
      assert.equal(compact?.active, false);
      assert.equal(watchdog?.active, false);
      assert.equal(watchdogComponent?.label, "Background Watchdog");
      assert.deepEqual(watchdogComponent?.notes, ["legacy watchdog is not part of the Studio Gateway daemon path"]);
    },
  );
});

test("codex stack summary exposes codex run readiness for chat long tasks and compaction", async () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  const checkedAt = new Date().toISOString();
  writeJson(config.openclawConfigFile, {
    plugins: {
      entries: {
        studio: {
          config: {
            codexStack: {
              allowManagementActions: true,
            },
          },
        },
      },
    },
  });
  writeJson(path.join(root, ".codex/auth.json"), {
    auth_mode: "apikey",
    OPENAI_API_KEY: "secret-cpa-key-123456",
  });
  writeJson(path.join(config.openclawRoot, "studio/codex-stack/profile.json"), {
    lastSmokeMatrix: {
      status: "passed",
      checkedAt,
      requiredModels: ["glm-5.1", "kimi-k2.6"],
      attachEligible: true,
      models: ["glm-5.1", "kimi-k2.6"].map((model) => ({
        model,
        status: "passed",
        startedAt: checkedAt,
        finishedAt: checkedAt,
        checks: passedSmokeChecks(checkedAt),
        error: null,
      })),
    },
  });
  createBundledInstaller(config, "official");
  createBundledInstaller(config, "dmwork");
  createGeneratedStackFiles(root);
  writeFile(path.join(root, ".local/bin/cli-proxy-api"), "#!/usr/bin/env bash\necho cpa\n", 0o755);
  writeFile(path.join(root, ".local/bin/cpa-compact-proxy.mjs"), "#!/usr/bin/env node\nconsole.log('compact')\n", 0o755);
  for (const dir of [
    "resources/codex-stack/cc-connect-source/agent/codex",
    "resources/codex-stack/cc-connect-source/agent/claudecode",
    "resources/codex-stack/cc-connect-source/platform/feishu",
    "resources/codex-stack/cc-connect-source/platform/weixin",
    "resources/codex-stack/cc-connect-source/platform/dmwork",
  ]) {
    fs.mkdirSync(path.join(config.projectRoot, dir), { recursive: true });
  }
  writeFile(path.join(root, ".cc-connect/config.toml"), `
[[providers]]
name = "cpa"
api_key = "secret-cpa-key-123456"
base_url = "http://127.0.0.1:18796/v1"
codex.env_key = "OPENAI_API_KEY"

[[projects]]
name = "main"
[projects.agent.options]
model = "glm-5.1"

[[projects.platforms]]
type = "dmwork"
[projects.platforms.options]
account_id = "test"
`);

  await withScriptedSystemctl(
    [
      "case \"$*\" in",
      "  \"--user list-unit-files\"*) echo \"${@: -1} enabled\"; exit 0 ;;",
      "  \"--user is-enabled\"*) echo \"enabled\"; exit 0 ;;",
      "  \"--user is-active\"*) echo \"active\"; exit 0 ;;",
      "esac",
      "exit 0",
    ].join("\n"),
    async () => {
      await withMockFetch(async (input) => {
        const url = String(input);
        if (url.includes("/healthz")) return new Response("ok", { status: 200 });
        if (url.includes("/v1/models")) {
          return new Response(JSON.stringify({ data: [{ id: "glm-5.1" }, { id: "kimi-k2.6" }] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response("not found", { status: 404 });
      }, async () => {
        const service = createCodexStackService(config);
        const summary = await service.getSummary();

        assert.equal(summary.gateway.serviceName, "studio-agent-gateway");
        assert.equal(summary.gateway.baseUrl, "http://127.0.0.1:18796");
        assert.equal(summary.gateway.statusEndpoint, "http://127.0.0.1:18796/gateway/status");
        assert.equal(summary.gateway.live, true);
        assert.equal(summary.gateway.protocols.openaiChatCompletions, true);
        assert.equal(summary.gateway.protocols.openaiResponses, true);
        assert.equal(summary.gateway.protocols.openaiResponsesCompact, true);
        assert.equal(summary.gateway.protocols.anthropicMessages, true);
        assert.equal(summary.gateway.protocols.anthropicMessagesStreaming, true);
        assert.equal(summary.gateway.integrations.codexCliBaseUrl, "http://127.0.0.1:18796/v1");
        assert.equal(summary.gateway.integrations.claudeCliBaseUrl, "http://127.0.0.1:18796");
        assert.equal(summary.gateway.integrations.ccConnectProviderBaseUrl, "http://127.0.0.1:18796/v1");
        assert.equal(summary.gateway.integrations.ccConnectSourceReady, true);
        assert.ok(summary.gateway.integrations.ccConnectSourcePath.endsWith("resources/codex-stack/cc-connect-source"));
        assert.ok(summary.gateway.integrations.ccConnectSourceAgentTypes.includes("codex"));
        assert.ok(summary.gateway.integrations.ccConnectSourceAgentTypes.includes("claudecode"));
        assert.ok(summary.gateway.integrations.ccConnectSourcePlatforms.includes("feishu"));
        assert.ok(summary.gateway.integrations.ccConnectSourcePlatforms.includes("weixin"));
        assert.ok(summary.gateway.integrations.ccConnectSourcePlatforms.includes("dmwork"));
        assert.ok(summary.gateway.integrations.channelSurfaces.includes("feishu"));
        assert.ok(summary.gateway.protocolCatalog.some((protocol) => protocol.id === "anthropic-messages" && protocol.streaming));
        assert.ok(summary.gateway.clientAdapters.some((adapter) => adapter.id === "codex-cli" && adapter.protocol === "openai-responses"));
        assert.ok(summary.gateway.clientAdapters.some((adapter) => adapter.id === "claude-cli" && adapter.protocol === "anthropic-messages"));
        assert.ok(summary.gateway.providerRoutes.some((provider) => provider.id === "cpa" && provider.agentTypes.includes("codex")));
        assert.ok(summary.gateway.modelRoutes.some((model) => model.label === "glm-5.1"));
        assert.ok(summary.gateway.channelTemplates.some((channel) => channel.id === "bridge"));
        const gatewayComponent = summary.components.find((component) => component.id === "agent-gateway");
        assert.equal(gatewayComponent?.status, "ok");
        assert.ok(gatewayComponent?.notes.includes("Claude Messages"));

        assert.equal(summary.runReadiness.level, "ready");
        assert.equal(summary.runReadiness.modes.find((mode) => mode.id === "chat")?.ready, true);
        assert.equal(summary.runReadiness.modes.find((mode) => mode.id === "long-task")?.ready, true);
        assert.equal(summary.runReadiness.modes.find((mode) => mode.id === "compaction")?.ready, true);
        assert.equal(summary.runReadiness.modes.find((mode) => mode.id === "cc-agent-task")?.ready, true);
        assert.equal(summary.runReadiness.modes.find((mode) => mode.id === "chat")?.actionHint?.kind, "run-check");
        assert.equal(summary.runReadiness.modes.find((mode) => mode.id === "long-task")?.actionHint?.kind, "run-check");
        assert.equal(summary.runReadiness.modes.find((mode) => mode.id === "cc-agent-task")?.actionHint?.section, "cc-connect");
        assert.deepEqual(
          summary.runReadiness.modes.find((mode) => mode.id === "chat")?.dependencies?.map((dependency) => dependency.checkId),
          ["service-order", "local-compact", "codex-provider", "codex-auth", "proxy-loopback", "codex-transport", "smoke-matrix"],
        );
        assert.deepEqual(
          summary.runReadiness.modes.find((mode) => mode.id === "long-task")?.dependencies?.map((dependency) => dependency.checkId),
          ["service-order", "local-compact", "codex-provider", "codex-auth", "proxy-loopback", "codex-transport", "smoke-matrix", "context-window", "job-lock"],
        );
        assert.deepEqual(
          summary.runReadiness.modes.find((mode) => mode.id === "compaction")?.dependencies?.map((dependency) => dependency.checkId),
          ["service-order", "local-compact", "codex-provider", "codex-auth", "proxy-loopback", "codex-transport", "smoke-matrix", "context-window"],
        );
        assert.deepEqual(
          summary.runReadiness.modes.find((mode) => mode.id === "cc-agent-task")?.dependencies?.map((dependency) => dependency.checkId),
          ["service-order", "local-compact", "codex-provider", "codex-auth", "proxy-loopback", "codex-transport", "smoke-matrix", "cc-agent-route"],
        );
        assert.equal(summary.runReadiness.checks.find((check) => check.id === "service-order")?.status, "pass");
        assert.equal(summary.runReadiness.checks.find((check) => check.id === "codex-provider")?.status, "pass");
        assert.equal(summary.runReadiness.checks.find((check) => check.id === "codex-auth")?.status, "pass");
        assert.equal(summary.runReadiness.checks.find((check) => check.id === "smoke-matrix")?.status, "pass");
        assert.equal(summary.runReadiness.checks.find((check) => check.id === "cc-agent-route")?.status, "pass");
        assert.equal(summary.runReadiness.checks.find((check) => check.id === "smoke-matrix")?.actionHint.kind, "open-section");
        assert.equal(summary.runReadiness.checks.find((check) => check.id === "cc-agent-route")?.actionHint.section, "cc-connect");
      });
    },
  );
});

test("codex stack keeps restored official Codex provider out of CPA repair state", async () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  const checkedAt = new Date().toISOString();
  writeJson(config.openclawConfigFile, {
    env: {
      NO_PROXY: "localhost,127.0.0.1,::1",
    },
  });
  writeJson(path.join(root, ".codex/auth.json"), {
    auth_mode: "apikey",
    OPENAI_API_KEY: "official-chatgpt-key",
  });
  writeJson(path.join(config.openclawRoot, "studio/codex-stack/profile.json"), {
    lastSmokeMatrix: {
      status: "passed",
      checkedAt,
      requiredModels: ["glm-5.1", "kimi-k2.6"],
      attachEligible: true,
      models: ["glm-5.1", "kimi-k2.6"].map((model) => ({
        model,
        status: "passed",
        startedAt: checkedAt,
        finishedAt: checkedAt,
        checks: passedSmokeChecks(checkedAt),
        error: null,
      })),
    },
  });
  createBundledInstaller(config, "official");
  createBundledInstaller(config, "dmwork");
  createGeneratedStackFiles(root);
  writeFile(path.join(root, ".codex/config.toml"), `
model = "gpt-5.5"
model_context_window = 1050000
model_auto_compact_token_limit = 945000
responses_websockets = false
enable_request_compression = false

[model_providers.cpa]
base_url = "http://127.0.0.1:18796/v1"
wire_api = "responses"
supports_websockets = false
experimental_bearer_token = "secret-cpa-key-123456"
`);
  writeFile(path.join(root, ".local/bin/cli-proxy-api"), "#!/usr/bin/env bash\necho cpa\n", 0o755);
  writeFile(path.join(root, ".local/bin/cpa-compact-proxy.mjs"), "#!/usr/bin/env node\nconsole.log('compact')\n", 0o755);
  writeFile(path.join(root, ".cc-connect/config.toml"), `
[[providers]]
name = "cpa"
api_key = "secret-cpa-key-123456"
base_url = "http://127.0.0.1:18796/v1"
codex.env_key = "OPENAI_API_KEY"

[[projects]]
name = "main"
[projects.agent.options]
model = "glm-5.1"

[[projects.platforms]]
type = "dmwork"
[projects.platforms.options]
account_id = "test"
`);
  const commandBin = path.join(root, "fake-bin");
  writeFile(path.join(commandBin, "codex"), "#!/usr/bin/env bash\necho 'codex 1.0.0'\n", 0o755);
  writeFile(path.join(commandBin, "omx"), "#!/usr/bin/env bash\necho 'omx 1.0.0'\n", 0o755);
  writeFile(path.join(commandBin, "cc-connect"), "#!/usr/bin/env bash\necho 'cc-connect 1.0.0'\n", 0o755);

  const previousPath = process.env.PATH;
  process.env.PATH = `${commandBin}${path.delimiter}${previousPath || ""}`;
  try {
    await withScriptedSystemctl(
      [
        "case \"$*\" in",
        "  \"--user list-unit-files\"*) echo \"${@: -1} enabled\"; exit 0 ;;",
        "  \"--user is-enabled\"*) echo \"enabled\"; exit 0 ;;",
        "  \"--user is-active\"*) echo \"active\"; exit 0 ;;",
        "esac",
        "exit 0",
      ].join("\n"),
      async () => {
        await withMockFetch(async (input) => {
          const url = String(input);
          if (url.includes("/healthz")) return new Response("ok", { status: 200 });
          if (url.includes("/v1/models")) {
            return new Response(JSON.stringify({ data: [{ id: "glm-5.1" }, { id: "kimi-k2.6" }] }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          }
          return new Response("not found", { status: 404 });
        }, async () => {
          const service = createCodexStackService(config);
          const summary = await service.getSummary();

          assert.equal(summary.overallStatus, "ready");
          assert.notEqual(summary.recommendation.kind, "repair");
          assert.ok(!summary.recommendation.reasonCodes.includes("codex-auth-mismatch"));
          assert.ok(!summary.warnings.some((warning) => warning.includes("auth.json OPENAI_API_KEY")));
          assert.equal(summary.models.current, "gpt-5.5");
          assert.equal(summary.runReadiness.level, "attention");
          assert.equal(summary.runReadiness.checks.find((check) => check.id === "codex-provider")?.status, "warn");
          assert.equal(summary.runReadiness.checks.find((check) => check.id === "codex-auth")?.status, "warn");
          assert.equal(summary.runReadiness.modes.find((mode) => mode.id === "chat")?.ready, false);
          assert.match(summary.runReadiness.modes.find((mode) => mode.id === "chat")?.detail || "", /官方 GPT 路径/);
          assert.deepEqual(summary.runReadiness.modes.find((mode) => mode.id === "chat")?.actionHint, {
            kind: "repair",
            label: "接管 Studio Gateway",
            repairActions: ["apply-codex-studio-after-smoke"],
          });
        });
      },
    );
  } finally {
    if (previousPath === undefined) delete process.env.PATH;
    else process.env.PATH = previousPath;
  }
});

test("codex stack blocks lifecycle-unsafe direct service starts and enables", async () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  writeJson(config.openclawConfigFile, {
    plugins: {
      entries: {
        studio: {
          config: {
            codexStack: {
              allowManagementActions: true,
            },
          },
        },
      },
    },
  });
  createBundledInstaller(config, "official");
  createBundledInstaller(config, "dmwork");
  createGeneratedStackFiles(root);

  await withScriptedSystemctl(
    [
      "case \"$*\" in",
      "  \"--user is-active cli-proxy-api.service\") echo \"inactive\"; exit 3 ;;",
      "  \"--user start cpa-compact-proxy.service\") echo \"should not start compact\"; exit 0 ;;",
      "  \"--user enable --now cpa-compact-proxy.service\") echo \"should not enable compact\"; exit 0 ;;",
      "esac",
      "exit 0",
    ].join("\n"),
    async ({ readCalls }) => {
      const service = createCodexStackService(config);

      for (const action of ["start", "enable"]) {
        await assert.rejects(
          service.controlService(undefined, "cpa-compact-proxy.service", action),
          (error) => isCodexStackServiceError(error)
            && error.code === "codex_stack_service_lifecycle_guard"
            && error.statusCode === 409,
        );
      }
      const calls = readCalls();
      assert.ok(!calls.includes("--user start cpa-compact-proxy.service"));
      assert.ok(!calls.includes("--user enable --now cpa-compact-proxy.service"));
    },
  );
});

test("codex stack blocks auto-managed units from generic service control", async () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  writeJson(config.openclawConfigFile, {
    plugins: {
      entries: {
        studio: {
          config: {
            codexStack: {
              allowManagementActions: true,
            },
          },
        },
      },
    },
  });

  await withScriptedSystemctl(
    [
      "case \"$*\" in",
      "  *\"cli-proxy-api-healthcheck.timer\"*) echo \"should not touch legacy healthcheck\"; exit 0 ;;",
      "  *\"codex-stack-watchdog.timer\"*) echo \"should not touch watchdog\"; exit 0 ;;",
      "esac",
      "exit 0",
    ].join("\n"),
    async ({ readCalls }) => {
      const service = createCodexStackService(config);

      for (const unitId of ["cli-proxy-api-healthcheck.timer", "codex-stack-watchdog.timer"]) {
        for (const action of ["start", "stop", "restart", "enable"]) {
          await assert.rejects(
            service.controlService(undefined, unitId, action),
            (error) => isCodexStackServiceError(error)
              && error.code === "codex_stack_managed_service_control_blocked"
              && error.statusCode === 409,
          );
        }
      }

      assert.deepEqual(readCalls(), []);
    },
  );
});

test("codex stack rejects concurrent mutating actions while a job is active", async () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  writeJson(config.openclawConfigFile, {
    plugins: {
      entries: {
        studio: {
          config: {
            codexStack: {
              allowManagementActions: true,
            },
          },
        },
      },
    },
  });
  createBundledInstaller(config, "official");
  createGeneratedStackFiles(root);
  createBoundCcConnectConfig(root);

  const service = createCodexStackService(config);
  writeActiveCodexStackJob(config);

  for (const run of [
    () => service.startInstall(undefined, { flags: { channel: "official" } }),
    () => service.startRepair(undefined, { actions: ["run-smoke-matrix"] }),
    () => service.finalizeCcConnect(undefined, { project: "main" }),
    () => service.controlService(undefined, "cli-proxy-api.service", "restart"),
    () => service.patchConfig(undefined, { defaultModel: "kimi-k2.6" }),
    () => service.patchCcConnectConfig(undefined, { raw: "language = \"zh\"\n" }),
  ]) {
    await assert.rejects(
      run(),
      (error) => isCodexStackServiceError(error)
        && error.code === "codex_stack_job_already_running"
        && error.statusCode === 409,
    );
  }
});

test("codex stack recovers queued startup jobs so stale locks do not block later actions", async () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  writeJson(config.openclawConfigFile, {
    plugins: {
      entries: {
        studio: {
          config: {
            codexStack: {
              allowManagementActions: true,
            },
          },
        },
      },
    },
  });
  createBundledInstaller(config, "official");
  createGeneratedStackFiles(root);
  createBoundCcConnectConfig(root);
  writeActiveCodexStackJob(config, "queued-before-restart", {
    status: "queued",
    commandLabel: "bash auto-setup.sh",
  });

  const service = createCodexStackService(config);
  const recovered = service.getJob("queued-before-restart");
  assert.equal(recovered?.status, "interrupted");
  assert.match(recovered?.error || "", /Studio restarted before this job reported completion/);

  const response = await service.patchConfig(undefined, { defaultModel: "kimi-k2.6" });
  assert.equal(response.ok, true);
  assert.equal(response.summary?.models.current, "kimi-k2.6");
});

test("codex stack recovers running startup jobs so stale locks do not block later actions", async () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  writeJson(config.openclawConfigFile, {
    plugins: {
      entries: {
        studio: {
          config: {
            codexStack: {
              allowManagementActions: true,
            },
          },
        },
      },
    },
  });
  createBundledInstaller(config, "official");
  createGeneratedStackFiles(root);
  createBoundCcConnectConfig(root);
  writeActiveCodexStackJob(config, "running-before-restart");

  const service = createCodexStackService(config);
  const recovered = service.getJob("running-before-restart");
  assert.equal(recovered?.status, "interrupted");
  assert.match(recovered?.error || "", /Studio restarted before this job reported completion/);

  const response = await service.patchConfig(undefined, { defaultModel: "kimi-k2.6" });
  assert.equal(response.ok, true);
  assert.equal(response.summary?.models.current, "kimi-k2.6");
});

test("codex stack rejects removed CPA lifecycle repair actions", async () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  writeJson(config.openclawConfigFile, {
    plugins: {
      entries: {
        studio: {
          config: {
            codexStack: {
              allowManagementActions: true,
            },
          },
        },
      },
    },
  });
  createBundledInstaller(config, "official");
  createBundledInstaller(config, "dmwork");
  createGeneratedStackFiles(root);

  const service = createCodexStackService(config);
  for (const action of [
    "pause-stack",
    "resume-stack",
    "restart-cpa",
    "restart-compact-proxy",
    "restart-watchdog",
    "repair-cpa-management",
    "repair-codex-transport",
  ]) {
    await assert.rejects(
      service.startRepair(undefined, { actions: [action] }),
      new RegExp(`Unsupported repair actions: ${action}`),
    );
  }
});

test("codex stack repair removes legacy CPA healthcheck artifacts", async () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  writeJson(config.openclawConfigFile, {
    plugins: {
      entries: {
        studio: {
          config: {
            codexStack: {
              allowManagementActions: true,
            },
          },
        },
      },
    },
  });
  createBundledInstaller(config, "official");
  createGeneratedStackFiles(root);
  const staleFiles = [
    path.join(root, ".config/systemd/user/cli-proxy-api-healthcheck.timer"),
    path.join(root, ".config/systemd/user/cli-proxy-api-healthcheck.service"),
    path.join(root, ".local/bin/cli-proxy-api-healthcheck"),
    path.join(root, ".config/systemd/user/cli-proxy-api.service.d/10-always-on.conf"),
    path.join(root, ".config/systemd/user/cpa-compact-proxy.service.d/10-always-on.conf"),
  ];
  for (const file of staleFiles) writeFile(file, "legacy\n", 0o755);

  await withFakeSystemctl(async ({ readCalls }) => {
    const service = createCodexStackService(config);
    const response = await service.startRepair(undefined, { actions: ["disable-legacy-healthcheck"] });
    const job = await waitForJob(service, response.job.id);

    assert.equal(job.status, "succeeded");
    assert.deepEqual(readCalls(), [
      "--user disable --now cli-proxy-api-healthcheck.timer",
      "--user stop cli-proxy-api-healthcheck.service",
      "--user daemon-reload",
    ]);
    assert.ok(staleFiles.every((file) => !fs.existsSync(file)));
    assert.match(job.logTail, /Removed legacy CPA healthcheck artifacts/);
  });
});

test("codex stack diagnoses legacy Codex transport but rejects removed CPA transport repair", async () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  writeJson(config.openclawConfigFile, {
    plugins: {
      entries: {
        studio: {
          config: {
            codexStack: {
              allowManagementActions: true,
            },
          },
        },
      },
    },
  });
  createBundledInstaller(config, "official");
  createBundledInstaller(config, "dmwork");
  createGeneratedStackFiles(root);
  const codexConfig = path.join(root, ".codex/config.toml");
  fs.writeFileSync(codexConfig, `model_provider = "cpa"\n${fs.readFileSync(codexConfig, "utf8")}`);
  fs.appendFileSync(codexConfig, `
responses_websockets = true

[features]
responses_websockets = true
responses_websockets_v2 = true
enable_request_compression = true
`);

  const service = createCodexStackService(config);
  const summary = await service.getSummary();
  assert.ok(summary.warnings.some((warning) => warning.includes("Responses WebSocket transport is enabled")));
  assert.ok(summary.warnings.some((warning) => warning.includes("request compression is enabled")));

  await assert.rejects(
    service.startRepair(undefined, { actions: ["repair-codex-transport"] }),
    /Unsupported repair actions: repair-codex-transport/,
  );
  assert.match(fs.readFileSync(codexConfig, "utf8"), /model_provider = "cpa"/);
});

test("codex stack rejects removed CPA attach repair actions", async () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  writeJson(config.openclawConfigFile, {
    plugins: {
      entries: {
        studio: {
          config: {
            codexStack: {
              allowManagementActions: true,
            },
          },
        },
      },
    },
  });
  createBundledInstaller(config, "official");
  createBundledInstaller(config, "dmwork");
  createGeneratedStackFiles(root);
  const codexConfig = path.join(root, ".codex/config.toml");

  const service = createCodexStackService(config);
  await assert.rejects(
    () => service.startRepair(undefined, { actions: ["apply-codex-cpa-after-smoke"] }),
    /Unsupported repair actions: apply-codex-cpa-after-smoke/,
  );
  await assert.rejects(
    () => service.startRepair(undefined, { actions: ["force-apply-codex-cpa"] }),
    /Unsupported repair actions: force-apply-codex-cpa/,
  );
  assert.doesNotMatch(tomlTopLevel(fs.readFileSync(codexConfig, "utf8")), /model_provider\s*=\s*"cpa"/);
});

test("codex stack switches Codex to Studio provider only after daemon smoke passes", async () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  writeJson(config.openclawConfigFile, {
    plugins: {
      entries: {
        studio: {
          config: {
            codexStack: {
              allowManagementActions: true,
            },
          },
        },
      },
    },
  });
  createBundledInstaller(config, "official");
  createBundledInstaller(config, "dmwork");
  createGeneratedStackFiles(root);
  const codexConfig = path.join(root, ".codex/config.toml");

  await withMockFetch(async (url, init = {}) => {
    const requestUrl = String(url);
    const body = init.body ? JSON.parse(String(init.body)) : {};
    if (requestUrl.endsWith("/gateway/status")) {
      return new Response(JSON.stringify({
        ok: true,
        lifecycle: {
          localDaemon: {
            runtimeMode: "local-daemon",
          },
        },
      }), { status: 200 });
    }
    if (requestUrl.endsWith("/v1/responses/compact")) {
      return new Response(JSON.stringify(compactSmokeResponse(body)), { status: 200 });
    }
    if (requestUrl.endsWith("/v1/responses")) {
      return new Response(JSON.stringify({
        id: "studio_resp_ok",
        status: "completed",
        output: [],
      }), { status: 200 });
    }
    return new Response("not found", { status: 404 });
  }, async () => {
    const service = createCodexStackService(config);
    const response = await service.startRepair(undefined, { actions: ["apply-codex-studio-after-smoke"] });
    const job = await waitForJob(service, response.job.id);

    assert.equal(job.status, "succeeded");
    assert.match(job.logTail, /Studio Model Gateway smoke gate passed/);
    const patched = fs.readFileSync(codexConfig, "utf8");
    assert.match(tomlTopLevel(patched), /model_provider\s*=\s*"studio"/);
    assert.doesNotMatch(tomlTopLevel(patched), /^base_url\s*=\s*"http:\/\/127\.0\.0\.1:18796\/v1"/m);
    assert.match(patched, /\[model_providers\.studio\][\s\S]*base_url = "http:\/\/127\.0\.0\.1:18796\/v1"[\s\S]*wire_api = "responses"[\s\S]*experimental_bearer_token = "PROXY_MANAGED"/);
  });
});

test("codex stack refuses Studio provider switch when daemon lifecycle is not local-daemon", async () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  writeJson(config.openclawConfigFile, {
    plugins: {
      entries: {
        studio: {
          config: {
            codexStack: {
              allowManagementActions: true,
            },
          },
        },
      },
    },
  });
  createBundledInstaller(config, "official");
  createBundledInstaller(config, "dmwork");
  createGeneratedStackFiles(root);
  const codexConfig = path.join(root, ".codex/config.toml");

  await withMockFetch(async (url) => {
    const requestUrl = String(url);
    if (requestUrl.endsWith("/gateway/status")) {
      return new Response(JSON.stringify({
        ok: true,
        lifecycle: {
          localDaemon: {
            runtimeMode: "studio-api-embedded",
          },
        },
      }), { status: 200 });
    }
    return new Response("should not reach model smoke", { status: 500 });
  }, async () => {
    const service = createCodexStackService(config);
    const response = await service.startRepair(undefined, { actions: ["apply-codex-studio-after-smoke"] });
    const job = await waitForJob(service, response.job.id);

    assert.equal(job.status, "failed");
    assert.match(job.error || "", /localDaemon is not active/);
    const patched = fs.readFileSync(codexConfig, "utf8");
    assert.doesNotMatch(tomlTopLevel(patched), /model_provider\s*=\s*"studio"/);
  });
});

test("codex stack can restore official ChatGPT route from a third-party model", async () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  writeJson(config.openclawConfigFile, {
    plugins: {
      entries: {
        studio: {
          config: {
            codexStack: {
              allowManagementActions: true,
            },
          },
        },
      },
    },
  });
  createBundledInstaller(config, "official");
  createBundledInstaller(config, "dmwork");
  createGeneratedStackFiles(root);
  const codexConfig = path.join(root, ".codex/config.toml");
  const codexAuth = path.join(root, ".codex/auth.json");
  const officialAuthBackup = path.join(root, ".codex/auth.chatgpt.backup.json");
  fs.writeFileSync(codexConfig, `
model = "kimi-k2.6"
model_provider = "cpa"
base_url = "http://127.0.0.1:18796/v1"

[model_providers.cpa]
name = "CPA"
base_url = "http://127.0.0.1:18796/v1"
wire_api = "responses"
supports_websockets = false
experimental_bearer_token = "secret-cpa-key-123456"
`);
  writeJson(codexAuth, {
    auth_mode: "apikey",
    OPENAI_API_KEY: "secret-cpa-key-123456",
  });
  writeJson(officialAuthBackup, {
    auth_mode: "chatgpt",
    refresh_token: "restored-chatgpt-refresh",
    account_id: "official-account",
  });

  const service = createCodexStackService(config);
  const response = await service.startRepair(undefined, { actions: ["restore-official-chatgpt"] });
  const job = await waitForJob(service, response.job.id);

  assert.equal(job.status, "succeeded");
  assert.match(job.logTail, /Restored official ChatGPT Codex route using gpt-5\.5/);
  const patched = fs.readFileSync(codexConfig, "utf8");
  assert.match(tomlTopLevel(patched), /model\s*=\s*"gpt-5\.5"/);
  assert.doesNotMatch(tomlTopLevel(patched), /model_provider\s*=\s*"cpa"/);
  assert.doesNotMatch(tomlTopLevel(patched), /^base_url\s*=\s*"http:\/\/127\.0\.0\.1:18796\/v1"/m);
  assert.match(patched, /\[model_providers\.cpa\]/);
  const restoredAuth = JSON.parse(fs.readFileSync(codexAuth, "utf8"));
  assert.equal(restoredAuth.auth_mode, "chatgpt");
  assert.equal(restoredAuth.refresh_token, "restored-chatgpt-refresh");
  assert.equal(restoredAuth.OPENAI_API_KEY, undefined);
  const summary = await service.getSummary();
  assert.equal(summary.codexRoute.active, "official-chatgpt");
  assert.equal(summary.codexRoute.currentModel, "gpt-5.5");
});

test("codex stack refuses to restore non-ChatGPT auth backups as official login", async () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  writeJson(config.openclawConfigFile, {
    plugins: {
      entries: {
        studio: {
          config: {
            codexStack: {
              allowManagementActions: true,
            },
          },
        },
      },
    },
  });
  createBundledInstaller(config, "official");
  createBundledInstaller(config, "dmwork");
  createGeneratedStackFiles(root);
  const codexConfig = path.join(root, ".codex/config.toml");
  const codexAuth = path.join(root, ".codex/auth.json");
  const officialAuthBackup = path.join(root, ".codex/auth.chatgpt.backup.json");
  fs.writeFileSync(codexConfig, `
model = "kimi-k2.6"
model_provider = "cpa"

[model_providers.cpa]
base_url = "http://127.0.0.1:18796/v1"
experimental_bearer_token = "secret-cpa-key-123456"
`);
  writeJson(codexAuth, {
    auth_mode: "apikey",
    OPENAI_API_KEY: "secret-cpa-key-123456",
  });
  writeJson(officialAuthBackup, {
    auth_mode: "apikey",
    OPENAI_API_KEY: "stale-third-party-key",
  });

  const service = createCodexStackService(config);
  const response = await service.startRepair(undefined, { actions: ["restore-official-chatgpt"] });
  const job = await waitForJob(service, response.job.id);

  assert.equal(job.status, "succeeded");
  assert.match(job.logTail, /No preserved official ChatGPT auth backup found/);
  const authAfterRestore = JSON.parse(fs.readFileSync(codexAuth, "utf8"));
  assert.equal(authAfterRestore.auth_mode, "apikey");
  assert.equal(authAfterRestore.OPENAI_API_KEY, "secret-cpa-key-123456");
  const patched = fs.readFileSync(codexConfig, "utf8");
  assert.match(tomlTopLevel(patched), /model\s*=\s*"gpt-5\.5"/);
  assert.doesNotMatch(tomlTopLevel(patched), /model_provider\s*=\s*"cpa"/);
  const summary = await service.getSummary();
  assert.equal(summary.secrets.officialChatGptAuthBackup.restorable, false);
  assert.equal(summary.secrets.officialChatGptAuthBackup.mode, "apikey");
});

test("codex stack can attach the user-selected GPT model through Studio Gateway", async () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  writeJson(config.openclawConfigFile, {
    plugins: {
      entries: {
        studio: {
          config: {
            codexStack: {
              allowManagementActions: true,
            },
          },
        },
      },
    },
  });
  createBundledInstaller(config, "official");
  createBundledInstaller(config, "dmwork");
  createGeneratedStackFiles(root);
  const codexConfig = path.join(root, ".codex/config.toml");
  fs.writeFileSync(codexConfig, fs.readFileSync(codexConfig, "utf8").replace('model = "glm-5.1"', 'model = "gpt-5.5"'));
  const requestedModels = [];

  await withMockFetch(async (url, init = {}) => {
    const requestUrl = String(url);
    const body = init.body ? JSON.parse(String(init.body)) : {};
    if (body.model) requestedModels.push(body.model);
    if (requestUrl.endsWith("/gateway/status")) {
      return new Response(JSON.stringify({
        ok: true,
        lifecycle: {
          localDaemon: {
            runtimeMode: "local-daemon",
          },
        },
      }), { status: 200 });
    }
    if (requestUrl.endsWith("/healthz")) return new Response(JSON.stringify({ status: "ok" }), { status: 200 });
    if (requestUrl.includes("/v1/chat/completions")) {
      return new Response(JSON.stringify({
        choices: [{ message: { role: "assistant", content: "pong" }, finish_reason: "stop" }],
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (requestUrl.endsWith("/v1/responses")) {
      if (body.stream) {
        return new Response([
          "event: response.completed",
          `data: ${JSON.stringify({ type: "response.completed", response: { status: "completed" } })}`,
          "",
          "data: [DONE]",
          "",
        ].join("\n"), { status: 200, headers: { "Content-Type": "text/event-stream" } });
      }
      return new Response(JSON.stringify({ id: "resp_ok", status: "completed", output: [] }), { status: 200 });
    }
    if (requestUrl.endsWith("/v1/responses/compact")) {
      return new Response(JSON.stringify(compactSmokeResponse(body)), { status: 200 });
    }
    return new Response("not found", { status: 404 });
  }, async () => {
    const service = createCodexStackService(config);
    const response = await service.startRepair(undefined, { actions: ["apply-codex-studio-after-smoke"] });
    const job = await waitForJob(service, response.job.id);

    assert.equal(job.status, "succeeded");
    assert.equal(requestedModels.includes("gpt-5.5"), true);
    const patched = fs.readFileSync(codexConfig, "utf8");
    assert.match(tomlTopLevel(patched), /model_provider\s*=\s*"studio"/);
    assert.match(tomlTopLevel(patched), /model\s*=\s*"gpt-5\.5"/);
  });
});

test("codex stack smoke matrix validates the selected default model without attaching Codex", async () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  writeJson(config.openclawConfigFile, {
    plugins: {
      entries: {
        studio: {
          config: {
            codexStack: {
              allowManagementActions: true,
            },
          },
        },
      },
    },
  });
  createBundledInstaller(config, "official");
  createBundledInstaller(config, "dmwork");
  createGeneratedStackFiles(root);
  const codexConfig = path.join(root, ".codex/config.toml");
  const compactBodies = [];

  await withMockFetch(async (url, init = {}) => {
    const requestUrl = String(url);
    const body = init.body ? JSON.parse(String(init.body)) : {};
    if (requestUrl.endsWith("/healthz")) return new Response(JSON.stringify({ status: "ok" }), { status: 200 });
    if (requestUrl.includes("/v1/chat/completions")) {
      return new Response(JSON.stringify({
        choices: [{ message: { role: "assistant", content: "pong" }, finish_reason: "stop" }],
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (requestUrl.endsWith("/v1/responses")) {
      if (body.stream) {
        return new Response([
          "event: response.created",
          `data: ${JSON.stringify({ type: "response.created", response: { status: "in_progress" } })}`,
          "",
          "event: response.completed",
          `data: ${JSON.stringify({ type: "response.completed", response: { status: "completed" } })}`,
          "",
          "data: [DONE]",
          "",
        ].join("\n"), { status: 200, headers: { "Content-Type": "text/event-stream" } });
      }
      return new Response(JSON.stringify({ id: "resp_ok", status: "completed", output: [] }), { status: 200 });
    }
    if (requestUrl.endsWith("/v1/responses/compact")) {
      compactBodies.push(body);
      return new Response(JSON.stringify(compactSmokeResponse(body)), { status: 200 });
    }
    return new Response("not found", { status: 404 });
  }, async () => {
    const service = createCodexStackService(config);
    const response = await service.startRepair(undefined, { actions: ["run-smoke-matrix"] });
    const job = await waitForJob(service, response.job.id);
    const summary = await service.getSummary();

    assert.equal(job.status, "succeeded");
    assert.equal(summary.profile.lastSmokeMatrix?.attachEligible, true);
    assert.deepEqual(summary.profile.lastSmokeMatrix?.requiredModels, ["glm-5.1"]);
    assert.equal(typeof summary.profile.lastSmokeMatrix?.durationMs, "number");
    assert.ok(summary.profile.lastSmokeMatrix.durationMs >= 0);
    for (const model of summary.profile.lastSmokeMatrix.models) {
      assert.equal(typeof model.durationMs, "number");
      assert.ok(model.durationMs >= 0);
      for (const check of model.checks) {
        assert.equal(typeof check.durationMs, "number");
        assert.ok(check.durationMs >= 0);
      }
    }
    assert.equal(compactBodies.length, 1);
    assert.deepEqual(compactBodies.map((body) => body.model), ["glm-5.1"]);
    for (const body of compactBodies) {
      assert.equal(body.thread_id, "studio-smoke");
      assert.equal(Array.isArray(body.input), true);
      assert.ok(body.input.length >= 4);
      assert.match(JSON.stringify(body.input), new RegExp(`studio-compact-smoke-${body.model.replace(".", "\\.")}`));
      assert.match(JSON.stringify(body.input), /watchdog must not restart/);
    }
    assert.doesNotMatch(tomlTopLevel(fs.readFileSync(codexConfig, "utf8")), /model_provider\s*=\s*"cpa"/);
  });
});

test("codex stack smoke matrix rejects empty compact summaries", async () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  writeJson(config.openclawConfigFile, {
    plugins: {
      entries: {
        studio: {
          config: {
            codexStack: {
              allowManagementActions: true,
            },
          },
        },
      },
    },
  });
  createBundledInstaller(config, "official");
  createBundledInstaller(config, "dmwork");
  createGeneratedStackFiles(root);

  await withMockFetch(async (url, init = {}) => {
    const requestUrl = String(url);
    const body = init.body ? JSON.parse(String(init.body)) : {};
    if (requestUrl.endsWith("/healthz")) return new Response(JSON.stringify({ status: "ok" }), { status: 200 });
    if (requestUrl.includes("/v1/chat/completions")) {
      return new Response(JSON.stringify({
        choices: [{ message: { role: "assistant", content: "pong" }, finish_reason: "stop" }],
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (requestUrl.endsWith("/v1/responses")) {
      if (body.stream) {
        return new Response([
          "event: response.completed",
          `data: ${JSON.stringify({ type: "response.completed", response: { status: "completed" } })}`,
          "",
          "data: [DONE]",
          "",
        ].join("\n"), { status: 200, headers: { "Content-Type": "text/event-stream" } });
      }
      return new Response(JSON.stringify({ id: "resp_ok", status: "completed", output: [] }), { status: 200 });
    }
    if (requestUrl.endsWith("/v1/responses/compact")) {
      return new Response(JSON.stringify({ id: "compact_empty", status: "completed", output: [] }), { status: 200 });
    }
    return new Response("not found", { status: 404 });
  }, async () => {
    const service = createCodexStackService(config);
    const response = await service.startRepair(undefined, { actions: ["run-smoke-matrix"] });
    const job = await waitForJob(service, response.job.id);
    const summary = await service.getSummary();

    assert.equal(job.status, "failed");
    assert.match(job.error || "", /empty summary/);
    assert.equal(summary.profile.lastSmokeMatrix?.attachEligible, false);
    assert.equal(
      summary.profile.lastSmokeMatrix?.models[0]?.checks.find((check) => check.id === "compact-compact")?.status,
      "failed",
    );
  });
});

test("codex stack smoke matrix records selected target failure and blocks Codex attach", async () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  writeJson(config.openclawConfigFile, {
    plugins: {
      entries: {
        studio: {
          config: {
            codexStack: {
              allowManagementActions: true,
            },
          },
        },
      },
    },
  });
  createBundledInstaller(config, "official");
  createBundledInstaller(config, "dmwork");
  createGeneratedStackFiles(root);
  const codexConfig = path.join(root, ".codex/config.toml");

  await withMockFetch(async (url, init = {}) => {
    const requestUrl = String(url);
    const body = init.body ? JSON.parse(String(init.body)) : {};
    if (requestUrl.endsWith("/healthz")) return new Response(JSON.stringify({ status: "ok" }), { status: 200 });
    if (body.model === "glm-5.1" && requestUrl.includes("/v1/chat/completions")) {
      return new Response(JSON.stringify({ error: { message: "target unavailable" } }), { status: 500 });
    }
    if (requestUrl.includes("/v1/chat/completions")) {
      return new Response(JSON.stringify({
        choices: [{ message: { role: "assistant", content: "pong" }, finish_reason: "stop" }],
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (requestUrl.endsWith("/v1/responses")) {
      if (body.stream) {
        return new Response([
          "event: response.created",
          `data: ${JSON.stringify({ type: "response.created", response: { status: "in_progress" } })}`,
          "",
          "event: response.completed",
          `data: ${JSON.stringify({ type: "response.completed", response: { status: "completed" } })}`,
          "",
          "data: [DONE]",
          "",
        ].join("\n"), { status: 200, headers: { "Content-Type": "text/event-stream" } });
      }
      return new Response(JSON.stringify({ id: "resp_ok", status: "completed", output: [] }), { status: 200 });
    }
    if (requestUrl.endsWith("/v1/responses/compact")) {
      return new Response(JSON.stringify(compactSmokeResponse(body)), { status: 200 });
    }
    return new Response("not found", { status: 404 });
  }, async () => {
    const service = createCodexStackService(config);
    const response = await service.startRepair(undefined, { actions: ["run-smoke-matrix"] });
    const job = await waitForJob(service, response.job.id);
    const summary = await service.getSummary();

    assert.equal(job.status, "failed");
    assert.match(job.error || "", /glm-5\.1/);
    assert.equal(summary.profile.lastSmokeMatrix?.attachEligible, false);
    assert.deepEqual(summary.profile.lastSmokeMatrix?.requiredModels, ["glm-5.1"]);
    assert.equal(summary.profile.lastSmokeMatrix?.models.find((item) => item.model === "glm-5.1")?.status, "failed");
    assert.match(summary.runReadiness.checks.find((check) => check.id === "smoke-matrix")?.detail || "", /glm-5\.1/);
    assert.match(summary.runReadiness.checks.find((check) => check.id === "smoke-matrix")?.detail || "", /CPA chat/);
    assert.match(summary.runReadiness.checks.find((check) => check.id === "smoke-matrix")?.detail || "", /target unavailable/);
    assert.doesNotMatch(tomlTopLevel(fs.readFileSync(codexConfig, "utf8")), /model_provider\s*=\s*"cpa"/);
  });
});

test("codex stack logs expose bounded preview metadata for UI performance controls", async () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  writeJson(config.openclawConfigFile, {});
  createBundledInstaller(config, "official");
  createBundledInstaller(config, "dmwork");

  const service = createCodexStackService(config);
  const logs = await service.readLogs("cli-proxy-api.service", 9999);

  assert.equal(logs.unitId, "cli-proxy-api.service");
  assert.equal(logs.requestedLines, 500);
  assert.equal(typeof logs.output, "string");
  assert.ok(logs.sources.some((source) => source.kind === "journal"));
  assert.equal(typeof logs.returnedLines, "number");
  assert.equal(typeof logs.truncated, "boolean");
  assert.match(logs.fetchedAt, /^\d{4}-\d{2}-\d{2}T/);
});

test("codex stack uses CODEX_MODEL as default model fallback", async () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  writeJson(config.openclawConfigFile, {});
  createBundledInstaller(config, "official");
  createBundledInstaller(config, "dmwork");

  const previous = process.env.CODEX_MODEL;
  process.env.CODEX_MODEL = "custom-frontier-model";
  try {
    const service = createCodexStackService(config);
    const summary = await service.getSummary();
    assert.equal(summary.models.current, "custom-frontier-model");
    assert.ok(summary.models.available.includes("custom-frontier-model"));
  } finally {
    if (previous === undefined) {
      delete process.env.CODEX_MODEL;
    } else {
      process.env.CODEX_MODEL = previous;
    }
  }
});

test("codex stack install job allows upstream overrides and redacts submitted keys", async () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  writeJson(config.openclawConfigFile, {
    plugins: {
      entries: {
        studio: {
          config: {
            codexStack: {
              allowManagementActions: true,
            },
          },
        },
      },
    },
  });
  createBundledInstaller(config, "official");
  createBundledInstaller(config, "dmwork");
  const setupScriptContent = [
      "#!/usr/bin/env bash",
	      "set -euo pipefail",
	      "echo model=$CODEX_MODEL",
	      "echo context_mode=$CODEX_CONTEXT_MODE",
	      "echo context_window=$CODEX_CONTEXT_WINDOW",
	      "echo cpa_key=$CPA_PROXY_KEY",
      "echo upstream_key=$OPENCLAW_UPSTREAM_API_KEY",
      "echo upstream_url=$OPENCLAW_UPSTREAM_BASE_URL",
      "echo provider_proxy=$OPENCLAW_PROVIDER_PROXY_URL",
      "echo no_proxy=$OPENCLAW_NO_PROXY",
      "",
    ].join("\n");
  writeFile(path.join(config.projectRoot, "resources/codex-stack/codex-docs/resources/scripts/auto-setup.sh"), setupScriptContent, 0o755);

  const service = createCodexStackService(config);
  const response = await service.startInstall(undefined, {
    env: {
	      CODEX_MODEL: "glm-5.1",
	      CODEX_CONTEXT_MODE: "custom",
	      CODEX_CONTEXT_WINDOW: 320000,
      CPA_PROXY_KEY: "secret-cpa-key-for-job",
      OPENCLAW_UPSTREAM_BASE_URL: "https://upstream.example.test/v1",
      OPENCLAW_UPSTREAM_API_KEY: "secret-upstream-key-for-job",
      OPENCLAW_PROVIDER_PROXY_URL: "http://127.0.0.1:7897",
      OPENCLAW_NO_PROXY: "localhost,127.0.0.1,::1",
    },
    flags: {
      skipNpm: true,
      skipCcConnect: false,
      noStart: true,
    },
  });

  const job = await waitForJob(service, response.job.id);
  assert.equal(job.status, "succeeded");
  assert.match(job.logTail, /model=glm-5\.1/);
  assert.match(job.logTail, /context_mode=custom/);
  assert.match(job.logTail, /context_window=320000/);
  assert.match(job.logTail, /upstream_url=https:\/\/upstream\.example\.test\/v1/);
  assert.match(job.logTail, /provider_proxy=http:\/\/127\.0\.0\.1:7897/);
  assert.match(job.logTail, /no_proxy=localhost,127\.0\.0\.1,::1/);
  assert.doesNotMatch(job.logTail, /secret-cpa-key-for-job/);
  assert.doesNotMatch(job.logTail, /secret-upstream-key-for-job/);

  const summary = await service.getSummary();
  assert.equal(summary.profile.upstreamOverride?.hasBaseUrl, true);
  assert.equal(summary.profile.upstreamOverride?.hasApiKey, true);
  assert.equal(summary.profile.providerProxy?.mode, "proxy");
  assert.equal(summary.profile.providerProxy?.url, "http://127.0.0.1:7897");
  const authJson = JSON.parse(fs.readFileSync(path.join(root, ".codex/auth.json"), "utf8"));
  assert.equal(authJson.OPENAI_API_KEY, "secret-cpa-key-for-job");
});

test("codex stack install keeps the selected target model when channel changes", async () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  writeJson(config.openclawConfigFile, {
    plugins: {
      entries: {
        studio: {
          config: {
            codexStack: {
              allowManagementActions: true,
            },
          },
        },
      },
    },
  });
  createBundledInstaller(config, "official");
  createBundledInstaller(config, "dmwork");
  createGeneratedStackFiles(root);
  writeJson(path.join(config.openclawRoot, "studio/codex-stack/profile.json"), {
    channel: "dmwork",
    cpaPort: 18795,
    compactPort: 18796,
    defaultModel: "kimi-k2.6",
    ccConnectProject: "main",
    hasCpaProxyKey: false,
  });

  const service = createCodexStackService(config);
  const response = await service.startInstall(undefined, {
    flags: {
      channel: "official",
      noStart: true,
    },
  });

  const job = await waitForJob(service, response.job.id);
  assert.equal(job.status, "succeeded");

  const profile = JSON.parse(fs.readFileSync(path.join(config.openclawRoot, "studio/codex-stack/profile.json"), "utf8"));
  assert.equal(profile.channel, "official");
  assert.equal(profile.defaultModel, "kimi-k2.6");
  assert.equal(profile.cpaPort, 8317);

  const serviceTemplatePath = path.join(root, ".config/systemd/user/openclaw-studio-model-gateway.service");
  assert.ok(fs.existsSync(serviceTemplatePath));
  const serviceTemplate = fs.readFileSync(serviceTemplatePath, "utf8");
  assert.match(serviceTemplate, /model-gateway-daemon\.js/);
  assert.match(serviceTemplate, /Restart=always/);
  assert.match(serviceTemplate, new RegExp(config.openclawRoot.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

  const codexConfig = fs.readFileSync(path.join(root, ".codex/config.toml"), "utf8");
  assert.doesNotMatch(tomlTopLevel(codexConfig), /model_provider\s*=\s*"studio"/);
  assert.match(codexConfig, /\[model_providers\.studio\][\s\S]*base_url = "http:\/\/127\.0\.0\.1:18796\/v1"[\s\S]*wire_api = "responses"[\s\S]*experimental_bearer_token = "PROXY_MANAGED"/);
});

test("codex stack failed install does not persist optimistic profile state", async () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  writeJson(config.openclawConfigFile, {
    plugins: {
      entries: {
        studio: {
          config: {
            codexStack: {
              allowManagementActions: true,
            },
          },
        },
      },
    },
  });
  createBundledInstaller(config, "official");
  createGeneratedStackFiles(root);
  writeFile(
    path.join(config.projectRoot, "resources/codex-stack/codex-docs/resources/scripts/auto-setup.sh"),
    [
      "#!/usr/bin/env bash",
      "set -euo pipefail",
      "echo failing setup for $CODEX_MODEL",
      "exit 17",
      "",
    ].join("\n"),
    0o755,
  );

  const service = createCodexStackService(config);
  const response = await service.startInstall(undefined, {
    env: {
      CODEX_MODEL: "kimi-k2.6",
      CPA_PORT: 18417,
      COMPACT_PORT: 18777,
      CPA_PROXY_KEY: "failed-install-secret",
      OPENCLAW_PROVIDER_PROXY_URL: "http://127.0.0.1:7897",
    },
    flags: {
      channel: "official",
    },
  });

  const job = await waitForJob(service, response.job.id);
  assert.equal(job.status, "failed");
  assert.match(job.error || "", /Installer exited with code 17/);
  assert.match(job.logTail, /failing setup for kimi-k2\.6/);
  assert.doesNotMatch(job.logTail, /failed-install-secret/);
  assert.equal(fs.existsSync(path.join(root, ".codex/auth.json")), false);
  assert.equal(fs.existsSync(path.join(config.openclawRoot, "studio/codex-stack/profile.json")), false);

  const summary = await service.getSummary();
  assert.equal(summary.profile.lastInstallAt, undefined);
  assert.equal(summary.profile.installerSource, undefined);
  assert.notEqual(summary.profile.defaultModel, "kimi-k2.6");
  assert.notEqual(summary.profile.cpaPort, 18417);
  assert.notEqual(summary.profile.compactPort, 18777);
  assert.notEqual(summary.profile.providerProxy?.source, "install-env");
});

test("codex stack rejects cc-connect finalizer until QR binding exists", async () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  writeJson(config.openclawConfigFile, {
    plugins: {
      entries: {
        studio: {
          config: {
            codexStack: {
              allowManagementActions: true,
            },
          },
        },
      },
    },
  });
  createBundledInstaller(config, "official");
  createBundledInstaller(config, "dmwork");
  createGeneratedStackFiles(root);

  const service = createCodexStackService(config);
  await assert.rejects(
    service.finalizeCcConnect(undefined, { project: "main" }),
    (error) => isCodexStackServiceError(error) && error.code === "codex_stack_cc_connect_unbound",
  );
});

test("codex stack does not treat official cc-connect platform stubs as bound", async () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  writeJson(config.openclawConfigFile, {
    plugins: {
      entries: {
        studio: {
          config: {
            codexStack: {
              allowManagementActions: true,
            },
          },
        },
      },
    },
  });
  createBundledInstaller(config, "official");
  createBundledInstaller(config, "dmwork");
  createGeneratedStackFiles(root);
  writeFile(path.join(root, ".cc-connect/config.toml"), `
[[projects]]
name = "main"
default = true

[[projects.platforms]]
type = "feishu"

[[projects.platforms]]
type = "weixin"
`);

  const service = createCodexStackService(config);
  const summary = await service.getSummary();

  assert.equal(summary.ccConnect.bindingPresent, false);
  assert.equal(summary.ccConnect.canFinalize, false);
  assert.ok(summary.warnings.some((warning) => warning.includes("QR binding")));
  await assert.rejects(
    service.finalizeCcConnect(undefined, { project: "main" }),
    (error) => isCodexStackServiceError(error) && error.code === "codex_stack_cc_connect_unbound",
  );
});

test("codex stack summary exposes finalizer from the single bundled installer", async () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  writeJson(config.openclawConfigFile, {
    plugins: {
      entries: {
        studio: {
          config: {
            codexStack: {
              allowManagementActions: true,
            },
          },
        },
      },
    },
  });
  createBundledInstaller(config, "dmwork");
  createGeneratedStackFiles(root);
  createBoundCcConnectConfig(root);

  const service = createCodexStackService(config);
  const summary = await service.getSummary();

  assert.equal(summary.installer.channel, "dmwork");
  assert.equal(summary.ccConnect.bindingPresent, true);
  assert.equal(summary.ccConnect.finalizerAvailable, true);
  assert.equal(summary.ccConnect.canFinalize, true);
  assert.ok(summary.installer.scripts.ccConnectFinalizer?.endsWith("finish-cc-connect-setup.sh"));
});

test("codex stack config patch writes backups and updates managed fields", async () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  writeJson(config.openclawConfigFile, {
    plugins: {
      entries: {
        studio: {
          config: {
            codexStack: {
              allowManagementActions: true,
            },
          },
        },
      },
    },
  });
  createBundledInstaller(config, "official");
  createBundledInstaller(config, "dmwork");
  createGeneratedStackFiles(root);
  const home = path.dirname(config.openclawRoot);
  const codexConfig = path.join(home, ".codex/config.toml");
  const cpaConfig = path.join(home, ".cli-proxy-api/config.yaml");
  const ccConfig = path.join(home, ".cc-connect/config.toml");
  fs.writeFileSync(codexConfig, `model_provider = "cpa"\n${fs.readFileSync(codexConfig, "utf8")}`);

  const service = createCodexStackService(config);
	  const response = await service.patchConfig(undefined, {
	    defaultModel: "gpt-5.4",
	    contextMode: "codex-1m",
	    cpaPort: 9317,
    compactPort: 28796,
    cpaProxyKey: "replacement-cpa-key-123",
    ccConnectProject: "studio-main",
  });

  assert.equal(response.ok, true);
  assert.ok(Array.isArray(response.restartRequiredUnits));
  assert.ok(response.message.includes("Restarted") || response.message.includes("Restart required") || response.message.includes("updated"));
  assert.match(fs.readFileSync(codexConfig, "utf8"), /model = "gpt-5\.4"/);
  assert.match(fs.readFileSync(codexConfig, "utf8"), /28796/);
  assert.match(fs.readFileSync(codexConfig, "utf8"), /model_context_window = 1050000/);
  const patchedCodex = fs.readFileSync(codexConfig, "utf8");
  assert.match(patchedCodex, /responses_websockets = false/);
  assert.match(patchedCodex, /responses_websockets_v2 = false/);
  assert.match(patchedCodex, /enable_request_compression = false/);
  assert.ok(patchedCodex.indexOf("responses_websockets = false") < patchedCodex.indexOf("[model_providers.cpa]"));
  assert.match(patchedCodex, /\[features\][\s\S]*enable_request_compression = false[\s\S]*responses_websockets_v2 = false[\s\S]*responses_websockets = false/);
  assert.doesNotMatch(tomlTopLevel(patchedCodex), /^base_url = "http:\/\/127\.0\.0\.1:28796\/v1"/m);
  assert.doesNotMatch(tomlTopLevel(patchedCodex), /openai_base_url = "http:\/\/127\.0\.0\.1:28796\/v1"/);
  assert.match(tomlTopLevel(patchedCodex), /model_provider = "cpa"/);
  assert.match(patchedCodex, /\[model_providers\.cpa\][\s\S]*base_url = "http:\/\/127\.0\.0\.1:28796\/v1"[\s\S]*wire_api = "responses"[\s\S]*supports_websockets = false[\s\S]*experimental_bearer_token = "replacement-cpa-key-123"/);
  assert.match(fs.readFileSync(cpaConfig, "utf8"), /port: 9317/);
  assert.match(fs.readFileSync(cpaConfig, "utf8"), /replacement-cpa-key-123/);
  assert.match(fs.readFileSync(cpaConfig, "utf8"), /secret-key: "studio"/);
  assert.doesNotMatch(fs.readFileSync(cpaConfig, "utf8"), /secret-key: "replacement-cpa-key-123"/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(home, ".codex/auth.json"), "utf8")).OPENAI_API_KEY, "replacement-cpa-key-123");
  assert.match(fs.readFileSync(ccConfig, "utf8"), /name = "studio-main"/);
  assert.ok(fs.readdirSync(path.dirname(codexConfig)).some((name) => name.startsWith("config.toml.bak.")));
  assert.ok(fs.readdirSync(path.dirname(cpaConfig)).some((name) => name.startsWith("config.yaml.bak.")));
  assert.ok(fs.readdirSync(path.dirname(ccConfig)).some((name) => name.startsWith("config.toml.bak.")));
});

test("codex stack config patch preserves active CPA and does not start paused services", async () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  writeJson(config.openclawConfigFile, {
    plugins: {
      entries: {
        studio: {
          config: {
            codexStack: {
              allowManagementActions: true,
            },
          },
        },
      },
    },
  });
  createBundledInstaller(config, "official");
  createBundledInstaller(config, "dmwork");
  createGeneratedStackFiles(root);
  const home = path.dirname(config.openclawRoot);
  const codexConfig = path.join(home, ".codex/config.toml");
  fs.writeFileSync(codexConfig, `model_provider = "cpa"\n${fs.readFileSync(codexConfig, "utf8")}`);

  await withFakeSystemctl(async ({ readCalls }) => {
    const service = createCodexStackService(config);
    const response = await service.patchConfig(undefined, {
      defaultModel: "glm-5.1",
      compactPort: 28796,
    });

    assert.equal(response.ok, true);
    assert.ok(response.restartRequiredUnits.includes("cpa-compact-proxy.service"));
    assert.ok(response.restartRequiredUnits.includes("cc-connect.service"));
    assert.match(response.message, /Restart required/);
    const calls = readCalls();
    assert.ok(calls.includes("--user daemon-reload"));
    assert.ok(!calls.includes("--user restart cpa-compact-proxy.service"));
  });

  const patchedCodex = fs.readFileSync(codexConfig, "utf8");
  assert.match(tomlTopLevel(patchedCodex), /model_provider = "cpa"/);
  assert.match(patchedCodex, /\[model_providers\.cpa\][\s\S]*base_url = "http:\/\/127\.0\.0\.1:28796\/v1"/);
});

test("codex stack config patch retargets existing cc-connect CPA provider on Compact port changes", async () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  writeJson(config.openclawConfigFile, {
    plugins: {
      entries: {
        studio: {
          config: {
            codexStack: {
              allowManagementActions: true,
            },
          },
        },
      },
    },
  });
  createBundledInstaller(config, "official");
  createBundledInstaller(config, "dmwork");
  createGeneratedStackFiles(root);
  const home = path.dirname(config.openclawRoot);
  const ccConfig = path.join(home, ".cc-connect/config.toml");
  writeFile(ccConfig, `
[[providers]]
name = "cpa"
api_key = "secret-cpa-key-123456"
base_url = "http://127.0.0.1:18796/v1"
codex.env_key = "OPENAI_API_KEY"

[[projects]]
name = "main"
[projects.agent.options]
model = "glm-5.1"
`);

  await withFakeSystemctl(async ({ readCalls }) => {
    const service = createCodexStackService(config);
    const response = await service.patchConfig(undefined, {
      compactPort: 28796,
    });

    assert.equal(response.ok, true);
    assert.ok(response.restartRequiredUnits.includes("cc-connect.service"));
    assert.ok(!readCalls().includes("--user restart cc-connect.service"));
  });

  const patchedCc = fs.readFileSync(ccConfig, "utf8");
  assert.match(patchedCc, /base_url = "http:\/\/127\.0\.0\.1:28796\/v1"/);
  assert.match(patchedCc, /codex\.env_key = "OPENAI_API_KEY"/);
  assert.doesNotMatch(patchedCc, /codex_env_key/);
});

test("codex stack preserves cc-connect multi-provider model routing fields", async () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  writeJson(config.openclawConfigFile, {
    plugins: {
      entries: {
        studio: {
          config: {
            codexStack: {
              allowManagementActions: true,
            },
          },
        },
      },
    },
  });
  createBundledInstaller(config, "official");
  createGeneratedStackFiles(root);
  const home = path.dirname(config.openclawRoot);
  const ccConfig = path.join(home, ".cc-connect/config.toml");
  writeFile(ccConfig, `
language = "zh"

[[providers]]
name = "relay"
api_key = "secret-relay"
base_url = "https://relay.example/api"
model = "claude-sonnet-4-6"
agent_types = ["claudecode", "codex"]
codex.env_key = "OPENAI_API_KEY"
codex.wire_api = "responses"

[providers.endpoints]
codex = "https://relay.example/api/v1"
claudecode = "https://relay.example/api"

[providers.agent_models]
codex = "openai/gpt-5.4"
claudecode = "claude-sonnet-4-6"

[[providers.models]]
model = "claude-sonnet-4-6"
alias = "sonnet"

[[providers.models]]
model = "openai/gpt-5.4"
alias = "codex"

[[projects]]
name = "main"
admin_from = "admin"
[projects.agent]
type = "codex"
provider_refs = ["relay"]
[projects.agent.options]
model = "openai/gpt-5.4"
work_dir = "/tmp/work"
mode = "suggest"
`);

  const service = createCodexStackService(config);
  const parsed = await service.getCcConnectConfig();
  assert.equal(parsed.providers[0].model, "claude-sonnet-4-6");
  assert.deepEqual(parsed.providers[0].agentTypes, ["claudecode", "codex"]);
  assert.equal(parsed.providers[0].endpoints.codex, "https://relay.example/api/v1");
  assert.equal(parsed.providers[0].agentModels.claudecode, "claude-sonnet-4-6");
  assert.equal(parsed.providers[0].codex.wireApi, "responses");
  assert.deepEqual(parsed.providers[0].models, [
    { model: "claude-sonnet-4-6", alias: "sonnet" },
    { model: "openai/gpt-5.4", alias: "codex" },
  ]);
  assert.deepEqual(parsed.projects[0].providerRefs, ["relay"]);

  parsed.providers[0].models.push({ model: "openai/gpt-5.5", alias: "frontier" });
  parsed.projects[0].providerRefs.push("fallback");

  await withFakeSystemctl(async () => {
    const response = await service.patchCcConnectConfig(undefined, {
      providers: parsed.providers,
      projects: parsed.projects,
    });
    assert.equal(response.ok, true);
  });

  const patched = fs.readFileSync(ccConfig, "utf8");
  assert.match(patched, /model = "claude-sonnet-4-6"/);
  assert.match(patched, /agent_types = \["claudecode", "codex"\]/);
  assert.match(patched, /\[providers\.endpoints\][\s\S]*codex = "https:\/\/relay\.example\/api\/v1"/);
  assert.match(patched, /\[providers\.agent_models\][\s\S]*claudecode = "claude-sonnet-4-6"/);
  assert.match(patched, /codex\.wire_api = "responses"/);
  assert.match(patched, /\[\[providers\.models\]\][\s\S]*alias = "frontier"/);
  assert.match(patched, /provider_refs = \["relay", "fallback"\]/);
});

test("codex stack summary warns when cc-connect bypasses local Compact provider", async () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  writeJson(config.openclawConfigFile, {});
  createBundledInstaller(config, "official");
  createBundledInstaller(config, "dmwork");
  createGeneratedStackFiles(root);
  const home = path.dirname(config.openclawRoot);
  writeFile(path.join(home, ".cc-connect/config.toml"), `
[[providers]]
name = "cpa"
api_key = "secret-cpa-key-123456"
base_url = "https://remote.example.test/v1"
codex.env_key = "REMOTE_API_KEY"

[[projects]]
name = "main"
[projects.agent.options]
model = "glm-5.1"
`);

  await withMockFetch(async (url) => {
    const requestUrl = String(url);
    if (requestUrl.endsWith("/v1/models")) {
      return new Response(JSON.stringify({ data: [{ id: "glm-5.1" }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response("ok", { status: 200 });
  }, async () => {
    const service = createCodexStackService(config);
    const summary = await service.getSummary();

    assert.ok(summary.warnings.some((warning) => warning.includes("cc-connect cpa provider base_url")));
    assert.ok(summary.warnings.some((warning) => warning.includes("cc-connect cpa provider codex.env_key")));
  });
});

test("codex stack config patch updates upstream proxy policy and no-proxy service env", async () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  writeJson(config.openclawConfigFile, {
    plugins: {
      entries: {
        studio: {
          config: {
            codexStack: {
              allowManagementActions: true,
            },
          },
        },
      },
    },
  });
  createBundledInstaller(config, "official");
  createBundledInstaller(config, "dmwork");
  createGeneratedStackFiles(root);
  const home = path.dirname(config.openclawRoot);
  const cpaConfig = path.join(home, ".cli-proxy-api/config.yaml");
  const compactService = path.join(home, ".config/systemd/user/cpa-compact-proxy.service");
  writeFile(cpaConfig, `
port: 8317
api-keys:
- "secret-cpa-key-123456"
debug: false
proxy-url: "direct"
upstream_base_url: "https://old.example.test/v1"
upstream_api_key: "old-upstream-key"
openai-compatibility:
- name: gateway
  base-url: "https://old.example.test/v1"
  api-key-entries:
  - api-key: "old-upstream-key"
    proxy-url: "direct"
  models:
  - name: "glm-5.1"
  - name: "kimi-k2.6"
`);
  writeFile(compactService, `
[Service]
Environment=CPA_PORT=8317
Environment=CPA_BASE_URL=http://127.0.0.1:8317
Environment=LISTEN_PORT=18796
Environment=NO_PROXY=localhost,127.0.0.1,::1
`);

  await withFakeSystemctl(async () => {
    const service = createCodexStackService(config);
    const response = await service.patchConfig(undefined, {
      upstreamBaseUrl: "https://new.example.test/v1",
      upstreamApiKey: "new-upstream-key",
      providerProxyUrl: "http://127.0.0.1:7897",
      noProxy: "localhost,127.0.0.1,::1,.local",
    });

    assert.equal(response.ok, true);
    assert.ok(response.restartRequiredUnits.includes("cli-proxy-api.service"));
    assert.ok(response.restartRequiredUnits.includes("cpa-compact-proxy.service"));
    assert.equal(response.summary.proxyPolicy.providerMode, "proxy");
    assert.equal(response.summary.proxyPolicy.providerProxyUrl, "http://127.0.0.1:7897");
    assert.equal(response.summary.proxyPolicy.upstreamBaseUrl, "https://new.example.test/v1");
    assert.equal(response.summary.proxyPolicy.upstreamApiKeyConfigured, true);
    assert.equal(response.summary.proxyPolicy.noProxy, "localhost,127.0.0.1,::1,.local");
  });

  const patchedCpa = fs.readFileSync(cpaConfig, "utf8");
  assert.match(patchedCpa, /upstream_base_url: "https:\/\/new\.example\.test\/v1"/);
  assert.match(patchedCpa, /upstream_api_key: "new-upstream-key"/);
  assert.match(patchedCpa, /- "secret-cpa-key-123456"/);
  assert.match(patchedCpa, /- "new-upstream-key"/);
  assert.match(patchedCpa, /base-url: "https:\/\/new\.example\.test\/v1"/);
  assert.match(patchedCpa, /api-key: "new-upstream-key"/);
  assert.match(patchedCpa, /proxy-url: "http:\/\/127\.0\.0\.1:7897"/);
  const patchedCompact = fs.readFileSync(compactService, "utf8");
  assert.match(patchedCompact, /Environment=NO_PROXY=localhost,127\.0\.0\.1,::1,\.local/);
  assert.match(patchedCompact, /Environment=OPENCLAW_NO_PROXY=localhost,127\.0\.0\.1,::1,\.local/);
  const openclaw = JSON.parse(fs.readFileSync(config.openclawConfigFile, "utf8"));
  assert.equal(openclaw.env.OPENCLAW_UPSTREAM_BASE_URL, "https://new.example.test/v1");
  assert.equal(openclaw.env.OPENCLAW_PROVIDER_PROXY_URL, "http://127.0.0.1:7897");
  assert.equal(openclaw.env.NO_PROXY, "localhost,127.0.0.1,::1,.local");

  await withFakeSystemctl(async () => {
    const service = createCodexStackService(config);
    const response = await service.patchConfig(undefined, {
      upstreamBaseUrl: "",
      providerProxyUrl: "",
    });

    assert.equal(response.ok, true);
    assert.equal(response.summary.proxyPolicy.providerMode, "direct");
    assert.ok(response.summary.proxyPolicy.cpaConfigProxyUrls.every((value) => value === "direct"));
    assert.equal(response.summary.proxyPolicy.upstreamBaseUrl, null);
  });

  const clearedCpa = fs.readFileSync(cpaConfig, "utf8");
  assert.match(clearedCpa, /upstream_base_url: ""/);
  assert.match(clearedCpa, /base-url: ""/);
  assert.match(clearedCpa, /proxy-url: "direct"/);
});

test("codex stack config patch invalidates stale smoke matrix results", async () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  writeJson(config.openclawConfigFile, {
    plugins: {
      entries: {
        studio: {
          config: {
            codexStack: {
              allowManagementActions: true,
            },
          },
        },
      },
    },
  });
  createBundledInstaller(config, "official");
  createBundledInstaller(config, "dmwork");
  createGeneratedStackFiles(root);
  const profilePath = path.join(config.openclawRoot, "studio/codex-stack/profile.json");
  writeJson(profilePath, {
    channel: "dmwork",
    lastSmokeMatrix: {
      status: "passed",
      checkedAt: "2026-05-21T00:00:00.000Z",
      requiredModels: ["glm-5.1", "kimi-k2.6"],
      attachEligible: true,
      models: [],
    },
  });

  await withFakeSystemctl(async () => {
    const service = createCodexStackService(config);
    const response = await service.patchConfig(undefined, {
      providerProxyUrl: "http://127.0.0.1:7897",
    });

    assert.equal(response.ok, true);
    assert.equal(response.summary.profile.lastSmokeMatrix, null);
  });

  const storedProfile = JSON.parse(fs.readFileSync(profilePath, "utf8"));
  assert.equal(storedProfile.lastSmokeMatrix, null);
});

test("codex stack summary warns when a passed smoke matrix is older than 24 hours", async () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  writeJson(config.openclawConfigFile, {
    env: {
      NO_PROXY: "localhost,127.0.0.1,::1",
    },
  });
  writeJson(path.join(root, ".codex/auth.json"), {
    auth_mode: "apikey",
    OPENAI_API_KEY: "secret-cpa-key-123456",
  });
  createBundledInstaller(config, "official");
  createBundledInstaller(config, "dmwork");
  createGeneratedStackFiles(root);
  writeFile(path.join(root, ".cc-connect/config.toml"), `
[[providers]]
name = "cpa"
api_key = "secret-cpa-key-123456"
base_url = "http://127.0.0.1:18796/v1"
codex.env_key = "OPENAI_API_KEY"

[[projects]]
name = "main"
[projects.agent.options]
model = "glm-5.1"

[[projects.platforms]]
type = "dmwork"
[projects.platforms.options]
account_id = "test"
`);
  const profilePath = path.join(config.openclawRoot, "studio/codex-stack/profile.json");
  writeJson(profilePath, {
    channel: "dmwork",
    lastSmokeMatrix: {
      status: "passed",
      checkedAt: "2020-01-01T00:00:00.000Z",
      requiredModels: ["glm-5.1", "kimi-k2.6"],
      attachEligible: true,
      models: [],
    },
  });

  await withScriptedSystemctl(
    [
      "case \"$*\" in",
      "  \"--user list-unit-files\"*) echo \"${@: -1} enabled\"; exit 0 ;;",
      "  \"--user is-enabled\"*) echo \"enabled\"; exit 0 ;;",
      "  \"--user is-active\"*) echo \"active\"; exit 0 ;;",
      "esac",
      "exit 0",
    ].join("\n"),
    async () => {
      await withMockFetch(async (url) => {
        const requestUrl = String(url);
        if (requestUrl.endsWith("/v1/models")) {
          return new Response(JSON.stringify({ data: [{ id: "glm-5.1" }, { id: "kimi-k2.6" }] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        if (requestUrl.endsWith("/healthz")) return new Response(JSON.stringify({ status: "ok" }), { status: 200 });
        return new Response("ok", { status: 200 });
      }, async () => {
        const service = createCodexStackService(config);
        const summary = await service.getSummary();

        assert.equal(summary.profile.lastSmokeMatrix?.attachEligible, true);
        assert.ok(summary.warnings.some((warning) => warning.includes("Target-model smoke matrix is older than 24 hours")));
        assert.ok(summary.recommendation.reasonCodes.includes("smoke-matrix-stale"));
        assert.equal(summary.runReadiness.level, "attention");
        assert.equal(summary.runReadiness.checks.find((check) => check.id === "smoke-matrix")?.status, "warn");
        assert.equal(summary.runReadiness.modes.find((mode) => mode.id === "chat")?.ready, false);
        assert.match(summary.runReadiness.modes.find((mode) => mode.id === "chat")?.detail || "", /重新运行目标 CPA 模型 smoke matrix/);
        assert.equal(summary.runReadiness.modes.find((mode) => mode.id === "long-task")?.ready, false);
        assert.equal(summary.runReadiness.modes.find((mode) => mode.id === "compaction")?.ready, false);
        assert.equal(summary.runReadiness.modes.find((mode) => mode.id === "cc-agent-task")?.ready, false);
      });
    },
  );
});

test("codex stack summary refuses fresh but incomplete smoke matrix records", async () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  const checkedAt = new Date().toISOString();
  writeJson(config.openclawConfigFile, {
    env: {
      NO_PROXY: "localhost,127.0.0.1,::1",
    },
  });
  writeJson(path.join(root, ".codex/auth.json"), {
    auth_mode: "apikey",
    OPENAI_API_KEY: "secret-cpa-key-123456",
  });
  createBundledInstaller(config, "official");
  createBundledInstaller(config, "dmwork");
  createGeneratedStackFiles(root);
  writeFile(path.join(root, ".local/bin/cli-proxy-api"), "#!/usr/bin/env bash\necho cpa\n", 0o755);
  writeFile(path.join(root, ".local/bin/cpa-compact-proxy.mjs"), "#!/usr/bin/env node\nconsole.log('compact')\n", 0o755);
  writeFile(path.join(root, ".cc-connect/config.toml"), `
[[providers]]
name = "cpa"
api_key = "secret-cpa-key-123456"
base_url = "http://127.0.0.1:18796/v1"
codex.env_key = "OPENAI_API_KEY"

[[projects]]
name = "main"
[projects.agent.options]
model = "glm-5.1"

[[projects.platforms]]
type = "dmwork"
[projects.platforms.options]
account_id = "test"
`);
  writeJson(path.join(config.openclawRoot, "studio/codex-stack/profile.json"), {
    channel: "dmwork",
    lastSmokeMatrix: {
      status: "passed",
      checkedAt,
      requiredModels: ["glm-5.1"],
      attachEligible: true,
      models: [
        {
          model: "glm-5.1",
          status: "passed",
          startedAt: checkedAt,
          finishedAt: checkedAt,
          checks: [],
          error: null,
        },
      ],
    },
  });

  await withScriptedSystemctl(
    [
      "case \"$*\" in",
      "  \"--user list-unit-files\"*) echo \"${@: -1} enabled\"; exit 0 ;;",
      "  \"--user is-enabled\"*) echo \"enabled\"; exit 0 ;;",
      "  \"--user is-active\"*) echo \"active\"; exit 0 ;;",
      "esac",
      "exit 0",
    ].join("\n"),
    async () => {
      await withMockFetch(async (url) => {
        const requestUrl = String(url);
        if (requestUrl.endsWith("/v1/models")) {
          return new Response(JSON.stringify({ data: [{ id: "glm-5.1" }, { id: "kimi-k2.6" }] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        if (requestUrl.endsWith("/healthz")) return new Response(JSON.stringify({ status: "ok" }), { status: 200 });
        return new Response("ok", { status: 200 });
      }, async () => {
        const service = createCodexStackService(config);
        const summary = await service.getSummary();

        assert.equal(summary.profile.lastSmokeMatrix?.attachEligible, true);
        assert.ok(summary.warnings.some((warning) => warning.includes("Target-model smoke matrix is incomplete")));
        assert.equal(summary.recommendation.kind, "review-smoke");
        assert.ok(summary.recommendation.reasonCodes.includes("smoke-matrix-incomplete"));
        assert.equal(summary.runReadiness.checks.find((check) => check.id === "smoke-matrix")?.status, "warn");
        assert.equal(summary.runReadiness.modes.find((mode) => mode.id === "chat")?.ready, false);
        assert.equal(summary.runReadiness.modes.find((mode) => mode.id === "long-task")?.ready, false);
        assert.equal(summary.runReadiness.modes.find((mode) => mode.id === "compaction")?.ready, false);
        assert.equal(summary.runReadiness.modes.find((mode) => mode.id === "cc-agent-task")?.ready, false);
      });
    },
  );
});

test("codex stack summary refuses a fresh smoke matrix for a previous target model", async () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  const checkedAt = new Date().toISOString();
  writeJson(config.openclawConfigFile, {
    env: {
      NO_PROXY: "localhost,127.0.0.1,::1",
    },
  });
  writeJson(path.join(root, ".codex/auth.json"), {
    auth_mode: "apikey",
    OPENAI_API_KEY: "secret-cpa-key-123456",
  });
  createBundledInstaller(config, "official");
  createBundledInstaller(config, "dmwork");
  createGeneratedStackFiles(root);
  writeFile(path.join(root, ".codex/config.toml"), `
model = "gpt-5.5"
model_context_window = 1050000
model_auto_compact_token_limit = 945000
responses_websockets = false
enable_request_compression = false

[model_providers.cpa]
base_url = "http://127.0.0.1:18796/v1"
wire_api = "responses"
supports_websockets = false
experimental_bearer_token = "secret-cpa-key-123456"
`);
  writeFile(path.join(root, ".local/bin/cli-proxy-api"), "#!/usr/bin/env bash\necho cpa\n", 0o755);
  writeFile(path.join(root, ".local/bin/cpa-compact-proxy.mjs"), "#!/usr/bin/env node\nconsole.log('compact')\n", 0o755);
  writeFile(path.join(root, ".cc-connect/config.toml"), `
[[providers]]
name = "cpa"
api_key = "secret-cpa-key-123456"
base_url = "http://127.0.0.1:18796/v1"
codex.env_key = "OPENAI_API_KEY"

[[projects]]
name = "main"
[projects.agent.options]
model = "gpt-5.5"

[[projects.platforms]]
type = "dmwork"
[projects.platforms.options]
account_id = "test"
`);
  writeJson(path.join(config.openclawRoot, "studio/codex-stack/profile.json"), {
    channel: "dmwork",
    lastSmokeMatrix: {
      status: "passed",
      checkedAt,
      requiredModels: ["glm-5.1"],
      attachEligible: true,
      models: [
        {
          model: "glm-5.1",
          status: "passed",
          startedAt: checkedAt,
          finishedAt: checkedAt,
          checks: passedSmokeChecks(checkedAt),
          error: null,
        },
      ],
    },
  });

  await withScriptedSystemctl(
    [
      "case \"$*\" in",
      "  \"--user list-unit-files\"*) echo \"${@: -1} enabled\"; exit 0 ;;",
      "  \"--user is-enabled\"*) echo \"enabled\"; exit 0 ;;",
      "  \"--user is-active\"*) echo \"active\"; exit 0 ;;",
      "esac",
      "exit 0",
    ].join("\n"),
    async () => {
      await withMockFetch(async (url) => {
        const requestUrl = String(url);
        if (requestUrl.endsWith("/v1/models")) {
          return new Response(JSON.stringify({ data: [{ id: "gpt-5.5" }, { id: "glm-5.1" }] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        if (requestUrl.endsWith("/healthz")) return new Response(JSON.stringify({ status: "ok" }), { status: 200 });
        return new Response("ok", { status: 200 });
      }, async () => {
        const service = createCodexStackService(config);
        const summary = await service.getSummary();

        assert.equal(summary.profile.defaultModel, "gpt-5.5");
        assert.equal(summary.models.current, "gpt-5.5");
        assert.equal(summary.profile.lastSmokeMatrix?.attachEligible, true);
        assert.ok(summary.warnings.some((warning) => warning.includes("does not cover selected target model gpt-5.5")));
        assert.equal(summary.recommendation.kind, "review-smoke");
        assert.ok(summary.recommendation.reasonCodes.includes("smoke-matrix-target-mismatch"));
        const smokeCheck = summary.runReadiness.checks.find((check) => check.id === "smoke-matrix");
        assert.equal(smokeCheck?.status, "warn");
        assert.match(smokeCheck?.detail || "", /当前目标模型是 gpt-5\.5/);
        assert.equal(summary.runReadiness.modes.find((mode) => mode.id === "chat")?.ready, false);
        assert.equal(summary.runReadiness.modes.find((mode) => mode.id === "long-task")?.ready, false);
        assert.equal(summary.runReadiness.modes.find((mode) => mode.id === "compaction")?.ready, false);
        assert.equal(summary.runReadiness.modes.find((mode) => mode.id === "cc-agent-task")?.ready, false);
      });
    },
  );
});

test("codex stack summary accepts a fresh smoke matrix for the selected CPA target while official Codex stays on GPT", async () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  const checkedAt = new Date().toISOString();
  writeJson(config.openclawConfigFile, {
    env: {
      NO_PROXY: "localhost,127.0.0.1,::1",
    },
  });
  writeJson(path.join(root, ".codex/auth.json"), {
    auth_mode: "apikey",
    OPENAI_API_KEY: "secret-cpa-key-123456",
  });
  createBundledInstaller(config, "official");
  createBundledInstaller(config, "dmwork");
  createGeneratedStackFiles(root);
  writeFile(path.join(root, ".codex/config.toml"), `
model = "gpt-5.5"
model_context_window = 1050000
model_auto_compact_token_limit = 945000
responses_websockets = false
enable_request_compression = false

[model_providers.cpa]
base_url = "http://127.0.0.1:18796/v1"
wire_api = "responses"
supports_websockets = false
experimental_bearer_token = "secret-cpa-key-123456"
`);
  writeFile(path.join(root, ".local/bin/cli-proxy-api"), "#!/usr/bin/env bash\necho cpa\n", 0o755);
  writeFile(path.join(root, ".local/bin/cpa-compact-proxy.mjs"), "#!/usr/bin/env node\nconsole.log('compact')\n", 0o755);
  writeFile(path.join(root, ".cc-connect/config.toml"), `
[[providers]]
name = "cpa"
api_key = "secret-cpa-key-123456"
base_url = "http://127.0.0.1:18796/v1"
codex.env_key = "OPENAI_API_KEY"

[[projects]]
name = "main"
[projects.agent.options]
model = "glm-5.1"

[[projects.platforms]]
type = "dmwork"
[projects.platforms.options]
account_id = "test"
`);
  writeJson(path.join(config.openclawRoot, "studio/codex-stack/profile.json"), {
    channel: "dmwork",
    defaultModel: "glm-5.1",
    lastSmokeMatrix: {
      status: "passed",
      checkedAt,
      requiredModels: ["glm-5.1"],
      attachEligible: true,
      models: [
        {
          model: "glm-5.1",
          status: "passed",
          startedAt: checkedAt,
          finishedAt: checkedAt,
          checks: passedSmokeChecks(checkedAt),
          error: null,
        },
      ],
    },
  });

  await withScriptedSystemctl(
    [
      "case \"$*\" in",
      "  \"--user list-unit-files\"*) echo \"${@: -1} enabled\"; exit 0 ;;",
      "  \"--user is-enabled\"*) echo \"enabled\"; exit 0 ;;",
      "  \"--user is-active\"*) echo \"active\"; exit 0 ;;",
      "esac",
      "exit 0",
    ].join("\n"),
    async () => {
      await withMockFetch(async (url) => {
        const requestUrl = String(url);
        if (requestUrl.endsWith("/v1/models")) {
          return new Response(JSON.stringify({ data: [{ id: "gpt-5.5" }, { id: "glm-5.1" }] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        if (requestUrl.endsWith("/healthz")) return new Response(JSON.stringify({ status: "ok" }), { status: 200 });
        return new Response("ok", { status: 200 });
      }, async () => {
        const service = createCodexStackService(config);
        const summary = await service.getSummary();

        assert.equal(summary.profile.defaultModel, "glm-5.1");
        assert.equal(summary.models.current, "gpt-5.5");
        assert.equal(summary.profile.lastSmokeMatrix?.attachEligible, true);
        assert.ok(!summary.warnings.some((warning) => warning.includes("does not cover selected target model")));
        assert.ok(!summary.recommendation.reasonCodes.includes("smoke-matrix-target-mismatch"));
        assert.equal(summary.runReadiness.checks.find((check) => check.id === "smoke-matrix")?.status, "pass");
        assert.equal(summary.runReadiness.modes.find((mode) => mode.id === "chat")?.ready, false);
        assert.deepEqual(summary.runReadiness.modes.find((mode) => mode.id === "chat")?.actionHint, {
          kind: "repair",
          label: "接管 Studio Gateway",
          repairActions: ["apply-codex-studio-after-smoke"],
        });
      });
    },
  );
});

test("bundled health check validates Studio Gateway daemon and keeps cc-connect optional", () => {
  const script = fs.readFileSync(
    path.join("resources/codex-stack/codex-docs/resources/scripts/health-check.sh"),
    "utf8",
  );

  assert.match(script, /openclaw-studio-model-gateway\.service/);
  assert.match(script, /\/gateway\/status/);
  assert.match(script, /\/v1\/models/);
  assert.match(script, /cc-connect 未安装（可选 IM bridge）/);
  assert.doesNotMatch(script, /fail .*cc-connect/);
  assert.match(script, /Critical checks passed with warnings/);
});

test("bundled health check reports old relay only as a port conflict", () => {
  const script = fs.readFileSync(
    path.join("resources/codex-stack/codex-docs/resources/scripts/health-check.sh"),
    "utf8",
  );

  assert.match(script, /Legacy relay conflicts/);
  assert.match(script, /cli-proxy-api\.service cpa-compact-proxy\.service/);
  assert.match(script, /可能占用 Studio Gateway 端口/);
  assert.doesNotMatch(script, /恢复 CPA 栈|CPA → Compact|codex-stack-watchdog/);
  assert.doesNotMatch(script, /systemctl --user start (?:cli-proxy-api|cpa-compact-proxy)/);
});

test("single bundled codex stack installer prepares inactive Studio provider until smoke gate", () => {
  const script = fs.readFileSync(
    path.join("resources/codex-stack/codex-docs/resources/scripts/auto-setup.sh"),
    "utf8",
  );
  const codexConfig = script.match(/cat > "\$config_file" << TOMLEOF\n([\s\S]*?)\nTOMLEOF/)?.[1] || "";

  assert.doesNotMatch(codexConfig, /^model_provider = "studio"$/m);
  assert.doesNotMatch(codexConfig, /\[model_providers\.cpa\]/);
  assert.match(codexConfig, /\[model_providers\.studio\][\s\S]*base_url = "\$\{STUDIO_GATEWAY_V1_BASE_URL\}"[\s\S]*wire_api = "responses"[\s\S]*experimental_bearer_token = "PROXY_MANAGED"/);
  assert.match(codexConfig, /responses_websockets = false/);
});

test("single bundled installer no longer installs CPA or Compact relay resources", () => {
  const script = fs.readFileSync(
    path.join("resources/codex-stack/codex-docs/resources/scripts/auto-setup.sh"),
    "utf8",
  );
  const resourcesRoot = path.join("resources/codex-stack/codex-docs/resources");

  assert.equal(fs.existsSync(path.join(resourcesRoot, "bin/cli-proxy-api")), false);
  assert.equal(fs.existsSync(path.join(resourcesRoot, "cpa-config-templates/compact-proxy.mjs")), false);
  assert.doesNotMatch(script, /cli-proxy-api --config|cpa-compact-proxy\.mjs|cpa-config-templates|\.cli-proxy-api\/config\.yaml/);
  assert.doesNotMatch(script, /\[model_providers\.cpa\]/);
  assert.match(script, /openclaw-studio-model-gateway\.service/);
});

test("single bundled installer propagates configured no-proxy into Studio cc-connect unit", () => {
  const script = fs.readFileSync(
    path.join("resources/codex-stack/codex-docs/resources/scripts/auto-setup.sh"),
    "utf8",
  );

  assert.match(script, /no_proxy_value/);
  assert.match(script, /Environment=NO_PROXY=\$\{no_proxy\}/);
  assert.match(script, /Environment=OPENCLAW_NO_PROXY=\$\{no_proxy\}/);
  assert.equal((script.match(/Environment=OPENCLAW_NO_PROXY=\$\{no_proxy\}/g) || []).length, 1);
  assert.doesNotMatch(script, /Environment=NO_PROXY=localhost,127\.0\.0\.1,::1/);
});

test("single bundled resources keep cc-connect finalizer and remove legacy dmwork folder", () => {
  const finalizer = fs.readFileSync(
    path.join("resources/codex-stack/codex-docs/resources/scripts/finish-cc-connect-setup.sh"),
    "utf8",
  );
  assert.match(finalizer, /cc-connect daemon is ready/);
  assert.equal(fs.existsSync(path.join("resources/codex-stack/codex-docs-dmwork")), false);
});

test("codex stack summary explains system proxy is ignored for direct domestic providers", async () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  writeJson(config.openclawConfigFile, {
    env: {
      HTTPS_PROXY: "http://127.0.0.1:7890",
    },
  });
  createBundledInstaller(config, "official");
  createBundledInstaller(config, "dmwork");
  createGeneratedStackFiles(root);

  await withMockFetch(async () => new Response("not found", { status: 404 }), async () => {
    const service = createCodexStackService(config);
    const summary = await service.getSummary();

    assert.equal(summary.proxyPolicy.providerMode, "direct");
    assert.equal(summary.proxyPolicy.providerProxyUrl, "http://127.0.0.1:7890");
    assert.ok(summary.warnings.some((warning) => warning.includes("国内网关不会继承系统代理")));
    assert.equal(summary.recommendation.kind, "install");
    assert.ok(summary.recommendation.reasonCodes.includes("system-proxy-direct-provider"));
  });
});

test("codex stack summary warns when NO_PROXY no longer protects local loopback", async () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  writeJson(config.openclawConfigFile, {
    env: {
      NO_PROXY: "localhost",
    },
  });
  createBundledInstaller(config, "official");
  createBundledInstaller(config, "dmwork");
  createGeneratedStackFiles(root);

  await withMockFetch(async () => new Response("not found", { status: 404 }), async () => {
    const service = createCodexStackService(config);
    const summary = await service.getSummary();

    assert.equal(summary.proxyPolicy.noProxy, "localhost");
    assert.equal(summary.proxyPolicy.noProxyLoopbackReady, false);
    assert.deepEqual(summary.proxyPolicy.noProxyLoopbackMissing, ["127.0.0.1", "::1"]);
    assert.ok(summary.warnings.some((warning) => warning.includes("NO_PROXY 缺少 127.0.0.1, ::1")));
    assert.ok(summary.recommendation.reasonCodes.includes("no-proxy-loopback-missing"));
    assert.deepEqual(summary.runReadiness.checks.find((check) => check.id === "proxy-loopback")?.actionHint, {
      kind: "repair",
      label: "修复 NO_PROXY",
      repairActions: ["repair-no-proxy-loopback"],
    });
  });
});

test("codex stack repair can add NO_PROXY loopback bypass for TUN mode", async () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  const cpaService = path.join(root, ".config/systemd/user/cli-proxy-api.service");
  const compactService = path.join(root, ".config/systemd/user/cpa-compact-proxy.service");
  writeJson(config.openclawConfigFile, {
    plugins: {
      entries: {
        studio: {
          config: {
            codexStack: {
              allowManagementActions: true,
            },
          },
        },
      },
    },
    env: {
      NO_PROXY: "localhost",
      OPENCLAW_NO_PROXY: "localhost",
    },
  });
  createBundledInstaller(config, "official");
  createBundledInstaller(config, "dmwork");
  createGeneratedStackFiles(root);
  writeFile(cpaService, `
[Service]
Environment=NO_PROXY=localhost
`);
  writeFile(compactService, `
[Service]
Environment=NO_PROXY=localhost
`);

  await withFakeSystemctl(async ({ readCalls }) => {
    const service = createCodexStackService(config);
    const response = await service.startRepair(undefined, { actions: ["repair-no-proxy-loopback"] });
    const job = await waitForJob(service, response.job.id);

    assert.equal(job.status, "succeeded");
    assert.match(job.logTail, /Updated NO_PROXY loopback bypass to localhost,127\.0\.0\.1,::1/);
    assert.deepEqual(readCalls(), [
      "--user daemon-reload",
      "--user try-restart cli-proxy-api.service",
      "--user try-restart cpa-compact-proxy.service",
    ]);
  });

  const openclaw = JSON.parse(fs.readFileSync(config.openclawConfigFile, "utf8"));
  assert.equal(openclaw.env.NO_PROXY, "localhost,127.0.0.1,::1");
  assert.equal(openclaw.env.OPENCLAW_NO_PROXY, "localhost,127.0.0.1,::1");
  assert.match(fs.readFileSync(cpaService, "utf8"), /Environment=NO_PROXY=localhost,127\.0\.0\.1,::1/);
  assert.match(fs.readFileSync(cpaService, "utf8"), /Environment=OPENCLAW_NO_PROXY=localhost,127\.0\.0\.1,::1/);
  assert.match(fs.readFileSync(compactService, "utf8"), /Environment=NO_PROXY=localhost,127\.0\.0\.1,::1/);
  assert.match(fs.readFileSync(compactService, "utf8"), /Environment=OPENCLAW_NO_PROXY=localhost,127\.0\.0\.1,::1/);
});

test("codex stack prioritizes NO_PROXY remediation before smoke retry when TUN can capture loopback", async () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  const checkedAt = new Date().toISOString();
  writeJson(config.openclawConfigFile, {
    env: {
      HTTPS_PROXY: "http://127.0.0.1:7890",
      NO_PROXY: "localhost",
    },
  });
  writeJson(path.join(root, ".codex/auth.json"), {
    auth_mode: "apikey",
    OPENAI_API_KEY: "secret-cpa-key-123456",
  });
  writeJson(path.join(config.openclawRoot, "studio/codex-stack/profile.json"), {
    lastSmokeMatrix: {
      status: "failed",
      checkedAt,
      requiredModels: ["glm-5.1", "kimi-k2.6"],
      attachEligible: false,
      models: [
        {
          model: "glm-5.1",
          status: "passed",
          startedAt: checkedAt,
          finishedAt: checkedAt,
          checks: [],
          error: null,
        },
        {
          model: "kimi-k2.6",
          status: "failed",
          startedAt: checkedAt,
          finishedAt: checkedAt,
          checks: [],
          error: "stream disconnected before completion",
        },
      ],
    },
  });
  createBundledInstaller(config, "official");
  createBundledInstaller(config, "dmwork");
  createGeneratedStackFiles(root);
  writeFile(path.join(root, ".local/bin/cli-proxy-api"), "#!/usr/bin/env bash\necho cpa\n", 0o755);
  writeFile(path.join(root, ".local/bin/cpa-compact-proxy.mjs"), "#!/usr/bin/env node\nconsole.log('compact')\n", 0o755);
  writeFile(path.join(root, ".cc-connect/config.toml"), `
[[providers]]
name = "cpa"
api_key = "secret-cpa-key-123456"
base_url = "http://127.0.0.1:18796/v1"
codex.env_key = "OPENAI_API_KEY"

[[projects]]
name = "main"
[projects.agent.options]
model = "glm-5.1"

[[projects.platforms]]
type = "dmwork"
[projects.platforms.options]
account_id = "test"
`);
  const commandBin = path.join(root, "fake-bin");
  writeFile(path.join(commandBin, "codex"), "#!/usr/bin/env bash\necho 'codex 1.0.0'\n", 0o755);
  writeFile(path.join(commandBin, "omx"), "#!/usr/bin/env bash\necho 'omx 1.0.0'\n", 0o755);
  writeFile(path.join(commandBin, "cc-connect"), "#!/usr/bin/env bash\necho 'cc-connect 1.0.0'\n", 0o755);

  const previousPath = process.env.PATH;
  process.env.PATH = `${commandBin}${path.delimiter}${previousPath || ""}`;
  try {
    await withScriptedSystemctl(
      [
        "case \"$*\" in",
        "  \"--user list-unit-files\"*) echo \"${@: -1} enabled\"; exit 0 ;;",
        "  \"--user is-enabled\"*) echo \"enabled\"; exit 0 ;;",
        "  \"--user is-active\"*) echo \"active\"; exit 0 ;;",
        "esac",
        "exit 0",
      ].join("\n"),
      async () => {
        await withMockFetch(async (input) => {
          const url = String(input);
          if (url.includes("/healthz")) return new Response("ok", { status: 200 });
          if (url.includes("/v1/models")) {
            return new Response(JSON.stringify({ data: [{ id: "glm-5.1" }, { id: "kimi-k2.6" }] }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          }
          return new Response("not found", { status: 404 });
        }, async () => {
          const service = createCodexStackService(config);
          const summary = await service.getSummary();

          assert.equal(summary.overallStatus, "ready");
          assert.equal(summary.proxyPolicy.providerMode, "direct");
          assert.equal(summary.proxyPolicy.providerProxyUrl, "http://127.0.0.1:7890");
          assert.equal(summary.proxyPolicy.noProxyLoopbackReady, false);
          assert.deepEqual(summary.proxyPolicy.noProxyLoopbackMissing, ["127.0.0.1", "::1"]);
          assert.equal(summary.profile.lastSmokeMatrix?.status, "failed");
          assert.equal(summary.recommendation.kind, "review-proxy");
          assert.ok(summary.recommendation.reasonCodes.includes("no-proxy-loopback-missing"));
          assert.ok(summary.recommendation.reasonCodes.includes("smoke-matrix-failed"));
          assert.ok(summary.recommendation.reasonCodes.includes("system-proxy-direct-provider"));
        });
      },
    );
  } finally {
    if (previousPath === undefined) delete process.env.PATH;
    else process.env.PATH = previousPath;
  }
});

test("codex stack prioritizes failed smoke retry before informational direct-provider proxy notice", async () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  const checkedAt = new Date().toISOString();
  writeJson(config.openclawConfigFile, {
    env: {
      HTTPS_PROXY: "http://127.0.0.1:7890",
      NO_PROXY: "localhost,127.0.0.1,::1",
    },
  });
  writeJson(path.join(root, ".codex/auth.json"), {
    auth_mode: "apikey",
    OPENAI_API_KEY: "secret-cpa-key-123456",
  });
  writeJson(path.join(config.openclawRoot, "studio/codex-stack/profile.json"), {
    lastSmokeMatrix: {
      status: "failed",
      checkedAt,
      requiredModels: ["glm-5.1", "kimi-k2.6"],
      attachEligible: false,
      models: [
        {
          model: "glm-5.1",
          status: "passed",
          startedAt: checkedAt,
          finishedAt: checkedAt,
          checks: [],
          error: null,
        },
        {
          model: "kimi-k2.6",
          status: "failed",
          startedAt: checkedAt,
          finishedAt: checkedAt,
          checks: [],
          error: "responses upstream failed with 500",
        },
      ],
    },
  });
  createBundledInstaller(config, "official");
  createBundledInstaller(config, "dmwork");
  createGeneratedStackFiles(root);
  writeFile(path.join(root, ".local/bin/cli-proxy-api"), "#!/usr/bin/env bash\necho cpa\n", 0o755);
  writeFile(path.join(root, ".local/bin/cpa-compact-proxy.mjs"), "#!/usr/bin/env node\nconsole.log('compact')\n", 0o755);
  writeFile(path.join(root, ".cc-connect/config.toml"), `
[[providers]]
name = "cpa"
api_key = "secret-cpa-key-123456"
base_url = "http://127.0.0.1:18796/v1"
codex.env_key = "OPENAI_API_KEY"

[[projects]]
name = "main"
[projects.agent.options]
model = "glm-5.1"

[[projects.platforms]]
type = "dmwork"
[projects.platforms.options]
account_id = "test"
`);
  const commandBin = path.join(root, "fake-bin");
  writeFile(path.join(commandBin, "codex"), "#!/usr/bin/env bash\necho 'codex 1.0.0'\n", 0o755);
  writeFile(path.join(commandBin, "omx"), "#!/usr/bin/env bash\necho 'omx 1.0.0'\n", 0o755);
  writeFile(path.join(commandBin, "cc-connect"), "#!/usr/bin/env bash\necho 'cc-connect 1.0.0'\n", 0o755);

  const previousPath = process.env.PATH;
  process.env.PATH = `${commandBin}${path.delimiter}${previousPath || ""}`;
  try {
    await withScriptedSystemctl(
      [
        "case \"$*\" in",
        "  \"--user list-unit-files\"*) echo \"${@: -1} enabled\"; exit 0 ;;",
        "  \"--user is-enabled\"*) echo \"enabled\"; exit 0 ;;",
        "  \"--user is-active\"*) echo \"active\"; exit 0 ;;",
        "esac",
        "exit 0",
      ].join("\n"),
      async () => {
        await withMockFetch(async (input) => {
          const url = String(input);
          if (url.includes("/healthz")) return new Response("ok", { status: 200 });
          if (url.includes("/v1/models")) {
            return new Response(JSON.stringify({ data: [{ id: "glm-5.1" }, { id: "kimi-k2.6" }] }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          }
          return new Response("not found", { status: 404 });
        }, async () => {
          const service = createCodexStackService(config);
          const summary = await service.getSummary();

          assert.equal(summary.overallStatus, "ready");
          assert.equal(summary.proxyPolicy.providerMode, "direct");
          assert.equal(summary.proxyPolicy.providerProxyUrl, "http://127.0.0.1:7890");
          assert.equal(summary.proxyPolicy.noProxyLoopbackReady, true);
          assert.equal(summary.profile.lastSmokeMatrix?.status, "failed");
          assert.equal(summary.recommendation.kind, "review-smoke");
          assert.ok(summary.recommendation.reasonCodes.includes("smoke-matrix-failed"));
          assert.ok(summary.recommendation.reasonCodes.includes("system-proxy-direct-provider"));
          assert.match(summary.runReadiness.checks.find((check) => check.id === "smoke-matrix")?.detail || "", /kimi-k2\.6/);
          assert.match(summary.runReadiness.checks.find((check) => check.id === "smoke-matrix")?.detail || "", /responses upstream failed with 500/);
        });
      },
    );
  } finally {
    if (previousPath === undefined) delete process.env.PATH;
    else process.env.PATH = previousPath;
  }
});
