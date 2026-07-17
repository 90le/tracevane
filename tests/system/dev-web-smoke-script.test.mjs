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
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";

const repoRoot = path.resolve(".");
const webSmokePath = path.join(repoRoot, "scripts", "dev-web-smoke.mjs");
const externalSmokePath = path.join(
  repoRoot,
  "scripts",
  "dev-web-smoke-external-api.mjs",
);
const packageJsonPath = path.join(repoRoot, "package.json");
const fixtureRoots = new Set();

test.after(() => {
  for (const root of fixtureRoots) {
    rmSync(root, { force: true, recursive: true });
  }
});

function createFixture() {
  const root = mkdtempSync(
    path.join(os.tmpdir(), "tracevane web smoke 中文 path with spaces "),
  );
  fixtureRoots.add(root);

  const webDir = path.join(root, "apps", "web");
  const viteBin = path.join(root, "node_modules", "vite", "bin", "vite.js");
  const apiScript = path.join(root, "scripts", "start-standalone-api.mjs");
  const viteStateFile = path.join(root, "vite-state.ndjson");
  const apiStateFile = path.join(root, "api-state.ndjson");
  mkdirSync(webDir, { recursive: true });
  mkdirSync(path.dirname(viteBin), { recursive: true });
  mkdirSync(path.dirname(apiScript), { recursive: true });

  writeFileSync(
    viteBin,
    [
      'import fs from "node:fs";',
      'import http from "node:http";',
      'const args = process.argv.slice(2);',
      'const stateFile = process.env.TRACEVANE_TEST_VITE_STATE_FILE;',
      'const record = (value) => fs.appendFileSync(stateFile, `${JSON.stringify(value)}\\n`);',
      'if (process.env.TRACEVANE_TEST_EMIT_LOGS === "1") console.log(`fake-vite-log-marker ${args[0] === "optimize" ? "optimize" : "serve"}`);',
      'if (args[0] === "optimize") {',
      '  record({',
      '    kind: "optimize",',
      '    args,',
      '    cwd: process.cwd(),',
      '    execPath: process.execPath,',
      '    cacheDir: process.env.TRACEVANE_VITE_CACHE_DIR,',
      '    disableWatch: process.env.TRACEVANE_SMOKE_DISABLE_WATCH,',
      '    forceOptimize: process.env.TRACEVANE_SMOKE_FORCE_OPTIMIZE,',
      '    skipOptimize: process.env.TRACEVANE_SMOKE_SKIP_OPTIMIZE,',
      '  });',
      '  process.exit(Number(process.env.TRACEVANE_TEST_OPTIMIZE_EXIT_CODE || 0));',
      '}',
      'const portIndex = args.indexOf("--port");',
      'const port = Number(args[portIndex + 1]);',
      'record({',
      '  kind: "server-start",',
      '  pid: process.pid,',
      '  args,',
      '  cwd: process.cwd(),',
      '  execPath: process.execPath,',
      '  cacheDir: process.env.TRACEVANE_VITE_CACHE_DIR,',
      '  disableWatch: process.env.TRACEVANE_SMOKE_DISABLE_WATCH,',
      '  forceOptimize: process.env.TRACEVANE_SMOKE_FORCE_OPTIMIZE,',
      '  skipOptimize: process.env.TRACEVANE_SMOKE_SKIP_OPTIMIZE,',
      '  useExternalApi: process.env.TRACEVANE_USE_EXTERNAL_API,',
      '  apiPort: process.env.TRACEVANE_API_PORT,',
      '  webPort: process.env.TRACEVANE_WEB_PORT,',
      '});',
      'if (process.env.TRACEVANE_TEST_VITE_EXIT_EARLY === "1") process.exit(23);',
      'const server = http.createServer((_request, response) => {',
      '  response.statusCode = 200;',
      '  response.end("fake-vite-ready");',
      '});',
      'server.once("error", (error) => {',
      '  record({ kind: "server-error", code: error.code, pid: process.pid });',
      '  process.exit(24);',
      '});',
      'server.listen(port, "127.0.0.1", () => record({ kind: "server-ready", pid: process.pid, port }));',
      'const close = () => server.close(() => process.exit(0));',
      'process.on("SIGINT", close);',
      'process.on("SIGTERM", close);',
      '',
    ].join("\n"),
    "utf8",
  );

  writeFileSync(
    apiScript,
    [
      'import fs from "node:fs";',
      'import http from "node:http";',
      'const port = Number(process.env.TRACEVANE_API_PORT);',
      'const stateFile = process.env.TRACEVANE_TEST_API_STATE_FILE;',
      'const record = (value) => fs.appendFileSync(stateFile, `${JSON.stringify(value)}\\n`);',
      'record({ kind: "api-start", pid: process.pid, port, cwd: process.cwd(), execPath: process.execPath });',
      'if (process.env.TRACEVANE_TEST_EMIT_LOGS === "1") console.log("fake-api-log-marker");',
      'if (process.env.TRACEVANE_TEST_API_EXIT_EARLY === "1") process.exit(29);',
      'const server = http.createServer((request, response) => {',
      '  record({ kind: "api-request", url: request.url });',
      '  if (request.url === "/api/files/summary" || (request.url === "/api/lsp/status" && process.env.TRACEVANE_TEST_API_MISSING_LSP !== "1")) {',
      '    response.statusCode = 200;',
      '    response.setHeader("content-type", "application/json");',
      '    response.end("{}");',
      '    return;',
      '  }',
      '  response.statusCode = 404;',
      '  response.end("missing");',
      '});',
      'server.listen(port, "127.0.0.1", () => record({ kind: "api-ready", pid: process.pid, port }));',
      'const close = () => server.close(() => process.exit(0));',
      'process.on("SIGINT", close);',
      'process.on("SIGTERM", close);',
      '',
    ].join("\n"),
    "utf8",
  );

  return {
    apiScript,
    apiStateFile,
    root,
    viteBin,
    viteStateFile,
    webDir,
  };
}

function records(file) {
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

async function getFreePort() {
  const server = http.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address();
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  return port;
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
    const value = await predicate();
    if (value) return value;
    await delay(25);
  }
  assert.fail("condition did not become true before timeout");
}

async function waitForExit(pid) {
  await waitFor(() => !processIsAlive(pid));
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

async function waitForChildExit(child, timeoutMs = 8_000) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return [child.exitCode, child.signalCode];
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.off("exit", onExit);
      child.off("error", onError);
      reject(new Error(`child ${child.pid} did not exit before timeout`));
    }, timeoutMs);
    const onExit = (code, signal) => {
      clearTimeout(timer);
      child.off("error", onError);
      resolve([code, signal]);
    };
    const onError = (error) => {
      clearTimeout(timer);
      child.off("exit", onExit);
      reject(error);
    };
    child.once("exit", onExit);
    child.once("error", onError);
  });
}

async function loadLaunchers() {
  const cacheBust = `?test=${Date.now()}-${Math.random()}`;
  const [webSmoke, externalSmoke] = await Promise.all([
    import(pathToFileURL(webSmokePath).href + cacheBust),
    import(pathToFileURL(externalSmokePath).href + cacheBust),
  ]);
  return { externalSmoke, webSmoke };
}

test("the native launchers replace only the dedicated dev:web:smoke shell entrypoint", () => {
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  assert.equal(
    packageJson.scripts["dev:web:smoke"],
    "node scripts/dev-web-smoke.mjs",
  );
  assert.equal(existsSync(webSmokePath), true);
  assert.equal(existsSync(externalSmokePath), true);
  assert.equal(existsSync(path.join(repoRoot, "scripts", "dev-web-smoke.sh")), false);
  assert.equal(
    existsSync(path.join(repoRoot, "scripts", "dev-web-smoke-external-api.sh")),
    false,
  );
});

test("ports fall back only when absent and reject explicit invalid values", async () => {
  const fixture = createFixture();
  const { externalSmoke, webSmoke } = await loadLaunchers();
  const envWithoutPorts = { ...process.env };
  delete envWithoutPorts.TRACEVANE_API_PORT;
  delete envWithoutPorts.TRACEVANE_WEB_PORT;
  assert.equal(
    webSmoke.createWebSmokeConfig({ env: envWithoutPorts, rootDir: fixture.root })
      .webPort,
    5176,
  );
  const externalConfig = externalSmoke.createExternalApiSmokeConfig({
      env: envWithoutPorts,
      rootDir: fixture.root,
    });
  assert.equal(externalConfig.apiPort, 3796);
  assert.equal(
    externalConfig.apiLogFile,
    path.join(fixture.root, "tmp", "tracevane-external-api-3796.log"),
  );
  assert.equal(
    externalConfig.webLogFile,
    path.join(fixture.root, "tmp", "tracevane-external-web-5176.log"),
  );

  for (const value of ["", "not-a-port", "1.5", "0", "65536"]) {
    assert.throws(
      () =>
        webSmoke.createWebSmokeConfig({
          env: { ...envWithoutPorts, TRACEVANE_WEB_PORT: value },
          rootDir: fixture.root,
        }),
      /TRACEVANE_WEB_PORT.*1.*65535/i,
    );
    assert.throws(
      () =>
        externalSmoke.createExternalApiSmokeConfig({
          env: { ...envWithoutPorts, TRACEVANE_API_PORT: value },
          rootDir: fixture.root,
        }),
      /TRACEVANE_API_PORT.*1.*65535/i,
    );
  }
});

test("an owned command spawn failure is fatal", async () => {
  const fixture = createFixture();
  const { webSmoke } = await loadLaunchers();
  await assert.rejects(
    webSmoke.runOwnedCommand(
      path.join(fixture.root, "missing node executable"),
      [],
      { cwd: fixture.root, env: process.env },
    ),
    (error) => error?.code === "ENOENT",
  );
});

test("owned command signal cleanup rejection propagates immediately", async () => {
  const { webSmoke } = await loadLaunchers();
  let unrefCalls = 0;
  const child = Object.assign(new EventEmitter(), {
    exitCode: null,
    pid: 4242,
    signalCode: null,
    unref() {
      unrefCalls += 1;
    },
  });
  const signals = new EventEmitter();
  const outcome = webSmoke.waitForOwnedCommand(child, {
    cleanupTimeoutMs: 100,
    signalEmitter: signals,
    stopOwnedProcessImpl: async () => {
      throw new Error("cleanup denied");
    },
  });
  signals.emit("SIGINT");

  await assert.rejects(outcome, /SIGINT.*cleanup denied/i);
  assert.equal(unrefCalls, 1);
  assert.equal(signals.listenerCount("SIGINT"), 0);
  assert.equal(signals.listenerCount("SIGTERM"), 0);
});

test("owned command signal cleanup has a finite deadline", async () => {
  const { webSmoke } = await loadLaunchers();
  let unrefCalls = 0;
  const child = Object.assign(new EventEmitter(), {
    exitCode: null,
    pid: 4243,
    signalCode: null,
    unref() {
      unrefCalls += 1;
    },
  });
  const signals = new EventEmitter();
  const startedAt = Date.now();
  const outcome = webSmoke.waitForOwnedCommand(child, {
    cleanupTimeoutMs: 50,
    signalEmitter: signals,
    stopOwnedProcessImpl: () => new Promise(() => {}),
  });
  signals.emit("SIGTERM");

  await assert.rejects(outcome, /SIGTERM.*timed out.*50ms/i);
  assert.equal(unrefCalls, 1);
  assert.ok(Date.now() - startedAt < 1_000, "cleanup timeout must stay bounded");
  assert.equal(signals.listenerCount("SIGINT"), 0);
  assert.equal(signals.listenerCount("SIGTERM"), 0);
});

test("successful owned command signal cleanup keeps normal child references", async () => {
  const { webSmoke } = await loadLaunchers();
  let unrefCalls = 0;
  const child = Object.assign(new EventEmitter(), {
    exitCode: null,
    pid: 4244,
    signalCode: null,
    unref() {
      unrefCalls += 1;
    },
  });
  const signals = new EventEmitter();
  const outcome = webSmoke.waitForOwnedCommand(child, {
    cleanupTimeoutMs: 100,
    signalEmitter: signals,
    stopOwnedProcessImpl: async () => {},
  });
  signals.emit("SIGINT");

  await assert.rejects(
    outcome,
    (error) => error?.exitCode === 130 && /Interrupted by SIGINT/.test(error.message),
  );
  assert.equal(unrefCalls, 0);
});

test("the web launcher cleans smoke artifacts and safely tokenizes a CJK/space checkout", async () => {
  const fixture = createFixture();
  const { webSmoke } = await loadLaunchers();
  const port = await getFreePort();
  const cacheDir = path.join(fixture.root, "cache parent 中文", "vite smoke cache");
  const keepDir = path.join(cacheDir, "keep-me");
  const tempDir = path.join(cacheDir, "deps_temp_stale");
  const directTimestamp = path.join(
    fixture.webDir,
    "vite.config.ts.timestamp-12345.mjs",
  );
  const nestedTimestamp = path.join(
    fixture.webDir,
    "node_modules",
    "pkg",
    ".vite-temp",
    "vite.config.ts.timestamp-67890.mjs",
  );
  mkdirSync(keepDir, { recursive: true });
  mkdirSync(tempDir, { recursive: true });
  mkdirSync(path.dirname(nestedTimestamp), { recursive: true });
  writeFileSync(path.join(keepDir, "marker"), "keep", "utf8");
  writeFileSync(directTimestamp, "stale", "utf8");
  writeFileSync(nestedTimestamp, "stale", "utf8");

  const env = {
    ...process.env,
    TRACEVANE_SMOKE_SKIP_OPTIMIZE: "1",
    TRACEVANE_TEST_VITE_STATE_FILE: fixture.viteStateFile,
    TRACEVANE_VITE_CACHE_DIR: cacheDir,
    TRACEVANE_WEB_PORT: String(port),
  };
  await webSmoke.runWebSmoke(
    { env, intervalMs: 20, rootDir: fixture.root, timeoutMs: 3_000 },
    async () => {
      const response = await fetch(`http://127.0.0.1:${port}/`);
      assert.equal(await response.text(), "fake-vite-ready");
    },
  );

  const viteRecords = records(fixture.viteStateFile);
  assert.equal(
    viteRecords.some((entry) => entry.kind === "optimize"),
    false,
  );
  const starts = viteRecords.filter(
    (entry) => entry.kind === "server-start",
  );
  assert.equal(starts.length, 1);
  assert.deepEqual(starts[0].args, [
    "--force",
    "--strictPort",
    "--port",
    String(port),
  ]);
  assert.equal(starts[0].execPath, process.execPath);
  assert.equal(starts[0].cwd, fixture.webDir);
  assert.equal(starts[0].cacheDir, cacheDir);
  assert.equal(starts[0].disableWatch, "1");
  assert.equal(starts[0].webPort, String(port));
  assert.equal(existsSync(tempDir), false);
  assert.equal(existsSync(keepDir), true);
  assert.equal(existsSync(directTimestamp), false);
  assert.equal(existsSync(nestedTimestamp), false);
  await waitForExit(starts[0].pid);
  await waitForUrlToStop(`http://127.0.0.1:${port}/`);
});

test("legacy optimize --force nonzero (`|| true`) remains deliberately non-fatal", async () => {
  const fixture = createFixture();
  const { webSmoke } = await loadLaunchers();
  const port = await getFreePort();
  const cacheDir = path.join(fixture.root, "cache");
  mkdirSync(cacheDir, { recursive: true });
  writeFileSync(path.join(cacheDir, "stale-marker"), "stale", "utf8");

  await webSmoke.runWebSmoke(
    {
      env: {
        ...process.env,
        TRACEVANE_SMOKE_DISABLE_WATCH: "0",
        TRACEVANE_TEST_OPTIMIZE_EXIT_CODE: "9",
        TRACEVANE_TEST_VITE_STATE_FILE: fixture.viteStateFile,
        TRACEVANE_VITE_CACHE_DIR: cacheDir,
        TRACEVANE_WEB_PORT: String(port),
      },
      intervalMs: 20,
      rootDir: fixture.root,
      timeoutMs: 3_000,
    },
    async () => {},
  );

  const entries = records(fixture.viteStateFile);
  assert.deepEqual(entries[0].args, ["optimize", "--force"]);
  assert.equal(entries[0].execPath, process.execPath);
  assert.equal(entries[0].cwd, fixture.webDir);
  assert.equal(entries[1].kind, "server-start");
  assert.equal(entries[1].disableWatch, "0");
  assert.equal(existsSync(path.join(cacheDir, "stale-marker")), false);
});

test("TRACEVANE_SMOKE_FORCE_OPTIMIZE overrides SKIP_OPTIMIZE", async () => {
  const fixture = createFixture();
  const { webSmoke } = await loadLaunchers();
  const port = await getFreePort();
  await webSmoke.runWebSmoke(
    {
      env: {
        ...process.env,
        TRACEVANE_SMOKE_FORCE_OPTIMIZE: "1",
        TRACEVANE_SMOKE_SKIP_OPTIMIZE: "1",
        TRACEVANE_TEST_VITE_STATE_FILE: fixture.viteStateFile,
        TRACEVANE_WEB_PORT: String(port),
      },
      intervalMs: 20,
      rootDir: fixture.root,
      timeoutMs: 3_000,
    },
    async () => {},
  );
  const optimize = records(fixture.viteStateFile)[0];
  assert.deepEqual(optimize.args, [
    "optimize",
    "--force",
  ]);
  assert.equal(optimize.forceOptimize, "1");
  assert.equal(optimize.skipOptimize, "1");
});

test("strict-port startup never kills an unrelated port owner", async () => {
  const fixture = createFixture();
  const { webSmoke } = await loadLaunchers();
  const unowned = http.createServer((_request, response) => {
    response.statusCode = 200;
    response.end("unowned");
  });
  await new Promise((resolve, reject) => {
    unowned.once("error", reject);
    unowned.listen(0, "127.0.0.1", resolve);
  });
  const { port } = unowned.address();
  let callbackRan = false;
  try {
    await assert.rejects(
      webSmoke.runWebSmoke(
        {
          env: {
            ...process.env,
            TRACEVANE_SMOKE_SKIP_OPTIMIZE: "1",
            TRACEVANE_TEST_VITE_STATE_FILE: fixture.viteStateFile,
            TRACEVANE_WEB_PORT: String(port),
          },
          intervalMs: 20,
          rootDir: fixture.root,
          timeoutMs: 1_000,
        },
        async () => {
          callbackRan = true;
        },
      ),
      /127\.0\.0\.1.*already in use|port.*already in use/i,
    );
    assert.equal(callbackRan, false);
    assert.equal(
      records(fixture.viteStateFile).some(
        (entry) => entry.kind === "server-start",
      ),
      false,
    );
    const response = await fetch(`http://127.0.0.1:${port}/`);
    assert.equal(await response.text(), "unowned");
  } finally {
    await new Promise((resolve, reject) => {
      unowned.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

test("external mode owns exact standalone API and Vite children and cleans both on callback error", async () => {
  const fixture = createFixture();
  const { externalSmoke } = await loadLaunchers();
  const apiPort = await getFreePort();
  const webPort = await getFreePort();
  const env = {
    ...process.env,
    TRACEVANE_API_PORT: String(apiPort),
    TRACEVANE_SMOKE_SKIP_OPTIMIZE: "1",
    TRACEVANE_TEST_API_STATE_FILE: fixture.apiStateFile,
    TRACEVANE_TEST_VITE_STATE_FILE: fixture.viteStateFile,
    TRACEVANE_WEB_PORT: String(webPort),
  };

  await assert.rejects(
    externalSmoke.runExternalApiSmoke(
      { env, intervalMs: 20, rootDir: fixture.root, timeoutMs: 3_000 },
      async () => {
        const [apiResponse, webResponse] = await Promise.all([
          fetch(`http://127.0.0.1:${apiPort}/api/lsp/status`),
          fetch(`http://127.0.0.1:${webPort}/`),
        ]);
        assert.equal(apiResponse.status, 200);
        assert.equal(await webResponse.text(), "fake-vite-ready");
        throw new Error("probe callback failed");
      },
    ),
    /probe callback failed/,
  );

  const apiStart = records(fixture.apiStateFile).find(
    (entry) => entry.kind === "api-start",
  );
  const webStart = records(fixture.viteStateFile).find(
    (entry) => entry.kind === "server-start",
  );
  assert.equal(apiStart.execPath, process.execPath);
  assert.equal(apiStart.cwd, fixture.root);
  assert.equal(apiStart.port, apiPort);
  assert.equal(webStart.useExternalApi, "1");
  assert.equal(webStart.apiPort, String(apiPort));
  assert.deepEqual(
    records(fixture.apiStateFile)
      .filter((entry) => entry.kind === "api-request")
      .map((entry) => entry.url)
      .slice(0, 2),
    ["/api/files/summary", "/api/lsp/status"],
  );
  await Promise.all([waitForExit(apiStart.pid), waitForExit(webStart.pid)]);
  await Promise.all([
    waitForUrlToStop(`http://127.0.0.1:${apiPort}/api/lsp/status`),
    waitForUrlToStop(`http://127.0.0.1:${webPort}/`),
  ]);
});

test("external mode truncates custom API/Web logs and closes their file handles", async () => {
  const fixture = createFixture();
  const { externalSmoke } = await loadLaunchers();
  const apiPort = await getFreePort();
  const webPort = await getFreePort();
  const apiLogFile = path.join(fixture.root, "logs 中文", "api output.log");
  const webLogFile = path.join(fixture.root, "logs 中文", "web output.log");
  mkdirSync(path.dirname(apiLogFile), { recursive: true });
  writeFileSync(apiLogFile, "stale-api-log", "utf8");
  writeFileSync(webLogFile, "stale-web-log", "utf8");

  await externalSmoke.runExternalApiSmoke(
    {
      env: {
        ...process.env,
        TRACEVANE_API_PORT: String(apiPort),
        TRACEVANE_EXTERNAL_API_LOG_FILE: apiLogFile,
        TRACEVANE_EXTERNAL_WEB_LOG_FILE: webLogFile,
        TRACEVANE_SMOKE_SKIP_OPTIMIZE: "1",
        TRACEVANE_TEST_API_STATE_FILE: fixture.apiStateFile,
        TRACEVANE_TEST_EMIT_LOGS: "1",
        TRACEVANE_TEST_VITE_STATE_FILE: fixture.viteStateFile,
        TRACEVANE_WEB_PORT: String(webPort),
      },
      intervalMs: 20,
      rootDir: fixture.root,
      timeoutMs: 3_000,
    },
    async () => {},
  );

  const apiLog = readFileSync(apiLogFile, "utf8");
  const webLog = readFileSync(webLogFile, "utf8");
  assert.doesNotMatch(apiLog, /stale-api-log/);
  assert.doesNotMatch(webLog, /stale-web-log/);
  assert.match(apiLog, /fake-api-log-marker/);
  assert.match(webLog, /fake-vite-log-marker serve/);
  rmSync(apiLogFile);
  rmSync(webLogFile);
  assert.equal(existsSync(apiLogFile), false);
  assert.equal(existsSync(webLogFile), false);
});

test("external mode rejects a summary-ready API without LSP before starting Vite", async () => {
  const fixture = createFixture();
  const { externalSmoke } = await loadLaunchers();
  const apiPort = await getFreePort();
  const webPort = await getFreePort();
  const apiLogFile = path.join(
    fixture.root,
    "tmp",
    `tracevane-external-api-${apiPort}.log`,
  );
  const webLogFile = path.join(
    fixture.root,
    "tmp",
    `tracevane-external-web-${webPort}.log`,
  );

  await assert.rejects(
    externalSmoke.runExternalApiSmoke(
      {
        env: {
          ...process.env,
          TRACEVANE_API_PORT: String(apiPort),
          TRACEVANE_SMOKE_SKIP_OPTIMIZE: "1",
          TRACEVANE_TEST_API_MISSING_LSP: "1",
          TRACEVANE_TEST_API_STATE_FILE: fixture.apiStateFile,
          TRACEVANE_TEST_VITE_STATE_FILE: fixture.viteStateFile,
          TRACEVANE_WEB_PORT: String(webPort),
        },
        intervalMs: 20,
        rootDir: fixture.root,
        timeoutMs: 1_000,
      },
      async () => assert.fail("callback must not run"),
    ),
    /did not expose \/api\/lsp\/status.*log:/i,
  );

  const apiStart = records(fixture.apiStateFile).find(
    (entry) => entry.kind === "api-start",
  );
  assert.deepEqual(
    records(fixture.apiStateFile)
      .filter((entry) => entry.kind === "api-request")
      .map((entry) => entry.url)
      .slice(0, 2),
    ["/api/files/summary", "/api/lsp/status"],
  );
  assert.deepEqual(records(fixture.viteStateFile), []);
  await waitForExit(apiStart.pid);
  assert.equal(existsSync(apiLogFile), true);
  assert.equal(existsSync(webLogFile), true);
  rmSync(apiLogFile);
  rmSync(webLogFile);
});

test("an early external web exit rolls back the already-ready owned API", async () => {
  const fixture = createFixture();
  const { externalSmoke } = await loadLaunchers();
  const apiPort = await getFreePort();
  const webPort = await getFreePort();
  const startedAt = Date.now();

  await assert.rejects(
    externalSmoke.runExternalApiSmoke(
      {
        env: {
          ...process.env,
          TRACEVANE_API_PORT: String(apiPort),
          TRACEVANE_SMOKE_SKIP_OPTIMIZE: "1",
          TRACEVANE_TEST_API_STATE_FILE: fixture.apiStateFile,
          TRACEVANE_TEST_VITE_EXIT_EARLY: "1",
          TRACEVANE_TEST_VITE_STATE_FILE: fixture.viteStateFile,
          TRACEVANE_WEB_PORT: String(webPort),
        },
        intervalMs: 20,
        rootDir: fixture.root,
        timeoutMs: 3_000,
      },
      async () => assert.fail("callback must not run"),
    ),
    /exited before readiness|code 23/i,
  );
  assert.ok(Date.now() - startedAt < 2_500, "early exit must beat readiness timeout");
  const apiStart = records(fixture.apiStateFile).find(
    (entry) => entry.kind === "api-start",
  );
  await waitForExit(apiStart.pid);
  await waitForUrlToStop(`http://127.0.0.1:${apiPort}/api/lsp/status`);
});

test("an early standalone API exit prevents Vite startup", async () => {
  const fixture = createFixture();
  const { externalSmoke } = await loadLaunchers();
  const apiPort = await getFreePort();
  const webPort = await getFreePort();

  await assert.rejects(
    externalSmoke.runExternalApiSmoke(
      {
        env: {
          ...process.env,
          TRACEVANE_API_PORT: String(apiPort),
          TRACEVANE_SMOKE_SKIP_OPTIMIZE: "1",
          TRACEVANE_TEST_API_EXIT_EARLY: "1",
          TRACEVANE_TEST_API_STATE_FILE: fixture.apiStateFile,
          TRACEVANE_TEST_VITE_STATE_FILE: fixture.viteStateFile,
          TRACEVANE_WEB_PORT: String(webPort),
        },
        intervalMs: 20,
        rootDir: fixture.root,
        timeoutMs: 3_000,
      },
      async () => assert.fail("callback must not run"),
    ),
    /exited before readiness|code 29/i,
  );
  assert.deepEqual(records(fixture.viteStateFile), []);
});

test("external mode cleans both owned trees before exiting on SIGINT", async () => {
  const fixture = createFixture();
  const apiPort = await getFreePort();
  const webPort = await getFreePort();
  const readyFile = path.join(fixture.root, "runner-ready");
  const runnerFile = path.join(fixture.root, "external signal runner.mjs");
  const moduleUrl = pathToFileURL(externalSmokePath).href;
  writeFileSync(
    runnerFile,
    [
      'import fs from "node:fs";',
      `import { runExternalApiSmoke } from ${JSON.stringify(moduleUrl)};`,
      `await runExternalApiSmoke({ rootDir: ${JSON.stringify(fixture.root)}, env: process.env, timeoutMs: 3_000, intervalMs: 20 }, async () => {`,
      `  fs.writeFileSync(${JSON.stringify(readyFile)}, "ready");`,
      '  setTimeout(() => process.emit("SIGINT"), 50);',
      '  await new Promise(() => {});',
      '});',
      '',
    ].join("\n"),
    "utf8",
  );

  const runner = spawn(process.execPath, [runnerFile], {
    cwd: fixture.root,
    env: {
      ...process.env,
      TRACEVANE_API_PORT: String(apiPort),
      TRACEVANE_SMOKE_SKIP_OPTIMIZE: "1",
      TRACEVANE_TEST_API_STATE_FILE: fixture.apiStateFile,
      TRACEVANE_TEST_VITE_STATE_FILE: fixture.viteStateFile,
      TRACEVANE_WEB_PORT: String(webPort),
    },
    shell: false,
    stdio: "ignore",
    windowsHide: true,
  });
  try {
    await waitFor(() => existsSync(readyFile));
    const [code, signal] = await waitForChildExit(runner);
    assert.equal(signal, null);
    assert.equal(code, 130);
    const apiPid = records(fixture.apiStateFile).find(
      (entry) => entry.kind === "api-start",
    ).pid;
    const webPid = records(fixture.viteStateFile).find(
      (entry) => entry.kind === "server-start",
    ).pid;
    await Promise.all([waitForExit(apiPid), waitForExit(webPid)]);
  } finally {
    if (processIsAlive(runner.pid)) {
      if (process.platform === "win32") {
        spawnSync("taskkill.exe", ["/PID", String(runner.pid), "/T", "/F"], {
          stdio: "ignore",
          windowsHide: true,
        });
      } else {
        runner.kill("SIGKILL");
      }
    }
  }
});
