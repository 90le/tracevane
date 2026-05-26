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
const terminalWorkspaceCss = read("apps/web-vue/src/features/terminal/terminal-workspace.css");
const skillsWorkspaceCss = read("apps/web-vue/src/features/skills/skills-workspace.css");
const systemWorkspaceCss = read("apps/web-vue/src/features/system/system-workspace.css");
const dreamingWorkspaceCss = read("apps/web-vue/src/features/dreaming/dreaming-workspace.css");
const operateWorkspaceCss = read("apps/web-vue/src/features/operate/operate-workspace.css");
const chatShellWorkspaceCss = read("apps/web-vue/src/features/chat-v2/chat-shell-workspace.css");
const chatOverlaySurfacesCss = read("apps/web-vue/src/features/chat-v2/overlay-surfaces.css");
const filesWorkspaceCss = read("apps/web-vue/src/features/files/files-workspace.css");
const webSourceText = readFilesUnder("apps/web-vue/src", (entryPath) => /\.(?:vue|ts|js|css)$/.test(entryPath));

test("global style no longer owns remaining page-family selectors", () => {
  assert.doesNotMatch(
    globalStyleCss,
    /\.(?:cs-[a-zA-Z0-9_-]*|terminal[a-zA-Z0-9_-]*|skills[a-zA-Z0-9_-]*|system[a-zA-Z0-9_-]*|dreaming[a-zA-Z0-9_-]*|operate-[a-zA-Z0-9_-]*|account-tile|binding-item|request-item|tag-chip|capability-chip)/,
  );
});

test("dead legacy dashboard and page-helper selectors stay deleted", () => {
  const deadSelectorPattern =
    /(?<![a-zA-Z0-9_-])(?:story-list|story-item|check-grid|check-item|activity-table|activity-row|agent-roster|agent-roster-card|agent-roster-top|agent-status|agent-roster-meta|state-online|state-ready|state-designing|table-card|table-card-inner|data-table|code-block|shell-utility-bar|page-header-stage|page-header-copy|page-header-rail|page-metric-strip|page-metric|page-metric-label|page-command-ribbon|page-command-link)(?![a-zA-Z0-9_-])/;

  assert.doesNotMatch(globalStyleCss, /\.subtle\s*\{/);
  assert.doesNotMatch(globalStyleCss, deadSelectorPattern);
  assert.doesNotMatch(webSourceText, deadSelectorPattern);
});

test("global style does not own chat or files component selectors", () => {
  assert.doesNotMatch(
    globalStyleCss,
    /\.(?:topbar-actions-chat-route|chat-shell-page|chat-shell-sidebar|chat-side-inspector|chat-host-exec-confirm-dialog|chat-host-exec-confirm-primary|chat-main-stage|file-manager-loading)(?![a-zA-Z0-9_-])/,
  );
  assert.doesNotMatch(
    globalStyleCss,
    /\.main-content\.chat-surface-route\s*\{|\.main-content\.file-surface-route\s*\{|\.shell-layout-chat\s*\{|\.shell-layout-files\s*\{|\.shell-route-stage-chat\s*\{|\.shell-route-stage-files\s*\{/,
  );
  assert.doesNotMatch(globalStyleCss, /--chat-/);
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
  assert.match(filesWorkspaceCss, /\.main-content\.file-surface-route/);
  assert.match(filesWorkspaceCss, /\.shell-layout-files/);
  assert.match(filesWorkspaceCss, /\.shell-route-stage-files/);
  assert.match(filesWorkspaceCss, /\.file-manager-loading/);
});
