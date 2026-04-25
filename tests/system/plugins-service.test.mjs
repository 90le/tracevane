import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chmodSync } from "node:fs";
import { execFileSync } from "node:child_process";

const { createPluginsService } = await (async () => {
  try {
    return await import("../../apps/api/modules/plugins/service.ts");
  } catch {
    return await import("../../dist/apps/api/modules/plugins/service.js");
  }
})();

function makeTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "studio-plugins-service-"));
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function createZipFromDirectory(sourceDir, zipPath) {
  execFileSync(
    "python3",
    [
      "-c",
      `
import pathlib
import sys
import zipfile

source = pathlib.Path(sys.argv[1])
zip_path = pathlib.Path(sys.argv[2])
with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
    for file_path in source.rglob('*'):
        if file_path.is_file():
            zf.write(file_path, file_path.relative_to(source))
`,
      sourceDir,
      zipPath,
    ],
  );
}

async function withStubbedOpenClaw(fn) {
  const root = makeTempRoot();
  const binDir = path.join(root, "bin");
  fs.mkdirSync(binDir, { recursive: true });
  const scriptPath = path.join(binDir, "openclaw");
  fs.writeFileSync(
    scriptPath,
    `#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const configPath = path.join(process.cwd(), 'openclaw.json');
const cfg = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, 'utf8')) : {};
cfg.plugins = cfg.plugins || {};
cfg.plugins.installs = cfg.plugins.installs || {};
const args = process.argv.slice(2);
if (args[0] === 'plugins' && args[1] === 'install') {
  const spec = args[2];
  cfg.plugins.installs.demo = { source: 'npm', spec, installPath: '/tmp/demo-plugin' };
  cfg.plugins.entries = cfg.plugins.entries || {};
  cfg.plugins.entries.demo = { enabled: true, config: {} };
  fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2));
  console.log('installed demo');
} else if (args[0] === 'plugins' && args[1] === 'update') {
  console.log('updated plugins');
} else if (args[0] === 'plugins' && args[1] === 'uninstall') {
  delete cfg.plugins.installs.demo;
  delete cfg.plugins.entries?.demo;
  fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2));
  console.log('uninstalled demo');
} else {
  console.log('ok');
}
`,
    "utf8",
  );
  chmodSync(scriptPath, 0o755);
  const previousPath = process.env.PATH;
  process.env.PATH = `${binDir}:${previousPath || ""}`;
  try {
    await fn(root);
  } finally {
    process.env.PATH = previousPath;
  }
}

test("plugins service merges config entries, manifests, installs, and diagnostics", () => {
  const root = makeTempRoot();
  const loadPath = path.join(root, "extensions");
  writeJson(path.join(loadPath, "sample", "openclaw.plugin.json"), {
    id: "sample",
    name: "Sample Plugin",
    description: "Sample plugin",
    version: "1.2.3",
    kind: "provider",
    skills: ["./skills"],
  });
  const config = {
    openclawRoot: root,
    openclawConfigFile: path.join(root, "openclaw.json"),
  };
  writeJson(config.openclawConfigFile, {
    plugins: {
      enabled: true,
      allow: ["sample", "missing"],
      deny: ["blocked"],
      load: { paths: [loadPath, "relative/path"] },
      slots: { memory: "memory-core" },
      installs: {
        sample: {
          source: "clawhub",
          spec: "sample@1",
          installPath: "/tmp/sample",
        },
      },
      entries: {
        sample: {
          enabled: true,
          config: {
            token: "secret",
            visible: "ok",
          },
        },
      },
    },
  });

  const summary = createPluginsService(config).getSummary();

  assert.equal(summary.counts.entries, 1);
  assert.equal(summary.counts.manifests, 1);
  assert.equal(summary.entries[0].manifest?.id, "sample");
  assert.deepEqual(summary.entries[0].config, { visible: "ok" });
  assert.equal(summary.entries.some((entry) => entry.id === "sample" && entry.status === "enabled"), true);
  assert.deepEqual(summary.capabilityIndex.provider, ["sample"]);
  assert.deepEqual(summary.capabilityIndex.skills, ["sample"]);
  assert.equal(typeof summary.entries[0].manifest?.configSchema, "object");
  assert.equal(summary.installs[0].id, "sample");
  assert.equal(summary.diagnostics.some((item) => item.key === "allow-missing-missing"), true);
  assert.equal(summary.diagnostics.some((item) => item.key === "slot-missing-memory-core"), true);
  assert.equal(summary.diagnostics.some((item) => item.key === "load-path-relative/path"), true);
});

test("plugins service toggle persists entry enablement and returns impact preview", () => {
  const root = makeTempRoot();
  const config = {
    openclawRoot: root,
    openclawConfigFile: path.join(root, "openclaw.json"),
  };
  writeJson(config.openclawConfigFile, {
    plugins: {
      entries: {
        studio: {
          enabled: true,
          config: {},
        },
      },
    },
  });
  const service = createPluginsService(config);
  const result = service.togglePlugin("studio", false);
  const nextConfig = JSON.parse(fs.readFileSync(config.openclawConfigFile, "utf8"));

  assert.equal(result.success, true);
  assert.equal(result.critical, true);
  assert.equal(result.requiresRestart, true);
  assert.equal(result.impacts.length > 0, true);
  assert.equal(nextConfig.plugins.entries.studio.enabled, false);
});

test("plugins service bulk toggle updates configured and manifest-only entries in one pass", () => {
  const root = makeTempRoot();
  const loadPath = path.join(root, "extensions");
  writeJson(path.join(loadPath, "alpha", "openclaw.plugin.json"), {
    id: "alpha",
    name: "Alpha Plugin",
    kind: "provider",
  });
  writeJson(path.join(loadPath, "beta", "openclaw.plugin.json"), {
    id: "beta",
    name: "Beta Plugin",
    kind: "provider",
  });
  const config = {
    openclawRoot: root,
    openclawConfigFile: path.join(root, "openclaw.json"),
  };
  writeJson(config.openclawConfigFile, {
    plugins: {
      load: { paths: [loadPath] },
      entries: {
        alpha: {
          enabled: false,
          config: {},
        },
      },
    },
  });

  const service = createPluginsService(config);
  const enabledResult = service.bulkTogglePlugins({
    ids: ["alpha", "beta", "missing"],
    enabled: true,
    createMissingEntries: true,
  });
  const nextConfig = JSON.parse(fs.readFileSync(config.openclawConfigFile, "utf8"));

  assert.deepEqual(enabledResult.updatedIds.sort(), ["alpha", "beta"]);
  assert.equal(enabledResult.skipped.some((item) => item.reason === "not-discovered"), true);
  assert.equal(nextConfig.plugins.entries.alpha.enabled, true);
  assert.equal(nextConfig.plugins.entries.beta.enabled, true);

  const disabledResult = service.bulkTogglePlugins({
    ids: ["alpha", "beta"],
    enabled: false,
    createMissingEntries: false,
  });
  assert.deepEqual(disabledResult.updatedIds, ["alpha", "beta"]);
  assert.equal(disabledResult.summary.entries.find((entry) => entry.id === "alpha")?.status, "disabled");
});

test("plugins service install/update/uninstall wraps official CLI commands", async () => {
  await withStubbedOpenClaw(async (root) => {
    const config = {
      openclawRoot: root,
      openclawConfigFile: path.join(root, "openclaw.json"),
    };
    writeJson(config.openclawConfigFile, { plugins: { entries: {} } });
    const service = createPluginsService(config);

    const installed = await service.installPlugin({ spec: "@openclaw/demo" });
    assert.equal(installed.success, true);
    assert.equal(installed.summary.installs[0]?.id, "demo");

    const updated = await service.updatePlugins({ id: "demo" });
    assert.equal(updated.success, true);
    assert.match(updated.output, /updated plugins/);

    const bulkUpdated = await service.bulkUpdatePlugins({ ids: ["demo"] });
    assert.equal(bulkUpdated.success, true);
    assert.deepEqual(bulkUpdated.processedIds, ["demo"]);

    const uninstalled = await service.uninstallPlugin({ id: "demo", force: true });
    assert.equal(uninstalled.success, true);
    assert.equal(uninstalled.summary.installs.length, 0);

    await service.installPlugin({ spec: "@openclaw/demo" });
    const bulkUninstalled = await service.bulkUninstallPlugins({ ids: ["demo"], force: true });
    assert.equal(bulkUninstalled.success, true);
    assert.deepEqual(bulkUninstalled.processedIds, ["demo"]);
    assert.equal(bulkUninstalled.summary.installs.length, 0);
  });
});

test("plugins service preflight validates local directory manifests and remote specs conservatively", async () => {
  const root = makeTempRoot();
  const pluginDir = path.join(root, "plugin-a");
  writeJson(path.join(pluginDir, "openclaw.plugin.json"), {
    id: "plugin-a",
    name: "Plugin A",
    kind: "provider",
    configSchema: { type: "object", properties: { mode: { type: "string" } } },
    uiHints: { mode: { label: "Mode" } },
    skills: ["./skills"],
  });
  const config = {
    openclawRoot: root,
    openclawConfigFile: path.join(root, "openclaw.json"),
  };
  writeJson(config.openclawConfigFile, { plugins: {} });
  const service = createPluginsService(config);

  const local = await service.preflightPlugin({ spec: pluginDir });
  assert.equal(local.kind, "directory");
  assert.equal(local.manifest?.id, "plugin-a");
  assert.equal(local.spec, pluginDir);
  assert.equal(local.readiness, "review");
  assert.equal(local.requiresRestart, true);
  assert.equal(local.manifestCount, 1);
  assert.equal(local.pluginRoot, pluginDir);
  assert.equal(local.indicators.some((item) => item.key.includes("manifest-no-version-plugin-a")), true);
  assert.equal(local.indicators.some((item) => item.key.includes("manifest-missing-skill-path-plugin-a")), true);

  const remote = await service.preflightPlugin({ spec: "@openclaw/demo" });
  assert.equal(remote.kind, "npm-spec");
  assert.equal(remote.level, "warn");
  assert.equal(remote.readiness, "review");
  assert.equal(remote.requiresRestart, true);
});

test("plugins service supports uploaded zip plugin preflight and install", async () => {
  await withStubbedOpenClaw(async (root) => {
    const pluginDir = path.join(root, "upload-plugin");
    writeJson(path.join(pluginDir, "openclaw.plugin.json"), {
      id: "upload-demo",
      name: "Upload Demo",
      kind: "provider",
    });
    const zipPath = path.join(root, "upload-demo.zip");
    createZipFromDirectory(pluginDir, zipPath);
    const dataBase64 = fs.readFileSync(zipPath).toString("base64");
    const config = {
      openclawRoot: root,
      openclawConfigFile: path.join(root, "openclaw.json"),
    };
    writeJson(config.openclawConfigFile, { plugins: { entries: {} } });
    const service = createPluginsService(config);

    const preflight = await service.preflightUploadedPluginArchive({
      fileName: "upload-demo.zip",
      dataBase64,
    });
    assert.equal(preflight.preflight.manifest?.id, "upload-demo");
    assert.equal(preflight.preflight.kind, "directory");

    const installed = await service.installUploadedPluginArchive({
      fileName: "upload-demo.zip",
      dataBase64,
      force: true,
    });
    assert.equal(installed.success, true);
    assert.equal(installed.preflight.manifest?.id, "upload-demo");
    assert.equal(installed.summary.installs[0]?.id, "demo");
  });
});
