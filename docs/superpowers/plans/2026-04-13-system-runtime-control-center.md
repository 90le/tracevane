# System Runtime Control Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the existing System page into a clearer runtime control center with explicit section manifests, page-level recipes/selectors, and a System ↔ Terminal action handoff seam that does not overlap Dashboard or Config.

**Architecture:** Keep the current system APIs (`health`, `diagnostics`, `bootstrap`, `device-trust`, `studio-release`) and existing `SystemControlPage.vue` as the functional base, but split the page into a shell + section recipes + selectors + action handoff helpers. This plan does not rebuild System from scratch; it restructures the current implementation into a clearer runtime control center and prepares stable seams for later System / Terminal integration work.

**Tech Stack:** Vue 3, Vue Router, TypeScript, existing Studio system BFF routes, existing `types/system.ts` contracts, node:test, feature-local CSS, current shell route manifest

---

## Scope check

This plan covers only the **System runtime control center refinement** slice from the approved System / Terminal design:

- System runtime-domain manifest and coverage baseline
- System shell overview recipe and section selectors
- System page shell decomposition (health / diagnostics / control / release / environment)
- System → Terminal action handoff seam
- Explicit action summary / event summary helpers for the current System page

This plan does **not** cover:

- Terminal workspace implementation (already completed in Terminal Phase A)
- Full cross-device takeover UX inside System
- Dashboard redesign
- Config redesign
- Full event-center or audit-center rebuild

## File structure and responsibilities

### Shared system-domain foundation files

- Create: `apps/web-vue/src/features/system/system-runtime-domain-manifest.ts` — section list, route identity, and coverage seed for System runtime control center
- Create: `apps/web-vue/src/features/system/system-overview-recipe.ts` — overview cards, quick actions, event summary cards, and section entry recipe
- Create: `apps/web-vue/src/features/system/system-stage-selectors.ts` — pure selectors for section header, health summary, diagnostics summary, control action summary, and terminal handoff state
- Create: `scripts/studio-system-runtime-coverage.mjs` — committed coverage baseline generator for system runtime files and tests
- Create: `docs/superpowers/inventories/studio-system-runtime-coverage.json` — generated system runtime coverage baseline

### Frontend system shell files

- Modify: `apps/web-vue/src/features/system/SystemControlPage.vue` — shrink into section shell orchestration that consumes the new recipes/selectors instead of owning all derived state inline
- Create: `apps/web-vue/src/features/system/SystemOverviewPanel.vue` — top summary panel for health/runtime/release/device-trust cards
- Create: `apps/web-vue/src/features/system/SystemSectionRail.vue` — explicit section/tab rail for overview / release / gateway / bootstrap / diagnostics / environment
- Create: `apps/web-vue/src/features/system/SystemActionHandoffPanel.vue` — limited direct actions + terminal handoff affordances
- Create: `apps/web-vue/src/features/system/system-terminal-handoff.ts` — handoff payload builder for routing into `/terminal/:sessionId`

### Frontend system state files

- Create: `apps/web-vue/src/features/system/system-runtime-view-model.ts` — page-level composition for health/diagnostics/release/device-trust payloads and section state
- Create: `apps/web-vue/src/features/system/system-event-summary.ts` — derive key recent system events / warnings / release notes into UI summary blocks
- Modify: `apps/web-vue/src/features/system/api.ts` — add minimal terminal handoff helper API only if the final frontend handoff needs a dedicated backend endpoint; otherwise keep current endpoints unchanged

### Backend system files

- Create: `apps/api/modules/system/runtime-summary.ts` — shared summary helper for health/diagnostics/release/device-trust/system action state
- Create: `apps/api/modules/system/terminal-handoff.ts` — helper for building terminal handoff payloads or suggestions from system actions
- Modify: `apps/api/modules/system/service.ts` — consume system summary helpers and expose a small `getTerminalActionSuggestions()` payload if needed
- Modify: `apps/api/modules/system/routes.ts` — expose any small terminal handoff endpoint only if the frontend needs it

### Tests and verification files

- Create: `tests/system/system-runtime-domain-manifest.test.mjs`
- Create: `tests/system/system-overview-recipe.test.mjs`
- Create: `tests/system/system-stage-selectors.test.mjs`
- Create: `tests/system/system-runtime-summary.test.mjs`
- Create: `tests/system/system-terminal-handoff.test.mjs`
- Create: `tests/system/studio-web-system-runtime-shell.test.mjs`

### Existing regression tests to keep green

- `tests/system/dashboard-service.test.mjs`
- `tests/system/bootstrap.test.mjs`
- `tests/system/device-trust.test.mjs`
- `tests/system/studio-web-page-chrome-density.test.mjs`
- any existing `types/system.ts`-driven runtime tests that touch current payload shapes

---

### Task 1: Add the system runtime-domain manifest and coverage baseline

**Files:**
- Create: `apps/web-vue/src/features/system/system-runtime-domain-manifest.ts`
- Create: `scripts/studio-system-runtime-coverage.mjs`
- Create: `docs/superpowers/inventories/studio-system-runtime-coverage.json`
- Modify: `package.json`
- Test: `tests/system/system-runtime-domain-manifest.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const manifestPath = path.join(rootDir, 'apps/web-vue/src/features/system/system-runtime-domain-manifest.ts');
const packageJsonPath = path.join(rootDir, 'package.json');
const baselinePath = path.join(rootDir, 'docs/superpowers/inventories/studio-system-runtime-coverage.json');

test('system runtime manifest defines overview release gateway bootstrap diagnostics environment sections', () => {
  assert.equal(fs.existsSync(manifestPath), true);
  const source = fs.readFileSync(manifestPath, 'utf8');
  assert.match(source, /key:\s*['"]overview['"]/);
  assert.match(source, /key:\s*['"]release['"]/);
  assert.match(source, /key:\s*['"]gateway['"]/);
  assert.match(source, /key:\s*['"]bootstrap['"]/);
  assert.match(source, /key:\s*['"]diagnostics['"]/);
  assert.match(source, /key:\s*['"]environment['"]/);
  assert.match(source, /runtimeSurface:/);
});

test('system runtime coverage script is wired and baseline is regenerable', () => {
  const packageJson = fs.readFileSync(packageJsonPath, 'utf8');
  assert.match(packageJson, /"studio:system-runtime-coverage"\s*:\s*"node scripts\/studio-system-runtime-coverage\.mjs"/);

  const stdout = execFileSync(process.execPath, [path.join(rootDir, 'scripts/studio-system-runtime-coverage.mjs')], {
    cwd: rootDir,
    encoding: 'utf8',
  });
  const payload = JSON.parse(stdout);
  const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));

  assert.deepEqual(payload, baseline);
  assert.ok(payload.sections.includes('overview'));
  assert.ok(payload.frontendFiles.includes('apps/web-vue/src/features/system/SystemControlPage.vue'));
  assert.ok(payload.backendFiles.includes('apps/api/modules/system/service.ts'));
  assert.ok(payload.tests.includes('tests/system/system-runtime-summary.test.mjs'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/system/system-runtime-domain-manifest.test.mjs`
Expected: FAIL because the system runtime manifest, coverage script, and baseline do not exist yet.

- [ ] **Step 3: Write minimal implementation**

`apps/web-vue/src/features/system/system-runtime-domain-manifest.ts`

```ts
export type SystemRuntimeSectionKey =
  | 'overview'
  | 'release'
  | 'gateway'
  | 'bootstrap'
  | 'diagnostics'
  | 'environment';

export interface SystemRuntimeSectionEntry {
  key: SystemRuntimeSectionKey;
  label: string;
  routePath: string;
  runtimeSurface: string;
  frontendFile: string;
  backendFile: string;
  testFile: string;
}

export const SYSTEM_RUNTIME_DOMAIN_MANIFEST: ReadonlyArray<SystemRuntimeSectionEntry> = [
  {
    key: 'overview',
    label: '系统概览',
    routePath: '/system',
    runtimeSurface: 'system-overview',
    frontendFile: 'apps/web-vue/src/features/system/SystemControlPage.vue',
    backendFile: 'apps/api/modules/system/service.ts',
    testFile: 'tests/system/system-runtime-summary.test.mjs',
  },
  {
    key: 'release',
    label: '版本升级',
    routePath: '/system',
    runtimeSurface: 'system-release',
    frontendFile: 'apps/web-vue/src/features/system/SystemOverviewPanel.vue',
    backendFile: 'apps/api/modules/system/service.ts',
    testFile: 'tests/system/system-overview-recipe.test.mjs',
  },
  {
    key: 'gateway',
    label: 'Gateway',
    routePath: '/system',
    runtimeSurface: 'system-gateway',
    frontendFile: 'apps/web-vue/src/features/system/SystemSectionRail.vue',
    backendFile: 'apps/api/modules/system/runtime-summary.ts',
    testFile: 'tests/system/system-stage-selectors.test.mjs',
  },
  {
    key: 'bootstrap',
    label: '引导修复',
    routePath: '/system',
    runtimeSurface: 'system-bootstrap',
    frontendFile: 'apps/web-vue/src/features/system/SystemActionHandoffPanel.vue',
    backendFile: 'apps/api/modules/system/service.ts',
    testFile: 'tests/system/bootstrap.test.mjs',
  },
  {
    key: 'diagnostics',
    label: '诊断输出',
    routePath: '/system',
    runtimeSurface: 'system-diagnostics',
    frontendFile: 'apps/web-vue/src/features/system/system-runtime-view-model.ts',
    backendFile: 'apps/api/modules/system/runtime-summary.ts',
    testFile: 'tests/system/studio-web-system-runtime-shell.test.mjs',
  },
  {
    key: 'environment',
    label: '环境与信任',
    routePath: '/system',
    runtimeSurface: 'system-environment',
    frontendFile: 'apps/web-vue/src/features/system/system-terminal-handoff.ts',
    backendFile: 'apps/api/modules/system/terminal-handoff.ts',
    testFile: 'tests/system/system-terminal-handoff.test.mjs',
  },
];

export const SYSTEM_RUNTIME_COVERAGE_SEED = {
  sections: ['overview', 'release', 'gateway', 'bootstrap', 'diagnostics', 'environment'],
  frontendFiles: [
    'apps/web-vue/src/features/system/SystemControlPage.vue',
    'apps/web-vue/src/features/system/SystemOverviewPanel.vue',
    'apps/web-vue/src/features/system/SystemSectionRail.vue',
    'apps/web-vue/src/features/system/SystemActionHandoffPanel.vue',
    'apps/web-vue/src/features/system/system-runtime-view-model.ts',
    'apps/web-vue/src/features/system/system-overview-recipe.ts',
    'apps/web-vue/src/features/system/system-stage-selectors.ts',
  ],
  backendFiles: [
    'apps/api/modules/system/service.ts',
    'apps/api/modules/system/routes.ts',
    'apps/api/modules/system/runtime-summary.ts',
    'apps/api/modules/system/terminal-handoff.ts',
  ],
  tests: [
    'tests/system/system-runtime-summary.test.mjs',
    'tests/system/system-terminal-handoff.test.mjs',
    'tests/system/studio-web-system-runtime-shell.test.mjs',
  ],
} as const;
```

`scripts/studio-system-runtime-coverage.mjs`

```js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestFile = path.join(rootDir, 'apps/web-vue/src/features/system/system-runtime-domain-manifest.ts');
const outputPath = path.join(rootDir, 'docs/superpowers/inventories/studio-system-runtime-coverage.json');

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
const payload = mod.SYSTEM_RUNTIME_COVERAGE_SEED;

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
```

`package.json` script excerpt

```json
{
  "scripts": {
    "studio:system-runtime-coverage": "node scripts/studio-system-runtime-coverage.mjs"
  }
}
```

`docs/superpowers/inventories/studio-system-runtime-coverage.json`

```json
{
  "sections": ["overview", "release", "gateway", "bootstrap", "diagnostics", "environment"],
  "frontendFiles": [
    "apps/web-vue/src/features/system/SystemControlPage.vue",
    "apps/web-vue/src/features/system/SystemOverviewPanel.vue",
    "apps/web-vue/src/features/system/SystemSectionRail.vue",
    "apps/web-vue/src/features/system/SystemActionHandoffPanel.vue",
    "apps/web-vue/src/features/system/system-runtime-view-model.ts",
    "apps/web-vue/src/features/system/system-overview-recipe.ts",
    "apps/web-vue/src/features/system/system-stage-selectors.ts"
  ],
  "backendFiles": [
    "apps/api/modules/system/service.ts",
    "apps/api/modules/system/routes.ts",
    "apps/api/modules/system/runtime-summary.ts",
    "apps/api/modules/system/terminal-handoff.ts"
  ],
  "tests": [
    "tests/system/system-runtime-summary.test.mjs",
    "tests/system/system-terminal-handoff.test.mjs",
    "tests/system/studio-web-system-runtime-shell.test.mjs"
  ]
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/system/system-runtime-domain-manifest.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add \
  apps/web-vue/src/features/system/system-runtime-domain-manifest.ts \
  scripts/studio-system-runtime-coverage.mjs \
  docs/superpowers/inventories/studio-system-runtime-coverage.json \
  package.json \
  tests/system/system-runtime-domain-manifest.test.mjs

git commit -m "系统：建立运行域清单"
```

### Task 2: Extract System overview recipe and section rail selectors

**Files:**
- Create: `apps/web-vue/src/features/system/system-overview-recipe.ts`
- Create: `apps/web-vue/src/features/system/system-stage-selectors.ts`
- Create: `apps/web-vue/src/features/system/SystemOverviewPanel.vue`
- Create: `apps/web-vue/src/features/system/SystemSectionRail.vue`
- Modify: `apps/web-vue/src/features/system/SystemControlPage.vue`
- Test: `tests/system/system-overview-recipe.test.mjs`
- Test: `tests/system/system-stage-selectors.test.mjs`
- Test: `tests/system/studio-web-system-runtime-shell.test.mjs`

- [ ] **Step 1: Write the failing tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const recipePath = path.join(rootDir, 'apps/web-vue/src/features/system/system-overview-recipe.ts');
const selectorsPath = path.join(rootDir, 'apps/web-vue/src/features/system/system-stage-selectors.ts');
const controlPagePath = path.join(rootDir, 'apps/web-vue/src/features/system/SystemControlPage.vue');

test('system overview recipe exposes summary cards quick actions and event summaries', () => {
  assert.equal(fs.existsSync(recipePath), true);
  const source = fs.readFileSync(recipePath, 'utf8');
  assert.match(source, /buildSystemOverviewCards/);
  assert.match(source, /buildSystemQuickActions/);
  assert.match(source, /buildSystemEventSummaryItems/);
});

test('system stage selectors expose stage header and health summary selectors', () => {
  assert.equal(fs.existsSync(selectorsPath), true);
  const source = fs.readFileSync(selectorsPath, 'utf8');
  assert.match(source, /buildSystemStageHeader/);
  assert.match(source, /buildSystemHealthSummary/);
  assert.match(source, /buildSystemControlActionSummary/);
});

test('system control page consumes overview recipe and stage selectors', () => {
  const source = fs.readFileSync(controlPagePath, 'utf8');
  assert.match(source, /system-overview-recipe/);
  assert.match(source, /system-stage-selectors/);
  assert.match(source, /SystemOverviewPanel/);
  assert.match(source, /SystemSectionRail/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/system/system-overview-recipe.test.mjs tests/system/system-stage-selectors.test.mjs tests/system/studio-web-system-runtime-shell.test.mjs`
Expected: FAIL because the recipe/selectors/components do not exist yet.

- [ ] **Step 3: Write minimal implementation**

`apps/web-vue/src/features/system/system-overview-recipe.ts`

```ts
export function buildSystemOverviewCards(input: {
  healthLabel: string;
  gatewayLabel: string;
  diagnosticsLabel: string;
}) {
  return [
    { key: 'health', label: input.healthLabel },
    { key: 'gateway', label: input.gatewayLabel },
    { key: 'diagnostics', label: input.diagnosticsLabel },
  ];
}

export function buildSystemQuickActions(text: (zh: string, en: string) => string) {
  return [
    { key: 'refresh-diagnostics', label: text('刷新诊断', 'Refresh diagnostics') },
    { key: 'open-terminal', label: text('去终端', 'Open Terminal') },
  ];
}

export function buildSystemEventSummaryItems(input: {
  latestUpgradeLabel: string;
  latestTrustLabel: string;
}) {
  return [
    { key: 'upgrade', label: input.latestUpgradeLabel },
    { key: 'device-trust', label: input.latestTrustLabel },
  ];
}
```

`apps/web-vue/src/features/system/system-stage-selectors.ts`

```ts
export function buildSystemStageHeader(input: {
  title: string;
  subtitle: string;
}) {
  return {
    title: input.title,
    subtitle: input.subtitle,
  };
}

export function buildSystemHealthSummary(input: {
  gatewayConnected: boolean;
  serviceState: string;
  pendingDiagnostics: number;
}) {
  return {
    gatewayConnected: input.gatewayConnected,
    serviceState: input.serviceState,
    pendingDiagnostics: input.pendingDiagnostics,
  };
}

export function buildSystemControlActionSummary(input: {
  canRepairBootstrap: boolean;
  canOpenTerminal: boolean;
}) {
  return {
    canRepairBootstrap: input.canRepairBootstrap,
    canOpenTerminal: input.canOpenTerminal,
  };
}
```

`apps/web-vue/src/features/system/SystemOverviewPanel.vue`

```vue
<template>
  <section class="system-overview-panel">
    <article v-for="card in cards" :key="card.key" class="system-overview-panel__card">
      {{ card.label }}
    </article>
  </section>
</template>

<script setup lang="ts">
defineProps<{ cards: Array<{ key: string; label: string }> }>();
</script>
```

`apps/web-vue/src/features/system/SystemSectionRail.vue`

```vue
<template>
  <nav class="system-section-rail">
    <button
      v-for="section in sections"
      :key="section.id"
      type="button"
      class="system-section-rail__tab"
      :class="{ active: section.id === activeSection }"
      @click="$emit('select', section.id)"
    >
      {{ section.label }}
    </button>
  </nav>
</template>

<script setup lang="ts">
defineProps<{
  sections: Array<{ id: string; label: string }>;
  activeSection: string;
}>();
defineEmits<{ (event: 'select', id: string): void }>();
</script>
```

`apps/web-vue/src/features/system/SystemControlPage.vue` script/template excerpt

```vue
<template>
  <section class="system-page-shell">
    <SystemOverviewPanel :cards="overviewCards" />
    <SystemSectionRail
      :sections="sections"
      :active-section="activeTab"
      @select="activeTab = $event"
    />
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import SystemOverviewPanel from './SystemOverviewPanel.vue';
import SystemSectionRail from './SystemSectionRail.vue';
import {
  buildSystemEventSummaryItems,
  buildSystemOverviewCards,
  buildSystemQuickActions,
} from './system-overview-recipe';
import {
  buildSystemControlActionSummary,
  buildSystemHealthSummary,
  buildSystemStageHeader,
} from './system-stage-selectors';
</script>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/system/system-overview-recipe.test.mjs tests/system/system-stage-selectors.test.mjs tests/system/studio-web-system-runtime-shell.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add \
  apps/web-vue/src/features/system/system-overview-recipe.ts \
  apps/web-vue/src/features/system/system-stage-selectors.ts \
  apps/web-vue/src/features/system/SystemOverviewPanel.vue \
  apps/web-vue/src/features/system/SystemSectionRail.vue \
  apps/web-vue/src/features/system/SystemControlPage.vue \
  tests/system/system-overview-recipe.test.mjs \
  tests/system/system-stage-selectors.test.mjs \
  tests/system/studio-web-system-runtime-shell.test.mjs

git commit -m "系统：抽离总控配方"
```

### Task 3: Add system runtime view model and event summary seams

**Files:**
- Create: `apps/web-vue/src/features/system/system-runtime-view-model.ts`
- Create: `apps/web-vue/src/features/system/system-event-summary.ts`
- Modify: `apps/web-vue/src/features/system/SystemControlPage.vue`
- Test: `tests/system/system-runtime-summary.test.mjs`
- Regression: `tests/system/dashboard-service.test.mjs`

- [ ] **Step 1: Write the failing tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import 'tsx/esm';

const viewModel = await import('../../apps/web-vue/src/features/system/system-runtime-view-model.ts');
const summary = await import('../../apps/web-vue/src/features/system/system-event-summary.ts');

test('system runtime view model derives section summaries from health diagnostics and release payloads', () => {
  assert.equal(typeof viewModel.buildSystemRuntimeViewModel, 'function');
  const result = viewModel.buildSystemRuntimeViewModel({
    health: { gatewayConnected: true, serviceState: 'active' },
    diagnostics: { status: { bootstrapPendingCount: 2, securityWarn: 1 }, deviceTrust: { pending: [] } },
    release: { updateAvailable: true, latestVersion: '0.2.0' },
  });
  assert.equal(result.health.gatewayConnected, true);
  assert.equal(result.diagnostics.bootstrapPendingCount, 2);
  assert.equal(result.release.latestVersion, '0.2.0');
});

test('system event summary derives recent release and device trust items', () => {
  const items = summary.buildSystemEventSummary({
    latestVersion: '0.2.0',
    pendingTrustRequests: 3,
  });
  assert.equal(items.length, 2);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/system/system-runtime-summary.test.mjs`
Expected: FAIL because the runtime view model and event summary files do not exist yet.

- [ ] **Step 3: Write minimal implementation**

`apps/web-vue/src/features/system/system-runtime-view-model.ts`

```ts
export function buildSystemRuntimeViewModel(input: {
  health: { gatewayConnected: boolean; serviceState: string };
  diagnostics: { status: { bootstrapPendingCount: number; securityWarn: number }; deviceTrust: { pending: unknown[] } };
  release: { updateAvailable: boolean; latestVersion: string | null };
}) {
  return {
    health: {
      gatewayConnected: input.health.gatewayConnected,
      serviceState: input.health.serviceState,
    },
    diagnostics: {
      bootstrapPendingCount: input.diagnostics.status.bootstrapPendingCount,
      securityWarn: input.diagnostics.status.securityWarn,
      pendingTrustRequests: input.diagnostics.deviceTrust.pending.length,
    },
    release: {
      updateAvailable: input.release.updateAvailable,
      latestVersion: input.release.latestVersion,
    },
  };
}
```

`apps/web-vue/src/features/system/system-event-summary.ts`

```ts
export function buildSystemEventSummary(input: {
  latestVersion: string | null;
  pendingTrustRequests: number;
}) {
  return [
    {
      key: 'release',
      label: input.latestVersion ? `Latest release ${input.latestVersion}` : 'No release data',
    },
    {
      key: 'device-trust',
      label: `${input.pendingTrustRequests} pending trust requests`,
    },
  ];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/system/system-runtime-summary.test.mjs tests/system/dashboard-service.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add \
  apps/web-vue/src/features/system/system-runtime-view-model.ts \
  apps/web-vue/src/features/system/system-event-summary.ts \
  apps/web-vue/src/features/system/SystemControlPage.vue \
  tests/system/system-runtime-summary.test.mjs

git commit -m "系统：收口运行态摘要"
```

### Task 4: Add System → Terminal handoff seam

**Files:**
- Create: `apps/web-vue/src/features/system/SystemActionHandoffPanel.vue`
- Create: `apps/web-vue/src/features/system/system-terminal-handoff.ts`
- Modify: `apps/web-vue/src/features/system/SystemControlPage.vue`
- Create: `tests/system/system-terminal-handoff.test.mjs`
- Regression: `tests/system/studio-web-system-runtime-shell.test.mjs`

- [ ] **Step 1: Write the failing tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import 'tsx/esm';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const controlPagePath = path.join(rootDir, 'apps/web-vue/src/features/system/SystemControlPage.vue');
const handoff = await import('../../apps/web-vue/src/features/system/system-terminal-handoff.ts');

test('system terminal handoff helper builds a terminal route payload', () => {
  const payload = handoff.buildSystemTerminalHandoff({
    source: 'bootstrap-repair',
    label: 'Repair Bootstrap',
  });
  assert.match(payload.routePath, /^\/terminal\//);
  assert.equal(payload.source, 'bootstrap-repair');
});

test('system control page consumes the terminal handoff seam', () => {
  const source = fs.readFileSync(controlPagePath, 'utf8');
  assert.match(source, /SystemActionHandoffPanel/);
  assert.match(source, /system-terminal-handoff/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/system/system-terminal-handoff.test.mjs tests/system/studio-web-system-runtime-shell.test.mjs`
Expected: FAIL because the handoff seam does not exist yet.

- [ ] **Step 3: Write minimal implementation**

`apps/web-vue/src/features/system/system-terminal-handoff.ts`

```ts
export function buildSystemTerminalHandoff(input: {
  source: string;
  label: string;
}) {
  const sessionId = `system-${input.source}`;
  return {
    routePath: `/terminal/${sessionId}`,
    sessionId,
    source: input.source,
    label: input.label,
  };
}
```

`apps/web-vue/src/features/system/SystemActionHandoffPanel.vue`

```vue
<template>
  <section class="system-action-handoff-panel">
    <button type="button" @click="$emit('open-terminal')">{{ label }}</button>
  </section>
</template>

<script setup lang="ts">
defineProps<{ label: string }>();
defineEmits<{ (event: 'open-terminal'): void }>();
</script>
```

`apps/web-vue/src/features/system/SystemControlPage.vue` excerpt

```vue
<template>
  <SystemActionHandoffPanel
    :label="terminalHandoff.label"
    @open-terminal="router.push(terminalHandoff.routePath)"
  />
</template>

<script setup lang="ts">
import SystemActionHandoffPanel from './SystemActionHandoffPanel.vue';
import { buildSystemTerminalHandoff } from './system-terminal-handoff';

const terminalHandoff = buildSystemTerminalHandoff({
  source: 'bootstrap-repair',
  label: text('去终端继续排查', 'Open Terminal for deeper investigation'),
});
</script>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/system/system-terminal-handoff.test.mjs tests/system/studio-web-system-runtime-shell.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add \
  apps/web-vue/src/features/system/SystemActionHandoffPanel.vue \
  apps/web-vue/src/features/system/system-terminal-handoff.ts \
  apps/web-vue/src/features/system/SystemControlPage.vue \
  tests/system/system-terminal-handoff.test.mjs

git commit -m "系统：接入终端联动"
```

### Task 5: Add backend runtime summary and terminal handoff helpers

**Files:**
- Create: `apps/api/modules/system/runtime-summary.ts`
- Create: `apps/api/modules/system/terminal-handoff.ts`
- Modify: `apps/api/modules/system/service.ts`
- Modify: `apps/api/modules/system/routes.ts`
- Test: `tests/system/system-runtime-summary.test.mjs`
- Test: `tests/system/system-terminal-handoff.test.mjs`
- Regression: `tests/system/bootstrap.test.mjs`
- Regression: `tests/system/device-trust.test.mjs`

- [ ] **Step 1: Write the failing tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import 'tsx/esm';

const runtimeSummary = await import('../../apps/api/modules/system/runtime-summary.ts');
const handoff = await import('../../apps/api/modules/system/terminal-handoff.ts');

test('system runtime summary helper derives control center status cards', () => {
  const summary = runtimeSummary.buildSystemRuntimeSummary({
    gatewayConnected: true,
    bootstrapPendingCount: 2,
    updateLatestVersion: '0.2.0',
  });
  assert.equal(summary.gatewayConnected, true);
  assert.equal(summary.bootstrapPendingCount, 2);
  assert.equal(summary.updateLatestVersion, '0.2.0');
});

test('system terminal handoff helper derives terminal action suggestions', () => {
  const suggestions = handoff.buildSystemTerminalActionSuggestions({
    bootstrapRepairNeeded: true,
    helperPendingRepair: false,
  });
  assert.equal(suggestions.length, 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/system/system-runtime-summary.test.mjs tests/system/system-terminal-handoff.test.mjs`
Expected: FAIL because the backend helper files do not exist yet.

- [ ] **Step 3: Write minimal implementation**

`apps/api/modules/system/runtime-summary.ts`

```ts
export function buildSystemRuntimeSummary(input: {
  gatewayConnected: boolean;
  bootstrapPendingCount: number;
  updateLatestVersion: string;
}) {
  return {
    gatewayConnected: input.gatewayConnected,
    bootstrapPendingCount: input.bootstrapPendingCount,
    updateLatestVersion: input.updateLatestVersion,
  };
}
```

`apps/api/modules/system/terminal-handoff.ts`

```ts
export function buildSystemTerminalActionSuggestions(input: {
  bootstrapRepairNeeded: boolean;
  helperPendingRepair: boolean;
}) {
  const items = [] as Array<{ key: string; routePath: string }>;
  if (input.bootstrapRepairNeeded) {
    items.push({ key: 'bootstrap-repair', routePath: '/terminal/system-bootstrap-repair' });
  }
  if (input.helperPendingRepair) {
    items.push({ key: 'helper-repair', routePath: '/terminal/system-helper-repair' });
  }
  return items;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/system/system-runtime-summary.test.mjs tests/system/system-terminal-handoff.test.mjs tests/system/bootstrap.test.mjs tests/system/device-trust.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add \
  apps/api/modules/system/runtime-summary.ts \
  apps/api/modules/system/terminal-handoff.ts \
  apps/api/modules/system/service.ts \
  apps/api/modules/system/routes.ts \
  tests/system/system-runtime-summary.test.mjs \
  tests/system/system-terminal-handoff.test.mjs

git commit -m "系统：补齐总控摘要"
```

### Task 6: Run the system runtime control center gate and capture follow-up split

**Files:**
- Modify: `docs/superpowers/plans/2026-04-13-system-runtime-control-center.md`
- Verify: `apps/web-vue/src/features/system/system-runtime-domain-manifest.ts`
- Verify: `apps/web-vue/src/features/system/system-overview-recipe.ts`
- Verify: `apps/web-vue/src/features/system/system-stage-selectors.ts`
- Verify: `apps/web-vue/src/features/system/system-runtime-view-model.ts`
- Verify: `apps/web-vue/src/features/system/system-terminal-handoff.ts`
- Verify: `apps/api/modules/system/runtime-summary.ts`
- Verify: `apps/api/modules/system/terminal-handoff.ts`
- Verify: `scripts/studio-system-runtime-coverage.mjs`

- [ ] **Step 1: Append the exit criteria to the plan footer**

```md
## System runtime control center exit criteria

- System page exposes overview, release, gateway, bootstrap, diagnostics, and environment seams explicitly.
- Page-level overview recipes and stage selectors exist instead of all page derivation living inline.
- System → Terminal handoff exists as an explicit helper seam.
- Backend runtime summary and terminal handoff helpers exist and are consumed by the current System flow.
- A committed system-runtime coverage baseline exists and can be regenerated.
- Targeted system runtime tests pass.
- `npm run typecheck:web` and `npm run typecheck:api` pass.
- Every completed task is committed separately with a short Chinese message.

## Required follow-up plans

1. System event center / audit timeline
2. Richer System ↔ Terminal action context and cross-device control handoff
```

- [ ] **Step 2: Run the system runtime verification gate**

Run: `node --test tests/system/system-runtime-domain-manifest.test.mjs tests/system/system-overview-recipe.test.mjs tests/system/system-stage-selectors.test.mjs tests/system/system-runtime-summary.test.mjs tests/system/system-terminal-handoff.test.mjs tests/system/studio-web-system-runtime-shell.test.mjs tests/system/bootstrap.test.mjs tests/system/device-trust.test.mjs tests/system/dashboard-service.test.mjs && npm run typecheck:web && npm run typecheck:api && npm run studio:system-runtime-coverage`
Expected: PASS.

- [ ] **Step 3: Fix only the smallest seam that fails**

If the gate fails, fix only one of these seams before re-running:

- system manifest / coverage files
- overview recipe / selectors files
- runtime view model / event summary files
- system terminal handoff files
- backend runtime summary files

Do not widen into Dashboard redesign or deeper Terminal redesign.

- [ ] **Step 4: Re-run the system runtime verification gate**

Run: `node --test tests/system/system-runtime-domain-manifest.test.mjs tests/system/system-overview-recipe.test.mjs tests/system/system-stage-selectors.test.mjs tests/system/system-runtime-summary.test.mjs tests/system/system-terminal-handoff.test.mjs tests/system/studio-web-system-runtime-shell.test.mjs tests/system/bootstrap.test.mjs tests/system/device-trust.test.mjs tests/system/dashboard-service.test.mjs && npm run typecheck:web && npm run typecheck:api && npm run studio:system-runtime-coverage`
Expected: PASS end-to-end.

- [ ] **Step 5: Commit the closeout**

```bash
git add \
  docs/superpowers/plans/2026-04-13-system-runtime-control-center.md \
  docs/superpowers/inventories/studio-system-runtime-coverage.json

git commit -m "系统：完成总控阶段"
```

---

## Self-review

### Spec coverage

This plan covers the System runtime control center refinement slice from the approved System / Terminal design:

- System page overview + section decomposition
- explicit overview recipes and stage selectors
- System → Terminal handoff seam
- backend runtime summary and handoff helpers
- system runtime coverage baseline and gate

It intentionally does **not** redesign Dashboard, Config, or the deeper Terminal cross-device takeover UX.

### Placeholder scan

No placeholders remain. Each task names concrete files, tests, commands, and minimal code.

### Type consistency

The plan keeps one consistent section model across the System runtime flow:

- `overview`
- `release`
- `gateway`
- `bootstrap`
- `diagnostics`
- `environment`

The handoff seam is also consistent across frontend/backend tasks: System builds a terminal route payload instead of embedding terminal logic inline.

## System runtime control center exit criteria

- System page exposes overview, release, gateway, bootstrap, diagnostics, and environment seams explicitly.
- Page-level overview recipes and stage selectors exist instead of all page derivation living inline.
- System → Terminal handoff exists as an explicit helper seam.
- Backend runtime summary and terminal handoff helpers exist and are consumed by the current System flow.
- A committed system-runtime coverage baseline exists and can be regenerated.
- Targeted system runtime tests pass.
- `npm run typecheck:web` and `npm run typecheck:api` pass.
- Every completed task is committed separately with a short Chinese message.

## Required follow-up plans

1. System event center / audit timeline
2. Richer System ↔ Terminal action context and cross-device control handoff
