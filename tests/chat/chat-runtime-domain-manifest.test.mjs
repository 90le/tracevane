import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const packageJson = JSON.parse(
  fs.readFileSync(path.join(root, "package.json"), "utf8"),
);
const manifestFile = path.join(
  root,
  "apps",
  "web-vue",
  "src",
  "features",
  "chat-v2",
  "chat-runtime-domain-manifest.ts",
);
const manifestSource = fs.readFileSync(manifestFile, "utf8");
const baselineFile = path.join(
  root,
  "docs",
  "superpowers",
  "inventories",
  "studio-chat-runtime-coverage.json",
);

function runCoverageScript() {
  const stdout = execFileSync(
    process.execPath,
    [path.join(root, "scripts", "studio-chat-runtime-coverage.mjs")],
    {
      cwd: root,
      encoding: "utf8",
    },
  );

  return JSON.parse(stdout);
}

test("chat runtime manifest covers shell sessions history inspector sections", () => {
  assert.match(manifestSource, /key:\s*["']shell["']/);
  assert.match(manifestSource, /key:\s*["']sessions["']/);
  assert.match(manifestSource, /key:\s*["']history["']/);
  assert.match(manifestSource, /key:\s*["']inspector["']/);
  assert.match(manifestSource, /runtimeSurface:\s*["']chat-shell["']/);
  assert.match(manifestSource, /runtimeSurface:\s*["']session-list["']/);
  assert.match(manifestSource, /runtimeSurface:\s*["']history-recovery["']/);
  assert.match(manifestSource, /runtimeSurface:\s*["']inspector-panel["']/);
});

test("chat runtime manifest exports section-level coverage seed", () => {
  assert.match(manifestSource, /ChatRuntimeSectionKey/);
  assert.match(manifestSource, /ChatRuntimeSectionEntry/);
  assert.match(manifestSource, /CHAT_RUNTIME_DOMAIN_MANIFEST/);
  assert.match(manifestSource, /CHAT_RUNTIME_COVERAGE_SEED/);
  assert.match(manifestSource, /runtimeSurface/);
  assert.match(manifestSource, /frontendFile/);
  assert.match(manifestSource, /backendFile/);
  assert.match(manifestSource, /testPattern/);
});

test("package json declares studio chat runtime coverage script", () => {
  assert.equal(
    typeof packageJson.scripts?.["studio:chat-runtime-coverage"],
    "string",
  );
  assert.ok(
    packageJson.scripts["studio:chat-runtime-coverage"].includes(
      "scripts/studio-chat-runtime-coverage.mjs",
    ),
  );
});

test("chat runtime coverage script matches committed baseline inventory", () => {
  const parsed = runCoverageScript();
  const baseline = JSON.parse(fs.readFileSync(baselineFile, "utf8"));

  assert.deepEqual(parsed, baseline);
  assert.ok(parsed.sections.includes("shell"));
  assert.ok(
    parsed.frontendFiles.includes(
      "apps/web-vue/src/features/chat-v2/ChatShellPage.vue",
    ),
  );
  assert.ok(parsed.backendFiles.includes("apps/api/modules/chat/service.ts"));
  assert.ok(
    parsed.tests.includes("tests/chat/chat-session-runtime-machine.test.mjs"),
  );
});
