import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createLspService } from "../../dist/apps/api/modules/lsp/service.js";
import { ExternalLanguageServerGateway } from "../../dist/apps/api/modules/lsp/external/index.js";

function makeTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "tracevane-lsp-dockerfile-"));
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

test("external LSP gateway starts real Dockerfile language server and records lifecycle", async () => {
  const root = makeTempRoot();
  const gateway = new ExternalLanguageServerGateway({ rootPath: root });
  const profile = gateway.listProfiles().find((candidate) => candidate.id === "dockerfile");
  assert.ok(profile, "dockerfile profile should be server-side allowlisted");
  assert.deepEqual(profile?.args?.slice(-1), ["--stdio"]);
  assert.equal(profile?.command, process.execPath);

  const started = await gateway.start("dockerfile");
  assert.equal(started.status, "available");
  assert.equal(started.providerId, "dockerfile");

  const stopped = await gateway.stop("dockerfile");
  assert.equal(stopped.status, "stopped");
  assert.equal(stopped.reason, "stopped");
});

test("LSP service routes Dockerfile diagnostics through the Dockerfile external provider", async () => {
  const root = makeTempRoot();
  const file = path.join(root, "Dockerfile");
  const content = "FROM\nRUN\n";
  fs.writeFileSync(file, content, "utf8");

  const service = createLspService(createTracevaneConfig(root));
  const status = service.getStatus();
  const profile = status.externalProviders.profiles.find((candidate) => candidate.id === "dockerfile");
  assert.ok(profile?.enabled, "dockerfile profile should be enabled");
  assert.equal(profile.install?.status, "installed");
  assert.equal(profile.install?.version, "0.15.0");
  assert.equal(profile.install?.pinnedVersion, "0.15.0");

  const response = await service.diagnoseDocument({
    id: "dockerfile-proof",
    rootId: "openclaw-root",
    path: path.relative(path.parse(file).root, file).replaceAll(path.sep, "/"),
    language: "dockerfile",
    version: 1,
    content,
  });

  assert.equal(response.provider, "dockerfile");
  assert.equal(response.language, "dockerfile");
  assert.ok(response.diagnostics.length >= 1, "invalid Dockerfile should produce diagnostics");
  assert.ok(response.diagnostics.some((diagnostic) => diagnostic.source.toLowerCase().includes("docker")), "diagnostic source should identify Dockerfile language server");
});
