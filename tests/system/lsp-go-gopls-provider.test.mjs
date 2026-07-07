import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { createLspService } from "../../dist/apps/api/modules/lsp/service.js";
import {
  createGoGoplsProfile,
  diagnoseWithGoGopls,
} from "../../dist/apps/api/modules/lsp/toolchain/goGoplsProvider.js";
import { findGoWorkspaceMarker } from "../../dist/apps/api/modules/lsp/toolchain/goWorkspace.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const mockServerPath = path.join(repoRoot, "tests/fixtures/lsp-mock-server.mjs");

function makeTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "tracevane-lsp-go-gopls-"));
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

function trustGoGopls(config) {
  writeConfig(config, {
    lsp: { toolchains: { go: { gopls: { enabled: true, trusted: true, profileId: "workspace" } } } },
  });
}

function createGoFile(root, relativePath, content = "package main\nfunc main() {\n}\n") {
  const file = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, "utf8");
  return file;
}

function filesystemRootRelative(file) {
  const filesystemRoot = path.parse(file).root || path.sep;
  return path.relative(filesystemRoot, file);
}

test("Go workspace marker detection prefers go.work over nearest go.mod", () => {
  const root = makeTempRoot();
  fs.writeFileSync(path.join(root, "go.work"), "go 1.22\n", "utf8");
  fs.mkdirSync(path.join(root, "module"), { recursive: true });
  fs.writeFileSync(path.join(root, "module", "go.mod"), "module example.com/m\ngo 1.22\n", "utf8");
  const file = createGoFile(root, "module/main.go");

  const marker = findGoWorkspaceMarker(root, file);
  assert.equal(marker?.kind, "go.work");
  assert.equal(marker?.directory, root);
});

test("Go diagnostics remain skipped until trusted config and workspace marker exist", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const file = createGoFile(root, "main.go");
  const service = createLspService(config);
  const requestPath = filesystemRootRelative(file);

  const unconfigured = await service.diagnoseDocument({ rootId: "openclaw-root", path: requestPath, language: "go", content: fs.readFileSync(file, "utf8") });
  assert.equal(unconfigured.provider, "go");
  assert.deepEqual(unconfigured.diagnostics, []);


  writeConfig(config, {
    lsp: { toolchains: { go: { gopls: { enabled: true, trusted: true } } } },
  });
  fs.writeFileSync(path.join(root, "go.mod"), "module example.com/tracevane\ngo 1.22\n", "utf8");
  const missingProfile = await service.diagnoseDocument({ rootId: "openclaw-root", path: requestPath, language: "go", content: fs.readFileSync(file, "utf8") });
  assert.equal(missingProfile.provider, "go");
  assert.deepEqual(missingProfile.diagnostics, []);

  trustGoGopls(config);
  const missingMarker = await service.diagnoseDocument({ rootId: "openclaw-root", path: requestPath, language: "go", content: fs.readFileSync(file, "utf8") });
  assert.equal(missingMarker.provider, "go");
  assert.deepEqual(missingMarker.diagnostics, []);
});

test("trusted Go config with missing gopls binary degrades without failing diagnostics route", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  trustGoGopls(config);
  fs.writeFileSync(path.join(root, "go.mod"), "module example.com/tracevane\ngo 1.22\n", "utf8");
  const file = createGoFile(root, "main.go");

  const response = await createLspService(config).diagnoseDocument({
    rootId: "openclaw-root",
    path: filesystemRootRelative(file),
    language: "go",
    content: fs.readFileSync(file, "utf8"),
  });
  assert.equal(response.provider, "go");
  assert.deepEqual(response.diagnostics, []);
});

test("Go gopls proof can run through the guarded stdio gateway with an allowlisted profile", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  trustGoGopls(config);
  fs.writeFileSync(path.join(root, "go.mod"), "module example.com/tracevane\ngo 1.22\n", "utf8");
  const file = createGoFile(root, "main.go");

  const result = await diagnoseWithGoGopls({
    config,
    rootRealPath: root,
    absolutePath: file,
    content: fs.readFileSync(file, "utf8"),
    version: 1,
    profile: createGoGoplsProfile({ command: process.execPath, args: [mockServerPath] }),
    probe: async () => ({ ok: true, status: "configured", versionSummary: "gopls mock v0.0.0", reason: null }),
  });

  assert.equal(result.skipped, false);
  assert.equal(result.status, "configured");
  assert.equal(result.marker?.kind, "go.mod");
  assert.equal(result.diagnostics.length, 1);
  assert.equal(result.diagnostics[0].message, "mock diagnostic");
});
