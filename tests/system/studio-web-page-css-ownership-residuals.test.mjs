import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function read(filePath) {
  return fs.readFileSync(path.join(rootDir, filePath), "utf8");
}

const globalStyleCss = read("apps/web-vue/src/style.css");
const codexStackWorkspaceCss = read("apps/web-vue/src/features/codex-stack/codex-stack-workspace.css");
const terminalWorkspaceCss = read("apps/web-vue/src/features/terminal/terminal-workspace.css");
const skillsWorkspaceCss = read("apps/web-vue/src/features/skills/skills-workspace.css");
const systemWorkspaceCss = read("apps/web-vue/src/features/system/system-workspace.css");
const dreamingWorkspaceCss = read("apps/web-vue/src/features/dreaming/dreaming-workspace.css");

test("global style no longer owns remaining page-family selectors", () => {
  assert.doesNotMatch(
    globalStyleCss,
    /\.(?:cs-[a-zA-Z0-9_-]*|terminal[a-zA-Z0-9_-]*|skills[a-zA-Z0-9_-]*|system[a-zA-Z0-9_-]*|dreaming[a-zA-Z0-9_-]*)/,
  );
});

test("remaining page-family CSS lives in feature-owned stylesheets", () => {
  assert.match(codexStackWorkspaceCss, /Migrated Codex Stack workspace rules from global style\.css/);
  assert.match(codexStackWorkspaceCss, /\.cs-status-pill/);
  assert.match(terminalWorkspaceCss, /Migrated Terminal workspace route rules from global style\.css/);
  assert.match(terminalWorkspaceCss, /\.terminal-surface-route/);
  assert.match(skillsWorkspaceCss, /Migrated Skills workspace rules from global style\.css/);
  assert.match(skillsWorkspaceCss, /\.skills-page/);
  assert.match(systemWorkspaceCss, /Migrated System workspace rules from global style\.css/);
  assert.match(systemWorkspaceCss, /\.system-page/);
  assert.match(dreamingWorkspaceCss, /Migrated Dreaming workspace rules from global style\.css/);
  assert.match(dreamingWorkspaceCss, /\.dreaming-page/);
});
