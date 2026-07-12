import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  GROUPS,
  createMatrixInvocation,
  main,
  resolveRcWebPort,
  runMatrixCommand,
  runOwnedInvocation,
  selectedCommands,
} from "../../scripts/ide-rc-matrix.mjs";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const RUNNER = path.join(ROOT_DIR, "scripts", "ide-rc-matrix.mjs");

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test("resolveRcWebPort never reuses a port already assigned in the matrix", async () => {
  const port = await resolveRcWebPort(5310, new Set([5310]));
  assert.notEqual(port, "5310");
});

function createLogger() {
  const logs = [];
  const errors = [];
  return {
    errors,
    logger: {
      error: (message) => errors.push(String(message)),
      log: (message) => logs.push(String(message)),
    },
    logs,
  };
}

function fakeChild(pid = 42_424) {
  const child = new EventEmitter();
  child.pid = pid;
  child.exitCode = null;
  child.signalCode = null;
  return child;
}

function processIsAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error?.code === "ESRCH") return false;
    if (error?.code === "EPERM") return true;
    throw error;
  }
}

async function waitForFile(file, timeoutMs = 3_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (existsSync(file)) return;
    await delay(20);
  }
  assert.equal(existsSync(file), true, `expected fixture file ${file}`);
}

async function waitForProcessExit(pid, timeoutMs = 3_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!processIsAlive(pid)) return;
    await delay(20);
  }
  assert.equal(processIsAlive(pid), false, `process ${pid} should have exited`);
}

async function removeFixtureDirectory(directory) {
  const deadline = Date.now() + 3_000;
  while (true) {
    try {
      rmSync(directory, { force: true, recursive: true });
      return;
    } catch (error) {
      const transient = ["EBUSY", "ENOTEMPTY", "EPERM"].includes(error?.code);
      if (!transient || Date.now() >= deadline) throw error;
      await delay(25);
    }
  }
}

function writeProcessTreeFixture(directory, label) {
  const parentPidFile = path.join(directory, `${label}-parent.pid`);
  const childPidFile = path.join(directory, `${label}-child.pid`);
  const childScript = path.join(directory, `${label} child.mjs`);
  const parentScript = path.join(directory, `${label} parent.mjs`);
  writeFileSync(childScript, "setInterval(() => {}, 1_000);\n", "utf8");
  writeFileSync(
    parentScript,
    `
      import { spawn } from "node:child_process";
      import { writeFileSync } from "node:fs";
      writeFileSync(${JSON.stringify(parentPidFile)}, String(process.pid), "utf8");
      const child = spawn(process.execPath, [${JSON.stringify(childScript)}], {
        shell: false,
        stdio: "ignore",
        windowsHide: true,
      });
      writeFileSync(${JSON.stringify(childPidFile)}, String(child.pid), "utf8");
      setInterval(() => {}, 1_000);
    `,
    "utf8",
  );
  return { childPidFile, parentPidFile, parentScript };
}

test("createMatrixInvocation keeps Windows CJK/space npm paths and every token intact", () => {
  const npmCli = "C:\\工具 目录\\npm-cli.js";
  const execPath = "C:\\Program Files\\nodejs\\node.exe";
  assert.deepEqual(
    createMatrixInvocation("typecheck:api -- --pretty false", {
      env: { npm_execpath: npmCli },
      execPath,
      platform: "win32",
    }),
    {
      args: [npmCli, "run", "typecheck:api", "--", "--pretty", "false"],
      command: execPath,
      options: { shell: false },
    },
  );
  assert.deepEqual(createMatrixInvocation(":git-diff-check"), {
    args: ["diff", "--check"],
    command: "git",
    options: { shell: false },
  });
});

test("runOwnedInvocation always spawns exact tokens with shell disabled", async () => {
  const child = fakeChild();
  const signalEmitter = new EventEmitter();
  let captured;
  const resultPromise = runOwnedInvocation(
    {
      args: ["C:\\工具 目录\\npm-cli.js", "run", "脚本", "参数 含 空格"],
      command: "C:\\Program Files\\nodejs\\node.exe",
      options: { shell: true },
    },
    {
      signalEmitter,
      spawnImpl: (command, args, options) => {
        captured = { args, command, options };
        queueMicrotask(() => child.emit("close", 0, null));
        return child;
      },
      timeoutMs: 1_000,
    },
  );

  assert.deepEqual(await resultPromise, { code: 0, signal: null });
  assert.equal(captured.options.shell, false);
  assert.equal(captured.command, "C:\\Program Files\\nodejs\\node.exe");
  assert.deepEqual(captured.args, [
    "C:\\工具 目录\\npm-cli.js",
    "run",
    "脚本",
    "参数 含 空格",
  ]);
  assert.equal(signalEmitter.listenerCount("SIGINT"), 0);
  assert.equal(signalEmitter.listenerCount("SIGTERM"), 0);
});

test("runOwnedInvocation does not resolve a timeout until owned cleanup completes", async () => {
  const child = fakeChild();
  const signalEmitter = new EventEmitter();
  let cleanupComplete = false;
  const startedAt = Date.now();
  const result = await runOwnedInvocation(
    { args: [], command: process.execPath, options: { shell: false } },
    {
      signalEmitter,
      spawnImpl: () => child,
      stopOwnedProcessImpl: async (ownedChild) => {
        assert.equal(ownedChild, child);
        await delay(40);
        cleanupComplete = true;
      },
      timeoutMs: 10,
    },
  );

  assert.equal(cleanupComplete, true);
  assert.ok(Date.now() - startedAt >= 40);
  assert.deepEqual(result, { code: 124, signal: "TIMEOUT", timedOut: true });
  assert.equal(signalEmitter.listenerCount("SIGINT"), 0);
  assert.equal(signalEmitter.listenerCount("SIGTERM"), 0);
});

test("runOwnedInvocation reports a synchronous owned-cleanup failure", async () => {
  const cleanupError = new Error("cleanup failed");
  const result = await runOwnedInvocation(
    { args: [], command: process.execPath, options: { shell: false } },
    {
      signalEmitter: new EventEmitter(),
      spawnImpl: () => fakeChild(),
      stopOwnedProcessImpl: () => {
        throw cleanupError;
      },
      timeoutMs: 10,
    },
  );

  assert.deepEqual(result, {
    cleanupError,
    code: 124,
    signal: "TIMEOUT",
    timedOut: true,
  });
});

test("runOwnedInvocation bounds a cleanup helper that never settles", async () => {
  const startedAt = Date.now();
  const result = await runOwnedInvocation(
    { args: [], command: process.execPath, options: { shell: false } },
    {
      cleanupTimeoutMs: 25,
      signalEmitter: new EventEmitter(),
      spawnImpl: () => fakeChild(),
      stopOwnedProcessImpl: () => new Promise(() => {}),
      timeoutMs: 10,
    },
  );

  assert.equal(result.code, 124);
  assert.equal(result.timedOut, true);
  assert.match(result.cleanupError?.message ?? "", /cleanup timed out after 25ms/);
  assert.ok(Date.now() - startedAt < 1_000);
});

test("runOwnedInvocation maps interrupt exit codes only after owned cleanup", async () => {
  const child = fakeChild();
  const signalEmitter = new EventEmitter();
  let cleanupComplete = false;
  const resultPromise = runOwnedInvocation(
    { args: [], command: process.execPath, options: { shell: false } },
    {
      signalEmitter,
      spawnImpl: () => child,
      stopOwnedProcessImpl: async () => {
        await delay(25);
        cleanupComplete = true;
      },
      timeoutMs: 1_000,
    },
  );
  signalEmitter.emit("SIGTERM");

  const result = await resultPromise;
  assert.equal(cleanupComplete, true);
  assert.deepEqual(result, {
    code: 143,
    interrupted: true,
    signal: "SIGTERM",
  });
});

test("timeout stops a real owned parent and descendant process tree", async (t) => {
  const directory = mkdtempSync(path.join(tmpdir(), "tracevane rc 超时 含 空格 "));
  t.after(() => removeFixtureDirectory(directory));
  const fixture = writeProcessTreeFixture(directory, "timeout");

  const result = await runOwnedInvocation(
    { args: [fixture.parentScript], command: process.execPath, options: { shell: false } },
    { cwd: directory, timeoutMs: 500 },
  );
  assert.deepEqual(result, { code: 124, signal: "TIMEOUT", timedOut: true });
  await waitForFile(fixture.parentPidFile);
  await waitForFile(fixture.childPidFile);
  const parentPid = Number(readFileSync(fixture.parentPidFile, "utf8"));
  const childPid = Number(readFileSync(fixture.childPidFile, "utf8"));
  await waitForProcessExit(parentPid);
  await waitForProcessExit(childPid);
});

test("interrupt stops a real owned parent and descendant process tree", async (t) => {
  const directory = mkdtempSync(path.join(tmpdir(), "tracevane rc 中断 含 空格 "));
  t.after(() => removeFixtureDirectory(directory));
  const fixture = writeProcessTreeFixture(directory, "interrupt");
  const signalEmitter = new EventEmitter();

  const resultPromise = runOwnedInvocation(
    { args: [fixture.parentScript], command: process.execPath, options: { shell: false } },
    { cwd: directory, signalEmitter, timeoutMs: 5_000 },
  );
  await waitForFile(fixture.parentPidFile);
  await waitForFile(fixture.childPidFile);
  const parentPid = Number(readFileSync(fixture.parentPidFile, "utf8"));
  const childPid = Number(readFileSync(fixture.childPidFile, "utf8"));
  signalEmitter.emit("SIGINT");

  assert.deepEqual(await resultPromise, {
    code: 130,
    interrupted: true,
    signal: "SIGINT",
  });
  await waitForProcessExit(parentPid);
  await waitForProcessExit(childPid);
});

test("runMatrixCommand assigns the RC web port without synthesizing a smoke URL", async () => {
  let captured;
  const { logger } = createLogger();
  const result = await runMatrixCommand("smoke:ide:debug-foundation", {
    cwd: ROOT_DIR,
    env: { npm_execpath: "C:\\工具 目录\\npm-cli.js" },
    logger,
    rcWebPort: "6310",
    runOwnedInvocationImpl: async (invocation, options) => {
      captured = { invocation, options };
      return { code: 0, signal: null };
    },
  });

  assert.equal(result.code, 0);
  assert.equal(captured.options.env.TRACEVANE_WEB_PORT, "6310");
  assert.equal(
    Object.prototype.hasOwnProperty.call(captured.options.env, "TRACEVANE_WEB_SMOKE_URL"),
    false,
  );
  assert.equal(captured.invocation.options.shell, false);
});

test("matrix selection preserves quick, full, and every domain contract", () => {
  assert.deepEqual(selectedCommands([]), selectedCommands(["--quick"]));
  assert.deepEqual(selectedCommands(["--domain=debug"]), GROUPS.debug);
  assert.deepEqual(selectedCommands(["--full"]), [
    "typecheck:api -- --pretty false",
    "typecheck:web -- --pretty false",
    ...Object.values(GROUPS).flat(),
    ":git-diff-check",
  ]);
  assert.throws(() => selectedCommands(["--domain=unknown"]), /Unknown domain/);
});

test("main preserves list/dry-run output and continue-on-error behavior", async () => {
  const dry = createLogger();
  assert.equal(
    await main(["--domain=debug", "--dry-run"], { logger: dry.logger }),
    0,
  );
  assert.deepEqual(
    dry.logs,
    GROUPS.debug.map((command) => `npm run ${command}`),
  );

  const continued = createLogger();
  const continuedCommands = [];
  const continuedPorts = [];
  assert.equal(
    await main(["--domain=searchProblemsOutput", "--continue-on-error"], {
      env: {},
      logger: continued.logger,
      resolveRcWebPortImpl: async (port) => String(port),
      runMatrixCommandImpl: async (command, options) => {
        continuedCommands.push(command);
        continuedPorts.push(options.rcWebPort);
        return { command, code: continuedCommands.length === 1 ? 7 : 0 };
      },
    }),
    1,
  );
  assert.deepEqual(continuedCommands, GROUPS.searchProblemsOutput);
  assert.deepEqual(continuedPorts, ["5310", "5311", "5312"]);

  const cleanupFailedCommands = [];
  assert.equal(
    await main(["--domain=searchProblemsOutput", "--continue-on-error"], {
      env: {},
      logger: createLogger().logger,
      runMatrixCommandImpl: async (command) => {
        cleanupFailedCommands.push(command);
        return { command, code: 124, cleanupError: new Error("cleanup unconfirmed") };
      },
    }),
    1,
  );
  assert.deepEqual(cleanupFailedCommands, [GROUPS.searchProblemsOutput[0]]);
});

test("main gives RC port precedence and preserves interrupt exit status", async () => {
  const { logger } = createLogger();
  let capturedOptions;
  const exitCode = await main(["--domain=fileSurface"], {
    env: {
      TRACEVANE_RC_WEB_PORT: "6310",
      TRACEVANE_WEB_PORT: "5310",
    },
    logger,
    resolveRcWebPortImpl: async (port) => String(port),
    runMatrixCommandImpl: async (command, options) => {
      capturedOptions = options;
      return {
        code: 143,
        command,
        interrupted: true,
        signal: "SIGTERM",
      };
    },
  });
  assert.equal(capturedOptions.rcWebPort, "6310");
  assert.equal(exitCode, 143);
});

test("RC matrix source contains no shell command execution or legacy URL special cases", () => {
  const source = readFileSync(RUNNER, "utf8");
  assert.match(source, /createNpmInvocation/);
  assert.match(source, /stopOwnedProcess/);
  assert.match(source, /shell:\s*false/);
  assert.doesNotMatch(source, /shell:\s*true/);
  assert.doesNotMatch(source, /SELF_STARTING_SMOKE_PREFIXES/);
  assert.doesNotMatch(source, /SCRIPT_DECLARED_WEB_PORT/);
  assert.doesNotMatch(source, /TRACEVANE_WEB_SMOKE_URL\s*:/);
});
