# Studio Chat Sessions Runtime Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Chat / Sessions runtime domain so Studio has a clear session shell, stable runtime state seams, searchable history workflows, and a runtime-oriented control surface aligned with the total Studio blueprint.

**Architecture:** Keep the existing typed Studio BFF and `chat-v2` runtime surface, but refactor the runtime domain into a clearer shell + selectors + runtime machine + history/search seams. The plan starts by stabilizing shared runtime contracts and shell composition, then incrementally restructures session list, conversation pane, history browser, and backend summary/search surfaces without changing the underlying Gateway-first transport model.

**Tech Stack:** Vue 3, Vue Router, TypeScript, node:test, existing Studio chat BFF routes, SSE/WebSocket runtime transport, `chat-v2` frontend modules, CSS in feature-local files and `apps/web-vue/src/style.css`

---

## Scope check

This plan covers only the **Chat / Sessions runtime domain**:

- Chat shell
- Session list / organizer
- Conversation pane
- Runtime machine / render model
- History search / record browser
- Chat runtime BFF summary/search seams

This plan does **not** cover:

- System / Terminal redesign
- Room / Workflow detailed design or implementation
- Wider shell redesign already completed in the foundations plan

## File structure and responsibilities

### Shared runtime-domain foundation files

- Create: `apps/web-vue/src/features/chat-v2/chat-runtime-domain-manifest.ts` — runtime-domain sections, surfaces, and search entry metadata
- Create: `apps/web-vue/src/features/chat-v2/chat-shell-overview-recipe.ts` — shell-level summary, warning, and quick-action recipe
- Create: `apps/web-vue/src/features/chat-v2/chat-stage-selectors.ts` — pure selectors for shell headline, subtitle, badges, history state, and inspector state
- Create: `scripts/studio-chat-runtime-coverage.mjs` — committed runtime-domain coverage snapshot for chat shell, runtime machine, history, and backend chat surfaces
- Create: `docs/superpowers/inventories/studio-chat-runtime-coverage.json` — generated runtime coverage baseline

### Frontend runtime-shell files

- Modify: `apps/web-vue/src/features/chat-v2/ChatShellPage.vue` — shrink to shell orchestration and consume selectors/recipe rather than owning all derived state locally
- Modify: `apps/web-vue/src/features/chat-v2/ConversationPane.vue` — keep as presentation + explicit interaction events, remove shell-derived branching where possible
- Modify: `apps/web-vue/src/features/chat-v2/SessionListPanel.vue` — align with runtime manifest and recipe-driven badges/filters
- Modify: `apps/web-vue/src/features/chat-v2/ChatRecordBrowserPanel.vue` — align with extracted history-search state and recipe copy
- Modify: `apps/web-vue/src/features/chat-v2/InspectorPanel.vue` — consume selector outputs rather than recomputing shell state

### Frontend runtime-state files

- Modify: `apps/web-vue/src/features/chat-v2/chat-session-runtime-machine.ts` — keep canonical/transient rules but expose selector-friendly summary helpers
- Modify: `apps/web-vue/src/features/chat-v2/chat-runtime-view-model.ts` — reduce duplicated derivation and expose stable runtime-shell view state
- Modify: `apps/web-vue/src/features/chat-v2/chat-session-scroll-state.ts` — make scroll restore / jump-to-live state explicit for shell consumers
- Modify: `apps/web-vue/src/features/chat-v2/chat-session-list-selection.ts` — align selection/folder behavior with shell selectors

### Backend runtime-domain files

- Modify: `apps/api/modules/chat/service.ts` — expose stable runtime summary/search helpers for shell and record-browser workflows
- Modify: `apps/api/modules/chat/routes.ts` — keep route surface, but align summary/search endpoints with the new runtime selectors
- Create: `apps/api/modules/chat/runtime-summary.ts` — shared backend helpers for session runtime summary, search summary, and search facet payloads
- Create: `apps/api/modules/chat/history-search-summary.ts` — shared helpers for record-browser metadata and search result grouping

### Tests and verification files

- Create: `tests/chat/chat-runtime-domain-manifest.test.mjs`
- Create: `tests/chat/chat-shell-overview-recipe.test.mjs`
- Create: `tests/chat/chat-stage-selectors.test.mjs`
- Create: `tests/chat/chat-runtime-summary.test.mjs`
- Create: `tests/chat/chat-history-search-summary.test.mjs`
- Create: `tests/system/studio-web-chat-runtime-shell-recipe.test.mjs`

### Existing regression tests to keep green

- `tests/chat/chat-session-runtime-machine.test.mjs`
- `tests/chat/chat-runtime-view-model.test.ts`
- `tests/chat/chat-session-list-state.test.mjs`
- `tests/chat/conversation-pane-state.test.mjs`
- `tests/chat/service.history-page.test.mjs`
- `tests/chat/service.session-actions.test.mjs`
- `tests/system/studio-web-chat-shell-foundation.test.mjs`
- `tests/system/studio-web-chat-session-list-im.test.mjs`
- `tests/system/studio-web-chat-record-browser.test.mjs`
- `tests/system/studio-web-chat-rendering-settings.test.mjs`

---

### Task 1: Add the shared chat runtime-domain manifest and coverage baseline

**Files:**
- Create: `apps/web-vue/src/features/chat-v2/chat-runtime-domain-manifest.ts`
- Create: `scripts/studio-chat-runtime-coverage.mjs`
- Create: `docs/superpowers/inventories/studio-chat-runtime-coverage.json`
- Modify: `package.json`
- Test: `tests/chat/chat-runtime-domain-manifest.test.mjs`

- [ ] **Step 1: Write the failing tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const manifestPath = path.join(rootDir, 'apps/web-vue/src/features/chat-v2/chat-runtime-domain-manifest.ts');
const packageJsonPath = path.join(rootDir, 'package.json');
const outputPath = path.join(rootDir, 'docs/superpowers/inventories/studio-chat-runtime-coverage.json');

test('chat runtime manifest defines shell session history search and inspector sections', () => {
  assert.equal(fs.existsSync(manifestPath), true);
  const source = fs.readFileSync(manifestPath, 'utf8');
  assert.match(source, /key:\s*'shell'/);
  assert.match(source, /key:\s*'sessions'/);
  assert.match(source, /key:\s*'history'/);
  assert.match(source, /key:\s*'inspector'/);
  assert.match(source, /runtimeSurface:/);
});

test('chat runtime coverage script is wired in package json and produces a baseline', () => {
  const packageJson = fs.readFileSync(packageJsonPath, 'utf8');
  assert.match(packageJson, /"studio:chat-runtime-coverage"\s*:\s*"node scripts\/studio-chat-runtime-coverage\.mjs"/);

  const result = spawnSync('node', ['scripts/studio-chat-runtime-coverage.mjs'], {
    cwd: rootDir,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.existsSync(outputPath), true);
  const payload = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
  assert.ok(payload.sections.includes('shell'));
  assert.ok(payload.frontendFiles.includes('apps/web-vue/src/features/chat-v2/ChatShellPage.vue'));
  assert.ok(payload.backendFiles.includes('apps/api/modules/chat/service.ts'));
  assert.ok(payload.tests.includes('tests/chat/chat-session-runtime-machine.test.mjs'));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/chat/chat-runtime-domain-manifest.test.mjs`
Expected: FAIL because the runtime manifest, coverage script, and coverage baseline do not exist yet.

- [ ] **Step 3: Write the minimal implementation**

`apps/web-vue/src/features/chat-v2/chat-runtime-domain-manifest.ts`

```ts
export type ChatRuntimeSectionKey = 'shell' | 'sessions' | 'history' | 'inspector';

export interface ChatRuntimeSectionEntry {
  key: ChatRuntimeSectionKey;
  titleZh: string;
  titleEn: string;
  runtimeSurface: string;
  primaryFile: string;
}

export const CHAT_RUNTIME_DOMAIN_MANIFEST: ChatRuntimeSectionEntry[] = [
  {
    key: 'shell',
    titleZh: '会话壳层',
    titleEn: 'Shell',
    runtimeSurface: 'chat-shell',
    primaryFile: 'apps/web-vue/src/features/chat-v2/ChatShellPage.vue',
  },
  {
    key: 'sessions',
    titleZh: '会话索引',
    titleEn: 'Sessions',
    runtimeSurface: 'session-list',
    primaryFile: 'apps/web-vue/src/features/chat-v2/SessionListPanel.vue',
  },
  {
    key: 'history',
    titleZh: '历史与检索',
    titleEn: 'History',
    runtimeSurface: 'record-browser',
    primaryFile: 'apps/web-vue/src/features/chat-v2/ChatRecordBrowserPanel.vue',
  },
  {
    key: 'inspector',
    titleZh: '运行检视',
    titleEn: 'Inspector',
    runtimeSurface: 'inspector',
    primaryFile: 'apps/web-vue/src/features/chat-v2/InspectorPanel.vue',
  },
];
```

`scripts/studio-chat-runtime-coverage.mjs`

```js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputPath = path.join(rootDir, 'docs/superpowers/inventories/studio-chat-runtime-coverage.json');

const payload = {
  sections: ['shell', 'sessions', 'history', 'inspector'],
  frontendFiles: [
    'apps/web-vue/src/features/chat-v2/ChatShellPage.vue',
    'apps/web-vue/src/features/chat-v2/ConversationPane.vue',
    'apps/web-vue/src/features/chat-v2/SessionListPanel.vue',
    'apps/web-vue/src/features/chat-v2/ChatRecordBrowserPanel.vue',
    'apps/web-vue/src/features/chat-v2/InspectorPanel.vue',
    'apps/web-vue/src/features/chat-v2/chat-session-runtime-machine.ts',
    'apps/web-vue/src/features/chat-v2/chat-runtime-view-model.ts',
  ],
  backendFiles: [
    'apps/api/modules/chat/routes.ts',
    'apps/api/modules/chat/service.ts',
  ],
  tests: [
    'tests/chat/chat-session-runtime-machine.test.mjs',
    'tests/chat/chat-runtime-view-model.test.ts',
    'tests/chat/service.history-page.test.mjs',
    'tests/system/studio-web-chat-shell-foundation.test.mjs',
  ],
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
```

`package.json` (script excerpt)

```json
{
  "scripts": {
    "studio:chat-runtime-coverage": "node scripts/studio-chat-runtime-coverage.mjs"
  }
}
```

`docs/superpowers/inventories/studio-chat-runtime-coverage.json`

```json
{
  "sections": ["shell", "sessions", "history", "inspector"],
  "frontendFiles": [
    "apps/web-vue/src/features/chat-v2/ChatShellPage.vue",
    "apps/web-vue/src/features/chat-v2/ConversationPane.vue",
    "apps/web-vue/src/features/chat-v2/SessionListPanel.vue",
    "apps/web-vue/src/features/chat-v2/ChatRecordBrowserPanel.vue",
    "apps/web-vue/src/features/chat-v2/InspectorPanel.vue",
    "apps/web-vue/src/features/chat-v2/chat-session-runtime-machine.ts",
    "apps/web-vue/src/features/chat-v2/chat-runtime-view-model.ts"
  ],
  "backendFiles": [
    "apps/api/modules/chat/routes.ts",
    "apps/api/modules/chat/service.ts"
  ],
  "tests": [
    "tests/chat/chat-session-runtime-machine.test.mjs",
    "tests/chat/chat-runtime-view-model.test.ts",
    "tests/chat/service.history-page.test.mjs",
    "tests/system/studio-web-chat-shell-foundation.test.mjs"
  ]
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/chat/chat-runtime-domain-manifest.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add \
  apps/web-vue/src/features/chat-v2/chat-runtime-domain-manifest.ts \
  scripts/studio-chat-runtime-coverage.mjs \
  docs/superpowers/inventories/studio-chat-runtime-coverage.json \
  package.json \
  tests/chat/chat-runtime-domain-manifest.test.mjs

git commit -m "运行域：建立聊天清单"
```

### Task 2: Extract the chat shell overview recipe and runtime selectors

**Files:**
- Create: `apps/web-vue/src/features/chat-v2/chat-shell-overview-recipe.ts`
- Create: `apps/web-vue/src/features/chat-v2/chat-stage-selectors.ts`
- Modify: `apps/web-vue/src/features/chat-v2/ChatShellPage.vue`
- Test: `tests/chat/chat-shell-overview-recipe.test.mjs`
- Test: `tests/chat/chat-stage-selectors.test.mjs`
- Regression: `tests/system/studio-web-chat-shell-foundation.test.mjs`

- [ ] **Step 1: Write the failing tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const recipePath = path.join(rootDir, 'apps/web-vue/src/features/chat-v2/chat-shell-overview-recipe.ts');
const selectorsPath = path.join(rootDir, 'apps/web-vue/src/features/chat-v2/chat-stage-selectors.ts');
const shellPath = path.join(rootDir, 'apps/web-vue/src/features/chat-v2/ChatShellPage.vue');

test('chat shell exposes overview recipe and stage selectors', () => {
  assert.equal(fs.existsSync(recipePath), true);
  assert.equal(fs.existsSync(selectorsPath), true);
  const recipe = fs.readFileSync(recipePath, 'utf8');
  const selectors = fs.readFileSync(selectorsPath, 'utf8');
  assert.match(recipe, /buildChatShellQuickActions/);
  assert.match(recipe, /buildChatShellWarnings/);
  assert.match(selectors, /buildChatStageHeader/);
  assert.match(selectors, /buildChatHistoryStateSummary/);
});

test('chat shell page consumes the extracted runtime recipe and selectors', () => {
  const shell = fs.readFileSync(shellPath, 'utf8');
  assert.match(shell, /chat-shell-overview-recipe/);
  assert.match(shell, /chat-stage-selectors/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/chat/chat-shell-overview-recipe.test.mjs tests/chat/chat-stage-selectors.test.mjs`
Expected: FAIL because the recipe and selector files do not exist yet.

- [ ] **Step 3: Write the minimal implementation**

`apps/web-vue/src/features/chat-v2/chat-shell-overview-recipe.ts`

```ts
export function buildChatShellQuickActions(text: (zh: string, en: string) => string) {
  return [
    {
      key: 'new-chat',
      label: text('新建会话', 'New chat'),
      copy: text('从当前 Agent 列表里快速新建私聊会话。', 'Start a fresh direct chat from the current agent list.'),
    },
    {
      key: 'history-search',
      label: text('检索历史', 'Search history'),
      copy: text('通过 record browser 在当前会话内检索历史消息。', 'Search current-session history through the record browser.'),
    },
  ];
}

export function buildChatShellWarnings(text: (zh: string, en: string) => string, input: {
  gatewayWarning: string;
  accessError: string;
}) {
  return [input.gatewayWarning, input.accessError]
    .filter(Boolean)
    .map((message) => ({
      tone: 'warning',
      text: message,
      dismissLabel: text('关闭', 'Dismiss'),
    }));
}
```

`apps/web-vue/src/features/chat-v2/chat-stage-selectors.ts`

```ts
export function buildChatStageHeader(input: {
  title: string;
  subtitle: string;
  agentName: string;
}) {
  return {
    title: input.title,
    subtitle: input.subtitle,
    agentName: input.agentName,
  };
}

export function buildChatHistoryStateSummary(input: {
  historyLoadingInitial: boolean;
  historyLoadingBefore: boolean;
  historyLoadingAfter: boolean;
  hasMoreBefore: boolean;
  hasMoreAfter: boolean;
}) {
  return {
    loading: input.historyLoadingInitial || input.historyLoadingBefore || input.historyLoadingAfter,
    hasMoreBefore: input.hasMoreBefore,
    hasMoreAfter: input.hasMoreAfter,
  };
}
```

`apps/web-vue/src/features/chat-v2/ChatShellPage.vue` (script excerpt)

```ts
import { buildChatShellQuickActions, buildChatShellWarnings } from './chat-shell-overview-recipe';
import { buildChatStageHeader, buildChatHistoryStateSummary } from './chat-stage-selectors';
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/chat/chat-shell-overview-recipe.test.mjs tests/chat/chat-stage-selectors.test.mjs tests/system/studio-web-chat-shell-foundation.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add \
  apps/web-vue/src/features/chat-v2/chat-shell-overview-recipe.ts \
  apps/web-vue/src/features/chat-v2/chat-stage-selectors.ts \
  apps/web-vue/src/features/chat-v2/ChatShellPage.vue \
  tests/chat/chat-shell-overview-recipe.test.mjs \
  tests/chat/chat-stage-selectors.test.mjs

git commit -m "运行域：抽离聊天壳层配方"
```

### Task 3: Refactor the session list and organizer shell selectors

**Files:**
- Modify: `apps/web-vue/src/features/chat-v2/SessionListPanel.vue`
- Modify: `apps/web-vue/src/features/chat-v2/chat-session-list-selection.ts`
- Modify: `apps/web-vue/src/features/chat-v2/session-list-selection.ts`
- Modify: `apps/web-vue/src/features/chat-v2/session-list-shared.css`
- Test: `tests/chat/chat-session-list-state.test.mjs`
- Regression: `tests/system/studio-web-chat-session-list-im.test.mjs`

- [ ] **Step 1: Write the failing tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const panelPath = path.join(rootDir, 'apps/web-vue/src/features/chat-v2/SessionListPanel.vue');
const statePath = path.join(rootDir, 'apps/web-vue/src/features/chat-v2/chat-session-list-selection.ts');

test('session list panel consumes extracted organizer selection state', () => {
  const panel = fs.readFileSync(panelPath, 'utf8');
  const state = fs.readFileSync(statePath, 'utf8');
  assert.match(panel, /chat-session-list-selection/);
  assert.match(state, /buildSessionListSelectionSummary/);
  assert.match(state, /buildOrganizerFolderSummary/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/chat/chat-session-list-state.test.mjs`
Expected: FAIL because the new selection summary seam does not exist yet.

- [ ] **Step 3: Write the minimal implementation**

`apps/web-vue/src/features/chat-v2/chat-session-list-selection.ts` (additive excerpt)

```ts
export function buildSessionListSelectionSummary(input: {
  selectedSessionKey: string | null;
  inspectMode: boolean;
  activeCount: number;
  archivedCount: number;
}) {
  return {
    hasSelection: Boolean(input.selectedSessionKey),
    inspectMode: input.inspectMode,
    activeCount: input.activeCount,
    archivedCount: input.archivedCount,
  };
}

export function buildOrganizerFolderSummary(input: {
  folderCount: number;
  topLevelSessionCount: number;
}) {
  return {
    folderCount: input.folderCount,
    topLevelSessionCount: input.topLevelSessionCount,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/chat/chat-session-list-state.test.mjs tests/system/studio-web-chat-session-list-im.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add \
  apps/web-vue/src/features/chat-v2/SessionListPanel.vue \
  apps/web-vue/src/features/chat-v2/chat-session-list-selection.ts \
  apps/web-vue/src/features/chat-v2/session-list-selection.ts \
  apps/web-vue/src/features/chat-v2/session-list-shared.css

git commit -m "运行域：收口会话列表状态"
```

### Task 4: Refactor runtime-machine and render-model helpers for shell consumption

**Files:**
- Modify: `apps/web-vue/src/features/chat-v2/chat-session-runtime-machine.ts`
- Modify: `apps/web-vue/src/features/chat-v2/chat-runtime-view-model.ts`
- Test: `tests/chat/chat-session-runtime-machine.test.mjs`
- Test: `tests/chat/chat-runtime-view-model.test.ts`

- [ ] **Step 1: Write the failing tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const runtimePath = path.join(rootDir, 'apps/web-vue/src/features/chat-v2/chat-session-runtime-machine.ts');
const viewModelPath = path.join(rootDir, 'apps/web-vue/src/features/chat-v2/chat-runtime-view-model.ts');

test('runtime machine exposes shell-friendly summary helpers', () => {
  const runtime = fs.readFileSync(runtimePath, 'utf8');
  assert.match(runtime, /buildChatRuntimeSummary/);
  assert.match(runtime, /buildChatOverlaySummary/);
});

test('runtime view model consumes shell-friendly runtime summaries', () => {
  const viewModel = fs.readFileSync(viewModelPath, 'utf8');
  assert.match(viewModel, /buildChatRuntimeSummary/);
  assert.match(viewModel, /buildChatOverlaySummary/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/chat/chat-session-runtime-machine.test.mjs tests/chat/chat-runtime-view-model.test.ts`
Expected: FAIL because the shell-friendly runtime summary helpers do not exist yet.

- [ ] **Step 3: Write the minimal implementation**

`apps/web-vue/src/features/chat-v2/chat-session-runtime-machine.ts` (additive excerpt)

```ts
export function buildChatRuntimeSummary(state: ChatSessionRuntimeMachineState) {
  return {
    sessionKey: state.sessionKey,
    canonicalCount: state.canonicalMessageLedger.length,
    transientRunCount: Object.keys(state.transientRunState).length,
    overlayCount: Object.keys(state.processLedger).length,
  };
}

export function buildChatOverlaySummary(renderModel: ChatSessionRuntimeRenderModel) {
  return {
    messageCount: renderModel.messages.length,
    overlayCount: renderModel.overlays.length,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/chat/chat-session-runtime-machine.test.mjs tests/chat/chat-runtime-view-model.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add \
  apps/web-vue/src/features/chat-v2/chat-session-runtime-machine.ts \
  apps/web-vue/src/features/chat-v2/chat-runtime-view-model.ts \
  tests/chat/chat-session-runtime-machine.test.mjs \
  tests/chat/chat-runtime-view-model.test.ts

git commit -m "运行域：收口运行态摘要"
```

### Task 5: Add backend runtime summary and history-search helper seams

**Files:**
- Create: `apps/api/modules/chat/runtime-summary.ts`
- Create: `apps/api/modules/chat/history-search-summary.ts`
- Modify: `apps/api/modules/chat/service.ts`
- Modify: `apps/api/modules/chat/routes.ts`
- Test: `tests/chat/chat-runtime-summary.test.mjs`
- Test: `tests/chat/chat-history-search-summary.test.mjs`
- Regression: `tests/chat/service.history-page.test.mjs`
- Regression: `tests/chat/service.session-actions.test.mjs`

- [ ] **Step 1: Write the failing tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const runtimeSummaryPath = path.join(rootDir, 'apps/api/modules/chat/runtime-summary.ts');
const historySummaryPath = path.join(rootDir, 'apps/api/modules/chat/history-search-summary.ts');

test('backend chat runtime summary helpers exist', () => {
  assert.equal(fs.existsSync(runtimeSummaryPath), true);
  const source = fs.readFileSync(runtimeSummaryPath, 'utf8');
  assert.match(source, /buildChatSessionRuntimeSummary/);
  assert.match(source, /buildChatDiagnosticsSummary/);
});

test('backend chat history search helpers exist', () => {
  assert.equal(fs.existsSync(historySummaryPath), true);
  const source = fs.readFileSync(historySummaryPath, 'utf8');
  assert.match(source, /buildHistorySearchSummary/);
  assert.match(source, /groupHistoryMatchesByDay/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/chat/chat-runtime-summary.test.mjs tests/chat/chat-history-search-summary.test.mjs`
Expected: FAIL because the summary helper files do not exist yet.

- [ ] **Step 3: Write the minimal implementation**

`apps/api/modules/chat/runtime-summary.ts`

```ts
import type { ChatRuntimeState, ChatDiagnostics } from '../../../../types/chat.js';

export function buildChatSessionRuntimeSummary(runtime: ChatRuntimeState | null) {
  return {
    connected: Boolean(runtime?.gatewayConnected),
    writable: Boolean(runtime?.sessionWritable),
    state: runtime?.state || 'unknown',
    activeRunId: runtime?.activeRunId || null,
  };
}

export function buildChatDiagnosticsSummary(diagnostics: ChatDiagnostics | null) {
  return {
    notes: diagnostics?.notes || [],
    warnings: diagnostics?.warnings || [],
  };
}
```

`apps/api/modules/chat/history-search-summary.ts`

```ts
import type { ChatHistorySearchMatch } from '../../../../types/chat.js';

export function groupHistoryMatchesByDay(matches: ChatHistorySearchMatch[]) {
  return matches.reduce((groups, match) => {
    const day = String(match.createdAt || '').slice(0, 10) || 'unknown';
    groups[day] ||= [];
    groups[day].push(match);
    return groups;
  }, /** @type {Record<string, ChatHistorySearchMatch[]>} */ ({}));
}

export function buildHistorySearchSummary(matches: ChatHistorySearchMatch[]) {
  const groups = groupHistoryMatchesByDay(matches);
  return {
    total: matches.length,
    dayCount: Object.keys(groups).length,
    groups,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/chat/chat-runtime-summary.test.mjs tests/chat/chat-history-search-summary.test.mjs tests/chat/service.history-page.test.mjs tests/chat/service.session-actions.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add \
  apps/api/modules/chat/runtime-summary.ts \
  apps/api/modules/chat/history-search-summary.ts \
  apps/api/modules/chat/service.ts \
  apps/api/modules/chat/routes.ts \
  tests/chat/chat-runtime-summary.test.mjs \
  tests/chat/chat-history-search-summary.test.mjs

git commit -m "运行域：补齐后端摘要"
```

### Task 6: Run the chat-runtime gate and capture follow-up splits

**Files:**
- Modify: `docs/superpowers/plans/2026-04-12-studio-chat-sessions-runtime-redesign.md`
- Verify: `apps/web-vue/src/features/chat-v2/chat-runtime-domain-manifest.ts`
- Verify: `apps/web-vue/src/features/chat-v2/chat-shell-overview-recipe.ts`
- Verify: `apps/web-vue/src/features/chat-v2/chat-stage-selectors.ts`
- Verify: `apps/web-vue/src/features/chat-v2/chat-session-runtime-machine.ts`
- Verify: `apps/api/modules/chat/runtime-summary.ts`
- Verify: `apps/api/modules/chat/history-search-summary.ts`
- Verify: `scripts/studio-chat-runtime-coverage.mjs`

- [ ] **Step 1: Append the exit criteria to the plan footer**

```md
## Chat runtime exit criteria

- Chat shell, session list, history browser, and inspector all consume extracted runtime-domain seams.
- Frontend runtime selectors and backend runtime summaries exist as explicit helper layers rather than implicit page logic.
- A committed chat-runtime coverage baseline exists and can be regenerated without noisy drift.
- Targeted runtime-domain node regressions all pass.
- `npm run typecheck:web` passes.
- Every completed task is committed separately with a short Chinese message.

## Required follow-up plans

1. System and Terminal redesign
2. Room / Workflow co-design plan after user requirement sync
```

- [ ] **Step 2: Run the chat-runtime verification gate**

Run: `node --test tests/chat/chat-runtime-domain-manifest.test.mjs tests/chat/chat-shell-overview-recipe.test.mjs tests/chat/chat-stage-selectors.test.mjs tests/chat/chat-runtime-summary.test.mjs tests/chat/chat-history-search-summary.test.mjs tests/chat/chat-session-runtime-machine.test.mjs tests/chat/chat-runtime-view-model.test.ts tests/chat/chat-session-list-state.test.mjs tests/chat/conversation-pane-state.test.mjs tests/chat/service.history-page.test.mjs tests/chat/service.session-actions.test.mjs tests/system/studio-web-chat-shell-foundation.test.mjs tests/system/studio-web-chat-session-list-im.test.mjs tests/system/studio-web-chat-record-browser.test.mjs tests/system/studio-web-chat-rendering-settings.test.mjs && npm run typecheck:web && npm run studio:chat-runtime-coverage`
Expected: PASS.

- [ ] **Step 3: Fix only the smallest seam that fails**

If the gate fails, fix only one of these seams before re-running:

- runtime manifest / coverage files
- shell recipe / selector files
- session list selection files
- runtime machine / view model files
- backend runtime summary / history search files

Do not widen into System / Terminal or Room / Workflow.

- [ ] **Step 4: Re-run the chat-runtime verification gate**

Run: `node --test tests/chat/chat-runtime-domain-manifest.test.mjs tests/chat/chat-shell-overview-recipe.test.mjs tests/chat/chat-stage-selectors.test.mjs tests/chat/chat-runtime-summary.test.mjs tests/chat/chat-history-search-summary.test.mjs tests/chat/chat-session-runtime-machine.test.mjs tests/chat/chat-runtime-view-model.test.ts tests/chat/chat-session-list-state.test.mjs tests/chat/conversation-pane-state.test.mjs tests/chat/service.history-page.test.mjs tests/chat/service.session-actions.test.mjs tests/system/studio-web-chat-shell-foundation.test.mjs tests/system/studio-web-chat-session-list-im.test.mjs tests/system/studio-web-chat-record-browser.test.mjs tests/system/studio-web-chat-rendering-settings.test.mjs && npm run typecheck:web && npm run studio:chat-runtime-coverage`
Expected: PASS end-to-end.

- [ ] **Step 5: Commit the closeout**

```bash
git add \
  docs/superpowers/plans/2026-04-12-studio-chat-sessions-runtime-redesign.md \
  docs/superpowers/inventories/studio-chat-runtime-coverage.json

git commit -m "运行域：完成阶段收口"
```

## Chat runtime exit criteria

- Chat shell, session list, history browser, and inspector all consume extracted runtime-domain seams.
- Frontend runtime selectors and backend runtime summaries exist as explicit helper layers rather than implicit page logic.
- A committed chat-runtime coverage baseline exists and can be regenerated without noisy drift.
- Targeted runtime-domain node regressions all pass.
- `npm run typecheck:web` passes.
- Every completed task is committed separately with a short Chinese message.

## Required follow-up plans

1. System and Terminal redesign
2. Room / Workflow co-design plan after user requirement sync
