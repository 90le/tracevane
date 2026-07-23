import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";

import {
  stopOwnedProcess,
  waitForHttp,
  withServer,
} from "../../scripts/lib/with-server.mjs";

const harnessUrl = new URL("../../scripts/lib/with-server.mjs", import.meta.url).href;

let fixtureRoot;
let serverFixture;
let treeFixture;
let earlyExitTreeFixture;
let signalRunnerFixture;
let selfStopFixture;
let fixtureCounter = 0;

test.before(() => {
  fixtureRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "tracevane with-server 中文 "),
  );
  serverFixture = path.join(fixtureRoot, "HTTP server fixture.mjs");
  treeFixture = path.join(fixtureRoot, "process tree fixture.mjs");
  earlyExitTreeFixture = path.join(fixtureRoot, "early exit tree fixture.mjs");
  signalRunnerFixture = path.join(fixtureRoot, "signal runner fixture.mjs");
  selfStopFixture = path.join(fixtureRoot, "self stop server fixture.mjs");

  fs.writeFileSync(
    selfStopFixture,
    [
      'import http from "node:http";',
      "const port = Number(process.argv[2]);",
      "const server = http.createServer((request, response) => {",
      "  response.statusCode = 200;",
      "  response.end('ready');",
      "  if (request.url === '/stop') server.close(() => process.exit(0));",
      "});",
      "server.listen(port, '127.0.0.1');",
      "",
    ].join("\n"),
  );

  fs.writeFileSync(
    serverFixture,
    [
      'import fs from "node:fs";',
      'import http from "node:http";',
      "const [portText, statePath, token = ''] = process.argv.slice(2);",
      "const server = http.createServer((_request, response) => {",
      "  response.statusCode = 200;",
      "  response.end('ready');",
      "});",
      "server.listen(Number(portText), '127.0.0.1', () => {",
      "  fs.writeFileSync(statePath, JSON.stringify({",
      "    pid: process.pid,",
      "    token,",
      "    cwd: process.cwd(),",
      "    envValue: process.env.TRACEVANE_WITH_SERVER_TEST,",
      "  }));",
      "});",
      "const close = () => server.close(() => process.exit(0));",
      "process.on('SIGINT', close);",
      "process.on('SIGTERM', close);",
      "",
    ].join("\n"),
    "utf8",
  );

  fs.writeFileSync(
    treeFixture,
    [
      'import { spawn } from "node:child_process";',
      'import fs from "node:fs";',
      "const [serverPath, portText, serverStatePath, treeStatePath, token] = process.argv.slice(2);",
      "const child = spawn(process.execPath, [serverPath, portText, serverStatePath, token], {",
      "  stdio: 'inherit',",
      "  windowsHide: true,",
      "});",
      "fs.writeFileSync(treeStatePath, JSON.stringify({ pid: process.pid, childPid: child.pid }));",
      "setInterval(() => {}, 1_000);",
      "",
    ].join("\n"),
    "utf8",
  );

  fs.writeFileSync(
    earlyExitTreeFixture,
    [
      'import { spawn } from "node:child_process";',
      'import fs from "node:fs";',
      "const [serverPath, portText, serverStatePath, treeStatePath, token] = process.argv.slice(2);",
      "const child = spawn(process.execPath, [serverPath, portText, serverStatePath, token], {",
      "  detached: true,",
      "  stdio: 'ignore',",
      "  windowsHide: true,",
      "});",
      "child.unref();",
      "fs.writeFileSync(treeStatePath, JSON.stringify({ pid: process.pid, childPid: child.pid }));",
      "",
    ].join("\n"),
    "utf8",
  );

  fs.writeFileSync(
    signalRunnerFixture,
    [
      'import fs from "node:fs";',
      `import { withServer } from ${JSON.stringify(harnessUrl)};`,
      "const [serverPath, portText, serverStatePath, readyPath, brokenPath, requestedSignal = 'SIGINT'] = process.argv.slice(2);",
      "if (brokenPath) {",
      "  for (const key of Object.keys(process.env)) {",
      "    if (key.toLowerCase() === 'path') delete process.env[key];",
      "  }",
      "  process.env.PATH = brokenPath;",
      "}",
      "await withServer({",
      "  command: process.execPath,",
      "  args: [serverPath, portText, serverStatePath, 'signal-owned'],",
      "  url: `http://127.0.0.1:${portText}/ready`,",
      "  timeoutMs: 5_000,",
      "}, async () => {",
      "  fs.writeFileSync(readyPath, 'ready');",
      "  setTimeout(() => process.emit(requestedSignal), 50);",
      "  await new Promise(() => {});",
      "});",
      "",
    ].join("\n"),
    "utf8",
  );
});

test.after(async () => {
  if (fixtureRoot) {
    await fs.promises.rm(fixtureRoot, { force: true, recursive: true });
  }
});

function nextStatePath(label) {
  fixtureCounter += 1;
  return path.join(fixtureRoot, `${fixtureCounter}-${label}.json`);
}

async function getFreePort() {
  const server = http.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address();
  await closeServer(server);
  return port;
}

async function closeServer(server) {
  if (!server.listening) return;
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
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

async function waitFor(predicate, timeoutMs = 3_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await predicate();
    if (value) return value;
    await delay(20);
  }
  assert.fail("condition did not become true before timeout");
}

async function waitForProcessExit(pid, timeoutMs = 3_000) {
  await waitFor(() => !processIsAlive(pid), timeoutMs);
}

async function waitForUrlToStop(url) {
  await waitFor(async () => {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(200) });
      await response.body?.cancel();
      return false;
    } catch {
      return true;
    }
  });
}

async function readJsonWhenReady(statePath) {
  return waitFor(() => {
    try {
      return JSON.parse(fs.readFileSync(statePath, "utf8"));
    } catch {
      return false;
    }
  });
}

async function waitForChildExit(child, timeoutMs = 5_000) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return [child.exitCode, child.signalCode];
  }
  return new Promise((resolve, reject) => {
    const onError = (error) => {
      clearTimeout(timer);
      child.off("exit", onExit);
      reject(error);
    };
    const onExit = (code, signal) => {
      clearTimeout(timer);
      child.off("error", onError);
      resolve([code, signal]);
    };
    const timer = setTimeout(() => {
      child.off("error", onError);
      child.off("exit", onExit);
      reject(new Error(`child ${child.pid} did not exit before timeout`));
    }, timeoutMs);
    child.once("error", onError);
    child.once("exit", onExit);
  });
}

async function killExactWindowsTree(pid) {
  if (!processIsAlive(pid)) return;
  const killer = spawn(
    "taskkill.exe",
    ["/PID", String(pid), "/T", "/F"],
    { stdio: "ignore", windowsHide: true },
  );
  const [code] = await waitForChildExit(killer);
  assert.equal(code, 0, `failed to clean up Windows fixture tree ${pid}`);
  await waitForProcessExit(pid);
}

test("withServer starts, waits, invokes, and cleans up with tokenized arguments", async () => {
  const port = await getFreePort();
  const url = `http://127.0.0.1:${port}/ready`;
  const statePath = nextStatePath("lifecycle");
  const token = "argument with spaces & | ; 中文";
  let called = false;

  const result = await withServer(
    {
      command: process.execPath,
      args: [serverFixture, String(port), statePath, token],
      cwd: fixtureRoot,
      env: { TRACEVANE_WITH_SERVER_TEST: "environment value 环境" },
      url,
      timeoutMs: 5_000,
    },
    async () => {
      called = true;
      const response = await fetch(url);
      assert.equal(response.status, 200);
      assert.equal(await response.text(), "ready");
      const state = await readJsonWhenReady(statePath);
      assert.equal(state.token, token);
      assert.equal(state.cwd, fixtureRoot);
      assert.equal(state.envValue, "environment value 环境");
      return "callback-result";
    },
  );

  assert.equal(result, "callback-result");
  assert.equal(called, true);
  const { pid } = JSON.parse(fs.readFileSync(statePath, "utf8"));
  await waitForProcessExit(pid);
  await waitForUrlToStop(url);
});

test("withServer accepts a successful callback after the owned endpoint stops itself", async () => {
  const port = await getFreePort();
  const url = `http://127.0.0.1:${port}`;
  const result = await withServer(
    {
      command: process.execPath,
      args: [selfStopFixture, String(port)],
      url,
      timeoutMs: 5_000,
    },
    async () => {
      const response = await fetch(`${url}/stop`);
      assert.equal(await response.text(), "ready");
      await waitForUrlToStop(url);
      return "stopped-cleanly";
    },
  );
  assert.equal(result, "stopped-cleanly");
});

test("waitForHttp retries non-ready responses until the endpoint is ready", async (t) => {
  let attempts = 0;
  const server = http.createServer((_request, response) => {
    attempts += 1;
    response.statusCode = attempts < 3 ? 503 : 204;
    response.end();
  });
  t.after(() => closeServer(server));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();

  await waitForHttp(`http://127.0.0.1:${port}/health`, {
    intervalMs: 10,
    timeoutMs: 2_000,
  });

  assert.equal(attempts, 3);
});

test("waitForHttp releases a successful streaming response body", async (t) => {
  let responseClosed = false;
  const server = http.createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/plain" });
    response.write("ready");
    response.once("close", () => {
      responseClosed = true;
    });
  });
  t.after(async () => {
    server.closeAllConnections();
    await closeServer(server);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();

  await waitForHttp(`http://127.0.0.1:${port}/streaming-health`, {
    timeoutMs: 2_000,
  });

  await waitFor(() => responseClosed, 500);
});

test("waitForHttp rejects at its absolute timeout", async () => {
  const port = await getFreePort();
  const url = `http://127.0.0.1:${port}/never-ready`;
  const startedAt = Date.now();

  await assert.rejects(
    waitForHttp(url, { intervalMs: 20, timeoutMs: 150 }),
    (error) => {
      assert.match(error.message, /Timed out waiting for HTTP/);
      assert.match(error.message, new RegExp(String(port)));
      return true;
    },
  );

  const elapsedMs = Date.now() - startedAt;
  assert.ok(elapsedMs >= 100, `timeout fired too early after ${elapsedMs}ms`);
  assert.ok(elapsedMs < 1_500, `timeout fired too late after ${elapsedMs}ms`);
});

test("withServer rejects a startup spawn error without invoking the callback", async () => {
  const port = await getFreePort();
  let called = false;
  const startedAt = Date.now();

  await assert.rejects(
    withServer(
      {
        command: path.join(fixtureRoot, "missing executable.exe"),
        args: ["literal argument"],
        url: `http://127.0.0.1:${port}/ready`,
        timeoutMs: 5_000,
      },
      async () => {
        called = true;
      },
    ),
    /Failed to start server process/,
  );

  assert.equal(called, false);
  assert.ok(Date.now() - startedAt < 1_500, "spawn error was not reported promptly");
});

test("withServer rejects an early child exit without waiting for readiness timeout", async () => {
  const port = await getFreePort();
  const startedAt = Date.now();

  await assert.rejects(
    withServer(
      {
        command: process.execPath,
        args: ["-e", "process.exit(23)"],
        url: `http://127.0.0.1:${port}/ready`,
        timeoutMs: 10_000,
      },
      async () => assert.fail("callback must not run after an early exit"),
    ),
    /Server process exited before readiness \(code 23\)/,
  );

  assert.ok(Date.now() - startedAt < 5_000, "early exit and safe descendant cleanup were not reported promptly");
});

test("withServer cleans up its child after a readiness timeout", async () => {
  const port = await getFreePort();
  const statePath = nextStatePath("timeout");
  const script = [
    'const fs = require("node:fs");',
    "fs.writeFileSync(process.argv[1], String(process.pid));",
    "setInterval(() => {}, 1_000);",
  ].join("\n");

  await assert.rejects(
    withServer(
      {
        command: process.execPath,
        args: ["-e", script, statePath],
        url: `http://127.0.0.1:${port}/never-ready`,
        timeoutMs: 150,
      },
      async () => assert.fail("callback must not run after readiness timeout"),
    ),
    /Timed out waiting for HTTP/,
  );

  const pid = Number(fs.readFileSync(statePath, "utf8"));
  await waitForProcessExit(pid);
});

test("withServer preserves a callback failure and still cleans up", async () => {
  const port = await getFreePort();
  const url = `http://127.0.0.1:${port}/ready`;
  const statePath = nextStatePath("callback-failure");

  await assert.rejects(
    withServer(
      {
        command: process.execPath,
        args: [serverFixture, String(port), statePath, "callback"],
        url,
        timeoutMs: 5_000,
      },
      async () => {
        throw new Error("callback boom");
      },
    ),
    /callback boom/,
  );

  const { pid } = await readJsonWhenReady(statePath);
  await waitForProcessExit(pid);
  await waitForUrlToStop(url);
});

test("withServer preserves an undefined callback rejection", async () => {
  const port = await getFreePort();
  const statePath = nextStatePath("undefined-callback-failure");

  const outcome = await withServer(
    {
      command: process.execPath,
      args: [serverFixture, String(port), statePath, "undefined-callback"],
      url: `http://127.0.0.1:${port}/ready`,
      timeoutMs: 5_000,
    },
    async () => Promise.reject(undefined),
  ).then(
    (value) => ({ status: "fulfilled", value }),
    (reason) => ({ reason, status: "rejected" }),
  );

  assert.equal(outcome.status, "rejected");
  assert.equal(outcome.reason, undefined);
  const { pid } = await readJsonWhenReady(statePath);
  await waitForProcessExit(pid);
});

test("withServer stops its owned process tree", async () => {
  const port = await getFreePort();
  const url = `http://127.0.0.1:${port}/ready`;
  const serverStatePath = nextStatePath("tree-server");
  const treeStatePath = nextStatePath("tree-parent");

  await withServer(
    {
      command: process.execPath,
      args: [
        treeFixture,
        serverFixture,
        String(port),
        serverStatePath,
        treeStatePath,
        "tree-token",
      ],
      url,
      timeoutMs: 5_000,
    },
    async () => {
      assert.equal((await fetch(url)).status, 200);
    },
  );

  const treeState = await readJsonWhenReady(treeStatePath);
  const serverState = await readJsonWhenReady(serverStatePath);
  assert.equal(treeState.childPid, serverState.pid);
  await waitForProcessExit(treeState.pid);
  await waitForProcessExit(treeState.childPid);
  await waitForUrlToStop(url);
});

test(
  "withServer recovers Windows descendants after the owned root exits",
  { skip: process.platform !== "win32" ? "Windows taskkill only" : false },
  async (t) => {
    const port = await getFreePort();
    const serverStatePath = nextStatePath("dead-root-server");
    const treeStatePath = nextStatePath("dead-root-parent");
    let descendantPid;
    t.after(async () => {
      if (descendantPid) await killExactWindowsTree(descendantPid);
    });

    const outcome = await withServer(
      {
        command: process.execPath,
        args: [
          earlyExitTreeFixture,
          serverFixture,
          String(port),
          serverStatePath,
          treeStatePath,
          "dead-root-token",
        ],
        url: `http://127.0.0.1:${port}/ready`,
        timeoutMs: 5_000,
      },
      async () => assert.fail("callback must not run after the root exits"),
    ).then(
      (value) => ({ status: "fulfilled", value }),
      (reason) => ({ reason, status: "rejected" }),
    );

    assert.equal(outcome.status, "rejected");
    assert.match(outcome.reason.message, /exited before readiness \(code 0\)/);
    const treeState = await readJsonWhenReady(treeStatePath);
    const serverState = await readJsonWhenReady(serverStatePath);
    descendantPid = treeState.childPid;
    assert.equal(serverState.pid, descendantPid);
    await waitForProcessExit(descendantPid);
    assert.equal(outcome.reason.cleanupError, undefined);
  },
);

test("withServer never kills an unrelated process that owns the readiness port", async (t) => {
  const unrelated = http.createServer((_request, response) => {
    response.statusCode = 200;
    response.end("unrelated");
  });
  t.after(() => closeServer(unrelated));
  await new Promise((resolve) => unrelated.listen(0, "127.0.0.1", resolve));
  const { port } = unrelated.address();
  const statePath = nextStatePath("unrelated-port");
  const sleeper = [
    'const fs = require("node:fs");',
    "fs.writeFileSync(process.argv[1], String(process.pid));",
    "setInterval(() => {}, 1_000);",
  ].join("\n");

  await withServer(
    {
      command: process.execPath,
      args: ["-e", sleeper, statePath],
      url: `http://127.0.0.1:${port}/ready`,
      timeoutMs: 2_000,
    },
    async () => {
      await waitFor(() => fs.existsSync(statePath));
      const response = await fetch(`http://127.0.0.1:${port}/ready`);
      assert.equal(await response.text(), "unrelated");
    },
  );

  const ownedPid = Number(fs.readFileSync(statePath, "utf8"));
  await waitForProcessExit(ownedPid);
  const response = await fetch(`http://127.0.0.1:${port}/still-alive`);
  assert.equal(await response.text(), "unrelated");
});

test("withServer checks an early child exit before invoking the readiness callback", async (t) => {
  const unrelated = http.createServer((_request, response) => {
    response.statusCode = 200;
    response.end("unrelated-ready");
  });
  t.after(() => closeServer(unrelated));
  await new Promise((resolve) => unrelated.listen(0, "127.0.0.1", resolve));
  const { port } = unrelated.address();
  let callbackRan = false;

  await assert.rejects(
    withServer(
      {
        command: process.execPath,
        args: [
          "-e",
          "setImmediate(() => process.exit(17)); setInterval(() => {}, 1_000);",
        ],
        url: `http://127.0.0.1:${port}/ready`,
        timeoutMs: 2_000,
      },
      async () => {
        callbackRan = true;
      },
    ),
    /exited before readiness \(code 17\)/,
  );

  assert.equal(callbackRan, false);
  const response = await fetch(`http://127.0.0.1:${port}/still-alive`);
  assert.equal(await response.text(), "unrelated-ready");
});

test(
  "stopOwnedProcess escalates an ignored POSIX SIGTERM to SIGKILL",
  { skip: process.platform === "win32" ? "POSIX process groups only" : false },
  async (t) => {
    const statePath = nextStatePath("ignore-term");
    const script = [
      'const fs = require("node:fs");',
      "process.on('SIGTERM', () => {});",
      "fs.writeFileSync(process.argv[1], String(process.pid));",
      "setInterval(() => {}, 1_000);",
    ].join("\n");
    const child = spawn(process.execPath, ["-e", script, statePath], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    t.after(() => stopOwnedProcess(child));
    await waitFor(() => fs.existsSync(statePath));

    await stopOwnedProcess(child);

    assert.equal(child.signalCode, "SIGKILL");
    await waitForProcessExit(child.pid);
  },
);

test(
  "stopOwnedProcess accepts EPERM after the POSIX group leader has exited",
  { skip: process.platform === "win32" ? "POSIX process groups only" : false },
  async (t) => {
    const originalKill = process.kill;
    const pid = 2_147_000_001;
    const child = {
      exitCode: 0,
      kill() {
        throw new Error("the exited child must not be signalled directly");
      },
      pid,
      signalCode: null,
    };
    process.kill = (targetPid, signal) => {
      assert.equal(targetPid, -pid);
      const error = new Error(`kill ${signal ?? 0} EPERM`);
      error.code = "EPERM";
      throw error;
    };
    t.after(() => {
      process.kill = originalKill;
    });

    await stopOwnedProcess(child);
  },
);

test(
  "stopOwnedProcess falls back to the POSIX group leader after group EPERM",
  { skip: process.platform === "win32" ? "POSIX process groups only" : false },
  async (t) => {
    const originalKill = process.kill;
    const pid = 2_147_000_002;
    const directSignals = [];
    const child = {
      exitCode: null,
      kill(signal) {
        directSignals.push(signal);
        this.signalCode = signal;
        return true;
      },
      pid,
      signalCode: null,
    };
    process.kill = (targetPid, signal) => {
      if (targetPid === pid && signal === 0) return true;
      assert.equal(targetPid, -pid);
      const error = new Error(`kill ${signal ?? 0} EPERM`);
      error.code = "EPERM";
      throw error;
    };
    t.after(() => {
      process.kill = originalKill;
    });

    await stopOwnedProcess(child);

    assert.deepEqual(directSignals, ["SIGTERM"]);
  },
);

test("withServer cleans up before exiting on SIGINT", async (t) => {
  const port = await getFreePort();
  const serverStatePath = nextStatePath("signal-server");
  const readyPath = nextStatePath("signal-ready");
  const runner = spawn(
    process.execPath,
    [
      signalRunnerFixture,
      serverFixture,
      String(port),
      serverStatePath,
      readyPath,
    ],
    {
      detached: process.platform !== "win32",
      stdio: "ignore",
      windowsHide: true,
    },
  );
  t.after(() => stopOwnedProcess(runner));

  const [code, signal] = await waitForChildExit(runner);
  assert.equal(signal, null);
  assert.equal(code, 130);
  assert.equal(fs.readFileSync(readyPath, "utf8"), "ready");
  const { pid } = await readJsonWhenReady(serverStatePath);
  await waitForProcessExit(pid);
  await waitForUrlToStop(`http://127.0.0.1:${port}/ready`);
});

test("withServer cleans up before exiting on SIGTERM", async (t) => {
  const port = await getFreePort();
  const serverStatePath = nextStatePath("signal-term-server");
  const readyPath = nextStatePath("signal-term-ready");
  const runner = spawn(
    process.execPath,
    [
      signalRunnerFixture,
      serverFixture,
      String(port),
      serverStatePath,
      readyPath,
      "",
      "SIGTERM",
    ],
    {
      detached: process.platform !== "win32",
      stdio: "ignore",
      windowsHide: true,
    },
  );
  t.after(() => stopOwnedProcess(runner));

  const [code, signal] = await waitForChildExit(runner);
  assert.equal(signal, null);
  assert.equal(code, 143);
  assert.equal(fs.readFileSync(readyPath, "utf8"), "ready");
  const { pid } = await readJsonWhenReady(serverStatePath);
  await waitForProcessExit(pid);
  await waitForUrlToStop(`http://127.0.0.1:${port}/ready`);
});

test(
  "withServer reports SIGINT cleanup failure and does not return the success signal code",
  { skip: process.platform !== "win32" ? "Windows taskkill failure fixture" : false },
  async (t) => {
    const port = await getFreePort();
    const serverStatePath = nextStatePath("signal-cleanup-failure-server");
    const readyPath = nextStatePath("signal-cleanup-failure-ready");
    let serverPid;
    const runner = spawn(
      process.execPath,
      [
        signalRunnerFixture,
        serverFixture,
        String(port),
        serverStatePath,
        readyPath,
        fixtureRoot,
      ],
      {
        detached: false,
        stdio: ["ignore", "ignore", "pipe"],
        windowsHide: true,
      },
    );
    let stderr = "";
    runner.stderr.setEncoding("utf8");
    runner.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    t.after(async () => {
      await stopOwnedProcess(runner).catch(() => {});
      if (serverPid) await killExactWindowsTree(serverPid);
    });

    const [code, signal] = await waitForChildExit(runner);
    const state = await readJsonWhenReady(serverStatePath);
    serverPid = state.pid;
    assert.equal(signal, null);
    assert.equal(code, 1);
    assert.match(stderr, /failed to clean up.*SIGINT/i);
    assert.match(stderr, /taskkill/i);
  },
);
