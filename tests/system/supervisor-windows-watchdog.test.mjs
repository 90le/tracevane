import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { gunzipSync } from "node:zlib";

import * as watchdogModule from "../../dist/apps/api/modules/supervisor/windows-service-watchdog.js";

const {
  parseWindowsServiceWatchdogArguments,
  startWindowsServiceWatchdog,
} = watchdogModule;

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

async function removeDirectoryWithRetry(root, timeoutMs = 2_000) {
  const deadline = Date.now() + timeoutMs;
  while (true) {
    try {
      fs.rmSync(root, { force: true, recursive: true });
      return;
    } catch (error) {
      if (
        !["EBUSY", "ENOTEMPTY", "EPERM"].includes(error?.code) ||
        Date.now() >= deadline
      ) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
}

async function forceKillSingleWindowsProcess(pid) {
  await new Promise((resolve, reject) => {
    const killer = spawn("taskkill.exe", ["/PID", String(pid), "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
    killer.once("error", reject);
    killer.once("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`taskkill exited with status ${code}`));
    });
  });
}

test("Windows job runner launch is hidden and owns one encoded daemon command", () => {
  assert.equal(
    typeof watchdogModule.createWindowsJobObjectRunnerLaunch,
    "function",
  );
  const launch = watchdogModule.createWindowsJobObjectRunnerLaunch({
    args: ["", 'alpha "beta"', "C:/tail\\", "配置"],
    cwd: "C:/Trace vane/workspace",
    entryPath: "C:/Trace vane/daemon.mjs",
    watchdogPid: 4242,
  });

  assert.equal(launch.command, "powershell.exe");
  assert.deepEqual(launch.args.slice(0, -1), [
    "-NoLogo",
    "-NoProfile",
    "-NonInteractive",
    "-WindowStyle",
    "Hidden",
    "-EncodedCommand",
  ]);
  const script = Buffer.from(launch.args.at(-1), "base64").toString("utf16le");
  const sourceMatch = script.match(
    /\$sourceArchive = \[Convert\]::FromBase64String\('([^']+)'\)/u,
  );
  assert.ok(sourceMatch, "job runner must embed one compressed C# source");
  const source = gunzipSync(Buffer.from(sourceMatch[1], "base64")).toString("utf8");
  assert.match(source, /CREATE_SUSPENDED/u);
  assert.match(source, /CREATE_NO_WINDOW/u);
  assert.match(source, /JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE/u);
  assert.match(source, /AssignProcessToJobObject/u);
  assert.match(source, /OpenProcess/u);
  assert.match(source, /WaitForMultipleObjects/u);
  assert.match(source, /SYNCHRONIZE/u);
  assert.match(source, /TerminateJobObject/u);
  assert.match(source, /ActiveProcesses/u);

  const payloadMatch = script.match(
    /\$payloadJson = .*FromBase64String\('([^']+)'\)/u,
  );
  assert.ok(payloadMatch, "job runner must receive one Base64 JSON payload");
  const payload = JSON.parse(
    Buffer.from(payloadMatch[1], "base64").toString("utf8"),
  );
  assert.equal(payload.applicationName, process.execPath);
  assert.equal(payload.cwd, "C:/Trace vane/workspace");
  assert.equal(payload.watchdogPid, 4242);
  assert.equal(typeof payload.commandLine, "string");
  assert.doesNotMatch(script, /C:\/Trace vane\/daemon\.mjs/u);
});

test("watchdog CLI accepts only -- followed by a daemon entry", () => {
  assert.deepEqual(
    parseWindowsServiceWatchdogArguments([
      "--host-pid",
      "4242",
      "--payload",
      Buffer.from(JSON.stringify({
        entryPath: "C:/Trace vane/daemon.mjs",
        args: ["", 'alpha "beta"', "C:/tail\\", "配置"],
      }), "utf8").toString("base64"),
    ]),
    {
      args: ["", 'alpha "beta"', "C:/tail\\", "配置"],
      entryPath: "C:/Trace vane/daemon.mjs",
      hostPid: 4242,
    },
  );

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
    ["--host-pid", "0", "--payload", "e30="],
    ["--host-pid", "4242", "--payload", "not-base64"],
  ]) {
    assert.throws(
      () => parseWindowsServiceWatchdogArguments(invalid),
      /watchdog arguments must be -- <daemonEntry> \.\.\.args/,
    );
  }
});

test("watchdog stops the full daemon tree when its hidden task host disappears", {
  skip: process.platform === "win32" ? false : "Windows process-tree semantics only",
  timeout: 10_000,
}, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tracevane-watchdog-host-"));
  const statePath = path.join(root, "tree-pids.json");
  const entryPath = path.join(root, "daemon-tree.mjs");
  fs.writeFileSync(
    entryPath,
    [
      'import { spawn } from "node:child_process";',
      'import fs from "node:fs";',
      "const statePath = process.argv[2];",
      'const descendant = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore", windowsHide: true });',
      'fs.writeFileSync(statePath, JSON.stringify({ daemonPid: process.pid, descendantPid: descendant.pid }), "utf8");',
      "setInterval(() => {}, 1_000);",
      "",
    ].join("\n"),
    "utf8",
  );

  const taskHost = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
    stdio: "ignore",
    windowsHide: true,
  });
  let daemonPid = null;
  let descendantPid = null;
  let watchdog;
  try {
    watchdog = startWindowsServiceWatchdog({
      args: [statePath],
      cwd: root,
      entryPath,
      hostPid: taskHost.pid,
    });
    const pids = await waitFor(() => {
      if (!fs.existsSync(statePath)) return false;
      return JSON.parse(fs.readFileSync(statePath, "utf8"));
    });
    daemonPid = pids.daemonPid;
    descendantPid = pids.descendantPid;
    assert.equal(processIsAlive(daemonPid), true);
    assert.equal(processIsAlive(descendantPid), true);
    const hostExited = new Promise((resolve) => taskHost.once("exit", resolve));
    taskHost.kill("SIGKILL");
    await hostExited;

    await Promise.race([
      watchdog.done,
      new Promise((_, reject) => setTimeout(
        () => reject(new Error("watchdog did not stop after its host exited")),
        1_500,
      )),
    ]);
    await waitFor(() => !processIsAlive(daemonPid) && !processIsAlive(descendantPid));
  } finally {
    if (taskHost.pid && processIsAlive(taskHost.pid)) {
      try { taskHost.kill("SIGKILL"); } catch {}
    }
    await watchdog?.stop().catch(() => undefined);
    for (const pid of [descendantPid, daemonPid]) {
      if (Number.isSafeInteger(pid) && processIsAlive(pid)) {
        try { process.kill(pid, "SIGKILL"); } catch {}
      }
    }
    await removeDirectoryWithRetry(root);
  }
});

test("Windows watchdog removes crashed daemon descendants before launching a replacement", {
  skip: process.platform === "win32" ? false : "Windows Job Object semantics only",
  timeout: 15_000,
}, async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tracevane-watchdog-job-"));
  const statePath = path.join(root, "generations.json");
  const entryPath = path.join(root, "crash-with-descendant.mjs");
  const expectedArgs = [
    "",
    'alpha "beta"',
    "C:/tail\\",
    "space value",
    "single'quote",
    "配置",
  ];
  fs.writeFileSync(
    entryPath,
    [
      'import { spawn } from "node:child_process";',
      'import fs from "node:fs";',
      "const statePath = process.argv[2];",
      "let previous = null;",
      "try { previous = JSON.parse(fs.readFileSync(statePath, \"utf8\")); } catch {}",
      "if (!previous) {",
      '  const descendant = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { detached: true, stdio: "ignore", windowsHide: true });',
      "  descendant.unref();",
      "  fs.writeFileSync(statePath, JSON.stringify({ args: process.argv.slice(3), descendantPid: descendant.pid, generation: 1, rootPid: process.pid }), \"utf8\");",
      "  setTimeout(() => process.exit(23), 100);",
      "} else {",
      "  let descendantAlive = true;",
      "  try { process.kill(previous.descendantPid, 0); } catch { descendantAlive = false; }",
      "  fs.writeFileSync(statePath, JSON.stringify({ ...previous, args: process.argv.slice(3), descendantAliveAtReplacement: descendantAlive, generation: 2, replacementPid: process.pid }), \"utf8\");",
      "  setInterval(() => {}, 1_000);",
      "}",
      "",
    ].join("\n"),
    "utf8",
  );

  let watchdog;
  let state = null;
  try {
    watchdog = startWindowsServiceWatchdog({
      args: [statePath, ...expectedArgs],
      cwd: root,
      entryPath,
    });
    state = await waitFor(() => {
      if (!fs.existsSync(statePath)) return false;
      const parsed = JSON.parse(fs.readFileSync(statePath, "utf8"));
      return parsed.generation === 2 ? parsed : false;
    }, 10_000);

    assert.deepEqual(state.args, expectedArgs);
    assert.equal(
      state.descendantAliveAtReplacement,
      false,
      "replacement daemon overlapped a descendant owned by the crashed root",
    );
    await waitFor(() => !processIsAlive(state.descendantPid));
    t.diagnostic(JSON.stringify({
      crashedRootPid: state.rootPid,
      descendantAliveAtReplacement: state.descendantAliveAtReplacement,
      descendantPid: state.descendantPid,
      replacementPid: state.replacementPid,
    }));

    await watchdog.stop();
    await waitFor(() => !processIsAlive(state.replacementPid));
  } finally {
    await watchdog?.stop().catch(() => undefined);
    for (const pid of [
      state?.replacementPid,
      state?.descendantPid,
      state?.rootPid,
    ]) {
      if (Number.isSafeInteger(pid) && processIsAlive(pid)) {
        try { process.kill(pid, "SIGKILL"); } catch {}
      }
    }
    for (let attempt = 0; attempt < 20; attempt += 1) {
      try {
        await removeDirectoryWithRetry(root);
        break;
      } catch (error) {
        if (!["EBUSY", "ENOTEMPTY", "EPERM"].includes(error?.code) || attempt === 19) {
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }
  }
});

test("Windows Job Object runner drains its tree when only the watchdog is force-killed", {
  skip: process.platform === "win32" ? false : "Windows Job Object semantics only",
  timeout: 15_000,
}, async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tracevane-watchdog-death-"));
  const statePath = path.join(root, "tree-pids.json");
  const entryPath = path.join(root, "daemon-tree.mjs");
  fs.writeFileSync(
    entryPath,
    [
      'import { spawn } from "node:child_process";',
      'import fs from "node:fs";',
      "const statePath = process.argv[2];",
      'const descendant = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { detached: true, stdio: "ignore", windowsHide: true });',
      "descendant.unref();",
      'fs.writeFileSync(statePath, JSON.stringify({ runnerPid: process.ppid, daemonPid: process.pid, descendantPid: descendant.pid }), "utf8");',
      "setInterval(() => {}, 1_000);",
      "",
    ].join("\n"),
    "utf8",
  );

  const watchdog = spawn(
    process.execPath,
    ["-e", "setInterval(() => {}, 1000)"],
    { stdio: "ignore", windowsHide: true },
  );
  let runner = null;
  let state = null;
  try {
    const runnerLaunch = watchdogModule.createWindowsJobObjectRunnerLaunch({
      args: [statePath],
      cwd: root,
      entryPath,
      watchdogPid: watchdog.pid,
    });
    runner = spawn(runnerLaunch.command, runnerLaunch.args, {
      cwd: root,
      stdio: "ignore",
      windowsHide: true,
    });
    state = await waitFor(() => {
      if (!fs.existsSync(statePath)) return false;
      return JSON.parse(fs.readFileSync(statePath, "utf8"));
    }, 10_000);
    assert.equal(processIsAlive(watchdog.pid), true);
    assert.equal(state.runnerPid, runner.pid);
    assert.equal(processIsAlive(state.runnerPid), true);
    assert.equal(processIsAlive(state.daemonPid), true);
    assert.equal(processIsAlive(state.descendantPid), true);

    const watchdogExited = new Promise((resolve) => watchdog.once("exit", resolve));
    await forceKillSingleWindowsProcess(watchdog.pid);
    await watchdogExited;

    await waitFor(
      () => !processIsAlive(state.runnerPid)
        && !processIsAlive(state.daemonPid)
        && !processIsAlive(state.descendantPid),
      3_000,
    );
    t.diagnostic(JSON.stringify({
      watchdogPid: watchdog.pid,
      runnerPid: state.runnerPid,
      daemonPid: state.daemonPid,
      descendantPid: state.descendantPid,
    }));
  } finally {
    if (watchdog.pid && processIsAlive(watchdog.pid)) {
      try { process.kill(watchdog.pid, "SIGKILL"); } catch {}
    }
    if (runner?.pid && processIsAlive(runner.pid)) {
      try { process.kill(runner.pid, "SIGKILL"); } catch {}
    }
    for (const pid of [state?.runnerPid, state?.daemonPid, state?.descendantPid]) {
      if (Number.isSafeInteger(pid) && processIsAlive(pid)) {
        try { process.kill(pid, "SIGKILL"); } catch {}
      }
    }
    for (let attempt = 0; attempt < 20; attempt += 1) {
      try {
        await removeDirectoryWithRetry(root);
        break;
      } catch (error) {
        if (!["EBUSY", "ENOTEMPTY", "EPERM"].includes(error?.code) || attempt === 19) {
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }
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
    await removeDirectoryWithRetry(root);
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
    await removeDirectoryWithRetry(root);
  }
});
