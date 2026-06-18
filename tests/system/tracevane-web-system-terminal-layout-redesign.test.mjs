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
const globalStyleCss = read("apps/web-vue/src/style.css");
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
  assert.match(systemControlPage, /fetchOpenClawRecoveryStatus/);
  assert.match(systemControlPage, /\{\{ text\('系统状态', 'System Status'\) \}\}/);
  assert.doesNotMatch(systemControlPage, /system-stage-tabs|mobile-stage-tabs/);
  assert.doesNotMatch(systemControlPage, /诊断指挥台|Diagnostics Command|指挥台/);
  assert.doesNotMatch(systemControlPage, /const tabs|activeTab|SystemTab|tab\./);
  assert.match(systemControlPage, /system-action-list/);
  assert.match(systemControlPage, /system-action-row/);
  assert.doesNotMatch(systemControlPage, /system-command-list|system-command-row|system-overview-command-panel|system-raw-inspector/);
  assert.match(systemControlPage, /import '\.\/system-workspace\.css';/);
  assert.doesNotMatch(systemControlPage, /<style scoped>/);
  assert.match(systemControlPage, /router\.push\('\/system\/recovery'\)/);
  assert.match(
    systemControlPage,
    /\{\{ text\('自愈守护进程', 'Recovery Daemon'\) \}\}/,
  );
  assert.match(
    systemControlPage,
    /\{\{ text\('维护终端', 'Terminal'\) \}\}/,
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
    /@media \(max-width: 880px\) \{[\s\S]*\.system-stage-nav\.mobile-task-nav \{[\s\S]*overflow-x:\s*auto/,
  );
  assert.match(
    systemWorkspaceCss,
    /\.system-sidebar-panel,[\s\S]*\.system-topic-rail,[\s\S]*\.system-stage-panel[\s\S]*background:\s*transparent;[\s\S]*border:\s*0;/,
  );
  assert.match(
    systemWorkspaceCss,
    /\.system-stage-nav\.mobile-task-nav\s*\{[\s\S]*background:\s*transparent;/,
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
  assert.doesNotMatch(terminalConsolePage, /TracevaneContextPanel/);
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

test("system status and terminal workspace expressions stay explicit", () => {
  assert.doesNotMatch(systemControlPage, /system-control-tower-surface/);
  assert.match(systemControlPage, /system-control-tower-rail/);
  assert.doesNotMatch(
    systemWorkspaceCss,
    /system-control-tower-surface::before|var\(--system-control-tower-glow\)|linear-gradient|radial-gradient/,
  );

  assert.match(terminalConsolePage, /terminal-console-surface/);
  assert.match(terminalConsolePage, /terminal-console-main/);
  assert.match(terminalWorkspaceCss, /var\(--surface-base\)/);
  assert.doesNotMatch(terminalConsolePage, /terminal-maintenance-workspace/);
  assert.doesNotMatch(terminalConsolePage, /terminal-immersive-canvas/);
  assert.doesNotMatch(terminalConsolePage, /terminal-workspace-glow/);
});

test("system refresh avoids diagnostics and recovery page handles actions", () => {
  assert.doesNotMatch(
    systemControlPage,
    /fetchSystemDiagnostics\(\)[\s\S]*notice\.value\s*=\s*null/,
  );
  assert.doesNotMatch(systemControlPage, /fetchSystemDiagnostics/);
  assert.match(systemControlPage, /fetchOpenClawRecoveryStatus/);
});

test("terminal workspace uses integrated IDE shell with resource explorer", () => {
  assert.match(terminalWorkspacePage, /terminal-workspace-body/);
  assert.match(terminalWorkspacePage, /TerminalResourceExplorer/);
  assert.match(terminalWorkspacePage, /terminal-workspace-stage/);
  assert.doesNotMatch(terminalWorkspacePage, /terminal-session-explorer/);
  assert.match(terminalWorkspacePage, /terminal-inspector-drawer/);
  assert.match(terminalSessionPane, /terminal-stage-header/);
  assert.match(terminalSessionPane, /terminal-stage-header-main/);
  assert.doesNotMatch(terminalSessionPane, /terminal-stage-header-actions/);
  assert.match(terminalSessionPane, /<template #actions>/);
  assert.doesNotMatch(terminalSessionPane, /terminal-stage-action--focus/);
  assert.doesNotMatch(terminalSessionPane, /terminal-stage-action--split/);
  assert.match(terminalSessionPane, /terminal-split-workbench/);
  assert.match(terminalSessionPane, /<header v-if="visiblePaneSessions\.length > 1" class="terminal-split-pane__bar">/);
  assert.doesNotMatch(terminalSessionPane, /sendShortcut\('c'\)/);
  assert.doesNotMatch(terminalSessionPane, /terminal-session-actions/);
  assert.match(
    terminalWorkspaceCss,
    /\.terminal-workspace-body\s*\{[\s\S]*grid-template-columns:\s*44px minmax\(220px,\s*var\(--terminal-resource-width,\s*286px\)\) 7px minmax\(0,\s*1fr\);/,
  );
  assert.match(terminalWorkspacePage, /TERMINAL_RESOURCE_EXPLORER_WIDTH_STORAGE_KEY/);
  assert.match(terminalWorkspacePage, /startResourceExplorerResize/);
  assert.match(terminalWorkspaceCss, /\.terminal-resource-sidebar-resizer\s*\{/);
  assert.match(
    terminalWorkspaceCss,
    /\.terminal-split-workbench\[data-pane-count='1'\] \.terminal-split-pane\s*\{[\s\S]*grid-template-rows:\s*minmax\(0, 1fr\);/,
  );
  assert.match(terminalWorkspaceCss, /\.terminal-inspector-drawer--overlay\s*\{/);
  assert.match(terminalWorkspaceCss, /\.terminal-resource-sidebar\s*\{/);
  assert.doesNotMatch(terminalWorkspaceCss, /\.terminal-session-sidecar\s*\{/);
  assert.match(terminalWorkspaceCss, /\.terminal-stage-header\s*\{/);
  assert.doesNotMatch(terminalWorkspaceCss, /\.terminal-stage-header-actions\s*\{/);
});

test("terminal inspector drawer width and children are overflow-safe", () => {
  assert.match(
    terminalWorkspaceCss,
    /\.terminal-inspector-drawer\s*\{[\s\S]*width:\s*min\(420px,\s*calc\(100vw - 32px\)\);/,
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
    /\.terminal-inspector-tooling\s*\{[\s\S]*min-width:\s*0;/,
  );
  assert.doesNotMatch(terminalWorkspaceCss, /\.terminal-action-panel\s*\{/);
  assert.doesNotMatch(terminalWorkspaceCss, /\.terminal-session-explorer\s*\{/);
  assert.match(
    terminalWorkspaceCss,
    /\.terminal-binary-row\s*\{[\s\S]*min-width:\s*0;/,
  );
  assert.match(
    terminalWorkspaceCss,
    /\.terminal-binary-row__meta\s*\{[\s\S]*overflow-wrap:\s*anywhere;/,
  );
  assert.match(
    terminalWorkspaceCss,
    /\.terminal-binary-row__actions\s*\{[\s\S]*gap:\s*6px;/,
  );
  assert.match(
    terminalWorkspaceCss,
    /\.terminal-tooling-status-chip\s*\{[\s\S]*padding:\s*2px 8px;/,
  );
});

test("terminal workspace keeps strong shell-relative height chain for stage and console expansion", () => {
  assert.match(
    terminalWorkspaceCss,
    /\.main-content\.terminal-surface-route\s*\{[\s\S]*padding:\s*8px;/,
  );
  assert.match(
    terminalWorkspaceCss,
    /\.main-content\.terminal-surface-route\s+\.shell-layout\s*\{[\s\S]*max-width:\s*none;[\s\S]*padding:\s*0;/,
  );
  assert.match(
    terminalWorkspaceCss,
    /\.main-content\.terminal-surface-route\s+\.shell-route-stage\s*\{[\s\S]*padding:\s*0;[\s\S]*border-radius:\s*var\(--tracevane-workspace-radius,\s*12px\);/,
  );
  assert.doesNotMatch(
    terminalWorkspaceCss,
    /\.main-content\.terminal-surface-route\s+\.tracevane-shell-topbar/,
  );
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
    /\.terminal-split-pane\s*>\s*\.terminal-console-surface\s*\{[\s\S]*height:\s*100%;/,
  );
  assert.match(
    terminalWorkspaceCss,
    /\.terminal-split-pane\s*>\s*\.terminal-console-surface\s*\{[\s\S]*min-height:\s*0;/,
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
    /\.terminal-inspector-drawer,[\s\S]*\.terminal-workspace-stage\s*\{[\s\S]*border-radius:\s*var\(--tracevane-workspace-radius,\s*12px\);/,
  );
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
    /\.terminal-container\s*\{[\s\S]*background:\s*var\(--terminal-xterm-bg\);/,
  );
  assert.doesNotMatch(
    terminalWorkspaceCss,
    /linear-gradient\(180deg,\s*var\(--claw-navy-800\)|\.terminal-session-context\s*\{/,
  );
  assert.match(
    terminalWorkspaceCss,
    /\.terminal-tab\.active[\s\S]*var\(--accent-primary/,
  );
  assert.match(
    terminalWorkspaceCss,
    /\.terminal-tab-close,[\s\S]*\.terminal-tab-rename-save,[\s\S]*\.terminal-tab-rename-cancel/,
  );
  assert.match(
    terminalWorkspaceCss,
    /html\[data-theme="light"\] \.terminal-workspace-stage/,
  );
  assert.match(
    terminalWorkspaceCss,
    /html\[data-theme="light"\] \.terminal-stage-header/,
  );
  assert.doesNotMatch(
    terminalWorkspaceCss,
    /rgba\(14,\s*21,\s*31|rgba\(15,\s*20,\s*25|rgba\(5,\s*10,\s*18|#112233|#0f1419/,
  );
  assert.doesNotMatch(
    terminalWorkspaceCss,
    /var\(--claw-navy|var\(--sky|var\(--atlas|var\(--glass/,
  );
  assert.match(terminalWorkspaceCss, /\.terminal-workspace-shell\[data-terminal-theme='matrix'\][\s\S]*--terminal-xterm-bg:\s*#[0-9a-fA-F]{6};/);
  assert.match(terminalWorkspaceCss, /\.terminal-workspace-shell\[data-terminal-theme='amber'\][\s\S]*--terminal-xterm-bg:\s*#[0-9a-fA-F]{6};/);
  assert.match(terminalWorkspaceCss, /\.terminal-workspace-shell\[data-terminal-theme='midnight'\][\s\S]*--terminal-xterm-bg:\s*#[0-9a-fA-F]{6};/);
  assert.match(terminalWorkspaceCss, /\.terminal-mobile-sheet-mask[\s\S]*background:\s*var\(--modal-backdrop\);/);
  assert.match(terminalWorkspaceCss, /\.terminal-install-output-sheet[\s\S]*box-shadow:[\s\S]*var\(--mono-shadow-md\),/);
  assert.match(terminalWorkspaceCss, /\.terminal-install-output-log[\s\S]*background:\s*var\(--code-bg\);/);
  assert.match(terminalWorkspaceCss, /\.terminal-tab-dot\[data-tone='warning'\][\s\S]*background:\s*var\(--warning\);/);
  assert.match(terminalConsolePage, /theme:\s*buildTerminalTheme\(\)/);
  assert.match(terminalConsolePage, /resolveTerminalThemeColor/);
  assert.doesNotMatch(
    terminalConsolePage,
    /#[0-9a-fA-F]{3,6}|#0f1419|#e6e1cf|#7fdbca|#ffd580|#82aaff|#c792ea|#89ddff/,
  );
  assert.match(globalStyleCss, /--terminal-xterm-bg:\s*var\(--mono-bg\);/);
  assert.match(globalStyleCss, /--terminal-xterm-bright-white:\s*var\(--mono-ink\);/);
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
    /terminalPostLayoutFitFrame = window\.requestAnimationFrame\(\(\) => \{[\s\S]*terminalFitFrame = window\.requestAnimationFrame\(runFit\);/,
  );
  assert.match(
    terminalConsolePage,
    /const runFit = \(\) => \{[\s\S]*syncTerminalSize\(\);[\s\S]*scheduleTerminalRenderRefresh\(\);/,
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
    /resizeObserver = new ResizeObserver\(\(\) => \{[\s\S]*schedulePostLayoutFitSync\(\);[\s\S]*\}\);/,
  );
});
