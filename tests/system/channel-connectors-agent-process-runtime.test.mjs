import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import test from "node:test";
import crossSpawn from "cross-spawn";

import {
  defaultChannelConnectorAgentProcessRunner,
  terminateChannelConnectorAgentChild,
} from "../../dist/apps/api/modules/channel-connectors/agent-runner.js";

function makeTempRoot() {
  const parent = path.join(os.tmpdir(), "tracevane CLI 运行测试");
  fs.mkdirSync(parent, { recursive: true });
  return fs.mkdtempSync(path.join(parent, "runner-"));
}

function writeNodeCommand(binDir, name, source) {
  fs.mkdirSync(binDir, { recursive: true });
  const commandPath = path.join(binDir, name);
  if (process.platform === "win32") {
    const scriptPath = `${commandPath}.cjs`;
    fs.writeFileSync(scriptPath, source, "utf8");
    fs.writeFileSync(`${commandPath}.cmd`, `@echo off\r\n"${process.execPath}" "${scriptPath}" %*\r\n`, "utf8");
    return;
  }
  fs.writeFileSync(commandPath, `#!/usr/bin/env node\n${source}`, { encoding: "utf8", mode: 0o755 });
}

function processRequest(root, binDir, command, overrides = {}) {
  return {
    command,
    args: [],
    cwd: root,
    stdin: "",
    env: {
      PATH: `${binDir}${path.delimiter}${process.env.PATH || ""}`,
    },
    timeoutMs: 5_000,
    agent: "opencode",
    ...overrides,
  };
}

async function waitForFile(filePath, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    if (fs.existsSync(filePath)) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out waiting for ${filePath}`);
}

async function waitForProcessExit(pid, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    if (!processExists(pid)) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out waiting for fixture process ${pid} to exit`);
}

function processExists(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function stopFixtureProcess(pid) {
  if (!Number.isInteger(pid) || pid <= 0 || !processExists(pid)) return;
  if (process.platform === "win32") {
    spawnSync("taskkill.exe", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
    return;
  }
  try {
    process.kill(pid, "SIGKILL");
  } catch {
    // The fixture may have already exited with its command wrapper.
  }
}

function writeHangingAgentTree(binDir, root, commandName) {
  const leaderPidFile = path.join(root, `${commandName}-leader.pid`);
  const descendantPidFile = path.join(root, `${commandName}-descendant.pid`);
  const descendantPath = path.join(root, `${commandName}-descendant.cjs`);
  fs.writeFileSync(
    descendantPath,
    "process.on('SIGTERM', () => {});\nsetInterval(() => {}, 1000);\n",
    "utf8",
  );
  writeNodeCommand(binDir, commandName, `
const fs = require("node:fs");
const { spawn } = require("node:child_process");
fs.writeFileSync(process.env.TRACEVANE_TEST_LEADER_PID_FILE, String(process.pid));
const descendant = spawn(process.execPath, [process.env.TRACEVANE_TEST_DESCENDANT_PATH], { stdio: "ignore" });
fs.writeFileSync(process.env.TRACEVANE_TEST_DESCENDANT_PID_FILE, String(descendant.pid));
process.stdin.resume();
setInterval(() => {}, 1000);
`);
  return { leaderPidFile, descendantPidFile, descendantPath };
}

test("Channel Connector one-shot runner preserves spaced CJK PATH, args, stdin, stdout, and stderr", async (t) => {
  const root = makeTempRoot();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const binDir = path.join(root, "命令 shim bin");
  writeNodeCommand(binDir, "tracevane-fake-agent", `
let stdin = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { stdin += chunk; });
process.stdin.on("end", () => {
  process.stdout.write(JSON.stringify({ args: process.argv.slice(2), stdin }));
  process.stderr.write("stderr marker with spaces");
});
`);

  const result = await defaultChannelConnectorAgentProcessRunner(processRequest(
    root,
    binDir,
    "tracevane-fake-agent",
    {
      args: ["argument with spaces", "参数 有 空格"],
      stdin: "stdin value with spaces / 输入\n",
    },
  ));

  assert.equal(result.exitCode, 0);
  assert.equal(result.error, null);
  assert.deepEqual(JSON.parse(result.stdout), {
    args: ["argument with spaces", "参数 有 空格"],
    stdin: "stdin value with spaces / 输入\n",
  });
  assert.equal(result.stderr, "stderr marker with spaces");
});

test("Channel Connector one-shot runner reports a missing executable without a shell", async () => {
  const root = makeTempRoot();
  const binDir = path.join(root, "empty bin");
  fs.mkdirSync(binDir, { recursive: true });
  try {
    const result = await defaultChannelConnectorAgentProcessRunner(processRequest(
      root,
      binDir,
      "tracevane-command-that-does-not-exist",
      { env: { PATH: binDir } },
    ));

    assert.equal(result.exitCode, null);
    assert.equal(result.cancelled, false);
    assert.match(result.error || "", /ENOENT|not found/i);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("Channel Connector Windows tree termination bounds taskkill execution", { skip: process.platform !== "win32" }, async () => {
  const originalSync = crossSpawn.sync;
  let observed = null;
  const child = {
    exitCode: null,
    signalCode: null,
    pid: 43210,
    kill: () => true,
  };
  crossSpawn.sync = (command, args, options) => {
    observed = { command, args, options };
    child.exitCode = 0;
    return { error: undefined, status: 0 };
  };
  try {
    await terminateChannelConnectorAgentChild(child);
  } finally {
    crossSpawn.sync = originalSync;
  }

  assert.equal(observed.command, "taskkill.exe");
  assert.deepEqual(observed.args, ["/PID", "43210", "/T", "/F"]);
  assert.equal(observed.options.shell, false);
  assert.equal(observed.options.timeout, 5_000);
});

test("Channel Connector POSIX termination targets the owned process group", async () => {
  const originalPlatform = Object.getOwnPropertyDescriptor(process, "platform");
  const originalKill = process.kill;
  const signals = [];
  let groupAlive = true;
  let rootKillCalls = 0;
  try {
    Object.defineProperty(process, "platform", {
      configurable: true,
      enumerable: true,
      value: "linux",
    });
    process.kill = (pid, signal) => {
      signals.push([pid, signal]);
      assert.equal(pid, -43210);
      if (signal === 0) {
        if (groupAlive) return true;
        const error = new Error("process group absent");
        error.code = "ESRCH";
        throw error;
      }
      if (signal === "SIGTERM") {
        groupAlive = false;
        return true;
      }
      return true;
    };

    const cleanupError = await terminateChannelConnectorAgentChild({
      exitCode: null,
      signalCode: null,
      pid: 43210,
      kill: () => {
        rootKillCalls += 1;
        return true;
      },
    });

    assert.equal(cleanupError, "");
    assert.equal(rootKillCalls, 0);
    assert.deepEqual(signals, [
      [-43210, 0],
      [-43210, "SIGTERM"],
      [-43210, 0],
    ]);
  } finally {
    process.kill = originalKill;
    Object.defineProperty(process, "platform", originalPlatform);
  }
});

test("Channel Connector one-shot cancellation returns a bounded cleanup failure when the child never closes", async () => {
  const originalPlatform = Object.getOwnPropertyDescriptor(process, "platform");
  const originalSpawn = crossSpawn.spawn;
  const originalSync = crossSpawn.sync;
  const child = new EventEmitter();
  child.pid = 43210;
  child.exitCode = null;
  child.signalCode = null;
  child.killed = false;
  child.stdin = new PassThrough();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.kill = () => {
    child.killed = true;
    return true;
  };
  try {
    Object.defineProperty(process, "platform", {
      configurable: true,
      enumerable: true,
      value: "win32",
    });
    crossSpawn.spawn = () => child;
    crossSpawn.sync = () => ({
      error: new Error("fixture taskkill failure"),
      status: 1,
    });
    const controller = new AbortController();
    const resultPromise = defaultChannelConnectorAgentProcessRunner({
      ...processRequest(process.cwd(), process.cwd(), "fake-hanging-agent"),
      signal: controller.signal,
      timeoutMs: 60_000,
    });
    controller.abort();

    let deadline;
    const result = await Promise.race([
      resultPromise,
      new Promise((_, reject) => {
        deadline = setTimeout(
          () => reject(new Error("runner remained pending after bounded cleanup failure")),
          3_000,
        );
      }),
    ]).finally(() => clearTimeout(deadline));

    assert.equal(result.cancelled, true);
    assert.equal(result.exitCode, null);
    assert.equal(child.killed, true);
    assert.equal(
      result.error,
      "Agent process cancelled. Agent process cleanup failed: taskkill failed and the owned command remained alive",
    );
  } finally {
    crossSpawn.spawn = originalSpawn;
    crossSpawn.sync = originalSync;
    Object.defineProperty(process, "platform", originalPlatform);
  }
});

test("Channel Connector one-shot runner cancels a command shim process", async (t) => {
  const root = makeTempRoot();
  const binDir = path.join(root, "取消 shim bin");
  const fixture = writeHangingAgentTree(binDir, root, "tracevane-hanging-agent");
  let leaderPid = 0;
  let descendantPid = 0;
  t.after(() => {
    stopFixtureProcess(leaderPid);
    stopFixtureProcess(descendantPid);
    fs.rmSync(root, { recursive: true, force: true });
  });
  const controller = new AbortController();
  const resultPromise = defaultChannelConnectorAgentProcessRunner(processRequest(
    root,
    binDir,
    "tracevane-hanging-agent",
    {
      env: {
        PATH: `${binDir}${path.delimiter}${process.env.PATH || ""}`,
        TRACEVANE_TEST_LEADER_PID_FILE: fixture.leaderPidFile,
        TRACEVANE_TEST_DESCENDANT_PID_FILE: fixture.descendantPidFile,
        TRACEVANE_TEST_DESCENDANT_PATH: fixture.descendantPath,
      },
      signal: controller.signal,
    },
  ));
  await waitForFile(fixture.leaderPidFile);
  await waitForFile(fixture.descendantPidFile);
  leaderPid = Number(fs.readFileSync(fixture.leaderPidFile, "utf8"));
  descendantPid = Number(fs.readFileSync(fixture.descendantPidFile, "utf8"));
  controller.abort();
  const result = await resultPromise;
  await Promise.all([
    waitForProcessExit(leaderPid),
    waitForProcessExit(descendantPid),
  ]);

  assert.equal(result.cancelled, true);
  assert.equal(result.error, "Agent process cancelled.");
  assert.equal(processExists(leaderPid), false);
  assert.equal(processExists(descendantPid), false);
});

test("Channel Connector one-shot timeout removes the command shim descendant tree", async (t) => {
  const root = makeTempRoot();
  const binDir = path.join(root, "超时 shim bin");
  const fixture = writeHangingAgentTree(binDir, root, "tracevane-timeout-agent");
  let leaderPid = 0;
  let descendantPid = 0;
  t.after(() => {
    stopFixtureProcess(leaderPid);
    stopFixtureProcess(descendantPid);
    fs.rmSync(root, { recursive: true, force: true });
  });

  const resultPromise = defaultChannelConnectorAgentProcessRunner(processRequest(
    root,
    binDir,
    "tracevane-timeout-agent",
    {
      env: {
        PATH: `${binDir}${path.delimiter}${process.env.PATH || ""}`,
        TRACEVANE_TEST_LEADER_PID_FILE: fixture.leaderPidFile,
        TRACEVANE_TEST_DESCENDANT_PID_FILE: fixture.descendantPidFile,
        TRACEVANE_TEST_DESCENDANT_PATH: fixture.descendantPath,
      },
      idleTimeoutMs: 750,
      timeoutMs: 750,
    },
  ));
  await waitForFile(fixture.leaderPidFile);
  await waitForFile(fixture.descendantPidFile);
  leaderPid = Number(fs.readFileSync(fixture.leaderPidFile, "utf8"));
  descendantPid = Number(fs.readFileSync(fixture.descendantPidFile, "utf8"));

  const result = await resultPromise;
  await Promise.all([
    waitForProcessExit(leaderPid),
    waitForProcessExit(descendantPid),
  ]);

  assert.equal(result.timedOut, true);
  assert.match(result.error || "", /timed out/i);
  assert.equal(processExists(leaderPid), false);
  assert.equal(processExists(descendantPid), false);
});
