import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { createLspService } from "../../dist/apps/api/modules/lsp/service.js";
import {
  createClangdProfile,
  diagnoseWithClangd,
  probeClangdVersion,
} from "../../dist/apps/api/modules/lsp/toolchain/clangdProvider.js";
import { findClangdWorkspaceMarker } from "../../dist/apps/api/modules/lsp/toolchain/clangdWorkspace.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const mockServerPath = path.join(repoRoot, "tests/fixtures/lsp-mock-server.mjs");

function makeTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "tracevane-lsp-clangd-"));
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

function trustClangd(config) {
  writeConfig(config, {
    lsp: { toolchains: { cxx: { clangd: { enabled: true, trusted: true, profileId: "workspace" } } } },
  });
}

function createCxxFile(root, relativePath, content = "int main() {\n  return 0;\n}\n") {
  const file = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, "utf8");
  return file;
}

function filesystemRootRelative(file) {
  const filesystemRoot = path.parse(file).root || path.sep;
  return path.relative(filesystemRoot, file);
}

test("clangd marker detection prefers nearest compile_commands and falls back to compile_flags then .clangd", () => {
  const root = makeTempRoot();
  fs.writeFileSync(path.join(root, ".clangd"), "CompileFlags:\n  Add: [-Wall]\n", "utf8");
  fs.mkdirSync(path.join(root, "pkg", "src"), { recursive: true });
  fs.writeFileSync(path.join(root, "pkg", "compile_flags.txt"), "-std=c++20\n", "utf8");
  fs.mkdirSync(path.join(root, "pkg", "nested"), { recursive: true });
  fs.writeFileSync(path.join(root, "pkg", "nested", "compile_commands.json"), "[]\n", "utf8");
  const nested = createCxxFile(root, "pkg/nested/src/main.cc");
  const sibling = createCxxFile(root, "pkg/src/lib.cpp");
  const rootFile = createCxxFile(root, "standalone.c");

  const compileCommands = findClangdWorkspaceMarker(root, nested);
  assert.equal(compileCommands?.kind, "compile_commands.json");
  assert.equal(compileCommands?.directory, path.join(root, "pkg", "nested"));

  const compileFlags = findClangdWorkspaceMarker(root, sibling);
  assert.equal(compileFlags?.kind, "compile_flags.txt");
  assert.equal(compileFlags?.directory, path.join(root, "pkg"));

  const clangdConfig = findClangdWorkspaceMarker(root, rootFile);
  assert.equal(clangdConfig?.kind, ".clangd");
  assert.equal(clangdConfig?.directory, root);
});

test("clangd marker detection rejects root escapes and ignored directories", () => {
  const root = makeTempRoot();
  fs.writeFileSync(path.join(root, "compile_commands.json"), "[]\n", "utf8");
  const outside = createCxxFile(makeTempRoot(), "src/main.cpp");
  assert.equal(findClangdWorkspaceMarker(root, outside), null);

  const ignored = createCxxFile(root, "node_modules/pkg/src/main.cpp");
  assert.equal(findClangdWorkspaceMarker(root, ignored), null);
});

test("clangd diagnostics route degrades until trusted config and workspace marker exist", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const file = createCxxFile(root, "src/main.cpp");
  const service = createLspService(config);
  const requestPath = filesystemRootRelative(file);

  const unconfigured = await service.diagnoseDocument({ rootId: "openclaw-root", path: requestPath, language: "cpp", content: fs.readFileSync(file, "utf8") });
  assert.equal(unconfigured.provider, "clangd");
  assert.deepEqual(unconfigured.diagnostics, []);

  trustClangd(config);
  const missingMarker = await service.diagnoseDocument({ rootId: "openclaw-root", path: requestPath, language: "cpp", content: fs.readFileSync(file, "utf8") });
  assert.equal(missingMarker.provider, "clangd");
  assert.deepEqual(missingMarker.diagnostics, []);
});

test("clangd probe degrades for missing binaries and unsupported output", async () => {
  const root = makeTempRoot();
  const missing = await probeClangdVersion(createClangdProfile({ command: path.join(root, "missing-clangd") }), root);
  assert.equal(missing.ok, false);
  assert.equal(missing.status, "missingBinary");

  const unsupported = await probeClangdVersion(createClangdProfile({ command: process.execPath }), root);
  assert.equal(unsupported.ok, false);
  assert.equal(unsupported.status, "unsupportedVersion");
});

test("clangd proof can run through the guarded stdio gateway with an allowlisted profile", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  trustClangd(config);
  fs.writeFileSync(path.join(root, "compile_commands.json"), "[]\n", "utf8");
  const file = createCxxFile(root, "src/main.cpp");

  const result = await diagnoseWithClangd({
    config,
    rootRealPath: root,
    absolutePath: file,
    content: fs.readFileSync(file, "utf8"),
    version: 1,
    profile: createClangdProfile({ command: process.execPath, args: [mockServerPath] }),
    probe: async () => ({ ok: true, status: "configured", versionSummary: "clangd mock v0.0.0", reason: null }),
  });

  assert.equal(result.skipped, false);
  assert.equal(result.status, "configured");
  assert.equal(result.marker?.kind, "compile_commands.json");
  assert.equal(result.diagnostics.length, 1);
  assert.equal(result.diagnostics[0].message, "mock diagnostic");
});
