import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import "tsx/esm";

const commandRouter = await import("../../apps/api/modules/channel-connectors/command-router.ts");

function quotePowerShell(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function quotePosix(value) {
  return `'${String(value).replaceAll("'", `'"'"'`)}'`;
}

function descendantFixtureCommand(scriptPath, processRecordFile) {
  if (process.platform === "win32") {
    return `& ${quotePowerShell(process.execPath)} ${quotePowerShell(scriptPath)} ${quotePowerShell(processRecordFile)}`;
  }
  return `${quotePosix(process.execPath)} ${quotePosix(scriptPath)} ${quotePosix(processRecordFile)}; echo child-ended`;
}

function processIsAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

async function waitFor(check, timeoutMs = 3_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (check()) return true;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return check();
}

function forceStopFixture(pid) {
  if (!pid || !processIsAlive(pid)) return;
  if (process.platform === "win32") {
    spawnSync("taskkill.exe", ["/PID", String(pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
    return;
  }
  try {
    process.kill(pid, "SIGKILL");
  } catch {
    // The process may have exited between the liveness probe and signal.
  }
}

test("custom exec timeout waits for the platform process tree to stop", async () => {
  assert.equal(
    typeof commandRouter.runCustomExecCommand,
    "function",
    "command router should expose the custom-exec runner for focused lifecycle verification",
  );

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "tracevane-custom-exec-timeout-"));
  const scriptPath = path.join(tempDir, "descendant.cjs");
  const processRecordFile = path.join(tempDir, "descendant.pid");
  const events = [];
  let descendantPid = null;
  fs.writeFileSync(
    scriptPath,
    [
      'const fs = require("node:fs");',
      'fs.writeFileSync(process.argv[2], String(process.pid), "utf8");',
      'process.stdout.write("descendant-ready\\n");',
      "setInterval(() => {}, 1_000);",
      "",
    ].join("\n"),
    "utf8",
  );

  try {
    const timeoutMs = 2_000;
    const startedAt = Date.now();
    const result = await commandRouter.runCustomExecCommand({
      command: {
        name: "timeout_tree",
        description: "timeout fixture",
        prompt: "",
        exec: descendantFixtureCommand(scriptPath, processRecordFile),
        workDir: "",
        source: "config",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      project: { workDir: os.tmpdir() },
      args: [],
      timeoutMs,
      onProgress: async (event) => {
        events.push(event);
        return event.type === "timeout"
          ? { handled: true, suppressFinalReply: true }
          : {};
      },
    });
    const elapsedMs = Date.now() - startedAt;

    assert.equal(
      fs.existsSync(processRecordFile),
      true,
      `fixture should start a descendant before timeout\n${result.replyText}`,
    );
    descendantPid = Number(fs.readFileSync(processRecordFile, "utf8").trim());
    assert.equal(Number.isInteger(descendantPid) && descendantPid > 0, true);
    assert.equal(await waitFor(() => !processIsAlive(descendantPid)), true, "timeout must leave no descendant alive");
    assert.equal(result.ok, false);
    assert.equal(result.audit.exec?.timedOut, true);
    assert.equal(result.audit.exec?.error, `timeout=${timeoutMs}ms`);
    assert.match(result.replyText, /timed out/);
    assert.match(result.replyText, /descendant-ready/);
    assert.equal(result.progressHandled, true);
    assert.equal(result.suppressFinalReply, true);
    assert.deepEqual(events.map((event) => event.type).filter((type) => type !== "progress"), ["started", "timeout"]);
    assert.ok(elapsedMs >= timeoutMs, `expected timeout after ${timeoutMs}ms, received ${elapsedMs}ms`);
    assert.ok(elapsedMs < 10_000, `timeout cleanup must remain bounded, received ${elapsedMs}ms`);
  } finally {
    if (!descendantPid && fs.existsSync(processRecordFile)) {
      const recordedPid = Number(fs.readFileSync(processRecordFile, "utf8").trim());
      if (Number.isInteger(recordedPid) && recordedPid > 0) descendantPid = recordedPid;
    }
    forceStopFixture(descendantPid);
    if (descendantPid) await waitFor(() => !processIsAlive(descendantPid));
    fs.rmSync(tempDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});
