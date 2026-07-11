import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  parseBrowserSmokeArgs,
  resolveBrowserExecutable,
  runBrowserSmoke,
  runSmokeCommand,
} from "../../scripts/run-browser-smoke.mjs";
import { withServer } from "../../scripts/lib/with-server.mjs";

const ROOT_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);
const RUNNER = path.join(ROOT_DIR, "scripts", "run-browser-smoke.mjs");

function reservePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close((error) => {
        if (error) reject(error);
        else resolve(address.port);
      });
    });
  });
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

async function waitForProcessExit(pid, timeoutMs = 3_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!processIsAlive(pid)) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.equal(processIsAlive(pid), false, `process ${pid} should have exited`);
}

function writeFixture(directory, name, source) {
  const file = path.join(directory, name);
  writeFileSync(file, source, "utf8");
  return file;
}

function removeFixtureDirectory(directory) {
  rmSync(directory, {
    force: true,
    maxRetries: 10,
    recursive: true,
    retryDelay: 50,
  });
}

function createServerLauncher({
  directory,
  mode = "ready",
  pidFile,
  port,
  timeoutMs = 2_000,
}) {
  const fixture = writeFixture(
    directory,
    `server-${mode}-${port}.mjs`,
    `
      import { writeFileSync } from "node:fs";
      import { createServer } from "node:http";
      writeFileSync(${JSON.stringify(pidFile)}, String(process.pid), "utf8");
      if (${JSON.stringify(mode)} === "ready") {
        createServer((_request, response) => {
          response.writeHead(200, { "content-type": "text/plain" });
          response.end("ready");
        }).listen(${port}, "127.0.0.1");
      }
      setInterval(() => {}, 1_000);
    `,
  );

  return async (_options, callback) => withServer(
    {
      args: [fixture],
      command: process.execPath,
      cwd: directory,
      timeoutMs,
      url: `http://127.0.0.1:${port}/`,
    },
    callback,
  );
}

test("parseBrowserSmokeArgs preserves defaults and CJK/space command tokens", () => {
  assert.deepEqual(
    parseBrowserSmokeArgs([
      "--",
      "node",
      "tests/含 空格/smoke test.mjs",
      "参数 含 空格",
    ]),
    {
      apiPort: 3894,
      command: [
        "node",
        "tests/含 空格/smoke test.mjs",
        "参数 含 空格",
      ],
      externalApi: false,
      forceOptimize: false,
      webPort: 5176,
    },
  );
});

test("parseBrowserSmokeArgs accepts explicit external API and force options", () => {
  assert.deepEqual(
    parseBrowserSmokeArgs([
      "--web-port",
      "5200",
      "--api-port=3900",
      "--external-api",
      "--force-optimize",
      "--",
      "custom command",
      "--child-option",
    ]),
    {
      apiPort: 3900,
      command: ["custom command", "--child-option"],
      externalApi: true,
      forceOptimize: true,
      webPort: 5200,
    },
  );
});

test("parseBrowserSmokeArgs rejects invalid CLI input with exit code 2", () => {
  const cases = [
    ["--unknown", "--", "node", "test.mjs"],
    ["--web-port", "abc", "--", "node", "test.mjs"],
    ["--web-port", "0", "--", "node", "test.mjs"],
    ["--web-port", "65536", "--", "node", "test.mjs"],
    ["--api-port", "3.5", "--external-api", "--", "node", "test.mjs"],
    ["--web-port", "5200", "--api-port", "5200", "--external-api", "--", "node", "test.mjs"],
    ["--web-port", "5176"],
    ["--web-port", "5176", "--"],
    ["--", ""],
    ["node", "test.mjs"],
  ];

  for (const argv of cases) {
    assert.throws(
      () => parseBrowserSmokeArgs(argv),
      (error) => error?.exitCode === 2,
      argv.join(" "),
    );
  }
});

test("invalid CLI input exits 2 before checking Playwright", () => {
  const result = spawnSync(
    process.execPath,
    [RUNNER, "--not-a-runner-option", "--", "node", "test.mjs"],
    {
      cwd: ROOT_DIR,
      encoding: "utf8",
      env: {
        ...process.env,
        PLAYWRIGHT_CHROME_EXECUTABLE: path.join(ROOT_DIR, "missing-browser"),
      },
    },
  );

  assert.equal(result.status, 2, result.stderr);
  assert.match(result.stderr, /unknown|not-a-runner-option/i);
});

test("resolveBrowserExecutable preserves an explicit existing executable", () => {
  assert.equal(
    resolveBrowserExecutable({ PLAYWRIGHT_CHROME_EXECUTABLE: process.execPath }),
    process.execPath,
  );
});

test("resolveBrowserExecutable uses the Playwright executable and explains installation", () => {
  assert.equal(
    resolveBrowserExecutable({}, {
      defaultExecutablePath: () => process.execPath,
    }),
    process.execPath,
  );

  assert.throws(
    () => resolveBrowserExecutable({}, {
      defaultExecutablePath: () => path.join(ROOT_DIR, "missing-chromium"),
    }),
    /npx playwright install chromium/i,
  );
});

test("runBrowserSmoke validates Chromium before starting a server", async () => {
  let serverStarted = false;
  await assert.rejects(
    runBrowserSmoke(
      parseBrowserSmokeArgs(["--", "node", "test.mjs"]),
      {
        env: {
          PLAYWRIGHT_CHROME_EXECUTABLE: path.join(ROOT_DIR, "missing-chromium"),
        },
        runWebSmoke: async () => {
          serverStarted = true;
        },
      },
    ),
    /npx playwright install chromium/i,
  );
  assert.equal(serverStarted, false);
});

test("runBrowserSmoke forwards ports, URL, force flag, browser, and command tokens", async (t) => {
  const directory = mkdtempSync(path.join(tmpdir(), "tracevane browser smoke 含 空格 "));
  t.after(() => removeFixtureDirectory(directory));
  const output = path.join(directory, "child output.json");
  const smoke = writeFixture(
    directory,
    "smoke child.mjs",
    `
      import { writeFileSync } from "node:fs";
      writeFileSync(${JSON.stringify(output)}, JSON.stringify({
        apiPort: process.env.TRACEVANE_API_PORT,
        argv: process.argv.slice(2),
        browser: process.env.PLAYWRIGHT_CHROME_EXECUTABLE,
        external: process.env.TRACEVANE_USE_EXTERNAL_API,
        force: process.env.TRACEVANE_SMOKE_FORCE_OPTIMIZE,
        url: process.env.TRACEVANE_WEB_SMOKE_URL,
        webPort: process.env.TRACEVANE_WEB_PORT,
      }), "utf8");
    `,
  );
  let selectedOptions;

  await runBrowserSmoke(
    parseBrowserSmokeArgs([
      "--web-port", "5210",
      "--api-port", "3910",
      "--external-api",
      "--force-optimize",
      "--",
      process.execPath,
      smoke,
      "参数 含 空格",
      "中文",
    ]),
    {
      cwd: directory,
      env: { PLAYWRIGHT_CHROME_EXECUTABLE: process.execPath },
      runExternalApiSmoke: async (options, callback) => {
        selectedOptions = options;
        return callback();
      },
      runWebSmoke: async () => assert.fail("web-only launcher was selected"),
    },
  );

  assert.equal(selectedOptions.rootDir, directory);
  assert.deepEqual(JSON.parse(readFileSync(output, "utf8")), {
    apiPort: "3910",
    argv: ["参数 含 空格", "中文"],
    browser: process.execPath,
    external: "1",
    force: "1",
    url: "http://127.0.0.1:5210",
    webPort: "5210",
  });
});

test("runBrowserSmoke propagates a failing child exit and cleans the owned server", async (t) => {
  const directory = mkdtempSync(path.join(tmpdir(), "tracevane-browser-runner-fail-"));
  t.after(() => removeFixtureDirectory(directory));
  const port = await reservePort();
  const pidFile = path.join(directory, "server.pid");
  const smoke = writeFixture(directory, "fail.mjs", "process.exit(7);\n");
  const runWebSmoke = createServerLauncher({ directory, pidFile, port });

  await assert.rejects(
    runBrowserSmoke(
      parseBrowserSmokeArgs(["--web-port", String(port), "--", process.execPath, smoke]),
      {
        cwd: directory,
        env: { PLAYWRIGHT_CHROME_EXECUTABLE: process.execPath },
        runWebSmoke,
      },
    ),
    (error) => error?.exitCode === 7,
  );

  const serverPid = Number(readFileSync(pidFile, "utf8"));
  await waitForProcessExit(serverPid);
  await assert.rejects(fetch(`http://127.0.0.1:${port}/`));
});

test("runBrowserSmoke cleans an owned server after readiness timeout", async (t) => {
  const directory = mkdtempSync(path.join(tmpdir(), "tracevane-browser-runner-timeout-"));
  t.after(() => removeFixtureDirectory(directory));
  const port = await reservePort();
  const pidFile = path.join(directory, "server.pid");
  const runWebSmoke = createServerLauncher({
    directory,
    mode: "hang",
    pidFile,
    port,
    timeoutMs: 100,
  });

  await assert.rejects(
    runBrowserSmoke(
      parseBrowserSmokeArgs(["--web-port", String(port), "--", process.execPath, "unused.mjs"]),
      {
        cwd: directory,
        env: { PLAYWRIGHT_CHROME_EXECUTABLE: process.execPath },
        runWebSmoke,
      },
    ),
    /Timed out waiting for HTTP readiness/i,
  );

  const serverPid = Number(readFileSync(pidFile, "utf8"));
  await waitForProcessExit(serverPid);
});

test("runBrowserSmoke maps a signaled smoke process and cleans the owned server", async (t) => {
  const directory = mkdtempSync(path.join(tmpdir(), "tracevane-browser-runner-signal-"));
  t.after(() => removeFixtureDirectory(directory));
  const port = await reservePort();
  const pidFile = path.join(directory, "server.pid");
  const smoke = writeFixture(
    directory,
    "signal.mjs",
    "setInterval(() => {}, 1_000);\n",
  );
  const runWebSmoke = createServerLauncher({ directory, pidFile, port });

  await assert.rejects(
    runBrowserSmoke(
      parseBrowserSmokeArgs(["--web-port", String(port), "--", process.execPath, smoke]),
      {
        cwd: directory,
        env: { PLAYWRIGHT_CHROME_EXECUTABLE: process.execPath },
        runSmokeCommand: (command, options) => runSmokeCommand(command, {
          ...options,
          spawnProcess: (...spawnArgs) => {
            const child = spawn(...spawnArgs);
            child.once("spawn", () => {
              setTimeout(() => child.kill("SIGTERM"), 50);
            });
            return child;
          },
        }),
        runWebSmoke,
      },
    ),
    (error) => error?.exitCode === 143,
  );

  const serverPid = Number(readFileSync(pidFile, "utf8"));
  await waitForProcessExit(serverPid);
});
