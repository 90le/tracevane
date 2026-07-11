import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createSessionSupervisor,
  disposeProcessSessionSupervisor,
  getProcessSessionSupervisor,
} from "../../dist/apps/api/modules/supervisor/session-supervisor.js";

function fixtureDefinition(root, options = {}) {
  const entryPath = path.join(root, "会话 fixture.mjs");
  fs.writeFileSync(
    entryPath,
    [
      "import fs from 'node:fs';",
      "import { spawn } from 'node:child_process';",
      "const [mode = 'idle', statePath = '', ...payload] = process.argv.slice(2);",
      "if (mode === 'record') {",
      "  fs.writeFileSync(statePath + '.tmp', JSON.stringify(payload), 'utf8');",
      "  fs.renameSync(statePath + '.tmp', statePath);",
      "} else if (mode === 'crash-once') {",
      "  const count = fs.existsSync(statePath) ? Number(fs.readFileSync(statePath, 'utf8')) : 0;",
      "  fs.writeFileSync(statePath, String(count + 1), 'utf8');",
      "  if (count === 0) setTimeout(() => process.exit(23), 20);",
      "} else if (mode === 'always-crash') {",
      "  const count = fs.existsSync(statePath) ? Number(fs.readFileSync(statePath, 'utf8')) : 0;",
      "  fs.writeFileSync(statePath, String(count + 1), 'utf8');",
      "  setTimeout(() => process.exit(24), 20);",
      "} else if (mode === 'tree') {",
      "  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });",
      "  fs.writeFileSync(statePath, String(child.pid), 'utf8');",
      "  process.on('SIGTERM', () => {});",
      "}",
      "process.on('SIGINT', () => process.exit(0));",
      "setInterval(() => {}, 1000);",
      "",
    ].join("\n"),
    "utf8",
  );
  return {
    id: options.id ?? "model-gateway",
    displayName: "Fixture",
    serviceName: "tracevane-fixture.service",
    windowsTaskName: "TracevaneFixture",
    launchdLabel: "dev.tracevane.fixture",
    entryPath,
    workingDirectory: root,
    configPath: path.join(root, "配置.json"),
    runtimePath: path.join(root, "runtime.json"),
    logPath: path.join(root, "fixture.log"),
    healthUrl: "http://127.0.0.1:1/status",
    args: options.args ?? [],
  };
}

function processIsAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error?.code === "ESRCH") return false;
    throw error;
  }
}

async function waitForProcessExit(pid, timeoutMs = 2_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!processIsAlive(pid)) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.fail(`session fixture pid ${pid} remained alive`);
}

async function waitFor(predicate, timeoutMs = 2_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await predicate();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.fail("condition did not become true before timeout");
}

async function removeRoot(root) {
  let lastError;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      fs.rmSync(root, { recursive: true, force: true });
      return;
    } catch (error) {
      lastError = error;
      if (!["EBUSY", "EPERM", "ENOTEMPTY"].includes(error?.code)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw lastError;
}

test("session supervisor owns one tokenized child and stops it", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tracevane-session-"));
  const argsPath = path.join(root, "参数 evidence.json");
  const supervisor = createSessionSupervisor({
    restartDelayMs: 25,
    stopGraceMs: 250,
  });
  try {
    const definition = fixtureDefinition(root, {
      args: ["record", argsPath, "路径 含空格", "参数"],
    });
    const [first, second, third] = await Promise.all([
      supervisor.start(definition),
      supervisor.start(definition),
      supervisor.start(definition),
    ]);
    assert.equal(first.state, "running");
    assert.equal(second.state, "running");
    assert.equal(second.pid, first.pid);
    assert.equal(third.pid, first.pid);
    const running = await supervisor.status("model-gateway");
    assert.deepEqual(
      {
        mode: running.mode,
        supervisor: running.supervisor,
        installed: running.installed,
        enabled: running.enabled,
        active: running.active,
        state: running.state,
        configCurrent: running.configCurrent,
        errorCode: running.errorCode,
      },
      {
        mode: "session",
        supervisor: "session",
        installed: false,
        enabled: null,
        active: true,
        state: "running",
        configCurrent: true,
        errorCode: null,
      },
    );
    await waitFor(() => fs.existsSync(argsPath));
    assert.deepEqual(
      JSON.parse(fs.readFileSync(argsPath, "utf8")),
      ["路径 含空格", "参数"],
    );

    const pid = first.pid;
    assert.equal(typeof pid, "number");
    const stopped = await supervisor.stop("model-gateway");
    assert.equal(stopped.state, "stopped");
    await waitForProcessExit(pid);
  } finally {
    await supervisor.dispose();
    await removeRoot(root);
  }
});

test("unknown service status is complete and session-ready", async () => {
  const supervisor = createSessionSupervisor();
  try {
    const status = await supervisor.status("channel-connectors");
    assert.match(status.checkedAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.deepEqual({ ...status, checkedAt: "<iso>" }, {
      mode: "session",
      supervisor: "session",
      installed: false,
      enabled: null,
      active: false,
      state: "stopped",
      configCurrent: true,
      checkedAt: "<iso>",
      errorCode: null,
      errorMessage: null,
      pid: null,
      restartCount: 0,
    });
  } finally {
    await supervisor.dispose();
  }
});

test("owned descendant tree is gone after bounded stop", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tracevane-session-tree-"));
  const childPidPath = path.join(root, "child.pid");
  const supervisor = createSessionSupervisor({
    stopGraceMs: 100,
    forceKillWaitMs: 1_000,
  });
  let parentPid = null;
  let childPid = null;
  try {
    const started = await supervisor.start(
      fixtureDefinition(root, { args: ["tree", childPidPath] }),
    );
    parentPid = started.pid;
    await waitFor(() => fs.existsSync(childPidPath));
    childPid = Number(fs.readFileSync(childPidPath, "utf8"));
    assert.equal(processIsAlive(parentPid), true);
    assert.equal(processIsAlive(childPid), true);

    const stopped = await supervisor.stop("model-gateway");
    assert.equal(stopped.state, "stopped");
    await waitForProcessExit(parentPid);
    await waitForProcessExit(childPid);
  } finally {
    await supervisor.dispose();
    if (parentPid && processIsAlive(parentPid)) process.kill(parentPid, "SIGKILL");
    if (childPid && processIsAlive(childPid)) process.kill(childPid, "SIGKILL");
    await removeRoot(root);
  }
});

test(
  "POSIX owned process-group cleanup removes descendants",
  { skip: process.platform === "win32" ? "POSIX process groups only" : false },
  async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "tracevane-session-posix-tree-"));
    const childPidPath = path.join(root, "child.pid");
    const supervisor = createSessionSupervisor({ stopGraceMs: 100 });
    let parentPid = null;
    let childPid = null;
    try {
      parentPid = (await supervisor.start(
        fixtureDefinition(root, { args: ["tree", childPidPath] }),
      )).pid;
      await waitFor(() => fs.existsSync(childPidPath));
      childPid = Number(fs.readFileSync(childPidPath, "utf8"));
      await supervisor.stop("model-gateway");
      await waitForProcessExit(parentPid);
      await waitForProcessExit(childPid);
    } finally {
      await supervisor.dispose();
      if (parentPid && processIsAlive(parentPid)) process.kill(parentPid, "SIGKILL");
      if (childPid && processIsAlive(childPid)) process.kill(childPid, "SIGKILL");
      await removeRoot(root);
    }
  },
);

test(
  "Windows tree cleanup is scoped to the recorded PID",
  { skip: process.platform !== "win32" ? "Windows taskkill only" : false },
  () => {
    const source = fs.readFileSync(
      path.resolve("apps/api/modules/supervisor/session-supervisor.ts"),
      "utf8",
    );
    assert.match(source, /command: "taskkill\.exe"/);
    assert.match(source, /"\/PID",[\s\S]*String\(pid\),[\s\S]*"\/T"/);
    assert.doesNotMatch(source, /"\/IM"/);
  },
);

test("unexpected exit restarts once and exposes the new owned pid", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tracevane-session-restart-"));
  const counterPath = path.join(root, "count.txt");
  const supervisor = createSessionSupervisor({
    restartDelayMs: 25,
    maxRestarts: 2,
  });
  try {
    const definition = fixtureDefinition(root, {
      args: ["crash-once", counterPath],
    });
    const first = await supervisor.start(definition);
    const restarted = await waitFor(async () => {
      const status = await supervisor.status("model-gateway");
      return status.state === "running" &&
        status.restartCount === 1 &&
        status.pid !== first.pid
        ? status
        : null;
    });
    assert.equal(restarted.active, true);
    await waitFor(
      () =>
        fs.existsSync(counterPath) &&
        fs.readFileSync(counterPath, "utf8") === "2",
    );
    assert.equal(fs.readFileSync(counterPath, "utf8"), "2");
  } finally {
    await supervisor.dispose();
    await removeRoot(root);
  }
});

test("explicit stop during restart backoff prevents another spawn", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tracevane-session-backoff-"));
  const counterPath = path.join(root, "count.txt");
  const supervisor = createSessionSupervisor({
    restartDelayMs: 300,
    maxRestarts: 3,
  });
  try {
    await supervisor.start(
      fixtureDefinition(root, { args: ["always-crash", counterPath] }),
    );
    await waitFor(async () => {
      const status = await supervisor.status("model-gateway");
      return status.state === "starting" && status.restartCount === 1;
    });
    const countBeforeStop = fs.readFileSync(counterPath, "utf8");
    const stopped = await supervisor.stop("model-gateway");
    assert.equal(stopped.state, "stopped");
    await new Promise((resolve) => setTimeout(resolve, 400));
    assert.equal(fs.readFileSync(counterPath, "utf8"), countBeforeStop);
    assert.equal((await supervisor.status("model-gateway")).state, "stopped");
  } finally {
    await supervisor.dispose();
    await removeRoot(root);
  }
});

test("start waits for an in-flight stop instead of returning the dying child", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tracevane-session-race-"));
  const supervisor = createSessionSupervisor({ stopGraceMs: 100 });
  try {
    const definition = fixtureDefinition(root);
    const first = await supervisor.start(definition);
    const stopping = supervisor.stop("model-gateway");
    const starting = supervisor.start(definition);
    await stopping;
    const restarted = await starting;
    assert.equal(restarted.state, "running");
    assert.notEqual(restarted.pid, first.pid);
    assert.equal(
      (await supervisor.status("model-gateway")).pid,
      restarted.pid,
    );
    await waitForProcessExit(first.pid);
  } finally {
    await supervisor.dispose();
    await removeRoot(root);
  }
});

test("restart budget exhaustion reaches failed without an infinite timer", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tracevane-session-failed-"));
  const counterPath = path.join(root, "count.txt");
  const supervisor = createSessionSupervisor({
    restartDelayMs: 15,
    maxRestartDelayMs: 20,
    maxRestarts: 2,
  });
  try {
    await supervisor.start(
      fixtureDefinition(root, { args: ["always-crash", counterPath] }),
    );
    const failed = await waitFor(async () => {
      const status = await supervisor.status("model-gateway");
      return status.state === "failed" ? status : null;
    });
    assert.equal(failed.active, false);
    assert.equal(failed.restartCount, 2);
    assert.equal(failed.errorCode, "runtime-not-ready");
    assert.equal(fs.readFileSync(counterPath, "utf8"), "3");
  } finally {
    await supervisor.dispose();
    await removeRoot(root);
  }
});

test("dispose stops every service id and is idempotent", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tracevane-session-dispose-"));
  const supervisor = createSessionSupervisor({ stopGraceMs: 100 });
  const pids = [];
  try {
    pids.push(
      (await supervisor.start(
        fixtureDefinition(root, { id: "model-gateway" }),
      )).pid,
    );
    pids.push(
      (await supervisor.start(
        fixtureDefinition(root, { id: "openclaw-recovery" }),
      )).pid,
    );
    assert.equal(pids.every((pid) => typeof pid === "number"), true);
    await supervisor.dispose();
    await supervisor.dispose();
    for (const pid of pids) await waitForProcessExit(pid);
  } finally {
    await supervisor.dispose();
    for (const pid of pids) {
      if (pid && processIsAlive(pid)) process.kill(pid, "SIGKILL");
    }
    await removeRoot(root);
  }
});

test("concurrent dispose callers await the same cleanup", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tracevane-session-dispose-race-"));
  const supervisor = createSessionSupervisor({ stopGraceMs: 100 });
  let pid = null;
  try {
    pid = (await supervisor.start(fixtureDefinition(root))).pid;
    const first = supervisor.dispose();
    const second = supervisor.dispose();
    assert.equal(second, first);
    await second;
    await waitForProcessExit(pid);
  } finally {
    if (pid && processIsAlive(pid)) process.kill(pid, "SIGKILL");
    await removeRoot(root);
  }
});

test("dispose racing spawn readiness prevents start from returning a dying pid", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tracevane-session-start-dispose-"));
  const supervisor = createSessionSupervisor({ stopGraceMs: 100 });
  try {
    const starting = supervisor.start(fixtureDefinition(root));
    const disposing = supervisor.dispose();
    await assert.rejects(starting, /disposed/);
    await disposing;
  } finally {
    await supervisor.dispose();
    await removeRoot(root);
  }
});

test("dispose rejects when owned cleanup cannot terminate the child", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tracevane-session-dispose-failure-"));
  const supervisor = createSessionSupervisor({
    stopGraceMs: 20,
    forceKillWaitMs: 50,
    terminateOwnedTree: async () => {},
  });
  let pid = null;
  try {
    pid = (await supervisor.start(fixtureDefinition(root))).pid;
    await assert.rejects(
      supervisor.dispose(),
      /did not exit/,
    );
    const failed = await supervisor.status("model-gateway");
    assert.equal(processIsAlive(pid), true);
    assert.equal(failed.state, "failed");
    assert.equal(failed.active, true);
    assert.equal(failed.pid, pid);
  } finally {
    if (pid && processIsAlive(pid)) {
      process.kill(pid, "SIGKILL");
      await waitForProcessExit(pid);
    }
    await removeRoot(root);
  }
});

test("a graceful owned-tree stop does not invoke the force branch", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tracevane-session-grace-"));
  const calls = [];
  const supervisor = createSessionSupervisor({
    stopGraceMs: 250,
    terminateOwnedTree: async (pid, force) => {
      calls.push(force);
      process.kill(pid, force ? "SIGKILL" : "SIGTERM");
    },
  });
  try {
    await supervisor.start(fixtureDefinition(root));
    assert.equal((await supervisor.stop("model-gateway")).state, "stopped");
    assert.deepEqual(calls, [false]);
  } finally {
    await supervisor.dispose();
    await removeRoot(root);
  }
});

test("spawn failure never reports running without an owned pid", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tracevane-session-spawn-error-"));
  const supervisor = createSessionSupervisor({ maxRestarts: 0 });
  try {
    const definition = fixtureDefinition(root);
    definition.workingDirectory = path.join(root, "missing-directory");
    const status = await supervisor.start(definition);
    assert.notEqual(status.state, "running");
    assert.notEqual(status.active, true);
    assert.equal(status.pid, null);
  } finally {
    await supervisor.dispose();
    await removeRoot(root);
  }
});

test("process singleton cannot be replaced while disposal is in flight", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tracevane-session-singleton-"));
  let pid = null;
  try {
    const singleton = getProcessSessionSupervisor();
    pid = (await singleton.start(fixtureDefinition(root))).pid;
    const disposing = disposeProcessSessionSupervisor();
    assert.throws(
      () => getProcessSessionSupervisor(),
      /being disposed/,
    );
    await Promise.all([disposing, disposeProcessSessionSupervisor()]);
    await waitForProcessExit(pid);
  } finally {
    await disposeProcessSessionSupervisor();
    if (pid && processIsAlive(pid)) process.kill(pid, "SIGKILL");
    await removeRoot(root);
  }
});

test("standalone API disposes the process session supervisor before exit", () => {
  const source = fs.readFileSync(
    path.resolve("scripts/start-standalone-api.mjs"),
    "utf8",
  );
  assert.match(source, /disposeProcessSessionSupervisor/);
  const disposeIndex = source.indexOf("await disposeProcessSessionSupervisor()");
  const exitIndex = source.indexOf("process.exit(0)", disposeIndex);
  assert.ok(disposeIndex >= 0);
  assert.ok(exitIndex > disposeIndex);
  for (const reason of [
    "SIGINT",
    "SIGTERM",
    "uncaughtException",
    "unhandledRejection",
  ]) {
    assert.match(source, new RegExp(`shutdown\\('${reason}'\\)`));
  }
});
