import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createLspService } from "../../dist/apps/api/modules/lsp/service.js";

function makeTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "tracevane-lsp-toolchain-status-"));
}

function createTracevaneConfig(root) {
  const openclawRoot = path.join(root, ".openclaw");
  fs.mkdirSync(openclawRoot, { recursive: true });
  return {
    pluginId: "tracevane",
    pluginName: "Tracevane",
    version: "0.1.0",
    port: 3760,
    autoStart: true,
    openclawRoot,
    openclawConfigFile: path.join(openclawRoot, "openclaw.json"),
    projectRoot: path.join(root, "tracevane"),
    webDistDir: path.join(root, "tracevane/apps/web/dist"),
    gatewayPort: 31879,
    gatewayWsUrl: "ws://127.0.0.1:31879",
    gatewayControlUiBasePath: "",
    transport: {
      standalone: { enabled: true, port: 3760 },
      gateway: { enabled: true, basePath: "/tracevane" },
    },
  };
}

function writeConfig(config, payload) {
  fs.mkdirSync(path.dirname(config.openclawConfigFile), { recursive: true });
  fs.writeFileSync(config.openclawConfigFile, JSON.stringify(payload, null, 2), "utf8");
}

function toolchainById(status) {
  return new Map((status.toolchainProviders?.candidates ?? []).map((candidate) => [candidate.providerId, candidate]));
}

test("LSP status exposes guarded toolchain provider candidates without runtime probing", () => {
  const service = createLspService(createTracevaneConfig(makeTempRoot()));
  const status = service.getStatus();
  const byId = toolchainById(status);

  assert.equal(status.toolchainProviders?.policy?.readOnly, true);
  assert.equal(status.toolchainProviders?.policy?.probesRuntimePath, false);
  assert.equal(status.toolchainProviders?.policy?.startsLanguageServers, true);
  assert.deepEqual(status.toolchainProviders?.policy?.runtimeProofProviderIds, ["go", "rust", "clangd"]);
  assert.equal(status.toolchainProviders?.policy?.acceptsFrontendCommandOverrides, false);
  assert.equal(status.toolchainProviders?.policy?.acceptsOnlyAllowlistedProfiles, true);
  assert.equal(status.toolchainProviders?.policy?.configSource, "openclaw-config");

  for (const [providerId, binary, language] of [
    ["go", "gopls", "go"],
    ["rust", "rust-analyzer", "rust"],
    ["java", "jdtls", "java"],
    ["clangd", "clangd", "cpp"],
  ]) {
    const candidate = byId.get(providerId);
    assert.ok(candidate, `expected ${providerId} toolchain candidate`);
    assert.equal(candidate.status, "notConfigured", `${providerId} must stay notConfigured until user config exists`);
    assert.equal(candidate.configured, false, `${providerId} must not be auto-configured`);
    assert.equal(candidate.config.configSource, "none", `${providerId} should report missing config source`);
    assert.equal(candidate.config.trusted, false, `${providerId} must not infer trust`);
    assert.equal(candidate.requiredBinary, binary, `${providerId} binary should be descriptive metadata only`);
    assert.ok(candidate.languages.includes(language), `${providerId} should declare ${language} language coverage`);
    assert.ok(candidate.configurationKey.startsWith("lsp.toolchains."), `${providerId} should expose future config key`);
    assert.match(candidate.nextAction, /Configure a trusted workspace/i, `${providerId} next action should require trusted config`);
    assert.ok(candidate.notes.some((note) => /does not inspect PATH/i.test(note)), `${providerId} should document no PATH probing`);
    assert.deepEqual(candidate.config.acceptedProfileIds, ["workspace"], `${providerId} should expose allowlisted profile ids`);
  }
});

test("LSP toolchain status accepts only trusted allowlisted profile config", () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  writeConfig(config, {
    lsp: {
      toolchains: {
        go: { gopls: { enabled: true, trusted: true, profileId: "workspace" } },
        rust: { rustAnalyzer: { enabled: true, trusted: true, profileId: "workspace" } },
        java: { jdtls: { enabled: true, trusted: true, profileId: "custom" } },
        cxx: { clangd: { enabled: true, trusted: true, profileId: "workspace", command: "/usr/bin/clangd" } },
      },
    },
  });

  const status = createLspService(config).getStatus();
  const byId = toolchainById(status);

  const go = byId.get("go");
  assert.equal(go.status, "configured");
  assert.equal(go.configured, true);
  assert.equal(go.config.configSource, "openclaw-config");
  assert.equal(go.config.enabled, true);
  assert.equal(go.config.trusted, true);
  assert.equal(go.config.profileId, "workspace");
  assert.match(go.nextAction, /guarded diagnostics proof/i);

  const rust = byId.get("rust");
  assert.equal(rust.status, "configured");
  assert.equal(rust.configured, true);
  assert.equal(rust.config.enabled, true);
  assert.equal(rust.config.trusted, true);
  assert.match(rust.nextAction, /M12-N permits guarded diagnostics proof/i);

  const java = byId.get("java");
  assert.equal(java.status, "unavailable");
  assert.equal(java.configured, false);
  assert.match(java.config.rejectedReason, /not allowlisted/i);

  const clangd = byId.get("clangd");
  assert.equal(clangd.status, "unavailable");
  assert.equal(clangd.configured, false);
  assert.match(clangd.config.rejectedReason, /Runtime override key 'command'/i);
  assert.ok(clangd.notes.some((note) => /command\/args\/env\/cwd overrides are rejected/i.test(note)));
});
