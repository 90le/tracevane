import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const testFileDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(testFileDir, "..", "..");
const read = (filePath) =>
  fs.readFileSync(path.join(rootDir, filePath), "utf8");

const systemControlPage = read(
  "apps/web-vue/src/features/system/SystemControlPage.vue",
);
const systemWorkspaceCss = read(
  "apps/web-vue/src/features/system/system-workspace.css",
);
const terminalConsolePage = read(
  "apps/web-vue/src/features/terminal/TerminalConsolePage.vue",
);
const terminalWorkspacePage = read(
  "apps/web-vue/src/features/terminal/TerminalWorkspacePage.vue",
);
const terminalWorkspaceCss = read(
  "apps/web-vue/src/features/terminal/terminal-workspace.css",
);
const terminalSessionPane = read(
  "apps/web-vue/src/features/terminal/TerminalSessionPane.vue",
);

test("system and terminal pages keep dedicated surface contracts", () => {
  assert.match(systemControlPage, /system-control-surface/);
  assert.match(systemControlPage, /system-health-strip/);
  assert.match(systemControlPage, /system-control-grid/);
  assert.match(systemControlPage, /system-main-stage/);
  assert.match(systemControlPage, /system-raw-inspector/);
  assert.match(systemControlPage, /class="system-stage-tabs mobile-stage-tabs"/);
  assert.match(systemControlPage, /system-command-list/);
  assert.match(systemControlPage, /system-command-row/);
  assert.match(systemControlPage, /import '\.\/system-workspace\.css';/);
  assert.doesNotMatch(systemControlPage, /<style scoped>/);
  assert.match(systemControlPage, /router\.push\('\/system\/events'\)/);
  assert.match(
    systemControlPage,
    /\{\{ text\('事件中心', 'Event Center'\) \}\}/,
  );
  assert.match(
    systemControlPage,
    /\{\{ text\('去终端', 'Open Terminal'\) \}\}/,
  );
  assert.match(
    systemControlPage,
    /\{\{ text\('去定时任务', 'Open Cron'\) \}\}/,
  );
  assert.match(
    systemWorkspaceCss,
    /@media \(max-width: 1180px\) \{[\s\S]*\.system-main-stage \{[\s\S]*order:\s*-1;/,
  );
  assert.match(
    systemWorkspaceCss,
    /\.system-main-stage\s*\{[\s\S]*order:\s*-1;/,
  );
  assert.match(
    systemWorkspaceCss,
    /@media \(max-width: 880px\) \{[\s\S]*\.system-stage-tabs\.mobile-stage-tabs \{[\s\S]*overflow-x:\s*auto/,
  );
  assert.match(
    systemWorkspaceCss,
    /\.system-sidebar-panel,[\s\S]*\.system-topic-rail,[\s\S]*\.system-stage-panel[\s\S]*background:\s*transparent;[\s\S]*border:\s*0;/,
  );
  assert.match(
    systemWorkspaceCss,
    /\.system-stage-tabs\.mobile-stage-tabs\s*\{[\s\S]*background:\s*transparent;/,
  );
  assert.match(
    systemWorkspaceCss,
    /\.system-callout-error\s*\{[\s\S]*background:\s*var\(--surface-danger\);[\s\S]*border-color:\s*color-mix\(in srgb,\s*var\(--danger\)\s*28%,\s*var\(--border-subtle\)\);/,
  );

  assert.match(terminalConsolePage, /terminal-console-surface/);
  assert.match(terminalConsolePage, /terminal-console-main/);
  assert.match(terminalConsolePage, /terminal-container/);
  assert.doesNotMatch(terminalConsolePage, /terminal-console-toolbar/);
  assert.doesNotMatch(terminalConsolePage, /terminal-workspace-surface/);
  assert.doesNotMatch(terminalConsolePage, /terminal-workspace-grid/);
  assert.doesNotMatch(terminalConsolePage, /terminal-side-utilities/);
  assert.doesNotMatch(terminalConsolePage, /page-header-row/);
  assert.doesNotMatch(terminalConsolePage, /StudioContextPanel/);
  assert.doesNotMatch(
    terminalConsolePage,
    /context-rail|context rail|right rail/,
  );
  assert.match(
    terminalWorkspaceCss,
    /\.terminal-console-main\s*\{[\s\S]*background:\s*var\(--surface-base\);[\s\S]*border:\s*1px\s+solid\s+var\(--border-subtle\);/,
  );
  assert.match(terminalConsolePage, /import '\.\/terminal-workspace\.css';/);
  assert.doesNotMatch(terminalConsolePage, /<style scoped>/);
});

test("system control tower and terminal workspace expressions stay explicit", () => {
  assert.match(systemControlPage, /system-control-tower-surface/);
  assert.match(systemControlPage, /system-control-tower-rail/);
  assert.match(systemWorkspaceCss, /var\(--system-control-tower-glow\)/);

  assert.match(terminalConsolePage, /terminal-console-surface/);
  assert.match(terminalConsolePage, /terminal-console-main/);
  assert.match(terminalWorkspaceCss, /var\(--surface-base\)/);
  assert.doesNotMatch(terminalConsolePage, /terminal-maintenance-workspace/);
  assert.doesNotMatch(terminalConsolePage, /terminal-immersive-canvas/);
  assert.doesNotMatch(terminalConsolePage, /terminal-workspace-glow/);
});

test("system refresh preserves action notices", () => {
  assert.doesNotMatch(
    systemControlPage,
    /fetchSystemDiagnostics\(\)[\s\S]*notice\.value\s*=\s*null/,
  );
  assert.match(systemControlPage, /interface RefreshAllOptions/);
  assert.match(
    systemControlPage,
    /await refreshAll\(\{ preserveNotice: true \}\);/,
  );
  assert.match(
    systemControlPage,
    /async function refreshAll\(options: RefreshAllOptions = \{\}\): Promise<void> \{[\s\S]*if \(!options\.preserveNotice\) \{[\s\S]*errorMessage\.value = '';/,
  );
});

test("terminal workspace uses integrated stage-drawer shell without dedicated explorer", () => {
  assert.match(terminalWorkspacePage, /terminal-workspace-body/);
  assert.match(terminalWorkspacePage, /terminal-workspace-stage/);
  assert.doesNotMatch(terminalWorkspacePage, /terminal-session-explorer/);
  assert.match(terminalWorkspacePage, /terminal-inspector-drawer/);
  assert.match(terminalSessionPane, /terminal-stage-header/);
  assert.match(terminalSessionPane, /terminal-stage-header-main/);
  assert.match(terminalSessionPane, /terminal-stage-header-actions/);
  assert.match(terminalSessionPane, /terminal-stage-action--focus/);
  assert.match(terminalSessionPane, /sendShortcut\('c'\)/);
  assert.doesNotMatch(terminalSessionPane, /terminal-session-actions/);
  assert.doesNotMatch(
    terminalWorkspaceCss,
    /grid-template-columns:\s*280px minmax\(0, 1fr\) auto/,
  );
  assert.match(
    terminalWorkspaceCss,
    /grid-template-columns:\s*minmax\(0, 1fr\)\s+clamp\(300px,\s*28vw,\s*380px\);/,
  );
  assert.match(terminalWorkspaceCss, /\.terminal-stage-header\s*\{/);
});

test("terminal inspector drawer width and children are overflow-safe", () => {
  assert.match(
    terminalWorkspaceCss,
    /\.terminal-inspector-drawer\s*\{[\s\S]*width:\s*clamp\(300px,\s*28vw,\s*380px\);/,
  );
  assert.match(
    terminalWorkspaceCss,
    /\.terminal-inspector-drawer\s*\{[\s\S]*max-width:\s*100%;/,
  );
  assert.match(
    terminalWorkspaceCss,
    /\.terminal-inspector-drawer\s*\{[\s\S]*display:\s*flex;[\s\S]*flex-direction:\s*column;[\s\S]*min-height:\s*0;[\s\S]*height:\s*100%;/,
  );
  assert.match(terminalWorkspacePage, /terminal-inspector-rail-scroll/);
  assert.match(
    terminalWorkspaceCss,
    /\.terminal-inspector-rail-scroll\s*\{[\s\S]*overflow-y:\s*auto;[\s\S]*min-height:\s*0;/,
  );
  assert.match(
    terminalWorkspaceCss,
    /\.terminal-inspector-tooling,[\s\S]*\.terminal-action-panel,[\s\S]*\.terminal-tooling-status-item\s*\{[\s\S]*min-width:\s*0;/,
  );
  assert.match(
    terminalWorkspaceCss,
    /\.terminal-inspector-tooling-summary\s*\{[\s\S]*overflow-wrap:\s*anywhere;/,
  );
  assert.match(
    terminalWorkspaceCss,
    /\.terminal-tooling-status-meta\s*\{[\s\S]*overflow-wrap:\s*anywhere;/,
  );
  assert.match(
    terminalWorkspaceCss,
    /\.terminal-tooling-status-list\s*\{[\s\S]*gap:\s*6px;/,
  );
  assert.match(
    terminalWorkspaceCss,
    /\.terminal-tooling-status-item\s*\{[\s\S]*padding:\s*6px;/,
  );
});

test("terminal workspace keeps strong shell-relative height chain for stage and console expansion", () => {
  assert.doesNotMatch(
    terminalWorkspaceCss,
    /\.terminal-workspace-shell\s*\{[\s\S]*min-height:\s*100dvh;/,
  );
  assert.match(
    terminalWorkspaceCss,
    /\.terminal-workspace-body\s*\{[\s\S]*align-items:\s*stretch;/,
  );
  assert.match(
    terminalWorkspaceCss,
    /\.terminal-workspace-shell\s*\{[\s\S]*display:\s*grid;/,
  );
  assert.match(
    terminalWorkspaceCss,
    /\.terminal-workspace-shell\s*\{[\s\S]*min-height:\s*0;/,
  );
  assert.match(
    terminalWorkspaceCss,
    /\.terminal-workspace-body\s*\{[\s\S]*min-height:\s*0;/,
  );
  assert.match(
    terminalWorkspaceCss,
    /\.terminal-workspace-stage\s*\{[\s\S]*min-height:\s*0;/,
  );
  assert.match(
    terminalWorkspaceCss,
    /\.terminal-session-pane\s*\{[\s\S]*min-height:\s*0;/,
  );
  assert.match(
    terminalWorkspaceCss,
    /\.terminal-session-pane\s*\{[\s\S]*height:\s*100%;/,
  );
  assert.match(
    terminalWorkspaceCss,
    /\.terminal-session-pane\s*\{[\s\S]*grid-template-rows:\s*auto minmax\(0,\s*1fr\);/,
  );
  assert.match(
    terminalWorkspaceCss,
    /\.terminal-session-pane\s*>\s*\.terminal-console-surface\s*\{[\s\S]*height:\s*100%;/,
  );
  assert.match(
    terminalWorkspaceCss,
    /\.terminal-session-pane\s*>\s*\.terminal-console-surface\s*\{[\s\S]*min-height:\s*0;/,
  );
  assert.match(
    terminalWorkspaceCss,
    /\.terminal-console-surface\s*\{[\s\S]*min-height:\s*0;/,
  );
  assert.match(
    terminalWorkspaceCss,
    /\.terminal-console-surface\s*\{[\s\S]*height:\s*100%;/,
  );
  assert.match(
    terminalWorkspaceCss,
    /\.terminal-console-main\s*\{[\s\S]*min-height:\s*0;/,
  );
  assert.match(
    terminalWorkspaceCss,
    /\.terminal-console-main\s*\{[\s\S]*height:\s*100%;/,
  );
  assert.match(
    terminalWorkspaceCss,
    /\.terminal-container\s*\{[\s\S]*display:\s*grid;/,
  );
  assert.match(
    terminalWorkspaceCss,
    /\.terminal-container\s*\{[\s\S]*grid-template-rows:\s*minmax\(0,\s*1fr\);/,
  );
});

test("terminal workspace theme uses unified surface tokens for stage and drawer", () => {
  assert.match(
    terminalWorkspaceCss,
    /\.terminal-workspace-stage[\s\S]*background:\s*var\(--surface-base\);/,
  );
  assert.match(
    terminalWorkspaceCss,
    /\.terminal-inspector-drawer[\s\S]*background:\s*var\(--surface-base\);/,
  );
  assert.match(
    terminalWorkspaceCss,
    /\.terminal-workspace-stage[\s\S]*border:\s*1px solid var\(--border-subtle\);/,
  );
  assert.match(
    terminalWorkspaceCss,
    /\.terminal-tab\.active[\s\S]*var\(--accent-primary/,
  );
  assert.match(
    terminalWorkspaceCss,
    /\.terminal-tab-rename,[\s\S]*\.terminal-tab-close,[\s\S]*\.terminal-tab-end,[\s\S]*\.terminal-tab-delete/,
  );
  assert.match(
    terminalWorkspaceCss,
    /html\[data-theme="light"\] \.terminal-workspace-stage/,
  );
  assert.match(
    terminalWorkspaceCss,
    /html\[data-theme="light"\] \.terminal-stage-header/,
  );
});

test("terminal workspace embeds console in flush stage mode", () => {
  assert.match(
    terminalSessionPane,
    /<TerminalConsolePage[\s\S]*:embedded="true"/,
  );
  assert.match(terminalConsolePage, /embedded\?:\s*boolean;/);
  assert.match(terminalConsolePage, /embedded:\s*false,/);
  assert.match(
    terminalConsolePage,
    /'terminal-console-surface-embedded':\s*props\.embedded/,
  );
  assert.match(
    terminalWorkspaceCss,
    /\.terminal-console-surface-embedded\s+\.terminal-console-main\s*\{[\s\S]*border:\s*0;/,
  );
  assert.match(
    terminalWorkspaceCss,
    /\.terminal-console-surface-embedded\s+\.terminal-console-main\s*\{[\s\S]*border-radius:\s*0;/,
  );
});

test("terminal console reruns fit after mount and attach for settled stage dimensions", () => {
  assert.match(
    terminalConsolePage,
    /requestAnimationFrame\(\(\) => \{[\s\S]*requestAnimationFrame\(\(\) => \{[\s\S]*syncTerminalSize\(\);/,
  );
  assert.match(
    terminalConsolePage,
    /await nextTick\(\);[\s\S]*schedulePostLayoutFitSync\(\);/,
  );
  assert.match(
    terminalConsolePage,
    /attachGatewayTerminal\([\s\S]*schedulePostLayoutFitSync\(\);/,
  );
  assert.match(
    terminalConsolePage,
    /socket\.onopen = \(\) => \{[\s\S]*schedulePostLayoutFitSync\(\);/,
  );
  assert.match(
    terminalConsolePage,
    /new ResizeObserver\(\(\) => [\s\S]*schedulePostLayoutFitSync\(\)\)/,
  );
});
