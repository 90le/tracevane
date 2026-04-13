import test from "node:test";
import assert from "node:assert/strict";

import { createDashboardService } from "../../dist/apps/api/modules/dashboard/service.js";

function createDashboard() {
  return createDashboardService({
    config: {
      pluginName: "OpenClaw Studio",
      version: "0.1.20",
      port: 3760,
      gatewayPort: 31879,
      gatewayWsUrl: "ws://127.0.0.1:31879",
      transport: {
        standalone: { enabled: false, port: 3760 },
        gateway: { enabled: true, basePath: "/studio" },
      },
    },
    agents: {
      getSummary() {
        return { count: 4 };
      },
    },
    channels: {
      getSummary() {
        return {
          counts: {
            channels: 3,
            bindings: 8,
          },
        };
      },
    },
    cron: {
      getSummary() {
        return { count: 2 };
      },
    },
    skills: {
      getSummary() {
        return {
          counts: {
            total: 7,
            enabled: 5,
          },
        };
      },
    },
    system: {
      async getHealth() {
        return {
          gateway: "online",
          gatewayConnected: true,
        };
      },
      async getBootstrap() {
        return {
          ready: false,
          checks: [
            { id: "plugin-entry", level: "ok" },
            { id: "gateway-auth-token", level: "error" },
            { id: "allowed-origins", level: "warn" },
          ],
        };
      },
      async getDeviceTrust() {
        return {
          helper: {
            configured: true,
          },
          pendingRequests: [{ id: "req-1" }, { id: "req-2" }],
        };
      },
      async getStudioRelease() {
        return {
          checkedAt: "2026-04-09T00:00:00.000Z",
          currentVersion: "0.1.20",
          latestVersion: "0.1.21",
          updateAvailable: true,
          source: "https://studio.90le.cn/openclaw-studio-latest.json",
          packageUrl: "https://studio.90le.cn/openclaw-studio-0.1.21.tar.gz",
          minOpenClawVersion: "2026.4.8",
          notes: ["gateway reload fix"],
        };
      },
      async getStudioUpgradeStatus() {
        return {
          checkedAt: "2026-04-09T00:00:00.000Z",
          status: "running",
          running: true,
          pid: 321,
          mode: "gateway",
          targetVersion: "0.1.21",
          startedAt: "2026-04-09T00:00:00.000Z",
          finishedAt: null,
          logFile: "/tmp/studio-upgrade.log",
          lastError: "",
        };
      },
      async listEvents() {
        return [];
      },
      async getEventSummary() {
        return {
          recentFailures: { count: 0, items: [] },
          pendingAuditItems: { count: 0, items: [] },
          recentRecoveries: { count: 0, items: [] },
        };
      },
    },
    terminal: {
      getStatus() {
        return {
          binaries: [
            { key: "openclaw", installed: true },
            { key: "docker", installed: false },
            { key: "git", installed: true },
          ],
        };
      },
    },
  });
}

test("dashboard summary exposes transport, bootstrap, release, and device trust status", async () => {
  const dashboard = createDashboard();

  const summary = await dashboard.getSummary();

  assert.equal(summary.transport.mode, "gateway");
  assert.equal(summary.transport.basePath, "/studio");
  assert.equal(summary.transport.entryUrl, "/studio");
  assert.equal(summary.release.currentVersion, "0.1.20");
  assert.equal(summary.release.latestVersion, "0.1.21");
  assert.equal(summary.release.updateAvailable, true);
  assert.equal(summary.release.upgradeRunning, true);
  assert.equal(summary.bootstrap.ready, false);
  assert.equal(summary.bootstrap.errors, 1);
  assert.equal(summary.bootstrap.warnings, 1);
  assert.equal(summary.deviceTrust.pendingRequests, 2);
  assert.equal(summary.deviceTrust.helperConfigured, true);
  assert.equal(summary.runtime.installedCliCount, 2);
  assert.equal(summary.runtime.expectedCliCount, 3);
});
