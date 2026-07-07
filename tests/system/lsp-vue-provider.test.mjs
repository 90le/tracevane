import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createLspService } from "../../dist/apps/api/modules/lsp/service.js";
import { ExternalLanguageServerGateway } from "../../dist/apps/api/modules/lsp/external/index.js";

function makeTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "tracevane-lsp-vue-"));
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

test("external LSP gateway starts real Vue language server and records lifecycle", async () => {
  const root = makeTempRoot();
  const gateway = new ExternalLanguageServerGateway({ rootPath: root });
  const profile = gateway.listProfiles().find((candidate) => candidate.id === "vue");
  assert.ok(profile, "vue profile should be server-side allowlisted");
  assert.deepEqual(profile?.args?.slice(-1), ["--stdio"]);
  assert.equal(profile?.command, process.execPath);
  assert.deepEqual(profile?.languages, ["vue"]);

  const started = await gateway.start("vue");
  assert.equal(started.status, "available");
  assert.equal(started.providerId, "vue");

  const stopped = await gateway.stop("vue");
  assert.equal(stopped.status, "stopped");
  assert.equal(stopped.reason, "stopped");
});

test("LSP service routes Vue diagnostics requests through the Vue external provider", async () => {
  const root = makeTempRoot();
  const file = path.join(root, "Broken.vue");
  const content = `<template>\n  <div>{{ missing + }}</div>\n</template>\n<script setup lang="ts">\nconst count: number = 'oops'\n</script>\n`;
  fs.writeFileSync(file, content, "utf8");

  const service = createLspService(createTracevaneConfig(root));
  const status = service.getStatus();
  const provider = status.providers.find((candidate) => candidate.id === "vue");
  assert.ok(provider, "vue provider should be present in the provider matrix");
  assert.equal(provider.mode, "external");
  assert.equal(provider.capabilities.diagnostics, true);

  const profile = status.externalProviders.profiles.find((candidate) => candidate.id === "vue");
  assert.ok(profile?.enabled, "vue profile should be enabled");
  assert.equal(profile.install?.status, "installed");
  assert.equal(profile.install?.version, "3.3.6");
  assert.equal(profile.install?.pinnedVersion, "3.3.6");
  assert.equal(profile.install?.packageName, "@vue/language-server");

  const response = await service.diagnoseDocument({
    id: "vue-proof",
    rootId: "openclaw-root",
    path: path.relative(path.parse(file).root, file).replaceAll(path.sep, "/"),
    language: "vue",
    version: 1,
    content,
  });

  assert.equal(response.provider, "vue");
  assert.equal(response.language, "vue");
  assert.ok(Array.isArray(response.diagnostics), "Vue diagnostics response should use the standard diagnostics shape");
});
