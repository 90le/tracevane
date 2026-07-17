import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import path from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";

const repoRoot = path.resolve(import.meta.dirname, "../..");
const scriptPath = path.join(repoRoot, "scripts/smoke-channel-connectors-agent-heartbeat-local.mjs");
const execFileAsync = promisify(execFile);

test("local heartbeat smoke script documents local-only proof boundary", async () => {
  const { stdout } = await execFileAsync("node", [scriptPath, "--help"], {
    cwd: repoRoot,
    maxBuffer: 1024 * 1024,
  });

  assert.match(stdout, /local-only Channel Connectors process-runner heartbeat matrix/);
  assert.match(stdout, /synthetic child Node processes/);
  assert.match(stdout, /real IM channels, Gateway requests/);
  assert.match(stdout, /async child-task TUI status uses bounded idle grace/);
  assert.match(stdout, /heartbeat-only CLI output emits process\/heartbeat-stall diagnostics/);
  assert.match(stdout, /non-runtime agents still use the fixed process timeout/);
});

test("local heartbeat smoke script runs the full synthetic heartbeat matrix", async () => {
  let stdout = "";
  try {
    const result = await execFileAsync("node", [scriptPath, "--json"], {
      cwd: repoRoot,
      timeout: 60_000,
      maxBuffer: 1024 * 1024,
    });
    stdout = result.stdout;
  } catch (error) {
    const detail = [
      error instanceof Error ? error.message : String(error),
      error && typeof error === "object" && "stdout" in error ? `stdout:\n${String(error.stdout)}` : "",
      error && typeof error === "object" && "stderr" in error ? `stderr:\n${String(error.stderr)}` : "",
    ].filter(Boolean).join("\n\n");
    assert.fail(detail);
  }
  const result = JSON.parse(stdout);

  assert.equal(result.ok, true);
  assert.equal(result.total, 25);
  assert.equal(result.passed, 25);
  assert.equal(result.failed, 0);
  assert.equal(result.results.some((item) => item.name === "codex:stderr-cr-tui-heartbeat"), true);
  assert.equal(result.results.some((item) => item.name === "claude-code:stdout-heartbeat"), true);
  assert.equal(result.results.some((item) => item.name === "claude-code:async-child-task-idle-grace"), true);
  assert.equal(result.results.some((item) => item.name === "opencode:heartbeat-only-stall-diagnostic"), true);
  assert.equal(result.results.some((item) => item.name === "opencode:silent-heartbeat-timeout"), true);
  assert.equal(result.results.some((item) => item.name === "gemini:stderr-cr-tui-heartbeat"), true);
  assert.equal(result.results.some((item) => item.name === "gemini:async-child-task-idle-grace"), true);
  assert.equal(result.results.some((item) => item.name === "gemini:silent-heartbeat-timeout"), true);
  assert.equal(result.results.some((item) => item.name === "kimi:fixed-timeout-unchanged"), true);
});
