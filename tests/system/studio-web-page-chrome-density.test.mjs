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
const codexStackWorkspaceCss = read("apps/web-vue/src/features/codex-stack/codex-stack-workspace.css");
const designContract = read("DESIGN.md");

function collectFiles(dir, suffix) {
  const absoluteDir = path.join(rootDir, dir);
  const entries = fs.readdirSync(absoluteDir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const child = path.join(dir, entry.name);
    if (entry.isDirectory()) return collectFiles(child, suffix);
    return entry.isFile() && entry.name.endsWith(suffix) ? [child] : [];
  });
}

function ruleBlock(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return [...styleCss.matchAll(new RegExp(`${escaped}\\s*\\{[\\s\\S]*?\\n\\}`, "g"))].at(-1)?.[0] || "";
}

function cssVar(block, name) {
  const match = block.match(new RegExp(`${name}:\\s*([^;]+);`));
  assert.ok(match, `Missing ${name}`);
  return match[1].trim();
}

function hexToRgb(hex) {
  const normalized = hex.replace("#", "");
  assert.match(normalized, /^[0-9a-f]{6}$/i, `Expected full hex color, received ${hex}`);
  return [0, 2, 4].map((offset) => Number.parseInt(normalized.slice(offset, offset + 2), 16) / 255);
}

function channelToLinear(value) {
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(hex) {
  const [red, green, blue] = hexToRgb(hex).map(channelToLinear);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(foreground, background) {
  const fg = relativeLuminance(foreground);
  const bg = relativeLuminance(background);
  return (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
}

test("shared primitives consume semantic aliases for surfaces and action accents", () => {
  assert.doesNotMatch(styleCss, /\.panel-card,\s*\.metric-card\s*\{/);
  assert.match(codexStackWorkspaceCss, /\.cs-surface\s*\{[\s\S]*background:[\s\S]*var\(--surface-base\)/);
  assert.match(
    codexStackWorkspaceCss,
    /\.cs-surface\s*\{[\s\S]*border:\s*1px solid var\(--border-subtle\);/,
  );
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
  assert.match(designContract, /## Redesign Mandate/);
  assert.match(designContract, /The current Studio UI is not the target design/);
  assert.match(designContract, /\*\*Calm Ops OS\*\*/);
  assert.match(designContract, /## Page Architecture/);
  assert.match(designContract, /### Setup \/ Repair Wizard/);
  assert.match(designContract, /### Command Center/);
  assert.match(designContract, /### Split Inspector/);
  assert.match(designContract, /### Runtime Console/);
  assert.match(designContract, /## Component Composition/);
  assert.match(designContract, /## Interaction Model/);
  assert.match(designContract, /## Redesign Execution Order/);
  assert.match(designContract, /## CSS Ownership/);
  assert.match(designContract, /style\.css` is the shared design-system boundary/);
  assert.match(designContract, /Large feature pages should graduate to feature CSS files/);
  assert.match(designContract, /New Vue single-file component style blocks are not allowed/);
});

test("vue source keeps presentation out of single-file component style blocks", () => {
  const offenders = collectFiles("apps/web-vue/src", ".vue")
    .filter((filePath) => /<style(?:\s|>)/.test(read(filePath)));

  assert.deepEqual(offenders, []);
});

test("studio atlas shell stays quiet instead of rebuilding gradient card chrome", () => {
  assert.match(styleCss, /Studio Atlas: release redesign layer/);

  const atlasRootBlock = ruleBlock(":root");
  assert.match(atlasRootBlock, /--atlas-bg:\s*#1b2930;/);
  assert.match(atlasRootBlock, /--atlas-panel:\s*rgba\(44,\s*60,\s*69,\s*0\.56\);/);
  assert.doesNotMatch(atlasRootBlock, /--atlas-bg:\s*#0|--atlas-panel:\s*rgba\(255,\s*255,\s*255/);

  const atlasLightBlock = ruleBlock('html[data-theme="light"]');
  assert.match(atlasLightBlock, /--atlas-bg:\s*#edf1ec;/);
  assert.match(atlasLightBlock, /--atlas-panel:\s*rgba\(246,\s*244,\s*236,\s*0\.68\);/);
  assert.doesNotMatch(atlasLightBlock, /--atlas-bg:\s*#fff|--atlas-panel:\s*rgba\(255,\s*255,\s*255/);

  const bodyBlock = ruleBlock("body");
  assert.match(bodyBlock, /background:[\s\S]*var\(--atlas-bg\);/);
  assert.doesNotMatch(bodyBlock, /linear-gradient\(110deg|linear-gradient\(145deg/);

  const sidebarBlock = ruleBlock(".sidebar.sidebar-rail");
  assert.match(sidebarBlock, /background:\s*color-mix\(in srgb, var\(--atlas-panel-2\) 88%, transparent\);/);
  assert.doesNotMatch(sidebarBlock, /radial-gradient|linear-gradient/);

  const shellRouteBlock = ruleBlock(".main-content.standard-scroll-route .shell-route-stage");
  assert.match(shellRouteBlock, /background-size:\s*44px 44px,\s*44px 44px,\s*auto;/);
  assert.doesNotMatch(shellRouteBlock, /radial-gradient/);
  assert.match(styleCss, /--studio-route-inset:\s*10px;/);
  assert.match(styleCss, /--studio-workspace-radius:\s*18px;/);
  assert.doesNotMatch(
    styleCss,
    /\.shell-route-stage:not\(\.shell-route-stage-chat\):not\(\.shell-route-stage-files\):not\(\.route-surface-terminal\)/,
  );

  const primaryButtonBlock = ruleBlock(".primary-button");
  assert.match(primaryButtonBlock, /background:\s*color-mix\(in srgb, var\(--atlas-primary\) 78%, var\(--atlas-bg-2\)\);/);
  assert.doesNotMatch(primaryButtonBlock, /linear-gradient/);
});

test("studio atlas palette keeps both themes readable without pure black or pure white canvases", () => {
  const atlasRootBlock = ruleBlock(":root");
  const atlasLightBlock = ruleBlock('html[data-theme="light"]');

  const darkCanvas = cssVar(atlasRootBlock, "--atlas-bg");
  const lightCanvas = cssVar(atlasLightBlock, "--atlas-bg");
  assert.notEqual(darkCanvas.toLowerCase(), "#000000");
  assert.notEqual(lightCanvas.toLowerCase(), "#ffffff");
  assert.ok(contrastRatio(cssVar(atlasRootBlock, "--atlas-ink"), darkCanvas) >= 7);
  assert.ok(contrastRatio(cssVar(atlasRootBlock, "--atlas-ink-2"), darkCanvas) >= 7);
  assert.ok(contrastRatio(cssVar(atlasLightBlock, "--atlas-ink"), lightCanvas) >= 7);
  assert.ok(contrastRatio(cssVar(atlasLightBlock, "--atlas-ink-2"), lightCanvas) >= 4.5);
});
