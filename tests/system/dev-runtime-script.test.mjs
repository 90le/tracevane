import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { EventEmitter } from "node:events";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

const repoRoot = resolve(".");
const scriptPath = resolve("scripts/dev-runtime.mjs");
const scriptSource = readFileSync(scriptPath, "utf8");

// Importing the launcher must be side-effect free so the rest of this suite can
// exercise its real functions without starting or stopping the repository.
assert.match(scriptSource, /isMainModule/);
const runtime = await import(pathToFileURL(scriptPath).href + "?dev-runtime-test");

test("port availability checks both IPv4 and dual-stack listeners", () => {
  assert.match(
    scriptSource,
    /for \(const host of \["127\.0\.0\.1", "::"\]\)/,
  );
});

const RUN_TOKEN = "0123456789abcdef0123456789abcdef";
const STARTED_AT = "2026-07-12T00:00:00.000Z";

function tempRoot(prefix = "tracevane-dev-runtime-") {
  return mkdtempSync(join(tmpdir(), prefix));
}

function metadata(overrides = {}) {
  return {
    version: 1,
    pid: 4242,
    target: "backend",
    mode: "restart",
    resolvedRoot: resolve("C:/workspace/路径 含空格"),
    runToken: RUN_TOKEN,
    startedAt: STARTED_AT,
    ...overrides,
  };
}

function writeMetadata(file, value) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(value) + "\n", "utf8");
}

function processIsAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

async function waitFor(predicate, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 25));
  }
  throw new Error("Timed out waiting for condition");
}

async function waitForExit(pid, timeoutMs = 5_000) {
  await waitFor(() => !processIsAlive(pid), timeoutMs);
}

async function cleanupOwnedTree(pid) {
  if (!pid || !processIsAlive(pid)) return;
  if (process.platform === "win32") {
    spawnSync("taskkill.exe", ["/PID", String(pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
  } else {
    try {
      process.kill(-pid, "SIGKILL");
    } catch (error) {
      if (error?.code !== "ESRCH") throw error;
      try {
        process.kill(pid, "SIGKILL");
      } catch (fallbackError) {
        if (fallbackError?.code !== "ESRCH") throw fallbackError;
      }
    }
  }
  await waitForExit(pid).catch(() => {});
}

test("missing, malformed, mismatched, and dead metadata never authorizes a kill", async () => {
  const root = tempRoot();
  const pidFile = join(root, "backend.pid");
  const expected = {
    pidFile,
    target: "backend",
    mode: "restart",
    resolvedRoot: resolve(root),
  };
  const kills = [];
  try {
    assert.equal(
      (await runtime.stopManagedProcess(expected, {
        isProcessRunningImpl: () => true,
        terminateOwnedTreeImpl: async (pid) => kills.push(pid),
      })).status,
      "missing",
    );

    for (const value of [
      "not-json",
      JSON.stringify({ pid: 4242 }),
      JSON.stringify(metadata({ target: "frontend", resolvedRoot: resolve(root) })),
      JSON.stringify(metadata({ mode: "fresh", resolvedRoot: resolve(root) })),
      JSON.stringify(metadata({ resolvedRoot: resolve(root, "other") })),
    ]) {
      writeFileSync(pidFile, value, "utf8");
      const result = await runtime.stopManagedProcess(expected, {
        isProcessRunningImpl: () => true,
        terminateOwnedTreeImpl: async (pid) => kills.push(pid),
      });
      assert.equal(result.status, "stale");
      assert.equal(existsSync(pidFile), false);
    }

    writeMetadata(pidFile, metadata({ resolvedRoot: resolve(root) }));
    const dead = await runtime.stopManagedProcess(expected, {
      isProcessRunningImpl: () => false,
      terminateOwnedTreeImpl: async (pid) => kills.push(pid),
    });
    assert.equal(dead.status, "stale");
    assert.equal(existsSync(pidFile), false);
    assert.deepEqual(kills, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("valid owned metadata is removed only after exact tree termination", async () => {
  const root = tempRoot();
  const pidFile = join(root, "backend.pid");
  const calls = [];
  try {
    writeMetadata(pidFile, metadata({ resolvedRoot: resolve(root) }));
    const result = await runtime.stopManagedProcess(
      { pidFile, target: "backend", mode: "restart", resolvedRoot: resolve(root) },
      {
        isProcessRunningImpl: () => true,
        terminateOwnedTreeImpl: async (pid) => {
          calls.push(pid);
          assert.equal(existsSync(pidFile), true);
        },
      },
    );
    assert.deepEqual(calls, [4242]);
    assert.equal(result.status, "stopped");
    assert.equal(existsSync(pidFile), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("stop failure retains metadata and aborts instead of forgetting the owner", async () => {
  const root = tempRoot();
  const pidFile = join(root, "backend.pid");
  try {
    const owned = metadata({ resolvedRoot: resolve(root) });
    writeMetadata(pidFile, owned);
    await assert.rejects(
      runtime.stopManagedProcess(
        { pidFile, target: "backend", mode: "restart", resolvedRoot: resolve(root) },
        {
          isProcessRunningImpl: () => true,
          terminateOwnedTreeImpl: async () => {
            throw new Error("tree remains alive");
          },
        },
      ),
      /tree remains alive/,
    );
    assert.deepEqual(JSON.parse(readFileSync(pidFile, "utf8")), owned);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Windows tree stop uses only taskkill.exe /PID <pid> /T /F and confirms exit", async () => {
  const calls = [];
  let aliveChecks = 0;
  await runtime.terminateOwnedTree(4321, {
    platform: "win32",
    spawnSyncImpl(command, args, options) {
      calls.push({ command, args, options });
      return { status: 0, stdout: "", stderr: "" };
    },
    isProcessRunningImpl() {
      aliveChecks += 1;
      return aliveChecks === 1;
    },
    waitImpl: async () => {},
    stopWaitMs: 100,
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, "taskkill.exe");
  assert.deepEqual(calls[0].args, ["/PID", "4321", "/T", "/F"]);
  assert.equal(calls[0].args.includes("/IM"), false);
});

test("Windows taskkill failure is explicit while the owned PID remains alive", async () => {
  await assert.rejects(
    runtime.terminateOwnedTree(4321, {
      platform: "win32",
      spawnSyncImpl: () => ({ status: 1, stdout: "", stderr: "Access is denied" }),
      isProcessRunningImpl: () => true,
      waitImpl: async () => {},
      stopWaitMs: 10,
    }),
    /Access is denied|taskkill/,
  );
});

test("Windows taskkill invocation failure stays failed even when the root PID disappears", async () => {
  for (const result of [
    null,
    { status: null, error: Object.assign(new Error("spawn blocked"), { code: "EACCES" }), stdout: "", stderr: "" },
    { status: 1, stdout: "", stderr: "not found" },
  ]) {
    let checks = 0;
    await assert.rejects(
      runtime.terminateOwnedTree(4321, {
        platform: "win32",
        spawnSyncImpl: () => result,
        isProcessRunningImpl: () => {
          checks += 1;
          return checks === 1;
        },
        waitImpl: async () => {},
        stopWaitMs: 10,
      }),
      /taskkill|spawn blocked|not found/i,
    );
  }
});

test(
  "native Windows taskkill nonzero status is not converted to success",
  { skip: process.platform !== "win32" ? "native taskkill only" : false },
  async () => {
    let checks = 0;
    await assert.rejects(
      runtime.terminateOwnedTree(99_999_999, {
        platform: "win32",
        isProcessRunningImpl: () => {
          checks += 1;
          return checks === 1;
        },
        waitImpl: async () => {},
        stopWaitMs: 10,
      }),
      /taskkill/i,
    );
  },
);

test("taskkill failure keeps valid ownership metadata even after the PID disappears", async () => {
  const root = tempRoot();
  const pidFile = join(root, "backend.pid");
  try {
    writeMetadata(pidFile, metadata({ resolvedRoot: resolve(root) }));
    let checks = 0;
    await assert.rejects(
      runtime.stopManagedProcess(
        { pidFile, target: "backend", mode: "restart", resolvedRoot: resolve(root) },
        {
          isProcessRunningImpl: () => true,
          terminateOwnedTreeImpl: () => runtime.terminateOwnedTree(4242, {
            platform: "win32",
            spawnSyncImpl: () => ({ status: 1, stdout: "", stderr: "cleanup unconfirmed" }),
            isProcessRunningImpl: () => {
              checks += 1;
              return checks === 1;
            },
            waitImpl: async () => {},
            stopWaitMs: 10,
          }),
        },
      ),
      /cleanup unconfirmed|taskkill/i,
    );
    assert.equal(existsSync(pidFile), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("POSIX stop signals the exact negative PGID and escalates TERM to KILL", async () => {
  const signals = [];
  let forceSent = false;
  await runtime.terminateOwnedTree(8765, {
    platform: "linux",
    killImpl(pid, signal) {
      signals.push([pid, signal]);
      if (signal === "SIGKILL") forceSent = true;
      if (signal === 0 && forceSent) {
        throw Object.assign(new Error("group absent"), { code: "ESRCH" });
      }
    },
    isProcessRunningImpl: () => !forceSent,
    waitImpl: async () => {},
    stopWaitMs: 10,
    forceWaitMs: 10,
  });
  assert.deepEqual(signals.filter(([, signal]) => signal !== 0), [
    [-8765, "SIGTERM"],
    [-8765, "SIGKILL"],
  ]);
});

test("POSIX waits for the entire process group after its leader exits", async () => {
  const signals = [];
  let now = 0;
  let groupAlive = true;
  await runtime.terminateOwnedTree(8765, {
    platform: "linux",
    killImpl(pid, signal) {
      signals.push([pid, signal]);
      if (pid !== -8765) throw new Error("must not fall back after group ownership is established");
      if (signal === "SIGKILL") groupAlive = false;
      if (signal === 0 && !groupAlive) throw Object.assign(new Error("group absent"), { code: "ESRCH" });
    },
    isProcessRunningImpl: () => false,
    waitImpl: async (ms) => {
      now += ms;
    },
    nowImpl: () => now,
    stopWaitMs: 100,
    forceWaitMs: 100,
  });
  assert.deepEqual(
    signals.filter(([, signal]) => signal !== 0),
    [
      [-8765, "SIGTERM"],
      [-8765, "SIGKILL"],
    ],
  );
  assert.ok(signals.some(([pid, signal]) => pid === -8765 && signal === 0));
  assert.equal(signals.some(([pid]) => pid === 8765), false);
});

test("POSIX group probe treats EPERM as alive", async () => {
  const signals = [];
  let groupAlive = true;
  await runtime.terminateOwnedTree(7007, {
    platform: "linux",
    killImpl(pid, signal) {
      signals.push([pid, signal]);
      if (signal === 0 && groupAlive) throw Object.assign(new Error("permission"), { code: "EPERM" });
      if (signal === "SIGTERM") groupAlive = false;
      if (signal === 0 && !groupAlive) throw Object.assign(new Error("absent"), { code: "ESRCH" });
    },
    isProcessRunningImpl: () => false,
    waitImpl: async () => {},
  });
  assert.deepEqual(
    signals.filter(([, signal]) => signal !== 0),
    [[-7007, "SIGTERM"]],
  );
});

test("managed POSIX stop follows an owned group after its leader exits", async () => {
  const root = tempRoot();
  const pidFile = join(root, "backend.pid");
  const terminations = [];
  try {
    writeMetadata(pidFile, metadata({ resolvedRoot: resolve(root) }));
    const result = await runtime.stopManagedProcess(
      { pidFile, target: "backend", mode: "restart", resolvedRoot: resolve(root) },
      {
        platform: "linux",
        isProcessRunningImpl: () => false,
        isPosixProcessGroupRunningImpl: () => true,
        terminateOwnedTreeImpl: async (pid) => {
          terminations.push(pid);
        },
      },
    );
    assert.equal(result.status, "stopped");
    assert.deepEqual(terminations, [4242]);
    assert.equal(existsSync(pidFile), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("POSIX PID fallback is allowed only when the negative PGID is ESRCH", async () => {
  const fallbackCalls = [];
  await runtime.terminateOwnedTree(3333, {
    platform: "darwin",
    killImpl(pid, signal) {
      fallbackCalls.push([pid, signal]);
      if (pid < 0) Object.assign(new Error("missing group"), { code: "ESRCH" });
      if (pid < 0) throw Object.assign(new Error("missing group"), { code: "ESRCH" });
    },
    isProcessRunningImpl: () => fallbackCalls.length < 2,
    waitImpl: async () => {},
    stopWaitMs: 10,
  });
  assert.deepEqual(fallbackCalls.filter(([, signal]) => signal !== 0).slice(0, 1), [
    [3333, "SIGTERM"],
  ]);

  const deniedCalls = [];
  await assert.rejects(
    runtime.terminateOwnedTree(3333, {
      platform: "linux",
      killImpl(pid, signal) {
        deniedCalls.push([pid, signal]);
        throw Object.assign(new Error("denied"), { code: "EACCES" });
      },
      isProcessRunningImpl: () => true,
      waitImpl: async () => {},
      stopWaitMs: 10,
    }),
    /denied/,
  );
  assert.deepEqual(deniedCalls, [[-3333, 0]]);
});

test("startSupervisor waits for spawn acknowledgement before writing metadata", async () => {
  const root = tempRoot("tracevane 含空格-");
  const paths = runtime.runtimePaths(root, "restart");
  const child = new EventEmitter();
  child.pid = 22334;
  child.exitCode = null;
  child.signalCode = null;
  child.unref = () => {};
  const spawnCalls = [];
  try {
    const starting = runtime.startSupervisor(
      {
        rootDir: root,
        target: "backend",
        mode: "restart",
        logFile: paths.backendLog,
        pidFile: paths.backendPid,
        env: { TRACEVANE_API_PORT: "3761" },
        runToken: RUN_TOKEN,
        scriptPath,
      },
      {
        spawnImpl(command, args, options) {
          spawnCalls.push({ command, args, options });
          assert.equal(existsSync(paths.backendPid), false);
          setImmediate(() => child.emit("spawn"));
          return child;
        },
      },
    );
    assert.equal(existsSync(paths.backendPid), false);
    const started = await starting;
    assert.equal(started.pid, 22334);
    assert.equal(spawnCalls[0].command, process.execPath);
    assert.deepEqual(spawnCalls[0].args, [
      scriptPath,
      "supervise",
      "backend",
      "restart",
      paths.backendLog,
      RUN_TOKEN,
    ]);
    assert.equal(spawnCalls[0].options.cwd, root);
    assert.notEqual(spawnCalls[0].options.shell, true);
    const stored = JSON.parse(readFileSync(paths.backendPid, "utf8"));
    assert.deepEqual(
      {
        version: stored.version,
        pid: stored.pid,
        target: stored.target,
        mode: stored.mode,
        resolvedRoot: stored.resolvedRoot,
        runToken: stored.runToken,
      },
      {
        version: 1,
        pid: 22334,
        target: "backend",
        mode: "restart",
        resolvedRoot: resolve(root),
        runToken: RUN_TOKEN,
      },
    );
    assert.match(stored.startedAt, /^\d{4}-\d{2}-\d{2}T/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("spawn error, missing PID, and pre-ack exit never publish ownership metadata", async (t) => {
  for (const scenario of ["error", "missing-pid", "early-exit"]) {
    await t.test(scenario, async () => {
      const root = tempRoot();
      const paths = runtime.runtimePaths(root, "restart");
      const child = new EventEmitter();
      child.pid = scenario === "missing-pid" ? undefined : 9922;
      child.exitCode = null;
      child.signalCode = null;
      child.unref = () => {};
      try {
        const starting = runtime.startSupervisor(
          {
            rootDir: root,
            target: "backend",
            mode: "restart",
            logFile: paths.backendLog,
            pidFile: paths.backendPid,
            env: {},
            runToken: RUN_TOKEN,
            scriptPath,
          },
          {
            spawnImpl() {
              setImmediate(() => {
                if (scenario === "error") child.emit("error", new Error("spawn denied"));
                else if (scenario === "early-exit") child.emit("exit", 7, null);
                else child.emit("spawn");
              });
              return child;
            },
          },
        );
        await assert.rejects(starting, /spawn denied|before acknowledgement|missing PID/i);
        assert.equal(existsSync(paths.backendPid), false);
        if (scenario === "error") {
          assert.match(readFileSync(paths.backendLog, "utf8"), /spawn denied/);
        }
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });
  }
});

test("metadata publish failure keeps the child referenced and exposes cleanup failure", async () => {
  const root = tempRoot();
  const paths = runtime.runtimePaths(root, "restart");
  const child = new EventEmitter();
  child.pid = 7722;
  child.exitCode = null;
  child.signalCode = null;
  let unrefCalls = 0;
  child.unref = () => {
    unrefCalls += 1;
  };
  try {
    let rejection;
    try {
      await runtime.startSupervisor(
        {
          rootDir: root,
          target: "backend",
          mode: "restart",
          logFile: paths.backendLog,
          pidFile: paths.backendPid,
          env: {},
          runToken: RUN_TOKEN,
          scriptPath,
        },
        {
          spawnImpl() {
            setImmediate(() => child.emit("spawn"));
            return child;
          },
          atomicWriteFileImpl() {
            throw new Error("metadata publish failed");
          },
          terminateOwnedTreeImpl: async () => {
            throw new Error("cleanup failed");
          },
        },
      );
    } catch (error) {
      rejection = error;
    }
    assert.ok(rejection instanceof AggregateError);
    assert.match(rejection.message, /metadata publish failed|cleanup failed/i);
    assert.equal(rejection.errors.length, 2);
    assert.equal(unrefCalls, 0);
    assert.equal(existsSync(paths.backendPid), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("post-ack immediate exit retains published metadata when cleanup is unconfirmed", async () => {
  const root = tempRoot();
  const paths = runtime.runtimePaths(root, "restart");
  const child = new EventEmitter();
  child.pid = 7733;
  child.signalCode = null;
  let exitReads = 0;
  Object.defineProperty(child, "exitCode", {
    get() {
      exitReads += 1;
      return exitReads === 1 ? null : 7;
    },
  });
  let unrefCalls = 0;
  child.unref = () => {
    unrefCalls += 1;
  };
  try {
    let rejection;
    try {
      await runtime.startSupervisor(
        {
          rootDir: root,
          target: "backend",
          mode: "restart",
          logFile: paths.backendLog,
          pidFile: paths.backendPid,
          env: {},
          runToken: RUN_TOKEN,
          scriptPath,
        },
        {
          spawnImpl() {
            setImmediate(() => child.emit("spawn"));
            return child;
          },
          terminateOwnedTreeImpl: async () => {
            throw new Error("immediate-exit cleanup failed");
          },
        },
      );
    } catch (error) {
      rejection = error;
    }
    assert.ok(rejection instanceof AggregateError);
    assert.match(rejection.message, /immediate|cleanup failed/i);
    assert.equal(unrefCalls, 0);
    assert.equal(existsSync(paths.backendPid), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("metadata publish failure unreferences only after publication and cleanup-safe checks", async () => {
  const root = tempRoot();
  const paths = runtime.runtimePaths(root, "restart");
  const child = new EventEmitter();
  child.pid = 7744;
  child.exitCode = null;
  child.signalCode = null;
  const events = [];
  child.unref = () => events.push("unref");
  try {
    await assert.rejects(
      runtime.startSupervisor(
        {
          rootDir: root,
          target: "backend",
          mode: "restart",
          logFile: paths.backendLog,
          pidFile: paths.backendPid,
          env: {},
          runToken: RUN_TOKEN,
          scriptPath,
        },
        {
          spawnImpl() {
            setImmediate(() => child.emit("spawn"));
            return child;
          },
          atomicWriteFileImpl() {
            events.push("publish");
            throw new Error("publish denied");
          },
          terminateOwnedTreeImpl: async () => {
            events.push("cleanup");
          },
        },
      ),
      /publish denied/,
    );
    assert.deepEqual(events, ["publish", "cleanup"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("readiness uses one absolute deadline with bounded requests", async () => {
  let now = 1_000;
  const requestTimeouts = [];
  await assert.rejects(
    runtime.waitForHttp(
      {
        url: "http://127.0.0.1:1/health",
        label: "Fixture",
        deadlineAt: 2_000,
        supervisorPid: 7788,
      },
      {
        nowImpl: () => now,
        isProcessRunningImpl: () => true,
        requestImpl: async (_url, timeoutMs) => {
          requestTimeouts.push(timeoutMs);
          now += timeoutMs;
          throw new Error("not ready");
        },
        waitImpl: async (ms) => {
          now += ms;
        },
        perRequestTimeoutMs: 700,
        retryDelayMs: 250,
      },
    ),
    /did not become ready/,
  );
  assert.ok(now <= 2_000);
  assert.ok(requestTimeouts.every((timeout) => timeout > 0 && timeout <= 700));
  assert.equal(requestTimeouts.at(-1) <= 300, true);
});

test("readiness stops immediately when its owned supervisor exits", async () => {
  let requests = 0;
  await assert.rejects(
    runtime.waitForHttp(
      {
        url: "http://127.0.0.1:1/health",
        label: "Backend",
        deadlineAt: Date.now() + 10_000,
        supervisorPid: 9911,
      },
      {
        isProcessRunningImpl: () => false,
        requestImpl: async () => {
          requests += 1;
          return true;
        },
      },
    ),
    /supervisor.*exited/i,
  );
  assert.equal(requests, 0);
});

test("HTTP readiness cancels every response body", async () => {
  assert.equal(typeof runtime.requestHttp, "function");
  for (const ok of [true, false]) {
    let cancelCalls = 0;
    const result = await runtime.requestHttp(
      "http://127.0.0.1:1/health",
      100,
      undefined,
      {
        fetchImpl: async () => ({
          ok,
          body: {
            async cancel() {
              cancelCalls += 1;
            },
          },
        }),
      },
    );
    assert.equal(result, ok);
    assert.equal(cancelCalls, 1);
  }
});

test("bounded log tails include the path and newest diagnostics only", () => {
  const root = tempRoot();
  const logFile = join(root, "backend.log");
  try {
    writeFileSync(
      logFile,
      "old-secret-marker\n" + "x".repeat(500) + "\ntoken=do-not-print newest failure\n",
      "utf8",
    );
    const output = runtime.formatLogTail(logFile, 128);
    assert.match(output, /backend\.log/);
    assert.match(output, /newest failure/);
    assert.doesNotMatch(output, /old-secret-marker/);
    assert.doesNotMatch(output, /do-not-print/);
    assert.match(output, /token=\[REDACTED\]/);
    assert.ok(Buffer.byteLength(output) < 512);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("partial backend startup rolls back only the current attempt", async () => {
  const root = tempRoot();
  const started = [];
  const rolledBack = [];
  try {
    await assert.rejects(
      runtime.refresh("restart", {
        rootDir: root,
        env: {},
        stopManagedProcessImpl: async () => ({ status: "missing" }),
        portIsFreeImpl: async () => true,
        findFreePortImpl: async (port) => port,
        startSupervisorImpl: async (options) => {
          const record = { ...options, pid: 6001 };
          started.push(record);
          return record;
        },
        waitForHttpImpl: async () => {
          throw new Error("backend readiness timeout");
        },
        stopStartedSupervisorImpl: async (record) => {
          rolledBack.push(record.target);
        },
      }),
      /backend readiness timeout/,
    );
    assert.deepEqual(started.map((entry) => entry.target), ["backend"]);
    assert.deepEqual(rolledBack, ["backend"]);
    assert.equal(existsSync(runtime.runtimePaths(root, "restart").envFile), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("unrelated root HTTP cannot satisfy readiness without frontend proxy health", async () => {
  const root = tempRoot();
  const urls = [];
  const rolledBack = [];
  try {
    await assert.rejects(
      runtime.refresh("restart", {
        rootDir: root,
        env: {},
        stopManagedProcessImpl: async () => ({ status: "missing" }),
        portIsFreeImpl: async () => true,
        findFreePortImpl: async (port) => port,
        startSupervisorImpl: async (options) => ({ ...options, pid: options.target === "backend" ? 6101 : 6102 }),
        waitForHttpImpl: async ({ url }) => {
          urls.push(url);
          if (urls.length === 3) throw new Error("proxy health rejected");
        },
        stopStartedSupervisorImpl: async (record) => rolledBack.push(record.target),
      }),
      /proxy health rejected/,
    );
    assert.deepEqual(urls, [
      "http://127.0.0.1:3761/api/auth/status",
      "http://127.0.0.1:5176/",
      "http://127.0.0.1:5176/api/auth/status",
    ]);
    assert.deepEqual(rolledBack, ["frontend", "backend"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("SIGINT during startup aborts readiness and rolls back before listeners are removed", async () => {
  const root = tempRoot();
  const signalEmitter = new EventEmitter();
  const rolledBack = [];
  let readinessStarted = false;
  try {
    const refreshing = runtime.refresh("restart", {
      rootDir: root,
      env: {},
      signalEmitter,
      stopManagedProcessImpl: async () => ({ status: "missing" }),
      portIsFreeImpl: async () => true,
      findFreePortImpl: async (port) => port,
      startSupervisorImpl: async (options) => ({ ...options, pid: 6201 }),
      waitForHttpImpl: ({ signal }) => {
        readinessStarted = true;
        return new Promise((resolveWait, rejectWait) => {
          signal.addEventListener("abort", () => rejectWait(signal.reason), { once: true });
        });
      },
      stopStartedSupervisorImpl: async (record) => rolledBack.push(record.target),
    });
    await waitFor(() => readinessStarted && signalEmitter.listenerCount("SIGINT") === 1);
    signalEmitter.emit("SIGINT");
    await assert.rejects(refreshing, /SIGINT/);
    assert.deepEqual(rolledBack, ["backend"]);
    assert.equal(signalEmitter.listenerCount("SIGINT"), 0);
    assert.equal(signalEmitter.listenerCount("SIGTERM"), 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("fresh builds once, uses standalone backend semantics, and writes compatible env keys", async () => {
  const root = tempRoot();
  const builds = [];
  const starts = [];
  try {
    const result = await runtime.refresh("fresh", {
      rootDir: root,
      env: {},
      stopManagedProcessImpl: async () => ({ status: "missing" }),
      portIsFreeImpl: async () => true,
      runBuildImpl: async (options) => builds.push(options),
      startSupervisorImpl: async (options) => {
        starts.push(options);
        return { ...options, pid: options.target === "backend" ? 6301 : 6302 };
      },
      waitForHttpImpl: async () => {},
    });
    assert.equal(builds.length, 1);
    assert.equal(result.backendPort, 3761);
    assert.equal(result.frontendPort, 5177);
    assert.deepEqual(starts.map((entry) => [entry.target, entry.mode]), [
      ["backend", "fresh"],
      ["frontend", "fresh"],
    ]);
    const envText = readFileSync(runtime.runtimePaths(root, "fresh").envFile, "utf8");
    for (const key of [
      "TRACEVANE_API_PORT=3761",
      "TRACEVANE_WEB_PORT=5177",
      "TRACEVANE_WEB_URL=http://127.0.0.1:5177",
      "TRACEVANE_API_URL=http://127.0.0.1:3761",
      "BACKEND_PID=6301",
      "FRONTEND_PID=6302",
    ]) {
      assert.match(envText, new RegExp(key));
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("restart and fresh preserve their default port contracts", () => {
  assert.deepEqual(runtime.modeConfig("restart", {}), {
    requestedBackendPort: 3761,
    frontendPort: 5176,
    allowBackendFallback: false,
  });
  assert.deepEqual(runtime.modeConfig("fresh", {}), {
    requestedBackendPort: 3761,
    frontendPort: 5177,
    allowBackendFallback: false,
  });
});

test("restart takeover stops owned runtimes across the main workspace and sibling worktrees", async () => {
  const mainRoot = tempRoot();
  const currentRoot = join(mainRoot, ".worktrees", "current");
  const siblingRoot = join(mainRoot, ".worktrees", "sibling");
  mkdirSync(currentRoot, { recursive: true });
  mkdirSync(siblingRoot, { recursive: true });
  const calls = [];
  try {
    const roots = runtime.knownWorkspaceRoots(currentRoot);
    assert.deepEqual(roots, [resolve(mainRoot), resolve(currentRoot), resolve(siblingRoot)]);
    await runtime.stopKnownWorkspaceRuntimes(currentRoot, {
      stopManagedProcessImpl: async (expected) => {
        calls.push([expected.resolvedRoot, expected.mode, expected.target]);
        return { status: "missing" };
      },
    });
    assert.equal(calls.length, 12);
    for (const root of roots) {
      for (const mode of ["restart", "fresh"]) {
        for (const target of ["frontend", "backend"]) {
          assert.ok(calls.some((entry) => entry[0] === root && entry[1] === mode && entry[2] === target));
        }
      }
    }
  } finally {
    rmSync(mainRoot, { recursive: true, force: true });
  }
});

test("npm and supervisor arguments preserve CJK, spaces, and port tokens without a shell", () => {
  const root = resolve("C:/工作区/Tracevane 路径 & more");
  const npmCli = resolve("C:/Node 工具/npm cli.js");
  const invocation = runtime.createNpmInvocation(
    ["run", "dev", "--workspace=apps/web", "--", "--port", "5176"],
    {
      env: { npm_execpath: npmCli },
      execPath: resolve("C:/Node 工具/node.exe"),
      platform: "win32",
    },
  );
  assert.equal(invocation.command, resolve("C:/Node 工具/node.exe"));
  assert.deepEqual(invocation.args, [
    npmCli,
    "run",
    "dev",
    "--workspace=apps/web",
    "--",
    "--port",
    "5176",
  ]);
  assert.notEqual(invocation.options?.shell, true);

  const freshBackend = runtime.supervisorCommand({
    target: "backend",
    mode: "fresh",
    rootDir: root,
    env: { TRACEVANE_API_PORT: "3761" },
  });
  assert.equal(freshBackend.command, process.execPath);
  assert.deepEqual(freshBackend.args, [join(root, "scripts", "start-standalone-api.mjs")]);
  assert.notEqual(freshBackend.options?.shell, true);
});

test("strict CLI rejects missing, extra, unknown, bad ports, bad tokens, and escaped log paths", () => {
  const root = tempRoot("tracevane cli 路径-");
  const validLog = runtime.runtimePaths(root, "restart").backendLog;
  try {
    for (const [argv, env] of [
      [[], {}],
      [["unknown"], {}],
      [["restart", "extra"], {}],
      [["fresh", "extra"], {}],
      [["stop", "extra"], {}],
      [["restart"], { TRACEVANE_API_PORT: "0" }],
      [["restart"], { TRACEVANE_WEB_PORT: "5176x" }],
      [["supervise", "backend", "restart", validLog, "short"], {}],
      [["supervise", "backend", "restart", resolve(root, "..", "escape.log"), RUN_TOKEN], {}],
      [["supervise", "other", "restart", validLog, RUN_TOKEN], {}],
    ]) {
      assert.throws(
        () => runtime.parseCli(argv, { env, rootDir: root }),
        (error) => error?.exitCode === 2,
        argv.join(" "),
      );
    }

    assert.deepEqual(runtime.parseCli(["restart"], { env: {}, rootDir: root }), {
      command: "restart",
      mode: "restart",
    });
    assert.deepEqual(runtime.parseCli(["fresh"], { env: {}, rootDir: root }), {
      command: "fresh",
      mode: "fresh",
    });
    assert.deepEqual(runtime.parseCli(["stop"], { env: {}, rootDir: root }), {
      command: "stop",
    });
    assert.deepEqual(
      runtime.parseCli(["supervise", "backend", "restart", validLog, RUN_TOKEN], {
        env: {},
        rootDir: root,
      }),
      {
        command: "supervise",
        target: "backend",
        mode: "restart",
        logFile: validLog,
        runToken: RUN_TOKEN,
      },
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("CLI usage failures exit 2 before any runtime mutation", () => {
  const cases = [
    [],
    ["unknown"],
    ["restart", "extra"],
    ["stop", "extra"],
  ];
  for (const args of cases) {
    const result = spawnSync(process.execPath, [scriptPath, ...args], {
      cwd: repoRoot,
      encoding: "utf8",
      env: { ...process.env, TRACEVANE_WEB_PORT: "not-a-port" },
      timeout: 5_000,
      windowsHide: true,
    });
    assert.equal(result.status, 2, args.join(" "));
    assert.match(result.stderr, /Usage:|Unknown command|unexpected/i);
  }
});

test("mismatched metadata cannot kill a live unrelated fixture", async () => {
  const root = tempRoot();
  const pidFile = join(root, "backend.pid");
  const fixture = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  fixture.unref();
  try {
    await new Promise((resolveSpawn, rejectSpawn) => {
      fixture.once("spawn", resolveSpawn);
      fixture.once("error", rejectSpawn);
    });
    writeMetadata(pidFile, metadata({
      pid: fixture.pid,
      resolvedRoot: resolve(root, "different-checkout"),
    }));
    const result = await runtime.stopManagedProcess({
      pidFile,
      target: "backend",
      mode: "restart",
      resolvedRoot: resolve(root),
    });
    assert.equal(result.status, "stale");
    assert.equal(processIsAlive(fixture.pid), true);
  } finally {
    await cleanupOwnedTree(fixture.pid);
    rmSync(root, { recursive: true, force: true });
  }
});

test("native exact-tree stop removes both an owned supervisor and its descendant", async () => {
  const root = tempRoot();
  const childPidFile = join(root, "child.pid");
  const pidFile = join(root, "backend.pid");
  const parentSource = [
    "const { spawn } = require('node:child_process');",
    "const fs = require('node:fs');",
    "const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });",
    "fs.writeFileSync(process.argv[1], String(child.pid));",
    "setInterval(() => {}, 1000);",
  ].join("\n");
  const parent = spawn(process.execPath, ["-e", parentSource, childPidFile], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  parent.unref();
  let childPid;
  try {
    await new Promise((resolveSpawn, rejectSpawn) => {
      parent.once("spawn", resolveSpawn);
      parent.once("error", rejectSpawn);
    });
    await waitFor(() => existsSync(childPidFile));
    childPid = Number(readFileSync(childPidFile, "utf8"));
    assert.equal(processIsAlive(parent.pid), true);
    assert.equal(processIsAlive(childPid), true);
    writeMetadata(pidFile, metadata({ pid: parent.pid, resolvedRoot: resolve(root) }));
    const stopped = await runtime.stopManagedProcess({
      pidFile,
      target: "backend",
      mode: "restart",
      resolvedRoot: resolve(root),
    });
    assert.equal(stopped.status, "stopped");
    await waitForExit(parent.pid);
    await waitForExit(childPid);
    assert.equal(existsSync(pidFile), false);
  } finally {
    await cleanupOwnedTree(parent.pid);
    if (childPid && processIsAlive(childPid)) await cleanupOwnedTree(childPid);
    rmSync(root, { recursive: true, force: true });
  }
});

test(
  "native POSIX stop removes a descendant after the group leader already exited",
  { skip: process.platform === "win32" ? "native POSIX process groups only" : false },
  async () => {
    const root = tempRoot();
    const childPidFile = join(root, "orphan-child.pid");
    const pidFile = join(root, "backend.pid");
    const leaderSource = [
      "const { spawn } = require('node:child_process');",
      "const fs = require('node:fs');",
      "const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });",
      "fs.writeFileSync(process.argv[1], String(child.pid));",
      "child.unref();",
    ].join("\n");
    const leader = spawn(process.execPath, ["-e", leaderSource, childPidFile], {
      detached: true,
      stdio: "ignore",
    });
    let childPid;
    try {
      const leaderClosed = new Promise((resolveClose, rejectClose) => {
        leader.once("close", resolveClose);
        leader.once("error", rejectClose);
      });
      await waitFor(() => existsSync(childPidFile));
      childPid = Number(readFileSync(childPidFile, "utf8"));
      await leaderClosed;
      assert.equal(processIsAlive(leader.pid), false);
      assert.equal(processIsAlive(childPid), true);
      writeMetadata(pidFile, metadata({
        pid: leader.pid,
        resolvedRoot: resolve(root),
      }));
      const stopped = await runtime.stopManagedProcess({
        pidFile,
        target: "backend",
        mode: "restart",
        resolvedRoot: resolve(root),
      });
      assert.equal(stopped.status, "stopped");
      await waitForExit(childPid);
    } finally {
      if (childPid && processIsAlive(childPid)) await cleanupOwnedTree(childPid);
      rmSync(root, { recursive: true, force: true });
    }
  },
);

test("supervisor detaches POSIX workers, suppresses restart, and waits for close before exit", async () => {
  assert.equal(runtime.runSupervisor.length, 2);
  const root = tempRoot();
  const logFile = join(root, "worker.log");
  const signalEmitter = new EventEmitter();
  const child = new EventEmitter();
  child.pid = 8877;
  child.exitCode = null;
  child.signalCode = null;
  const spawnOptions = [];
  const terminated = [];
  const timers = [];
  let settled = false;
  try {
    const running = runtime.runSupervisor(
      {
        target: "backend",
        mode: "restart",
        logFile,
        runToken: RUN_TOKEN,
        rootDir: root,
        env: { npm_execpath: resolve("C:/Node/npm-cli.js") },
      },
      {
        platform: "linux",
        signalEmitter,
        spawnImpl(_command, _args, options) {
          spawnOptions.push(options);
          setImmediate(() => child.emit("spawn"));
          return child;
        },
        terminateOwnedTreeImpl: async (pid, options) => {
          terminated.push([pid, options]);
        },
        setTimeoutImpl(callback, delay) {
          timers.push([callback, delay]);
          return { callback, delay };
        },
        clearTimeoutImpl() {},
        setExitCodeImpl() {},
      },
    ).finally(() => {
      settled = true;
    });
    await waitFor(() => spawnOptions.length === 1);
    assert.equal(spawnOptions[0].detached, true);
    signalEmitter.emit("SIGTERM");
    await waitFor(() => terminated.length === 1);
    await new Promise((resolveImmediate) => setImmediate(resolveImmediate));
    assert.equal(settled, false);
    assert.equal(timers.length, 0);
    child.exitCode = 0;
    child.emit("close", 0, null);
    await running;
    assert.equal(settled, true);
    assert.equal(timers.length, 0);
    assert.equal(terminated[0][0], 8877);
    assert.equal(terminated[0][1]?.platform, "linux");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("native supervisor stop reaps its worker and descendant tree", async () => {
  const root = tempRoot();
  const logFile = join(root, "worker.log");
  const fixtureFile = join(root, "npm-fixture.mjs");
  const pidsFile = join(root, "worker-pids.json");
  const signalEmitter = new EventEmitter();
  writeFileSync(
    fixtureFile,
    [
      "import { spawn } from 'node:child_process';",
      "import { writeFileSync } from 'node:fs';",
      "const descendant = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });",
      "writeFileSync(process.env.DEV_RUNTIME_WORKER_PIDS, JSON.stringify({ worker: process.pid, descendant: descendant.pid }));",
      "setInterval(() => {}, 1000);",
    ].join("\n"),
    "utf8",
  );
  let pids;
  try {
    const running = runtime.runSupervisor(
      {
        target: "backend",
        mode: "restart",
        logFile,
        runToken: RUN_TOKEN,
        rootDir: root,
        env: {
          ...process.env,
          npm_execpath: fixtureFile,
          DEV_RUNTIME_WORKER_PIDS: pidsFile,
        },
      },
      { signalEmitter },
    );
    await waitFor(() => existsSync(pidsFile));
    pids = JSON.parse(readFileSync(pidsFile, "utf8"));
    assert.equal(processIsAlive(pids.worker), true);
    assert.equal(processIsAlive(pids.descendant), true);
    signalEmitter.emit("SIGTERM");
    await running;
    await waitForExit(pids.worker);
    await waitForExit(pids.descendant);
  } finally {
    if (pids?.worker && processIsAlive(pids.worker)) await cleanupOwnedTree(pids.worker);
    if (pids?.descendant && processIsAlive(pids.descendant)) await cleanupOwnedTree(pids.descendant);
    rmSync(root, { recursive: true, force: true });
  }
});

test("supervisor keeps Windows workers in the taskkill child tree", async () => {
  const root = tempRoot();
  const logFile = join(root, "worker.log");
  const signalEmitter = new EventEmitter();
  const child = new EventEmitter();
  child.pid = 8899;
  child.exitCode = null;
  child.signalCode = null;
  let spawnOptions;
  let terminateOptions;
  try {
    const running = runtime.runSupervisor(
      {
        target: "backend",
        mode: "restart",
        logFile,
        runToken: RUN_TOKEN,
        rootDir: root,
        env: { npm_execpath: resolve("C:/Node/npm-cli.js") },
      },
      {
        platform: "win32",
        signalEmitter,
        spawnImpl(_command, _args, options) {
          spawnOptions = options;
          setImmediate(() => child.emit("spawn"));
          return child;
        },
        terminateOwnedTreeImpl: async (_pid, options) => {
          terminateOptions = options;
        },
        setExitCodeImpl() {},
      },
    );
    await waitFor(() => spawnOptions);
    assert.equal(spawnOptions.detached, false);
    signalEmitter.emit("SIGTERM");
    await waitFor(() => terminateOptions);
    assert.equal(terminateOptions.platform, "win32");
    child.exitCode = 0;
    child.emit("close", 0, null);
    await running;
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Node launcher is the sole dev restart/fresh authority", () => {
  const pkg = JSON.parse(readFileSync(resolve("package.json"), "utf8"));
  assert.equal(pkg.scripts["dev:restart"], "node scripts/dev-runtime.mjs restart");
  assert.equal(pkg.scripts["dev:fresh"], "node scripts/dev-runtime.mjs fresh");
  assert.equal(existsSync(resolve("scripts/restart-dev.sh")), false);
  assert.equal(existsSync(resolve("scripts/dev-fresh.sh")), false);
  assert.doesNotMatch(scriptSource, /pgrep|lsof|fuser|\/IM|shell:\s*true/);
});
