import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "tsx/esm";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(testDir, "..", "..");
const recipePath = path.join(
  rootDir,
  "apps/web-vue/src/features/dashboard/overview-recipe.ts",
);
const recipeModule =
  await import("../../apps/web-vue/src/features/dashboard/overview-recipe.ts");

const zhText = (zh, _en) => zh;
const enText = (_zh, en) => en;

function createPayload() {
  return {
    checkedAt: "2026-04-18T00:00:00.000Z",
    server: {
      name: "OpenClaw Studio",
      version: "0.1.21",
      port: 3760,
      pid: 123,
      nodeVersion: "v22.0.0",
      uptime: 120,
    },
    gateway: {
      port: 31879,
      url: "ws://127.0.0.1:31879",
      connected: true,
    },
    counts: {
      agents: 4,
      channels: 3,
      bindings: 8,
      cronJobs: 2,
      skills: 7,
      enabledSkills: 5,
    },
    transport: {
      mode: "gateway",
      standalonePort: 3760,
      gatewayPort: 31879,
      basePath: "/studio",
      entryUrl: "/studio",
      healthUrl: "/studio/api/system/health",
    },
    release: {
      currentVersion: "0.1.21",
      latestVersion: "0.1.21",
      updateAvailable: false,
      upgradeRunning: false,
      upgradeStatus: "idle",
      targetVersion: null,
      source: null,
    },
    bootstrap: {
      ready: false,
      errors: 1,
      warnings: 1,
      fixable: 2,
    },
    deviceTrust: {
      helperConfigured: true,
      helperPaired: false,
      pendingRequests: 2,
      autoApproveLocalHelper: false,
    },
    runtime: {
      installedCliCount: 2,
      expectedCliCount: 3,
    },
    events: {
      recentFailures: 2,
      pendingAuditItems: 1,
      recentRecoveries: 1,
      latestFailureTitle: "Gateway token missing",
      latestAuditTitle: "Review helper pairing policy",
      latestRecoveryTitle: "Recovered detached terminal workspace",
    },
    terminalWorkspace: {
      totalSessions: 2,
      recoverableSessions: 2,
      detachedSessions: 1,
      runningSessions: 1,
      latestSessionId: "sess-2",
      latestSessionTitle: "Detached after restart",
      latestSessionUpdatedAt: "2026-04-18T00:01:00.000Z",
      latestCommandHint: "npm run dev:web",
      latestError: "address already in use",
    },
    recovery: {
      total: 3,
      items: [
        {
          id: "bootstrap:gateway-auth-token",
          title: "修复 bootstrap: gateway-auth-token",
          note: "存在阻断错误，建议立即修复。",
          severity: "high",
          to: "/system",
        },
        {
          id: "event:failure:0",
          title: "Gateway token missing",
          note: "最近失败事件，需要排查与恢复。",
          severity: "high",
          to: "/system/events",
        },
      ],
    },
    trends: {
      points: [
        {
          key: "bootstrapFixable",
          label: "Bootstrap fixable",
          value: 2,
          note: "当前 bootstrap 可修复项",
        },
        {
          key: "pendingPairing",
          label: "Pending pairing",
          value: 2,
          note: "待审批设备配对请求",
        },
        {
          key: "recoverableSessions",
          label: "Recoverable sessions",
          value: 2,
          note: "可恢复终端会话数量",
        },
        {
          key: "eventFailures",
          label: "Event failures",
          value: 2,
          note: "最近失败事件数量",
        },
      ],
      panels: [
        {
          key: "risk",
          title: "Risk watch",
          stage: "risk",
          points: [
            {
              key: "eventFailures",
              label: "Event failures",
              value: 2,
              note: "最近失败事件数量",
            },
            {
              key: "bootstrapFixable",
              label: "Bootstrap fixable",
              value: 2,
              note: "当前 bootstrap 可修复项",
            },
          ],
        },
        {
          key: "recovery",
          title: "Recovery pulse",
          stage: "recovery",
          points: [
            {
              key: "recoverableSessions",
              label: "Recoverable sessions",
              value: 2,
              note: "可恢复终端会话数量",
            },
            {
              key: "pendingPairing",
              label: "Pending pairing",
              value: 2,
              note: "待审批设备配对请求",
            },
          ],
        },
        {
          key: "trend",
          title: "System trend",
          stage: "trend",
          points: [
            {
              key: "bootstrapFixable",
              label: "Bootstrap fixable",
              value: 2,
              note: "当前 bootstrap 可修复项",
            },
            {
              key: "pendingPairing",
              label: "Pending pairing",
              value: 2,
              note: "待审批设备配对请求",
            },
            {
              key: "recoverableSessions",
              label: "Recoverable sessions",
              value: 2,
              note: "可恢复终端会话数量",
            },
            {
              key: "eventFailures",
              label: "Event failures",
              value: 2,
              note: "最近失败事件数量",
            },
          ],
        },
      ],
    },
    contextSummary: {
      riskStage: "high",
      primaryHint: "3 项恢复与处理项待跟进",
      secondaryHint: "最近恢复：Recovered detached terminal workspace",
    },
    domains: [],
  };
}

test("dashboard overview recipe derives quick actions from the shell foundation", () => {
  assert.equal(fs.existsSync(recipePath), true);
  const recipe = fs.readFileSync(recipePath, "utf8");
  assert.match(recipe, /from ['"]\.\.\/shell\/route-manifest['"]/);

  const actions = recipeModule.buildDashboardQuickActions(enText);
  assert.deepEqual(
    actions.map((item) => item.to),
    ["/chat", "/agents", "/config", "/cron", "/dreaming", "/system"],
  );
  assert.equal(actions[0]?.label, "Open chat entry");
  assert.equal(actions[1]?.eyebrow, "Agents");

  const zhActions = recipeModule.buildDashboardQuickActions(zhText);
  assert.equal(zhActions[0]?.label, "进入私聊入口");
  assert.equal(zhActions[5]?.label, "打开系统诊断");
});

test("buildDashboardOverviewSignals returns fallback and payload-backed values", () => {
  const fallback = recipeModule.buildDashboardOverviewSignals({
    payload: null,
    text: enText,
    formatUptime: () => "unused",
  });
  assert.deepEqual(fallback, [
    { label: "CLI coverage", value: "--", detail: "Waiting for data" },
    { label: "Server uptime", value: "--", detail: "Waiting for data" },
    { label: "Pending fixes", value: "--", detail: "Waiting for data" },
    { label: "Pending pairing", value: "--", detail: "Waiting for data" },
  ]);

  const payload = createPayload();
  const withPayload = recipeModule.buildDashboardOverviewSignals({
    payload,
    text: enText,
    formatUptime: (seconds) => `${seconds}s`,
  });
  assert.deepEqual(withPayload, [
    {
      label: "CLI coverage",
      value: "2/3",
      detail: "Installed / expected runtime CLIs",
    },
    { label: "Server uptime", value: "120s", detail: "Node v22.0.0" },
    {
      label: "Pending fixes",
      value: "2",
      detail: "Fixable issues reported by bootstrap",
    },
    {
      label: "Pending pairing",
      value: "2",
      detail: "Device trust requests awaiting approval",
    },
  ]);
});

test("buildDashboardPriorityAction returns the strongest live next step", () => {
  const payload = createPayload();
  assert.deepEqual(
    recipeModule.buildDashboardPriorityAction({ payload, text: enText }),
    {
      id: "summary-recent-failures",
      to: "/system/events",
      title: "Investigate recent failures",
      detail: "Gateway token missing",
    },
  );

  const recoveryFirst = createPayload();
  recoveryFirst.events.recentFailures = 0;
  assert.equal(
    recipeModule.buildDashboardPriorityAction({
      payload: recoveryFirst,
      text: enText,
    })?.id,
    "recovery-bootstrap:gateway-auth-token",
  );

  const terminalFirst = createPayload();
  terminalFirst.events.recentFailures = 0;
  terminalFirst.recovery.items = [];
  assert.equal(
    recipeModule.buildDashboardPriorityAction({
      payload: terminalFirst,
      text: enText,
    })?.id,
    "summary-recoverable-sessions",
  );

  const auditFirst = createPayload();
  auditFirst.events.recentFailures = 0;
  auditFirst.recovery.items = [];
  auditFirst.terminalWorkspace.recoverableSessions = 0;
  assert.equal(
    recipeModule.buildDashboardPriorityAction({
      payload: auditFirst,
      text: enText,
    })?.id,
    "summary-pending-audit",
  );

  assert.equal(
    recipeModule.buildDashboardPriorityAction({ payload: null, text: enText }),
    null,
  );
});

test("buildDashboardRiskStage returns representative cards and empty state", () => {
  const payload = createPayload();
  const withPayload = recipeModule.buildDashboardRiskStage({
    payload,
    text: enText,
  });
  const withoutPayload = recipeModule.buildDashboardRiskStage({
    payload: null,
    text: enText,
  });

  assert.deepEqual(withPayload, [
    {
      key: "recovery",
      title: "Recovery backlog",
      value: "3",
      summary: "3 项恢复与处理项待跟进",
      to: "/system",
    },
    {
      key: "risk",
      title: "Risk stage",
      value: "high",
      summary: "最近恢复：Recovered detached terminal workspace",
      to: "/system/events",
    },
  ]);
  assert.deepEqual(withoutPayload, []);

  const zhLabels = recipeModule.buildDashboardRiskStage({
    payload,
    text: zhText,
  });
  assert.equal(zhLabels[0]?.title, "恢复待处理");
  assert.equal(zhLabels[1]?.title, "当前风险等级");
});

test("buildDashboardRecoveryItems passes through recovery items unchanged", () => {
  const payload = createPayload();
  const items = recipeModule.buildDashboardRecoveryItems({
    payload,
    text: enText,
  });

  assert.equal(items, payload.recovery.items);
  assert.deepEqual(
    items.map((item) => item.id),
    ["bootstrap:gateway-auth-token", "event:failure:0"],
  );
  assert.deepEqual(
    recipeModule.buildDashboardRecoveryItems({ payload: null, text: enText }),
    [],
  );
});

test("buildDashboardTrendPanels returns payload panels in original order", () => {
  const payload = createPayload();
  const panels = recipeModule.buildDashboardTrendPanels({
    payload,
    text: enText,
  });

  assert.equal(panels, payload.trends.panels);
  assert.deepEqual(
    panels.map((panel) => panel.key),
    ["risk", "recovery", "trend"],
  );
  assert.deepEqual(
    panels[0]?.points.map((point) => point.key),
    ["eventFailures", "bootstrapFixable"],
  );
  assert.equal(panels[2]?.title, "System trend");
  assert.deepEqual(
    recipeModule.buildDashboardTrendPanels({ payload: null, text: enText }),
    [],
  );
});

test("buildDashboardTrendPoints and buildDashboardContextSummary provide fallback and payload-backed collections", () => {
  const payload = createPayload();

  const trendPoints = recipeModule.buildDashboardTrendPoints({
    payload,
    text: enText,
  });
  assert.equal(trendPoints, payload.trends.points);
  assert.deepEqual(
    recipeModule.buildDashboardTrendPoints({ payload: null, text: enText }),
    [],
  );

  assert.deepEqual(
    recipeModule.buildDashboardContextSummary({ payload, text: enText }),
    {
      riskStage: "high",
      primaryHint: "3 项恢复与处理项待跟进",
      secondaryHint: "最近恢复：Recovered detached terminal workspace",
    },
  );
  assert.deepEqual(
    recipeModule.buildDashboardContextSummary({ payload: null, text: enText }),
    {
      riskStage: "low",
      primaryHint: "Waiting for context summary.",
      secondaryHint: "Waiting for recovery summary.",
    },
  );
});
