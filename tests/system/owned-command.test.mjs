import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { runOwnedCommand } from "../../dist/apps/api/core/owned-command.js";

const temporaryRoots = new Set();
const fallbackPids = new Set();

function processIsAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

async function waitUntil(assertion, timeoutMs = 2_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (assertion()) return true;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return assertion();
}

function makeTempRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tracevane owned command 测试 "));
  temporaryRoots.add(root);
  return root;
}

function writeOwnedTreeFixture(root) {
  const binDir = path.join(root, "native command bin");
  const descendantPath = path.join(binDir, "descendant.cjs");
  const leaderPath = path.join(binDir, "leader.cjs");
  const pidPath = path.join(root, "descendant.pid");
  fs.mkdirSync(binDir, { recursive: true });
  fs.writeFileSync(
    descendantPath,
    `process.on("SIGTERM", () => {});\nsetInterval(() => {}, 1000);\n`,
    "utf8",
  );
  fs.writeFileSync(
    leaderPath,
    `const fs = require("node:fs");
const { spawn } = require("node:child_process");
const descendant = spawn(process.execPath, [${JSON.stringify(descendantPath)}], { stdio: "ignore" });
fs.writeFileSync(${JSON.stringify(pidPath)}, String(descendant.pid), "utf8");
process.on("SIGTERM", () => process.exit(0));
setInterval(() => {}, 1000);
`,
    "utf8",
  );
  if (process.platform === "win32") {
    fs.writeFileSync(
      path.join(binDir, "owned-tree.cmd"),
      `@echo off\r\n"${process.execPath}" "%~dp0leader.cjs" %*\r\n`,
      "utf8",
    );
  } else {
    const commandPath = path.join(binDir, "owned-tree");
    fs.writeFileSync(
      commandPath,
      `#!/usr/bin/env node\n${fs.readFileSync(leaderPath, "utf8")}`,
      { encoding: "utf8", mode: 0o755 },
    );
    fs.chmodSync(commandPath, 0o755);
  }
  return { binDir, pidPath };
}

afterEach(async () => {
  for (const pid of fallbackPids) {
    if (!processIsAlive(pid)) continue;
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // best-effort fixture cleanup
    }
  }
  fallbackPids.clear();
  await new Promise((resolve) => setTimeout(resolve, 25));
  for (const root of temporaryRoots) {
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
  temporaryRoots.clear();
});

test("owned command preserves normal stdout and stderr", async () => {
  const result = await runOwnedCommand(
    process.execPath,
    ["-e", "process.stdout.write('OWNED_STDOUT'); process.stderr.write('OWNED_STDERR');"],
    { timeoutMs: 2_000 },
  );

  assert.equal(result.ok, true);
  assert.equal(result.status, 0);
  assert.equal(result.timedOut, false);
  assert.equal(result.stdout, "OWNED_STDOUT");
  assert.equal(result.stderr, "OWNED_STDERR");
});

test("owned command caps stdout and stderr independently", async () => {
  const result = await runOwnedCommand(
    process.execPath,
    ["-e", "process.stdout.write('o'.repeat(4096)); process.stderr.write('e'.repeat(4096));"],
    { timeoutMs: 2_000, maxOutputBytes: 64 },
  );

  assert.equal(result.ok, true);
  assert.match(result.stdout, /\.\.\.\[truncated\]$/);
  assert.match(result.stderr, /\.\.\.\[truncated\]$/);
  assert.ok(Buffer.byteLength(result.stdout, "utf8") < 128);
  assert.ok(Buffer.byteLength(result.stderr, "utf8") < 128);
});

test("owned command timeout removes the platform-native command tree", async () => {
  const root = makeTempRoot();
  const fixture = writeOwnedTreeFixture(root);
  const result = await runOwnedCommand("owned-tree", [], {
    timeoutMs: 300,
    env: {
      ...process.env,
      PATH: [fixture.binDir, process.env.PATH || ""].filter(Boolean).join(path.delimiter),
    },
  });
  const descendantPid = Number(fs.readFileSync(fixture.pidPath, "utf8"));
  fallbackPids.add(descendantPid);

  assert.equal(result.ok, false);
  assert.equal(result.timedOut, true);
  assert.match(result.error, /timed out/i);
  assert.equal(result.cleanupError, "");
  assert.equal(await waitUntil(() => !processIsAlive(descendantPid)), true);
  fallbackPids.delete(descendantPid);
});
