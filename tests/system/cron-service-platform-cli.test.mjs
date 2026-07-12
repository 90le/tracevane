import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { createCronService } from "../../dist/apps/api/modules/cron/service.js";

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function createConfig(root) {
  return {
    pluginId: "tracevane",
    pluginName: "Tracevane",
    version: "0.1.0",
    port: 3760,
    autoStart: false,
    openclawRoot: root,
    openclawConfigFile: path.join(root, "openclaw.json"),
    projectRoot: root,
    webDistDir: path.join(root, "apps", "web", "dist"),
    gatewayPort: 31879,
    gatewayWsUrl: "ws://127.0.0.1:31879",
    gatewayControlUiBasePath: "",
    transport: {
      standalone: { enabled: true, port: 3760 },
      gateway: { enabled: false, basePath: "/tracevane" },
    },
  };
}

function writeFakeOpenClawCommand(binDir) {
  fs.mkdirSync(binDir, { recursive: true });
  const runnerPath = path.join(binDir, "fake-openclaw.cjs");
  fs.writeFileSync(
    runnerPath,
    `const fs = require("node:fs");
const args = process.argv.slice(2);
fs.appendFileSync(process.env.TRACEVANE_FAKE_OPENCLAW_LOG, JSON.stringify(args) + "\\n", "utf8");
if (args.join(" ") === "cron status --json") {
  process.stdout.write(JSON.stringify({ jobs: 7, nextWakeAtMs: 1767225600000 }));
  process.exit(0);
}
if (args[0] === "cron" && args[1] === "run") {
  process.stdout.write("CRON_RUN_OK " + args[2]);
  process.exit(0);
}
process.stderr.write("unexpected args: " + JSON.stringify(args));
process.exit(2);
`,
    "utf8",
  );

  if (process.platform === "win32") {
    fs.writeFileSync(
      path.join(binDir, "openclaw.cmd"),
      `@echo off\r\n"${process.execPath}" "%~dp0fake-openclaw.cjs" %*\r\n`,
      "utf8",
    );
    return;
  }

  const commandPath = path.join(binDir, "openclaw");
  fs.writeFileSync(
    commandPath,
    `#!/usr/bin/env node\n${fs.readFileSync(runnerPath, "utf8")}`,
    { encoding: "utf8", mode: 0o755 },
  );
  fs.chmodSync(commandPath, 0o755);
}

function processIsAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

async function waitUntil(check, timeoutMs = 3_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (check()) return true;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return check();
}

function forceStopFixture(pid) {
  if (!pid || !processIsAlive(pid)) return;
  if (process.platform === "win32") {
    spawnSync("taskkill.exe", ["/PID", String(pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
    return;
  }
  try {
    process.kill(pid, "SIGKILL");
  } catch {
    // The process may have exited between the liveness probe and signal.
  }
}

test("cron service launches the platform-native OpenClaw command for status and run", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tracevane cron CLI 测试 "));
  const binDir = path.join(root, "OpenClaw CLI bin");
  const logPath = path.join(root, "openclaw-calls.jsonl");
  const previousPath = process.env.PATH;
  const previousLog = process.env.TRACEVANE_FAKE_OPENCLAW_LOG;
  writeFakeOpenClawCommand(binDir);
  process.env.PATH = [binDir, previousPath || ""].filter(Boolean).join(path.delimiter);
  process.env.TRACEVANE_FAKE_OPENCLAW_LOG = logPath;

  try {
    const config = createConfig(root);
    writeJson(config.openclawConfigFile, { cron: { enabled: true } });
    writeJson(path.join(root, "cron", "jobs.json"), {
      version: 1,
      jobs: [{
        id: "job-platform-cli",
        name: "Platform CLI job",
        enabled: true,
        schedule: { kind: "every", everyMs: 60_000 },
        sessionTarget: "isolated",
        payload: { kind: "agentTurn", message: "run the platform CLI test" },
        delivery: { mode: "silent" },
        state: {},
      }],
    });
    const service = createCronService(config);

    const summary = await service.getSummary();
    assert.equal(summary.scheduler.live.source, "cli");
    assert.equal(summary.scheduler.live.jobs, 7);
    assert.equal(summary.scheduler.live.error, "");

    const run = await service.runJob("job-platform-cli");
    assert.equal(run.success, true);
    assert.match(run.output, /CRON_RUN_OK job-platform-cli/);

    const calls = fs.readFileSync(logPath, "utf8").trim().split(/\r?\n/).map((line) => JSON.parse(line));
    assert.ok(calls.some((args) => args.join(" ") === "cron status --json"));
    assert.ok(calls.some((args) => args.join(" ") === "cron run job-platform-cli"));
  } finally {
    if (previousPath === undefined) delete process.env.PATH;
    else process.env.PATH = previousPath;
    if (previousLog === undefined) delete process.env.TRACEVANE_FAKE_OPENCLAW_LOG;
    else process.env.TRACEVANE_FAKE_OPENCLAW_LOG = previousLog;
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});

test("cron live status timeout removes the platform-native OpenClaw process tree", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tracevane cron timeout 测试 "));
  const binDir = path.join(root, "OpenClaw timeout CLI bin");
  const runnerPath = path.join(binDir, "hanging-openclaw.cjs");
  const descendantPath = path.join(binDir, "cron-status-descendant.cjs");
  const descendantPidPath = path.join(root, "cron-status-descendant.pid");
  const previousPath = process.env.PATH;
  let descendantPid = 0;
  fs.mkdirSync(binDir, { recursive: true });
  fs.writeFileSync(
    descendantPath,
    "process.on('SIGTERM', () => {}); setInterval(() => {}, 1_000);\n",
    "utf8",
  );
  fs.writeFileSync(
    runnerPath,
    `const fs = require("node:fs");
const { spawn } = require("node:child_process");
const args = process.argv.slice(2);
if (args.join(" ") !== "cron status --json") process.exit(2);
const child = spawn(process.execPath, [${JSON.stringify(descendantPath)}], { stdio: "ignore" });
fs.writeFileSync(${JSON.stringify(descendantPidPath)}, String(child.pid), "utf8");
setInterval(() => {}, 1_000);
`,
    "utf8",
  );
  if (process.platform === "win32") {
    fs.writeFileSync(
      path.join(binDir, "openclaw.cmd"),
      `@echo off\r\n"${process.execPath}" "%~dp0hanging-openclaw.cjs" %*\r\n`,
      "utf8",
    );
  } else {
    const commandPath = path.join(binDir, "openclaw");
    fs.writeFileSync(
      commandPath,
      `#!/usr/bin/env node\n${fs.readFileSync(runnerPath, "utf8")}`,
      { encoding: "utf8", mode: 0o755 },
    );
    fs.chmodSync(commandPath, 0o755);
  }
  process.env.PATH = [binDir, previousPath || ""].filter(Boolean).join(path.delimiter);

  try {
    const config = createConfig(root);
    writeJson(config.openclawConfigFile, { cron: { enabled: true } });
    const startedAt = Date.now();
    const summary = await createCronService(config).getSummary();
    const elapsedMs = Date.now() - startedAt;
    descendantPid = Number(fs.readFileSync(descendantPidPath, "utf8"));

    assert.equal(summary.scheduler.live.source, "derived");
    assert.match(summary.scheduler.live.error, /timed?\s*out|ETIMEDOUT/i);
    assert.equal(
      await waitUntil(() => !processIsAlive(descendantPid)),
      true,
      "cron status timeout must leave no descendant alive",
    );
    assert.ok(elapsedMs >= 1_500);
    assert.ok(elapsedMs < 10_000, `cron status cleanup must remain bounded, received ${elapsedMs}ms`);
  } finally {
    forceStopFixture(descendantPid);
    if (previousPath === undefined) delete process.env.PATH;
    else process.env.PATH = previousPath;
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});
