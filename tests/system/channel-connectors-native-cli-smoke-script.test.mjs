import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(import.meta.dirname, "../..");
const scriptPath = path.join(repoRoot, "scripts", "smoke-channel-connectors-native-cli-sessions.mjs");
const distEntry = path.join(repoRoot, "dist", "apps", "api", "modules", "channel-connectors", "cli-agent-session-driver.js");

function unavailableCliEnv(emptyBin) {
  return {
    ...process.env,
    PATH: emptyBin,
  };
}

test("native CLI session smoke skips a missing command outside strict mode", async (t) => {
  if (!fs.existsSync(distEntry)) {
    t.skip("npm run build:api is required before the native CLI smoke script system test");
    return;
  }
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tracevane-native-cli-missing-"));
  const emptyBin = path.join(root, "empty bin");
  fs.mkdirSync(emptyBin, { recursive: true });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const result = await execFileAsync(process.execPath, [scriptPath, "--apps", "claude-code", "--json"], {
    cwd: repoRoot,
    env: unavailableCliEnv(emptyBin),
    encoding: "utf8",
  });
  const summary = JSON.parse(result.stdout);

  assert.equal(summary.ok, true);
  assert.equal(summary.strict, false);
  assert.equal(summary.results[0].status, "skipped");
  assert.match(summary.results[0].reason, /not installed|not on PATH/i);
});

test("native CLI session smoke fails a missing command in strict mode", async (t) => {
  if (!fs.existsSync(distEntry)) {
    t.skip("npm run build:api is required before the native CLI smoke script system test");
    return;
  }
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tracevane-native-cli-strict-missing-"));
  const emptyBin = path.join(root, "empty bin");
  fs.mkdirSync(emptyBin, { recursive: true });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  await assert.rejects(
    execFileAsync(process.execPath, [scriptPath, "--apps", "claude-code", "--json", "--strict"], {
      cwd: repoRoot,
      env: unavailableCliEnv(emptyBin),
      encoding: "utf8",
    }),
    (error) => {
      assert.equal(error.code, 1);
      const summary = JSON.parse(error.stdout);
      assert.equal(summary.ok, false);
      assert.equal(summary.strict, true);
      assert.equal(summary.results[0].status, "skipped");
      return true;
    },
  );
});
