import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { createLspService } from "../../dist/apps/api/modules/lsp/service.js";
import {
  createRustAnalyzerProfile,
  defineWithRustAnalyzer,
  diagnoseWithRustAnalyzer,
  hoverWithRustAnalyzer,
  probeRustAnalyzerVersion,
} from "../../dist/apps/api/modules/lsp/toolchain/rustAnalyzerProvider.js";
import { providerForLanguage } from "../../dist/apps/api/modules/lsp/providers/registry.js";
import { findRustWorkspaceMarker } from "../../dist/apps/api/modules/lsp/toolchain/rustWorkspace.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const mockServerPath = path.join(repoRoot, "tests/fixtures/lsp-mock-server.mjs");

function makeTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "tracevane-lsp-rust-analyzer-"));
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

function trustRustAnalyzer(config) {
  writeConfig(config, {
    lsp: { toolchains: { rust: { rustAnalyzer: { enabled: true, trusted: true, profileId: "workspace" } } } },
  });
}

function createRustFile(root, relativePath, content = "fn main() {\n}\n") {
  const file = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, "utf8");
  return file;
}

function filesystemRootRelative(file) {
  const filesystemRoot = path.parse(file).root || path.sep;
  return path.relative(filesystemRoot, file);
}

test("Rust workspace marker detection uses nearest Cargo.toml and falls back to rust-project.json", () => {
  const root = makeTempRoot();
  fs.writeFileSync(path.join(root, "rust-project.json"), "{}\n", "utf8");
  fs.mkdirSync(path.join(root, "crate", "src"), { recursive: true });
  fs.writeFileSync(path.join(root, "crate", "Cargo.toml"), "[package]\nname = \"tracevane\"\nversion = \"0.0.0\"\nedition = \"2021\"\n", "utf8");
  const file = createRustFile(root, "crate/src/main.rs");

  const marker = findRustWorkspaceMarker(root, file);
  assert.equal(marker?.kind, "Cargo.toml");
  assert.equal(marker?.directory, path.join(root, "crate"));

  fs.rmSync(path.join(root, "crate", "Cargo.toml"));
  const fallback = findRustWorkspaceMarker(root, file);
  assert.equal(fallback?.kind, "rust-project.json");
  assert.equal(fallback?.directory, root);
});

test("Rust marker detection rejects root escapes and ignored directories", () => {
  const root = makeTempRoot();
  fs.writeFileSync(path.join(root, "Cargo.toml"), "[package]\nname = \"tracevane\"\nversion = \"0.0.0\"\nedition = \"2021\"\n", "utf8");
  const outside = createRustFile(makeTempRoot(), "src/main.rs");
  assert.equal(findRustWorkspaceMarker(root, outside), null);

  const ignored = createRustFile(root, "node_modules/pkg/src/main.rs");
  assert.equal(findRustWorkspaceMarker(root, ignored), null);
});

test("Rust diagnostics route degrades until trusted config and workspace marker exist", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const file = createRustFile(root, "src/main.rs");
  const service = createLspService(config);
  const requestPath = filesystemRootRelative(file);

  const unconfigured = await service.diagnoseDocument({ rootId: "openclaw-root", path: requestPath, language: "rust", content: fs.readFileSync(file, "utf8") });
  assert.equal(unconfigured.provider, "rust");
  assert.deepEqual(unconfigured.diagnostics, []);

  trustRustAnalyzer(config);
  const missingMarker = await service.diagnoseDocument({ rootId: "openclaw-root", path: requestPath, language: "rust", content: fs.readFileSync(file, "utf8") });
  assert.equal(missingMarker.provider, "rust");
  assert.deepEqual(missingMarker.diagnostics, []);
});

test("Rust analyzer probe degrades for missing binaries and unsupported output", async () => {
  const root = makeTempRoot();
  const missing = await probeRustAnalyzerVersion(createRustAnalyzerProfile({ command: path.join(root, "missing-rust-analyzer") }), root);
  assert.equal(missing.ok, false);
  assert.equal(missing.status, "missingBinary");

  const unsupported = await probeRustAnalyzerVersion(createRustAnalyzerProfile({ command: process.execPath }), root);
  assert.equal(unsupported.ok, false);
  assert.equal(unsupported.status, "unsupportedVersion");
});

test("Rust analyzer proof can run through the guarded stdio gateway with an allowlisted profile", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  trustRustAnalyzer(config);
  fs.writeFileSync(path.join(root, "Cargo.toml"), "[package]\nname = \"tracevane\"\nversion = \"0.0.0\"\nedition = \"2021\"\n", "utf8");
  const file = createRustFile(root, "src/main.rs");

  const result = await diagnoseWithRustAnalyzer({
    config,
    rootRealPath: root,
    absolutePath: file,
    content: fs.readFileSync(file, "utf8"),
    version: 1,
    profile: createRustAnalyzerProfile({ command: process.execPath, args: [mockServerPath] }),
    probe: async () => ({ ok: true, status: "configured", versionSummary: "rust-analyzer mock v0.0.0", reason: null }),
  });

  assert.equal(result.skipped, false);
  assert.equal(result.status, "configured");
  assert.equal(result.marker?.kind, "Cargo.toml");
  assert.equal(result.diagnostics.length, 1);
  assert.equal(result.diagnostics[0].message, "mock diagnostic");
});


test("Rust provider registry advertises guarded hover and definition after the rich interaction proof", () => {
  const provider = providerForLanguage("rust");
  assert.equal(provider?.id, "rust");
  assert.equal(provider?.capabilities.diagnostics, true);
  assert.equal(provider?.capabilities.hover, true);
  assert.equal(provider?.capabilities.definition, true);
});

test("Rust analyzer hover and definition proof can run through the guarded stdio gateway", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  trustRustAnalyzer(config);
  fs.writeFileSync(path.join(root, "Cargo.toml"), "[package]\nname = \"tracevane\"\nversion = \"0.0.0\"\nedition = \"2021\"\n", "utf8");
  const file = createRustFile(root, "src/main.rs");
  const commonInput = {
    config,
    rootRealPath: root,
    absolutePath: file,
    content: fs.readFileSync(file, "utf8"),
    version: 1,
    line: 2,
    column: 6,
    profile: createRustAnalyzerProfile({ command: process.execPath, args: [mockServerPath] }),
    probe: async () => ({ ok: true, status: "configured", versionSummary: "rust-analyzer mock v0.0.0", reason: null }),
  };

  const hover = await hoverWithRustAnalyzer(commonInput);
  assert.equal(hover.skipped, false);
  assert.equal(hover.status, "configured");
  assert.equal(hover.marker?.kind, "Cargo.toml");
  assert.match(hover.contents.join("\n"), /mock hover/);
  assert.deepEqual(hover.range, { startLine: 2, startColumn: 6, endLine: 2, endColumn: 10 });

  const definition = await defineWithRustAnalyzer(commonInput);
  assert.equal(definition.skipped, false);
  assert.equal(definition.status, "configured");
  assert.equal(definition.locations.length, 1);
  assert.equal(definition.locations[0].absolutePath, file);
  assert.deepEqual(definition.locations[0].range, { startLine: 1, startColumn: 1, endLine: 1, endColumn: 13 });
});
