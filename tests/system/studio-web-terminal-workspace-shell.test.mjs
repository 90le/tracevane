import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const terminalViewPath = path.join(
  rootDir,
  "apps/web-vue/src/views/TerminalView.vue",
);
const workspacePagePath = path.join(
  rootDir,
  "apps/web-vue/src/features/terminal/TerminalWorkspacePage.vue",
);
const inspectorContentPath = path.join(
  rootDir,
  "apps/web-vue/src/features/terminal/TerminalInspectorContent.vue",
);
const workspaceCssPath = path.join(
  rootDir,
  "apps/web-vue/src/features/terminal/terminal-workspace.css",
);
const terminalServicePath = path.join(
  rootDir,
  "apps/api/modules/terminal/service.ts",
);
const terminalRoutesPath = path.join(
  rootDir,
  "apps/api/modules/terminal/routes.ts",
);
const terminalConsolePath = path.join(
  rootDir,
  "apps/web-vue/src/features/terminal/TerminalConsolePage.vue",
);
const terminalTabRailPath = path.join(
  rootDir,
  "apps/web-vue/src/features/terminal/TerminalTabRail.vue",
);
const terminalSessionExplorerPath = path.join(
  rootDir,
  "apps/web-vue/src/features/terminal/TerminalSessionExplorer.vue",
);
const terminalActionPanelPath = path.join(
  rootDir,
  "apps/web-vue/src/features/terminal/TerminalActionPanel.vue",
);
const terminalSessionPanePath = path.join(
  rootDir,
  "apps/web-vue/src/features/terminal/TerminalSessionPane.vue",
);
const studioPluginPath = path.join(
  rootDir,
  "index.ts",
);

const terminalView = fs.readFileSync(terminalViewPath, "utf8");
const workspacePage = fs.readFileSync(workspacePagePath, "utf8");
const workspaceCss = fs.readFileSync(workspaceCssPath, "utf8");
const inspectorContent = fs.readFileSync(inspectorContentPath, "utf8");
const terminalService = fs.readFileSync(terminalServicePath, "utf8");
const terminalRoutes = fs.readFileSync(terminalRoutesPath, "utf8");
const terminalConsole = fs.readFileSync(terminalConsolePath, "utf8");
const terminalTabRail = fs.readFileSync(terminalTabRailPath, "utf8");
const terminalSessionExplorer = fs.readFileSync(terminalSessionExplorerPath, "utf8");
const terminalActionPanel = fs.readFileSync(terminalActionPanelPath, "utf8");
const terminalSessionPane = fs.readFileSync(terminalSessionPanePath, "utf8");
const studioPluginSource = fs.readFileSync(studioPluginPath, "utf8");
const terminalHistoryPath = path.join(
  rootDir,
  "apps/web-vue/src/features/terminal/terminal-session-history.ts",
);
const terminalHistory = fs.readFileSync(terminalHistoryPath, "utf8");
const terminalRouteSyncPath = path.join(
  rootDir,
  "apps/web-vue/src/features/terminal/terminal-route-sync.ts",
);
const terminalRouteSync = fs.readFileSync(terminalRouteSyncPath, "utf8");
const apiRuntimeConfigPath = path.join(rootDir, "apps/api/runtime-config.ts");
const apiRuntimeConfig = fs.readFileSync(apiRuntimeConfigPath, "utf8");
const webRuntimeConfigPath = path.join(rootDir, "apps/web-vue/src/shared/runtime-config.ts");
const webRuntimeConfig = fs.readFileSync(webRuntimeConfigPath, "utf8");

test("terminal view mounts workspace page instead of console placeholder", () => {
  assert.match(terminalView, /<TerminalWorkspacePage\s*\/>/);
  assert.match(
    terminalView,
    /import\s*\{\s*TerminalWorkspacePage\s*\}\s*from\s*['"]\.\.\/features\/terminal['"]/,
  );
  assert.match(terminalView, /import\s+['"]\.\.\/features\/terminal\/terminal-workspace\.css['"];/);
  assert.doesNotMatch(terminalView, /<style scoped>/);
  assert.doesNotMatch(terminalView, /<TerminalConsolePage\s*\/>/);
});

test("terminal console styles are owned by terminal workspace css", () => {
  assert.match(terminalConsole, /import '\.\/terminal-workspace\.css';/);
  assert.doesNotMatch(terminalConsole, /<style scoped>/);
  assert.match(workspaceCss, /\.terminal-view-route\s*\{/);
  assert.match(workspaceCss, /\.terminal-console-surface\s*\{/);
  assert.match(workspaceCss, /\.terminal-console-main\s*\{/);
  assert.match(workspaceCss, /\.terminal-container \.xterm/);
  assert.doesNotMatch(workspaceCss, /:deep|:global/);
});

test("terminal service wires descriptor and ledger persistence for session recovery", () => {
  assert.match(terminalService, /createTerminalSessionDescriptorStore/);
  assert.match(terminalService, /createTerminalSessionLedger/);
  assert.match(terminalService, /descriptorStore\.upsert\(/);
  assert.match(terminalService, /ledger\.append\(/);
  assert.match(terminalService, /listPersistedSessions\(\)/);
  assert.match(
    terminalService,
    /getPersistedSession\([\s\S]*sessionId: string[\s\S]*\)/,
  );
  assert.match(
    terminalService,
    /listSessionLedger\([\s\S]*sessionId: string[\s\S]*\)/,
  );
  assert.match(
    terminalService,
    /pruneExpiredGatewaySubscribers[\s\S]*persistSessionDescriptor\(session\)/,
  );
  assert.match(
    terminalService,
    /broadcastGatewayEvent[\s\S]*persistSessionDescriptor\(session\)/,
  );
  assert.match(
    terminalService,
    /session\.handoffContext = payload\.handoffContext/,
  );
  assert.match(terminalService, /markPersistedSessionLost/);
  assert.match(terminalService, /reconcilePersistedDescriptor/);
  assert.match(terminalService, /terminal_session_unavailable/);
});

test("terminal routes expose minimal recovery endpoints for persisted sessions", () => {
  assert.match(terminalRoutes, /\"\/api\/terminal\/sessions\/:sessionId\"/);
  assert.match(
    terminalRoutes,
    /\"\/api\/terminal\/sessions\/:sessionId\/ledger\"/,
  );
  assert.match(
    terminalRoutes,
    /\"\/api\/terminal\/sessions\/:sessionId\/stream\"/,
  );
  assert.match(terminalRoutes, /startSse\(res\)/);
  assert.match(terminalRoutes, /sendSseEvent\(res, "terminal", event\)/);
});

test("terminal side panels do not duplicate terminal output history", () => {
  const panePath = path.join(
    rootDir,
    "apps/web-vue/src/features/terminal/TerminalSessionPane.vue",
  );
  const pane = fs.readFileSync(panePath, "utf8");

  assert.doesNotMatch(pane, /terminal-session-output-disclosure/);
  assert.doesNotMatch(pane, /recentOutputSummaryLabel/);
  assert.doesNotMatch(inspectorContent, /terminal-inspector-recent-output/);
  assert.doesNotMatch(inspectorContent, /recentOutput\.tailText/);
  assert.doesNotMatch(inspectorContent, /recentOutput\.lastError/);
  assert.doesNotMatch(terminalSessionExplorer, /terminal-session-item__snippet/);
  assert.doesNotMatch(terminalSessionExplorer, /recentOutputSummary\.tailText/);
  assert.doesNotMatch(workspacePage, /activeSessionRecentOutputLabel/);
  assert.match(terminalConsole, /handoffContext: readRouteHandoffContext\(\)/);
});

test("terminal workspace page composes integrated shell sections and binds state modules", () => {
  assert.equal(fs.existsSync(workspacePagePath), true);
  assert.equal(fs.existsSync(workspaceCssPath), true);

  assert.match(workspacePage, /<section class="terminal-workspace-shell"/);
  assert.match(workspacePage, /<TerminalSessionPane/);
  assert.match(workspacePage, /<TerminalInspectorDrawer/);
  assert.match(workspacePage, /<TerminalInspectorContent/);
  assert.match(inspectorContent, /<TerminalSessionExplorer/);
  assert.doesNotMatch(workspacePage, /<TerminalTabRail/);
  assert.doesNotMatch(workspacePage, /<TerminalRecentSessionRail/);

  assert.match(
    workspacePage,
    /import \{ createTerminalWorkspaceState \} from '\.\/terminal-workspace-state'/,
  );
  assert.match(
    workspacePage,
    /import \{ buildTerminalActionLayers \} from '\.\/terminal-action-catalog'/,
  );
  assert.match(
    workspacePage,
    /import \{ bindTerminalRouteSync \} from '\.\/terminal-route-sync'/,
  );
  assert.match(workspacePage, /fetchPersistedTerminalSessions/);
  assert.match(workspacePage, /fetchTerminalStatus/);
  assert.doesNotMatch(workspacePage, /installTerminalCli/);
  assert.match(
    workspacePage,
    /workspace\.hydrateSessions\(summary\.sessions \|\| \[\]\)/,
  );
  assert.doesNotMatch(workspacePage, /fetchTerminalSessions\(/);

  assert.match(workspaceCss, /\.terminal-workspace-shell\s*\{/);
});

test("terminal workspace exposes shared inspector content and mobile bottom sheet trigger", () => {
  assert.match(workspacePage, /<TerminalInspectorContent/);
  assert.match(workspacePage, /desktopInspectorOpen/);
  assert.match(workspacePage, /terminal-desktop-inspector-trigger/);
  assert.match(workspacePage, /terminal-mobile-inspector-trigger/);
  assert.match(workspacePage, /<DialogRoot v-if="compactInspectorMode" v-model:open="mobileInspectorOpen">/);
  assert.match(workspacePage, /terminal-mobile-sheet/);
  assert.match(workspacePage, /closeMobileInspectorIfCompact\(\)/);
  assert.match(inspectorContent, /terminal-inspector-switcher__button/);
  assert.match(inspectorContent, /terminal-summary-inline__chip/);
  assert.doesNotMatch(workspaceCss, /var\(--atlas-|var\(--atlas/);
  assert.match(
    workspaceCss,
    /\.terminal-inspector-summary-grid,[\s\S]*\.terminal-binary-list\s*\{[\s\S]*background:\s*var\(--line\);/,
  );
  assert.match(
    workspaceCss,
    /\.terminal-workspace-stage\s*\{[\s\S]*background:\s*var\(--surface-base\);[\s\S]*box-shadow:\s*var\(--mono-shadow-sm,/,
  );
});

test("terminal inspector does not duplicate persisted history beside the terminal", () => {
  assert.doesNotMatch(workspacePage, /fetchPersistedTerminalSessionLedger/);
  assert.doesNotMatch(workspacePage, /buildTerminalSessionHistory/);
  assert.doesNotMatch(workspacePage, /sessionHistoryEntries/);
  assert.doesNotMatch(workspacePage, /loadSessionHistory/);
  assert.doesNotMatch(workspacePage, /handleReplayLastCommand/);
  assert.doesNotMatch(inspectorContent, /TerminalSessionHistoryPanel/);
  assert.doesNotMatch(inspectorContent, /historyEntries/);
  assert.doesNotMatch(inspectorContent, /replayLastCommand/);
  assert.equal(
    fs.existsSync(path.join(rootDir, "apps/web-vue/src/features/terminal/TerminalSessionHistoryPanel.vue")),
    false,
  );
  assert.match(terminalHistory, /buildTerminalSessionReplayTranscript/);
});

test("terminal console keeps replay cursor ephemeral so refreshed xterm replays backlog", () => {
  assert.doesNotMatch(terminalConsole, /TERMINAL_RUNTIME_STORAGE_KEY/);
  assert.match(terminalConsole, /Keep replay cursor state in-memory only/);
  assert.match(terminalConsole, /fetchPersistedTerminalSessionLedger/);
  assert.match(terminalConsole, /buildTerminalSessionReplayTranscript/);
  assert.match(terminalConsole, /restorePersistedTranscriptIfNeeded/);
  assert.match(terminalConsole, /restoreTranscript\?: boolean/);
  assert.match(terminalConsole, /restoreTranscript: true/);
  assert.match(terminalConsole, /if \(!props\.restoreTranscript\) return false;/);
  assert.match(terminalConsole, /Do not advance lastOutputSeq from the session summary/);
  assert.doesNotMatch(
    terminalConsole,
    /payload\.type === 'session'[\s\S]{0,500}lastOutputSeq = payload\.outputSeq/,
  );
  assert.doesNotMatch(terminalConsole, /requestGatewayOutputCatchup/);
  assert.doesNotMatch(terminalConsole, /scheduleGatewayOutputCatchup/);
  assert.doesNotMatch(terminalConsole, /gatewayOutputCatchupDirty/);
  assert.match(terminalConsole, /clearGatewayInputRecovery/);
  assert.match(terminalConsole, /scheduleGatewayInputRecovery/);
  assert.match(terminalConsole, /const lastSeenSeq = lastOutputSeq/);
  assert.match(terminalConsole, /TERMINAL_GATEWAY_COMMAND_RECOVERY_MS/);
  assert.match(terminalConsole, /scheduleGatewayInputRecovery\(lastSeenSeq, TERMINAL_GATEWAY_COMMAND_RECOVERY_MS\)/);
  assert.match(terminalConsole, /handleGatewayAckResponse/);
  assert.match(terminalConsole, /gatewayClient\.notify\(STUDIO_TERMINAL_GATEWAY_METHODS\.input/);
  assert.match(terminalConsole, /ackMode: 'none'/);
  assert.match(terminalConsole, /buildTerminalStreamUrl/);
  assert.match(terminalConsole, /new EventSource/);
  assert.match(terminalConsole, /outputMode: useHttpStream \? 'http-stream' : undefined/);
  assert.match(terminalConsole, /terminalHttpStreamActive/);
  assert.match(terminalConsole, /terminalHttpStreamFailed/);
  assert.match(terminalConsole, /terminalInputAckLatencyMs\.value = 0/);
  assert.match(terminalConsole, /shouldScheduleGatewayInputRecovery/);
  assert.match(terminalConsole, /lastSeq: lastOutputSeq \|\| undefined/);
  assert.match(terminalConsole, /instanceId: terminalInstanceId \|\| undefined/);
  assert.match(terminalConsole, /handleGatewayAckResponse\(response as TerminalGatewayAckResponse\)/);
  assert.match(terminalConsole, /enqueueTerminalOutput/);
  assert.match(terminalConsole, /flushTerminalOutputQueue/);
  assert.match(terminalConsole, /TERMINAL_IMMEDIATE_OUTPUT_LIMIT/);
  assert.match(terminalConsole, /TERMINAL_BULK_OUTPUT_FLUSH_MS/);
  assert.match(terminalConsole, /window\.setTimeout\(flushTerminalOutputQueue, TERMINAL_BULK_OUTPUT_FLUSH_MS\)/);
  assert.match(terminalConsole, /clearTerminalOutputQueue/);
  assert.match(terminalConsole, /terminalSyncState/);
  assert.match(terminalConsole, /terminalConnectionLabel/);
  assert.match(terminalConsole, /terminalLatencyLabel/);
  assert.match(terminalConsole, /terminalLastInputAt/);
  assert.match(terminalConsole, /terminalLastAckAt/);
  assert.match(terminalConsole, /terminalLastHeartbeatAt/);
  assert.match(terminalConsole, /terminalInputAckLatencyMs/);
  assert.match(terminalConsole, /terminalOutputLatencyMs/);
  assert.match(terminalConsole, /payload\.emittedAtMs/);
  assert.match(terminalConsole, /inputStartedAt/);
  assert.match(terminalConsole, /heartbeat: true/);
  assert.match(terminalConsole, /connectDelayMs: 50/);
  assert.match(terminalConsole, /canUseDirectTerminalSocket/);
  assert.match(terminalConsole, /getStudioTerminalDirectWebSocketUrl/);
  assert.match(terminalConsole, /terminalDirectSocketActive/);
  assert.match(terminalConsole, /fallbackFromDirectSocket/);
  assert.match(terminalConsole, /payload\.type === 'clear'/);
  assert.match(terminalConsole, /clearedThroughSeq/);
  assert.match(terminalConsole, /adoptOutputSeq/);
  assert.match(terminalConsole, /suppressGapRecovery/);
  assert.match(terminalConsole, /STUDIO_TERMINAL_GATEWAY_METHODS\.clear/);
  assert.match(terminalConsole, /ws\.send\(JSON\.stringify\(\{ type: 'clear' \}\)\)/);
  assert.match(terminalConsole, /formatTerminalPaste/);
  assert.match(terminalConsole, /termInstance\?\.modes\.bracketedPasteMode/);
  assert.match(terminalConsole, /\\x1b\[200~/);
  assert.match(terminalConsole, /terminalTitleLabel/);
  assert.match(terminalConsole, /terminalProgressLabel/);
  assert.match(terminalConsole, /terminalStatusLabel/);
  assert.match(terminalConsole, /terminalScreenModeLabel/);
  assert.match(terminalConsole, /terminalRendererLabel/);
  assert.match(terminalConsole, /terminalCliState/);
  assert.match(terminalConsole, /deriveTerminalCliState/);
  assert.match(terminalConsole, /parseProgressParts/);
  assert.match(terminalConsole, /parseElapsedLabel/);
  assert.match(terminalConsole, /term\.onTitleChange/);
  assert.match(terminalConsole, /term\.onWriteParsed/);
  assert.match(terminalConsole, /term\.parser\.registerOscHandler\(9,/);
  assert.match(terminalConsole, /term\.buffer\.onBufferChange/);
  assert.match(terminalConsole, /WebglAddon/);
  assert.match(terminalConsole, /terminalRenderer\.value = 'webgl'/);
  assert.match(terminalConsole, /terminalRenderer\.value = 'dom'/);
  assert.match(terminalConsole, /customGlyphs: true/);
  assert.match(terminalConsole, /rescaleOverlappingGlyphs: true/);
  assert.match(terminalConsole, /scrollOnEraseInDisplay: true/);
  assert.match(terminalConsole, /smoothScrollDuration: 0/);
  assert.match(terminalConsole, /updateTerminalScreenMode/);
  assert.match(terminalConsole, /buffer\.active\.type/);
  assert.match(terminalConsole, /inferCliLabel/);
  assert.match(terminalConsole, /handleTerminalProgressOsc/);
  assert.match(terminalConsole, /scheduleTerminalStatusHint/);
  assert.match(terminalConsole, /updateTerminalStatusHint/);
  assert.match(terminalConsole, /translateToString\(true\)/);
  assert.match(terminalConsole, /TERMINAL_STATUS_KEYWORDS/);
  assert.match(terminalConsole, /skipReplay: useHttpStream \? true : skipReplay \|\| undefined/);
  assert.match(terminalConsole, /resume: props\.embedded \|\| undefined/);
  assert.match(terminalConsole, /params\.set\('skipReplay', '1'\)/);
  assert.match(terminalConsole, /params\.set\('resume', '1'\)/);
  assert.match(terminalConsole, /options: \{ emitAttached\?: boolean \} = \{\}/);
  assert.match(terminalConsole, /if \(options\.emitAttached\) \{\s*emitSessionAttached\(terminalSessionId\.value\);/);
  assert.match(terminalConsole, /setSessionId\(response\.sid, \{ emitAttached: true \}\)/);
  assert.match(terminalConsole, /handleTerminalKeydown/);
  assert.match(terminalConsole, /window\.addEventListener\('keydown', handleTerminalKeydown, true\)/);
  assert.match(terminalConsole, /addEventListener\('focusin', handleTerminalFocusIn\)/);
  assert.match(terminalConsole, /addEventListener\('focusout', handleTerminalFocusOut\)/);
  assert.match(terminalConsole, /async function pasteClipboard\(\): Promise<boolean>/);
  assert.match(terminalConsole, /navigator\.clipboard\?\.readText/);
  assert.match(terminalConsole, /event\.ctrlKey && event\.shiftKey[\s\S]*event\.key\.toUpperCase\(\) === 'V'/);
  assert.doesNotMatch(terminalConsole, /\.onFocus\(/);
  assert.doesNotMatch(terminalConsole, /\.onBlur\(/);
  assert.match(terminalConsole, /sendTerminalShortcut/);
  assert.match(terminalConsole, /onGap: \(\) => \{/);
  assert.match(terminalConsole, /void attachGatewayTerminal\(\)\.catch\(\(\) => \{/);
  assert.match(terminalConsole, /defineExpose\(\{\s*clearTerminal,\s*focusTerminal,\s*pasteClipboard,\s*sendTerminalShortcut,/);
  assert.match(
    terminalConsole,
    /function restoreRuntime\(\): void \{[\s\S]*terminalDirectSocketActive = false;[\s\S]*terminalHttpStreamFailed = false;[\s\S]*disconnectTerminalHttpStream\(\);[\s\S]*\}/,
  );
  assert.match(terminalService, /function normalizeSkipReplay/);
  assert.match(terminalService, /function normalizeResumeSession/);
  assert.match(terminalService, /hasBacklogGap/);
  assert.match(terminalService, /reason:\s*[\s\S]*\?\s*"backlog_gap"/);
  assert.match(terminalService, /function createGatewayAck/);
  assert.match(terminalService, /TERMINAL_DESCRIPTOR_ACTIVITY_FLUSH_MS/);
  assert.match(terminalService, /TERMINAL_OUTPUT_LEDGER_FLUSH_MS/);
  assert.match(terminalService, /TERMINAL_OUTPUT_LEDGER_BATCH_LIMIT/);
  assert.match(terminalService, /emittedAtMs: Date\.now\(\)/);
  assert.match(terminalService, /emittedAtMs: chunk\.emittedAtMs/);
  assert.match(terminalService, /function scheduleDescriptorPersist/);
  assert.match(terminalService, /function enqueueOutputLedgerEvent/);
  assert.match(terminalService, /function enqueueInputLedgerEvent/);
  assert.match(terminalService, /session\.term\.write\(inputData\)[\s\S]*enqueueInputLedgerEvent\(session, inputData, runtime\.connId\)/);
  assert.match(terminalService, /payload\.ackMode === "none"/);
  assert.match(terminalService, /ledger\.appendMany\(events\)/);
  assert.match(terminalService, /markSessionActivity\(session, \{ persist: "deferred" \}\)/);
  assert.match(terminalService, /function clearSessionDisplay/);
  assert.match(terminalService, /appendLedgerEvent\(\s*session,\s*"clear"/);
  assert.match(terminalService, /clearGatewaySession/);
  assert.match(terminalHistory, /function eventsSinceLastClear/);
  assert.match(terminalHistory, /events\[index\]\?\.type === "clear"/);
  assert.match(studioPluginSource, /STUDIO_TERMINAL_GATEWAY_METHODS\.clear/);
  assert.match(apiRuntimeConfig, /terminalDirectWebSocketPort: null/);
  assert.match(webRuntimeConfig, /function getStudioTerminalDirectWebSocketUrl/);
  assert.match(terminalService, /gatewayOutputQueue/);
  assert.match(terminalService, /function enqueueGatewayOutput/);
  assert.match(terminalService, /setImmediate\(\(\) =>/);
  assert.match(terminalService, /streamSubscribers/);
  assert.match(terminalService, /attachStreamClient/);
  assert.match(terminalService, /suppressOutput: payload\.outputMode === "http-stream"/);
  assert.match(terminalService, /recentSummaryEvents/);
  assert.match(terminalService, /buildTerminalRecentOutputSummary\(session\.recentSummaryEvents\)/);
  assert.match(terminalService, /const events = buildAttachEvents\(session, params\)\.filter/);
  assert.match(terminalService, /outputSeq: session\.outputSeq/);
  assert.match(terminalService, /leaseTtlMs: TERMINAL_GATEWAY_LEASE_MS/);
  assert.match(terminalService, /resumePersisted: normalizeResumeSession/);
  assert.match(terminalService, /const existingSubscriber = session\.gatewaySubscribers\.get\(runtime\.connId\)/);
  assert.match(terminalService, /existingSubscriber\.lastLeaseAt = Date\.now\(\)/);
  assert.match(terminalService, /skipReplay\?: boolean \| string \| null;/);
});

test("terminal gateway targeted output preserves order through service batching", () => {
  assert.match(
    terminalService,
    /enqueueGatewayOutput\(session, chunk\)/,
  );
  assert.doesNotMatch(
    studioPluginSource,
    /broadcastToConnIds\(STUDIO_TERMINAL_GATEWAY_EVENT, event, connIds, \{\s*dropIfSlow: true,\s*\}\)/,
  );
  assert.match(
    studioPluginSource,
    /params\?\.ackMode === 'none'[\s\S]*return;/,
  );
});

test("terminal console surfaces compact telemetry chips even when toolbar is hidden", () => {
  assert.match(terminalConsole, /<div v-else-if="hasTerminalTelemetry" class="terminal-console-meta-strip">/);
  assert.match(terminalConsole, /data-testid="terminal-console-workbench-bar"/);
  assert.match(terminalConsole, /terminal-console-cli-state/);
  assert.match(terminalConsole, /terminal-console-cli-progress/);
  assert.match(terminalConsole, /<progress[\s\S]*class="terminal-console-cli-progress"[\s\S]*:value="terminalCliProgressValue \?\? undefined"/);
  assert.doesNotMatch(terminalConsole, /terminalCliProgressStyle|terminalCliProgressClass|:style="terminalCliProgressStyle"/);
  assert.match(terminalConsole, /terminal-console-link-state/);
  assert.match(terminalConsole, /terminal-console-header-chip--mode/);
  assert.match(workspaceCss, /terminal-console-header-chip--progress-running/);
  assert.match(workspaceCss, /terminal-console-header-chip--progress-error/);
  assert.match(workspaceCss, /\.terminal-console-cli-progress::-webkit-progress-value\s*\{/);
  assert.doesNotMatch(workspaceCss, /\.terminal-console-cli-progress__fill\s*\{/);
  assert.match(terminalConsole, /terminal-console-header-chip--status/);
});

test("embedded terminal console does not synthesize random session ids before the workspace resolves one", () => {
  assert.match(
    terminalConsole,
    /if \(props\.embedded\) \{\s*return '';\s*\}/,
  );
  assert.match(terminalConsole, /const sid = getSessionId\(\);\s*if \(!sid\) return;/);
  assert.match(
    terminalConsole,
    /if \(props\.embedded\) \{\s*terminalSessionId\.value = '';\s*clearRuntime\(\);\s*connected\.value = false;\s*return;\s*\}/,
  );
});

test("terminal workspace waits for hydrate before mounting the stage console and keeps route-locked sessions active", () => {
  assert.match(
    workspacePage,
    /<TerminalSessionPane\s+v-if="workspaceHydrated"/,
  );
  assert.match(workspacePage, /terminal-workspace-stage-loading/);
  assert.match(workspacePage, /fetchPersistedTerminalSessionDescriptor/);
  assert.match(workspacePage, /async function syncRouteLockedSession/);
  assert.match(workspacePage, /workspace\.setActiveSession\(normalizedSessionId\)/);
  assert.match(workspacePage, /watch\(\s*\(\) => \[workspaceHydrated\.value, route\.params\.sessionId\] as const,/);
  assert.match(workspacePage, /if \(normalizedSessionId\) \{\s*await syncRouteLockedSession\(normalizedSessionId\);/);
  assert.match(workspacePage, /const lockedRouteSessionId = String\(route\.params\.sessionId \|\| ''\)\.trim\(\);/);
  assert.match(workspacePage, /if \(lockedRouteSessionId && lockedRouteSessionId !== sessionId\) \{\s*return;\s*\}/);
  assert.match(workspacePage, /preserveRouteLockedActiveSession/);
  assert.match(workspacePage, /lockedRouteSessionId !== sessionId/);
  assert.match(workspacePage, /if \(!preserveRouteLockedActiveSession\) \{\s*workspace\.setActiveSession\(session\.sessionId\);/);
});

test("terminal workspace UI surfaces are locale-aware", () => {
  assert.match(workspacePage, /useLocalePreference/);
  assert.match(inspectorContent, /useLocalePreference/);
  assert.match(terminalTabRail, /useLocalePreference/);
  assert.match(terminalSessionExplorer, /useLocalePreference/);
  assert.match(terminalActionPanel, /useLocalePreference/);
  assert.match(terminalSessionPane, /useLocalePreference/);
  assert.match(workspacePage, /text\('终端', 'Shell'\)/);
  assert.match(inspectorContent, /text\('刷新状态', 'Refresh Status'\)/);
  assert.match(terminalTabRail, /text\('更多', 'More'\)/);
  assert.match(terminalSessionExplorer, /text\('运行中 \/ 已打开', 'Live \/ Open'\)/);
});

test("terminal workspace state exposes explicit session lifecycle actions", () => {
  const statePath = path.join(
    rootDir,
    "apps/web-vue/src/features/terminal/terminal-workspace-state.ts",
  );
  const stateSource = fs.readFileSync(statePath, "utf8");

  assert.match(
    stateSource,
    /openSessions: ComputedRef<TerminalSessionDescriptor\[\]>/,
  );
  assert.match(
    stateSource,
    /recentSessions: ComputedRef<TerminalSessionDescriptor\[\]>/,
  );
  assert.match(
    stateSource,
    /endedSessions: ComputedRef<TerminalSessionDescriptor\[\]>/,
  );
  assert.match(stateSource, /openTab\(sessionId: string\): void/);
  assert.match(
    stateSource,
    /renameSession\(sessionId: string, title: string\): void/,
  );
  assert.match(stateSource, /endSession\(sessionId: string\): void/);
  assert.match(stateSource, /deleteSession\(sessionId: string\): void/);
});

test("terminal registry exposes rename and delete helpers", () => {
  const registryPath = path.join(
    rootDir,
    "apps/web-vue/src/features/terminal/terminal-session-registry.ts",
  );
  const registrySource = fs.readFileSync(registryPath, "utf8");

  assert.match(
    registrySource,
    /renameSession\(sessionId: string, title: string\): void/,
  );
  assert.match(registrySource, /removeSession\(sessionId\)/);
});

test("terminal workspace no longer renders action and recent rails as fixed side columns", () => {
  assert.doesNotMatch(
    workspacePage,
    /terminal-workspace-main[\s\S]*TerminalActionPanel[\s\S]*TerminalRecentSessionRail/,
  );
});

test("terminal workspace exposes collapsible desktop inspector drawer", () => {
  assert.match(workspacePage, /TERMINAL_DESKTOP_INSPECTOR_STORAGE_KEY/);
  assert.match(workspacePage, /restoreDesktopInspectorPreference/);
  assert.match(workspacePage, /setDesktopInspectorOpen/);
  assert.match(workspacePage, /terminal-inspector-drawer-head/);
  assert.match(workspacePage, /terminal-inspector-drawer-collapse/);
  assert.match(workspacePage, /@click="setDesktopInspectorOpen\(false\)"/);
  assert.match(workspacePage, /@click="setDesktopInspectorOpen\(true\)"/);
  assert.match(
    workspacePage,
    /<TerminalInspectorDrawer v-if="!compactInspectorMode && desktopInspectorOpen"[\s\S]*:open="true"/,
  );
});

test("terminal tab strip exposes inline rename edit controls and session actions", () => {
  const tabRailPath = path.join(
    rootDir,
    "apps/web-vue/src/features/terminal/TerminalTabRail.vue",
  );
  const tabRail = fs.readFileSync(tabRailPath, "utf8");

  assert.match(tabRail, /editingSessionId/);
  assert.match(tabRail, /renameDraft/);
  assert.match(tabRail, /terminal-tab-rename-input/);
  assert.match(tabRail, /terminal-tab-rename-save/);
  assert.match(tabRail, /terminal-tab-rename-cancel/);
  assert.match(tabRail, /role="tablist"/);
  assert.match(tabRail, /role="tab"/);
  assert.match(tabRail, /terminal-tab-dot/);
  assert.match(tabRail, /@dblclick="startRename\(tab\)"/);
  assert.match(tabRail, /@keydown\.f2\.prevent="startRename\(tab\)"/);
  assert.match(tabRail, /@keydown\.delete\.prevent="\$emit\('close', tab\.sessionId\)"/);
  assert.match(tabRail, /function shortSessionId\(sessionId: string\): string/);
  assert.match(tabRail, /function tabTooltip\(tab: TerminalSessionDescriptor\): string/);
  assert.doesNotMatch(tabRail, /globalThis\.prompt/);
  assert.match(tabRail, /close/);
  assert.match(tabRail, /end/);
  assert.match(tabRail, /delete/);
  assert.match(tabRail, /terminal-tab-menu/);
  assert.match(tabRail, /terminal-tab-overflow/);
  assert.match(tabRail, /terminal-tab-scroll/);
  assert.match(tabRail, /terminal-tab-rail-actions/);
  assert.match(tabRail, /class="terminal-tab-add"/);
  assert.match(tabRail, /terminal-tab-add__icon/);
  assert.match(tabRail, /terminal-tab-add__copy/);
  assert.match(tabRail, /新建终端标签/);
  assert.match(tabRail, /New terminal tab/);
});

test("terminal session pane hosts integrated tab controls and lifecycle affordances", () => {
  const panePath = path.join(
    rootDir,
    "apps/web-vue/src/features/terminal/TerminalSessionPane.vue",
  );
  const pane = fs.readFileSync(panePath, "utf8");

  assert.match(pane, /<TerminalTabRail/);
  assert.match(pane, /@rename=/);
  assert.match(pane, /@close=/);
  assert.match(pane, /@end=/);
  assert.match(pane, /@delete=/);
  assert.match(pane, /endSession/);
  assert.match(pane, /deleteSession/);
  assert.match(pane, /terminal-stage-header-actions/);
  assert.match(pane, /terminal-stage-action--focus/);
  assert.match(pane, /terminal-stage-action--control/);
  assert.match(pane, /terminal-stage-action--clear/);
  assert.match(pane, /terminal-stage-action--danger/);
  assert.match(workspaceCss, /\.terminal-stage-header\s*\{[\s\S]*z-index:\s*12;[\s\S]*overflow:\s*visible;/);
  assert.match(workspaceCss, /\.terminal-stage-header-actions\s*\{[\s\S]*flex-wrap:\s*wrap;[\s\S]*overflow:\s*visible;/);
  assert.match(workspaceCss, /\.terminal-tab-rail\s*\{[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\) auto;/);
  assert.match(workspaceCss, /\.terminal-tab-scroll\s*\{[\s\S]*overflow-x:\s*auto;[\s\S]*padding-bottom:\s*8px;/);
  assert.match(workspaceCss, /\.terminal-tab-rail-actions\s*\{[\s\S]*min-width:\s*max-content;/);
  assert.match(workspaceCss, /\.terminal-shortcut-menu__panel\s*\{[\s\S]*z-index:\s*60;[\s\S]*backdrop-filter:\s*none;/);
  assert.match(pane, /Ctrl\+C/);
  assert.match(pane, /Ctrl\+L/);
  assert.match(pane, /Ctrl\+D/);
  assert.match(pane, /Ctrl\+Z/);
  assert.match(pane, /Ctrl\+U/);
  assert.match(pane, /Ctrl\+K/);
  assert.match(pane, /terminal-shortcut-menu/);
  assert.match(pane, /function pasteClipboard\(\): void/);
  assert.match(pane, /Focus/);
  assert.match(pane, /Force End/);
  assert.match(pane, /ref="consolePage"/);
  assert.match(pane, /:restore-transcript="shouldRestoreTranscript"/);
  assert.match(pane, /const shouldRestoreTranscript = computed\(\(\) =>/);
  assert.match(pane, /session\.status !== 'running' \|\| Boolean\(session\.recentOutputSummary\?\.tailText\)/);
  assert.match(pane, /sendTerminalShortcut: \(key: string\) => boolean;/);
  assert.match(pane, /pasteClipboard: \(\) => Promise<boolean>;/);
  assert.match(pane, /function sendShortcut\(key: string\): void/);
  assert.match(pane, /function clearTerminal\(\): void/);
  assert.match(pane, /function endActiveSession\(\): void/);
  assert.doesNotMatch(pane, /terminal-session-actions/);
  assert.match(
    pane,
    /<TerminalConsolePage[\s\S]*:session-id="resolvedActiveSession\?\.sessionId \|\| ''"[\s\S]*:queued-command="props\.queuedCommand"[\s\S]*:show-toolbar="false"/,
  );
  assert.doesNotMatch(pane, /<TerminalConsolePage\s*\/>/);
  assert.doesNotMatch(pane, /<TerminalConsolePage :key=/);
});

test("terminal api exposes rename and delete session calls", () => {
  const apiPath = path.join(
    rootDir,
    "apps/web-vue/src/features/terminal/api.ts",
  );
  const apiSource = fs.readFileSync(apiPath, "utf8");

  assert.match(apiSource, /renameTerminalSession/);
  assert.match(apiSource, /deleteTerminalSession/);
});

test("terminal route sync keeps route-driven restore and avoids active-session push feedback", () => {
  assert.match(
    terminalRouteSync,
    /watch\(\s*\(\) => options\.route\.params\.sessionId/,
  );
  assert.doesNotMatch(terminalRouteSync, /source: "linked_context"/);
  assert.doesNotMatch(terminalRouteSync, /title: normalized/);
  assert.match(terminalRouteSync, /Do not synthesize a route-only session/);
  assert.doesNotMatch(terminalRouteSync, /watch\(options\.activeSessionId/);
  assert.doesNotMatch(terminalRouteSync, /router\.replace\(`/);
});

test("terminal workspace wires pane actions to session lifecycle handlers", () => {
  assert.doesNotMatch(workspacePage, /<TerminalTabRail/);
  assert.doesNotMatch(workspacePage, /@rename=/);
  assert.doesNotMatch(workspacePage, /@close=/);
  assert.doesNotMatch(workspacePage, /@end=/);
  assert.doesNotMatch(workspacePage, /@delete=/);
  assert.match(workspacePage, /@rename-session=/);
  assert.match(workspacePage, /@end-session=/);
  assert.match(workspacePage, /@delete-session=/);
  assert.match(workspacePage, /renameTerminalSession/);
  assert.match(workspacePage, /deleteTerminalSession/);
  assert.match(workspacePage, /endTerminalSession/);
  assert.match(workspacePage, /@select-session="handleSessionSelect"/);
  assert.match(workspacePage, /@close-session="handleSessionClose"/);
  assert.match(workspacePage, /async function handleSessionSelect\(sessionId: string\): Promise<void>/);
  assert.match(workspacePage, /function handleSessionClose\(sessionId: string\): void/);
  assert.match(workspacePage, /async function navigateToSession\(sessionId: string \| null \| undefined\): Promise<void>/);
  assert.match(workspacePage, /await router\.push\(\{ path: targetPath \}\)/);
  assert.match(workspacePage, /function clearStoredTerminalSessionId/);
  assert.match(workspacePage, /sessionStorage\.removeItem\(TERMINAL_SESSION_STORAGE_KEY\)/);
  assert.doesNotMatch(workspacePage, /pendingLocalSessionIds/);
});

test("terminal console session attachment sync is surfaced from console to workspace state", () => {
  const panePath = path.join(
    rootDir,
    "apps/web-vue/src/features/terminal/TerminalSessionPane.vue",
  );
  const pane = fs.readFileSync(panePath, "utf8");

  assert.match(
    terminalConsole,
    /defineEmits<\{[\s\S]*sessionAttached[\s\S]*\}>\(\)/,
  );
  assert.match(terminalConsole, /emit\('sessionAttached',/);

  assert.match(pane, /@session-attached="emit\('sessionAttached', \$event\)"/);
  assert.match(
    pane,
    /\(e: 'sessionAttached', session: TerminalSessionDescriptor\): void;/,
  );

  assert.match(workspacePage, /@session-attached="handleSessionAttached"/);
  assert.match(
    workspacePage,
    /function handleSessionAttached\(session: TerminalSessionDescriptor\): void/,
  );
  assert.match(workspacePage, /workspace\.registerSession\(\{/);
  assert.match(workspacePage, /title: preservedTitle \|\| session\.title/);
  assert.match(workspacePage, /workspace\.setActiveSession\(session\.sessionId\)/);
});

test("terminal workspace maps inspector action triggers to real terminal commands", () => {
  assert.match(workspacePage, /function findActionItem\(actionKey: string\): TerminalActionItem \| null/);
  assert.match(
    workspacePage,
    /async function handleActionTrigger\(actionKey: string\): Promise<void>/,
  );
  assert.match(workspacePage, /openCommandSession\(\{/);
  assert.match(workspacePage, /item\.recommendedTitle \|\| item\.labelZh/);
  assert.match(workspacePage, /workspace\.setQueuedCommand\(sessionId, ensureCommandLineBreak\(options\.command\)\)/);
});

test("terminal workspace restores richer cli and skills inspector with command-injection install UX", () => {
  assert.match(inspectorContent, /terminal-inspector-summary-grid/);
  assert.match(inspectorContent, /terminal-summary-stat/);
  assert.match(inspectorContent, /terminal-inspector-switcher/);
  assert.match(inspectorContent, /terminal-inspector-tooling/);
  assert.match(inspectorContent, /terminal-binary-list/);
  assert.match(inspectorContent, /terminal-missing-deps/);
  assert.match(inspectorContent, /\$emit\('launchCli', 'claude'\)/);
  assert.match(inspectorContent, /\$emit\('launchCli', 'bash'\)/);
  assert.match(workspacePage, /launchableCliIds/);
  assert.match(workspacePage, /getInstallCommand\(/);
  assert.match(workspacePage, /queueInstallCommand\(/);
  assert.match(workspacePage, /openCommandSession\(\{/);
  assert.match(workspacePage, /fetchTerminalStatus\(/);
  assert.match(workspacePage, /terminalStatus\.value\?\.binaries/);
  assert.match(workspacePage, /terminalStatus\.value\?\.installTargets/);
  assert.doesNotMatch(workspacePage, /terminal-inspector-tooling-detection/);
  assert.match(inspectorContent, /terminal-install-feedback/);
  assert.match(workspacePage, /已在新标签注入/);
  assert.match(workspacePage, /refreshStatusLater\(/);
  assert.doesNotMatch(workspacePage, /streamTerminalInstall\(/);
  assert.doesNotMatch(workspacePage, /installTerminalCli\(/);
});

test("terminal install feedback opens logs in a floating sheet", () => {
  assert.match(inspectorContent, /<Teleport v-if="installOutputOpen && installFeedback\.logs\.length" to="body">/);
  assert.match(inspectorContent, /class="terminal-install-output-dock"/);
  assert.match(inspectorContent, /class="terminal-install-output-sheet"/);
  assert.match(inspectorContent, /copyTextToClipboard\(installOutputText\.value\)/);
  assert.match(inspectorContent, /function openInstallOutputSheet\(\): void/);
  assert.match(inspectorContent, /完整命令和输出已放入浮动窗口/);
  assert.doesNotMatch(inspectorContent, /<pre v-if="installFeedback\.logs\.length"/);
  assert.match(workspaceCss, /\.terminal-install-output-dock\s*\{/);
  assert.match(workspaceCss, /\.terminal-install-output-log\s*\{/);
  assert.match(workspaceCss, /\.terminal-install-feedback__summary\s*\{/);
  assert.doesNotMatch(workspaceCss, /\.terminal-install-feedback pre/);
});

test("terminal workspace passes tab and active session state into integrated session pane", () => {
  const panePath = path.join(
    rootDir,
    "apps/web-vue/src/features/terminal/TerminalSessionPane.vue",
  );
  const pane = fs.readFileSync(panePath, "utf8");

  assert.match(workspacePage, /:tabs="workspace\.tabs\.value"/);
  assert.match(workspacePage, /@rename-session=\"renameSession\"/);
  assert.doesNotMatch(workspacePage, /globalThis\.prompt/);
  assert.match(
    workspacePage,
    /:active-session-id="workspace\.activeSessionId\.value"/,
  );
  assert.match(
    workspacePage,
    /:active-session="workspace\.sessions\.value\[workspace\.activeSessionId\.value \|\| ''\] \|\| null"/,
  );
  assert.match(pane, /tabs: TerminalSessionDescriptor\[\]/);
  assert.match(pane, /activeSessionId: string \| null/);
  assert.match(pane, /activeSession: TerminalSessionDescriptor \| null/);
  assert.match(pane, /const resolvedActiveSession = computed\(\(\) =>/);
  assert.match(pane, /props\.activeSession \?\? activeSession\.value/);
  assert.match(pane, /\(\) => \[props\.activeSessionId, props\.activeSession\?\.sessionId \|\| ''\] as const/);
  assert.match(pane, /if \(providedSessionId === normalized\) \{\s*activeSession\.value = null;\s*return;\s*\}/);
  assert.match(
    pane,
    /<TerminalConsolePage[\s\S]*:session-id="resolvedActiveSession\?\.sessionId \|\| ''"[\s\S]*:queued-command="props\.queuedCommand"[\s\S]*:show-toolbar="false"/,
  );
});
