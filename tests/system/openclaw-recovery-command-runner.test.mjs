import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  runOpenClawRecoveryCommand,
} from "../../dist/apps/api/modules/openclaw-recovery/command-runner.js";

const MAX_STREAM_BYTES = 8 * 1024 * 1024;

function processExists(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

async function waitForFile(filePath, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    if (fs.existsSync(filePath)) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out waiting for ${filePath}`);
}

async function waitForProcessesToExit(pids, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    if (pids.every((pid) => !processExists(pid))) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.fail(`Owned processes remained alive: ${pids.filter(processExists).join(", ")}`);
}

test("Recovery command timeout removes the full POSIX group after its leader exits", {
  skip: process.platform === "win32" ? "native POSIX process-group behavior" : false,
}, async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tracevane-recovery-pgid-"));
  const pidFile = path.join(root, "pids.json");
  let ownedPids = [];
  t.after(() => {
    for (const pid of ownedPids) {
      try {
        process.kill(pid, "SIGKILL");
      } catch {
        // The successful cleanup path has already reaped the fixture.
      }
    }
    fs.rmSync(root, { force: true, recursive: true });
  });

  const fixture = [
    'import { spawn } from "node:child_process";',
    'import fs from "node:fs";',
    "const descendant = spawn(process.execPath, [\"-e\", \"process.on('SIGTERM', () => {}); setInterval(() => {}, 1000);\"], { stdio: 'ignore' });",
    "fs.writeFileSync(process.env.TRACEVANE_RECOVERY_PID_FILE, JSON.stringify([process.pid, descendant.pid]));",
    "process.on('SIGTERM', () => process.exit(0));",
    "setInterval(() => {}, 1000);",
  ].join("\n");
  const originalPidFile = process.env.TRACEVANE_RECOVERY_PID_FILE;
  process.env.TRACEVANE_RECOVERY_PID_FILE = pidFile;
  try {
    const result = await runOpenClawRecoveryCommand(
      process.execPath,
      ["--input-type=module", "-e", fixture],
      1_000,
      root,
    );
    await waitForFile(pidFile);
    ownedPids = JSON.parse(fs.readFileSync(pidFile, "utf8"));

    assert.equal(result.ok, false);
    assert.equal(result.status, null);
    assert.match(result.error, /^Command timed out$/);
    await waitForProcessesToExit(ownedPids);
  } finally {
    if (originalPidFile === undefined) delete process.env.TRACEVANE_RECOVERY_PID_FILE;
    else process.env.TRACEVANE_RECOVERY_PID_FILE = originalPidFile;
  }
});

test("Recovery command output is capped without changing a successful exit", async () => {
  const result = await runOpenClawRecoveryCommand(
    process.execPath,
    ["-e", `process.stdout.write("x".repeat(${MAX_STREAM_BYTES + 1_024}))`],
    15_000,
  );

  assert.equal(result.ok, true);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /\.\.\.\[truncated\]$/);
  assert.equal(
    Buffer.byteLength(result.stdout, "utf8") <= MAX_STREAM_BYTES + 32,
    true,
  );
});
