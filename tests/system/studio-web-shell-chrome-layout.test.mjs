import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(currentDir, "..", "..");
const appPath = path.join(rootDir, "apps/web-vue/src/App.vue");
const chromePath = path.join(
  rootDir,
  "apps/web-vue/src/features/shell/use-shell-chrome.ts",
);
const releasePath = path.join(
  rootDir,
  "apps/web-vue/src/features/shell/use-shell-release.ts",
);
const panelPath = path.join(
  rootDir,
  "apps/web-vue/src/components/StudioContextPanel.vue",
);
const stylePath = path.join(rootDir, "apps/web-vue/src/style.css");

test("app shell extracts shell layout and release state into dedicated composables", () => {
  assert.equal(fs.existsSync(chromePath), true);
  assert.equal(fs.existsSync(releasePath), true);
  assert.equal(fs.existsSync(panelPath), true);
  const app = fs.readFileSync(appPath, "utf8");
  assert.match(app, /from '\.\/features\/shell\/use-shell-chrome'/);
  assert.match(app, /from '\.\/features\/shell\/use-shell-release'/);
  assert.match(app, /StudioContextPanel/);
  assert.doesNotMatch(app, /async function refreshStudioReleaseState\(/);
  assert.doesNotMatch(app, /async function refreshStudioUpgradeState\(/);
  assert.doesNotMatch(app, /async function handleStudioUpgradeAction\(/);
  assert.doesNotMatch(app, /let releaseRefreshTimer/);
  assert.doesNotMatch(app, /let upgradePollTimer/);
  assert.doesNotMatch(app, /function updateViewportState\(/);
  assert.doesNotMatch(app, /function toggleSidebar\(/);
});

test("context panel scaffold localizes copy through locale preference helper", () => {
  const panel = fs.readFileSync(panelPath, "utf8");
  assert.match(panel, /useLocalePreference/);
  assert.match(panel, /text\('上下文面板', 'Studio context panel'\)/);
  assert.match(panel, /text\('上下文', 'Context'\)/);
  assert.match(panel, /text\('工作台上下文', 'Studio Context'\)/);
  assert.match(panel, /text\('上下文面板脚手架', 'Context panel scaffold'\)/);
});

test("shell styles define a three-region layout and context panel surface", () => {
  const css = fs.readFileSync(stylePath, "utf8");
  assert.match(css, /\.shell-layout\s*\{/);
  assert.match(css, /\.shell-context-panel\s*\{/);
  assert.match(css, /\.shell-main-stage\s*\{/);
});
