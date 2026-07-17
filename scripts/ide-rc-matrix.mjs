#!/usr/bin/env node
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { createNpmInvocation } from "./dev-runtime.mjs";
import { stopOwnedProcess } from "./lib/with-server.mjs";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const DEFAULT_COMMAND_TIMEOUT_MS = 420_000;
const DEFAULT_CLEANUP_TIMEOUT_MS = 15_000;

async function canListen(port) {
  return await new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.once("error", () => resolve(false));
    server.listen(port, "127.0.0.1", () => {
      server.close(() => resolve(true));
    });
  });
}

async function ephemeralPort() {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : null;
      server.close((error) => {
        if (error) reject(error);
        else if (!Number.isInteger(port)) reject(new Error("Ephemeral RC port allocation returned no TCP port"));
        else resolve(String(port));
      });
    });
  });
}

export async function resolveRcWebPort(preferredPort, excludedPorts = new Set()) {
  for (let port = preferredPort; port <= Math.min(65_535, preferredPort + 200); port += 1) {
    if (!excludedPorts.has(port) && await canListen(port)) return String(port);
  }
  for (;;) {
    const port = await ephemeralPort();
    if (!excludedPorts.has(Number(port))) return port;
  }
}

export const GROUPS = {
  fileSurface: [
    "smoke:file-manager:online-editor",
    "smoke:file-manager:online-editor-responsive",
    "smoke:file-manager:file-surface-routing",
    "smoke:file-manager:media-preview",
    "smoke:file-manager:file-operations",
    "smoke:file-manager:monaco-highlighting",
    "smoke:file-manager:monaco-clipboard",
    "smoke:file-manager:monaco-nls",
  ],
  workbenchEditor: [
    "smoke:ide:workbench-layout",
    "smoke:ide:editor-foundation",
    "smoke:ide:editor-save-dirty",
    "smoke:ide:editor-conflict-diff",
  ],
  terminal: [
    "smoke:ide:terminal-foundation",
    "smoke:ide:terminal-split-layout",
    "smoke:ide:terminal-panel-placement",
    "smoke:ide:terminal-persistence",
    "smoke:ide:terminal-manager",
    "smoke:ide:terminal-durable-backend",
  ],
  searchProblemsOutput: [
    "smoke:ide:watcher-foundation",
    "smoke:ide:search-foundation",
    "smoke:ide:problems-output",
  ],
  lsp: [
    "smoke:ide:lsp-diagnostics",
    "smoke:ide:lsp-interaction",
    "smoke:ide:lsp-typescript-diagnostics",
    "smoke:ide:lsp-typescript-interaction",
    "smoke:ide:lsp-typescript-completion",
    "smoke:ide:lsp-typescript-references",
    "smoke:ide:lsp-workspace-edit-foundation",
    "smoke:ide:lsp-rename-format-code-actions",
  ],
  git: [
    "smoke:ide:git-status",
    "smoke:ide:git-diff",
    "smoke:ide:git-stage",
    "smoke:ide:git-commit",
    "smoke:ide:git-branch-upstream",
    "smoke:ide:git-remote-foundation",
    "smoke:ide:git-branch-stash-foundation",
    "smoke:ide:git-branch-stash-hardening",
  ],
  debug: [
    "smoke:ide:debug-foundation",
    "smoke:ide:debug-breakpoints",
    "smoke:ide:debug-adapter-proof",
    "smoke:ide:debug-lifecycle",
    "smoke:ide:debug-launch-profile",
    "smoke:ide:debug-node-inspector",
    "smoke:ide:debug-controls-scopes",
    "smoke:ide:debug-watch-evaluate",
  ],
};

const QUICK = [
  "typecheck:api -- --pretty false",
  "typecheck:web -- --pretty false",
  "smoke:ide:workbench-layout",
  "smoke:ide:editor-foundation",
  "smoke:ide:terminal-foundation",
  "smoke:ide:search-foundation",
  "smoke:ide:problems-output",
  "smoke:ide:lsp-diagnostics",
  "smoke:ide:git-status",
  "smoke:ide:debug-foundation",
  ":git-diff-check",
];

const FULL = [
  "typecheck:api -- --pretty false",
  "typecheck:web -- --pretty false",
  ...Object.values(GROUPS).flat(),
  ":git-diff-check",
];

function usage(logger = console) {
  logger.log(`Tracevane IDE RC smoke matrix runner

Usage:
  node scripts/ide-rc-matrix.mjs --quick [--dry-run] [--continue-on-error]
  node scripts/ide-rc-matrix.mjs --full [--dry-run] [--continue-on-error]
  node scripts/ide-rc-matrix.mjs --domain=<${Object.keys(GROUPS).join("|")}> [--dry-run]
  node scripts/ide-rc-matrix.mjs --list [--quick|--full|--domain=<name>]

Notes:
  - Commands run sequentially through tokenized npm invocations.
  - Full matrix is intentionally long; use --quick for PR gate.
  - :git-diff-check runs \`git diff --check\` without a shell.
  - Smoke commands receive TRACEVANE_RC_WEB_PORT/TRACEVANE_WEB_PORT or 5310 as TRACEVANE_WEB_PORT; each npm alias owns its browser-smoke URL.
`);
}

export function selectedCommands(argv = []) {
  const args = new Set(argv);
  const domainArg = argv.find((arg) => arg.startsWith("--domain="));
  if (domainArg) {
    const name = domainArg.slice("--domain=".length);
    if (!GROUPS[name]) {
      throw new Error(
        `Unknown domain '${name}'. Expected one of: ${Object.keys(GROUPS).join(", ")}`,
      );
    }
    return GROUPS[name];
  }
  if (args.has("--full")) return FULL;
  if (args.has("--quick")) return QUICK;
  return QUICK;
}

function printCommands(commands, logger = console) {
  for (const command of commands) {
    logger.log(command.startsWith(":") ? command : `npm run ${command}`);
  }
}

export function cleanupSmokeArtifacts(cwd = process.cwd()) {
  const workbenchTestDir = path.join(cwd, "tests", "ide-workbench");
  const repoRootPatterns = [/^tracevane-terminal-focus-.*\.ts$/];
  const workbenchPatterns = [
    /^git-(?:status|diff|stage|commit|branch|remote)-smoke-.*\.txt$/,
    /^tracevane-terminal-focus-.*\.ts$/,
  ];

  for (const [directory, patterns] of [
    [cwd, repoRootPatterns],
    [workbenchTestDir, workbenchPatterns],
  ]) {
    let entries = [];
    try {
      entries = fs.readdirSync(directory, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      if (!patterns.some((pattern) => pattern.test(entry.name))) continue;
      try {
        fs.rmSync(path.join(directory, entry.name), { force: true });
      } catch {
        // Best-effort cleanup for failed smoke runs; the next command will
        // surface a real failure if stale artifacts still affect it.
      }
    }
  }
}

function npmArgsForCommand(command) {
  if (command === "typecheck:api -- --pretty false") {
    return ["run", "typecheck:api", "--", "--pretty", "false"];
  }
  if (command === "typecheck:web -- --pretty false") {
    return ["run", "typecheck:web", "--", "--pretty", "false"];
  }
  if (/\s/u.test(command) || command.startsWith(":")) {
    throw new Error(`Unsupported matrix command contract: ${command}`);
  }
  return ["run", command];
}

export function createMatrixInvocation(command, options = {}) {
  if (command === ":git-diff-check") {
    return {
      command: "git",
      args: ["diff", "--check"],
      options: { shell: false },
    };
  }
  return createNpmInvocation(npmArgsForCommand(command), options);
}

function signalExitCode(signal) {
  if (signal === "SIGINT") return 130;
  if (signal === "SIGTERM") return 143;
  if (signal === "SIGHUP") return 129;
  return 1;
}

export function runOwnedInvocation(
  invocation,
  {
    cwd = process.cwd(),
    env = process.env,
    platform = process.platform,
    signalEmitter = process,
    spawnImpl = spawn,
    stopOwnedProcessImpl = stopOwnedProcess,
    timeoutMs = DEFAULT_COMMAND_TIMEOUT_MS,
    cleanupTimeoutMs = DEFAULT_CLEANUP_TIMEOUT_MS,
  } = {},
) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error("TRACEVANE_RC_COMMAND_TIMEOUT_MS must be a positive finite number");
  }
  if (!Number.isFinite(cleanupTimeoutMs) || cleanupTimeoutMs <= 0) {
    throw new Error("RC cleanup timeout must be a positive finite number");
  }

  return new Promise((resolve) => {
    let child;
    try {
      child = spawnImpl(invocation.command, invocation.args, {
        cwd,
        detached: platform !== "win32",
        env,
        stdio: "inherit",
        windowsHide: true,
        ...invocation.options,
        shell: false,
      });
    } catch (error) {
      resolve({ code: 1, error });
      return;
    }

    let completed = false;
    let cleaning = false;
    let timer;

    const signalHandlers = new Map();
    const removeListeners = () => {
      clearTimeout(timer);
      child.off("error", onError);
      child.off("close", onClose);
      for (const [signal, handler] of signalHandlers) {
        signalEmitter.off(signal, handler);
      }
      signalHandlers.clear();
    };
    const finish = (result) => {
      if (completed || cleaning) return;
      completed = true;
      removeListeners();
      resolve(result);
    };
    const finishAfterCleanup = (result) => {
      if (completed || cleaning) return;
      cleaning = true;
      removeListeners();
      let cleanup;
      try {
        cleanup = stopOwnedProcessImpl(child);
      } catch (cleanupError) {
        completed = true;
        resolve({ ...result, cleanupError });
        return;
      }
      let cleanupSettled = false;
      const cleanupTimer = setTimeout(() => {
        if (cleanupSettled) return;
        cleanupSettled = true;
        completed = true;
        resolve({
          ...result,
          cleanupError: new Error(`Owned process cleanup timed out after ${cleanupTimeoutMs}ms`),
        });
      }, cleanupTimeoutMs);
      void Promise.resolve(cleanup).then(
        () => {
          if (cleanupSettled) return;
          cleanupSettled = true;
          clearTimeout(cleanupTimer);
          completed = true;
          resolve(result);
        },
        (cleanupError) => {
          if (cleanupSettled) return;
          cleanupSettled = true;
          clearTimeout(cleanupTimer);
          completed = true;
          resolve({ ...result, cleanupError });
        },
      );
    };
    const onError = (error) => finish({ code: 1, error });
    const onClose = (code, signal) => finish({
      code: code ?? signalExitCode(signal),
      signal,
    });

    child.once("error", onError);
    child.once("close", onClose);
    for (const signal of ["SIGINT", "SIGTERM"]) {
      const handler = () => finishAfterCleanup({
        code: signalExitCode(signal),
        interrupted: true,
        signal,
      });
      signalHandlers.set(signal, handler);
      signalEmitter.once(signal, handler);
    }
    timer = setTimeout(() => finishAfterCleanup({
      code: 124,
      signal: "TIMEOUT",
      timedOut: true,
    }), timeoutMs);
  });
}

function displayCommand(command) {
  return command === ":git-diff-check" ? "git diff --check" : `npm run ${command}`;
}

export async function runMatrixCommand(
  command,
  {
    cwd = process.cwd(),
    env = process.env,
    logger = console,
    rcWebPort = env.TRACEVANE_RC_WEB_PORT || env.TRACEVANE_WEB_PORT || "5310",
    commandTimeoutMs = DEFAULT_COMMAND_TIMEOUT_MS,
    createMatrixInvocationImpl = createMatrixInvocation,
    runOwnedInvocationImpl = runOwnedInvocation,
    ownedInvocationOptions = {},
  } = {},
) {
  cleanupSmokeArtifacts(cwd);
  const isSmokeCommand = command.startsWith("smoke:");
  const commandEnv = isSmokeCommand
    ? { ...env, TRACEVANE_WEB_PORT: String(rcWebPort) }
    : env;
  const envLabel = isSmokeCommand
    ? ` TRACEVANE_WEB_PORT=${commandEnv.TRACEVANE_WEB_PORT}`
    : "";
  logger.log(`\n[ide-rc]${envLabel} ${displayCommand(command)}`);

  const invocation = createMatrixInvocationImpl(command, { env: commandEnv });
  try {
    const result = await runOwnedInvocationImpl(invocation, {
      cwd,
      env: commandEnv,
      timeoutMs: commandTimeoutMs,
      ...ownedInvocationOptions,
    });
    return { command, ...result };
  } finally {
    cleanupSmokeArtifacts(cwd);
  }
}

function commandTimeout(env) {
  const timeoutMs = Number(
    env.TRACEVANE_RC_COMMAND_TIMEOUT_MS || DEFAULT_COMMAND_TIMEOUT_MS,
  );
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error("TRACEVANE_RC_COMMAND_TIMEOUT_MS must be a positive finite number");
  }
  return timeoutMs;
}

export async function main(argv = process.argv.slice(2), options = {}) {
  const env = options.env ?? process.env;
  const cwd = options.cwd ?? process.cwd();
  const logger = options.logger ?? console;
  const args = new Set(argv);

  try {
    if (args.has("--help") || args.has("-h")) {
      usage(logger);
      return 0;
    }

    const commands = selectedCommands(argv);
    if (args.has("--list") || args.has("--dry-run")) {
      printCommands(commands, logger);
      return 0;
    }

    const rcWebPort = env.TRACEVANE_RC_WEB_PORT || env.TRACEVANE_WEB_PORT || "5310";
    const rcWebPortBase = Number(rcWebPort);
    if (!Number.isInteger(rcWebPortBase) || rcWebPortBase <= 0 || rcWebPortBase + commands.length > 65_535) {
      throw new Error("TRACEVANE_RC_WEB_PORT must leave room for one isolated port per matrix command");
    }
    const commandTimeoutMs = commandTimeout(env);
    const failures = [];
    const runMatrixCommandImpl = options.runMatrixCommandImpl ?? runMatrixCommand;
    const resolveRcWebPortImpl = options.resolveRcWebPortImpl ?? resolveRcWebPort;
    const assignedWebPorts = new Set();

    for (const [commandIndex, command] of commands.entries()) {
      const commandWebPort = await resolveRcWebPortImpl(rcWebPortBase + commandIndex, assignedWebPorts);
      assignedWebPorts.add(Number(commandWebPort));
      const result = await runMatrixCommandImpl(command, {
        cwd,
        env,
        logger,
        rcWebPort: commandWebPort,
        commandTimeoutMs,
        ...options.commandOptions,
      });
      if (result.code !== 0) {
        failures.push(result);
        if (
          result.interrupted ||
          result.cleanupError ||
          !args.has("--continue-on-error")
        ) break;
      }
    }

    if (failures.length > 0) {
      logger.error("\n[ide-rc] failures:");
      for (const failure of failures) {
        logger.error(
          `- ${failure.command}: exit ${failure.code}` +
          `${failure.signal ? ` signal ${failure.signal}` : ""}` +
          `${failure.cleanupError ? ` cleanup failed: ${failure.cleanupError.message}` : ""}`,
        );
      }
      const interrupted = failures.find((failure) => failure.interrupted);
      if (interrupted && !interrupted.cleanupError) return interrupted.code;
      return 1;
    }

    logger.log("\n[ide-rc] matrix completed successfully");
    return 0;
  } catch (error) {
    logger.error(error instanceof Error ? error.message : String(error));
    usage(logger);
    return 1;
  }
}

export function isMainModule() {
  return Boolean(process.argv[1] && path.resolve(process.argv[1]) === path.resolve(SCRIPT_PATH));
}

if (isMainModule()) {
  process.exitCode = await main();
}
