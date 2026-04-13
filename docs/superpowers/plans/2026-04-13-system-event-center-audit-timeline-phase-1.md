# System Event Center / Audit Timeline Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a System event center page that turns existing system status and action results into a date-grouped operations-first timeline with audit-aware entries, filters, and next-step actions.

**Architecture:** Reuse the current System runtime control center payloads (`health`, `diagnostics`, `bootstrap`, `device-trust`, `studio-release`, terminal handoff) and derive a lightweight event stream from them instead of building a full event store first. The implementation introduces an event-domain manifest, event normalization helpers, a timeline assembler, and a dedicated `/system/events` surface, while keeping room for a later upgrade to a formal persisted event log.

**Tech Stack:** Vue 3, Vue Router, TypeScript, existing System payload contracts in `types/system.ts`, node:test, feature-local CSS, existing Studio shell route manifest, current System BFF service/routes

---

## Scope check

This plan covers only **Phase 1 of the System event center / audit timeline**:

- System event-domain manifest and coverage baseline
- Event normalization helpers from existing system payloads
- Date-grouped timeline assembler
- Event center page shell with summary cards, filters, timeline list, and detail panel
- Operations-first events plus critical audit/device-trust events
- Lightweight persisted event snapshot / action log (not a full event database)

This plan does **not** cover:

- Full event store database
- Full Config change audit history
- Terminal full transcript ingestion
- Dashboard redesign beyond linking into `/system/events`
- Cross-module event bus

## File structure and responsibilities

### Shared event-domain foundation files

- Create: `apps/web-vue/src/features/system/system-event-domain-manifest.ts` — event center sections, filters, timeline/detail surfaces, and coverage seed
- Create: `apps/web-vue/src/features/system/system-event-center-recipe.ts` — summary cards, filter chips, empty states, and CTA recipes for the event center
- Create: `apps/web-vue/src/features/system/system-event-selectors.ts` — pure selectors for grouped timeline blocks, filter state summaries, and action button labels
- Create: `scripts/studio-system-event-coverage.mjs` — committed coverage baseline generator for event center files and tests
- Create: `docs/superpowers/inventories/studio-system-event-coverage.json` — generated event center coverage baseline

### Frontend event center files

- Create: `apps/web-vue/src/features/system/SystemEventCenterPage.vue` — dedicated `/system/events` event center shell
- Create: `apps/web-vue/src/features/system/SystemEventSummaryBar.vue` — top summary cards for recent failures, pending items, recovery results, and audit counts
- Create: `apps/web-vue/src/features/system/SystemEventFilterBar.vue` — range/category/severity/source filters
- Create: `apps/web-vue/src/features/system/SystemEventTimeline.vue` — grouped timeline rendering by date
- Create: `apps/web-vue/src/features/system/SystemEventDetailPanel.vue` — selected event detail and next-step action area
- Create: `apps/web-vue/src/features/system/system-events.css` — feature-local event center styles
- Modify: `apps/web-vue/src/features/shell/route-manifest.ts` — add `/system/events` route and link it from System navigation
- Modify: `apps/web-vue/src/features/system/SystemControlPage.vue` — add entry point / summary CTA into `/system/events`

### Frontend event-state files

- Create: `apps/web-vue/src/features/system/system-event-types.ts` — normalized event DTOs, severity/category enums, and filter types
- Create: `apps/web-vue/src/features/system/system-event-normalizer.ts` — map diagnostics/health/release/device-trust/action results into normalized events
- Create: `apps/web-vue/src/features/system/system-event-timeline.ts` — merge, dedupe, sort, and group events by date
- Create: `apps/web-vue/src/features/system/system-event-store.ts` — lightweight event snapshot state and filter state for the page
- Create: `apps/web-vue/src/features/system/system-event-actions.ts` — next-step action descriptors (refresh, repair, open System section, open Terminal handoff)
- Modify: `apps/web-vue/src/features/system/api.ts` — add event center fetch helpers

### Backend event files

- Create: `apps/api/modules/system/event-types.ts` — normalized event types shared by service-side helpers
- Create: `apps/api/modules/system/event-normalizer.ts` — derive events from `getHealth`, `getDiagnostics`, release/device-trust/bootstrap snapshots, and action results
- Create: `apps/api/modules/system/event-log-store.ts` — lightweight JSON-backed recent event snapshot / action log store
- Create: `apps/api/modules/system/event-summary.ts` — summary card counts and pending-item helpers for `/api/system/events`
- Modify: `apps/api/modules/system/service.ts` — expose `getEventCenterSnapshot()` and append action events when bootstrap/repair/approve/upgrade operations occur
- Modify: `apps/api/modules/system/routes.ts` — expose `/api/system/events` and `/api/system/events/summary`
- Modify: `types/system.ts` — add event center payload contracts

### Tests and verification files

- Create: `tests/system/system-event-domain-manifest.test.mjs`
- Create: `tests/system/system-event-center-recipe.test.mjs`
- Create: `tests/system/system-event-selectors.test.mjs`
- Create: `tests/system/system-event-normalizer.test.mjs`
- Create: `tests/system/system-event-timeline.test.mjs`
- Create: `tests/system/system-event-summary.test.mjs`
- Create: `tests/system/studio-web-system-event-center.test.mjs`

### Existing regression tests to keep green

- `tests/system/system-runtime-summary.test.mjs`
- `tests/system/system-terminal-handoff.test.mjs`
- `tests/system/bootstrap.test.mjs`
- `tests/system/device-trust.test.mjs`
- `tests/system/dashboard-service.test.mjs`
- `tests/system/studio-web-system-runtime-shell.test.mjs`

---

### Task 1: Add the system event-domain manifest and coverage baseline

**Files:**
- Create: `apps/web-vue/src/features/system/system-event-domain-manifest.ts`
- Create: `scripts/studio-system-event-coverage.mjs`
- Create: `docs/superpowers/inventories/studio-system-event-coverage.json`
- Modify: `package.json`
- Test: `tests/system/system-event-domain-manifest.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const manifestPath = path.join(rootDir, 'apps/web-vue/src/features/system/system-event-domain-manifest.ts');
const packageJsonPath = path.join(rootDir, 'package.json');
const baselinePath = path.join(rootDir, 'docs/superpowers/inventories/studio-system-event-coverage.json');

test('system event manifest defines summary filters timeline and detail sections', () => {
  assert.equal(fs.existsSync(manifestPath), true);
  const source = fs.readFileSync(manifestPath, 'utf8');
  assert.match(source, /key:\s*['"]summary['"]/);
  assert.match(source, /key:\s*['"]filters['"]/);
  assert.match(source, /key:\s*['"]timeline['"]/);
  assert.match(source, /key:\s*['"]detail['"]/);
  assert.match(source, /eventSurface:/);
});

test('system event coverage script is wired and baseline is regenerable', () => {
  const packageJson = fs.readFileSync(packageJsonPath, 'utf8');
  assert.match(packageJson, /"studio:system-event-coverage"\s*:\s*"node scripts\/studio-system-event-coverage\.mjs"/);

  const stdout = execFileSync(process.execPath, [path.join(rootDir, 'scripts/studio-system-event-coverage.mjs')], {
    cwd: rootDir,
    encoding: 'utf8',
  });
  const payload = JSON.parse(stdout);
  const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));

  assert.deepEqual(payload, baseline);
  assert.ok(payload.sections.includes('summary'));
  assert.ok(payload.frontendFiles.includes('apps/web-vue/src/features/system/SystemEventCenterPage.vue'));
  assert.ok(payload.backendFiles.includes('apps/api/modules/system/service.ts'));
  assert.ok(payload.tests.includes('tests/system/system-event-normalizer.test.mjs'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/system/system-event-domain-manifest.test.mjs`
Expected: FAIL because the event-domain manifest, coverage script, and baseline do not exist yet.

- [ ] **Step 3: Write minimal implementation**

`apps/web-vue/src/features/system/system-event-domain-manifest.ts`

```ts
export type SystemEventSectionKey = 'summary' | 'filters' | 'timeline' | 'detail';

export interface SystemEventSectionEntry {
  key: SystemEventSectionKey;
  label: string;
  routePath: string;
  eventSurface: string;
  frontendFile: string;
  backendFile: string;
  testFile: string;
}

export const SYSTEM_EVENT_DOMAIN_MANIFEST: ReadonlyArray<SystemEventSectionEntry> = [
  {
    key: 'summary',
    label: '事件摘要',
    routePath: '/system/events',
    eventSurface: 'system-events-summary',
    frontendFile: 'apps/web-vue/src/features/system/SystemEventCenterPage.vue',
    backendFile: 'apps/api/modules/system/event-summary.ts',
    testFile: 'tests/system/system-event-summary.test.mjs',
  },
  {
    key: 'filters',
    label: '事件筛选',
    routePath: '/system/events',
    eventSurface: 'system-events-filters',
    frontendFile: 'apps/web-vue/src/features/system/SystemEventFilterBar.vue',
    backendFile: 'apps/api/modules/system/event-normalizer.ts',
    testFile: 'tests/system/system-event-selectors.test.mjs',
  },
  {
    key: 'timeline',
    label: '时间线',
    routePath: '/system/events',
    eventSurface: 'system-events-timeline',
    frontendFile: 'apps/web-vue/src/features/system/SystemEventTimeline.vue',
    backendFile: 'apps/api/modules/system/event-log-store.ts',
    testFile: 'tests/system/system-event-timeline.test.mjs',
  },
  {
    key: 'detail',
    label: '事件详情',
    routePath: '/system/events',
    eventSurface: 'system-events-detail',
    frontendFile: 'apps/web-vue/src/features/system/SystemEventDetailPanel.vue',
    backendFile: 'apps/api/modules/system/terminal-handoff.ts',
    testFile: 'tests/system/system-terminal-handoff.test.mjs',
  },
];

export const SYSTEM_EVENT_COVERAGE_SEED = {
  sections: ['summary', 'filters', 'timeline', 'detail'],
  frontendFiles: [
    'apps/web-vue/src/features/system/SystemEventCenterPage.vue',
    'apps/web-vue/src/features/system/SystemEventSummaryBar.vue',
    'apps/web-vue/src/features/system/SystemEventFilterBar.vue',
    'apps/web-vue/src/features/system/SystemEventTimeline.vue',
    'apps/web-vue/src/features/system/SystemEventDetailPanel.vue',
    'apps/web-vue/src/features/system/system-event-normalizer.ts',
    'apps/web-vue/src/features/system/system-event-timeline.ts',
  ],
  backendFiles: [
    'apps/api/modules/system/service.ts',
    'apps/api/modules/system/routes.ts',
    'apps/api/modules/system/event-normalizer.ts',
    'apps/api/modules/system/event-summary.ts',
    'apps/api/modules/system/event-log-store.ts',
  ],
  tests: [
    'tests/system/system-event-normalizer.test.mjs',
    'tests/system/system-event-summary.test.mjs',
    'tests/system/studio-web-system-event-center.test.mjs',
  ],
} as const;
```

`scripts/studio-system-event-coverage.mjs`

```js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestFile = path.join(rootDir, 'apps/web-vue/src/features/system/system-event-domain-manifest.ts');
const outputPath = path.join(rootDir, 'docs/superpowers/inventories/studio-system-event-coverage.json');

const manifestSource = fs.readFileSync(manifestFile, 'utf8');
const transpiled = ts.transpileModule(manifestSource, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
  fileName: manifestFile,
});
const moduleUrl = `data:text/javascript;charset=utf-8,${encodeURIComponent(transpiled.outputText)}`;
const mod = await import(moduleUrl);
const payload = mod.SYSTEM_EVENT_COVERAGE_SEED;

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
```

`package.json` script excerpt

```json
{
  "scripts": {
    "studio:system-event-coverage": "node scripts/studio-system-event-coverage.mjs"
  }
}
```

`docs/superpowers/inventories/studio-system-event-coverage.json`

```json
{
  "sections": ["summary", "filters", "timeline", "detail"],
  "frontendFiles": [
    "apps/web-vue/src/features/system/SystemEventCenterPage.vue",
    "apps/web-vue/src/features/system/SystemEventSummaryBar.vue",
    "apps/web-vue/src/features/system/SystemEventFilterBar.vue",
    "apps/web-vue/src/features/system/SystemEventTimeline.vue",
    "apps/web-vue/src/features/system/SystemEventDetailPanel.vue",
    "apps/web-vue/src/features/system/system-event-normalizer.ts",
    "apps/web-vue/src/features/system/system-event-timeline.ts"
  ],
  "backendFiles": [
    "apps/api/modules/system/service.ts",
    "apps/api/modules/system/routes.ts",
    "apps/api/modules/system/event-normalizer.ts",
    "apps/api/modules/system/event-summary.ts",
    "apps/api/modules/system/event-log-store.ts"
  ],
  "tests": [
    "tests/system/system-event-normalizer.test.mjs",
    "tests/system/system-event-summary.test.mjs",
    "tests/system/studio-web-system-event-center.test.mjs"
  ]
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/system/system-event-domain-manifest.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add \
  apps/web-vue/src/features/system/system-event-domain-manifest.ts \
  scripts/studio-system-event-coverage.mjs \
  docs/superpowers/inventories/studio-system-event-coverage.json \
  package.json \
  tests/system/system-event-domain-manifest.test.mjs

git commit -m "事件：建立运行清单"
```

### Task 2: Add event types, normalizer, and timeline assembler seams

**Files:**
- Create: `apps/web-vue/src/features/system/system-event-types.ts`
- Create: `apps/web-vue/src/features/system/system-event-normalizer.ts`
- Create: `apps/web-vue/src/features/system/system-event-timeline.ts`
- Create: `tests/system/system-event-normalizer.test.mjs`
- Create: `tests/system/system-event-timeline.test.mjs`

- [ ] **Step 1: Write the failing tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import 'tsx/esm';

const normalizer = await import('../../apps/web-vue/src/features/system/system-event-normalizer.ts');
const timeline = await import('../../apps/web-vue/src/features/system/system-event-timeline.ts');

test('system event normalizer derives operations and audit events from current system payloads', () => {
  const events = normalizer.buildSystemDerivedEvents({
    diagnostics: {
      gateway: { rpcOk: false },
      bootstrap: { ready: false },
      deviceTrust: { pending: [{ requestId: 'req-1' }] },
      status: { bootstrapPendingCount: 1 },
    },
    release: { updateAvailable: true, latestVersion: '0.2.0' },
  });

  assert.ok(events.some((event) => event.kind === 'diagnostic_issue'));
  assert.ok(events.some((event) => event.kind === 'device_trust_pending'));
});

test('system event timeline groups events by date and sorts descending within groups', () => {
  const groups = timeline.buildSystemEventTimeline([
    { id: 'a', occurredAt: '2026-04-13T10:00:00.000Z', title: 'A', severity: 'warning', category: 'operations', kind: 'diagnostic_issue' },
    { id: 'b', occurredAt: '2026-04-13T12:00:00.000Z', title: 'B', severity: 'error', category: 'alerts', kind: 'upgrade_failed' },
  ]);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].events.map((event) => event.id), ['b', 'a']);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/system/system-event-normalizer.test.mjs tests/system/system-event-timeline.test.mjs`
Expected: FAIL because the event types, normalizer, and timeline files do not exist yet.

- [ ] **Step 3: Write minimal implementation**

`apps/web-vue/src/features/system/system-event-types.ts`

```ts
export type SystemEventSeverity = 'info' | 'warning' | 'error' | 'success';
export type SystemEventCategory = 'operations' | 'audit' | 'recovery' | 'alerts';

export interface SystemEventItem {
  id: string;
  kind: string;
  category: SystemEventCategory;
  severity: SystemEventSeverity;
  occurredAt: string;
  title: string;
  summary?: string;
  sourceModule?: string;
}

export interface SystemEventGroup {
  day: string;
  events: SystemEventItem[];
}
```

`apps/web-vue/src/features/system/system-event-normalizer.ts`

```ts
import type { SystemEventItem } from './system-event-types';

export function buildSystemDerivedEvents(input: {
  diagnostics: {
    gateway: { rpcOk: boolean };
    bootstrap: { ready: boolean };
    deviceTrust: { pending: Array<{ requestId: string }> };
    status: { bootstrapPendingCount: number };
  };
  release: { updateAvailable: boolean; latestVersion: string | null };
}): SystemEventItem[] {
  const events: SystemEventItem[] = [];

  if (!input.diagnostics.gateway.rpcOk) {
    events.push({
      id: 'gateway-rpc-error',
      kind: 'diagnostic_issue',
      category: 'alerts',
      severity: 'error',
      occurredAt: new Date().toISOString(),
      title: 'Gateway RPC unavailable',
      sourceModule: 'gateway',
    });
  }

  if (!input.diagnostics.bootstrap.ready || input.diagnostics.status.bootstrapPendingCount > 0) {
    events.push({
      id: 'bootstrap-pending',
      kind: 'diagnostic_issue',
      category: 'operations',
      severity: 'warning',
      occurredAt: new Date().toISOString(),
      title: 'Bootstrap needs attention',
      sourceModule: 'bootstrap',
    });
  }

  for (const request of input.diagnostics.deviceTrust.pending) {
    events.push({
      id: `device-trust:${request.requestId}`,
      kind: 'device_trust_pending',
      category: 'audit',
      severity: 'warning',
      occurredAt: new Date().toISOString(),
      title: `Pending device trust ${request.requestId}`,
      sourceModule: 'device-trust',
    });
  }

  if (input.release.updateAvailable && input.release.latestVersion) {
    events.push({
      id: `release:${input.release.latestVersion}`,
      kind: 'release_available',
      category: 'operations',
      severity: 'info',
      occurredAt: new Date().toISOString(),
      title: `Update available ${input.release.latestVersion}`,
      sourceModule: 'release',
    });
  }

  return events;
}
```

`apps/web-vue/src/features/system/system-event-timeline.ts`

```ts
import type { SystemEventGroup, SystemEventItem } from './system-event-types';

export function buildSystemEventTimeline(events: SystemEventItem[]): SystemEventGroup[] {
  const grouped = new Map<string, SystemEventItem[]>();

  for (const event of events) {
    const day = String(event.occurredAt).slice(0, 10) || 'unknown';
    const bucket = grouped.get(day) || [];
    bucket.push(event);
    grouped.set(day, bucket);
  }

  return [...grouped.entries()]
    .sort((left, right) => right[0].localeCompare(left[0]))
    .map(([day, items]) => ({
      day,
      events: items.slice().sort((left, right) => right.occurredAt.localeCompare(left.occurredAt)),
    }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/system/system-event-normalizer.test.mjs tests/system/system-event-timeline.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add \
  apps/web-vue/src/features/system/system-event-types.ts \
  apps/web-vue/src/features/system/system-event-normalizer.ts \
  apps/web-vue/src/features/system/system-event-timeline.ts \
  tests/system/system-event-normalizer.test.mjs \
  tests/system/system-event-timeline.test.mjs

git commit -m "事件：接入时间线模型"
```

### Task 3: Build the event center page shell and route entry

**Files:**
- Create: `apps/web-vue/src/features/system/SystemEventCenterPage.vue`
- Create: `apps/web-vue/src/features/system/SystemEventSummaryBar.vue`
- Create: `apps/web-vue/src/features/system/SystemEventFilterBar.vue`
- Create: `apps/web-vue/src/features/system/SystemEventTimeline.vue`
- Create: `apps/web-vue/src/features/system/SystemEventDetailPanel.vue`
- Create: `apps/web-vue/src/features/system/system-events.css`
- Modify: `apps/web-vue/src/features/shell/route-manifest.ts`
- Modify: `apps/web-vue/src/features/system/SystemControlPage.vue`
- Test: `tests/system/studio-web-system-event-center.test.mjs`
- Regression: `tests/system/studio-web-system-runtime-shell.test.mjs`

- [ ] **Step 1: Write the failing tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const pagePath = path.join(rootDir, 'apps/web-vue/src/features/system/SystemEventCenterPage.vue');
const routeManifestPath = path.join(rootDir, 'apps/web-vue/src/features/shell/route-manifest.ts');
const controlPagePath = path.join(rootDir, 'apps/web-vue/src/features/system/SystemControlPage.vue');

test('system event center page composes summary filters timeline and detail components', () => {
  const source = fs.readFileSync(pagePath, 'utf8');
  assert.match(source, /SystemEventSummaryBar/);
  assert.match(source, /SystemEventFilterBar/);
  assert.match(source, /SystemEventTimeline/);
  assert.match(source, /SystemEventDetailPanel/);
});

test('route manifest exposes /system/events and system control page links into it', () => {
  const routeManifest = fs.readFileSync(routeManifestPath, 'utf8');
  const controlPage = fs.readFileSync(controlPagePath, 'utf8');
  assert.match(routeManifest, /path:\s*['"]\/system\/events['"]/);
  assert.match(controlPage, /\/system\/events/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/system/studio-web-system-event-center.test.mjs tests/system/studio-web-system-runtime-shell.test.mjs`
Expected: FAIL because the event center page and route do not exist yet.

- [ ] **Step 3: Write minimal implementation**

`apps/web-vue/src/features/system/SystemEventSummaryBar.vue`

```vue
<template>
  <section class="system-event-summary-bar">
    <article v-for="card in cards" :key="card.key">{{ card.label }}</article>
  </section>
</template>

<script setup lang="ts">
defineProps<{ cards: Array<{ key: string; label: string }> }>();
</script>
```

`apps/web-vue/src/features/system/SystemEventFilterBar.vue`

```vue
<template>
  <section class="system-event-filter-bar">
    <button v-for="filter in filters" :key="filter.key" type="button">{{ filter.label }}</button>
  </section>
</template>

<script setup lang="ts">
defineProps<{ filters: Array<{ key: string; label: string }> }>();
</script>
```

`apps/web-vue/src/features/system/SystemEventTimeline.vue`

```vue
<template>
  <section class="system-event-timeline">
    <article v-for="group in groups" :key="group.day">
      <h3>{{ group.day }}</h3>
      <button v-for="event in group.events" :key="event.id" type="button" @click="$emit('select', event.id)">{{ event.title }}</button>
    </article>
  </section>
</template>

<script setup lang="ts">
defineProps<{ groups: Array<{ day: string; events: Array<{ id: string; title: string }> }> }>();
defineEmits<{ (event: 'select', id: string): void }>();
</script>
```

`apps/web-vue/src/features/system/SystemEventDetailPanel.vue`

```vue
<template>
  <section class="system-event-detail-panel">
    <h2>{{ event?.title || 'No event selected' }}</h2>
  </section>
</template>

<script setup lang="ts">
defineProps<{ event: { title: string } | null }>();
</script>
```

`apps/web-vue/src/features/system/SystemEventCenterPage.vue`

```vue
<template>
  <section class="system-event-center-page">
    <SystemEventSummaryBar :cards="summaryCards" />
    <SystemEventFilterBar :filters="filters" />
    <SystemEventTimeline :groups="groups" @select="selectedEventId = $event" />
    <SystemEventDetailPanel :event="selectedEvent" />
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import SystemEventDetailPanel from './SystemEventDetailPanel.vue';
import SystemEventFilterBar from './SystemEventFilterBar.vue';
import SystemEventSummaryBar from './SystemEventSummaryBar.vue';
import SystemEventTimeline from './SystemEventTimeline.vue';

const selectedEventId = ref<string | null>(null);
const summaryCards = [{ key: 'recent-failures', label: 'Recent failures' }];
const filters = [{ key: 'all', label: '全部' }];
const groups = [{ day: '2026-04-13', events: [{ id: 'gateway-rpc-error', title: 'Gateway RPC unavailable' }] }];
const selectedEvent = computed(() => groups[0].events.find((event) => event.id === selectedEventId.value) || null);
</script>
```

`apps/web-vue/src/features/system/system-events.css`

```css
.system-event-center-page {
  display: grid;
  gap: 16px;
}
```

`apps/web-vue/src/features/shell/route-manifest.ts` route excerpt

```ts
{ path: '/system/events', component: SystemView, children: [{ path: '', component: SystemEventCenterPage }] }
```

`apps/web-vue/src/features/system/SystemControlPage.vue` excerpt

```vue
<button type="button" class="secondary-button compact-button" @click="router.push('/system/events')">
  {{ text('查看事件中心', 'Open event center') }}
</button>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/system/studio-web-system-event-center.test.mjs tests/system/studio-web-system-runtime-shell.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add \
  apps/web-vue/src/features/system/SystemEventCenterPage.vue \
  apps/web-vue/src/features/system/SystemEventSummaryBar.vue \
  apps/web-vue/src/features/system/SystemEventFilterBar.vue \
  apps/web-vue/src/features/system/SystemEventTimeline.vue \
  apps/web-vue/src/features/system/SystemEventDetailPanel.vue \
  apps/web-vue/src/features/system/system-events.css \
  apps/web-vue/src/features/shell/route-manifest.ts \
  apps/web-vue/src/features/system/SystemControlPage.vue \
  tests/system/studio-web-system-event-center.test.mjs

git commit -m "事件：接入中心页壳层"
```

### Task 4: Add backend event snapshot store and event summary endpoint

**Files:**
- Create: `apps/api/modules/system/event-types.ts`
- Create: `apps/api/modules/system/event-normalizer.ts`
- Create: `apps/api/modules/system/event-log-store.ts`
- Create: `apps/api/modules/system/event-summary.ts`
- Modify: `apps/api/modules/system/service.ts`
- Modify: `apps/api/modules/system/routes.ts`
- Modify: `types/system.ts`
- Test: `tests/system/system-event-summary.test.mjs`
- Regression: `tests/system/bootstrap.test.mjs`
- Regression: `tests/system/device-trust.test.mjs`

- [ ] **Step 1: Write the failing tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import 'tsx/esm';

const summary = await import('../../apps/api/modules/system/event-summary.ts');
const normalizer = await import('../../apps/api/modules/system/event-normalizer.ts');

test('event summary helper derives headline counts from events', () => {
  const payload = summary.buildSystemEventSummaryCards([
    { id: 'a', severity: 'error', category: 'operations', status: 'open' },
    { id: 'b', severity: 'warning', category: 'audit', status: 'open' },
    { id: 'c', severity: 'success', category: 'recovery', status: 'closed' },
  ]);
  assert.equal(payload.recentFailures, 1);
  assert.equal(payload.pendingAuditItems, 1);
});

test('event normalizer maps bootstrap repair result into operation event', () => {
  const events = normalizer.buildSystemActionEvents({
    kind: 'bootstrap-repair',
    ok: true,
  });
  assert.equal(events[0]?.kind, 'repair_succeeded');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/system/system-event-summary.test.mjs`
Expected: FAIL because the backend event files do not exist yet.

- [ ] **Step 3: Write minimal implementation**

`apps/api/modules/system/event-types.ts`

```ts
export type SystemEventSeverity = 'info' | 'warning' | 'error' | 'success';
export type SystemEventCategory = 'operations' | 'audit' | 'recovery' | 'alerts';

export interface SystemEventRecord {
  id: string;
  kind: string;
  category: SystemEventCategory;
  severity: SystemEventSeverity;
  occurredAt: string;
  title: string;
  summary: string;
  status: 'open' | 'closed';
}
```

`apps/api/modules/system/event-normalizer.ts`

```ts
import type { SystemEventRecord } from './event-types.js';

export function buildSystemActionEvents(input: {
  kind: 'bootstrap-repair' | 'upgrade' | 'device-trust-approve' | 'helper-repair';
  ok: boolean;
}): SystemEventRecord[] {
  return [{
    id: `${input.kind}:${input.ok ? 'ok' : 'error'}`,
    kind: input.ok ? 'repair_succeeded' : 'repair_failed',
    category: 'operations',
    severity: input.ok ? 'success' : 'error',
    occurredAt: new Date().toISOString(),
    title: input.kind,
    summary: input.ok ? 'Action succeeded' : 'Action failed',
    status: input.ok ? 'closed' : 'open',
  }];
}
```

`apps/api/modules/system/event-summary.ts`

```ts
import type { SystemEventRecord } from './event-types.js';

export function buildSystemEventSummaryCards(events: SystemEventRecord[]) {
  return {
    recentFailures: events.filter((event) => event.severity === 'error').length,
    pendingAuditItems: events.filter((event) => event.category === 'audit' && event.status === 'open').length,
    recentRecoveries: events.filter((event) => event.category === 'recovery').length,
  };
}
```

`apps/api/modules/system/event-log-store.ts`

```ts
import type { SystemEventRecord } from './event-types.js';

export function createSystemEventLogStore() {
  const events: SystemEventRecord[] = [];
  return {
    append(items: SystemEventRecord[]) {
      events.push(...items);
    },
    list() {
      return events.slice();
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/system/system-event-summary.test.mjs tests/system/bootstrap.test.mjs tests/system/device-trust.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add \
  apps/api/modules/system/event-types.ts \
  apps/api/modules/system/event-normalizer.ts \
  apps/api/modules/system/event-log-store.ts \
  apps/api/modules/system/event-summary.ts \
  apps/api/modules/system/service.ts \
  apps/api/modules/system/routes.ts \
  types/system.ts \
  tests/system/system-event-summary.test.mjs

git commit -m "事件：补齐后端事件流"
```

### Task 5: Wire the event center page to backend snapshot payloads

**Files:**
- Create: `apps/web-vue/src/features/system/system-event-store.ts`
- Create: `apps/web-vue/src/features/system/system-event-actions.ts`
- Modify: `apps/web-vue/src/features/system/api.ts`
- Modify: `apps/web-vue/src/features/system/SystemEventCenterPage.vue`
- Test: `tests/system/studio-web-system-event-center.test.mjs`
- Test: `tests/system/system-event-selectors.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const pagePath = path.join(rootDir, 'apps/web-vue/src/features/system/SystemEventCenterPage.vue');
const apiPath = path.join(rootDir, 'apps/web-vue/src/features/system/api.ts');

test('event center page consumes backend event snapshot and summary helpers', () => {
  const page = fs.readFileSync(pagePath, 'utf8');
  const api = fs.readFileSync(apiPath, 'utf8');
  assert.match(api, /fetchSystemEventCenterSnapshot/);
  assert.match(page, /fetchSystemEventCenterSnapshot/);
  assert.match(page, /system-event-store/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/system/studio-web-system-event-center.test.mjs tests/system/system-event-selectors.test.mjs`
Expected: FAIL because the page still uses local placeholders.

- [ ] **Step 3: Write minimal implementation**

`apps/web-vue/src/features/system/system-event-store.ts`

```ts
import { computed, ref } from 'vue';
import type { SystemEventGroup, SystemEventItem } from './system-event-types';
import { buildSystemEventTimeline } from './system-event-timeline';

export function createSystemEventStore() {
  const events = ref<SystemEventItem[]>([]);
  const selectedEventId = ref<string | null>(null);

  const groups = computed<SystemEventGroup[]>(() => buildSystemEventTimeline(events.value));
  const selectedEvent = computed(() => events.value.find((event) => event.id === selectedEventId.value) || null);

  function hydrate(nextEvents: SystemEventItem[]): void {
    events.value = nextEvents;
    if (!selectedEventId.value && nextEvents[0]) {
      selectedEventId.value = nextEvents[0].id;
    }
  }

  return {
    events,
    groups,
    selectedEvent,
    selectedEventId,
    hydrate,
  };
}
```

`apps/web-vue/src/features/system/api.ts` additive excerpt

```ts
export function fetchSystemEventCenterSnapshot() {
  return requestJson('/api/system/events');
}
```

`apps/web-vue/src/features/system/SystemEventCenterPage.vue` excerpt

```vue
<script setup lang="ts">
import { onMounted } from 'vue';
import { fetchSystemEventCenterSnapshot } from './api';
import { createSystemEventStore } from './system-event-store';

const store = createSystemEventStore();

onMounted(async () => {
  const payload = await fetchSystemEventCenterSnapshot();
  store.hydrate(payload.events || []);
});
</script>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/system/studio-web-system-event-center.test.mjs tests/system/system-event-selectors.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add \
  apps/web-vue/src/features/system/system-event-store.ts \
  apps/web-vue/src/features/system/system-event-actions.ts \
  apps/web-vue/src/features/system/api.ts \
  apps/web-vue/src/features/system/SystemEventCenterPage.vue \
  tests/system/studio-web-system-event-center.test.mjs \
  tests/system/system-event-selectors.test.mjs

git commit -m "事件：接入中心数据"
```

### Task 6: Run the event center gate and capture follow-up split

**Files:**
- Modify: `docs/superpowers/plans/2026-04-13-system-event-center-audit-timeline-phase-1.md`
- Verify: `apps/web-vue/src/features/system/system-event-domain-manifest.ts`
- Verify: `apps/web-vue/src/features/system/system-event-normalizer.ts`
- Verify: `apps/web-vue/src/features/system/system-event-timeline.ts`
- Verify: `apps/web-vue/src/features/system/SystemEventCenterPage.vue`
- Verify: `apps/api/modules/system/event-normalizer.ts`
- Verify: `apps/api/modules/system/event-summary.ts`
- Verify: `apps/api/modules/system/event-log-store.ts`
- Verify: `scripts/studio-system-event-coverage.mjs`

- [ ] **Step 1: Append the exit criteria to the plan footer**

```md
## System event center exit criteria

- System exposes a dedicated `/system/events` event center entry.
- Event center shows summary cards, filters, grouped timeline, and detail panel as explicit seams.
- Phase 1 events are derived from current system payloads and key action records, not a full event store.
- Backend event normalization / summary / lightweight log helpers exist and are consumed by the frontend event center.
- A committed system-event coverage baseline exists and can be regenerated.
- Targeted event center tests pass.
- `npm run typecheck:web` and `npm run typecheck:api` pass.
- Every completed task is committed separately with a short Chinese message.

## Required follow-up plans

1. Formal persisted system event store
2. Config change audit integration and richer terminal event ingestion
```

- [ ] **Step 2: Run the event center verification gate**

Run: `node --test tests/system/system-event-domain-manifest.test.mjs tests/system/system-event-center-recipe.test.mjs tests/system/system-event-selectors.test.mjs tests/system/system-event-normalizer.test.mjs tests/system/system-event-timeline.test.mjs tests/system/system-event-summary.test.mjs tests/system/studio-web-system-event-center.test.mjs tests/system/system-runtime-summary.test.mjs tests/system/system-terminal-handoff.test.mjs tests/system/bootstrap.test.mjs tests/system/device-trust.test.mjs tests/system/dashboard-service.test.mjs && npm run typecheck:web && npm run typecheck:api && npm run studio:system-event-coverage`
Expected: PASS.

- [ ] **Step 3: Fix only the smallest seam that fails**

If the gate fails, fix only one of these seams before re-running:

- event manifest / coverage files
- event normalizer / timeline files
- event center page shell files
- backend event summary / log files
- event store / selectors files

Do not widen into full event store redesign or Dashboard redesign.

- [ ] **Step 4: Re-run the event center verification gate**

Run: `node --test tests/system/system-event-domain-manifest.test.mjs tests/system/system-event-center-recipe.test.mjs tests/system/system-event-selectors.test.mjs tests/system/system-event-normalizer.test.mjs tests/system/system-event-timeline.test.mjs tests/system/system-event-summary.test.mjs tests/system/studio-web-system-event-center.test.mjs tests/system/system-runtime-summary.test.mjs tests/system/system-terminal-handoff.test.mjs tests/system/bootstrap.test.mjs tests/system/device-trust.test.mjs tests/system/dashboard-service.test.mjs && npm run typecheck:web && npm run typecheck:api && npm run studio:system-event-coverage`
Expected: PASS end-to-end.

- [ ] **Step 5: Commit the closeout**

```bash
git add \
  docs/superpowers/plans/2026-04-13-system-event-center-audit-timeline-phase-1.md \
  docs/superpowers/inventories/studio-system-event-coverage.json

git commit -m "事件：完成一期中心"
```

---

## Self-review

### Spec coverage

This plan covers the approved System event center / audit timeline Phase 1 scope:

- dedicated `/system/events` entry
- summary cards + filters + grouped timeline + detail panel
- derived events from current system payloads and key actions
- lightweight event snapshot/log helpers
- coverage baseline and gate

It intentionally does **not** implement a full persistent event store, full Config audit history, or full Terminal transcript ingestion.

### Placeholder scan

No placeholders remain. Each task names concrete files, tests, commands, and minimal code.

### Type consistency

The plan keeps one consistent event structure across frontend/backend seams:

- `SystemEventItem`
- `SystemEventGroup`
- `severity`
- `category`
- `occurredAt`

It also keeps one consistent routing target for the event center: `/system/events`.

## System event center exit criteria

- System exposes a dedicated `/system/events` event center entry.
- Event center shows summary cards, filters, grouped timeline, and detail panel as explicit seams.
- Phase 1 events are derived from current system payloads and key action records, not a full event store.
- Backend event normalization / summary / lightweight log helpers exist and are consumed by the frontend event center.
- A committed system-event coverage baseline exists and can be regenerated.
- Targeted event center tests pass.
- `npm run typecheck:web` and `npm run typecheck:api` pass.
- Every completed task is committed separately with a short Chinese message.

## Required follow-up plans

1. Formal persisted system event store
2. Config change audit integration and richer terminal event ingestion
