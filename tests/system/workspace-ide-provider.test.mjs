import { test } from "node:test";
import assert from "node:assert";
import path from "node:path";

import {
  WorkspaceIdeProviderError,
  WorkspaceIdeProviderSessionRegistry,
  assertLoopbackProviderUrl,
  buildWorkspaceIdeProviderCommand,
  parseWorkspaceIdeProviderConfig,
} from "../../dist/apps/api/modules/workspace-ide/provider-service.js";

const projectRoot = path.resolve(".");

test("workspace IDE provider config defaults to native workbench", () => {
  const config = parseWorkspaceIdeProviderConfig();
  assert.equal(config.kind, "native-workbench");
  assert.equal(config.basePort, 37480);
  assert.equal(config.enabled, false);
  assert.equal(config.command, null);
});

test("workspace IDE provider config accepts OpenVSCode and code-server", () => {
  assert.equal(parseWorkspaceIdeProviderConfig({ kind: "openvscode-server" }).kind, "openvscode-server");
  assert.equal(parseWorkspaceIdeProviderConfig({ kind: "code-server", basePort: "39000" }).basePort, 39000);
});

test("workspace IDE provider rejects unsupported provider and unsafe public URL", () => {
  assert.throws(
    () => parseWorkspaceIdeProviderConfig({ kind: "random-ide" }),
    (error) => error instanceof WorkspaceIdeProviderError && error.code === "workspace_ide_provider_kind_invalid",
  );
  assert.throws(
    () => assertLoopbackProviderUrl("http://0.0.0.0:3000"),
    (error) => error instanceof WorkspaceIdeProviderError && error.code === "workspace_ide_provider_url_not_loopback",
  );
});

test("workspace IDE provider command binds providers to loopback", () => {
  const openvscode = buildWorkspaceIdeProviderCommand(
    parseWorkspaceIdeProviderConfig({ kind: "openvscode-server" }),
    projectRoot,
    39001,
  );
  assert.deepEqual(openvscode.slice(0, 5), ["openvscode-server", "--host", "127.0.0.1", "--port", "39001"]);
  assert.equal(openvscode.at(-1), projectRoot);

  const codeServer = buildWorkspaceIdeProviderCommand(
    parseWorkspaceIdeProviderConfig({ kind: "code-server" }),
    projectRoot,
    39002,
  );
  assert.deepEqual(codeServer.slice(0, 3), ["code-server", "--bind-addr", "127.0.0.1:39002"]);
  assert.equal(codeServer.at(-1), projectRoot);
});

test("workspace IDE provider session registry tracks lifecycle", () => {
  const registry = new WorkspaceIdeProviderSessionRegistry(39100);
  const created = registry.createSession({ kind: "openvscode-server", workspaceRoot: projectRoot });
  assert.match(created.id, /^ide_/);
  assert.equal(created.baseUrl, "http://127.0.0.1:39100");
  assert.equal(created.status, "starting");
  assert.equal(created.workspaceRoot, projectRoot);

  const ready = registry.markReady(created.id);
  assert.equal(ready.status, "ready");
  assert.equal(registry.listSessions().length, 1);

  const stopped = registry.stopSession(created.id);
  assert.equal(stopped.status, "stopped");
});
