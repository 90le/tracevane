import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(import.meta.dirname, "../..");
const SCRIPT = path.join(ROOT, "scripts", "test-gateway-http-foundation.mjs");

const FAKE_OPENCLAW = String.raw`
import { copyFileSync, readFileSync, writeFileSync } from "node:fs";
import http from "node:http";

const args = process.argv.slice(2);
const portIndex = args.indexOf("--port");
const port = Number(args[portIndex + 1]);
const config = JSON.parse(readFileSync(process.env.OPENCLAW_CONFIG_PATH, "utf8"));
const tracevane = config.plugins.entries.tracevane.config;
const basePath = tracevane.transport.gateway.basePath;
if (process.env.TRACEVANE_TEST_GATEWAY_CONFIG_CAPTURE) {
  copyFileSync(process.env.OPENCLAW_CONFIG_PATH, process.env.TRACEVANE_TEST_GATEWAY_CONFIG_CAPTURE);
}
if (process.env.TRACEVANE_TEST_GATEWAY_PID_FILE) {
  writeFileSync(process.env.TRACEVANE_TEST_GATEWAY_PID_FILE, String(process.pid));
}

const server = http.createServer((request, response) => {
  if (request.url === basePath || request.url === basePath + "/") {
    response.writeHead(200, { "content-type": "text/html" });
    response.end(process.env.TRACEVANE_TEST_BAD_RUNTIME === "1"
      ? "<html>missing runtime config</html>"
      : '<html>__TRACEVANE_RUNTIME__ {"exposureKind":"gateway"}</html>');
    return;
  }
  if (request.url === basePath + "/api/system/health") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ gatewayConnected: true, gatewayPort: port }));
    return;
  }
  response.writeHead(404);
  response.end("not found");
});

const stop = () => server.close(() => process.exit(0));
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
server.listen(port, "127.0.0.1");
`;

function createFakeOpenClaw(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), "tracevane gateway 中文 "));
  const binDir = path.join(root, "bin with space");
  const fakeModule = path.join(root, "fake-openclaw.mjs");
  writeFileSync(fakeModule, FAKE_OPENCLAW, "utf8");
  mkdirSync(binDir, { recursive: true });
  if (process.platform === "win32") {
    writeFileSync(
      path.join(binDir, "openclaw.cmd"),
      `@echo off\r\n"${process.execPath}" "%~dp0..\\fake-openclaw.mjs" %*\r\n`,
      "utf8",
    );
  } else {
    const executable = path.join(binDir, "openclaw");
    writeFileSync(executable, `#!/usr/bin/env node\n${FAKE_OPENCLAW}`, "utf8");
    chmodSync(executable, 0o755);
  }
  t.after(() => rmSync(root, { force: true, recursive: true }));
  return { binDir, root };
}

async function freePort() {
  const server = net.createServer();
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

async function canBind(port) {
  const server = net.createServer();
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, "127.0.0.1", resolve);
    });
    return true;
  } catch (error) {
    if (error?.code === "EADDRINUSE") return false;
    throw error;
  } finally {
    if (server.listening) {
      await new Promise((resolve) => server.close(resolve));
    }
  }
}

function processAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

function smokeEnv(fixture, gatewayPort, standalonePort, extra = {}) {
  return {
    ...process.env,
    PATH: `${fixture.binDir}${path.delimiter}${process.env.PATH || ""}`,
    TRACEVANE_GATEWAY_HTTP_PORT: String(gatewayPort),
    TRACEVANE_GATEWAY_STANDALONE_PORT: String(standalonePort),
    TRACEVANE_GATEWAY_HTTP_TIMEOUT_MS: "5000",
    TRACEVANE_TEST_GATEWAY_CONFIG_CAPTURE: path.join(fixture.root, "captured config.json"),
    TRACEVANE_TEST_GATEWAY_PID_FILE: path.join(fixture.root, "gateway.pid"),
    ...extra,
  };
}

async function runSmoke(args, env) {
  return execFileAsync(process.execPath, [SCRIPT, ...args], {
    cwd: ROOT,
    encoding: "utf8",
    env,
    maxBuffer: 1024 * 1024,
    timeout: 15_000,
  });
}

test("Node Gateway foundation smoke proves mounted basePath contracts and owned cleanup", async (t) => {
  const fixture = createFakeOpenClaw(t);
  const gatewayPort = await freePort();
  const standalonePort = await freePort();
  const env = smokeEnv(fixture, gatewayPort, standalonePort);

  const result = await runSmoke(["--strict", "--json"], env);
  const report = JSON.parse(result.stdout);
  assert.equal(report.status, "passed");
  assert.deepEqual(report.checks, {
    basePathRuntimeConfig: true,
    basePathHealth: true,
    standaloneDisabled: true,
  });
  assert.equal(report.gatewayPort, gatewayPort);
  assert.equal(report.standalonePort, standalonePort);

  const config = JSON.parse(readFileSync(env.TRACEVANE_TEST_GATEWAY_CONFIG_CAPTURE, "utf8"));
  const transport = config.plugins.entries.tracevane.config.transport;
  assert.deepEqual(transport.gateway, { enabled: true, basePath: "/tracevane" });
  assert.deepEqual(transport.standalone, { enabled: false, port: standalonePort });

  const pid = Number(readFileSync(env.TRACEVANE_TEST_GATEWAY_PID_FILE, "utf8"));
  assert.equal(processAlive(pid), false);
  assert.equal(await canBind(gatewayPort), true);
  assert.equal(await canBind(standalonePort), true);
});

test("missing OpenClaw is an explicit skip unless strict mode is requested", async (t) => {
  const emptyPath = mkdtempSync(path.join(os.tmpdir(), "tracevane-empty-path-"));
  t.after(() => rmSync(emptyPath, { force: true, recursive: true }));
  const env = { ...process.env, PATH: emptyPath };

  const skipped = await runSmoke(["--json"], env);
  assert.equal(JSON.parse(skipped.stdout).status, "skipped");

  await assert.rejects(
    runSmoke(["--strict", "--json"], env),
    (error) => error?.code === 1 && /OpenClaw.*not installed|not on PATH/i.test(error.stderr),
  );
});

test("occupied gateway port fails before spawn and preserves the unrelated listener", async (t) => {
  const fixture = createFakeOpenClaw(t);
  const unowned = http.createServer((_request, response) => response.end("unowned"));
  await new Promise((resolve, reject) => {
    unowned.once("error", reject);
    unowned.listen(0, "127.0.0.1", resolve);
  });
  t.after(() => new Promise((resolve) => unowned.close(resolve)));
  const gatewayPort = unowned.address().port;
  const standalonePort = await freePort();
  const env = smokeEnv(fixture, gatewayPort, standalonePort);

  await assert.rejects(
    runSmoke(["--strict", "--json"], env),
    (error) => error?.code === 1 && /already in use/i.test(error.stderr),
  );
  assert.equal(existsSync(env.TRACEVANE_TEST_GATEWAY_PID_FILE), false);
  assert.equal(await (await fetch(`http://127.0.0.1:${gatewayPort}`)).text(), "unowned");
});

test("failed contract probe still cleans the owned OpenClaw tree", async (t) => {
  const fixture = createFakeOpenClaw(t);
  const gatewayPort = await freePort();
  const standalonePort = await freePort();
  const env = smokeEnv(fixture, gatewayPort, standalonePort, {
    TRACEVANE_TEST_BAD_RUNTIME: "1",
  });

  await assert.rejects(
    runSmoke(["--strict", "--json"], env),
    (error) => error?.code === 1 && /runtime config/i.test(error.stderr),
  );
  const pid = Number(readFileSync(env.TRACEVANE_TEST_GATEWAY_PID_FILE, "utf8"));
  assert.equal(processAlive(pid), false);
  assert.equal(await canBind(gatewayPort), true);
});
