import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EventEmitter } from "node:events";

import { TracevaneRouter } from "../../dist/apps/api/core/router.js";
import { registerDashboardRoutes } from "../../dist/apps/api/modules/dashboard/routes.js";
import { createDashboardService } from "../../dist/apps/api/modules/dashboard/service.js";

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);
const dashboardServiceSource = fs.readFileSync(
  path.join(rootDir, "apps/api/modules/dashboard/service.ts"),
  "utf8",
);
const dashboardRoutesSource = fs.readFileSync(
  path.join(rootDir, "apps/api/modules/dashboard/routes.ts"),
  "utf8",
);

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createMockRequest(url, acceptLanguage) {
  return {
    method: "GET",
    url,
    headers: {
      host: "127.0.0.1:3760",
      ...(acceptLanguage ? { "accept-language": acceptLanguage } : {}),
    },
  };
}

function createMockResponse() {
  const emitter = new EventEmitter();
  const headers = new Map();
  return Object.assign(emitter, {
    statusCode: 200,
    writableEnded: false,
    body: "",
    setHeader(name, value) {
      headers.set(String(name).toLowerCase(), value);
    },
    getHeader(name) {
      return headers.get(String(name).toLowerCase());
    },
    hasHeader(name) {
      return headers.has(String(name).toLowerCase());
    },
    flushHeaders() {},
    write(chunk) {
      this.body += String(chunk);
      return true;
    },
    end(chunk = "") {
      this.body += String(chunk);
      this.writableEnded = true;
      this.emit("finish");
    },
  });
}

function createDashboard() {
  return createDashboardService({
    config: {
      pluginName: "Tracevane",
      version: "0.1.20",
      port: 3760,
      gatewayPort: 31879,
      gatewayWsUrl: "ws://127.0.0.1:31879",
      transport: {
        standalone: { enabled: false, port: 3760 },
        gateway: { enabled: true, basePath: "/tracevane" },
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
            { id: "gateway-auth-token", level: "error", fixable: true },
            { id: "allowed-origins", level: "warn", fixable: true },
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
      async getTracevaneRelease() {
        return {
          checkedAt: "2026-04-09T00:00:00.000Z",
          currentVersion: "0.1.20",
          latestVersion: "0.1.21",
          updateAvailable: true,
          source: "https://tracevane.90le.cn/tracevane-latest.json",
          packageUrl: "https://tracevane.90le.cn/tracevane-0.1.21.tar.gz",
          minOpenClawVersion: "2026.4.8",
          notes: ["gateway reload fix"],
        };
      },
      async getTracevaneUpgradeStatus() {
        return {
          checkedAt: "2026-04-09T00:00:00.000Z",
          status: "running",
          running: true,
          pid: 321,
          mode: "gateway",
          targetVersion: "0.1.21",
          startedAt: "2026-04-09T00:00:00.000Z",
          finishedAt: null,
          logFile: "/tmp/tracevane-upgrade.log",
          lastError: "",
        };
      },
      async listEvents() {
        return [];
      },
      async getEventSummary() {
        return {
          recentFailures: {
            count: 2,
            items: [
              {
                title: "Gateway token missing",
                category: "bootstrap",
                occurredAt: "2026-04-09T01:00:00.000Z",
              },
              {
                title: "Agent sync timed out",
                category: "runtime",
                occurredAt: "2026-04-09T00:40:00.000Z",
              },
            ],
          },
          pendingAuditItems: {
            count: 1,
            items: [
              {
                title: "Review helper pairing policy",
                category: "security",
                occurredAt: "2026-04-09T00:50:00.000Z",
              },
            ],
          },
          recentRecoveries: {
            count: 1,
            items: [
              {
                title: "Recovered detached terminal workspace",
                category: "terminal",
                occurredAt: "2026-04-09T00:30:00.000Z",
              },
            ],
          },
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
      async listPersistedSessions() {
        return {
          sessions: [
            {
              sessionId: "sess-2",
              title: "Detached after restart",
              status: "detached",
              canResume: true,
              updatedAt: "2026-04-09T01:05:00.000Z",
              recentOutputSummary: {
                lastCommandHint: "npm run dev:web",
                lastError: "address already in use",
              },
            },
            {
              sessionId: "sess-1",
              title: "Daily checks",
              status: "running",
              canResume: true,
              updatedAt: "2026-04-09T00:10:00.000Z",
              recentOutputSummary: {
                lastCommandHint: "npm run test:system",
                lastError: "",
              },
            },
          ],
        };
      },
    },
  });
}

test("dashboard service source keeps locale-aware summary builders instead of dist-only coverage", () => {
  assert.match(
    dashboardServiceSource,
    /getSummary\(acceptLanguage\?: string\)/,
  );
  assert.match(dashboardRoutesSource, /req\.headers\["accept-language"\]/);
  assert.match(dashboardRoutesSource, /searchParams\.get\("locale"\)/);
  assert.match(dashboardServiceSource, /localizeText\(acceptLanguage, value\)/);
  assert.doesNotMatch(dashboardServiceSource, /recoveryPrimaryHint/);
  assert.doesNotMatch(dashboardServiceSource, /trends:/);
  assert.doesNotMatch(dashboardServiceSource, /contextSummary:/);
  assert.match(
    dashboardServiceSource,
    /domainSystemUpgradeNote: \(latestVersion: string, status: string\)/,
  );
});

test("dashboard summary exposes transport, bootstrap, release, and device trust status", async () => {
  const dashboard = createDashboard();

  const summary = await dashboard.refreshSummary();

  assert.equal(summary.transport.mode, "gateway");
  assert.equal(summary.transport.basePath, "/tracevane");
  assert.equal(summary.transport.entryUrl, "/tracevane");
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
  assert.equal(summary.events.recentFailures, 2);
  assert.equal(summary.events.pendingAuditItems, 1);
  assert.equal(summary.events.recentRecoveries, 1);
  assert.equal(summary.terminalWorkspace.totalSessions, 2);
  assert.equal(summary.terminalWorkspace.recoverableSessions, 2);

  assert.deepEqual(
    summary.recovery.items.map((item) => item.id),
    [
      "bootstrap:gateway-auth-token",
      "bootstrap:allowed-origins",
      "event:failure:0",
      "event:failure:1",
      "event:audit:0",
      "terminal:sess-2",
    ],
  );
  assert.equal(summary.recovery.total, 6);
  assert.equal("trends" in summary, false);
  assert.equal("contextSummary" in summary, false);
});

test("dashboard summary switches recovery and domain copy for english requests", async () => {
  const dashboard = createDashboard();

  const summary = await dashboard.refreshSummary("en-US,en;q=0.9");

  assert.equal(
    summary.recovery.items[0]?.title,
    "Repair bootstrap: gateway-auth-token",
  );
  assert.equal(
    summary.recovery.items[0]?.note,
    "Blocking errors detected. Repair immediately.",
  );
  assert.equal("trends" in summary, false);
  assert.equal("contextSummary" in summary, false);
  assert.equal(summary.domains[0]?.label, "System config");
  assert.equal(summary.domains[2]?.value, "2 recoverable");
  assert.equal(summary.domains[6]?.label, "System overview");
});

test("dashboard summary cache keeps independent localized snapshots", async () => {
  const dashboard = createDashboard();

  const zhSummary = await dashboard.refreshSummary("zh-CN,zh;q=0.9");
  const enSummary = await dashboard.refreshSummary("en-US,en;q=0.9");

  assert.equal(zhSummary.domains[0]?.label, "系统配置");
  assert.equal(enSummary.domains[0]?.label, "System config");
  assert.equal("contextSummary" in zhSummary, false);
  assert.equal("contextSummary" in enSummary, false);
});

test("dashboard service reuses cached summary across repeated reads", async () => {
  let healthCalls = 0;
  let terminalListCalls = 0;

  const dashboard = createDashboardService({
    config: {
      pluginName: "Tracevane",
      version: "0.1.20",
      port: 3760,
      gatewayPort: 31879,
      gatewayWsUrl: "ws://127.0.0.1:31879",
      transport: {
        standalone: { enabled: false, port: 3760 },
        gateway: { enabled: true, basePath: "/tracevane" },
      },
    },
    agents: { getSummary: () => ({ count: 1 }) },
    channels: { getSummary: () => ({ counts: { channels: 1, bindings: 1 } }) },
    cron: { getSummary: () => ({ count: 0 }) },
    skills: { getSummary: () => ({ counts: { total: 1, enabled: 1 } }) },
    system: {
      async getHealth() {
        healthCalls += 1;
        return { gateway: "online", gatewayConnected: true };
      },
      async getBootstrap() {
        return { ready: true, checks: [] };
      },
      async getDeviceTrust() {
        return {
          helper: { paired: true },
          settings: { autoApproveLocalHelper: true },
        };
      },
      async getTracevaneRelease() {
        return {
          checkedAt: "2026-04-20T00:00:00.000Z",
          currentVersion: "0.1.20",
          latestVersion: null,
          updateAvailable: false,
          source: null,
          packageUrl: null,
          minOpenClawVersion: null,
          notes: [],
        };
      },
      async getTracevaneUpgradeStatus() {
        return {
          checkedAt: "2026-04-20T00:00:00.000Z",
          status: "idle",
          running: false,
          pid: null,
          mode: null,
          targetVersion: null,
          startedAt: null,
          finishedAt: null,
          logFile: "",
          lastError: "",
        };
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
        return { binaries: [{ key: "openclaw", installed: true }] };
      },
      async listPersistedSessions() {
        terminalListCalls += 1;
        return { sessions: [] };
      },
    },
  });

  await dashboard.getSummary();
  await dashboard.getSummary();

  assert.equal(healthCalls, 1);
  assert.equal(terminalListCalls, 1);
});

test("dashboard service dedupes concurrent first requests into one rebuild", async () => {
  let healthCalls = 0;
  let releaseBarrier;
  const healthGate = new Promise((resolve) => {
    releaseBarrier = resolve;
  });

  const dashboard = createDashboardService({
    config: {
      pluginName: "Tracevane",
      version: "0.1.20",
      port: 3760,
      gatewayPort: 31879,
      gatewayWsUrl: "ws://127.0.0.1:31879",
      transport: {
        standalone: { enabled: false, port: 3760 },
        gateway: { enabled: true, basePath: "/tracevane" },
      },
    },
    agents: { getSummary: () => ({ count: 1 }) },
    channels: { getSummary: () => ({ counts: { channels: 1, bindings: 1 } }) },
    cron: { getSummary: () => ({ count: 0 }) },
    skills: { getSummary: () => ({ counts: { total: 1, enabled: 1 } }) },
    system: {
      async getHealth() {
        healthCalls += 1;
        await healthGate;
        return { gateway: "online", gatewayConnected: true };
      },
      async getBootstrap() {
        return { ready: true, checks: [] };
      },
      async getDeviceTrust() {
        return {
          helper: { paired: true },
          settings: { autoApproveLocalHelper: true },
        };
      },
      async getTracevaneRelease() {
        return {
          checkedAt: "2026-04-20T00:00:00.000Z",
          currentVersion: "0.1.20",
          latestVersion: null,
          updateAvailable: false,
          source: null,
          packageUrl: null,
          minOpenClawVersion: null,
          notes: [],
        };
      },
      async getTracevaneUpgradeStatus() {
        return {
          checkedAt: "2026-04-20T00:00:00.000Z",
          status: "idle",
          running: false,
          pid: null,
          mode: null,
          targetVersion: null,
          startedAt: null,
          finishedAt: null,
          logFile: "",
          lastError: "",
        };
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
        return { binaries: [{ key: "openclaw", installed: true }] };
      },
      async listPersistedSessions() {
        return { sessions: [] };
      },
    },
  });

  const first = dashboard.getSummary();
  const second = dashboard.getSummary();
  releaseBarrier();

  const [firstSummary, secondSummary] = await Promise.all([first, second]);

  assert.equal(healthCalls, 1);
  assert.equal(firstSummary.checkedAt, secondSummary.checkedAt);
});

test("dashboard first request returns quickly with placeholder snapshot then refreshes in background", async () => {
  let healthCalls = 0;
  let releaseBarrier;
  const healthGate = new Promise((resolve) => {
    releaseBarrier = resolve;
  });

  const dashboard = createDashboardService({
    config: {
      pluginName: "Tracevane",
      version: "0.1.20",
      port: 3760,
      gatewayPort: 31879,
      gatewayWsUrl: "ws://127.0.0.1:31879",
      transport: {
        standalone: { enabled: false, port: 3760 },
        gateway: { enabled: true, basePath: "/tracevane" },
      },
    },
    agents: { getSummary: () => ({ count: 1 }) },
    channels: { getSummary: () => ({ counts: { channels: 1, bindings: 1 } }) },
    cron: { getSummary: () => ({ count: 0 }) },
    skills: { getSummary: () => ({ counts: { total: 1, enabled: 1 } }) },
    system: {
      async getHealth() {
        healthCalls += 1;
        await healthGate;
        return { gateway: "online", gatewayConnected: true };
      },
      async getBootstrap() {
        return { ready: true, checks: [] };
      },
      async getDeviceTrust() {
        return {
          helper: { paired: true },
          settings: { autoApproveLocalHelper: true },
        };
      },
      async getTracevaneRelease() {
        return {
          checkedAt: "2026-04-20T00:00:00.000Z",
          currentVersion: "0.1.20",
          latestVersion: null,
          updateAvailable: false,
          source: null,
          packageUrl: null,
          minOpenClawVersion: null,
          notes: [],
        };
      },
      async getTracevaneUpgradeStatus() {
        return {
          checkedAt: "2026-04-20T00:00:00.000Z",
          status: "idle",
          running: false,
          pid: null,
          mode: null,
          targetVersion: null,
          startedAt: null,
          finishedAt: null,
          logFile: "",
          lastError: "",
        };
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
        return { binaries: [{ key: "openclaw", installed: true }] };
      },
      async listPersistedSessions() {
        return { sessions: [] };
      },
    },
  });

  const startedAt = Date.now();
  const initial = await dashboard.getSummary();
  const elapsedMs = Date.now() - startedAt;

  assert.ok(elapsedMs < 35);
  assert.equal(initial.summaryReady, false);
  assert.equal("contextSummary" in initial, false);

  releaseBarrier();
  await delay(20);

  const refreshed = await dashboard.getSummary();
  assert.equal(healthCalls, 1);
  assert.equal(refreshed.summaryReady, true);
  assert.equal(refreshed.server.version, "0.1.20");
  assert.equal(refreshed.runtime.expectedCliCount, 1);
});

test("dashboard stale snapshot triggers background refresh without blocking response", async () => {
  let healthCalls = 0;
  let healthDelayMs = 0;

  const dashboard = createDashboardService({
    config: {
      pluginName: "Tracevane",
      version: "0.1.20",
      port: 3760,
      gatewayPort: 31879,
      gatewayWsUrl: "ws://127.0.0.1:31879",
      transport: {
        standalone: { enabled: false, port: 3760 },
        gateway: { enabled: true, basePath: "/tracevane" },
      },
    },
    agents: { getSummary: () => ({ count: 1 }) },
    channels: { getSummary: () => ({ counts: { channels: 1, bindings: 1 } }) },
    cron: { getSummary: () => ({ count: 0 }) },
    skills: { getSummary: () => ({ counts: { total: 1, enabled: 1 } }) },
    system: {
      async getHealth() {
        healthCalls += 1;
        if (healthDelayMs > 0) {
          await delay(healthDelayMs);
        }
        return { gateway: "online", gatewayConnected: true };
      },
      async getBootstrap() {
        return { ready: true, checks: [] };
      },
      async getDeviceTrust() {
        return {
          helper: { paired: true },
          settings: { autoApproveLocalHelper: true },
        };
      },
      async getTracevaneRelease() {
        return {
          checkedAt: "2026-04-20T00:00:00.000Z",
          currentVersion: "0.1.20",
          latestVersion: null,
          updateAvailable: false,
          source: null,
          packageUrl: null,
          minOpenClawVersion: null,
          notes: [],
        };
      },
      async getTracevaneUpgradeStatus() {
        return {
          checkedAt: "2026-04-20T00:00:00.000Z",
          status: "idle",
          running: false,
          pid: null,
          mode: null,
          targetVersion: null,
          startedAt: null,
          finishedAt: null,
          logFile: "",
          lastError: "",
        };
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
        return { binaries: [{ key: "openclaw", installed: true }] };
      },
      async listPersistedSessions() {
        return { sessions: [] };
      },
    },
  });

  const realNow = Date.now;
  try {
    let now = 1_000;
    Date.now = () => now;

    const first = await dashboard.getSummary();
    await delay(10);
    assert.equal(healthCalls, 1);

    now = 7_000;
    healthDelayMs = 40;
    const startedAt = realNow();
    const immediate = await dashboard.getSummary();
    const elapsedMs = realNow() - startedAt;

    assert.equal(immediate.summaryReady, true);
    assert.equal(first.summaryReady, false);
    assert.ok(elapsedMs < 35);

    await delay(70);
    assert.equal(healthCalls, 2);
  } finally {
    Date.now = realNow;
  }
});

test("dashboard stale background refresh failure keeps last valid snapshot and avoids unhandled rejection", async () => {
  let shouldFailHealth = false;
  let unhandled = null;

  const dashboard = createDashboardService({
    config: {
      pluginName: "Tracevane",
      version: "0.1.20",
      port: 3760,
      gatewayPort: 31879,
      gatewayWsUrl: "ws://127.0.0.1:31879",
      transport: {
        standalone: { enabled: false, port: 3760 },
        gateway: { enabled: true, basePath: "/tracevane" },
      },
    },
    agents: { getSummary: () => ({ count: 1 }) },
    channels: { getSummary: () => ({ counts: { channels: 1, bindings: 1 } }) },
    cron: { getSummary: () => ({ count: 0 }) },
    skills: { getSummary: () => ({ counts: { total: 1, enabled: 1 } }) },
    system: {
      async getHealth() {
        if (shouldFailHealth) {
          throw new Error("health failed");
        }
        return { gateway: "online", gatewayConnected: true };
      },
      async getBootstrap() {
        return { ready: true, checks: [] };
      },
      async getDeviceTrust() {
        return {
          helper: { paired: true },
          settings: { autoApproveLocalHelper: true },
        };
      },
      async getTracevaneRelease() {
        return {
          checkedAt: "2026-04-20T00:00:00.000Z",
          currentVersion: "0.1.20",
          latestVersion: null,
          updateAvailable: false,
          source: null,
          packageUrl: null,
          minOpenClawVersion: null,
          notes: [],
        };
      },
      async getTracevaneUpgradeStatus() {
        return {
          checkedAt: "2026-04-20T00:00:00.000Z",
          status: "idle",
          running: false,
          pid: null,
          mode: null,
          targetVersion: null,
          startedAt: null,
          finishedAt: null,
          logFile: "",
          lastError: "",
        };
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
        return { binaries: [{ key: "openclaw", installed: true }] };
      },
      async listPersistedSessions() {
        return { sessions: [] };
      },
    },
  });

  const realNow = Date.now;
  const onUnhandled = (reason) => {
    unhandled = reason;
  };
  process.once("unhandledRejection", onUnhandled);

  try {
    let now = 1_000;
    Date.now = () => now;

    const cached = await dashboard.getSummary();
    now = 7_000;
    shouldFailHealth = true;

    const returned = await dashboard.getSummary();
    assert.equal(cached.summaryReady, false);
    assert.equal(returned.summaryReady, false);

    await delay(20);
    assert.equal(unhandled, null);

    const afterFailure = await dashboard.getSummary();
    assert.equal(afterFailure.summaryReady, true);
    assert.equal(afterFailure.server.version, "0.1.20");
  } finally {
    Date.now = realNow;
    process.removeListener("unhandledRejection", onUnhandled);
  }
});

test("dashboard summary route does not rebuild when snapshot is fresh", async () => {
  let getSummaryCalls = 0;
  let refreshCalls = 0;

  const router = new TracevaneRouter();
  const routeCtx = {
    services: {
      dashboard: {
        async getSummary() {
          getSummaryCalls += 1;
          return {
            checkedAt: "2026-04-20T00:00:00.000Z",
            server: {
              name: "Tracevane",
              version: "0.1.21",
              port: 3760,
              pid: process.pid,
              nodeVersion: process.version,
              uptime: 0,
            },
            gateway: {
              port: 31879,
              url: "ws://127.0.0.1:31879",
              connected: true,
            },
            counts: {
              agents: 1,
              channels: 1,
              bindings: 1,
              cronJobs: 0,
              skills: 1,
              enabledSkills: 1,
            },
            transport: {
              mode: "gateway",
              standalonePort: 3760,
              gatewayPort: 31879,
              basePath: "/tracevane",
              entryUrl: "/tracevane",
              healthUrl: "/tracevane/api/system/health",
            },
            release: {
              currentVersion: "0.1.21",
              latestVersion: null,
              updateAvailable: false,
              upgradeRunning: false,
              upgradeStatus: "idle",
              targetVersion: null,
              source: null,
            },
            bootstrap: { ready: true, errors: 0, warnings: 0, fixable: 0 },
            deviceTrust: {
              helperConfigured: true,
              helperPaired: true,
              pendingRequests: 0,
              autoApproveLocalHelper: true,
            },
            runtime: { installedCliCount: 1, expectedCliCount: 1 },
            events: {
              recentFailures: 0,
              pendingAuditItems: 0,
              recentRecoveries: 0,
              latestFailureTitle: null,
              latestAuditTitle: null,
              latestRecoveryTitle: null,
            },
            terminalWorkspace: {
              totalSessions: 0,
              recoverableSessions: 0,
              detachedSessions: 0,
              runningSessions: 0,
              latestSessionId: null,
              latestSessionTitle: null,
              latestSessionUpdatedAt: null,
              latestCommandHint: null,
              latestError: null,
            },
            recovery: { total: 0, items: [] },
            domains: [],
          };
        },
        refreshSummary() {
          refreshCalls += 1;
          return Promise.resolve(null);
        },
      },
    },
    sseClients: new Set(),
    logger: {
      error() {},
      warn() {},
      info() {},
      debug() {},
    },
  };

  registerDashboardRoutes(router, routeCtx);

  const firstReq = createMockRequest("/api/dashboard/summary", "zh-CN");
  const firstRes = createMockResponse();
  await router.handle(firstReq, firstRes, routeCtx);

  const secondReq = createMockRequest("/api/dashboard/summary", "zh-CN");
  const secondRes = createMockResponse();
  await router.handle(secondReq, secondRes, routeCtx);

  assert.equal(getSummaryCalls, 2);
  assert.equal(refreshCalls, 0);
});

test("dashboard stream route removes client if initial summary bootstrap fails", async () => {
  const router = new TracevaneRouter();
  const routeCtx = {
    services: {
      dashboard: {
        async getSummary() {
          throw new Error("bootstrap failed");
        },
        async refreshSummary() {
          return null;
        },
      },
    },
    sseClients: new Set(),
    logger: {
      error() {},
      warn() {},
      info() {},
      debug() {},
    },
  };

  registerDashboardRoutes(router, routeCtx);

  const req = createMockRequest("/api/stream/dashboard", "zh-CN");
  const res = createMockResponse();
  const handled = await router.handle(req, res, routeCtx);

  assert.equal(handled, true);
  assert.equal(routeCtx.sseClients.size, 0);
});

test("dashboard service source exposes snapshot refresh orchestration", () => {
  assert.match(dashboardServiceSource, /const snapshots = new Map</);
  assert.match(dashboardServiceSource, /function getSnapshot\(/);
  assert.match(
    dashboardServiceSource,
    /normalizeDashboardLanguageKey\(acceptLanguage\)/,
  );
  assert.match(dashboardServiceSource, /async function refreshSummary\(/);
  assert.match(dashboardServiceSource, /async function buildSummary\(/);
});

test("dashboard stream route wraps interval refresh in try/catch", () => {
  assert.match(
    dashboardRoutesSource,
    /setInterval\(async \(\) => \{[\s\S]*try \{[\s\S]*\} catch \(error\) \{[\s\S]*\}[\s\S]*\}, 5000\);/,
  );
});
