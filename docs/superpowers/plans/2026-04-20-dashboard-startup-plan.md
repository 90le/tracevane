# Dashboard Startup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Dashboard open quickly and safely by serving a snapshot-first summary, preserving old summary data during refreshes, and preventing render crashes from missing payload arrays.

**Architecture:** Add an in-memory snapshot/cache layer to the dashboard backend so route handlers serve the latest summary immediately instead of recomputing the full aggregate on every request or SSE tick. Normalize dashboard payload shape at the frontend API boundary and keep the last good summary visible during silent refresh failures so Dashboard never blocks or crashes on partial payloads.

**Tech Stack:** Node.js, TypeScript, Vue 3 Composition API, SSE, node:test

---

## File Map

- **Modify:** `apps/api/modules/dashboard/service.ts`
  - Add snapshot state, stale-window logic, refresh dedupe, and a separated heavy summary builder.
- **Modify:** `apps/api/modules/dashboard/routes.ts`
  - Make HTTP and SSE routes serve the cached snapshot and trigger background refreshes through the service.
- **Modify:** `apps/web-vue/src/features/dashboard/api.ts`
  - Normalize dashboard payload shape before returning it to the composable.
- **Modify:** `apps/web-vue/src/features/dashboard/use-dashboard-summary.ts`
  - Preserve last good summary during silent refreshes and avoid full-page blocking when summary already exists.
- **Modify:** `apps/web-vue/src/features/dashboard/overview-recipe.ts`
  - Harden derived collections so they always return arrays or fallback objects.
- **Modify:** `apps/web-vue/src/views/DashboardView.vue`
  - Keep rendering contracts aligned with normalized payload shape without assuming unstable nested values.
- **Modify:** `tests/system/dashboard-service.test.mjs`
  - Add snapshot/cache behavior coverage and route-source contract checks.
- **Modify:** `tests/system/studio-web-dashboard-recipe.test.mjs`
  - Add source contracts for safe dashboard rendering and normalized collections.
- **Modify:** `tests/system/studio-web-home-layout-redesign.test.mjs`
  - Add composable/API source contracts for non-blocking dashboard refresh behavior.

---

### Task 1: Add failing backend tests for snapshot-first dashboard summary

**Files:**
- Modify: `tests/system/dashboard-service.test.mjs`
- Modify: `apps/api/modules/dashboard/service.ts`
- Modify: `apps/api/modules/dashboard/routes.ts`

- [ ] **Step 1: Write the failing tests**

Add these tests near the end of `tests/system/dashboard-service.test.mjs`:

```js
test("dashboard service reuses cached summary across repeated reads", async () => {
  let healthCalls = 0;
  let terminalListCalls = 0;

  const dashboard = createDashboardService({
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
        return { helper: { paired: true }, settings: { autoApproveLocalHelper: true } };
      },
      async getStudioRelease() {
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
      async getStudioUpgradeStatus() {
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

test("dashboard service source exposes snapshot refresh orchestration", () => {
  assert.match(dashboardServiceSource, /let lastSummary: DashboardSummaryPayload \| null = null/);
  assert.match(dashboardServiceSource, /let refreshInFlight: Promise<DashboardSummaryPayload> \| null = null/);
  assert.match(dashboardServiceSource, /async function refreshSummary\(/);
  assert.match(dashboardServiceSource, /async function buildSummary\(/);
  assert.match(dashboardRoutesSource, /void routeCtx\.services\.dashboard\.refreshSummary\(/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd /home/binbin/.openclaw/extensions/openclaw-studio/.worktrees/home-dashboard-context-panel && npm run build:api && node --test tests/system/dashboard-service.test.mjs
```

Expected: FAIL because the service currently rebuilds the summary every time and does not expose snapshot refresh orchestration.

- [ ] **Step 3: Write minimal backend snapshot implementation**

In `apps/api/modules/dashboard/service.ts`, refactor the service so the heavy aggregator lives in `buildSummary()` and add snapshot state like this near the top of `createDashboardService(...)`:

```ts
  let lastSummary: DashboardSummaryPayload | null = null;
  let lastUpdatedAt: number | null = null;
  let refreshInFlight: Promise<DashboardSummaryPayload> | null = null;
  const SNAPSHOT_TTL_MS = 5_000;

  function isSnapshotFresh(): boolean {
    return lastUpdatedAt !== null && Date.now() - lastUpdatedAt < SNAPSHOT_TTL_MS;
  }

  async function buildSummary(
    acceptLanguage?: string,
  ): Promise<DashboardSummaryPayload> {
    const [
      agentSummary,
      channelSummary,
      cronSummary,
      skillsSummary,
      systemHealth,
      terminalStatus,
      bootstrap,
      deviceTrust,
      release,
      upgradeStatus,
      eventSummary,
      persistedTerminalSessions,
    ] = await Promise.all([
      Promise.resolve(options.agents.getSummary()),
      Promise.resolve(options.channels.getSummary()),
      Promise.resolve(options.cron.getSummary()),
      Promise.resolve(options.skills.getSummary()),
      options.system.getHealth(),
      Promise.resolve(options.terminal.getStatus()),
      options.system.getBootstrap(),
      options.system.getDeviceTrust(),
      options.system.getStudioRelease(),
      options.system.getStudioUpgradeStatus(),
      options.system.getEventSummary(),
      options.terminal.listPersistedSessions(),
    ]);

    // keep the existing payload construction body here unchanged
  }

  async function refreshSummary(
    acceptLanguage?: string,
  ): Promise<DashboardSummaryPayload> {
    if (refreshInFlight) {
      return refreshInFlight;
    }
    refreshInFlight = buildSummary(acceptLanguage)
      .then((summary) => {
        lastSummary = summary;
        lastUpdatedAt = Date.now();
        return summary;
      })
      .finally(() => {
        refreshInFlight = null;
      });
    return refreshInFlight;
  }
```

Then return these methods from the service:

```ts
  return {
    async getSummary(acceptLanguage?: string): Promise<DashboardSummaryPayload> {
      if (lastSummary) {
        if (!isSnapshotFresh()) {
          void refreshSummary(acceptLanguage);
        }
        return lastSummary;
      }
      return refreshSummary(acceptLanguage);
    },
    async refreshSummary(acceptLanguage?: string): Promise<DashboardSummaryPayload> {
      return refreshSummary(acceptLanguage);
    },
  };
```

Also update the service interface:

```ts
export interface DashboardService {
  getSummary(acceptLanguage?: string): Promise<DashboardSummaryPayload>;
  refreshSummary(acceptLanguage?: string): Promise<DashboardSummaryPayload>;
}
```

In `apps/api/modules/dashboard/routes.ts`, update the handlers so they trigger background refresh instead of recomputing inside every tick:

```ts
  router.get("/api/dashboard/summary", async (req, res, routeCtx) => {
    const acceptLanguage = req.headers["accept-language"];
    const summary = await routeCtx.services.dashboard.getSummary(acceptLanguage);
    void routeCtx.services.dashboard.refreshSummary(acceptLanguage);
    sendJson(res, 200, summary);
  });
```

And in the SSE route:

```ts
  router.get("/api/stream/dashboard", async (req, res, routeCtx) => {
    startSse(res);
    routeCtx.sseClients.add(res);

    const acceptLanguage = req.headers["accept-language"];
    sendSseEvent(
      res,
      "summary",
      await routeCtx.services.dashboard.getSummary(acceptLanguage),
    );

    const timer = setInterval(async () => {
      void routeCtx.services.dashboard.refreshSummary(acceptLanguage);
      sendSseEvent(
        res,
        "summary",
        await routeCtx.services.dashboard.getSummary(acceptLanguage),
      );
    }, 5000);
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
cd /home/binbin/.openclaw/extensions/openclaw-studio/.worktrees/home-dashboard-context-panel && npm run build:api && node --test tests/system/dashboard-service.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/system/dashboard-service.test.mjs apps/api/modules/dashboard/service.ts apps/api/modules/dashboard/routes.ts
git commit -m "fix: snapshot dashboard summary reads"
```

### Task 2: Add failing frontend tests for normalized dashboard payload shape

**Files:**
- Modify: `tests/system/studio-web-dashboard-recipe.test.mjs`
- Modify: `apps/web-vue/src/features/dashboard/api.ts`
- Modify: `apps/web-vue/src/features/dashboard/overview-recipe.ts`

- [ ] **Step 1: Write the failing tests**

Append these tests to `tests/system/studio-web-dashboard-recipe.test.mjs`:

```js
const dashboardApi = fs.readFileSync(
  path.join(rootDir, "apps/web-vue/src/features/dashboard/api.ts"),
  "utf8",
);
const dashboardRecipe = fs.readFileSync(
  path.join(rootDir, "apps/web-vue/src/features/dashboard/overview-recipe.ts"),
  "utf8",
);

test("dashboard api normalizes collection fields before returning summary", () => {
  assert.match(dashboardApi, /function normalizeDashboardSummary\(/);
  assert.match(dashboardApi, /recovery:\s*\{[\s\S]*items:\s*Array\.isArray\(payload\.recovery\?\.items\)\s*\?\s*payload\.recovery\.items\s*:\s*\[\]/);
  assert.match(dashboardApi, /trends:\s*\{[\s\S]*points:\s*Array\.isArray\(payload\.trends\?\.points\)\s*\?\s*payload\.trends\.points\s*:\s*\[\]/);
  assert.match(dashboardApi, /panels:\s*Array\.isArray\(payload\.trends\?\.panels\)\s*\?\s*payload\.trends\.panels\s*:\s*\[\]/);
  assert.match(dashboardApi, /domains:\s*Array\.isArray\(payload\.domains\)\s*\?\s*payload\.domains\s*:\s*\[\]/);
});

test("dashboard recipe helpers always return arrays from payload-derived collections", () => {
  assert.match(dashboardRecipe, /return Array\.isArray\(options\.payload\?\.recovery\?\.items\) \? options\.payload\.recovery\.items : \[\]/);
  assert.match(dashboardRecipe, /return Array\.isArray\(payload\?\.trends\?\.panels\) \? payload\.trends\.panels : \[\]/);
  assert.match(dashboardRecipe, /return Array\.isArray\(payload\?\.trends\?\.points\) \? payload\.trends\.points : \[\]/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd /home/binbin/.openclaw/extensions/openclaw-studio/.worktrees/home-dashboard-context-panel && node --test tests/system/studio-web-dashboard-recipe.test.mjs
```

Expected: FAIL because the API does not normalize the payload and recipe helpers still trust nested arrays directly.

- [ ] **Step 3: Write minimal normalization implementation**

In `apps/web-vue/src/features/dashboard/api.ts`, replace the file with this structure:

```ts
import { joinApiPath, requestJson } from '../../shared/api';
import type { DashboardSummaryPayload } from '../../../../../types/dashboard';

function normalizeDashboardSummary(
  payload: Partial<DashboardSummaryPayload> | null | undefined,
): DashboardSummaryPayload {
  return {
    checkedAt: String(payload?.checkedAt || ''),
    server: {
      name: String(payload?.server?.name || ''),
      version: String(payload?.server?.version || ''),
      port: Number(payload?.server?.port || 0),
      pid: Number(payload?.server?.pid || 0),
      nodeVersion: String(payload?.server?.nodeVersion || ''),
      uptime: Number(payload?.server?.uptime || 0),
    },
    gateway: {
      port: Number(payload?.gateway?.port || 0),
      url: String(payload?.gateway?.url || ''),
      connected: payload?.gateway?.connected === true,
    },
    counts: {
      agents: Number(payload?.counts?.agents || 0),
      channels: Number(payload?.counts?.channels || 0),
      bindings: Number(payload?.counts?.bindings || 0),
      cronJobs: Number(payload?.counts?.cronJobs || 0),
      skills: Number(payload?.counts?.skills || 0),
      enabledSkills: Number(payload?.counts?.enabledSkills || 0),
    },
    transport: {
      mode: payload?.transport?.mode === 'gateway' ? 'gateway' : 'standalone',
      standalonePort: Number(payload?.transport?.standalonePort || 0),
      gatewayPort: Number(payload?.transport?.gatewayPort || 0),
      basePath: String(payload?.transport?.basePath || ''),
      entryUrl: String(payload?.transport?.entryUrl || ''),
      healthUrl: String(payload?.transport?.healthUrl || ''),
    },
    release: {
      currentVersion: String(payload?.release?.currentVersion || ''),
      latestVersion: payload?.release?.latestVersion ? String(payload.release.latestVersion) : null,
      updateAvailable: payload?.release?.updateAvailable === true,
      upgradeRunning: payload?.release?.upgradeRunning === true,
      upgradeStatus:
        payload?.release?.upgradeStatus === 'running' ||
        payload?.release?.upgradeStatus === 'succeeded' ||
        payload?.release?.upgradeStatus === 'failed'
          ? payload.release.upgradeStatus
          : 'idle',
      targetVersion: payload?.release?.targetVersion ? String(payload.release.targetVersion) : null,
      source: payload?.release?.source ? String(payload.release.source) : null,
    },
    bootstrap: {
      ready: payload?.bootstrap?.ready === true,
      errors: Number(payload?.bootstrap?.errors || 0),
      warnings: Number(payload?.bootstrap?.warnings || 0),
      fixable: Number(payload?.bootstrap?.fixable || 0),
    },
    deviceTrust: {
      helperConfigured: payload?.deviceTrust?.helperConfigured === true,
      helperPaired: payload?.deviceTrust?.helperPaired === true,
      pendingRequests: Number(payload?.deviceTrust?.pendingRequests || 0),
      autoApproveLocalHelper: payload?.deviceTrust?.autoApproveLocalHelper === true,
    },
    runtime: {
      installedCliCount: Number(payload?.runtime?.installedCliCount || 0),
      expectedCliCount: Number(payload?.runtime?.expectedCliCount || 0),
    },
    events: {
      recentFailures: Number(payload?.events?.recentFailures || 0),
      pendingAuditItems: Number(payload?.events?.pendingAuditItems || 0),
      recentRecoveries: Number(payload?.events?.recentRecoveries || 0),
      latestFailureTitle: payload?.events?.latestFailureTitle ? String(payload.events.latestFailureTitle) : null,
      latestAuditTitle: payload?.events?.latestAuditTitle ? String(payload.events.latestAuditTitle) : null,
      latestRecoveryTitle: payload?.events?.latestRecoveryTitle ? String(payload.events.latestRecoveryTitle) : null,
    },
    terminalWorkspace: {
      totalSessions: Number(payload?.terminalWorkspace?.totalSessions || 0),
      recoverableSessions: Number(payload?.terminalWorkspace?.recoverableSessions || 0),
      detachedSessions: Number(payload?.terminalWorkspace?.detachedSessions || 0),
      runningSessions: Number(payload?.terminalWorkspace?.runningSessions || 0),
      latestSessionId: payload?.terminalWorkspace?.latestSessionId ? String(payload.terminalWorkspace.latestSessionId) : null,
      latestSessionTitle: payload?.terminalWorkspace?.latestSessionTitle ? String(payload.terminalWorkspace.latestSessionTitle) : null,
      latestSessionUpdatedAt: payload?.terminalWorkspace?.latestSessionUpdatedAt ? String(payload.terminalWorkspace.latestSessionUpdatedAt) : null,
      latestCommandHint: payload?.terminalWorkspace?.latestCommandHint ? String(payload.terminalWorkspace.latestCommandHint) : null,
      latestError: payload?.terminalWorkspace?.latestError ? String(payload.terminalWorkspace.latestError) : null,
    },
    recovery: {
      total: Number(payload?.recovery?.total || 0),
      items: Array.isArray(payload?.recovery?.items) ? payload.recovery.items : [],
    },
    trends: {
      points: Array.isArray(payload?.trends?.points) ? payload.trends.points : [],
      panels: Array.isArray(payload?.trends?.panels) ? payload.trends.panels : [],
    },
    contextSummary: {
      riskStage:
        payload?.contextSummary?.riskStage === 'high' || payload?.contextSummary?.riskStage === 'medium'
          ? payload.contextSummary.riskStage
          : 'low',
      primaryHint: String(payload?.contextSummary?.primaryHint || ''),
      secondaryHint: String(payload?.contextSummary?.secondaryHint || ''),
    },
    domains: Array.isArray(payload?.domains) ? payload.domains : [],
  };
}

export async function fetchDashboardSummary(): Promise<DashboardSummaryPayload> {
  return normalizeDashboardSummary(
    await requestJson<DashboardSummaryPayload>('/api/dashboard/summary'),
  );
}
```

Keep `subscribeDashboardSummary(...)` but parse and pass normalized payloads:

```ts
      const payload = normalizeDashboardSummary(
        JSON.parse(String((event as MessageEvent).data || '')) as DashboardSummaryPayload,
      );
      onSummary(payload);
```

In `apps/web-vue/src/features/dashboard/overview-recipe.ts`, change the array-returning helpers to explicit array guards:

```ts
export function buildDashboardRecoveryItems(options: {
  payload: DashboardSummaryPayload | null;
  text: DashboardText;
}): DashboardRecoveryItem[] {
  return Array.isArray(options.payload?.recovery?.items) ? options.payload.recovery.items : [];
}

export function buildDashboardTrendPanels(options: {
  payload: DashboardSummaryPayload | null;
  text: DashboardText;
}): DashboardTrendPanel[] {
  const { payload } = options;
  return Array.isArray(payload?.trends?.panels) ? payload.trends.panels : [];
}

export function buildDashboardTrendPoints(options: {
  payload: DashboardSummaryPayload | null;
  text: DashboardText;
}): DashboardTrendPoint[] {
  const { payload } = options;
  return Array.isArray(payload?.trends?.points) ? payload.trends.points : [];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
cd /home/binbin/.openclaw/extensions/openclaw-studio/.worktrees/home-dashboard-context-panel && node --test tests/system/studio-web-dashboard-recipe.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/system/studio-web-dashboard-recipe.test.mjs apps/web-vue/src/features/dashboard/api.ts apps/web-vue/src/features/dashboard/overview-recipe.ts
git commit -m "fix: normalize dashboard payload collections"
```

### Task 3: Add failing frontend tests for non-blocking summary refresh behavior

**Files:**
- Modify: `tests/system/studio-web-home-layout-redesign.test.mjs`
- Modify: `apps/web-vue/src/features/dashboard/use-dashboard-summary.ts`
- Modify: `apps/web-vue/src/views/DashboardView.vue`

- [ ] **Step 1: Write the failing tests**

Add these assertions to `tests/system/studio-web-home-layout-redesign.test.mjs` inside the existing test:

```js
  assert.match(dashboardSummarySource, /const hasSummary = computed\(\(\) => summary\.value !== null\)/);
  assert.match(dashboardSummarySource, /if \(!silent\) \{[\s\S]*loading\.value = true;/);
  assert.match(dashboardSummarySource, /if \(!silent \|\| !summary\.value\) \{[\s\S]*errorMessage\.value =/);
  assert.match(dashboardSummarySource, /if \(consumerCount === 1\) \{[\s\S]*startDashboardSummary\(\);/);
  assert.match(dashboardSummarySource, /const refreshTimer =/);
  assert.match(dashboardView, /dashboardRecoveryItems\.length === 0/);
  assert.match(dashboardView, /dashboardTrendPanels\.length === 0/);
```

Add this new test block below the existing one:

```js
test("dashboard summary source preserves previous data during silent refreshes", () => {
  assert.match(
    dashboardSummarySource,
    /async function loadDashboardSummary\(silent = false\): Promise<void> \{[\s\S]*if \(!silent\) \{[\s\S]*loading\.value = true;[\s\S]*applyDashboardSummary\(await fetchDashboardSummary\(\), false\);[\s\S]*if \(!silent \|\| !summary\.value\) \{[\s\S]*errorMessage\.value =/,
  );
  assert.doesNotMatch(
    dashboardSummarySource,
    /if \(silent\) \{[\s\S]*summary\.value = null/,
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd /home/binbin/.openclaw/extensions/openclaw-studio/.worktrees/home-dashboard-context-panel && node --test tests/system/studio-web-home-layout-redesign.test.mjs
```

Expected: FAIL because the current source does not contain the stronger refresh-preservation contract checks.

- [ ] **Step 3: Write minimal composable/view implementation**

In `apps/web-vue/src/features/dashboard/use-dashboard-summary.ts`, keep the current structure but make the refresh intent explicit so the source matches the safety contract. The important implementation shape should be:

```ts
async function loadDashboardSummary(silent = false): Promise<void> {
  if (!silent) {
    loading.value = true;
  }
  try {
    applyDashboardSummary(await fetchDashboardSummary(), false);
  } catch (error) {
    streamConnected.value = false;
    if (!silent || !summary.value) {
      errorMessage.value =
        error instanceof Error ? error.message : fallbackErrorMessage();
    }
  } finally {
    if (!silent) {
      loading.value = false;
    }
  }
}
```

Keep the polling fallback and consumer reference counting. Do not clear `summary.value` during silent refresh failures.

In `apps/web-vue/src/views/DashboardView.vue`, keep the existing empty-state rendering but make sure the two critical sections still use direct empty checks on normalized collections:

```vue
<article v-if="dashboardRecoveryItems.length === 0" class="home-recovery-item tone-low">
```

```vue
<article v-if="dashboardTrendPanels.length === 0" class="home-trend-panel">
```

No broader layout refactor in this task.

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
cd /home/binbin/.openclaw/extensions/openclaw-studio/.worktrees/home-dashboard-context-panel && node --test tests/system/studio-web-home-layout-redesign.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/system/studio-web-home-layout-redesign.test.mjs apps/web-vue/src/features/dashboard/use-dashboard-summary.ts apps/web-vue/src/views/DashboardView.vue
git commit -m "fix: preserve dashboard summary during refresh"
```

### Task 4: Run final dashboard verification

**Files:**
- Modify: `tests/system/dashboard-service.test.mjs`
- Modify: `tests/system/studio-web-dashboard-recipe.test.mjs`
- Modify: `tests/system/studio-web-home-layout-redesign.test.mjs`
- Modify: `apps/api/modules/dashboard/service.ts`
- Modify: `apps/api/modules/dashboard/routes.ts`
- Modify: `apps/web-vue/src/features/dashboard/api.ts`
- Modify: `apps/web-vue/src/features/dashboard/use-dashboard-summary.ts`
- Modify: `apps/web-vue/src/features/dashboard/overview-recipe.ts`
- Modify: `apps/web-vue/src/views/DashboardView.vue`

- [ ] **Step 1: Run the focused Dashboard test suite**

Run:

```bash
cd /home/binbin/.openclaw/extensions/openclaw-studio/.worktrees/home-dashboard-context-panel && npm run build:api && node --test tests/system/dashboard-service.test.mjs tests/system/studio-web-dashboard-recipe.test.mjs tests/system/studio-web-home-layout-redesign.test.mjs
```

Expected: PASS for all tests.

- [ ] **Step 2: Run typecheck and web build**

Run:

```bash
cd /home/binbin/.openclaw/extensions/openclaw-studio/.worktrees/home-dashboard-context-panel && npm run typecheck --workspace=apps/web-vue && npm run build --workspace=apps/web-vue
```

Expected: both commands PASS.

- [ ] **Step 3: Rebuild graphify required by repo policy**

Run:

```bash
cd /home/binbin/.openclaw/extensions/openclaw-studio/.worktrees/home-dashboard-context-panel && python3.12 ~/.claude/graphify-rebuild.py .
```

Expected: `graphify-out/GRAPH_REPORT.md` regenerated without errors.

- [ ] **Step 4: Commit final dashboard startup fix**

```bash
git add tests/system/dashboard-service.test.mjs tests/system/studio-web-dashboard-recipe.test.mjs tests/system/studio-web-home-layout-redesign.test.mjs apps/api/modules/dashboard/service.ts apps/api/modules/dashboard/routes.ts apps/web-vue/src/features/dashboard/api.ts apps/web-vue/src/features/dashboard/use-dashboard-summary.ts apps/web-vue/src/features/dashboard/overview-recipe.ts apps/web-vue/src/views/DashboardView.vue graphify-out/GRAPH_REPORT.md graphify-out/graph.json
git commit -m "fix: speed up dashboard startup"
```

---

## Self-review

### Spec coverage
- **Snapshot-first backend summary:** Covered by Task 1.
- **Route-level snapshot serving and background refresh:** Covered by Task 1.
- **Frontend payload normalization:** Covered by Task 2.
- **Render safety for missing arrays:** Covered by Task 2 and Task 3.
- **Keep previous summary during refresh failures:** Covered by Task 3.
- **Focused verification and graphify rebuild:** Covered by Task 4.

### Placeholder scan
- No `TODO`, `TBD`, or “similar to Task N” placeholders remain.

### Type consistency
- The plan consistently uses `refreshSummary`, `buildSummary`, `normalizeDashboardSummary`, `DashboardSummaryPayload`, and the existing `loadDashboardSummary` naming.
