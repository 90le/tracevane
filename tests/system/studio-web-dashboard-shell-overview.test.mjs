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

const enText = (_zh, en) => en;

function createPayload() {
  return {
    checkedAt: "2026-04-18T00:00:00.000Z",
    server: {
      name: "Tracevane",
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
    domains: [],
  };
}

test("dashboard overview recipe only keeps compact signal derivation", () => {
  assert.equal(fs.existsSync(recipePath), true);
  const recipe = fs.readFileSync(recipePath, "utf8");
  assert.match(recipe, /export function buildDashboardOverviewSignals/);
  assert.doesNotMatch(recipe, /from ['"]\.\.\/shell\/route-manifest['"]/);
  assert.doesNotMatch(recipe, /buildDashboardQuickActions/);
  assert.doesNotMatch(recipe, /buildDashboardPriorityAction/);
  assert.doesNotMatch(recipe, /buildDashboardRiskStage/);
  assert.doesNotMatch(recipe, /buildDashboardContextSummary/);
  assert.doesNotMatch(recipe, /buildDashboardTrendPanels/);
  assert.doesNotMatch(recipe, /buildDashboardTrendPoints/);
  assert.doesNotMatch(recipe, /buildDashboardRecoveryItems/);
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
