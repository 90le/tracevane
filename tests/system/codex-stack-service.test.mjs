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
  const subDir = channel === "dmwork" ? "codex-docs-dmwork" : "codex-docs";
  const root = path.join(config.projectRoot, "resources/codex-stack", subDir);
  writeFile(path.join(root, "VERSION"), channel === "dmwork" ? "dmwork-test-bundle\n" : "test-bundle\n");
  writeFile(path.join(root, "resources/scripts/auto-setup.sh"), "#!/usr/bin/env bash\necho setup\n", 0o755);
  writeFile(path.join(root, "resources/scripts/health-check.sh"), "#!/usr/bin/env bash\necho '  OK fake check'\n", 0o755);
  if (channel !== "dmwork") {
    writeFile(path.join(root, "resources/scripts/finish-cc-connect-setup.sh"), "#!/usr/bin/env bash\necho finalize\n", 0o755);
  }
  writeFile(path.join(root, "resources/bin/cli-proxy-api"), "bin\n", 0o755);
  writeFile(path.join(root, "resources/cpa-config-templates/compact-proxy.mjs"), "process.stdout.write('proxy\\n')\n", 0o755);
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

async function withMockFetch(handler, task) {
  const original = globalThis.fetch;
  globalThis.fetch = handler;
  try {
    await task();
  } finally {
    globalThis.fetch = original;
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
  assert.equal(summary.installer.cpaLatestVersion, "v7.1.17");
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

test("codex stack default model prefers live supported kimi then glm then openclaw default", async () => {
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

    assert.equal(summary.models.current, "kimi-k2.6");
    assert.equal(summary.models.defaultModel, "kimi-k2.6");
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

    assert.equal(summary.models.current, "glm-5.1");
    assert.equal(summary.models.defaultModel, "glm-5.1");
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

test("codex stack check runs bundled health script and redacts known secrets", async () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  writeJson(config.openclawConfigFile, {});
  createBundledInstaller(config, "official");
  createBundledInstaller(config, "dmwork");
  createGeneratedStackFiles(root);
  writeFile(
    path.join(config.projectRoot, "resources/codex-stack/codex-docs/resources/scripts/health-check.sh"),
    "#!/usr/bin/env bash\necho '  OK secret-cpa-key-123456 is hidden'\n",
    0o755,
  );
  writeFile(
    path.join(config.projectRoot, "resources/codex-stack/codex-docs-dmwork/resources/scripts/health-check.sh"),
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
      "",
    ].join("\n");
  writeFile(path.join(config.projectRoot, "resources/codex-stack/codex-docs/resources/scripts/auto-setup.sh"), setupScriptContent, 0o755);
  writeFile(path.join(config.projectRoot, "resources/codex-stack/codex-docs-dmwork/resources/scripts/auto-setup.sh"), setupScriptContent, 0o755);

  const service = createCodexStackService(config);
  const response = await service.startInstall(undefined, {
    env: {
	      CODEX_MODEL: "glm-5.1",
	      CODEX_CONTEXT_MODE: "custom",
	      CODEX_CONTEXT_WINDOW: 320000,
	      CPA_PROXY_KEY: "secret-cpa-key-for-job",
      OPENCLAW_UPSTREAM_BASE_URL: "https://upstream.example.test/v1",
      OPENCLAW_UPSTREAM_API_KEY: "secret-upstream-key-for-job",
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
  assert.doesNotMatch(job.logTail, /secret-cpa-key-for-job/);
  assert.doesNotMatch(job.logTail, /secret-upstream-key-for-job/);

  const summary = await service.getSummary();
  assert.equal(summary.profile.upstreamOverride?.hasBaseUrl, true);
  assert.equal(summary.profile.upstreamOverride?.hasApiKey, true);
  const authJson = JSON.parse(fs.readFileSync(path.join(root, ".codex/auth.json"), "utf8"));
  assert.equal(authJson.OPENAI_API_KEY, "secret-cpa-key-for-job");
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

test("codex stack summary hides finalizer when active channel has no finalizer script", async () => {
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
  assert.equal(summary.ccConnect.finalizerAvailable, false);
  assert.equal(summary.ccConnect.canFinalize, false);
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
  assert.ok(response.restartRequiredUnits?.includes("cli-proxy-api.service"));
  assert.ok(response.restartRequiredUnits?.includes("cpa-compact-proxy.service"));
  assert.ok(response.restartRequiredUnits?.includes("cc-connect.service"));
  assert.match(fs.readFileSync(codexConfig, "utf8"), /model = "gpt-5\.4"/);
  assert.match(fs.readFileSync(codexConfig, "utf8"), /28796/);
  assert.match(fs.readFileSync(codexConfig, "utf8"), /model_context_window = 1050000/);
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

test("bundled health check treats skipped cc-connect as warning only", () => {
  const script = fs.readFileSync(
    path.join("resources/codex-stack/codex-docs/resources/scripts/health-check.sh"),
    "utf8",
  );
  assert.match(script, /cc-connect not found; skip this if you intentionally installed Codex\/CPA\/Compact only/);
  assert.doesNotMatch(script, /fail "cc-connect not found"/);
});
