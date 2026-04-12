# Studio Management Domain Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the management domain of OpenClaw Studio so Config, Agents, Channels, Skills, and Cron share one shell-era information model, one mapping baseline, and one consistent workspace interaction pattern aligned with OpenClaw 4.10.

**Architecture:** Build this as the next layer on top of the completed shell foundation rather than a full rewrite. First add a shared management-domain contract and coverage baseline, then refit each management module onto that contract one subsystem at a time, keeping current working pages alive while shrinking large local view files into focused domain adapters and workspace sections.

**Tech Stack:** Vue 3, Vue Router, TypeScript, node:test, existing Studio API modules, CSS in `apps/web-vue/src/style.css`, Node scripts under `scripts/`, existing typed payloads in `types/`

---

## Scope check

The total Studio blueprint covers multiple independent subsystems. This plan covers **only the management domain**:

- Config Center
- Agents Center
- Channels Center
- Skills Center
- Cron Center

This plan does **not** cover:

- `Chat / Sessions`
- `System / Terminal`
- `Room / Workflow` detailed design or implementation

Write separate follow-up plans before implementing those other domains.

## File structure and responsibilities

### Shared management-domain foundation files

- Create: `apps/web-vue/src/features/management/management-domain-manifest.ts` — shared domain metadata for Config / Agents / Channels / Skills / Cron
- Create: `apps/web-vue/src/features/management/use-management-domain-navigation.ts` — shared management workspace navigation model
- Create: `apps/web-vue/src/features/management/management-overview-recipe.ts` — common summary cards / warnings / next-step recipe builders for management pages
- Create: `scripts/studio-management-coverage.mjs` — machine-readable coverage snapshot for management routes, API modules, view files, and regression tests
- Create: `docs/superpowers/inventories/studio-management-coverage.json` — committed management-domain coverage baseline

### Config domain files

- Modify: `apps/web-vue/src/views/ConfigView.vue` — shrink to shell + stage composition only
- Modify: `apps/web-vue/src/features/config/ConfigEditorPage.vue` — split oversized page responsibilities
- Create: `apps/web-vue/src/features/config/config-workspace-sections.ts` — section registry for overview / domains / advanced entry points
- Create: `apps/web-vue/src/features/config/config-overview-recipe.ts` — config summary / diff / quick-action recipe
- Modify: `apps/web-vue/src/features/config/api.ts` — keep API surface minimal and aligned with recipes
- Modify: `apps/api/modules/config/service.ts` — surface management coverage metadata and stable summary helpers without changing persistence semantics

### Agents domain files

- Modify: `apps/web-vue/src/views/AgentsView.vue` — reduce to workspace shell composition
- Modify: `apps/web-vue/src/features/agents/AgentsWorkspaceLayout.vue` — consume shared management contract and section recipes
- Create: `apps/web-vue/src/features/agents/agents-overview-recipe.ts` — roster / quick-config / binding / session summary recipe
- Modify: `apps/web-vue/src/features/agents/api.ts` — align response shaping with recipe layer
- Modify: `apps/api/modules/agents/service.ts` — expose stable summary slices for roster / docs / bindings / sessions

### Channels domain files

- Modify: `apps/web-vue/src/views/ChannelsView.vue` — reduce to workspace shell composition
- Modify: `apps/web-vue/src/features/channels/ChannelsWorkspaceLayout.vue` — consume shared management contract and section recipes
- Create: `apps/web-vue/src/features/channels/channels-overview-recipe.ts` — provider / account / binding / pairing summary recipe
- Modify: `apps/web-vue/src/features/channels/api.ts` — align API helpers with recipe consumption
- Modify: `apps/api/modules/channels/service.ts` — expose stable provider/account/access/binding summary seams

### Skills domain files

- Modify: `apps/web-vue/src/views/SkillsView.vue` — reduce to shell composition
- Modify: `apps/web-vue/src/features/skills/SkillsControlPage.vue` — split installed / marketplace / plugins summary wiring
- Create: `apps/web-vue/src/features/skills/skills-overview-recipe.ts` — installed / marketplace / plugin settings recipe
- Modify: `apps/web-vue/src/features/skills/api.ts` — align summary and actions with recipe layer
- Modify: `apps/api/modules/skills/service.ts` — expose stable summary seams for installed, marketplace, and plugin management

### Cron domain files

- Modify: `apps/web-vue/src/views/CronView.vue` — reduce to shell composition
- Modify: `apps/web-vue/src/features/cron/CronControlPage.vue` — split roster / stage / run-history recipe wiring
- Create: `apps/web-vue/src/features/cron/cron-overview-recipe.ts` — job list / scheduler summary / action recipe
- Modify: `apps/web-vue/src/features/cron/api.ts` — align summary helpers with recipe layer
- Modify: `apps/api/modules/cron/service.ts` — expose stable summary seams for list, detail, run state, and scheduler metadata

### Shared tests and verification files

- Create: `tests/system/studio-management-domain-manifest.test.mjs`
- Create: `tests/system/studio-management-coverage.test.mjs`
- Create: `tests/system/studio-web-config-workspace-recipe.test.mjs`
- Create: `tests/system/studio-web-agents-workspace-recipe.test.mjs`
- Create: `tests/system/studio-web-channels-workspace-recipe.test.mjs`
- Create: `tests/system/studio-web-skills-workspace-recipe.test.mjs`
- Create: `tests/system/studio-web-cron-workspace-recipe.test.mjs`

### Existing regression tests to keep green

- `tests/system/studio-web-config-workbench.test.mjs`
- `tests/system/studio-web-agents-workbench.test.mjs`
- `tests/system/studio-web-channels-workspace.test.mjs`
- `tests/system/studio-web-cron-tabs-primitives.test.mjs`
- `tests/system/config-service.test.mjs`
- `tests/system/agents-service.test.mjs`
- `tests/system/channels-service.test.mjs`
- `tests/system/channels-field-alignment.test.ts`

---

### Task 1: Add the shared management-domain manifest and coverage baseline

**Files:**
- Create: `apps/web-vue/src/features/management/management-domain-manifest.ts`
- Create: `apps/web-vue/src/features/management/use-management-domain-navigation.ts`
- Create: `scripts/studio-management-coverage.mjs`
- Create: `docs/superpowers/inventories/studio-management-coverage.json`
- Modify: `package.json`
- Test: `tests/system/studio-management-domain-manifest.test.mjs`
- Test: `tests/system/studio-management-coverage.test.mjs`

- [ ] **Step 1: Write the failing tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const manifestPath = path.join(rootDir, 'apps/web-vue/src/features/management/management-domain-manifest.ts');
const navPath = path.join(rootDir, 'apps/web-vue/src/features/management/use-management-domain-navigation.ts');
const packageJsonPath = path.join(rootDir, 'package.json');

test('management manifest defines config agents channels skills cron domains', () => {
  assert.equal(fs.existsSync(manifestPath), true);
  const source = fs.readFileSync(manifestPath, 'utf8');
  assert.match(source, /key:\s*'config'/);
  assert.match(source, /key:\s*'agents'/);
  assert.match(source, /key:\s*'channels'/);
  assert.match(source, /key:\s*'skills'/);
  assert.match(source, /key:\s*'cron'/);
  assert.match(source, /workspaceType:/);
});

test('management navigation composable and coverage script are wired into the repo', () => {
  assert.equal(fs.existsSync(navPath), true);
  const navSource = fs.readFileSync(navPath, 'utf8');
  const packageJson = fs.readFileSync(packageJsonPath, 'utf8');
  assert.match(navSource, /managementDomainManifest/);
  assert.match(packageJson, /"studio:management-coverage"\s*:\s*"node scripts\/studio-management-coverage\.mjs"/);
});
```

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const outputPath = path.join(rootDir, 'docs/superpowers/inventories/studio-management-coverage.json');

test('management coverage script writes config agents channels skills cron baseline', () => {
  const result = spawnSync('node', ['scripts/studio-management-coverage.mjs'], {
    cwd: rootDir,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.existsSync(outputPath), true);
  const payload = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
  assert.deepEqual(payload.domains, ['agents', 'channels', 'config', 'cron', 'skills']);
  assert.ok(payload.webViews.includes('apps/web-vue/src/views/ConfigView.vue'));
  assert.ok(payload.apiModules.includes('apps/api/modules/config/service.ts'));
  assert.ok(payload.tests.includes('tests/system/config-service.test.mjs'));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/system/studio-management-domain-manifest.test.mjs tests/system/studio-management-coverage.test.mjs`
Expected: FAIL because the management-domain manifest, coverage script, coverage JSON, and package script do not exist yet.

- [ ] **Step 3: Write the minimal implementation**

`apps/web-vue/src/features/management/management-domain-manifest.ts`

```ts
export type ManagementDomainKey = 'config' | 'agents' | 'channels' | 'skills' | 'cron';

export type ManagementDomainEntry = {
  key: ManagementDomainKey;
  titleZh: string;
  titleEn: string;
  route: string;
  workspaceType: 'editor' | 'workspace' | 'catalog';
  apiModule: string;
  primaryView: string;
};

export const managementDomainManifest: ManagementDomainEntry[] = [
  {
    key: 'config',
    titleZh: '系统配置',
    titleEn: 'Config',
    route: '/config',
    workspaceType: 'editor',
    apiModule: 'config',
    primaryView: 'apps/web-vue/src/views/ConfigView.vue',
  },
  {
    key: 'agents',
    titleZh: 'Agent 管理',
    titleEn: 'Agents',
    route: '/agents',
    workspaceType: 'workspace',
    apiModule: 'agents',
    primaryView: 'apps/web-vue/src/views/AgentsView.vue',
  },
  {
    key: 'channels',
    titleZh: '频道管理',
    titleEn: 'Channels',
    route: '/channels',
    workspaceType: 'workspace',
    apiModule: 'channels',
    primaryView: 'apps/web-vue/src/views/ChannelsView.vue',
  },
  {
    key: 'skills',
    titleZh: '技能管理',
    titleEn: 'Skills',
    route: '/skills',
    workspaceType: 'catalog',
    apiModule: 'skills',
    primaryView: 'apps/web-vue/src/views/SkillsView.vue',
  },
  {
    key: 'cron',
    titleZh: '定时任务',
    titleEn: 'Cron',
    route: '/cron',
    workspaceType: 'workspace',
    apiModule: 'cron',
    primaryView: 'apps/web-vue/src/views/CronView.vue',
  },
];
```

`apps/web-vue/src/features/management/use-management-domain-navigation.ts`

```ts
import { computed } from 'vue';
import { useLocalePreference } from '../../shared/locale';
import { managementDomainManifest } from './management-domain-manifest';

export function useManagementDomainNavigation() {
  const { text } = useLocalePreference();

  const domains = computed(() => managementDomainManifest.map((domain) => ({
    key: domain.key,
    route: domain.route,
    workspaceType: domain.workspaceType,
    label: text(domain.titleZh, domain.titleEn),
  })));

  return { domains };
}
```

`scripts/studio-management-coverage.mjs`

```js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputPath = path.join(rootDir, 'docs/superpowers/inventories/studio-management-coverage.json');

const payload = {
  domains: ['agents', 'channels', 'config', 'cron', 'skills'],
  webViews: [
    'apps/web-vue/src/views/AgentsView.vue',
    'apps/web-vue/src/views/ChannelsView.vue',
    'apps/web-vue/src/views/ConfigView.vue',
    'apps/web-vue/src/views/CronView.vue',
    'apps/web-vue/src/views/SkillsView.vue',
  ],
  apiModules: [
    'apps/api/modules/agents/service.ts',
    'apps/api/modules/channels/service.ts',
    'apps/api/modules/config/service.ts',
    'apps/api/modules/cron/service.ts',
    'apps/api/modules/skills/service.ts',
  ],
  tests: [
    'tests/system/agents-service.test.mjs',
    'tests/system/channels-service.test.mjs',
    'tests/system/config-service.test.mjs',
    'tests/system/studio-web-agents-workbench.test.mjs',
    'tests/system/studio-web-channels-workspace.test.mjs',
    'tests/system/studio-web-config-workbench.test.mjs',
    'tests/system/studio-web-cron-tabs-primitives.test.mjs',
  ],
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
```

`package.json` (script excerpt)

```json
{
  "scripts": {
    "studio:management-coverage": "node scripts/studio-management-coverage.mjs"
  }
}
```

`docs/superpowers/inventories/studio-management-coverage.json`

```json
{
  "domains": ["agents", "channels", "config", "cron", "skills"],
  "webViews": [
    "apps/web-vue/src/views/AgentsView.vue",
    "apps/web-vue/src/views/ChannelsView.vue",
    "apps/web-vue/src/views/ConfigView.vue",
    "apps/web-vue/src/views/CronView.vue",
    "apps/web-vue/src/views/SkillsView.vue"
  ],
  "apiModules": [
    "apps/api/modules/agents/service.ts",
    "apps/api/modules/channels/service.ts",
    "apps/api/modules/config/service.ts",
    "apps/api/modules/cron/service.ts",
    "apps/api/modules/skills/service.ts"
  ],
  "tests": [
    "tests/system/agents-service.test.mjs",
    "tests/system/channels-service.test.mjs",
    "tests/system/config-service.test.mjs",
    "tests/system/studio-web-agents-workbench.test.mjs",
    "tests/system/studio-web-channels-workspace.test.mjs",
    "tests/system/studio-web-config-workbench.test.mjs",
    "tests/system/studio-web-cron-tabs-primitives.test.mjs"
  ]
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/system/studio-management-domain-manifest.test.mjs tests/system/studio-management-coverage.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add \
  apps/web-vue/src/features/management/management-domain-manifest.ts \
  apps/web-vue/src/features/management/use-management-domain-navigation.ts \
  scripts/studio-management-coverage.mjs \
  docs/superpowers/inventories/studio-management-coverage.json \
  package.json \
  tests/system/studio-management-domain-manifest.test.mjs \
  tests/system/studio-management-coverage.test.mjs

git commit -m "管理域：建立统一清单"
```

### Task 2: Refactor Config into a shell-era workspace model

**Files:**
- Create: `apps/web-vue/src/features/config/config-overview-recipe.ts`
- Create: `apps/web-vue/src/features/config/config-workspace-sections.ts`
- Modify: `apps/web-vue/src/views/ConfigView.vue`
- Modify: `apps/web-vue/src/features/config/ConfigEditorPage.vue`
- Modify: `apps/web-vue/src/features/config/api.ts`
- Modify: `apps/api/modules/config/service.ts`
- Test: `tests/system/studio-web-config-workspace-recipe.test.mjs`
- Regression: `tests/system/studio-web-config-workbench.test.mjs`
- Regression: `tests/system/config-service.test.mjs`

- [ ] **Step 1: Write the failing tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const recipePath = path.join(rootDir, 'apps/web-vue/src/features/config/config-overview-recipe.ts');
const sectionsPath = path.join(rootDir, 'apps/web-vue/src/features/config/config-workspace-sections.ts');
const viewPath = path.join(rootDir, 'apps/web-vue/src/views/ConfigView.vue');

test('config workspace exposes overview recipe and section registry', () => {
  assert.equal(fs.existsSync(recipePath), true);
  assert.equal(fs.existsSync(sectionsPath), true);
  const recipe = fs.readFileSync(recipePath, 'utf8');
  const sections = fs.readFileSync(sectionsPath, 'utf8');
  assert.match(recipe, /buildConfigQuickActions/);
  assert.match(recipe, /buildConfigOverviewSignals/);
  assert.match(sections, /configWorkspaceSections/);
  assert.match(sections, /advanced/);
});

test('config view uses workspace recipe files instead of owning all workbench semantics locally', () => {
  const view = fs.readFileSync(viewPath, 'utf8');
  assert.match(view, /config-overview-recipe/);
  assert.match(view, /config-workspace-sections/);
});
```

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const servicePath = path.join(rootDir, 'apps/api/modules/config/service.ts');

test('config service exposes stable management summary helpers', () => {
  const source = fs.readFileSync(servicePath, 'utf8');
  assert.match(source, /buildConfigOverviewSummary/);
  assert.match(source, /buildConfigCoverageSummary/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/system/studio-web-config-workspace-recipe.test.mjs tests/system/config-service.test.mjs`
Expected: FAIL because the new recipe files and service helpers do not exist yet.

- [ ] **Step 3: Write the minimal implementation**

`apps/web-vue/src/features/config/config-workspace-sections.ts`

```ts
export const configWorkspaceSections = [
  { key: 'model', titleZh: '模型与默认值', titleEn: 'Models and Defaults', advanced: false },
  { key: 'session', titleZh: '会话与消息', titleEn: 'Session and Messages', advanced: false },
  { key: 'gateway', titleZh: 'Gateway 与运行时', titleEn: 'Gateway and Runtime', advanced: false },
  { key: 'browser', titleZh: '浏览器与注入', titleEn: 'Browser and Injection', advanced: true },
  { key: 'plugins', titleZh: '插件与技能', titleEn: 'Plugins and Skills', advanced: true },
  { key: 'logging', titleZh: '日志与诊断', titleEn: 'Logging and Diagnostics', advanced: true },
  { key: 'advanced', titleZh: '高级总览', titleEn: 'Advanced', advanced: true },
] as const;
```

`apps/web-vue/src/features/config/config-overview-recipe.ts`

```ts
import type { ConfigSummaryPayload } from '../../../../../types/config';
import { configWorkspaceSections } from './config-workspace-sections';

export function buildConfigQuickActions(text: (zh: string, en: string) => string) {
  return [
    {
      key: 'models',
      label: text('检查默认模型', 'Review default models'),
      copy: text('先确认默认模型、图片模型和生成模型回退链。', 'Start with default, image, and generation model fallback chains.'),
      section: 'model',
    },
    {
      key: 'gateway',
      label: text('检查 Gateway 配置', 'Review gateway settings'),
      copy: text('确认 Gateway、sandbox 与运行时入口是否一致。', 'Confirm gateway, sandbox, and runtime entry settings.'),
      section: 'gateway',
    },
  ];
}

export function buildConfigOverviewSignals(summary: ConfigSummaryPayload | null, text: (zh: string, en: string) => string) {
  if (!summary) {
    return [{ label: text('配置域', 'Config domains'), value: '--', detail: text('等待配置摘要', 'Waiting for config summary') }];
  }

  return [
    {
      label: text('配置域', 'Config domains'),
      value: String(configWorkspaceSections.length),
      detail: text('当前配置工作区分组数量', 'Current number of config workspace groups'),
    },
    {
      label: text('Provider 数量', 'Provider count'),
      value: String(summary.providers.length),
      detail: text('当前接入的模型 Provider 数量', 'Configured model providers'),
    },
  ];
}
```

`apps/api/modules/config/service.ts` (additive excerpt)

```ts
export function buildConfigOverviewSummary(summary: ConfigSummaryPayload) {
  return {
    providerCount: summary.providers.length,
    channelCount: summary.channels.length,
    defaultsModel: summary.defaults.model,
  };
}

export function buildConfigCoverageSummary(summary: ConfigSummaryPayload) {
  return {
    providerCount: summary.providers.length,
    hasBrowserProfiles: Boolean(summary.browser?.profiles?.length),
    hasPluginInstalls: Boolean(summary.plugins?.installs?.length),
  };
}
```

`apps/web-vue/src/views/ConfigView.vue` (script excerpt)

```ts
import ConfigEditorPage from '../features/config/ConfigEditorPage.vue';
import { configWorkspaceSections } from '../features/config/config-workspace-sections';
import { buildConfigOverviewSignals, buildConfigQuickActions } from '../features/config/config-overview-recipe';
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/system/studio-web-config-workspace-recipe.test.mjs tests/system/studio-web-config-workbench.test.mjs tests/system/config-service.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add \
  apps/web-vue/src/features/config/config-overview-recipe.ts \
  apps/web-vue/src/features/config/config-workspace-sections.ts \
  apps/web-vue/src/views/ConfigView.vue \
  apps/web-vue/src/features/config/ConfigEditorPage.vue \
  apps/web-vue/src/features/config/api.ts \
  apps/api/modules/config/service.ts \
  tests/system/studio-web-config-workspace-recipe.test.mjs

git commit -m "配置：重构工作区模型"
```

### Task 3: Refactor Agents into a roster-plus-stage management workspace

**Files:**
- Create: `apps/web-vue/src/features/agents/agents-overview-recipe.ts`
- Modify: `apps/web-vue/src/views/AgentsView.vue`
- Modify: `apps/web-vue/src/features/agents/AgentsWorkspaceLayout.vue`
- Modify: `apps/web-vue/src/features/agents/api.ts`
- Modify: `apps/api/modules/agents/service.ts`
- Test: `tests/system/studio-web-agents-workspace-recipe.test.mjs`
- Regression: `tests/system/studio-web-agents-workbench.test.mjs`
- Regression: `tests/system/agents-service.test.mjs`

- [ ] **Step 1: Write the failing tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const recipePath = path.join(rootDir, 'apps/web-vue/src/features/agents/agents-overview-recipe.ts');
const layoutPath = path.join(rootDir, 'apps/web-vue/src/features/agents/AgentsWorkspaceLayout.vue');

test('agents workspace exposes a roster-and-stage recipe layer', () => {
  assert.equal(fs.existsSync(recipePath), true);
  const recipe = fs.readFileSync(recipePath, 'utf8');
  const layout = fs.readFileSync(layoutPath, 'utf8');
  assert.match(recipe, /buildAgentsQuickActions/);
  assert.match(recipe, /buildAgentsWorkspaceSignals/);
  assert.match(layout, /agents-overview-recipe/);
});
```

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const servicePath = path.join(rootDir, 'apps/api/modules/agents/service.ts');

test('agents service exposes stable summary builders for workspace usage', () => {
  const source = fs.readFileSync(servicePath, 'utf8');
  assert.match(source, /buildAgentRosterSummary/);
  assert.match(source, /buildAgentWorkspaceSummary/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/system/studio-web-agents-workspace-recipe.test.mjs tests/system/agents-service.test.mjs`
Expected: FAIL because the new recipe and summary builder seams do not exist yet.

- [ ] **Step 3: Write the minimal implementation**

`apps/web-vue/src/features/agents/agents-overview-recipe.ts`

```ts
import type { AgentsSummaryPayload } from '../../../../../types/agents';

export function buildAgentsQuickActions(text: (zh: string, en: string) => string) {
  return [
    {
      key: 'create',
      label: text('新增 Agent', 'Add Agent'),
      copy: text('先创建最小 Agent，再补文档和绑定。', 'Create a minimal agent first, then add docs and bindings.'),
    },
    {
      key: 'sessions',
      label: text('检查会话入口', 'Review session entry'),
      copy: text('优先确认默认入口 Agent 和当前会话落点。', 'Confirm the default entry agent and current session target first.'),
    },
  ];
}

export function buildAgentsWorkspaceSignals(summary: AgentsSummaryPayload | null, text: (zh: string, en: string) => string) {
  if (!summary) {
    return [{ label: text('Agent 数量', 'Agent count'), value: '--', detail: text('等待 Agent 摘要', 'Waiting for agents summary') }];
  }

  return [
    {
      label: text('Agent 数量', 'Agent count'),
      value: String(summary.count),
      detail: text('当前 Agent 总数', 'Current total agents'),
    },
  ];
}
```

`apps/api/modules/agents/service.ts` (additive excerpt)

```ts
export function buildAgentRosterSummary(summary: AgentsSummaryPayload) {
  return {
    count: summary.count,
    defaultAgentId: summary.defaultAgentId,
  };
}

export function buildAgentWorkspaceSummary(summary: AgentsSummaryPayload) {
  return {
    count: summary.count,
    checkedAt: summary.checkedAt,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/system/studio-web-agents-workspace-recipe.test.mjs tests/system/studio-web-agents-workbench.test.mjs tests/system/agents-service.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add \
  apps/web-vue/src/features/agents/agents-overview-recipe.ts \
  apps/web-vue/src/views/AgentsView.vue \
  apps/web-vue/src/features/agents/AgentsWorkspaceLayout.vue \
  apps/web-vue/src/features/agents/api.ts \
  apps/api/modules/agents/service.ts \
  tests/system/studio-web-agents-workspace-recipe.test.mjs

git commit -m "Agent：重构管理工作区"
```

### Task 4: Refactor Channels into provider-plus-account workspace seams

**Files:**
- Create: `apps/web-vue/src/features/channels/channels-overview-recipe.ts`
- Modify: `apps/web-vue/src/views/ChannelsView.vue`
- Modify: `apps/web-vue/src/features/channels/ChannelsWorkspaceLayout.vue`
- Modify: `apps/web-vue/src/features/channels/api.ts`
- Modify: `apps/api/modules/channels/service.ts`
- Test: `tests/system/studio-web-channels-workspace-recipe.test.mjs`
- Regression: `tests/system/studio-web-channels-workspace.test.mjs`
- Regression: `tests/system/channels-service.test.mjs`
- Regression: `tests/system/channels-field-alignment.test.ts`

- [ ] **Step 1: Write the failing tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const recipePath = path.join(rootDir, 'apps/web-vue/src/features/channels/channels-overview-recipe.ts');
const layoutPath = path.join(rootDir, 'apps/web-vue/src/features/channels/ChannelsWorkspaceLayout.vue');

test('channels workspace exposes provider-account recipe seams', () => {
  assert.equal(fs.existsSync(recipePath), true);
  const recipe = fs.readFileSync(recipePath, 'utf8');
  const layout = fs.readFileSync(layoutPath, 'utf8');
  assert.match(recipe, /buildChannelsQuickActions/);
  assert.match(recipe, /buildChannelsWorkspaceSignals/);
  assert.match(layout, /channels-overview-recipe/);
});
```

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const servicePath = path.join(rootDir, 'apps/api/modules/channels/service.ts');

test('channels service exposes stable summary builders for provider and account workspaces', () => {
  const source = fs.readFileSync(servicePath, 'utf8');
  assert.match(source, /buildChannelWorkspaceSummary/);
  assert.match(source, /buildChannelAccountWorkspaceSummary/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/system/studio-web-channels-workspace-recipe.test.mjs tests/system/channels-service.test.mjs`
Expected: FAIL because the new recipe and summary-builder seams do not exist yet.

- [ ] **Step 3: Write the minimal implementation**

`apps/web-vue/src/features/channels/channels-overview-recipe.ts`

```ts
import type { ChannelsSummaryPayload } from '../../../../../types/channels';

export function buildChannelsQuickActions(text: (zh: string, en: string) => string) {
  return [
    {
      key: 'create-provider',
      label: text('新增频道 Provider', 'Add provider'),
      copy: text('先建立 provider，再进入账号和绑定工作区。', 'Create the provider first, then move into account and binding workspaces.'),
    },
    {
      key: 'pairing',
      label: text('检查配对请求', 'Review pairing requests'),
      copy: text('优先处理默认账号的待审批 pairing。', 'Handle pending pairing requests on the default account first.'),
    },
  ];
}

export function buildChannelsWorkspaceSignals(summary: ChannelsSummaryPayload | null, text: (zh: string, en: string) => string) {
  if (!summary) {
    return [{ label: text('Provider 数量', 'Provider count'), value: '--', detail: text('等待频道摘要', 'Waiting for channel summary') }];
  }

  return [
    {
      label: text('Provider 数量', 'Provider count'),
      value: String(summary.channels.length),
      detail: text('当前已配置的频道 Provider 数量', 'Configured channel providers'),
    },
  ];
}
```

`apps/api/modules/channels/service.ts` (additive excerpt)

```ts
export function buildChannelWorkspaceSummary(summary: ChannelsSummaryPayload) {
  return {
    count: summary.channels.length,
    checkedAt: summary.checkedAt,
  };
}

export function buildChannelAccountWorkspaceSummary(channel: ChannelSummary) {
  return {
    accountCount: channel.accountCount,
    bindingCount: channel.bindingCount,
    defaultAccount: channel.defaultAccount,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/system/studio-web-channels-workspace-recipe.test.mjs tests/system/studio-web-channels-workspace.test.mjs tests/system/channels-service.test.mjs tests/system/channels-field-alignment.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add \
  apps/web-vue/src/features/channels/channels-overview-recipe.ts \
  apps/web-vue/src/views/ChannelsView.vue \
  apps/web-vue/src/features/channels/ChannelsWorkspaceLayout.vue \
  apps/web-vue/src/features/channels/api.ts \
  apps/api/modules/channels/service.ts \
  tests/system/studio-web-channels-workspace-recipe.test.mjs

git commit -m "频道：重构工作区模型"
```

### Task 5: Refactor Skills and Cron onto the shared management contract

**Files:**
- Create: `apps/web-vue/src/features/skills/skills-overview-recipe.ts`
- Create: `apps/web-vue/src/features/cron/cron-overview-recipe.ts`
- Modify: `apps/web-vue/src/views/SkillsView.vue`
- Modify: `apps/web-vue/src/features/skills/SkillsControlPage.vue`
- Modify: `apps/web-vue/src/features/skills/api.ts`
- Modify: `apps/api/modules/skills/service.ts`
- Modify: `apps/web-vue/src/views/CronView.vue`
- Modify: `apps/web-vue/src/features/cron/CronControlPage.vue`
- Modify: `apps/web-vue/src/features/cron/api.ts`
- Modify: `apps/api/modules/cron/service.ts`
- Test: `tests/system/studio-web-skills-workspace-recipe.test.mjs`
- Test: `tests/system/studio-web-cron-workspace-recipe.test.mjs`
- Regression: `tests/system/studio-web-cron-tabs-primitives.test.mjs`

- [ ] **Step 1: Write the failing tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const skillsRecipePath = path.join(rootDir, 'apps/web-vue/src/features/skills/skills-overview-recipe.ts');
const cronRecipePath = path.join(rootDir, 'apps/web-vue/src/features/cron/cron-overview-recipe.ts');

test('skills workspace recipe exists and is consumed by the skills page', () => {
  assert.equal(fs.existsSync(skillsRecipePath), true);
  const source = fs.readFileSync(skillsRecipePath, 'utf8');
  assert.match(source, /buildSkillsQuickActions/);
  assert.match(source, /buildSkillsWorkspaceSignals/);
});

test('cron workspace recipe exists and is consumed by the cron page', () => {
  assert.equal(fs.existsSync(cronRecipePath), true);
  const source = fs.readFileSync(cronRecipePath, 'utf8');
  assert.match(source, /buildCronQuickActions/);
  assert.match(source, /buildCronWorkspaceSignals/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/system/studio-web-skills-workspace-recipe.test.mjs tests/system/studio-web-cron-workspace-recipe.test.mjs`
Expected: FAIL because the new recipe files do not exist yet.

- [ ] **Step 3: Write the minimal implementation**

`apps/web-vue/src/features/skills/skills-overview-recipe.ts`

```ts
import type { SkillsSummaryPayload } from '../../../../../types/skills';

export function buildSkillsQuickActions(text: (zh: string, en: string) => string) {
  return [
    {
      key: 'installed',
      label: text('检查本地技能', 'Review installed skills'),
      copy: text('先确认 ready / needs setup / disabled 的分布。', 'Start with the ready / needs-setup / disabled distribution.'),
    },
  ];
}

export function buildSkillsWorkspaceSignals(summary: SkillsSummaryPayload | null, text: (zh: string, en: string) => string) {
  if (!summary) {
    return [{ label: text('技能数量', 'Skill count'), value: '--', detail: text('等待技能摘要', 'Waiting for skills summary') }];
  }

  return [
    {
      label: text('技能数量', 'Skill count'),
      value: String(summary.counts.total),
      detail: text('当前可见技能总数', 'Total visible skills'),
    },
  ];
}
```

`apps/web-vue/src/features/cron/cron-overview-recipe.ts`

```ts
import type { CronSummaryPayload } from '../../../../../types/cron';

export function buildCronQuickActions(text: (zh: string, en: string) => string) {
  return [
    {
      key: 'create',
      label: text('新增任务', 'Add job'),
      copy: text('先建立任务骨架，再进入工作区补计划和投递方式。', 'Create the job skeleton first, then add schedule and delivery settings.'),
    },
  ];
}

export function buildCronWorkspaceSignals(summary: CronSummaryPayload | null, text: (zh: string, en: string) => string) {
  if (!summary) {
    return [{ label: text('任务数量', 'Job count'), value: '--', detail: text('等待任务摘要', 'Waiting for cron summary') }];
  }

  return [
    {
      label: text('任务数量', 'Job count'),
      value: String(summary.count),
      detail: text('当前配置的定时任务总数', 'Configured cron jobs'),
    },
  ];
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/system/studio-web-skills-workspace-recipe.test.mjs tests/system/studio-web-cron-workspace-recipe.test.mjs tests/system/studio-web-cron-tabs-primitives.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add \
  apps/web-vue/src/features/skills/skills-overview-recipe.ts \
  apps/web-vue/src/features/cron/cron-overview-recipe.ts \
  apps/web-vue/src/views/SkillsView.vue \
  apps/web-vue/src/features/skills/SkillsControlPage.vue \
  apps/web-vue/src/features/skills/api.ts \
  apps/api/modules/skills/service.ts \
  apps/web-vue/src/views/CronView.vue \
  apps/web-vue/src/features/cron/CronControlPage.vue \
  apps/web-vue/src/features/cron/api.ts \
  apps/api/modules/cron/service.ts \
  tests/system/studio-web-skills-workspace-recipe.test.mjs \
  tests/system/studio-web-cron-workspace-recipe.test.mjs

git commit -m "技能定时：统一管理配方"
```

### Task 6: Run the management-domain gate and capture follow-up splits

**Files:**
- Modify: `docs/superpowers/plans/2026-04-12-studio-management-domain-redesign.md`
- Verify: `apps/web-vue/src/features/management/management-domain-manifest.ts`
- Verify: `apps/web-vue/src/features/config/config-overview-recipe.ts`
- Verify: `apps/web-vue/src/features/agents/agents-overview-recipe.ts`
- Verify: `apps/web-vue/src/features/channels/channels-overview-recipe.ts`
- Verify: `apps/web-vue/src/features/skills/skills-overview-recipe.ts`
- Verify: `apps/web-vue/src/features/cron/cron-overview-recipe.ts`
- Verify: `scripts/studio-management-coverage.mjs`

- [ ] **Step 1: Append the exit criteria to the plan footer**

```md
## Management domain exit criteria

- Config, Agents, Channels, Skills, and Cron all consume one shared management-domain manifest.
- Each management module has an overview recipe or section registry instead of hardcoding all workspace semantics locally.
- A committed management coverage baseline exists and can be regenerated without noisy drift.
- Targeted node regressions for Config / Agents / Channels / Skills / Cron all pass.
- `npm run typecheck:web` passes.
- Every completed task is committed separately with a short Chinese message.

## Required follow-up plans

1. Chat and Sessions runtime-domain redesign
2. System and Terminal redesign
3. Room / Workflow co-design plan after user requirement sync
```

- [ ] **Step 2: Run the management-domain verification gate**

Run: `node --test tests/system/studio-management-domain-manifest.test.mjs tests/system/studio-management-coverage.test.mjs tests/system/studio-web-config-workspace-recipe.test.mjs tests/system/studio-web-agents-workspace-recipe.test.mjs tests/system/studio-web-channels-workspace-recipe.test.mjs tests/system/studio-web-skills-workspace-recipe.test.mjs tests/system/studio-web-cron-workspace-recipe.test.mjs tests/system/studio-web-config-workbench.test.mjs tests/system/studio-web-agents-workbench.test.mjs tests/system/studio-web-channels-workspace.test.mjs tests/system/studio-web-cron-tabs-primitives.test.mjs tests/system/config-service.test.mjs tests/system/agents-service.test.mjs tests/system/channels-service.test.mjs tests/system/channels-field-alignment.test.ts && npm run typecheck:web && npm run studio:management-coverage`
Expected: PASS.

- [ ] **Step 3: Fix only the smallest seam that fails**

If the gate fails, apply exactly one of these local fixes before re-running:

- Shared manifest or coverage failure → edit only `apps/web-vue/src/features/management/management-domain-manifest.ts`, `apps/web-vue/src/features/management/use-management-domain-navigation.ts`, `scripts/studio-management-coverage.mjs`, or `docs/superpowers/inventories/studio-management-coverage.json`
- Config failure → edit only `apps/web-vue/src/features/config/config-overview-recipe.ts`, `apps/web-vue/src/features/config/config-workspace-sections.ts`, `apps/web-vue/src/views/ConfigView.vue`, `apps/web-vue/src/features/config/ConfigEditorPage.vue`, `apps/web-vue/src/features/config/api.ts`, or `apps/api/modules/config/service.ts`
- Agents failure → edit only `apps/web-vue/src/features/agents/agents-overview-recipe.ts`, `apps/web-vue/src/views/AgentsView.vue`, `apps/web-vue/src/features/agents/AgentsWorkspaceLayout.vue`, `apps/web-vue/src/features/agents/api.ts`, or `apps/api/modules/agents/service.ts`
- Channels failure → edit only `apps/web-vue/src/features/channels/channels-overview-recipe.ts`, `apps/web-vue/src/views/ChannelsView.vue`, `apps/web-vue/src/features/channels/ChannelsWorkspaceLayout.vue`, `apps/web-vue/src/features/channels/api.ts`, or `apps/api/modules/channels/service.ts`
- Skills failure → edit only `apps/web-vue/src/features/skills/skills-overview-recipe.ts`, `apps/web-vue/src/views/SkillsView.vue`, `apps/web-vue/src/features/skills/SkillsControlPage.vue`, `apps/web-vue/src/features/skills/api.ts`, or `apps/api/modules/skills/service.ts`
- Cron failure → edit only `apps/web-vue/src/features/cron/cron-overview-recipe.ts`, `apps/web-vue/src/views/CronView.vue`, `apps/web-vue/src/features/cron/CronControlPage.vue`, `apps/web-vue/src/features/cron/api.ts`, or `apps/api/modules/cron/service.ts`

Do not widen the fix into `Chat / Sessions`, `System / Terminal`, or `Room / Workflow`.

- [ ] **Step 4: Re-run the management-domain verification gate**

Run: `node --test tests/system/studio-management-domain-manifest.test.mjs tests/system/studio-management-coverage.test.mjs tests/system/studio-web-config-workspace-recipe.test.mjs tests/system/studio-web-agents-workspace-recipe.test.mjs tests/system/studio-web-channels-workspace-recipe.test.mjs tests/system/studio-web-skills-workspace-recipe.test.mjs tests/system/studio-web-cron-workspace-recipe.test.mjs tests/system/studio-web-config-workbench.test.mjs tests/system/studio-web-agents-workbench.test.mjs tests/system/studio-web-channels-workspace.test.mjs tests/system/studio-web-cron-tabs-primitives.test.mjs tests/system/config-service.test.mjs tests/system/agents-service.test.mjs tests/system/channels-service.test.mjs tests/system/channels-field-alignment.test.ts && npm run typecheck:web && npm run studio:management-coverage`
Expected: PASS end-to-end.

- [ ] **Step 5: Commit the closeout**

```bash
git add \
  docs/superpowers/plans/2026-04-12-studio-management-domain-redesign.md \
  docs/superpowers/inventories/studio-management-coverage.json

git commit -m "管理域：完成阶段收口"
```

## Management domain exit criteria

- Config, Agents, Channels, Skills, and Cron all consume one shared management-domain manifest.
- Each management module has an overview recipe or section registry instead of hardcoding all workspace semantics locally.
- A committed management coverage baseline exists and can be regenerated without noisy drift.
- Targeted node regressions for Config / Agents / Channels / Skills / Cron all pass.
- `npm run typecheck:web` passes.
- Every completed task is committed separately with a short Chinese message.

## Required follow-up plans

1. Chat and Sessions runtime-domain redesign
2. System and Terminal redesign
3. Room / Workflow co-design plan after user requirement sync
