import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const packageJson = JSON.parse(
  fs.readFileSync(path.join(rootDir, "package.json"), "utf8"),
);
const manifestFile = path.join(
  rootDir,
  "apps",
  "web-vue",
  "src",
  "features",
  "terminal",
  "terminal-workspace-manifest.ts",
);
const baselineFile = path.join(
  rootDir,
  "docs",
  "superpowers",
  "inventories",
  "studio-terminal-workspace-coverage.json",
);

function runCoverageScript() {
  const stdout = execFileSync(
    process.execPath,
    [path.join(rootDir, "scripts", "studio-terminal-workspace-coverage.mjs")],
    {
      cwd: rootDir,
      encoding: "utf8",
    },
  );

  return JSON.parse(stdout);
}

test("terminal workspace manifest covers shell tabs actions profiles sessions transport sections", () => {
  const manifestSource = fs.readFileSync(manifestFile, "utf8");

  assert.match(manifestSource, /key:\s*["']shell["']/);
  assert.match(manifestSource, /key:\s*["']tabs["']/);
  assert.match(manifestSource, /key:\s*["']actions["']/);
  assert.match(manifestSource, /key:\s*["']profiles["']/);
  assert.match(manifestSource, /key:\s*["']sessions["']/);
  assert.match(manifestSource, /key:\s*["']transport["']/);
  assert.match(manifestSource, /workspaceSurface/);
});

test("package json declares terminal workspace coverage script", () => {
  assert.equal(
    typeof packageJson.scripts?.["studio:terminal-workspace-coverage"],
    "string",
  );
  assert.ok(
    packageJson.scripts["studio:terminal-workspace-coverage"].includes(
      "scripts/studio-terminal-workspace-coverage.mjs",
    ),
  );
});

test("terminal workspace coverage script matches committed baseline inventory", () => {
  const parsed = runCoverageScript();
  const baseline = JSON.parse(fs.readFileSync(baselineFile, "utf8"));

  assert.deepEqual(parsed, baseline);
  assert.ok(parsed.sections.includes("shell"));
  assert.ok(
    parsed.frontendFiles.includes(
      "apps/web-vue/src/features/terminal/TerminalWorkspacePage.vue",
    ),
  );
  assert.ok(
    parsed.backendFiles.includes("apps/api/modules/terminal/service.ts"),
  );
  assert.ok(
    parsed.frontendFiles.includes(
      "apps/web-vue/src/features/terminal/TerminalTabRail.vue",
    ),
  );
  assert.ok(
    !parsed.frontendFiles.includes(
      "apps/web-vue/src/features/terminal/TerminalActionPanel.vue",
    ),
  );
  assert.ok(
    parsed.frontendFiles.includes(
      "apps/web-vue/src/features/terminal/TerminalInspectorContent.vue",
    ),
  );
  assert.ok(
    !parsed.frontendFiles.includes(
      "apps/web-vue/src/features/terminal/TerminalSessionExplorer.vue",
    ),
  );
  assert.ok(
    parsed.frontendFiles.includes(
      "apps/web-vue/src/features/terminal/terminal-transport.ts",
    ),
  );
  assert.ok(
    parsed.tests.includes("tests/terminal/terminal-workspace-state.test.mjs"),
  );
  assert.ok(
    parsed.tests.includes("tests/terminal/terminal-session-selectors.test.mjs"),
  );
  assert.ok(
    parsed.tests.includes("tests/terminal/terminal-action-catalog.test.mjs"),
  );
  assert.ok(parsed.tests.includes("tests/terminal/terminal-profiles.test.mjs"));
  assert.ok(parsed.tests.includes("tests/terminal/terminal-transport.test.mjs"));
});
