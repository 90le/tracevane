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
const PACKAGE_JSON = JSON.parse(
  readFileSync(path.join(ROOT_DIR, "package.json"), "utf8"),
);

const EXPECTED_BROWSER_ALIAS_CONTRACTS = {
  "smoke:file-manager:mobile-layout": ["tests/file-manager/file-manager-mobile-layout.smoke.mjs", 5176, 3894, false, false, false],
  "smoke:file-manager:text-editor": ["tests/file-manager/file-manager-text-editor.smoke.mjs", 5176, 3894, false, false, false],
  "smoke:file-manager:selection": ["tests/file-manager/file-manager-selection.smoke.mjs", 5176, 3894, false, false, false],
  "smoke:file-manager:content-index": ["tests/file-manager/file-manager-content-index.smoke.mjs", 5176, 3894, false, false, false],
  "smoke:file-manager:quick-paste-upload": ["tests/file-manager/file-manager-quick-paste-upload.smoke.mjs", 5176, 3894, false, false, false],
  "smoke:file-manager:upload-conflicts": ["tests/file-manager/file-manager-upload-conflicts.smoke.mjs", 5176, 3894, false, false, false],
  "smoke:file-manager:list-preferences": ["tests/file-manager/file-manager-list-preferences.smoke.mjs", 5176, 3894, false, true, false],
  "smoke:file-manager:large-directory": ["tests/file-manager/file-manager-large-directory.smoke.mjs", 5176, 3894, false, false, false],
  "smoke:file-manager:file-operations": ["tests/file-manager/file-manager-file-operations.smoke.mjs", 5176, 3894, false, false, false],
  "smoke:file-manager:upload-resumable": ["tests/file-manager/file-manager-upload-resumable.smoke.mjs", 5176, 3894, false, false, false],
  "smoke:file-manager:online-editor": ["tests/file-manager/file-manager-online-editor.smoke.mjs", 5176, 3894, false, false, false],
  "smoke:file-manager:online-editor-responsive": ["tests/file-manager/file-manager-online-editor-responsive.smoke.mjs", 5176, 3894, false, false, false],
  "smoke:file-manager:favorites": ["tests/file-manager/file-manager-favorites.smoke.mjs", 5176, 3894, false, false, false],
  "smoke:file-manager:monaco-highlighting": ["tests/file-manager/file-manager-monaco-highlighting.smoke.mjs", 5176, 3894, false, false, false],
  "smoke:file-manager:monaco-clipboard": ["tests/file-manager/file-manager-monaco-clipboard.smoke.mjs", 5176, 3894, false, false, false],
  "smoke:file-manager:monaco-nls": ["tests/file-manager/file-manager-monaco-nls.smoke.mjs", 5176, 3894, false, false, false],
  "smoke:file-manager:file-surface-routing": ["tests/file-manager/file-manager-file-surface-routing.smoke.mjs", 5176, 3894, false, false, false],
  "smoke:file-manager:media-preview": ["tests/file-manager/file-manager-media-preview.smoke.mjs", 5176, 3894, false, false, false],
  "smoke:ide:workbench-layout": ["tests/ide-workbench/ide-workbench-layout.smoke.mjs", 5176, 3894, false, false, false],
  "smoke:ide:explorer-mainline": ["tests/ide-workbench/ide-explorer-mainline.smoke.mjs", 5176, 3894, false, false, false],
  "smoke:ide:editor-foundation": ["tests/ide-workbench/ide-editor-foundation.smoke.mjs", 5176, 3894, false, false, false],
  "smoke:ide:terminal-foundation": ["tests/ide-workbench/ide-terminal-foundation.smoke.mjs", 5176, 3894, false, false, false],
  "smoke:ide:terminal-split-layout": ["tests/ide-workbench/ide-terminal-split-layout.smoke.mjs", 5176, 3894, false, false, false],
  "smoke:ide:terminal-panel-placement": ["tests/ide-workbench/ide-terminal-panel-placement.smoke.mjs", 5176, 3894, false, false, false],
  "smoke:ide:terminal-persistence": ["tests/ide-workbench/ide-terminal-persistence.smoke.mjs", 5176, 3894, false, false, false],
  "smoke:ide:terminal-durable-backend": ["tests/ide-workbench/ide-terminal-durable-backend.smoke.mjs", 5176, 3894, false, false, false],
  "smoke:ide:editor-save-dirty": ["tests/ide-workbench/ide-editor-save-dirty.smoke.mjs", 5176, 3894, false, false, false],
  "smoke:ide:terminal-manager": ["tests/ide-workbench/ide-terminal-manager.smoke.mjs", 5176, 3894, false, false, false],
  "smoke:ide:watcher-foundation": ["tests/ide-workbench/ide-watcher-foundation.smoke.mjs", 5176, 3894, false, false, false],
  "smoke:ide:search-foundation": ["tests/ide-workbench/ide-search-foundation.smoke.mjs", 5176, 3894, false, false, false],
  "smoke:ide:editor-conflict-diff": ["tests/ide-workbench/ide-editor-conflict-diff.smoke.mjs", 5176, 3894, false, false, false],
  "smoke:ide:problems-output": ["tests/ide-workbench/ide-problems-output.smoke.mjs", 5176, 3894, false, false, false],
  "smoke:ide:lsp-diagnostics": ["tests/ide-workbench/ide-lsp-diagnostics.smoke.mjs", 5194, 3894, true, false, false],
  "smoke:ide:lsp-interaction": ["tests/ide-workbench/ide-lsp-interaction.smoke.mjs", 5195, 3895, true, false, false],
  "smoke:ide:git-status": ["tests/ide-workbench/ide-git-status.smoke.mjs", 5176, 3894, false, false, false],
  "smoke:ide:git-diff": ["tests/ide-workbench/ide-git-diff.smoke.mjs", 5176, 3894, false, false, false],
  "smoke:ide:git-stage": ["tests/ide-workbench/ide-git-stage.smoke.mjs", 5176, 3894, false, false, false],
  "smoke:ide:git-commit": ["tests/ide-workbench/ide-git-commit.smoke.mjs", 5176, 3894, false, false, false],
  "smoke:ide:git-branch-upstream": ["tests/ide-workbench/ide-git-branch-upstream.smoke.mjs", 5176, 3894, false, false, false],
  "smoke:ide:debug-foundation": ["tests/ide-workbench/ide-debug-foundation.smoke.mjs", 5186, 3894, false, false, false],
  "smoke:ide:debug-breakpoints": ["tests/ide-workbench/ide-debug-breakpoints.smoke.mjs", 5187, 3894, false, false, false],
  "smoke:ide:debug-adapter-proof": ["tests/ide-workbench/ide-debug-adapter-proof.smoke.mjs", 5188, 3894, false, false, false],
  "smoke:ide:debug-lifecycle": ["tests/ide-workbench/ide-debug-lifecycle.smoke.mjs", 5189, 3894, false, false, false],
  "smoke:ide:debug-launch-profile": ["tests/ide-workbench/ide-debug-launch-profile.smoke.mjs", 5190, 3894, false, false, false],
  "smoke:ide:debug-node-inspector": ["tests/ide-workbench/ide-debug-node-inspector.smoke.mjs", 5191, 3894, false, false, false],
  "smoke:ide:debug-controls-scopes": ["tests/ide-workbench/ide-debug-controls-scopes.smoke.mjs", 5192, 3894, false, false, false],
  "smoke:ide:debug-watch-evaluate": ["tests/ide-workbench/ide-debug-watch-evaluate.smoke.mjs", 5193, 3894, false, false, false],
  "smoke:ide:lsp-typescript-diagnostics": ["tests/ide-workbench/ide-lsp-typescript-diagnostics.smoke.mjs", 5196, 3896, true, false, false],
  "smoke:ide:lsp-typescript-interaction": ["tests/ide-workbench/ide-lsp-typescript-interaction.smoke.mjs", 5197, 3897, true, false, false],
  "smoke:ide:lsp-typescript-completion": ["tests/ide-workbench/ide-lsp-typescript-completion.smoke.mjs", 5198, 3898, true, false, false],
  "smoke:ide:lsp-typescript-references": ["tests/ide-workbench/ide-lsp-typescript-references.smoke.mjs", 5199, 3899, true, false, false],
  "smoke:ide:git-remote-foundation": ["tests/ide-workbench/ide-git-remote-foundation.smoke.mjs", 5186, 3894, false, false, false],
  "smoke:ide:lsp-workspace-edit-foundation": ["tests/ide-workbench/ide-lsp-workspace-edit-foundation.smoke.mjs", 5200, 3900, true, false, false],
  "smoke:ide:lsp-rename-format-code-actions": ["tests/ide-workbench/ide-lsp-rename-format-code-actions.smoke.mjs", 5201, 3901, true, false, false],
  "smoke:ide:lsp-semantic-tokens": ["tests/ide-workbench/ide-lsp-semantic-tokens.smoke.mjs", 5211, 3902, true, false, false],
  "smoke:ide:git-branch-stash-foundation": ["tests/ide-workbench/ide-git-branch-stash-foundation.smoke.mjs", 5202, 3894, false, false, false],
  "smoke:ide:git-branch-stash-hardening": ["tests/ide-workbench/ide-git-branch-stash-hardening.smoke.mjs", 5204, 3894, false, false, false],
  "smoke:ide:git-branch-management": ["tests/ide-workbench/ide-git-branch-management.smoke.mjs", 5208, 3894, false, false, false],
  "smoke:ide:git-graph-blame": ["tests/ide-workbench/ide-git-graph-blame.smoke.mjs", 5210, 3894, false, false, false],
  "smoke:ide:lsp-workspace-symbols": ["tests/ide-workbench/ide-lsp-workspace-symbols.smoke.mjs", 5212, 3903, true, false, false],
  "smoke:ide:command-palette": ["tests/ide-workbench/ide-command-palette.smoke.mjs", 5213, 3904, true, false, false],
  "smoke:ide:lsp-html-css-providers": ["tests/ide-workbench/ide-lsp-html-css-providers.smoke.mjs", 5214, 3905, true, false, false],
  "smoke:ide:lsp-provider-status": ["tests/ide-workbench/ide-lsp-provider-status.smoke.mjs", 5215, 3906, true, false, false],
  "smoke:ide:editor-edge-files": ["tests/ide-workbench/ide-editor-edge-files.smoke.mjs", 5176, 3894, false, false, false],
  "smoke:ide:responsive-mainline": ["tests/ide-workbench/ide-responsive-mainline.smoke.mjs", 5176, 3894, false, false, false],
  "smoke:ide:mainline-persistence": ["tests/ide-workbench/ide-mainline-persistence.smoke.mjs", 5176, 3894, false, false, false],
  "smoke:ide:web-stack-mainline": ["tests/ide-workbench/ide-web-stack-mainline.smoke.mjs", 5216, 3907, true, false, true],
};

function smokeAliases() {
  return Object.fromEntries(
    Object.entries(PACKAGE_JSON.scripts).filter(([name]) => (
      name.startsWith("smoke:file-manager:") || name.startsWith("smoke:ide:")
    )),
  );
}

function optionValue(tokens, option) {
  const index = tokens.indexOf(option);
  assert.notEqual(index, -1, `${option} is required`);
  assert.ok(tokens[index + 1], `${option} needs a value`);
  return Number(tokens[index + 1]);
}

function decodeMigratedAlias(name, command) {
  if (name === "smoke:ide:terminal-durable-backend") {
    assert.equal(
      command,
      "node tests/ide-workbench/ide-terminal-durable-backend.smoke.mjs",
    );
    return [
      "tests/ide-workbench/ide-terminal-durable-backend.smoke.mjs",
      5176,
      3894,
      false,
      false,
      false,
    ];
  }

  const buildPrefix = command.startsWith("npm run build:api && ");
  const runnerCommand = buildPrefix
    ? command.slice("npm run build:api && ".length)
    : command;
  const tokens = runnerCommand.split(/\s+/);
  assert.deepEqual(
    tokens.slice(0, 2),
    ["node", "scripts/run-browser-smoke.mjs"],
    name,
  );
  const separator = tokens.indexOf("--");
  assert.notEqual(separator, -1, `${name} needs a command separator`);
  const options = tokens.slice(2, separator);
  assert.equal(options.includes("--web-port"), false, `${name} must allow web env overrides`);
  assert.equal(options.includes("--api-port"), false, `${name} must allow API env overrides`);
  const smokeCommand = tokens.slice(separator + 1);
  assert.equal(smokeCommand[0], "node", `${name} needs a Node smoke command`);
  assert.equal(smokeCommand.length, 2, `${name} must preserve one smoke file`);

  return [
    smokeCommand[1],
    optionValue(options, "--web-port-fallback"),
    optionValue(options, "--api-port-fallback"),
    options.includes("--external-api"),
    options.includes("--force-optimize"),
    buildPrefix,
  ];
}

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

async function removeFixtureDirectory(directory) {
  const deadline = Date.now() + 3_000;
  while (true) {
    try {
      rmSync(directory, { force: true, recursive: true });
      return;
    } catch (error) {
      const isTransientWindowsHandle = ["EBUSY", "ENOTEMPTY", "EPERM"]
        .includes(error?.code);
      if (!isTransientWindowsHandle || Date.now() >= deadline) throw error;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
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
    ], {}),
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
    ], {}),
    {
      apiPort: 3900,
      command: ["custom command", "--child-option"],
      externalApi: true,
      forceOptimize: true,
      webPort: 5200,
    },
  );
});

test("parseBrowserSmokeArgs resolves explicit ports before env and alias fallbacks", () => {
  const env = {
    TRACEVANE_API_PORT: "4900",
    TRACEVANE_WEB_PORT: "5900",
  };

  assert.deepEqual(
    parseBrowserSmokeArgs([
      "--web-port-fallback", "5186",
      "--api-port-fallback", "3888",
      "--external-api",
      "--",
      "node",
      "test.mjs",
    ], env),
    {
      apiPort: 4900,
      command: ["node", "test.mjs"],
      externalApi: true,
      forceOptimize: false,
      webPort: 5900,
    },
  );

  assert.deepEqual(
    parseBrowserSmokeArgs([
      "--web-port", "6200",
      "--api-port", "4200",
      "--web-port-fallback", "5186",
      "--api-port-fallback", "3888",
      "--external-api",
      "--",
      "node",
      "test.mjs",
    ], env),
    {
      apiPort: 4200,
      command: ["node", "test.mjs"],
      externalApi: true,
      forceOptimize: false,
      webPort: 6200,
    },
  );
});

test("parseBrowserSmokeArgs does not parse env ports overridden by explicit options", () => {
  assert.deepEqual(
    parseBrowserSmokeArgs([
      "--web-port", "6200",
      "--api-port", "4200",
      "--external-api",
      "--",
      "node",
      "test.mjs",
    ], {
      TRACEVANE_API_PORT: "invalid-overridden-api",
      TRACEVANE_WEB_PORT: "invalid-overridden-web",
    }),
    {
      apiPort: 4200,
      command: ["node", "test.mjs"],
      externalApi: true,
      forceOptimize: false,
      webPort: 6200,
    },
  );
});

test("parseBrowserSmokeArgs rejects invalid env and fallback ports with exit code 2", () => {
  const cases = [
    {
      argv: ["--web-port-fallback", "0", "--", "node", "test.mjs"],
      env: {},
    },
    {
      argv: ["--api-port-fallback", "65536", "--external-api", "--", "node", "test.mjs"],
      env: {},
    },
    {
      argv: ["--web-port-fallback", "5186", "--", "node", "test.mjs"],
      env: { TRACEVANE_WEB_PORT: "invalid" },
    },
    {
      argv: ["--api-port-fallback", "3888", "--external-api", "--", "node", "test.mjs"],
      env: { TRACEVANE_API_PORT: "3.5" },
    },
    {
      argv: [
        "--web-port-fallback", "5186",
        "--api-port-fallback", "3888",
        "--external-api",
        "--",
        "node",
        "test.mjs",
      ],
      env: { TRACEVANE_API_PORT: "6200", TRACEVANE_WEB_PORT: "6200" },
    },
  ];

  for (const { argv, env } of cases) {
    assert.throws(
      () => parseBrowserSmokeArgs(argv, env),
      (error) => error?.exitCode === 2,
      `${JSON.stringify(env)} ${argv.join(" ")}`,
    );
  }
});

test("parseBrowserSmokeArgs ignores an unused API env value for web-only smoke", () => {
  assert.deepEqual(
    parseBrowserSmokeArgs(
      ["--web-port-fallback", "5186", "--", "node", "test.mjs"],
      {
        TRACEVANE_API_PORT: "legacy-invalid-value",
        TRACEVANE_WEB_PORT: "6186",
      },
    ),
    {
      apiPort: 3894,
      command: ["node", "test.mjs"],
      externalApi: false,
      forceOptimize: false,
      webPort: 6186,
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
      () => parseBrowserSmokeArgs(argv, {}),
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

test("all 67 browser aliases preserve their frozen command contracts", () => {
  const aliases = smokeAliases();
  assert.equal(Object.keys(aliases).length, 67);
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(aliases).map(([name, command]) => [
        name,
        decodeMigratedAlias(name, command),
      ]),
    ),
    EXPECTED_BROWSER_ALIAS_CONTRACTS,
  );
});

test("the 66 runner aliases contain no Linux-only shell orchestration", () => {
  const aliases = smokeAliases();
  const migrated = Object.entries(aliases).filter(([name]) => (
    name !== "smoke:ide:terminal-durable-backend"
  ));
  assert.equal(migrated.length, 66);

  for (const [name, command] of migrated) {
    assert.match(command, /(?:^|&& )node scripts\/run-browser-smoke\.mjs /, name);
    assert.doesNotMatch(command, /python\s+\/home\//, name);
    assert.doesNotMatch(command, /exec bash scripts\//, name);
    assert.doesNotMatch(command, /\$\{TRACEVANE_[^}]*:-/, name);
    assert.doesNotMatch(command, /(?:^|&&\s+)TRACEVANE_[A-Z_]+=/, name);
  }
});

test("the browser runner never asks child_process to use a shell", () => {
  const source = readFileSync(RUNNER, "utf8");
  assert.match(source, /shell:\s*false/);
  assert.doesNotMatch(source, /shell:\s*true/);
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
      parseBrowserSmokeArgs(["--", "node", "test.mjs"], {}),
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

test("runBrowserSmoke gives explicit ports precedence in a clean child fixture", async (t) => {
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
  const env = {
    PLAYWRIGHT_CHROME_EXECUTABLE: process.execPath,
    TRACEVANE_API_PORT: "4999",
    TRACEVANE_WEB_PORT: "5999",
  };

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
    ], env),
    {
      cwd: directory,
      env,
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

test("runBrowserSmoke applies env port overrides in a clean child fixture", async (t) => {
  const directory = mkdtempSync(path.join(tmpdir(), "tracevane browser env override "));
  t.after(() => removeFixtureDirectory(directory));
  const output = path.join(directory, "env output.json");
  const smoke = writeFixture(
    directory,
    "env smoke.mjs",
    `
      import { writeFileSync } from "node:fs";
      writeFileSync(${JSON.stringify(output)}, JSON.stringify({
        apiPort: process.env.TRACEVANE_API_PORT,
        url: process.env.TRACEVANE_WEB_SMOKE_URL,
        webPort: process.env.TRACEVANE_WEB_PORT,
      }), "utf8");
    `,
  );
  const env = {
    PLAYWRIGHT_CHROME_EXECUTABLE: process.execPath,
    TRACEVANE_API_PORT: "4899",
    TRACEVANE_WEB_PORT: "5899",
  };

  await runBrowserSmoke(
    parseBrowserSmokeArgs([
      "--web-port-fallback", "5194",
      "--api-port-fallback", "3894",
      "--external-api",
      "--",
      process.execPath,
      smoke,
    ], env),
    {
      cwd: directory,
      env,
      runExternalApiSmoke: async (_options, callback) => callback(),
    },
  );

  assert.deepEqual(JSON.parse(readFileSync(output, "utf8")), {
    apiPort: "4899",
    url: "http://127.0.0.1:5899",
    webPort: "5899",
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
      parseBrowserSmokeArgs(["--web-port", String(port), "--", process.execPath, smoke], {}),
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
      parseBrowserSmokeArgs(["--web-port", String(port), "--", process.execPath, "unused.mjs"], {}),
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
      parseBrowserSmokeArgs(["--web-port", String(port), "--", process.execPath, smoke], {}),
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
