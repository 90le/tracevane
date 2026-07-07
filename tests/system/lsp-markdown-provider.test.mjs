import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createLspService } from "../../dist/apps/api/modules/lsp/service.js";
import { ExternalLanguageServerGateway } from "../../dist/apps/api/modules/lsp/external/index.js";

function makeTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "tracevane-lsp-markdown-"));
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

test("external LSP gateway starts real Markdown language server and records lifecycle", async () => {
  const root = makeTempRoot();
  const gateway = new ExternalLanguageServerGateway({ rootPath: root });
  const profile = gateway.listProfiles().find((candidate) => candidate.id === "markdown");
  assert.ok(profile, "markdown profile should be server-side allowlisted");
  assert.deepEqual(profile?.args?.slice(-1), ["--stdio"]);
  assert.equal(profile?.command, process.execPath);
  assert.ok(profile?.args?.[0]?.includes("vscode-markdown-language-server"), "profile should target the Markdown bin only");

  const started = await gateway.start("markdown");
  assert.equal(started.status, "available");
  assert.equal(started.providerId, "markdown");

  const stopped = await gateway.stop("markdown");
  assert.equal(stopped.status, "stopped");
  assert.equal(stopped.reason, "stopped");
});

test("LSP service routes Markdown diagnostics through the Markdown external provider", async () => {
  const root = makeTempRoot();
  const file = path.join(root, "README.md");
  const content = "# Tracevane\n\n[missing](./missing.md)\n";
  fs.writeFileSync(file, content, "utf8");

  const service = createLspService(createTracevaneConfig(root));
  const status = service.getStatus();
  const profile = status.externalProviders.profiles.find((candidate) => candidate.id === "markdown");
  const metadata = status.externalProviders.metadata.find((candidate) => candidate.providerId === "markdown");
  assert.ok(profile?.enabled, "markdown profile should be enabled");
  assert.equal(profile.install?.status, "installed");
  assert.equal(profile.install?.version, "4.10.0");
  assert.equal(profile.install?.pinnedVersion, "4.10.0");
  assert.equal(profile.install?.packageName, "vscode-langservers-extracted");
  assert.equal(metadata?.installStatus, "installed");
  assert.equal(metadata?.version, "4.10.0");
  assert.match(metadata?.audit?.summary ?? "", /Markdown language server proof/);

  const response = await service.diagnoseDocument({
    id: "markdown-proof",
    rootId: "openclaw-root",
    path: path.relative(path.parse(file).root, file).replaceAll(path.sep, "/"),
    language: "markdown",
    version: 1,
    content,
  });

  assert.equal(response.provider, "markdown");
  assert.equal(response.language, "markdown");
  assert.ok(Array.isArray(response.diagnostics), "Markdown diagnostics route should return a bounded diagnostics array");
  for (const diagnostic of response.diagnostics) {
    assert.ok(diagnostic.source.toLowerCase().includes("markdown"), "diagnostic source should identify Markdown language server");
  }
});
