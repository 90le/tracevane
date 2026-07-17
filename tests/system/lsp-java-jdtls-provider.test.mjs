import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { createLspService } from "../../dist/apps/api/modules/lsp/service.js";
import {
  createJavaJdtlsProfile,
  diagnoseWithJavaJdtls,
  probeJavaJdtlsVersion,
} from "../../dist/apps/api/modules/lsp/toolchain/javaJdtlsProvider.js";
import { findJavaWorkspaceMarker } from "../../dist/apps/api/modules/lsp/toolchain/javaWorkspace.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const mockServerPath = path.join(repoRoot, "tests/fixtures/lsp-mock-server.mjs");

function makeTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "tracevane-lsp-java-"));
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

function trustJava(config, extra = {}) {
  writeConfig(config, {
    lsp: { toolchains: { java: { jdtls: { enabled: true, trusted: true, profileId: "workspace", ...extra } } } },
  });
}

function createJavaFile(root, relativePath, content = "class Main {\n  void run() {}\n}\n") {
  const file = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, "utf8");
  return file;
}

function filesystemRootRelative(file) {
  const filesystemRoot = path.parse(file).root || path.sep;
  return path.relative(filesystemRoot, file);
}

test("Java marker detection prefers Maven, then Gradle, then Eclipse markers", () => {
  const root = makeTempRoot();
  fs.writeFileSync(path.join(root, ".project"), "<projectDescription />\n", "utf8");
  fs.mkdirSync(path.join(root, "gradle-app", "src", "main", "java"), { recursive: true });
  fs.writeFileSync(path.join(root, "gradle-app", "settings.gradle.kts"), "pluginManagement {}\n", "utf8");
  fs.mkdirSync(path.join(root, "maven-app", "module", "src"), { recursive: true });
  fs.writeFileSync(path.join(root, "maven-app", "pom.xml"), "<project />\n", "utf8");

  const mavenFile = createJavaFile(root, "maven-app/module/src/Main.java");
  const gradleFile = createJavaFile(root, "gradle-app/src/main/java/Main.java");
  const eclipseFile = createJavaFile(root, "legacy/Main.java");

  const maven = findJavaWorkspaceMarker(root, mavenFile);
  assert.equal(maven?.kind, "pom.xml");
  assert.equal(maven?.directory, path.join(root, "maven-app"));

  const gradle = findJavaWorkspaceMarker(root, gradleFile);
  assert.equal(gradle?.kind, "settings.gradle.kts");
  assert.equal(gradle?.directory, path.join(root, "gradle-app"));

  const eclipse = findJavaWorkspaceMarker(root, eclipseFile);
  assert.equal(eclipse?.kind, ".project");
  assert.equal(eclipse?.directory, root);
});

test("Java marker detection rejects root escapes and ignored directories", () => {
  const root = makeTempRoot();
  fs.writeFileSync(path.join(root, "pom.xml"), "<project />\n", "utf8");
  const outside = createJavaFile(makeTempRoot(), "src/Main.java");
  assert.equal(findJavaWorkspaceMarker(root, outside), null);

  const ignored = createJavaFile(root, "node_modules/pkg/src/Main.java");
  assert.equal(findJavaWorkspaceMarker(root, ignored), null);
});

test("Java diagnostics route degrades until trusted config, marker, and JDT LS runtime exist", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const file = createJavaFile(root, "src/Main.java");
  const service = createLspService(config);
  const requestPath = filesystemRootRelative(file);

  const unconfigured = await service.diagnoseDocument({ rootId: "openclaw-root", path: requestPath, language: "java", content: fs.readFileSync(file, "utf8") });
  assert.equal(unconfigured.provider, "java");
  assert.deepEqual(unconfigured.diagnostics, []);

  trustJava(config);
  const missingMarker = await service.diagnoseDocument({ rootId: "openclaw-root", path: requestPath, language: "java", content: fs.readFileSync(file, "utf8") });
  assert.equal(missingMarker.provider, "java");
  assert.deepEqual(missingMarker.diagnostics, []);

  fs.writeFileSync(path.join(root, "pom.xml"), "<project />\n", "utf8");
  const missingRuntime = await service.diagnoseDocument({ rootId: "openclaw-root", path: requestPath, language: "java", content: fs.readFileSync(file, "utf8") });
  assert.equal(missingRuntime.provider, "java");
  assert.deepEqual(missingRuntime.diagnostics, []);
});

test("Java version probe requires Java 21+ and degrades for missing binaries", async () => {
  const root = makeTempRoot();
  const missing = await probeJavaJdtlsVersion(createJavaJdtlsProfile({ command: path.join(root, "missing-java") }), root);
  assert.equal(missing.ok, false);
  assert.equal(missing.status, "missingBinary");

  const fakeJava = path.join(root, process.platform === "win32" ? "fake-java.cmd" : "fake-java");
  fs.writeFileSync(
    fakeJava,
    process.platform === "win32"
      ? "@echo off\r\n>&2 echo openjdk version \"17.0.1\"\r\n"
      : "#!/usr/bin/env sh\necho 'openjdk version \"17.0.1\"' >&2\n",
    "utf8",
  );
  if (process.platform !== "win32") fs.chmodSync(fakeJava, 0o755);
  const unsupported = await probeJavaJdtlsVersion(createJavaJdtlsProfile({ command: fakeJava }), root);
  assert.equal(unsupported.ok, false);
  assert.equal(unsupported.status, "unsupportedVersion");
  assert.match(unsupported.reason ?? "", /Java 21/i);
});

test("Java JDT LS proof can run through the guarded stdio gateway with an allowlisted profile", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  trustJava(config);
  fs.writeFileSync(path.join(root, "pom.xml"), "<project />\n", "utf8");
  const file = createJavaFile(root, "src/Main.java");

  const result = await diagnoseWithJavaJdtls({
    config,
    rootRealPath: root,
    absolutePath: file,
    content: fs.readFileSync(file, "utf8"),
    version: 1,
    profile: createJavaJdtlsProfile({ command: process.execPath, args: [mockServerPath] }),
    probe: async () => ({ ok: true, status: "configured", versionSummary: "openjdk version \"21.0.1\"", reason: null }),
  });

  assert.equal(result.skipped, false);
  assert.equal(result.status, "configured");
  assert.equal(result.marker?.kind, "pom.xml");
  assert.equal(result.diagnostics.length, 1);
  assert.equal(result.diagnostics[0].message, "mock diagnostic");
});
