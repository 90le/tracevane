import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const read = (filePath) => fs.readFileSync(path.join(rootDir, filePath), "utf8");

const styleCss = read("apps/web-vue/src/style.css");
const appVue = read("apps/web-vue/src/App.vue");
const commandPaletteSource = read("apps/web-vue/src/components/StudioCommandPalette.vue");
const topbarSource = read("apps/web-vue/src/components/StudioShellTopbar.vue");

test("standard mobile shell pages expose the global navigation control", () => {
  assert.match(topbarSource, /class="topbar-mobile-nav"/);
  assert.match(
    styleCss,
    /@media\s*\(max-width:\s*920px\)\s*\{[\s\S]*?\.topbar-mobile-nav\s*\{[\s\S]*?display:\s*inline-flex;/,
  );
  assert.match(
    styleCss,
    /@media\s*\(max-width:\s*920px\)\s*\{[\s\S]*?\.studio-shell-topbar\s*\{[\s\S]*?grid-template-columns:\s*34px minmax\(0,\s*1fr\);/,
  );
  assert.match(
    styleCss,
    /@media\s*\(max-width:\s*920px\)\s*\{[\s\S]*?\.studio-shell-topbar__controls\s*\{[\s\S]*?grid-column:\s*1\s*\/\s*-1;/,
  );
});

test("tool rail command button opens a non-navigation command palette", () => {
  assert.match(appVue, /StudioCommandPalette/);
  assert.match(appVue, /@open-command-palette="openCommandPalette"/);
  assert.match(appVue, /window\.addEventListener\('keydown', handleGlobalKeydown\)/);
  assert.match(appVue, /\.terminal-workspace-shell, \.xterm/);
  assert.match(commandPaletteSource, /role="dialog"/);
  assert.match(commandPaletteSource, /搜索全局命令/);
  assert.match(commandPaletteSource, /全局操作/);
  assert.doesNotMatch(commandPaletteSource, /页面导航/);
  assert.doesNotMatch(commandPaletteSource, /router\.push\(command\.to\)/);
  assert.equal(appVue.includes('<StudioCommandPalette\n        v-model:open="commandPaletteOpen"\n        :nav-groups="navGroups"'), false);
});

test("shell popovers use solid theme-aware modal surfaces", () => {
  assert.match(styleCss, /--modal-panel-bg:\s*#0c1725;/);
  assert.match(styleCss, /html\[data-theme="light"\]\s*\{[\s\S]*--modal-panel-bg:\s*#fbfdff;/);
  assert.match(
    styleCss,
    /\.studio-command-palette__panel\s*\{[\s\S]*linear-gradient\(180deg,\s*var\(--modal-panel-bg\),\s*var\(--modal-panel-bg-strong\)\)/,
  );
  assert.doesNotMatch(styleCss, /\.studio-context-panel\s*\{/);
  assert.match(styleCss, /\.mobile-sidebar-mask\s*\{[\s\S]*background:\s*var\(--modal-backdrop\);/);
});
