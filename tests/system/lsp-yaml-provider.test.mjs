import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createLspService } from "../../dist/apps/api/modules/lsp/service.js";

function makeTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "tracevane-lsp-yaml-"));
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

test("LSP service routes YAML diagnostics through the external language-server provider", async () => {
  const root = makeTempRoot();
  const file = path.join(root, "invalid.yaml");
  const content = "name: tracevane\n  bad-indent: true\n";
  fs.writeFileSync(file, content, "utf8");

  const service = createLspService(createTracevaneConfig(root));
  const status = service.getStatus();
  assert.ok(status.externalProviders.profiles.some((profile) => profile.id === "yaml" && profile.enabled));
  const yamlStatus = status.externalProviders.statuses.find((entry) => entry.providerId === "yaml");
  assert.equal(yamlStatus?.status, "stopped");
  assert.equal(yamlStatus?.reason, "not_started");

  const response = await service.diagnoseDocument({
    id: "yaml-proof",
    rootId: "openclaw-root",
    path: path.relative(path.parse(file).root, file).replaceAll(path.sep, "/"),
    language: "yaml",
    version: 1,
    content,
  });

  assert.equal(response.provider, "yaml");
  assert.equal(response.language, "yaml");
  assert.ok(response.diagnostics.length >= 1, "invalid YAML should produce diagnostics");
  assert.equal(response.diagnostics[0].source, "YAML");
});
