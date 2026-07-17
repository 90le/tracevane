import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const ROOT = path.resolve(import.meta.dirname, "../..");

const DEBUG_SMOKES = {
  "ide-debug-foundation.smoke.mjs": "smoke:ide:debug-foundation",
  "ide-debug-breakpoints.smoke.mjs": "smoke:ide:debug-breakpoints",
  "ide-debug-adapter-proof.smoke.mjs": "smoke:ide:debug-adapter-proof",
  "ide-debug-lifecycle.smoke.mjs": "smoke:ide:debug-lifecycle",
  "ide-debug-launch-profile.smoke.mjs": "smoke:ide:debug-launch-profile",
  "ide-debug-node-inspector.smoke.mjs": "smoke:ide:debug-node-inspector",
  "ide-debug-controls-scopes.smoke.mjs": "smoke:ide:debug-controls-scopes",
  "ide-debug-watch-evaluate.smoke.mjs": "smoke:ide:debug-watch-evaluate",
};

function source(relativePath) {
  return readFileSync(path.join(ROOT, relativePath), "utf8");
}

test("debug browser smokes require the owned runner instead of Linux-only self-start", () => {
  for (const [fileName, alias] of Object.entries(DEBUG_SMOKES)) {
    const script = source(path.join("tests", "ide-workbench", fileName));
    assert.match(script, /TRACEVANE_WEB_SMOKE_URL/, fileName);
    assert.match(script, new RegExp(`npm run ${alias.replaceAll(":", "\\:")}`), fileName);
    assert.doesNotMatch(script, /scripts\/dev-web-smoke\.sh/, fileName);
    assert.doesNotMatch(script, /spawn\(['"]bash['"]/, fileName);
    assert.doesNotMatch(script, /\blsof\b|pidsForPort|startDevServerIfNeeded/, fileName);
    assert.doesNotMatch(script, /\bdevServer\b/, fileName);
  }
});

test("the Channel Connector browser smoke resolves and validates a portable Chromium", () => {
  const script = source("scripts/smoke-web-im-channels.mjs");
  assert.doesNotMatch(script, /\/home\/binbin\/\.local\/bin\/google-chrome/);
  assert.match(script, /PLAYWRIGHT_CHROME_EXECUTABLE/);
  assert.match(script, /PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH/);
  assert.match(script, /chromium\.executablePath\(\)/);
  assert.match(script, /existsSync\(executablePath\)/);
  assert.match(script, /playwright install chromium/i);
});

test("obsolete POSIX-only launchers stay deleted and Gateway foundation has a Node entrypoint", () => {
  assert.equal(existsSync(path.join(ROOT, "scripts", "preview-web-smoke.sh")), false);
  assert.equal(
    existsSync(path.join(ROOT, "scripts", "test-gateway-http-foundation.sh")),
    false,
  );
  assert.equal(
    existsSync(path.join(ROOT, "scripts", "test-gateway-http-foundation.mjs")),
    true,
  );

  const packageJson = JSON.parse(source("package.json"));
  assert.equal(
    packageJson.scripts["smoke:gateway:http-foundation"],
    "npm run build && node scripts/test-gateway-http-foundation.mjs",
  );

  const script = source("scripts/test-gateway-http-foundation.mjs");
  assert.match(script, /cross-spawn/);
  assert.match(script, /\bwhich\b/);
  assert.match(script, /assertTcpPortAvailable/);
  assert.match(script, /stopOwnedProcess/);
  assert.doesNotMatch(script, /shell:\s*true|\bmktemp\b|\bcurl\b|spawn\(['"]bash['"]/);
});
