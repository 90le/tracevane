import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const rootDir = "/home/binbin/.openclaw/extensions/openclaw-studio";

function read(filePath) {
  return fs.readFileSync(path.join(rootDir, filePath), "utf8");
}

const styleCss = read("apps/web-vue/src/style.css");
const dashboardView = read("apps/web-vue/src/views/DashboardView.vue");
const configEditorPage = read(
  "apps/web-vue/src/features/config/ConfigEditorPage.vue",
);
const agentsControlPage = read(
  "apps/web-vue/src/features/agents/AgentsControlPage.vue",
);
const agentsWorkspaceLayout = read(
  "apps/web-vue/src/features/agents/AgentsWorkspaceLayout.vue",
);
const channelsControlPage = read(
  "apps/web-vue/src/features/channels/ChannelsControlPage.vue",
);
const channelProviderOverview = read(
  "apps/web-vue/src/features/channels/ChannelProviderOverview.vue",
);
const skillsControlPage = read(
  "apps/web-vue/src/features/skills/SkillsControlPage.vue",
);
const cronControlPage = read(
  "apps/web-vue/src/features/cron/CronControlPage.vue",
);
const systemControlPage = read(
  "apps/web-vue/src/features/system/SystemControlPage.vue",
);
const terminalConsolePage = read(
  "apps/web-vue/src/features/terminal/TerminalConsolePage.vue",
);
const avatarFieldEditor = read(
  "apps/web-vue/src/shared/components/AvatarFieldEditor.vue",
);

test("shared studio surface primitives keep page-level frames in the small-corner range", () => {
  assert.match(
    styleCss,
    /\.panel-card,\s*\.metric-card\s*\{[\s\S]*border-radius:\s*12px;/,
  );
  assert.match(styleCss, /\.surface-drawer\s*\{[\s\S]*border-radius:\s*12px;/);
  assert.match(styleCss, /\.surface-tab\s*\{[\s\S]*border-radius:\s*10px;/);
  assert.match(
    styleCss,
    /\.surface-drawer-close\s*\{[\s\S]*border-radius:\s*10px;/,
  );
  assert.match(styleCss, /\.status-pill\s*\{[\s\S]*border-radius:\s*8px;/);
  assert.match(styleCss, /\.config-tab\s*\{[\s\S]*border-radius:\s*12px;/);
  assert.match(styleCss, /\.choice-pill\s*\{[\s\S]*border-radius:\s*10px;/);
  assert.match(
    styleCss,
    /\.channels-create-panel\s*\{[\s\S]*border-radius:\s*10px;/,
  );
  assert.match(
    styleCss,
    /\.channel-rail-item\s*\{[\s\S]*border-radius:\s*10px;/,
  );
  assert.match(
    styleCss,
    /\.channel-tile,\s*\.account-tile\s*\{[\s\S]*border-radius:\s*10px;/,
  );
  assert.match(
    styleCss,
    /\.channels-top-tab,\s*\.channels-subtab\s*\{[\s\S]*border-radius:\s*10px;/,
  );
  assert.match(
    styleCss,
    /\.channel-rail-meta span\s*\{[\s\S]*border-radius:\s*8px;/,
  );
  assert.match(
    styleCss,
    /\.channel-tile-stats span,\s*\.account-tile-stats span,\s*\.binding-item-meta span\s*\{[\s\S]*border-radius:\s*8px;/,
  );
  assert.match(styleCss, /\.agent-status\s*\{[\s\S]*border-radius:\s*8px;/);
  assert.match(
    styleCss,
    /\.agent-roster-meta span\s*\{[\s\S]*border-radius:\s*8px;/,
  );
  assert.match(
    styleCss,
    /\.config-spotlight-badge\s*\{[\s\S]*border-radius:\s*8px;/,
  );
  assert.match(styleCss, /\.micro-badge\s*\{[\s\S]*border-radius:\s*8px;/);
  assert.match(styleCss, /\.tag-chip\s*\{[\s\S]*border-radius:\s*10px;/);
  assert.match(styleCss, /\.capability-chip\s*\{[\s\S]*border-radius:\s*10px;/);
});

test("dashboard and config recipes avoid oversized rounded slabs", () => {
  assert.match(
    dashboardView,
    /\.dashboard-hero-stage,[\s\S]*border-radius:\s*12px;/,
  );
  assert.match(
    dashboardView,
    /\.dashboard-meter\s*\{[\s\S]*border-radius:\s*10px;/,
  );
  assert.match(
    dashboardView,
    /\.dashboard-command-link\s*\{[\s\S]*border-radius:\s*10px;/,
  );
  assert.match(
    dashboardView,
    /\.dashboard-runtime-band,[\s\S]*border-radius:\s*12px;/,
  );
  assert.match(
    dashboardView,
    /\.dashboard-domain-row__state,\s*\.dashboard-track-item span\s*\{[\s\S]*border-radius:\s*8px;/,
  );
  assert.match(
    configEditorPage,
    /\.config-overview-card\s*\{[\s\S]*border-radius:\s*10px;/,
  );
  assert.match(
    configEditorPage,
    /\.config-sidebar-callout\s*\{[\s\S]*border-radius:\s*10px;/,
  );
  assert.match(
    configEditorPage,
    /\.config-active-tab-fact\s*\{[\s\S]*border-radius:\s*10px;/,
  );
  assert.match(
    configEditorPage,
    /\.config-page-shell :deep\(\.config-subsection\)\s*\{[\s\S]*border-radius:\s*10px;/,
  );
});

test("control surfaces across agents, skills, cron, system, and terminal stay restrained", () => {
  assert.match(agentsControlPage, /agents-overview-card/);
  assert.match(agentsControlPage, /agents-overview-identity/);
  assert.match(agentsWorkspaceLayout, /agents-modal-mask/);
  assert.match(
    styleCss,
    /\.agent-rail-item\s*\{[\s\S]*border-radius:\s*14px;/,
  );
  assert.match(styleCss, /\.agents-overview-card--primary\s*\{/);
  assert.match(
    styleCss,
    /\.agents-stage-tab\s*\{[\s\S]*border-radius:\s*12px;/,
  );
  assert.match(
    styleCss,
    /\.agents-summary-pill\s*\{[\s\S]*border-radius:\s*999px;/,
  );
  assert.doesNotMatch(styleCss, /animation:\s*bgShift/);
  assert.match(
    styleCss,
    /\.agents-modal,\s*\.agents-quick-config-dialog\s*\{[\s\S]*border-radius:\s*18px;/,
  );
  assert.match(styleCss, /\.agents-modal-close[\s\S]*border-radius:\s*10px;/);
  assert.match(
    channelsControlPage,
    /channels-overview-surface|channels-overview-empty/,
  );
  assert.match(
    channelProviderOverview,
    /\.channel-provider-overview__quick-edit\s*\{[\s\S]*border-radius:\s*12px;/,
  );
  assert.match(
    channelProviderOverview,
    /\.channel-provider-overview__quick-actions\s*\{[\s\S]*gap:\s*8px;/,
  );
  assert.match(
    skillsControlPage,
    /\.skills-mode-button\s*\{[\s\S]*border-radius:\s*12px;/,
  );
  assert.match(
    skillsControlPage,
    /\.skills-inline-stats span,\s*\.skills-mini-chip\s*\{[\s\S]*border-radius:\s*8px;/,
  );
  assert.match(
    skillsControlPage,
    /\.skills-board\s*\{[\s\S]*border-radius:\s*12px;/,
  );
  assert.match(
    skillsControlPage,
    /\.skills-drawer\s*\{[\s\S]*border-radius:\s*12px;/,
  );
  assert.match(
    skillsControlPage,
    /\.skills-detail-tab\s*\{[\s\S]*border-radius:\s*10px;/,
  );
  assert.match(
    skillsControlPage,
    /\.skills-preflight-item > span\s*\{[\s\S]*border-radius:\s*8px;/,
  );
  assert.match(
    skillsControlPage,
    /\.skills-confirm-dialog\s*\{[\s\S]*border-radius:\s*12px;/,
  );
  assert.match(
    cronControlPage,
    /\.cron-sidebar-panel,\s*\.cron-stage-header,\s*\.cron-stage-panel\s*\{[\s\S]*border-radius:\s*12px;/,
  );
  assert.match(
    cronControlPage,
    /\.cron-list-item\s*\{[\s\S]*border-radius:\s*12px;/,
  );
  assert.match(
    cronControlPage,
    /\.cron-chip,\s*[\s\S]*\.cron-run-meta span\s*\{[\s\S]*border-radius:\s*8px;/,
  );
  assert.match(
    cronControlPage,
    /\.cron-stage-tab\s*\{[\s\S]*border-radius:\s*10px;/,
  );
  assert.match(
    cronControlPage,
    /\.cron-modal-close\s*\{[\s\S]*border-radius:\s*10px;/,
  );
  assert.match(
    cronControlPage,
    /\.cron-modal\s*\{[\s\S]*border-radius:\s*12px;/,
  );
  assert.match(
    systemControlPage,
    /\.system-sidebar-panel,\s*\.system-stage-header,\s*\.system-stage-panel\s*\{[\s\S]*border-radius:\s*12px;/,
  );
  assert.match(
    terminalConsolePage,
    /\.terminal-card\s*\{[\s\S]*border-radius:\s*10px;/,
  );
  assert.match(
    terminalConsolePage,
    /\.terminal-card-chip\s*\{[\s\S]*border-radius:\s*8px;/,
  );
  assert.match(
    terminalConsolePage,
    /\.terminal-chip\s*\{[\s\S]*border-radius:\s*8px;/,
  );
  assert.match(
    terminalConsolePage,
    /\.terminal-toolbar-chip\s*\{[\s\S]*border-radius:\s*8px;/,
  );
  assert.match(
    terminalConsolePage,
    /\.terminal-main\s*\{[\s\S]*border-radius:\s*10px;/,
  );
  assert.match(
    avatarFieldEditor,
    /\.avatar-field-editor__preview\s*\{[\s\S]*border-radius:\s*10px;/,
  );
  assert.match(
    avatarFieldEditor,
    /\.avatar-cropper-dialog\s*\{[\s\S]*border-radius:\s*12px;/,
  );
  assert.match(
    avatarFieldEditor,
    /\.avatar-cropper-dialog__close\s*\{[\s\S]*border-radius:\s*10px;/,
  );
  assert.match(
    avatarFieldEditor,
    /\.avatar-cropper-stage-wrap\s*\{[\s\S]*border-radius:\s*12px;/,
  );
  assert.match(
    avatarFieldEditor,
    /\.avatar-cropper-stage\s*\{[\s\S]*border-radius:\s*12px;/,
  );
  assert.match(
    avatarFieldEditor,
    /\.avatar-cropper-box\s*\{[\s\S]*border-radius:\s*12px;/,
  );
  assert.match(
    avatarFieldEditor,
    /\.avatar-cropper-preview,\s*\.avatar-cropper-facts\s*\{[\s\S]*border-radius:\s*12px;/,
  );
  assert.match(
    avatarFieldEditor,
    /\.avatar-cropper-preview__surface\s*\{[\s\S]*border-radius:\s*12px;/,
  );
});
