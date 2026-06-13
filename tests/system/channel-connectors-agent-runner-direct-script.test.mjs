import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import path from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";

const repoRoot = path.resolve(import.meta.dirname, "../..");
const scriptPath = path.join(repoRoot, "scripts/smoke-channel-connectors-agent-runner-direct.mjs");
const execFileAsync = promisify(execFile);

test("direct runner smoke script documents parser-only proof boundary", async () => {
  const { stdout } = await execFileAsync("node", [scriptPath, "--help"], {
    cwd: repoRoot,
    maxBuffer: 1024 * 1024,
  });

  assert.match(stdout, /native CLI runner\/parser path only/);
  assert.match(stdout, /Feishu\/Octo event-log evidence/);
  assert.match(stdout, /--agents <ids>/);
  assert.match(stdout, /--min-process-replies <n>/);
  assert.match(stdout, /--min-tool-outputs <n>/);
});

test("direct runner smoke script rejects empty agent filters", async () => {
  await assert.rejects(
    execFileAsync("node", [scriptPath, "--agents="], {
      cwd: repoRoot,
      maxBuffer: 1024 * 1024,
    }),
    /--agents must include at least one agent id/,
  );
});
