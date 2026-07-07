import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createLspService } from "../../dist/apps/api/modules/lsp/service.js";
import { ExternalLanguageServerGateway } from "../../dist/apps/api/modules/lsp/external/index.js";

function makeTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "tracevane-lsp-eslint-"));
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

function rootPathFor(file) {
  return path.relative(path.parse(file).root, file).replaceAll(path.sep, "/");
}

function installFakeEslint(root) {
  const eslintDir = path.join(root, "node_modules", "eslint");
  fs.mkdirSync(eslintDir, { recursive: true });
  fs.writeFileSync(path.join(eslintDir, "package.json"), JSON.stringify({ name: "eslint", version: "9.99.0", main: "index.js" }), "utf8");
  fs.writeFileSync(path.join(eslintDir, "index.js"), `
class ESLint {
  static version = '9.99.0';
  static configType = 'eslintrc';
  async isPathIgnored() { return false; }
  async calculateConfigForFile() { return { rules: { 'no-alert': 'error' }, parserOptions: {} }; }
  async lintText(content) {
    const index = content.indexOf('alert(');
    return [{ messages: index === -1 ? [] : [{ ruleId: 'no-alert', severity: 2, message: 'Unexpected alert.', line: 1, column: index + 1, endLine: 1, endColumn: index + 6 }] }];
  }
  getRulesMetaForResults() { return { 'no-alert': { type: 'problem', docs: { url: 'https://eslint.org/docs/latest/rules/no-alert' } } }; }
}
module.exports = { ESLint };
`, "utf8");
}

test("external LSP gateway exposes the guarded ESLint provider profile", async () => {
  const root = makeTempRoot();
  const gateway = new ExternalLanguageServerGateway({ rootPath: root });
  const profile = gateway.listProfiles().find((candidate) => candidate.id === "eslint");
  assert.ok(profile, "eslint profile should be server-side allowlisted");
  assert.equal(profile?.command, process.execPath);
  assert.deepEqual(profile?.args?.slice(-1), ["--stdio"]);
  assert.ok(profile?.args?.[0]?.includes("vscode-eslint-language-server"), "profile should target the ESLint bin only");
  assert.equal(profile?.settings?.validate, "on");
  assert.equal(profile?.settings?.format, false);
});

test("LSP service does not route JS/TS through ESLint without a root-level activation marker", async () => {
  const root = makeTempRoot();
  const file = path.join(root, "sample.js");
  const content = "const value = ;\n";
  fs.writeFileSync(file, content, "utf8");

  const service = createLspService(createTracevaneConfig(root));
  const response = await service.diagnoseDocument({
    id: "eslint-gate-off",
    rootId: "openclaw-root",
    path: rootPathFor(file),
    language: "javascript",
    version: 1,
    content,
  });

  assert.equal(response.provider, "typescript");
  assert.equal(response.language, "javascript");
});

test("LSP service routes JS diagnostics through ESLint when root config is present", async () => {
  const root = makeTempRoot();
  installFakeEslint(root);
  fs.writeFileSync(path.join(root, ".eslintrc.json"), JSON.stringify({ rules: { "no-alert": "error" } }), "utf8");
  const file = path.join(root, "sample.js");
  const content = "alert('tracevane');\n";
  fs.writeFileSync(file, content, "utf8");

  const service = createLspService(createTracevaneConfig(root));
  const status = service.getStatus();
  const profile = status.externalProviders.profiles.find((candidate) => candidate.id === "eslint");
  const metadata = status.externalProviders.metadata.find((candidate) => candidate.providerId === "eslint");
  assert.ok(profile?.enabled, "eslint profile should be enabled");
  assert.equal(profile.install?.status, "installed");
  assert.equal(profile.install?.version, "4.10.0");
  assert.equal(profile.install?.pinnedVersion, "4.10.0");
  assert.equal(profile.install?.packageName, "vscode-langservers-extracted");
  assert.equal(metadata?.installStatus, "installed");
  assert.match(metadata?.audit?.summary ?? "", /diagnostics-only/);

  const response = await service.diagnoseDocument({
    id: "eslint-gate-on",
    rootId: "openclaw-root",
    path: rootPathFor(file),
    language: "javascript",
    version: 1,
    content,
  });

  assert.equal(response.provider, "eslint");
  assert.equal(response.language, "javascript");
  assert.ok(response.diagnostics.some((diagnostic) => diagnostic.source === "eslint" && /Unexpected alert/.test(diagnostic.message)), "ESLint diagnostics should flow through the external provider");
});
