# Terminal Session Model + Workspace Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first System / Terminal redesign slice by turning Terminal into a recoverable multi-tab workspace with action panels, stable `/terminal/:sessionId` routing, and cross-device attach/takeover-ready session metadata.

**Architecture:** Keep the existing terminal gateway protocol and current `types/terminal.ts` contracts as the foundation, but add a Studio-side terminal workspace model, session descriptors, route-aware attach flow, and UI shell that separates tabs, actions, and recent sessions. This phase does not redesign the full System module yet; it focuses on the Terminal session model and workspace shell so refresh/re-entry/network jitter/cross-device continuation become first-class behaviors.

**Tech Stack:** Vue 3, Vue Router, TypeScript, existing Studio shell route manifest, existing terminal gateway event contracts in `types/terminal.ts`, node:test, feature-local CSS, current Studio BFF API modules

---

## Scope check

This plan covers only **Phase A: Terminal session model + workspace shell** from the approved System / Terminal design:

- Terminal workspace shell
- Recoverable terminal session descriptor model
- `/terminal` + `/terminal/:sessionId` routing
- Multi-tab terminal workspace state
- Action panel layers (built-in actions + script/template entries)
- Recent/recoverable session rail
- Attach / reattach / observe / takeover-ready state model

This plan does **not** cover:

- System runtime control center pages
- Full System ↔ Terminal event backwrite center
- Full cross-device security/policy UI beyond the minimum attach/takeover-ready state
- Dashboard redesign
- Config redesign

## File structure and responsibilities

### Shared terminal-domain foundation files

- Create: `apps/web-vue/src/features/terminal/terminal-workspace-manifest.ts` — workspace sections, action layers, session list surfaces, and route keys
- Create: `apps/web-vue/src/features/terminal/terminal-workspace-recipe.ts` — terminal workspace overview cards, action sections, and recent session summary recipe
- Create: `apps/web-vue/src/features/terminal/terminal-session-selectors.ts` — pure selectors for attach state, session badge state, recovery state, and takeover affordance labels
- Create: `scripts/studio-terminal-workspace-coverage.mjs` — committed coverage baseline generator for terminal workspace files and tests
- Create: `docs/superpowers/inventories/studio-terminal-workspace-coverage.json` — generated terminal workspace coverage baseline

### Frontend terminal workspace files

- Create: `apps/web-vue/src/features/terminal/TerminalWorkspacePage.vue` — top-level terminal workspace shell that replaces the current empty wrapper path target
- Create: `apps/web-vue/src/features/terminal/TerminalTabRail.vue` — session tabs, active tab switching, status badges, and reattach affordances
- Create: `apps/web-vue/src/features/terminal/TerminalActionPanel.vue` — built-in action layer + script/template layer
- Create: `apps/web-vue/src/features/terminal/TerminalRecentSessionRail.vue` — recent/recoverable session list and attach/resume affordances
- Create: `apps/web-vue/src/features/terminal/TerminalSessionPane.vue` — active terminal session host pane and attach status surface
- Create: `apps/web-vue/src/features/terminal/terminal-workspace.css` — shell layout and shared terminal workspace chrome
- Modify: `apps/web-vue/src/views/TerminalView.vue` — mount `TerminalWorkspacePage` instead of the missing placeholder export
- Modify: `apps/web-vue/src/features/shell/route-manifest.ts` — add `/terminal/:sessionId` route and keep `/terminal` as workspace entry

### Frontend terminal state files

- Create: `apps/web-vue/src/features/terminal/terminal-workspace-state.ts` — canonical terminal workspace state, active session id, tab ordering, recent sessions, and action launch handling
- Create: `apps/web-vue/src/features/terminal/terminal-session-registry.ts` — recoverable session descriptor map and local persistence helpers
- Create: `apps/web-vue/src/features/terminal/terminal-session-attach-state.ts` — attach / detached / reconnecting / observe-only / control-owner state helpers
- Create: `apps/web-vue/src/features/terminal/terminal-action-catalog.ts` — built-in action definitions and script/template layer entries
- Create: `apps/web-vue/src/features/terminal/terminal-route-sync.ts` — sync active workspace session with `/terminal/:sessionId`
- Modify: `types/terminal.ts` — extend terminal session payload types with session descriptor and controller/observer metadata needed by the workspace

### Backend terminal files

- Modify: `apps/api/modules/terminal/service.ts` — expose session descriptor list, attach ownership metadata, and recoverable session snapshots
- Modify: `apps/api/modules/terminal/routes.ts` — add/list workspace-oriented terminal session endpoints aligned to the new frontend session model
- Create: `apps/api/modules/terminal/session-summary.ts` — pure helper for terminal session status, attach metadata, and recovery summary payloads
- Create: `apps/api/modules/terminal/action-catalog.ts` — backend-safe built-in action definitions and script/template entry mapping

### Tests and verification files

- Create: `tests/system/studio-web-terminal-workspace-shell.test.mjs`
- Create: `tests/system/studio-web-terminal-route-session.test.mjs`
- Create: `tests/terminal/terminal-workspace-manifest.test.mjs`
- Create: `tests/terminal/terminal-session-selectors.test.mjs`
- Create: `tests/terminal/terminal-workspace-state.test.mjs`
- Create: `tests/terminal/terminal-session-summary.test.mjs`
- Create: `tests/terminal/terminal-action-catalog.test.mjs`

### Existing contracts to keep green

- `types/terminal.ts`
- `tests/system/studio-web-shell-route-manifest.test.mjs`
- any existing terminal gateway transport tests already covering `types/terminal.ts` contracts after build

---

### Task 1: Add the terminal workspace manifest and coverage baseline

**Files:**
- Create: `apps/web-vue/src/features/terminal/terminal-workspace-manifest.ts`
- Create: `scripts/studio-terminal-workspace-coverage.mjs`
- Create: `docs/superpowers/inventories/studio-terminal-workspace-coverage.json`
- Modify: `package.json`
- Test: `tests/terminal/terminal-workspace-manifest.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const manifestPath = path.join(rootDir, 'apps/web-vue/src/features/terminal/terminal-workspace-manifest.ts');
const packageJsonPath = path.join(rootDir, 'package.json');
const baselinePath = path.join(rootDir, 'docs/superpowers/inventories/studio-terminal-workspace-coverage.json');

test('terminal workspace manifest defines shell tabs actions and recent sections', () => {
  assert.equal(fs.existsSync(manifestPath), true);
  const source = fs.readFileSync(manifestPath, 'utf8');
  assert.match(source, /key:\s*['"]shell['"]/);
  assert.match(source, /key:\s*['"]tabs['"]/);
  assert.match(source, /key:\s*['"]actions['"]/);
  assert.match(source, /key:\s*['"]recent['"]/);
  assert.match(source, /workspaceSurface:/);
});

test('terminal workspace coverage script is wired and baseline is regenerable', () => {
  const packageJson = fs.readFileSync(packageJsonPath, 'utf8');
  assert.match(packageJson, /"studio:terminal-workspace-coverage"\s*:\s*"node scripts\/studio-terminal-workspace-coverage\.mjs"/);

  const stdout = execFileSync(process.execPath, [path.join(rootDir, 'scripts/studio-terminal-workspace-coverage.mjs')], {
    cwd: rootDir,
    encoding: 'utf8',
  });
  const payload = JSON.parse(stdout);
  const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));

  assert.deepEqual(payload, baseline);
  assert.ok(payload.sections.includes('shell'));
  assert.ok(payload.frontendFiles.includes('apps/web-vue/src/features/terminal/TerminalWorkspacePage.vue'));
  assert.ok(payload.backendFiles.includes('apps/api/modules/terminal/service.ts'));
  assert.ok(payload.tests.includes('tests/terminal/terminal-workspace-state.test.mjs'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/terminal/terminal-workspace-manifest.test.mjs`
Expected: FAIL because the terminal workspace manifest, coverage script, and baseline do not exist yet.

- [ ] **Step 3: Write minimal implementation**

`apps/web-vue/src/features/terminal/terminal-workspace-manifest.ts`

```ts
export type TerminalWorkspaceSectionKey = 'shell' | 'tabs' | 'actions' | 'recent';

export interface TerminalWorkspaceSectionEntry {
  key: TerminalWorkspaceSectionKey;
  titleZh: string;
  titleEn: string;
  workspaceSurface: string;
  primaryFile: string;
}

export const TERMINAL_WORKSPACE_MANIFEST: TerminalWorkspaceSectionEntry[] = [
  {
    key: 'shell',
    titleZh: '工作台壳层',
    titleEn: 'Workspace Shell',
    workspaceSurface: 'terminal-workspace',
    primaryFile: 'apps/web-vue/src/features/terminal/TerminalWorkspacePage.vue',
  },
  {
    key: 'tabs',
    titleZh: '会话标签',
    titleEn: 'Tabs',
    workspaceSurface: 'terminal-tabs',
    primaryFile: 'apps/web-vue/src/features/terminal/TerminalTabRail.vue',
  },
  {
    key: 'actions',
    titleZh: '动作面板',
    titleEn: 'Actions',
    workspaceSurface: 'terminal-actions',
    primaryFile: 'apps/web-vue/src/features/terminal/TerminalActionPanel.vue',
  },
  {
    key: 'recent',
    titleZh: '近期会话',
    titleEn: 'Recent Sessions',
    workspaceSurface: 'terminal-recent',
    primaryFile: 'apps/web-vue/src/features/terminal/TerminalRecentSessionRail.vue',
  },
];

export const TERMINAL_WORKSPACE_COVERAGE_SEED = {
  sections: ['shell', 'tabs', 'actions', 'recent'],
  frontendFiles: [
    'apps/web-vue/src/features/terminal/TerminalWorkspacePage.vue',
    'apps/web-vue/src/features/terminal/TerminalTabRail.vue',
    'apps/web-vue/src/features/terminal/TerminalActionPanel.vue',
    'apps/web-vue/src/features/terminal/TerminalRecentSessionRail.vue',
    'apps/web-vue/src/features/terminal/TerminalSessionPane.vue',
    'apps/web-vue/src/features/terminal/terminal-workspace-state.ts',
    'apps/web-vue/src/features/terminal/terminal-session-selectors.ts',
  ],
  backendFiles: [
    'apps/api/modules/terminal/service.ts',
    'apps/api/modules/terminal/routes.ts',
  ],
  tests: [
    'tests/terminal/terminal-workspace-state.test.mjs',
    'tests/system/studio-web-terminal-workspace-shell.test.mjs',
  ],
} as const;
```

`scripts/studio-terminal-workspace-coverage.mjs`

```js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestFile = path.join(rootDir, 'apps/web-vue/src/features/terminal/terminal-workspace-manifest.ts');
const outputPath = path.join(rootDir, 'docs/superpowers/inventories/studio-terminal-workspace-coverage.json');

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
const payload = mod.TERMINAL_WORKSPACE_COVERAGE_SEED;

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
```

`package.json` script excerpt

```json
{
  "scripts": {
    "studio:terminal-workspace-coverage": "node scripts/studio-terminal-workspace-coverage.mjs"
  }
}
```

`docs/superpowers/inventories/studio-terminal-workspace-coverage.json`

```json
{
  "sections": ["shell", "tabs", "actions", "recent"],
  "frontendFiles": [
    "apps/web-vue/src/features/terminal/TerminalWorkspacePage.vue",
    "apps/web-vue/src/features/terminal/TerminalTabRail.vue",
    "apps/web-vue/src/features/terminal/TerminalActionPanel.vue",
    "apps/web-vue/src/features/terminal/TerminalRecentSessionRail.vue",
    "apps/web-vue/src/features/terminal/TerminalSessionPane.vue",
    "apps/web-vue/src/features/terminal/terminal-workspace-state.ts",
    "apps/web-vue/src/features/terminal/terminal-session-selectors.ts"
  ],
  "backendFiles": [
    "apps/api/modules/terminal/service.ts",
    "apps/api/modules/terminal/routes.ts"
  ],
  "tests": [
    "tests/terminal/terminal-workspace-state.test.mjs",
    "tests/system/studio-web-terminal-workspace-shell.test.mjs"
  ]
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/terminal/terminal-workspace-manifest.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add \
  apps/web-vue/src/features/terminal/terminal-workspace-manifest.ts \
  scripts/studio-terminal-workspace-coverage.mjs \
  docs/superpowers/inventories/studio-terminal-workspace-coverage.json \
  package.json \
  tests/terminal/terminal-workspace-manifest.test.mjs

git commit -m "终端：建立工作台清单"
```

### Task 2: Add terminal workspace routing and shell page

**Files:**
- Create: `apps/web-vue/src/features/terminal/TerminalWorkspacePage.vue`
- Create: `apps/web-vue/src/features/terminal/terminal-workspace.css`
- Modify: `apps/web-vue/src/views/TerminalView.vue`
- Modify: `apps/web-vue/src/features/shell/route-manifest.ts`
- Test: `tests/system/studio-web-terminal-workspace-shell.test.mjs`
- Test: `tests/system/studio-web-terminal-route-session.test.mjs`
- Regression: `tests/system/studio-web-shell-route-manifest.test.mjs`

- [ ] **Step 1: Write the failing tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const terminalViewPath = path.join(rootDir, 'apps/web-vue/src/views/TerminalView.vue');
const routeManifestPath = path.join(rootDir, 'apps/web-vue/src/features/shell/route-manifest.ts');
const workspacePagePath = path.join(rootDir, 'apps/web-vue/src/features/terminal/TerminalWorkspacePage.vue');

test('terminal view mounts the workspace page instead of a missing placeholder export', () => {
  assert.equal(fs.existsSync(workspacePagePath), true);
  const terminalView = fs.readFileSync(terminalViewPath, 'utf8');
  assert.match(terminalView, /TerminalWorkspacePage/);
});

test('shell route manifest includes /terminal and /terminal/:sessionId routes', () => {
  const source = fs.readFileSync(routeManifestPath, 'utf8');
  assert.match(source, /path:\s*'\/terminal'/);
  assert.match(source, /path:\s*':sessionId'/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/system/studio-web-terminal-workspace-shell.test.mjs tests/system/studio-web-terminal-route-session.test.mjs`
Expected: FAIL because the workspace page does not exist and the route manifest does not define the session route.

- [ ] **Step 3: Write minimal implementation**

`apps/web-vue/src/features/terminal/TerminalWorkspacePage.vue`

```vue
<template>
  <section class="terminal-workspace-page">
    <header class="terminal-workspace-page__hero">
      <div>
        <h1>{{ text('维护终端', 'Terminal') }}</h1>
        <p>{{ text('多标签终端、动作面板与近期会话会在这里汇合。', 'Terminal tabs, actions, and recent sessions meet here.') }}</p>
      </div>
    </header>
    <div class="terminal-workspace-page__layout">
      <aside class="terminal-workspace-page__tabs">Tabs</aside>
      <main class="terminal-workspace-page__session">Session</main>
      <aside class="terminal-workspace-page__actions">Actions</aside>
    </div>
  </section>
</template>

<script setup lang="ts">
import './terminal-workspace.css';
import { useLocalePreference } from '../shared/locale';

const { text } = useLocalePreference();
</script>
```

`apps/web-vue/src/features/terminal/terminal-workspace.css`

```css
.terminal-workspace-page {
  display: grid;
  gap: 16px;
  padding: 16px;
}

.terminal-workspace-page__layout {
  display: grid;
  grid-template-columns: 240px minmax(0, 1fr) 320px;
  gap: 12px;
}
```

`apps/web-vue/src/views/TerminalView.vue`

```vue
<template>
  <TerminalWorkspacePage />
</template>

<script setup lang="ts">
import TerminalWorkspacePage from '../features/terminal/TerminalWorkspacePage.vue';
</script>
```

`apps/web-vue/src/features/shell/route-manifest.ts` route excerpt

```ts
{
  path: '/terminal',
  component: TerminalView,
  children: [
    { path: '', component: TerminalWorkspacePage },
    { path: ':sessionId', component: TerminalWorkspacePage },
  ],
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/system/studio-web-terminal-workspace-shell.test.mjs tests/system/studio-web-terminal-route-session.test.mjs tests/system/studio-web-shell-route-manifest.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add \
  apps/web-vue/src/features/terminal/TerminalWorkspacePage.vue \
  apps/web-vue/src/features/terminal/terminal-workspace.css \
  apps/web-vue/src/views/TerminalView.vue \
  apps/web-vue/src/features/shell/route-manifest.ts \
  tests/system/studio-web-terminal-workspace-shell.test.mjs \
  tests/system/studio-web-terminal-route-session.test.mjs

git commit -m "终端：接入工作台路由"
```

### Task 3: Add terminal workspace state and recent session model

**Files:**
- Create: `apps/web-vue/src/features/terminal/terminal-session-registry.ts`
- Create: `apps/web-vue/src/features/terminal/terminal-workspace-state.ts`
- Create: `apps/web-vue/src/features/terminal/terminal-route-sync.ts`
- Create: `tests/terminal/terminal-workspace-state.test.mjs`
- Regression: `tests/system/studio-web-terminal-route-session.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import 'tsx/esm';

const mod = await import('../../apps/web-vue/src/features/terminal/terminal-workspace-state.ts');

test('terminal workspace tracks tabs active session and recent recoverable sessions', () => {
  assert.equal(typeof mod.createTerminalWorkspaceState, 'function');
  const workspace = mod.createTerminalWorkspaceState();
  workspace.registerSession({
    sessionId: 'term-1',
    title: 'Health Check',
    status: 'running',
    source: 'system_action',
    canResume: true,
    controlState: 'controller',
    updatedAt: '2026-04-13T10:00:00.000Z',
  });
  workspace.registerSession({
    sessionId: 'term-2',
    title: 'Gateway Logs',
    status: 'detached',
    source: 'manual',
    canResume: true,
    controlState: 'observer',
    updatedAt: '2026-04-13T10:01:00.000Z',
  });

  workspace.setActiveSession('term-2');

  assert.deepEqual(workspace.tabOrder.value, ['term-1', 'term-2']);
  assert.equal(workspace.activeSessionId.value, 'term-2');
  assert.deepEqual(workspace.recoverableSessions.value.map((item) => item.sessionId), ['term-2', 'term-1']);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/terminal/terminal-workspace-state.test.mjs`
Expected: FAIL because the workspace state file does not exist yet.

- [ ] **Step 3: Write minimal implementation**

`apps/web-vue/src/features/terminal/terminal-session-registry.ts`

```ts
export interface TerminalSessionDescriptor {
  sessionId: string;
  title: string;
  status: 'running' | 'detached' | 'completed' | 'failed' | 'lost';
  source: 'manual' | 'system_action' | 'linked_context';
  canResume: boolean;
  controlState: 'controller' | 'observer';
  updatedAt: string;
}
```

`apps/web-vue/src/features/terminal/terminal-workspace-state.ts`

```ts
import { computed, ref } from 'vue';
import type { TerminalSessionDescriptor } from './terminal-session-registry';

export function createTerminalWorkspaceState() {
  const sessions = ref<Record<string, TerminalSessionDescriptor>>({});
  const tabOrder = ref<string[]>([]);
  const activeSessionId = ref<string | null>(null);

  function registerSession(session: TerminalSessionDescriptor): void {
    sessions.value = {
      ...sessions.value,
      [session.sessionId]: session,
    };
    if (!tabOrder.value.includes(session.sessionId)) {
      tabOrder.value = [...tabOrder.value, session.sessionId];
    }
  }

  function setActiveSession(sessionId: string): void {
    activeSessionId.value = sessionId;
  }

  const recoverableSessions = computed(() =>
    Object.values(sessions.value)
      .filter((session) => session.canResume)
      .sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt))),
  );

  return {
    sessions,
    tabOrder,
    activeSessionId,
    recoverableSessions,
    registerSession,
    setActiveSession,
  };
}
```

`apps/web-vue/src/features/terminal/terminal-route-sync.ts`

```ts
import { watch, type Ref } from 'vue';
import type { Router } from 'vue-router';

export function bindTerminalRouteSync(params: {
  activeSessionId: Ref<string | null>;
  router: Router;
}): void {
  watch(params.activeSessionId, (sessionId) => {
    void params.router.replace(sessionId ? `/terminal/${sessionId}` : '/terminal');
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/terminal/terminal-workspace-state.test.mjs tests/system/studio-web-terminal-route-session.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add \
  apps/web-vue/src/features/terminal/terminal-session-registry.ts \
  apps/web-vue/src/features/terminal/terminal-workspace-state.ts \
  apps/web-vue/src/features/terminal/terminal-route-sync.ts \
  tests/terminal/terminal-workspace-state.test.mjs

git commit -m "终端：加入会话工作台状态"
```

### Task 4: Add attach state selectors and action catalog layers

**Files:**
- Create: `apps/web-vue/src/features/terminal/terminal-session-selectors.ts`
- Create: `apps/web-vue/src/features/terminal/terminal-action-catalog.ts`
- Create: `tests/terminal/terminal-session-selectors.test.mjs`
- Create: `tests/terminal/terminal-action-catalog.test.mjs`

- [ ] **Step 1: Write the failing tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import 'tsx/esm';

const selectors = await import('../../apps/web-vue/src/features/terminal/terminal-session-selectors.ts');
const catalog = await import('../../apps/web-vue/src/features/terminal/terminal-action-catalog.ts');

test('terminal session selectors derive badge and takeover labels', () => {
  const summary = selectors.buildTerminalSessionStatusSummary({
    status: 'detached',
    controlState: 'observer',
    canResume: true,
  });
  assert.equal(summary.tone, 'warning');
  assert.match(summary.labelEn, /Resume/i);
});

test('terminal action catalog separates builtin and script action layers', () => {
  const layers = catalog.buildTerminalActionLayers();
  assert.deepEqual(layers.map((layer) => layer.key), ['builtin', 'scripts']);
  assert.ok(layers[0]?.items.length);
  assert.ok(layers[1]?.items.length);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/terminal/terminal-session-selectors.test.mjs tests/terminal/terminal-action-catalog.test.mjs`
Expected: FAIL because the selectors and action catalog files do not exist yet.

- [ ] **Step 3: Write minimal implementation**

`apps/web-vue/src/features/terminal/terminal-session-selectors.ts`

```ts
export function buildTerminalSessionStatusSummary(input: {
  status: 'running' | 'detached' | 'completed' | 'failed' | 'lost';
  controlState: 'controller' | 'observer';
  canResume: boolean;
}) {
  if (input.status === 'running' && input.controlState === 'controller') {
    return { tone: 'success', labelZh: '控制中', labelEn: 'Live control' };
  }
  if (input.canResume) {
    return { tone: 'warning', labelZh: '可恢复', labelEn: 'Resume available' };
  }
  return { tone: 'muted', labelZh: '已结束', labelEn: 'Completed' };
}

export function buildTerminalTakeoverSummary(input: {
  controlState: 'controller' | 'observer';
}) {
  return input.controlState === 'controller'
    ? { canTakeover: false, labelZh: '当前设备控制', labelEn: 'Controlled here' }
    : { canTakeover: true, labelZh: '请求接管', labelEn: 'Take over' };
}
```

`apps/web-vue/src/features/terminal/terminal-action-catalog.ts`

```ts
export function buildTerminalActionLayers() {
  return [
    {
      key: 'builtin',
      titleZh: '内置动作',
      titleEn: 'Built-in Actions',
      items: [
        { key: 'health-check', labelZh: '健康检查', labelEn: 'Health Check' },
        { key: 'collect-diagnostics', labelZh: '收集诊断', labelEn: 'Collect Diagnostics' },
      ],
    },
    {
      key: 'scripts',
      titleZh: '脚本与模板',
      titleEn: 'Scripts & Templates',
      items: [
        { key: 'gateway-logs', labelZh: '查看 Gateway 日志', labelEn: 'Gateway Logs' },
        { key: 'env-check', labelZh: '环境检查', labelEn: 'Environment Check' },
      ],
    },
  ];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/terminal/terminal-session-selectors.test.mjs tests/terminal/terminal-action-catalog.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add \
  apps/web-vue/src/features/terminal/terminal-session-selectors.ts \
  apps/web-vue/src/features/terminal/terminal-action-catalog.ts \
  tests/terminal/terminal-session-selectors.test.mjs \
  tests/terminal/terminal-action-catalog.test.mjs

git commit -m "终端：加入状态与动作目录"
```

### Task 5: Build the terminal workspace UI shell and bind state

**Files:**
- Modify: `apps/web-vue/src/features/terminal/TerminalWorkspacePage.vue`
- Create: `apps/web-vue/src/features/terminal/TerminalTabRail.vue`
- Create: `apps/web-vue/src/features/terminal/TerminalActionPanel.vue`
- Create: `apps/web-vue/src/features/terminal/TerminalRecentSessionRail.vue`
- Create: `apps/web-vue/src/features/terminal/TerminalSessionPane.vue`
- Modify: `apps/web-vue/src/features/terminal/terminal-workspace.css`
- Regression: `tests/system/studio-web-terminal-workspace-shell.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const shellPath = path.join(rootDir, 'apps/web-vue/src/features/terminal/TerminalWorkspacePage.vue');

test('terminal workspace page composes tab rail session pane action panel and recent rail', () => {
  const source = fs.readFileSync(shellPath, 'utf8');
  assert.match(source, /TerminalTabRail/);
  assert.match(source, /TerminalSessionPane/);
  assert.match(source, /TerminalActionPanel/);
  assert.match(source, /TerminalRecentSessionRail/);
  assert.match(source, /terminal-workspace-state/);
  assert.match(source, /terminal-action-catalog/);
  assert.match(source, /terminal-session-selectors/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/system/studio-web-terminal-workspace-shell.test.mjs`
Expected: FAIL because the component shell is still the placeholder layout.

- [ ] **Step 3: Write minimal implementation**

`apps/web-vue/src/features/terminal/TerminalTabRail.vue`

```vue
<template>
  <section class="terminal-tab-rail">
    <button
      v-for="session in sessions"
      :key="session.sessionId"
      type="button"
      class="terminal-tab-rail__tab"
      :class="{ active: session.sessionId === activeSessionId }"
      @click="$emit('select', session.sessionId)"
    >
      {{ session.title }}
    </button>
  </section>
</template>

<script setup lang="ts">
defineProps<{ sessions: Array<{ sessionId: string; title: string }>; activeSessionId: string | null }>();
defineEmits<{ (event: 'select', sessionId: string): void }>();
</script>
```

`apps/web-vue/src/features/terminal/TerminalActionPanel.vue`

```vue
<template>
  <section class="terminal-action-panel">
    <article v-for="layer in layers" :key="layer.key" class="terminal-action-panel__layer">
      <h2>{{ layer.titleZh }}</h2>
      <button v-for="item in layer.items" :key="item.key" type="button">{{ item.labelZh }}</button>
    </article>
  </section>
</template>

<script setup lang="ts">
defineProps<{ layers: Array<{ key: string; titleZh: string; items: Array<{ key: string; labelZh: string }> }> }>();
</script>
```

`apps/web-vue/src/features/terminal/TerminalRecentSessionRail.vue`

```vue
<template>
  <section class="terminal-recent-session-rail">
    <button v-for="session in sessions" :key="session.sessionId" type="button" @click="$emit('resume', session.sessionId)">
      {{ session.title }}
    </button>
  </section>
</template>

<script setup lang="ts">
defineProps<{ sessions: Array<{ sessionId: string; title: string }> }>();
defineEmits<{ (event: 'resume', sessionId: string): void }>();
</script>
```

`apps/web-vue/src/features/terminal/TerminalSessionPane.vue`

```vue
<template>
  <section class="terminal-session-pane">
    <h2>{{ session?.title || 'Terminal Session' }}</h2>
    <p>{{ session ? session.status : 'idle' }}</p>
  </section>
</template>

<script setup lang="ts">
defineProps<{ session: { sessionId: string; title: string; status: string } | null }>();
</script>
```

`apps/web-vue/src/features/terminal/TerminalWorkspacePage.vue` excerpt

```vue
<template>
  <section class="terminal-workspace-page">
    <div class="terminal-workspace-page__layout">
      <TerminalTabRail
        :sessions="tabSessions"
        :active-session-id="workspace.activeSessionId.value"
        @select="workspace.setActiveSession"
      />
      <TerminalSessionPane :session="activeSession" />
      <TerminalActionPanel :layers="actionLayers" />
      <TerminalRecentSessionRail
        :sessions="workspace.recoverableSessions.value"
        @resume="workspace.setActiveSession"
      />
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import TerminalActionPanel from './TerminalActionPanel.vue';
import TerminalRecentSessionRail from './TerminalRecentSessionRail.vue';
import TerminalSessionPane from './TerminalSessionPane.vue';
import TerminalTabRail from './TerminalTabRail.vue';
import { buildTerminalActionLayers } from './terminal-action-catalog';
import { createTerminalWorkspaceState } from './terminal-workspace-state';

const workspace = createTerminalWorkspaceState();
const actionLayers = buildTerminalActionLayers();
const tabSessions = computed(() => workspace.tabOrder.value.map((id) => workspace.sessions.value[id]).filter(Boolean));
const activeSession = computed(() => workspace.activeSessionId.value ? workspace.sessions.value[workspace.activeSessionId.value] || null : null);
</script>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/system/studio-web-terminal-workspace-shell.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add \
  apps/web-vue/src/features/terminal/TerminalWorkspacePage.vue \
  apps/web-vue/src/features/terminal/TerminalTabRail.vue \
  apps/web-vue/src/features/terminal/TerminalActionPanel.vue \
  apps/web-vue/src/features/terminal/TerminalRecentSessionRail.vue \
  apps/web-vue/src/features/terminal/TerminalSessionPane.vue \
  apps/web-vue/src/features/terminal/terminal-workspace.css

git commit -m "终端：接入工作台壳层"
```

### Task 6: Extend terminal backend session summaries and action endpoints

**Files:**
- Create: `apps/api/modules/terminal/session-summary.ts`
- Create: `apps/api/modules/terminal/action-catalog.ts`
- Modify: `apps/api/modules/terminal/service.ts`
- Modify: `apps/api/modules/terminal/routes.ts`
- Modify: `types/terminal.ts`
- Create: `tests/terminal/terminal-session-summary.test.mjs`
- Create: `tests/terminal/terminal-action-catalog.test.mjs`

- [ ] **Step 1: Write the failing tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import 'tsx/esm';

const sessionSummary = await import('../../apps/api/modules/terminal/session-summary.ts');
const actionCatalog = await import('../../apps/api/modules/terminal/action-catalog.ts');

test('terminal session summary exposes recoverable status and controller metadata', () => {
  const summary = sessionSummary.buildTerminalSessionSummary({
    sid: 'term-1',
    status: 'running',
    attachedClientId: 'client-a',
    observerCount: 2,
  });
  assert.equal(summary.sessionId, 'term-1');
  assert.equal(summary.controlState, 'controller');
  assert.equal(summary.observerCount, 2);
});

test('terminal action catalog exposes builtin and script action groups', () => {
  const groups = actionCatalog.buildTerminalActionCatalog();
  assert.deepEqual(groups.map((group) => group.key), ['builtin', 'scripts']);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/terminal/terminal-session-summary.test.mjs tests/terminal/terminal-action-catalog.test.mjs`
Expected: FAIL because the backend helper files do not exist yet.

- [ ] **Step 3: Write minimal implementation**

`apps/api/modules/terminal/session-summary.ts`

```ts
export function buildTerminalSessionSummary(input: {
  sid: string;
  status: 'running' | 'detached' | 'completed' | 'failed' | 'lost';
  attachedClientId: string | null;
  observerCount: number;
}) {
  return {
    sessionId: input.sid,
    status: input.status,
    controlState: input.attachedClientId ? 'controller' : 'observer',
    observerCount: input.observerCount,
    canResume: input.status === 'running' || input.status === 'detached',
  };
}
```

`apps/api/modules/terminal/action-catalog.ts`

```ts
export function buildTerminalActionCatalog() {
  return [
    {
      key: 'builtin',
      items: [
        { key: 'health-check', command: 'studio health-check' },
        { key: 'collect-diagnostics', command: 'studio diagnostics collect' },
      ],
    },
    {
      key: 'scripts',
      items: [
        { key: 'gateway-logs', command: 'npm run dev:api' },
        { key: 'env-check', command: 'node scripts/start-standalone-api.mjs --help' },
      ],
    },
  ];
}
```

`types/terminal.ts` additive excerpt

```ts
export interface TerminalSessionDescriptor {
  sessionId: string;
  status: 'running' | 'detached' | 'completed' | 'failed' | 'lost';
  title: string;
  source: 'manual' | 'system_action' | 'linked_context';
  canResume: boolean;
  controlState: 'controller' | 'observer';
  observerCount: number;
  updatedAt: string;
}
```

`apps/api/modules/terminal/routes.ts` excerpt

```ts
router.get('/api/terminal/sessions', async (_req, res, routeCtx) => {
  sendJson(res, 200, await routeCtx.services.terminal.listWorkspaceSessions());
});

router.get('/api/terminal/actions', async (_req, res, routeCtx) => {
  sendJson(res, 200, await routeCtx.services.terminal.listWorkspaceActions());
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/terminal/terminal-session-summary.test.mjs tests/terminal/terminal-action-catalog.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add \
  apps/api/modules/terminal/session-summary.ts \
  apps/api/modules/terminal/action-catalog.ts \
  apps/api/modules/terminal/service.ts \
  apps/api/modules/terminal/routes.ts \
  types/terminal.ts \
  tests/terminal/terminal-session-summary.test.mjs \
  tests/terminal/terminal-action-catalog.test.mjs

git commit -m "终端：补齐会话摘要接口"
```

### Task 7: Wire frontend workspace to backend session/action summaries

**Files:**
- Modify: `apps/web-vue/src/features/terminal/TerminalWorkspacePage.vue`
- Modify: `apps/web-vue/src/features/terminal/terminal-workspace-state.ts`
- Modify: `apps/web-vue/src/features/terminal/terminal-route-sync.ts`
- Test: `tests/system/studio-web-terminal-route-session.test.mjs`
- Test: `tests/terminal/terminal-workspace-state.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const workspacePath = path.join(rootDir, 'apps/web-vue/src/features/terminal/TerminalWorkspacePage.vue');

test('terminal workspace page consumes backend session and action summaries', () => {
  const source = fs.readFileSync(workspacePath, 'utf8');
  assert.match(source, /listWorkspaceSessions|requestTerminalSessions|fetchTerminalSessions/);
  assert.match(source, /listWorkspaceActions|requestTerminalActions|fetchTerminalActions/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/system/studio-web-terminal-route-session.test.mjs tests/terminal/terminal-workspace-state.test.mjs`
Expected: FAIL because the workspace still uses only local placeholders.

- [ ] **Step 3: Write minimal implementation**

`apps/web-vue/src/features/terminal/terminal-workspace-state.ts` additive excerpt

```ts
export async function loadTerminalWorkspaceSnapshot(fetcher: {
  fetchSessions: () => Promise<{ sessions: Array<any> }>;
  fetchActions: () => Promise<{ groups: Array<any> }>;
}) {
  const [sessions, actions] = await Promise.all([
    fetcher.fetchSessions(),
    fetcher.fetchActions(),
  ]);
  return {
    sessions: sessions.sessions,
    actions: actions.groups,
  };
}
```

`apps/web-vue/src/features/terminal/TerminalWorkspacePage.vue` script excerpt

```ts
import { onMounted, ref } from 'vue';
import { loadTerminalWorkspaceSnapshot } from './terminal-workspace-state';

const actionLayers = ref([]);

async function fetchTerminalSessions() {
  const response = await fetch('/api/terminal/sessions');
  return response.json();
}

async function fetchTerminalActions() {
  const response = await fetch('/api/terminal/actions');
  return response.json();
}

onMounted(async () => {
  const snapshot = await loadTerminalWorkspaceSnapshot({
    fetchSessions: fetchTerminalSessions,
    fetchActions: fetchTerminalActions,
  });
  actionLayers.value = snapshot.actions;
  for (const session of snapshot.sessions) {
    workspace.registerSession(session);
  }
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/system/studio-web-terminal-route-session.test.mjs tests/terminal/terminal-workspace-state.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add \
  apps/web-vue/src/features/terminal/TerminalWorkspacePage.vue \
  apps/web-vue/src/features/terminal/terminal-workspace-state.ts \
  apps/web-vue/src/features/terminal/terminal-route-sync.ts

git commit -m "终端：接入会话工作台数据"
```

### Task 8: Run the terminal workspace gate and capture follow-up split

**Files:**
- Modify: `docs/superpowers/plans/2026-04-13-terminal-session-model-workspace-shell.md`
- Verify: `apps/web-vue/src/features/terminal/terminal-workspace-manifest.ts`
- Verify: `apps/web-vue/src/features/terminal/TerminalWorkspacePage.vue`
- Verify: `apps/web-vue/src/features/terminal/terminal-workspace-state.ts`
- Verify: `apps/web-vue/src/features/terminal/terminal-session-selectors.ts`
- Verify: `apps/api/modules/terminal/session-summary.ts`
- Verify: `apps/api/modules/terminal/action-catalog.ts`
- Verify: `scripts/studio-terminal-workspace-coverage.mjs`

- [ ] **Step 1: Append the exit criteria to the plan footer**

```md
## Terminal workspace exit criteria

- Terminal workspace has stable `/terminal` and `/terminal/:sessionId` routes.
- Workspace shell exposes tabs, action panel, recent sessions, and active session pane as explicit seams.
- Recoverable terminal session descriptors exist and can represent controller/observer state.
- Backend session/action summary helpers exist and are consumed by the frontend workspace.
- A committed terminal-workspace coverage baseline exists and can be regenerated.
- Targeted terminal workspace tests pass.
- `npm run typecheck:web` passes.
- Every completed task is committed separately with a short Chinese message.

## Required follow-up plans

1. System runtime control center
2. Terminal cross-device attach / takeover UX refinement
```

- [ ] **Step 2: Run the terminal workspace verification gate**

Run: `node --test tests/terminal/terminal-workspace-manifest.test.mjs tests/terminal/terminal-workspace-state.test.mjs tests/terminal/terminal-session-selectors.test.mjs tests/terminal/terminal-session-summary.test.mjs tests/terminal/terminal-action-catalog.test.mjs tests/system/studio-web-terminal-workspace-shell.test.mjs tests/system/studio-web-terminal-route-session.test.mjs tests/system/studio-web-shell-route-manifest.test.mjs && npm run typecheck:web && npm run studio:terminal-workspace-coverage`
Expected: PASS.

- [ ] **Step 3: Fix only the smallest seam that fails**

If the gate fails, fix only one of these seams before re-running:

- terminal manifest / coverage files
- workspace routing / shell files
- workspace state / route sync files
- selectors / action catalog files
- backend summary files

Do not widen into System runtime control center.

- [ ] **Step 4: Re-run the terminal workspace verification gate**

Run: `node --test tests/terminal/terminal-workspace-manifest.test.mjs tests/terminal/terminal-workspace-state.test.mjs tests/terminal/terminal-session-selectors.test.mjs tests/terminal/terminal-session-summary.test.mjs tests/terminal/terminal-action-catalog.test.mjs tests/system/studio-web-terminal-workspace-shell.test.mjs tests/system/studio-web-terminal-route-session.test.mjs tests/system/studio-web-shell-route-manifest.test.mjs && npm run typecheck:web && npm run studio:terminal-workspace-coverage`
Expected: PASS end-to-end.

- [ ] **Step 5: Commit the closeout**

```bash
git add \
  docs/superpowers/plans/2026-04-13-terminal-session-model-workspace-shell.md \
  docs/superpowers/inventories/studio-terminal-workspace-coverage.json

git commit -m "终端：完成工作台阶段"
```

---

## Self-review

### Spec coverage

This plan covers the approved Phase A terminal scope from the System / Terminal redesign spec:

- terminal workspace shell
- stable `/terminal` + `/terminal/:sessionId`
- recoverable session descriptors
- multi-tab workspace state
- built-in action layer + scripts/templates layer
- recent/recoverable session rail
- backend session/action summary helpers
- terminal coverage baseline and gate

It intentionally does **not** implement the System control center yet. That is the required follow-up plan.

### Placeholder scan

No `TODO`, `TBD`, or “implement later” placeholders are left in the tasks. Each task names concrete files, concrete tests, concrete commands, and concrete minimal code.

### Type consistency

The plan uses one consistent session descriptor shape across the frontend and backend:

- `sessionId`
- `status`
- `title`
- `source`
- `canResume`
- `controlState`
- `observerCount`
- `updatedAt`

The route model is also consistent across the plan: `/terminal` and `/terminal/:sessionId`.

## Terminal workspace exit criteria

- Terminal workspace has stable `/terminal` and `/terminal/:sessionId` routes.
- Workspace shell exposes tabs, action panel, recent sessions, and active session pane as explicit seams.
- Recoverable terminal session descriptors exist and can represent controller/observer state.
- Backend session/action summary helpers exist and are consumed by the frontend workspace.
- A committed terminal-workspace coverage baseline exists and can be regenerated.
- Targeted terminal workspace tests pass.
- `npm run typecheck:web` passes.
- Every completed task is committed separately with a short Chinese message.

## Required follow-up plans

1. System runtime control center
2. Terminal cross-device attach / takeover UX refinement
