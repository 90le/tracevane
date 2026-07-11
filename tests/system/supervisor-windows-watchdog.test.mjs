import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  parseWindowsServiceWatchdogArguments,
  startWindowsServiceWatchdog,
} from "../../dist/apps/api/modules/supervisor/windows-service-watchdog.js";

function processIsAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error?.code === "EPERM") return true;
    if (error?.code === "ESRCH") return false;
    throw error;
  }
}

function readPids(statePath) {
  if (!fs.existsSync(statePath)) return [];
  return fs.readFileSync(statePath, "utf8")
    .trim()
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((value) => Number.parseInt(value, 10));
}

async function waitFor(predicate, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await predicate();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.fail(`condition did not become true within ${timeoutMs}ms`);
}

test("watchdog CLI accepts only -- followed by a daemon entry", () => {
  assert.deepEqual(
    parseWindowsServiceWatchdogArguments([
      "--",
      "C:/Trace vane/daemon.mjs",
      "--config",
      "C:/Trace vane/config.json",
    ]),
    {
      args: ["--config", "C:/Trace vane/config.json"],
      entryPath: "C:/Trace vane/daemon.mjs",
    },
  );

  for (const invalid of [
    [],
    ["C:/daemon.mjs"],
    ["--"],
    ["--", ""],
    ["--flag", "--", "C:/daemon.mjs"],
  ]) {
    assert.throws(
      () => parseWindowsServiceWatchdogArguments(invalid),
      /watchdog arguments must be -- <daemonEntry> \.\.\.args/,
    );
  }
});

test("watchdog restarts a crashed child and explicit stop leaves no child", {
  timeout: 10_000,
}, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tracevane-watchdog-"));
  const statePath = path.join(root, "child-pids.txt");
  const entryPath = path.join(root, "crash-once.mjs");
  fs.writeFileSync(
    entryPath,
    [
      'import fs from "node:fs";',
      "const statePath = process.argv[2];",
      'fs.appendFileSync(statePath, `${process.pid}\\n`, "utf8");',
      'const runs = fs.readFileSync(statePath, "utf8").trim().split(/\\r?\\n/u).length;',
      "if (runs === 1) setTimeout(() => process.exit(23), 25);",
      "else setInterval(() => {}, 1_000);",
      'process.once("SIGINT", () => process.exit(0));',
      'process.once("SIGTERM", () => process.exit(0));',
      "",
    ].join("\n"),
    "utf8",
  );

  let watchdog;
  try {
    watchdog = startWindowsServiceWatchdog({
      args: [statePath],
      cwd: root,
      entryPath,
    });
    const [firstPid, secondPid] = await waitFor(() => {
      const pids = readPids(statePath);
      return pids.length >= 2 ? pids : false;
    });
    assert.notEqual(firstPid, secondPid);
    await waitFor(() => !processIsAlive(firstPid));
    assert.equal(processIsAlive(secondPid), true);

    await Promise.all([watchdog.stop(), watchdog.stop()]);
    await waitFor(() => !processIsAlive(secondPid));
    await new Promise((resolve) => setTimeout(resolve, 1_200));

    assert.deepEqual(readPids(statePath), [firstPid, secondPid]);
  } finally {
    await watchdog?.stop();
    fs.rmSync(root, { force: true, recursive: true });
  }
});

test("watchdog stop during restart backoff prevents a replacement child", {
  timeout: 5_000,
}, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tracevane-watchdog-backoff-"));
  const statePath = path.join(root, "child-pids.txt");
  const entryPath = path.join(root, "crash.mjs");
  fs.writeFileSync(
    entryPath,
    [
      'import fs from "node:fs";',
      "const statePath = process.argv[2];",
      'fs.appendFileSync(statePath, `${process.pid}\\n`, "utf8");',
      "setTimeout(() => process.exit(23), 25);",
      "",
    ].join("\n"),
    "utf8",
  );

  let watchdog;
  try {
    watchdog = startWindowsServiceWatchdog({
      args: [statePath],
      cwd: root,
      entryPath,
    });
    const firstPid = await waitFor(() => readPids(statePath)[0] ?? false);
    await waitFor(() => !processIsAlive(firstPid));

    await watchdog.stop();
    await new Promise((resolve) => setTimeout(resolve, 1_200));

    assert.deepEqual(readPids(statePath), [firstPid]);
  } finally {
    await watchdog?.stop();
    fs.rmSync(root, { force: true, recursive: true });
  }
});
