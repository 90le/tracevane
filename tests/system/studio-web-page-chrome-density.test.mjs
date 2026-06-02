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
const appVue = read("apps/web-vue/src/App.vue");
const chatShellWorkspaceCss = read("apps/web-vue/src/features/chat/chat-shell-workspace.css");
const codexStackWorkspaceCss = read("apps/web-vue/src/features/codex-stack/codex-stack-workspace.css");
const designContract = read("DESIGN.md");
const filesWorkspaceCss = read("apps/web-vue/src/features/files/files-workspace.css");
const terminalWorkspaceCss = read("apps/web-vue/src/features/terminal/terminal-workspace.css");

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

function baseRuleBlock(selector) {
  return baseRuleBlocks(selector).at(-1) || "";
}

function firstBaseRuleBlock(selector) {
  return baseRuleBlocks(selector)[0] || "";
}

function baseRuleBlocks(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return [...styleCss.matchAll(new RegExp(`(?:^|\\n)(${escaped}\\s*\\{[\\s\\S]*?\\n\\})`, "g"))]
    .map((match) => match[1]);
}

function selectorBlocks(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return [...styleCss.matchAll(new RegExp(`${escaped}\\s*\\{[\\s\\S]*?\\n\\}`, "g"))].map((match) => match[0]);
}

function tokenNames(block) {
  return [...block.matchAll(/(--[\w-]+):/g)].map((match) => match[1]);
}

function cssVar(block, name) {
  const match = block.match(new RegExp(`${name}:\\s*([^;]+);`));
  assert.ok(match, `Missing ${name}`);
  return match[1].trim();
}

function cssVarFrom(blocks, name) {
  for (const block of blocks) {
    const match = block.match(new RegExp(`${name}:\\s*([^;]+);`));
    if (match) return match[1].trim();
  }

  assert.fail(`Missing ${name}`);
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

function resolveCssVar(block, name, fallbackBlocks = []) {
  const blocks = [block, ...fallbackBlocks];
  let value = cssVarFrom(blocks, name);
  const seen = new Set([name]);

  while (/^var\(--/.test(value)) {
    const reference = value.match(/^var\((--[^),]+)\)/)?.[1];
    assert.ok(reference, `Unable to resolve ${name}: ${value}`);
    assert.ok(!seen.has(reference), `Circular CSS variable reference for ${name}: ${reference}`);
    seen.add(reference);
    value = cssVarFrom(blocks, reference);
  }

  return value;
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
  assert.doesNotMatch(styleCss, /\.status-banner\s*\{[\s\S]*?background:\s*var\(--surface-raised\);/);
});

test("floating output sheets are shared primitives instead of feature-local skins", () => {
  assert.match(
    styleCss,
    /\.floating-output-dock\s*\{[\s\S]*position:\s*fixed;[\s\S]*pointer-events:\s*none;/,
  );
  assert.match(
    styleCss,
    /\.floating-output-sheet\s*\{[\s\S]*border:\s*1px solid var\(--modal-border\);[\s\S]*background:\s*var\(--modal-panel-bg\);[\s\S]*box-shadow:\s*var\(--modal-shadow\);/,
  );
  assert.match(
    styleCss,
    /\.floating-output-sheet__log\s*\{[\s\S]*background:\s*var\(--code-bg\);[\s\S]*font-family:\s*'JetBrains Mono'/,
  );
  assert.match(
    styleCss,
    /@media \(max-width:\s*880px\)\s*\{[\s\S]*\.floating-output-dock\s*\{[\s\S]*width:\s*calc\(100vw - 20px\);/,
  );
  assert.match(designContract, /Floating output sheets are a shared primitive/);
  assert.match(designContract, /floating-output-dock/);
  assert.match(designContract, /feature CSS limited to size variables and local labels/);
});

test("shared drawer primitive uses the modal surface family", () => {
  assert.match(
    styleCss,
    /\.surface-drawer-mask\s*\{[\s\S]*background:\s*var\(--modal-backdrop\);[\s\S]*backdrop-filter:\s*none;/,
  );
  assert.match(
    styleCss,
    /\.surface-drawer\s*\{[\s\S]*border:\s*1px solid var\(--modal-border\);[\s\S]*background:\s*var\(--modal-panel-bg\);[\s\S]*box-shadow:\s*var\(--modal-shadow\);/,
  );
  assert.match(
    styleCss,
    /\.surface-drawer-close\s*\{[\s\S]*border:\s*1px solid var\(--modal-border\);[\s\S]*background:\s*var\(--modal-row-bg\);/,
  );
  assert.match(
    styleCss,
    /\.surface-drawer-close:focus-visible\s*\{[\s\S]*box-shadow:\s*0 0 0 3px var\(--mono-ring\);/,
  );
  assert.doesNotMatch(
    ruleBlock(".surface-drawer"),
    /var\(--surface-overlay\)|var\(--shell-stage-fill-strong\)|var\(--line\)|var\(--shadow\)/,
    "expected shared drawers to avoid legacy surface, shell, line, and shadow aliases",
  );
  assert.doesNotMatch(
    ruleBlock(".surface-drawer-close"),
    /transparent|var\(--line\)|var\(--acc\)/,
    "expected shared drawer close button to stay on solid modal/control tokens",
  );
  assert.match(designContract, /Shared drawer primitives use the same modal surface family/);
});

test("design contract keeps global CSS narrow and feature CSS owned by domains", () => {
  assert.match(designContract, /## Redesign Mandate/);
  assert.match(designContract, /The current Studio UI is not the target design/);
  assert.match(designContract, /\*\*DuoYuan Studio Ops\*\*/);
  assert.match(designContract, /## DuoYuan Product-System Extraction/);
  assert.match(designContract, /## DuoYuan Translation Matrix v7/);
  assert.match(designContract, /\| `tailwind\.config\.js` \| One primary ramp, one neutral gray family, finite status colors\. \|/);
  assert.match(designContract, /\| `input\.php` \/ `select\.php` \| Label above, helper\/error below, solid field, visible border, focus ring, opaque dropdown\. \|/);
  assert.match(designContract, /\| `product-card\.php` \| Cards work because they represent repeated browsable products with media and compact facts\. \|/);
  assert.match(designContract, /Do not bring back DuoYuan sky blue or add multiple competing accent ramps/);
  assert.match(designContract, /Do not rebuild admin pages as card walls/);
  assert.match(designContract, /Do not add cursor trails, decorative glow loops, or animations without workflow meaning/);
  assert.match(designContract, /Shared controls must expose visible keyboard focus, press feedback, disabled styling, and invalid-field styling from the primitive layer/);
  assert.match(designContract, /`StudioSelect` carries the same release states as native controls/);
  assert.match(designContract, /use the shared floating output sheet primitive or a runtime console/);
  assert.match(designContract, /## DuoYuan Component Contract v4/);
  assert.match(designContract, /template-parts\/global\/block-panel\.php/);
  assert.match(designContract, /Cards are allowed only for repeated browsable records/);
  assert.match(designContract, /## DuoYuan Layout Translation/);
  assert.match(designContract, /new CSS class names should describe intent/);
  assert.match(designContract, /Light canvas:\s*`#fbfdfb`/);
  assert.match(designContract, /Dark canvas:\s*`#090d11`/);
  assert.match(designContract, /## Page Architecture/);
  assert.match(designContract, /## Full Feature Refactor Matrix/);
  assert.match(designContract, /Standard routes use the app canvas directly/);
  assert.match(designContract, /\| Dashboard \| Workspace Strip \|/);
  assert.match(designContract, /\| Chat \| Conversation Workspace \|/);
  assert.match(designContract, /### Setup \/ Repair Wizard/);
  assert.match(designContract, /### Runtime Strip/);
  assert.match(designContract, /### Split Inspector/);
  assert.match(designContract, /### Runtime Console/);
  assert.match(designContract, /## Component Composition/);
  assert.match(designContract, /## Interaction Model/);
  assert.match(designContract, /## Redesign Execution Order/);
  assert.match(designContract, /## CSS Ownership/);
  assert.match(designContract, /style\.css` is the shared design-system boundary/);
  assert.match(designContract, /Large feature pages should graduate to feature CSS files/);
  assert.match(designContract, /New Vue single-file component style blocks are not allowed/);
  assert.match(designContract, /DuoYuan Graphite v4/);
  assert.match(designContract, /DuoYuan Token Single Source v6/);
  assert.match(designContract, /legacy Atlas\/glass aliases must be re-bound/);
  assert.match(designContract, /Reference-only token ramps are not shared primitives/);
  assert.match(designContract, /Control primitives are single-owner/);
});

test("vue source keeps presentation out of single-file component style blocks", () => {
  const offenders = collectFiles("apps/web-vue/src", ".vue")
    .filter((filePath) => /<style(?:\s|>)/.test(read(filePath)));

  assert.deepEqual(offenders, []);
});

test("vue source keeps static inline styles out of templates", () => {
  const offenders = collectFiles("apps/web-vue/src", ".vue")
    .filter((filePath) => /<[^>]*\sstyle\s*=/.test(read(filePath)));

  assert.deepEqual(offenders, []);
});

test("remaining dynamic style bindings are limited to runtime geometry and measured state", () => {
  const dynamicStyleRationales = {
    "apps/web-vue/src/features/chat/CascadeMenu.vue": "portal menu position and z-index arbitration",
    "apps/web-vue/src/features/chat/CascadeMenuNode.vue": "z-index arbitration for nested portal menus",
    "apps/web-vue/src/features/chat/ComposerBar.vue": "keyboard viewport CSS variable handoff",
    "apps/web-vue/src/features/chat/ConversationPane.vue": "virtualized timeline placeholder height and mobile composer lift",
    "apps/web-vue/src/features/chat/MarkdownBlock.vue": "user-controlled preview scale and measured rendered markup size",
    "apps/web-vue/src/features/terminal/TerminalFilePreviewPane.vue": "runtime geometry for preview tab context menu position",
    "apps/web-vue/src/features/terminal/TerminalResourceExplorer.vue": "runtime geometry for tree indentation and resource context menu position",
    "apps/web-vue/src/features/terminal/TerminalSessionPane.vue": "runtime geometry for split and preview pane sizing",
    "apps/web-vue/src/features/terminal/TerminalTabRail.vue": "runtime geometry for terminal tab context menu position",
    "apps/web-vue/src/features/terminal/TerminalWorkspacePage.vue": "runtime geometry for resource explorer width",
    "apps/web-vue/src/shared/components/AvatarFieldEditor.vue": "avatar crop coordinates and preview geometry",
    "apps/web-vue/src/shared/components/StudioSelect.vue": "portal menu position and width geometry",
  };
  const offenders = collectFiles("apps/web-vue/src", ".vue")
    .filter((filePath) => /(?:^|\s)(?::style|v-bind:style)\s*=/.test(read(filePath)))
    .sort();
  const allowedDynamicStyleFiles = Object.keys(dynamicStyleRationales).sort();

  assert.deepEqual(offenders, allowedDynamicStyleFiles);
  for (const [filePath, rationale] of Object.entries(dynamicStyleRationales)) {
    assert.match(
      rationale,
      /progress|portal|crop|z-index|keyboard|virtualized|preview|geometry|measured/,
      `${filePath} has a runtime-geometry rationale`,
    );
  }
  assert.match(designContract, /Static template inline styles are not allowed/);
  assert.match(designContract, /Dynamic `:style` is allowed only for runtime geometry/);
  assert.match(designContract, /New dynamic `:style` exceptions must be added to the system test with a short rationale/);
});

test("studio duoyuan shell stays product-clean instead of rebuilding gradient card chrome", () => {
  assert.match(styleCss, /Studio DuoYuan Ops: DuoYuan component discipline with the OpenClaw graphite signature/);
  assert.doesNotMatch(styleCss, /Anti card-wall pass/);
  assert.equal([...styleCss.matchAll(/@media \(prefers-reduced-motion: reduce\)/g)].length, 1);

  const duoRootBlock = ruleBlock(":root");
  assert.match(duoRootBlock, /--claw-mint:\s*#5eead4;/);
  assert.match(duoRootBlock, /--mono-bg:\s*#090d11;/);
  assert.match(duoRootBlock, /--mono-panel:\s*#101820;/);
  assert.match(duoRootBlock, /--control-bg:\s*var\(--mono-panel\);/);
  assert.match(duoRootBlock, /--modal-panel-bg:\s*var\(--mono-panel\);/);
  assert.match(duoRootBlock, /--shell-bg-start:\s*var\(--mono-bg\);/);
  assert.match(duoRootBlock, /--button-primary-bg:\s*var\(--accent-primary\);/);
  assert.match(duoRootBlock, /--button-secondary-bg:\s*var\(--mono-panel\);/);
  assert.doesNotMatch(styleCss, /button-primary-bg:\s*#(?:e3ad5d|bd7c2c)|button-secondary-bg:\s*rgba|--acc:\s*(?:var\(--gold\)|#bd7c2c)/i);
  assert.match(duoRootBlock, /--studio-route-inset:\s*clamp\(12px,\s*1\.7vw,\s*22px\);/);
  assert.match(duoRootBlock, /--studio-page-max:\s*1680px;/);
  assert.match(duoRootBlock, /--studio-shell-gap:\s*14px;/);
  assert.match(duoRootBlock, /--studio-workspace-radius:\s*12px;/);
  assert.match(duoRootBlock, /--studio-elevated:\s*var\(--mono-panel-3\);/);
  assert.doesNotMatch(styleCss, /--atlas-|var\(--atlas/);
  assert.doesNotMatch(styleCss, /--duo-(?:amber|green|red):|theme-preference-grid|theme-card|theme-swatch|tone-sky/);
  assert.doesNotMatch(styleCss, /--duo-gray-|--claw-navy-|--claw-peach|--mono-rose-glow:/);
  assert.doesNotMatch(styleCss, /--shell-(?:rail|dock|subtle)-fill:|--sidebar-accent:|--topbar-accent:|--sidebar-footer-bg:/);
  assert.doesNotMatch(styleCss, /--gold:|var\(--gold\)/);
  assert.doesNotMatch(styleCss, /--surface-muted:|var\(--surface-muted\)|--soft-shadow:|var\(--soft-shadow\)/);
  assert.match(styleCss, /--warn:\s*var\(--warning\);/);

  const duoLightBlock = ruleBlock('html[data-theme="light"]');
  assert.match(duoLightBlock, /--mono-bg:\s*#fbfdfb;/);
  assert.match(duoLightBlock, /--mono-bg-2:\s*#ffffff;/);
  assert.match(duoLightBlock, /--mono-panel-3:\s*#edf6f1;/);
  assert.match(duoRootBlock, /--control-shadow:\s*0 1px 0 rgba\(238,\s*245,\s*240,\s*0\.045\),\s*0 12px 28px rgba\(0,\s*0,\s*0,\s*0\.1\);/);
  assert.match(duoRootBlock, /--control-menu-shadow:\s*var\(--mono-shadow-md\);/);
  assert.match(duoLightBlock, /--control-border:\s*#cfded8;/);
  assert.match(duoLightBlock, /--control-shadow:\s*0 1px 2px rgba\(18,\s*46,\s*38,\s*0\.055\);/);
  assert.match(duoLightBlock, /--control-menu-shadow:\s*0 18px 42px rgba\(18,\s*46,\s*38,\s*0\.12\);/);
  assert.match(duoLightBlock, /--mono-panel:\s*#ffffff;/);
  assert.match(duoLightBlock, /--control-bg:\s*#ffffff;/);
  assert.match(duoLightBlock, /--button-secondary-bg:\s*#ffffff;/);
  assert.match(duoLightBlock, /--modal-panel-bg:\s*var\(--mono-panel\);/);
  assert.match(duoLightBlock, /--shell-bg-start:\s*var\(--mono-bg\);/);
  assert.doesNotMatch(styleCss, /#fffdf7|#fffaf0|#f9f1e3|#f8f1e3|#e6ded0|#e4dccd/);

  const bodyBlock = ruleBlock("body");
  assert.match(bodyBlock, /background:[\s\S]*var\(--mono-bg\)/);
  assert.doesNotMatch(bodyBlock, /linear-gradient\(110deg|linear-gradient\(145deg/);

  const sidebarBlocks = baseRuleBlocks(".sidebar");
  assert.match(duoRootBlock, /--sidebar-gradient:\s*var\(--mono-bg\);/);
  assert.equal(sidebarBlocks.length, 1);
  assert.match(sidebarBlocks[0], /background:\s*var\(--sidebar-gradient\);/);
  assert.match(sidebarBlocks[0], /margin:\s*0;/);
  assert.match(sidebarBlocks[0], /border:\s*0 solid var\(--mono-line\);/);
  assert.match(sidebarBlocks[0], /border-right-width:\s*1px;/);
  assert.match(sidebarBlocks[0], /border-radius:\s*0;/);
  assert.match(sidebarBlocks[0], /box-shadow:\s*none;/);
  assert.doesNotMatch(sidebarBlocks.join("\n"), /box-shadow:\s*(?:var\(--mono-shadow|0 \d|inset)/);
  assert.doesNotMatch(sidebarBlocks.join("\n"), /radial-gradient|linear-gradient/);
  assert.doesNotMatch(styleCss, /^\.sidebar(?:\.sidebar-rail|-rail)\s*\{/m);

  const shellMainBlock = baseRuleBlock(".shell-main");
  assert.match(shellMainBlock, /padding:\s*10px;/);

  const shellLayoutBlocks = baseRuleBlocks(".shell-layout");
  assert.equal(shellLayoutBlocks.length, 1);
  const shellLayoutBlock = shellLayoutBlocks[0];
  assert.match(shellLayoutBlock, /padding:\s*var\(--studio-route-inset\);/);

  const shellMainStageBlocks = baseRuleBlocks(".shell-main-stage");
  assert.equal(shellMainStageBlocks.length, 1);
  assert.match(shellMainStageBlocks[0], /gap:\s*var\(--studio-shell-gap\);/);

  const shellRouteBlocks = baseRuleBlocks(".shell-route-stage");
  assert.equal(shellRouteBlocks.length, 1);
  const latestShellRouteBlock = shellRouteBlocks[0];
  assert.match(latestShellRouteBlock, /border:\s*0;/);
  assert.match(latestShellRouteBlock, /border-radius:\s*0;/);
  assert.match(latestShellRouteBlock, /padding:\s*0;/);
  assert.match(latestShellRouteBlock, /background:\s*transparent;/);
  assert.match(latestShellRouteBlock, /box-shadow:\s*none;/);
  assert.match(latestShellRouteBlock, /backdrop-filter:\s*none;/);
  assert.doesNotMatch(
    selectorBlocks(".shell-route-stage").join("\n"),
    /background:\s*var\(--shell-stage-fill\)|box-shadow:\s*var\(--mono-shadow\)|padding:\s*18px clamp/,
  );
  assert.doesNotMatch(
    styleCss,
    /\.shell-route-stage:not\(|\.route-surface-/,
  );

  const topbarBlocks = selectorBlocks(".studio-shell-topbar");
  const latestTopbarBlock = baseRuleBlock(".studio-shell-topbar");
  assert.ok(topbarBlocks.length >= 1);
  assert.match(latestTopbarBlock, /width:\s*min\(100%,\s*var\(--studio-page-max\)\);/);
  assert.match(latestTopbarBlock, /min-height:\s*44px;/);
  assert.match(latestTopbarBlock, /border:\s*0;/);
  assert.match(latestTopbarBlock, /border-bottom:\s*1px solid var\(--mono-line\);/);
  assert.match(latestTopbarBlock, /border-radius:\s*0;/);
  assert.match(latestTopbarBlock, /background:\s*var\(--topbar-bg\);/);
  assert.match(latestTopbarBlock, /box-shadow:\s*none;/);
  assert.match(styleCss, /\.studio-shell-topbar__identity\s*\{[\s\S]*display:\s*inline-flex;/);
  assert.match(styleCss, /\.studio-shell-topbar__route-label\s*\{/);
  assert.match(styleCss, /\.studio-shell-topbar__path-label\s*\{[\s\S]*font-family:\s*"IBM Plex Mono"/);
  assert.doesNotMatch(styleCss, /\.studio-shell-topbar__identity strong|\.studio-shell-topbar__group-label/);

  const latestLightTopbarBlock = ruleBlock('html[data-theme="light"] .studio-shell-topbar');
  assert.match(latestLightTopbarBlock, /border-bottom-color:\s*var\(--mono-line\);/);
  assert.match(latestLightTopbarBlock, /background:\s*var\(--topbar-bg\);/);
  assert.match(latestLightTopbarBlock, /box-shadow:\s*none;/);

  const pageHeaderBlocks = selectorBlocks(".page-header-row");
  const latestPageHeaderBlock = baseRuleBlock(".page-header-row");
  assert.ok(latestPageHeaderBlock, "Missing base .page-header-row block");
  assert.equal(
    pageHeaderBlocks.filter((block) => /radial-gradient\(420px 180px/.test(block)).length,
    0,
  );
  assert.ok(pageHeaderBlocks.some((block) => /grid-template-columns:\s*4px minmax\(0,\s*1fr\) auto;/.test(block)));
  assert.match(latestPageHeaderBlock, /border:\s*0;/);
  assert.match(latestPageHeaderBlock, /border-bottom:\s*1px solid var\(--mono-line\);/);
  assert.match(latestPageHeaderBlock, /border-radius:\s*0;/);
  assert.match(latestPageHeaderBlock, /background:\s*transparent;/);
  assert.match(latestPageHeaderBlock, /box-shadow:\s*none;/);

  const latestLightHeaderBlock = ruleBlock('html[data-theme="light"] .page-header-row');
  assert.match(latestLightHeaderBlock, /background:\s*transparent;/);
  assert.match(latestLightHeaderBlock, /box-shadow:\s*none;/);
  assert.doesNotMatch(styleCss, /\.page-header-row\s*\{[\s\S]*?flex-direction:\s*column;/);

  const latestSharedRowBlock = [...styleCss.matchAll(/(?:^|\n)(\.option-row,\s*\n\.setting-block,\s*\n\.status-banner\s*\{[\s\S]*?\n\})/g)]
    .map((match) => match[1])
    .at(-1);
  assert.ok(latestSharedRowBlock, "Missing shared option/status row primitive block");
  assert.match(latestSharedRowBlock, /border:\s*1px solid var\(--mono-line\);/);
  assert.match(latestSharedRowBlock, /border-radius:\s*10px;/);
  assert.match(latestSharedRowBlock, /background:\s*var\(--surface-base\);/);
  assert.match(latestSharedRowBlock, /box-shadow:\s*none;/);

  const latestEmptyInlineBlock = baseRuleBlock(".empty-inline");
  assert.match(latestEmptyInlineBlock, /border:\s*1px dashed var\(--mono-line\);/);
  assert.match(latestEmptyInlineBlock, /background:\s*var\(--surface-base\);/);
  assert.match(latestEmptyInlineBlock, /box-shadow:\s*none;/);

  const latestLightSharedRowsBlock = ruleBlock('html[data-theme="light"] .empty-inline');
  assert.match(latestLightSharedRowsBlock, /background:\s*var\(--mono-panel\);/);
  assert.match(latestLightSharedRowsBlock, /box-shadow:\s*none;/);

  const baseSharedVisualProperties = /\b(?:background|border|border-radius|box-shadow|backdrop-filter):/;
  assert.doesNotMatch(firstBaseRuleBlock(".status-banner"), baseSharedVisualProperties);
  assert.doesNotMatch(firstBaseRuleBlock(".option-row"), baseSharedVisualProperties);
  assert.doesNotMatch(firstBaseRuleBlock(".empty-inline"), baseSharedVisualProperties);

  const primaryButtonBlock = ruleBlock(".primary-button");
  const sharedButtonBaseBlocks = [...styleCss.matchAll(/(?:^|\n)(\.primary-button,\s*\n\.secondary-button,\s*\n\.danger-link,\s*\n\.compact-button,\s*\n\.surface-tab\s*\{[\s\S]*?\n\})/g)]
    .map((match) => match[1]);
  assert.equal(sharedButtonBaseBlocks.length, 1);
  assert.match(sharedButtonBaseBlocks[0], /border:\s*1px solid var\(--control-border\);/);
  assert.match(sharedButtonBaseBlocks[0], /padding:\s*0 14px;/);
  assert.match(primaryButtonBlock, /background:\s*var\(--accent-primary\);/);
  assert.doesNotMatch(primaryButtonBlock, /linear-gradient/);
  const compactButtonVariantBlocks = [...styleCss.matchAll(/(?:^|\n)(\.compact-button,\s*\n\.surface-tab\s*\{[\s\S]*?\n\})/g)]
    .map((match) => match[1]);
  const compactButtonSizingBlocks = compactButtonVariantBlocks.filter((block) => /min-height:\s*34px;/.test(block));
  assert.equal(compactButtonSizingBlocks.length, 1);
  assert.equal(selectorBlocks(".danger-link").length, 1);
  assert.match(
    compactButtonSizingBlocks[0],
    /min-height:\s*34px;[\s\S]*padding:\s*0 12px;[\s\S]*font-size:\s*12px;/,
    "expected compact button sizing to live beside the shared control primitive",
  );
  assert.match(
    ruleBlock(".danger-link"),
    /border-color:\s*color-mix\(in srgb,\s*var\(--danger\) 34%,\s*var\(--control-border\)\);[\s\S]*background:\s*color-mix\(in srgb,\s*var\(--danger\) 8%,\s*var\(--control-bg\)\);/,
    "expected danger-link to be a visible semantic control rather than a hidden text-only override",
  );
  assert.doesNotMatch(
    styleCss,
    /color-mix\(in srgb,\s*white\s+(?:28|30|32)%,\s*transparent\)/,
    "shared button and switch highlights should use DuoYuan/OpenClaw highlight tokens",
  );
  assert.match(styleCss, /\.primary-button\.is-danger\s*\{[\s\S]*inset 0 1px 0 var\(--icon-highlight-strong\);/);
  assert.match(styleCss, /\.primary-button\.is-safe\s*\{[\s\S]*inset 0 1px 0 var\(--icon-highlight-strong\);/);
  assert.doesNotMatch(
    ruleBlock(".primary-button.is-danger"),
    /var\(--surface\)|var\(--line\)|var\(--mint\)/,
    "expected danger primary action to avoid legacy surface/line/mint aliases",
  );
  assert.doesNotMatch(
    ruleBlock(".primary-button.is-safe"),
    /var\(--surface\)|var\(--line\)|var\(--mint\)/,
    "expected safe primary action to avoid legacy surface/line/mint aliases",
  );
  assert.match(styleCss, /\.theme-switch-button\.active\s*\{[\s\S]*inset 0 1px 0 var\(--icon-highlight-strong\);/);
  assert.match(
    styleCss,
    /\.primary-button:focus-visible,\s*\n\.secondary-button:focus-visible,\s*\n\.danger-link:focus-visible,\s*\n\.compact-button:focus-visible,\s*\n\.surface-tab:focus-visible,\s*\n\.theme-switch-button:focus-visible\s*\{[\s\S]*box-shadow:\s*0 0 0 3px var\(--mono-ring\),\s*var\(--control-shadow\);/,
  );
  assert.match(
    styleCss,
    /\.primary-button:active:not\(:disabled\),\s*\n\.secondary-button:active:not\(:disabled\),\s*\n\.danger-link:active:not\(:disabled\),\s*\n\.compact-button:active:not\(:disabled\),\s*\n\.surface-tab:active:not\(:disabled\),\s*\n\.theme-switch-button:active:not\(:disabled\)\s*\{[\s\S]*transform:\s*translateY\(1px\);/,
  );
  assert.equal(selectorBlocks(".theme-switch-button.active").length, 1);
  assert.doesNotMatch(styleCss, /rgba\(77,\s*153,\s*255|rgba\(111,\s*211,\s*255/);
  assert.doesNotMatch(styleCss, /var\(--(?:mono-accent|accent-primary),\s*var\(--accent-primary,\s*#/);
  assert.match(
    styleCss,
    /\.credential-toggle\s*\{[\s\S]*border:\s*1px solid var\(--control-border\);[\s\S]*background:\s*var\(--button-secondary-bg\);/,
  );
  assert.match(
    styleCss,
    /\.credential-toggle:focus-visible\s*\{[\s\S]*box-shadow:\s*0 0 0 3px var\(--mono-ring\),\s*var\(--control-shadow\);/,
  );
  assert.doesNotMatch(
    ruleBlock(".credential-toggle"),
    /var\(--line\)|var\(--surface\)|var\(--acc\)|var\(--muted\)/,
    "expected credential toggle to use shared control tokens",
  );
  assert.match(
    styleCss,
    /\.choice-chip,\s*\n\.choice-pill\s*\{[\s\S]*border:\s*1px solid var\(--control-border\);[\s\S]*background:\s*var\(--button-secondary-bg\);[\s\S]*color:\s*var\(--button-secondary-text\);/,
  );
  const choiceControlBlocks = [...styleCss.matchAll(/(?:^|\n)(\.choice-chip,\s*\n\.choice-pill\s*\{[\s\S]*?\n\})/g)]
    .map((match) => match[1]);
  const choiceControlBaseBlocks = choiceControlBlocks.filter((block) => /background:\s*var\(--button-secondary-bg\);/.test(block));
  assert.equal(choiceControlBaseBlocks.length, 1);
  const choiceActiveBlocks = [...styleCss.matchAll(/(?:^|\n)(\.choice-chip\.active,\s*\n\.choice-pill\.active\s*\{[\s\S]*?\n\})/g)]
    .map((match) => match[1]);
  assert.equal(choiceActiveBlocks.length, 1);
  assert.match(
    styleCss,
    /\.choice-chip\.active,\s*\n\.choice-pill\.active\s*\{[\s\S]*border-color:\s*color-mix\(in srgb,\s*var\(--mono-accent\) 46%,\s*var\(--control-border\)\);[\s\S]*background:\s*color-mix\(in srgb,\s*var\(--mono-accent\) 12%,\s*var\(--control-bg\)\);/,
  );
  assert.match(
    styleCss,
    /\.choice-chip:focus-visible,\s*\n\.choice-pill:focus-visible\s*\{[\s\S]*box-shadow:\s*0 0 0 3px var\(--mono-ring\),\s*var\(--control-shadow\);/,
  );
  assert.doesNotMatch(
    [...choiceControlBaseBlocks, ...choiceActiveBlocks].join("\n"),
    /var\(--(?:surface|line|acc|muted)\)/,
    "expected choice controls to avoid legacy surface/line/accent/muted aliases",
  );

  assert.doesNotMatch(styleCss, /\.form-field,\s*\n\.toggle-card,\s*\n\.setting-block/);
  assert.match(styleCss, /\.form-label\s*\{[\s\S]*text-transform:\s*none;[\s\S]*letter-spacing:\s*0;/);
  const sharedFormControlBlocks = [...styleCss.matchAll(/(?:^|\n)(\.form-input,\s*\n\.form-textarea,\s*\nselect\.form-input\s*\{[\s\S]*?\n\})/g)]
    .map((match) => match[1]);
  assert.equal(sharedFormControlBlocks.length, 1);
  assert.match(sharedFormControlBlocks[0], /width:\s*100%;/);
  assert.match(sharedFormControlBlocks[0], /border:\s*1px solid var\(--control-border\);/);
  assert.match(sharedFormControlBlocks[0], /padding:\s*10px 12px;/);
  assert.doesNotMatch(styleCss, /(?:^|\n)\.form-input,\s*\n\.form-textarea\s*\{/);
  assert.match(styleCss, /\.form-input,\s*\n\.form-textarea,\s*\nselect\.form-input\s*\{[\s\S]*min-height:\s*42px;[\s\S]*background:\s*var\(--control-bg\);[\s\S]*box-shadow:\s*var\(--control-shadow\);/);
  assert.match(styleCss, /select\.form-input\s*\{[\s\S]*appearance:\s*none;[\s\S]*background-image:/);
  assert.match(
    styleCss,
    /\.form-input:disabled,\s*\n\.form-textarea:disabled,\s*\nselect\.form-input:disabled\s*\{[\s\S]*cursor:\s*not-allowed;[\s\S]*opacity:\s*0\.62;[\s\S]*box-shadow:\s*none;/,
  );
  assert.match(
    styleCss,
    /\.form-input\[aria-invalid="true"\],[\s\S]*select\.form-input\.is-invalid\s*\{[\s\S]*border-color:\s*color-mix\(in srgb,\s*var\(--danger\) 58%,\s*var\(--control-border\)\);/,
  );
});

test("special full-height route shells stay feature-owned", () => {
  assert.match(designContract, /Chat, files, and terminal keep their special full-height shells/);

  assert.match(appVue, /'chat-surface-route': isChatSurface/);
  assert.match(appVue, /'terminal-surface-route': isTerminalSurface/);
  assert.match(appVue, /'file-surface-route': isFilesSurface/);
  assert.match(appVue, /'shell-layout-chat': isChatSurface/);
  assert.match(appVue, /'shell-layout-files': isFilesSurface/);
  assert.match(appVue, /'shell-route-stage-chat': isChatSurface/);
  assert.match(appVue, /'shell-route-stage-files': isFilesSurface/);
  assert.doesNotMatch(appVue, /routeSurfaceClass|route-surface-/);

  assert.doesNotMatch(
    styleCss,
    /\.main-content\.(?:chat|file|terminal)-surface-route\s*\{|\.shell-layout-(?:chat|files)\s*\{|\.shell-route-stage-(?:chat|files)\s*\{/,
  );
  assert.doesNotMatch(
    styleCss,
    /\.route-surface-/,
  );

  assert.match(
    chatShellWorkspaceCss,
    /\.main-content\.chat-surface-route\s*\{[\s\S]*height:\s*100dvh;[\s\S]*overflow:\s*hidden;/,
  );
  assert.match(
    chatShellWorkspaceCss,
    /\.main-content\.chat-surface-route \.shell-route-stage\s*\{[\s\S]*display:\s*flex;[\s\S]*height:\s*100%;[\s\S]*padding:\s*0;[\s\S]*border-radius:\s*var\(--studio-workspace-radius,\s*12px\);/,
  );

  assert.match(
    filesWorkspaceCss,
    /\.main-content\.file-surface-route\s*\{[\s\S]*height:\s*100dvh;[\s\S]*overflow:\s*hidden;/,
  );
  assert.match(
    filesWorkspaceCss,
    /\.shell-route-stage-files\s*\{[\s\S]*display:\s*flex;[\s\S]*height:\s*100%;[\s\S]*padding:\s*0;[\s\S]*border-radius:\s*var\(--studio-workspace-radius,\s*12px\);/,
  );

  assert.match(
    terminalWorkspaceCss,
    /\.main-content\.terminal-surface-route\s*\{[\s\S]*height:\s*100dvh;[\s\S]*overflow:\s*hidden;/,
  );
  assert.match(
    appVue,
    /<StudioShellTopbar[\s\S]*v-if="!isChatSurface && !isFilesSurface && !isTerminalSurface"/,
  );
  assert.match(
    terminalWorkspaceCss,
    /\.main-content\.terminal-surface-route \.shell-route-stage\s*\{[\s\S]*display:\s*flex;[\s\S]*height:\s*100%;[\s\S]*padding:\s*0;[\s\S]*border-radius:\s*var\(--studio-workspace-radius,\s*12px\);/,
  );
  assert.doesNotMatch(terminalWorkspaceCss, /\.main-content\.terminal-surface-route \.studio-shell-topbar/);
});

test("final DuoYuan token layer re-binds legacy root aliases", () => {
  const rootBlocks = [...styleCss.matchAll(/:root\s*\{([\s\S]*?)\n\}/g)].map((match) => match[1]);
  const lightBlocks = [...styleCss.matchAll(/html\[data-theme="light"\]\s*\{([\s\S]*?)\n\}/g)].map((match) => match[1]);
  const tokenMarkerIndex = styleCss.indexOf("/* Studio DuoYuan Ops: DuoYuan component discipline with the OpenClaw graphite signature. */");
  const firstUniversalRuleIndex = styleCss.indexOf("* {");
  const firstBodyRuleIndex = styleCss.indexOf("body {");
  assert.equal(rootBlocks.length, 1, "DuoYuan tokens should have one root source of truth");
  assert.equal(lightBlocks.length, 1, "DuoYuan light tokens should have one source of truth");
  assert.ok(tokenMarkerIndex > 0, "DuoYuan token marker should exist");
  assert.ok(tokenMarkerIndex < firstUniversalRuleIndex, "DuoYuan tokens should appear before global selectors");
  assert.ok(tokenMarkerIndex < firstBodyRuleIndex, "DuoYuan tokens should appear before body rules");
  assert.equal(baseRuleBlocks("body").length, 1, "body should have one base owner");
  assert.equal(baseRuleBlocks("body::before").length, 1, "body::before should have one base owner");
  assert.equal(baseRuleBlocks("body::after").length, 1, "body::after should have one base owner");
  assert.equal(baseRuleBlocks(".app-container").length, 1, ".app-container should have one base owner");
  assert.equal(baseRuleBlocks(".sidebar").length, 1, ".sidebar should have one base owner");
  assert.deepEqual(
    [
      "--acc",
      "--bg1",
      "--bg2",
      "--bg3",
      "--field-bg",
      "--field-border-focus",
      "--line",
      "--surface-base",
      "--surface-soft",
      "--text-primary",
      "--warn",
    ].filter((name) => !new Set(tokenNames(lightBlocks[0])).has(name)),
    [],
  );
});

test("strict CSS variable references are defined except third-party runtime geometry vars", () => {
  const source = collectFiles("apps/web-vue/src", ".css")
    .map((filePath) => [filePath, read(filePath)]);
  const definedVariables = new Set();
  const strictReferences = new Map();
  const allowedRuntimeVariables = new Set([
    "--reka-dropdown-menu-content-transform-origin",
    "--reka-popover-trigger-width",
  ]);

  for (const [, fileText] of source) {
    for (const match of fileText.matchAll(/(--[\w-]+)\s*:/g)) {
      definedVariables.add(match[1]);
    }
  }

  for (const [filePath, fileText] of source) {
    for (const match of fileText.matchAll(/var\(\s*(--[\w-]+)([^)]*)\)/g)) {
      if (/^\s*,/.test(match[2])) continue;
      if (allowedRuntimeVariables.has(match[1])) continue;
      if (!strictReferences.has(match[1])) strictReferences.set(match[1], new Set());
      strictReferences.get(match[1]).add(filePath);
    }
  }

  const missingVariables = [...strictReferences]
    .filter(([name]) => !definedVariables.has(name))
    .map(([name, files]) => `${name}: ${[...files].sort().join(", ")}`)
    .sort();

  assert.deepEqual(missingVariables, []);
});

test("final DuoYuan token layer keeps routine controls and panels on solid surfaces", () => {
  const duoRootBlock = ruleBlock(":root");
  const duoLightBlock = ruleBlock('html[data-theme="light"]');
  const solidTokenNames = [
    "--control-bg",
    "--control-menu-bg",
    "--select-option-bg",
    "--button-secondary-bg",
    "--tab-bg",
    "--shell-panel-fill",
    "--surface-base",
    "--modal-panel-bg",
    "--topbar-bg",
  ];

  for (const tokenName of solidTokenNames) {
    const darkValue = resolveCssVar(duoRootBlock, tokenName);
    const lightValue = resolveCssVar(duoLightBlock, tokenName, [duoRootBlock]);
    assert.match(darkValue, /^#[0-9a-f]{6}$/i, `${tokenName} dark value should resolve to a solid color`);
    assert.match(lightValue, /^#[0-9a-f]{6}$/i, `${tokenName} light value should resolve to a solid color`);
    assert.doesNotMatch(darkValue, /rgba|color-mix|transparent/i);
    assert.doesNotMatch(lightValue, /rgba|color-mix|transparent/i);
  }
});

test("studio duoyuan palette keeps both themes readable without pure black or pure white canvases", () => {
  const duoRootBlock = ruleBlock(":root");
  const duoLightBlock = ruleBlock('html[data-theme="light"]');

  const darkCanvas = resolveCssVar(duoRootBlock, "--mono-bg");
  const lightCanvas = resolveCssVar(duoLightBlock, "--mono-bg", [duoRootBlock]);
  assert.notEqual(darkCanvas.toLowerCase(), "#000000");
  assert.notEqual(lightCanvas.toLowerCase(), "#ffffff");
  assert.ok(contrastRatio(resolveCssVar(duoRootBlock, "--mono-ink"), darkCanvas) >= 7);
  assert.ok(contrastRatio(resolveCssVar(duoRootBlock, "--mono-ink-2"), darkCanvas) >= 7);
  assert.ok(contrastRatio(resolveCssVar(duoLightBlock, "--mono-ink", [duoRootBlock]), lightCanvas) >= 7);
  assert.ok(contrastRatio(resolveCssVar(duoLightBlock, "--mono-ink-2", [duoRootBlock]), lightCanvas) >= 4.5);
  assert.ok(contrastRatio(resolveCssVar(duoRootBlock, "--mono-button-ink"), resolveCssVar(duoRootBlock, "--accent-primary")) >= 4.5);
});
