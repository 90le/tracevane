import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SMOKE = path.join(
  ROOT_DIR,
  "tests",
  "ide-workbench",
  "ide-terminal-durable-backend.smoke.mjs",
);

test("durable terminal smoke owns both server lifecycles through runWebSmoke", () => {
  const source = readFileSync(SMOKE, "utf8");
  assert.match(source, /import\s+\{\s*runWebSmoke\s*\}\s+from\s+["']\.\.\/\.\.\/scripts\/dev-web-smoke\.mjs["']/);
  assert.equal((source.match(/await runWebSmoke\(/g) ?? []).length, 2);
  assert.match(source, /createOrResume\(sessionId, rootId, false\)/);
  assert.match(source, /waitForLedger\(sessionId, `before:\$\{token\}`\)/);
  assert.match(source, /const resumed = await createOrResume\(sessionId, rootId\)/);
  assert.match(source, /waitForLedger\(sessionId, `after:\$\{token\}`\)/);
  assert.ok(
    source.indexOf("phase = 'second server lifecycle'")
      > source.indexOf("waitForLedger(sessionId, `before:${token}`)"),
    "the first callback must finish before the second lifecycle starts",
  );
  assert.doesNotMatch(source, /dev-web-smoke\.sh/);
  assert.doesNotMatch(source, /spawn\(['"]bash['"]/);
  assert.doesNotMatch(source, /process\.kill\(/);
});

test("native Windows skips before starting a server when tmux is unavailable", {
  skip: process.platform !== "win32",
}, () => {
  const result = spawnSync(process.execPath, [SMOKE], {
    cwd: ROOT_DIR,
    encoding: "utf8",
    env: {
      ...process.env,
      TRACEVANE_DURABLE_TERMINAL_PORT: "5282",
      TRACEVANE_WEB_PORT: "6282",
    },
    timeout: 10_000,
    windowsHide: true,
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /tmux unavailable.*skipped/i);
});
