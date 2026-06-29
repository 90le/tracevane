import { test } from "node:test";
import assert from "node:assert";
import path from "node:path";

import {
  WorkspaceIdeProviderError,
  WorkspaceIdeProviderSessionRegistry,
  WorkspaceIdeProviderLifecycleController,
  assertLoopbackProviderUrl,
  buildWorkspaceIdeProviderCommand,
  createWorkspaceIdeProviderLaunchPlan,
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

test("workspace IDE provider launch plan keeps process loopback and token out of command", () => {
  const registry = new WorkspaceIdeProviderSessionRegistry(39200);
  const session = registry.createSession({ kind: "code-server", workspaceRoot: projectRoot });
  const config = parseWorkspaceIdeProviderConfig({ kind: "code-server", token: "secret-token" });
  const plan = createWorkspaceIdeProviderLaunchPlan(config, session);
  assert.equal(plan.cwd, projectRoot);
  assert.deepEqual(plan.command.slice(0, 3), ["code-server", "--bind-addr", "127.0.0.1:39200"]);
  assert.equal(plan.command.includes("secret-token"), false);
  assert.equal(plan.env.PASSWORD, "secret-token");
  assert.equal(plan.env.TRACEVANE_IDE_PROVIDER_LOOPBACK_ONLY, "1");
});

test("workspace IDE provider lifecycle controller starts and stops via runner", async () => {
  const registry = new WorkspaceIdeProviderSessionRegistry(39300);
  const startedPlans = [];
  const stopped = [];
  const controller = new WorkspaceIdeProviderLifecycleController(registry, {
    start(plan) {
      startedPlans.push(plan);
      return {
        pid: 1234,
        stop() {
          stopped.push(plan.session.id);
        },
      };
    },
  });
  const session = await controller.startSession(
    parseWorkspaceIdeProviderConfig({ kind: "openvscode-server" }),
    { kind: "openvscode-server", workspaceRoot: projectRoot },
  );
  assert.equal(session.status, "ready");
  assert.equal(startedPlans.length, 1);
  assert.equal(controller.hasHandle(session.id), true);

  const stoppedSession = await controller.stopSession(session.id);
  assert.equal(stoppedSession.status, "stopped");
  assert.deepEqual(stopped, [session.id]);
  assert.equal(controller.hasHandle(session.id), false);
});

test("workspace IDE provider lifecycle records launch failures", async () => {
  const registry = new WorkspaceIdeProviderSessionRegistry(39400);
  const controller = new WorkspaceIdeProviderLifecycleController(registry, {
    start() {
      throw new Error("provider missing");
    },
  });
  const session = await controller.startSession(
    parseWorkspaceIdeProviderConfig({ kind: "openvscode-server" }),
    { kind: "openvscode-server", workspaceRoot: projectRoot },
  );
  assert.equal(session.status, "failed");
  assert.equal(session.failureReason, "provider missing");
});

test("workspace IDE provider spawn runner starts command with cwd and safe env", async () => {
  const module = await import("../../dist/apps/api/modules/workspace-ide/provider-service.js");
  const calls = [];
  const fakeChild = {
    pid: 4321,
    killed: false,
    once() {
      return fakeChild;
    },
    kill(signal) {
      fakeChild.killed = true;
      calls.push({ kill: signal });
      return true;
    },
  };
  const runner = module.createWorkspaceIdeProviderSpawnRunner({
    spawnImpl(command, args, options) {
      calls.push({ command, args, options });
      return fakeChild;
    },
    killTimeoutMs: 1,
  });
  const handle = await runner.start({
    session: {
      id: "ide_test",
      kind: "code-server",
      workspaceRoot: projectRoot,
      baseUrl: "http://127.0.0.1:39900",
      status: "starting",
      createdAt: new Date(0).toISOString(),
    },
    command: ["code-server", "--bind-addr", "127.0.0.1:39900", projectRoot],
    cwd: projectRoot,
    env: { PASSWORD: "secret", TRACEVANE_IDE_PROVIDER_LOOPBACK_ONLY: "1" },
  });
  assert.equal(handle.pid, 4321);
  assert.equal(calls[0].command, "code-server");
  assert.deepEqual(calls[0].args, ["--bind-addr", "127.0.0.1:39900", projectRoot]);
  assert.equal(calls[0].options.cwd, projectRoot);
  assert.equal(calls[0].options.env.PASSWORD, "secret");
  assert.equal(calls[0].options.stdio, "pipe");
  await handle.stop();
  assert.deepEqual(calls.at(-1), { kill: "SIGTERM" });
});
