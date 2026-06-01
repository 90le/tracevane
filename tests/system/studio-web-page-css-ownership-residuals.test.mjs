import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function read(filePath) {
  return fs.readFileSync(path.join(rootDir, filePath), "utf8");
}

function readFilesUnder(relativeDir, predicate) {
  const startDir = path.join(rootDir, relativeDir);
  const chunks = [];
  const stack = [startDir];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(entryPath);
        continue;
      }
      if (predicate(entryPath)) {
        chunks.push(fs.readFileSync(entryPath, "utf8"));
      }
    }
  }
  return chunks.join("\n");
}

const globalStyleCss = read("apps/web-vue/src/style.css");
const codexStackWorkspaceCss = read("apps/web-vue/src/features/codex-stack/codex-stack-workspace.css");
const codexStackDashboardCss = read("apps/web-vue/src/features/codex-stack/codex-stack-dashboard.css");
const codexStackCcConnectCss = read("apps/web-vue/src/features/codex-stack/codex-stack-cc-connect.css");
const codexStackInstallCss = read("apps/web-vue/src/features/codex-stack/codex-stack-install.css");
const codexStackSettingsCss = read("apps/web-vue/src/features/codex-stack/codex-stack-settings.css");
const configWorkspaceCss = read("apps/web-vue/src/features/config/config-workspace.css");
const channelsDrawerCss = read("apps/web-vue/src/features/channels/channels-drawer.css");
const terminalWorkspaceCss = read("apps/web-vue/src/features/terminal/terminal-workspace.css");
const cronWorkspaceCss = read("apps/web-vue/src/features/cron/cron-workspace.css");
const skillsWorkspaceCss = read("apps/web-vue/src/features/skills/skills-workspace.css");
const systemWorkspaceCss = read("apps/web-vue/src/features/system/system-workspace.css");
const systemEventsCss = read("apps/web-vue/src/features/system/system-events.css");
const dreamingWorkspaceCss = read("apps/web-vue/src/features/dreaming/dreaming-workspace.css");
const operateWorkspaceCss = read("apps/web-vue/src/features/operate/operate-workspace.css");
const agentsWorkspaceCss = read("apps/web-vue/src/features/agents/agents-workspace.css");
const chatShellWorkspaceCss = read("apps/web-vue/src/features/chat-v2/chat-shell-workspace.css");
const chatOverlaySurfacesCss = read("apps/web-vue/src/features/chat-v2/overlay-surfaces.css");
const chatV2FeatureCss = readFilesUnder(
  "apps/web-vue/src/features/chat-v2",
  (entryPath) => entryPath.endsWith(".css"),
);
const filesWorkspaceCss = read("apps/web-vue/src/features/files/files-workspace.css");
const webSourceText = readFilesUnder("apps/web-vue/src", (entryPath) => /\.(?:vue|ts|js|css)$/.test(entryPath));

test("global style no longer owns remaining page-family selectors", () => {
  assert.doesNotMatch(
    globalStyleCss,
    /\.(?:cs-[a-zA-Z0-9_-]*|terminal[a-zA-Z0-9_-]*|skills[a-zA-Z0-9_-]*|system[a-zA-Z0-9_-]*|dreaming[a-zA-Z0-9_-]*|operate-[a-zA-Z0-9_-]*|account-tile|binding-item|request-item|tag-chip|capability-chip)/,
  );
});

test("P0 DuoYuan feature surfaces no longer depend on Atlas compatibility variables", () => {
  const p0FeatureCss = [
    codexStackWorkspaceCss,
    codexStackInstallCss,
    configWorkspaceCss,
    systemWorkspaceCss,
  ].join("\n");

  assert.doesNotMatch(globalStyleCss, /--atlas-|var\(--atlas/);
  assert.doesNotMatch(p0FeatureCss, /--atlas-|var\(--atlas/);
  assert.doesNotMatch(configWorkspaceCss, /rgba\(|#[0-9a-fA-F]{3,6}|linear-gradient|radial-gradient/);
});

test("Codex Stack chrome does not use legacy surface aliases or shell panel tokens", () => {
  const codexStackFeatureCss = [
    codexStackWorkspaceCss,
    codexStackDashboardCss,
    codexStackCcConnectCss,
    codexStackInstallCss,
    codexStackSettingsCss,
  ].join("\n");

  assert.doesNotMatch(
    codexStackFeatureCss,
    /var\(--surface\)|--shell-(?:panel|stage|highlight)/,
    "expected Codex Stack migrated chrome to use explicit DuoYuan/OpenClaw surface tokens",
  );
});

test("DuoYuan shell primitives no longer expose legacy glass tokens or global blur", () => {
  const drawerFeatureCss = [
    channelsDrawerCss,
    configWorkspaceCss,
  ].join("\n");

  assert.doesNotMatch(globalStyleCss, /--glass-|var\(--glass/);
  assert.doesNotMatch(drawerFeatureCss, /--glass-|var\(--glass/);
  assert.doesNotMatch(globalStyleCss, /backdrop-filter:\s*blur\(/);
  assert.doesNotMatch(channelsDrawerCss, /rgba\(|#[0-9a-fA-F]{3,6}|linear-gradient|radial-gradient/);
  assert.match(channelsDrawerCss, /background:\s*var\(--modal-panel-bg\);/);
  assert.match(channelsDrawerCss, /background:\s*var\(--control-bg\);/);
});

test("DuoYuan feature overlays use solid sheets instead of blurred glass", () => {
  assert.doesNotMatch(webSourceText, /backdrop-filter:\s*blur\(/);
});

test("Chat v2 feature CSS uses DuoYuan tokens instead of raw palettes", () => {
  assert.doesNotMatch(
    chatV2FeatureCss,
    /rgba\(|#[0-9a-fA-F]{3,8}|linear-gradient|radial-gradient|--sky|--atlas|--glass|backdrop-filter:\s*blur|blur\(/,
  );
  assert.match(chatV2FeatureCss, /var\(--modal-backdrop\)/);
  assert.match(chatV2FeatureCss, /var\(--modal-shadow\)/);
  assert.match(chatV2FeatureCss, /var\(--danger\)/);
  assert.match(chatV2FeatureCss, /var\(--warning\)/);
  assert.doesNotMatch(chatV2FeatureCss, /var\(--chat-panel(?:-solid)?\)/);
});

test("DuoYuan migrated feature surfaces do not use legacy sky, blue, or pink accents", () => {
  const migratedFeatureCss = [
    agentsWorkspaceCss,
    codexStackWorkspaceCss,
    codexStackCcConnectCss,
    cronWorkspaceCss,
    filesWorkspaceCss,
  ].join("\n");

  assert.doesNotMatch(globalStyleCss, /rgba\(120,\s*185,\s*255/);
  assert.doesNotMatch(globalStyleCss, /--(?:sky|violet|claw-sky|mono-purple|mono-sky-glow):/);
  assert.doesNotMatch(
    migratedFeatureCss,
    /var\(--sky\)|rgba\(120,\s*185,\s*255|rgba\(37,\s*99,\s*235|#2563eb|#ec4899|#f472b6/,
  );
});

test("global system and terminal primitives do not retain stale blue focus accents", () => {
  assert.doesNotMatch(globalStyleCss, /rgba\(91,\s*150,\s*255/);
  assert.doesNotMatch(globalStyleCss, /--duo-sky|var\(--duo-sky/);
  assert.doesNotMatch(systemWorkspaceCss, /rgba\(14,\s*165,\s*233|rgba\(2,\s*132,\s*199|var\(--duo-sky/);
  assert.doesNotMatch(terminalWorkspaceCss, /rgba\(111,\s*167,\s*255/);
});

test("terminal and system feature chrome use shared DuoYuan tokens instead of stale glass palettes", () => {
  assert.doesNotMatch(
    terminalWorkspaceCss,
    /#7c5cff|#82aaff|#7fdbca|#ffd580|#112233|#0f1419|rgba\(14,\s*21,\s*31|rgba\(15,\s*20,\s*25|rgba\(5,\s*10,\s*18|rgba\(132,\s*204,\s*255|rgba\(79,\s*132,\s*248|rgba\(16,\s*26,\s*39|rgba\(7,\s*14,\s*24|rgba\(16,\s*27,\s*40|rgba\(34,\s*49,\s*67|rgba\(236,\s*245,\s*255|rgba\(248,\s*252,\s*255|backdrop-filter:\s*blur|var\(--accent-primary,\s*#/,
  );
  assert.doesNotMatch(
    systemWorkspaceCss,
    /rgba\(186,\s*230,\s*253|var\(--duo-amber|#f59e0b|linear-gradient\(90deg,\s*color-mix\(in srgb,\s*var\(--accent-primary/,
  );
  assert.doesNotMatch(
    systemEventsCss,
    /rgba\(120,\s*185,\s*255|linear-gradient\(135deg,\s*rgba\(120,\s*185,\s*255/,
  );
  assert.match(systemEventsCss, /\.system-event-timeline-item\.is-active\s*\{[\s\S]*var\(--accent-primary\)/);
  assert.doesNotMatch(
    `${terminalWorkspaceCss}\n${systemWorkspaceCss}\n${systemEventsCss}\n${operateWorkspaceCss}`,
    /var\(--surface\)|--shell-(?:panel|stage|highlight)/,
    "expected migrated runtime feature chrome to avoid legacy surface aliases and shell-specific panel tokens",
  );
});

test("dead legacy dashboard and page-helper selectors stay deleted", () => {
  const deadSelectorPattern =
    /(?<![a-zA-Z0-9_-])(?:story-list|story-item|check-grid|check-item|activity-table|activity-row|agent-roster|agent-roster-card|agent-roster-top|agent-status|agent-roster-meta|state-online|state-ready|state-designing|table-card|table-card-inner|data-table|code-block|shell-utility-bar|page-header-stage|page-header-copy|page-header-rail|page-metric-strip|page-metric|page-metric-label|page-command-ribbon|page-command-link)(?![a-zA-Z0-9_-])/;

  assert.doesNotMatch(globalStyleCss, /\.subtle\s*\{/);
  assert.doesNotMatch(globalStyleCss, deadSelectorPattern);
  assert.doesNotMatch(webSourceText, deadSelectorPattern);
});

test("operational toggles use option rows instead of stale toggle-card primitives", () => {
  assert.match(globalStyleCss, /\.option-row\s*\{/);
  assert.doesNotMatch(globalStyleCss, /\.toggle-card\b/);
  assert.doesNotMatch(webSourceText, /toggle-card/);
});

test("global style does not own chat or files component selectors", () => {
  assert.doesNotMatch(
    globalStyleCss,
    /\.(?:topbar-actions-chat-route|chat-shell-page|chat-shell-sidebar|chat-side-inspector|chat-host-exec-confirm-dialog|chat-host-exec-confirm-primary|chat-main-stage|file-manager-loading)(?![a-zA-Z0-9_-])/,
  );
  assert.doesNotMatch(
    globalStyleCss,
    /\.main-content\.(?:chat|file|terminal)-surface-route\s*\{|\.shell-layout-chat\s*\{|\.shell-layout-files\s*\{|\.shell-route-stage-chat\s*\{|\.shell-route-stage-files\s*\{/,
  );
  assert.doesNotMatch(
    globalStyleCss,
    /\.shell-route-stage:not\(|\.route-surface-/,
    "global shell should use standard-scroll-route and explicit feature-owned classes instead of generic route-surface hooks",
  );
  assert.doesNotMatch(webSourceText, /routeSurfaceClass|route-surface-/);
  assert.doesNotMatch(globalStyleCss, /--chat-/);
});

test("remaining page-family CSS lives in feature-owned stylesheets", () => {
  assert.match(codexStackWorkspaceCss, /Migrated Codex Stack workspace rules from global style\.css/);
  assert.match(codexStackWorkspaceCss, /\.cs-status-pill/);
  assert.match(terminalWorkspaceCss, /Migrated Terminal workspace route rules from global style\.css/);
  assert.match(terminalWorkspaceCss, /\.terminal-surface-route/);
  assert.match(terminalWorkspaceCss, /\.main-content\.terminal-surface-route/);
  assert.match(skillsWorkspaceCss, /Migrated Skills workspace rules from global style\.css/);
  assert.match(skillsWorkspaceCss, /\.skills-page/);
  assert.match(systemWorkspaceCss, /Migrated System workspace rules from global style\.css/);
  assert.match(systemWorkspaceCss, /\.system-page/);
  assert.match(dreamingWorkspaceCss, /Migrated Dreaming workspace rules from global style\.css/);
  assert.match(dreamingWorkspaceCss, /\.dreaming-page/);
  assert.match(operateWorkspaceCss, /Migrated Operate workspace shared rules from global style\.css/);
  assert.match(operateWorkspaceCss, /\.operate-workspace-shell/);
  assert.match(chatShellWorkspaceCss, /\.chat-shell-sidebar/);
  assert.match(chatShellWorkspaceCss, /\.chat-host-exec-confirm-dialog/);
  assert.match(chatShellWorkspaceCss, /\.main-content\.chat-surface-route/);
  assert.match(chatShellWorkspaceCss, /\.shell-layout-chat/);
  assert.match(chatShellWorkspaceCss, /--chat-modal-bg:/);
  assert.match(chatShellWorkspaceCss, /--chat-avatar-bg:/);
  assert.match(chatOverlaySurfacesCss, /--chat-picker-mask:/);
  assert.match(chatOverlaySurfacesCss, /--chat-picker-chip-active-bg:/);
  assert.doesNotMatch(chatOverlaySurfacesCss, /rgba\(|#[0-9a-fA-F]{3,6}|linear-gradient|radial-gradient|--sky|--atlas|--glass|backdrop-filter:\s*blur/);
  assert.match(chatOverlaySurfacesCss, /--chat-picker-mask:\s*var\(--modal-backdrop\);/);
  assert.match(chatOverlaySurfacesCss, /--chat-picker-shadow:\s*var\(--modal-shadow\);/);
  assert.match(chatOverlaySurfacesCss, /\.cascade-menu-item\.danger\s*\{[\s\S]*color:\s*var\(--danger\);/);
  assert.match(filesWorkspaceCss, /\.main-content\.file-surface-route/);
  assert.match(filesWorkspaceCss, /\.shell-layout-files/);
  assert.match(filesWorkspaceCss, /\.shell-route-stage-files/);
  assert.match(filesWorkspaceCss, /\.file-manager-loading/);
});
