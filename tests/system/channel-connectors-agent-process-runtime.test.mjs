import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
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

test("Channel Connector Windows tree termination bounds taskkill execution", { skip: process.platform !== "win32" }, () => {
  const originalSync = crossSpawn.sync;
  let observed = null;
  crossSpawn.sync = (command, args, options) => {
    observed = { command, args, options };
    return { error: undefined, status: 0 };
  };
  try {
    terminateChannelConnectorAgentChild({
      exitCode: null,
      signalCode: null,
      pid: 43210,
      kill: () => true,
    });
  } finally {
    crossSpawn.sync = originalSync;
  }

  assert.equal(observed.command, "taskkill.exe");
  assert.deepEqual(observed.args, ["/PID", "43210", "/T", "/F"]);
  assert.equal(observed.options.shell, false);
  assert.equal(observed.options.timeout, 5_000);
});

test("Channel Connector one-shot runner cancels a command shim process", async (t) => {
  const root = makeTempRoot();
  const binDir = path.join(root, "取消 shim bin");
  const pidFile = path.join(root, "fixture.pid");
  let fixturePid = 0;
  t.after(() => {
    stopFixtureProcess(fixturePid);
    fs.rmSync(root, { recursive: true, force: true });
  });
  writeNodeCommand(binDir, "tracevane-hanging-agent", `
const fs = require("node:fs");
fs.writeFileSync(process.env.TRACEVANE_TEST_PID_FILE, String(process.pid));
const heartbeat = setInterval(() => process.stdout.write("heartbeat\\n"), 50);
process.stdout.on("error", () => {
  clearInterval(heartbeat);
  process.exit(0);
});
process.stdin.resume();
`);
  const controller = new AbortController();
  const resultPromise = defaultChannelConnectorAgentProcessRunner(processRequest(
    root,
    binDir,
    "tracevane-hanging-agent",
    {
      env: {
        PATH: `${binDir}${path.delimiter}${process.env.PATH || ""}`,
        TRACEVANE_TEST_PID_FILE: pidFile,
      },
      signal: controller.signal,
    },
  ));
  await waitForFile(pidFile);
  fixturePid = Number(fs.readFileSync(pidFile, "utf8"));
  controller.abort();
  const result = await resultPromise;
  await waitForProcessExit(fixturePid);

  assert.equal(result.cancelled, true);
  assert.equal(result.error, "Agent process cancelled.");
  assert.equal(processExists(fixturePid), false);
});
