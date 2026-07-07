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

test("LSP status exposes guarded toolchain provider candidates without runtime probing", () => {
  const service = createLspService(createTracevaneConfig(makeTempRoot()));
  const status = service.getStatus();
  const candidates = status.toolchainProviders?.candidates ?? [];
  const byId = new Map(candidates.map((candidate) => [candidate.providerId, candidate]));

  assert.equal(status.toolchainProviders?.policy?.readOnly, true);
  assert.equal(status.toolchainProviders?.policy?.probesRuntimePath, false);
  assert.equal(status.toolchainProviders?.policy?.startsLanguageServers, false);
  assert.equal(status.toolchainProviders?.policy?.acceptsFrontendCommandOverrides, false);

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
    assert.equal(candidate.requiredBinary, binary, `${providerId} binary should be descriptive metadata only`);
    assert.ok(candidate.languages.includes(language), `${providerId} should declare ${language} language coverage`);
    assert.ok(candidate.configurationKey.startsWith("lsp.toolchains."), `${providerId} should expose future config key`);
    assert.match(candidate.nextAction, /Configure a trusted workspace/i, `${providerId} next action should require trusted config`);
    assert.ok(candidate.notes.some((note) => /does not inspect PATH/i.test(note)), `${providerId} should document no PATH probing`);
  }
});
