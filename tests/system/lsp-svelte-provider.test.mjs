import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createLspService } from "../../dist/apps/api/modules/lsp/service.js";
import { ExternalLanguageServerGateway } from "../../dist/apps/api/modules/lsp/external/index.js";

function makeTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "tracevane-lsp-svelte-"));
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

test("external LSP gateway starts real Svelte language server and records lifecycle", async () => {
  const root = makeTempRoot();
  const gateway = new ExternalLanguageServerGateway({ rootPath: root });
  const profile = gateway.listProfiles().find((candidate) => candidate.id === "svelte");
  assert.ok(profile, "svelte profile should be server-side allowlisted");
  assert.deepEqual(profile?.args?.slice(-1), ["--stdio"]);
  assert.equal(profile?.command, process.execPath);
  assert.deepEqual(profile?.languages, ["svelte"]);

  const started = await gateway.start("svelte");
  assert.equal(started.status, "available");
  assert.equal(started.providerId, "svelte");

  const stopped = await gateway.stop("svelte");
  assert.equal(stopped.status, "stopped");
  assert.equal(stopped.reason, "stopped");
});

test("LSP service routes Svelte diagnostics requests through the Svelte external provider", async () => {
  const root = makeTempRoot();
  const file = path.join(root, "Broken.svelte");
  const content = `<script lang="ts">\n  let count: number = 'oops';\n</script>\n<h1>{count}</h1>\n`;
  fs.writeFileSync(file, content, "utf8");

  const service = createLspService(createTracevaneConfig(root));
  const status = service.getStatus();
  const provider = status.providers.find((candidate) => candidate.id === "svelte");
  assert.ok(provider, "svelte provider should be present in the provider matrix");
  assert.equal(provider.mode, "external");
  assert.equal(provider.capabilities.diagnostics, true);

  const profile = status.externalProviders.profiles.find((candidate) => candidate.id === "svelte");
  assert.ok(profile?.enabled, "svelte profile should be enabled");
  assert.equal(profile.install?.status, "installed");
  assert.equal(profile.install?.version, "0.18.3");
  assert.equal(profile.install?.pinnedVersion, "0.18.3");
  assert.equal(profile.install?.packageName, "svelte-language-server");

  const response = await service.diagnoseDocument({
    id: "svelte-proof",
    rootId: "openclaw-root",
    path: path.relative(path.parse(file).root, file).replaceAll(path.sep, "/"),
    language: "svelte",
    version: 1,
    content,
  });

  assert.equal(response.provider, "svelte");
  assert.equal(response.language, "svelte");
  assert.ok(Array.isArray(response.diagnostics), "Svelte diagnostics response should use the standard diagnostics shape");
});
