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

test("chat runtime manifest covers chat and sessions domains", () => {
  assert.match(manifestSource, /id:\s*["']chat["']/);
  assert.match(manifestSource, /id:\s*["']sessions["']/);
  assert.match(manifestSource, /routePath:\s*["']\/chat["']/);
  assert.match(
    manifestSource,
    /testPattern:\s*["']chat-runtime-\*\.test\.mjs["']/,
  );
  assert.match(
    manifestSource,
    /testPattern:\s*["']chat-session-\*\.test\.mjs["']/,
  );
});

test("chat runtime manifest exports a machine readable coverage seed", () => {
  assert.match(manifestSource, /CHAT_RUNTIME_DOMAIN_COVERAGE_SEED/);
  assert.match(manifestSource, /webEntryFile/);
  assert.match(manifestSource, /apiModuleDir/);
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
});
