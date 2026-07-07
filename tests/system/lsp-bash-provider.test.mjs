import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createLspService } from "../../dist/apps/api/modules/lsp/service.js";
import { ExternalLanguageServerGateway } from "../../dist/apps/api/modules/lsp/external/index.js";

function makeTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "tracevane-lsp-bash-"));
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

test("external LSP gateway starts real Bash language server and records lifecycle", async () => {
  const root = makeTempRoot();
  const gateway = new ExternalLanguageServerGateway({ rootPath: root });
  const bashProfile = gateway.listProfiles().find((profile) => profile.id === "bash");
  assert.ok(bashProfile, "bash profile should be server-side allowlisted");
  assert.deepEqual(bashProfile?.args?.slice(-1), ["start"]);

  const started = await gateway.start("bash");
  assert.equal(started.status, "available");
  assert.equal(started.providerId, "bash");
  assert.equal(gateway.getStatus("bash").status, "available");

  const stopped = await gateway.stop("bash");
  assert.equal(stopped.status, "stopped");
  assert.equal(stopped.reason, "stopped");
});

test("LSP service routes shell diagnostics through the Bash external provider", async () => {
  const root = makeTempRoot();
  const file = path.join(root, "script.sh");
  const content = "#!/usr/bin/env bash\necho tracevane\n";
  fs.writeFileSync(file, content, "utf8");

  const service = createLspService(createTracevaneConfig(root));
  const status = service.getStatus();
  assert.ok(status.externalProviders.profiles.some((profile) => profile.id === "bash" && profile.enabled));
  const bashStatus = status.externalProviders.statuses.find((entry) => entry.providerId === "bash");
  assert.equal(bashStatus?.status, "stopped");
  assert.equal(bashStatus?.reason, "not_started");

  const response = await service.diagnoseDocument({
    id: "bash-proof",
    rootId: "openclaw-root",
    path: path.relative(path.parse(file).root, file).replaceAll(path.sep, "/"),
    language: "shell",
    version: 1,
    content,
  });

  assert.equal(response.provider, "bash");
  assert.equal(response.language, "shell");
  assert.ok(Array.isArray(response.diagnostics), "Bash diagnostics response should be normalized even when shellcheck is absent");
});
