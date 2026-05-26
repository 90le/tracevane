import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const testFileDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(testFileDir, "..", "..");

function read(filePath) {
  return fs.readFileSync(path.join(rootDir, filePath), "utf8");
}

const styleCss = read("apps/web-vue/src/style.css");
const designContract = read("DESIGN.md");

function ruleBlock(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return [...styleCss.matchAll(new RegExp(`${escaped}\\s*\\{[\\s\\S]*?\\n\\}`, "g"))].at(-1)?.[0] || "";
}

test("shared primitives consume semantic aliases for surfaces and action accents", () => {
  assert.doesNotMatch(styleCss, /\.panel-card,\s*\.metric-card\s*\{/);
  assert.match(styleCss, /\.cs-surface\s*\{[\s\S]*background:[\s\S]*var\(--surface-base\)/);
  assert.match(styleCss, /\.cs-surface\s*\{[\s\S]*border:\s*1px solid var\(--border-subtle\);/);
  assert.match(
    styleCss,
    /\.primary-button\s*\{[^}]*background:\s*var\(--accent-primary\);/,
  );
  assert.match(
    styleCss,
    /\.status-banner\s*\{[\s\S]*background:\s*var\(--surface-raised\);/,
  );
});

test("design contract keeps global CSS narrow and feature CSS owned by domains", () => {
  assert.match(designContract, /## CSS Ownership/);
  assert.match(designContract, /style\.css` is the shared design-system boundary/);
  assert.match(designContract, /Large feature pages should graduate to feature CSS files/);
  assert.match(designContract, /Scoped Vue styles are acceptable for compact, single-component states/);
});

test("studio atlas shell stays quiet instead of rebuilding gradient card chrome", () => {
  assert.match(styleCss, /Studio Atlas: release redesign layer/);

  const bodyBlock = ruleBlock("body");
  assert.match(bodyBlock, /background:[\s\S]*var\(--atlas-bg\);/);
  assert.doesNotMatch(bodyBlock, /linear-gradient\(110deg|linear-gradient\(145deg/);

  const sidebarBlock = ruleBlock(".sidebar.sidebar-rail");
  assert.match(sidebarBlock, /background:\s*color-mix\(in srgb, var\(--atlas-panel-2\) 88%, transparent\);/);
  assert.doesNotMatch(sidebarBlock, /radial-gradient|linear-gradient/);

  const shellRouteBlock = ruleBlock(".shell-route-stage:not(.shell-route-stage-chat):not(.shell-route-stage-files):not(.route-surface-terminal)");
  assert.match(shellRouteBlock, /background-size:\s*44px 44px,\s*44px 44px,\s*auto;/);
  assert.doesNotMatch(shellRouteBlock, /radial-gradient/);

  const primaryButtonBlock = ruleBlock(".primary-button");
  assert.match(primaryButtonBlock, /background:\s*color-mix\(in srgb, var\(--atlas-primary\) 78%, white\);/);
  assert.doesNotMatch(primaryButtonBlock, /linear-gradient/);
});
