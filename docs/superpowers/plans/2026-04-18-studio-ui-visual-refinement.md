# Studio UI Visual Refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the phase-two Studio visual refinement system so Home / Chat / Operate / System / Terminal share one polished bilingual, dual-theme product language.

**Architecture:** Build the refinement in the same order as the approved spec: semantic theme tokens first, then shared shell/component language, then page-domain expression for Home, Chat, Operate, System, and Terminal. Keep the existing stage/rail contracts from the 2026-04-17 layout redesign intact and strengthen source-based tests so they validate the worktree code actually being edited.

**Tech Stack:** Vue 3, TypeScript, CSS custom properties, scoped Vue CSS, node:test source-contract tests, Vite

---

## File structure and responsibilities

### Global visual foundation
- Modify: `apps/web-vue/src/style.css`
  - Own the semantic token layer, shared surface/button/banner/dialog styles, shell chrome, and shared visual grammar.
- Modify: `apps/web-vue/src/shared/theme.ts`
  - Keep `data-theme` / `data-theme-mode` authoritative and ensure theme mode persistence continues to drive the global token layer.

### Shared shell and dialog language
- Modify: `apps/web-vue/src/App.vue`
  - Keep shell layout stable while tightening the shell-level visual language and confirm dialog mounting contract.
- Modify: `apps/web-vue/src/components/ConfirmDialog.vue`
  - Make the shared confirm dialog match the approved overlay language.
- Modify: `apps/web-vue/src/composables/useConfirmDialog.ts`
  - Expand the shared dialog API only as needed for the approved shared tone/intent language.

### Home / Chat / Operate / System / Terminal
- Modify: `apps/web-vue/src/views/DashboardView.vue`
- Modify: `apps/web-vue/src/features/chat-v2/ChatShellPage.vue`
- Modify: `apps/web-vue/src/features/agents/AgentsWorkspaceLayout.vue`
- Modify: `apps/web-vue/src/features/channels/ChannelsWorkspaceLayout.vue`
- Modify: `apps/web-vue/src/features/cron/CronControlPage.vue`
- Modify: `apps/web-vue/src/features/system/SystemControlPage.vue`
- Modify: `apps/web-vue/src/features/terminal/TerminalConsolePage.vue`

### Tests
- Modify: `tests/system/studio-web-dark-foundation.test.mjs`
- Modify: `tests/system/studio-web-page-chrome-density.test.mjs`
- Modify: `tests/system/studio-web-confirm-dialog-foundation.test.mjs`
- Modify: `tests/system/studio-web-shell-layout-redesign.test.mjs`
- Modify: `tests/system/studio-web-home-layout-redesign.test.mjs`
- Modify: `tests/system/studio-web-chat-layout-redesign.test.mjs`
- Modify: `tests/system/studio-web-operate-layout-redesign.test.mjs`
- Modify: `tests/system/studio-web-system-terminal-layout-redesign.test.mjs`
- Modify: `tests/system/studio-web-mobile-layout-guardrails.test.mjs`

### Verification / knowledge graph
- Modify: `docs/当前进展.md`
  - Record that phase-two visual refinement has landed.
- Regenerate: `graphify-out/GRAPH_REPORT.md`
  - Required by repo instructions after code changes.

---

### Task 1: Establish semantic visual tokens and make contract tests worktree-safe

**Files:**
- Modify: `apps/web-vue/src/style.css`
- Modify: `apps/web-vue/src/shared/theme.ts`
- Modify: `tests/system/studio-web-dark-foundation.test.mjs`
- Modify: `tests/system/studio-web-page-chrome-density.test.mjs`

- [ ] **Step 1: Write the failing token contracts and remove hard-coded repo roots from the visual tests**

Replace the hard-coded root resolution in both test files with a worktree-safe helper and add the new semantic token assertions.

```js
import { fileURLToPath } from "node:url";

const testFileDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(testFileDir, "..", "..");

function read(filePath) {
  return fs.readFileSync(path.join(rootDir, filePath), "utf8");
}
```

Add these assertions to `tests/system/studio-web-dark-foundation.test.mjs`:

```js
assert.match(styleCss, /--bg-app:\s*var\(--shell-bg-start\);/);
assert.match(styleCss, /--surface-base:\s*var\(--shell-panel-fill\);/);
assert.match(styleCss, /--surface-raised:\s*var\(--shell-panel-fill-strong\);/);
assert.match(styleCss, /--surface-overlay:\s*color-mix\(in srgb, var\(--shell-stage-fill-strong\) 96%, transparent\);/);
assert.match(styleCss, /--text-primary:\s*var\(--text\);/);
assert.match(styleCss, /--text-secondary:\s*var\(--muted\);/);
assert.match(styleCss, /--border-subtle:\s*var\(--shell-panel-border\);/);
assert.match(styleCss, /--border-strong:\s*var\(--shell-stage-border\);/);
assert.match(styleCss, /--accent-primary:\s*var\(--acc\);/);
assert.match(styleCss, /--focus-ring:\s*rgba\(91,\s*150,\s*255,\s*0\.24\);/);
assert.match(styleCss, /html\[data-theme="light"\]\s*\{[\s\S]*--surface-overlay:/);
```

Add these assertions to `tests/system/studio-web-page-chrome-density.test.mjs`:

```js
assert.match(styleCss, /\.panel-card,\s*\.metric-card\s*\{[\s\S]*background:\s*var\(--surface-base\);/);
assert.match(styleCss, /\.panel-card,\s*\.metric-card\s*\{[\s\S]*border:\s*1px solid var\(--border-subtle\);/);
assert.match(styleCss, /\.primary-button\s*\{[\s\S]*background:\s*var\(--accent-primary\);/);
assert.match(styleCss, /\.status-banner\s*\{[\s\S]*background:\s*var\(--surface-raised\);/);
```

- [ ] **Step 2: Run the visual foundation tests and verify they fail for missing semantic aliases**

Run:

```bash
node --test tests/system/studio-web-dark-foundation.test.mjs tests/system/studio-web-page-chrome-density.test.mjs
```

Expected: FAIL because `style.css` does not yet define the new semantic token aliases such as `--surface-base`, `--surface-raised`, `--text-primary`, and `--accent-primary`.

- [ ] **Step 3: Implement the semantic token layer in `style.css` and keep theme attributes authoritative in `theme.ts`**

In `apps/web-vue/src/style.css`, add these aliases inside the dark root token block:

```css
:root {
  --bg-app: var(--shell-bg-start);
  --bg-subtle: var(--shell-bg-mid);
  --surface-base: var(--shell-panel-fill);
  --surface-raised: var(--shell-panel-fill-strong);
  --surface-overlay: color-mix(in srgb, var(--shell-stage-fill-strong) 96%, transparent);
  --surface-danger: color-mix(in srgb, var(--danger) 10%, var(--shell-panel-fill));
  --text-primary: var(--text);
  --text-secondary: var(--muted);
  --text-muted: var(--muted-soft);
  --border-subtle: var(--shell-panel-border);
  --border-strong: var(--shell-stage-border);
  --accent-primary: var(--acc);
  --accent-soft: rgba(91, 150, 255, 0.14);
  --focus-ring: rgba(91, 150, 255, 0.24);
}
```

In `html[data-theme="light"]`, add the matching light-mode aliases:

```css
html[data-theme="light"] {
  --bg-app: var(--shell-bg-start);
  --bg-subtle: var(--shell-bg-mid);
  --surface-base: var(--shell-panel-fill);
  --surface-raised: var(--shell-panel-fill-strong);
  --surface-overlay: color-mix(in srgb, var(--shell-stage-fill-strong) 98%, transparent);
  --surface-danger: color-mix(in srgb, var(--danger) 9%, var(--shell-panel-fill));
  --text-primary: var(--text);
  --text-secondary: var(--muted);
  --text-muted: var(--muted-soft);
  --border-subtle: var(--shell-panel-border);
  --border-strong: var(--shell-stage-border);
  --accent-primary: var(--acc);
  --accent-soft: rgba(91, 150, 255, 0.12);
  --focus-ring: rgba(91, 150, 255, 0.18);
}
```

Update the shared primitive styles to use the semantic aliases:

```css
.panel-card,
.metric-card {
  background: var(--surface-base);
  border: 1px solid var(--border-subtle);
}

.primary-button {
  background: var(--accent-primary);
}

.status-banner {
  background: var(--surface-raised);
  border: 1px solid var(--border-subtle);
}
```

Keep `apps/web-vue/src/shared/theme.ts` using `document.documentElement.dataset.theme` and `dataset.themeMode`, and make the write explicit:

```ts
function applyThemeAttributes(): void {
  if (typeof document === 'undefined') return;
  const resolved = getResolvedTheme(themeMode.value, systemTheme.value);
  const root = document.documentElement;
  root.dataset.theme = resolved;
  root.dataset.themeMode = themeMode.value;
  root.style.colorScheme = resolved;
}
```

- [ ] **Step 4: Run the focused visual foundation tests and verify they pass**

Run:

```bash
node --test tests/system/studio-web-dark-foundation.test.mjs tests/system/studio-web-page-chrome-density.test.mjs
```

Expected: PASS for both test files.

- [ ] **Step 5: Commit the token foundation work**

```bash
git add tests/system/studio-web-dark-foundation.test.mjs tests/system/studio-web-page-chrome-density.test.mjs apps/web-vue/src/style.css apps/web-vue/src/shared/theme.ts
git commit -m "feat: 建立 Studio 语义化视觉 token 基础"
```

### Task 2: Unify shared shell, buttons, banners, and confirm dialog language

**Files:**
- Modify: `apps/web-vue/src/App.vue`
- Modify: `apps/web-vue/src/components/ConfirmDialog.vue`
- Modify: `apps/web-vue/src/composables/useConfirmDialog.ts`
- Modify: `apps/web-vue/src/style.css`
- Modify: `tests/system/studio-web-confirm-dialog-foundation.test.mjs`
- Modify: `tests/system/studio-web-shell-layout-redesign.test.mjs`

- [ ] **Step 1: Write failing shared-language tests for confirm dialog tone and shell theme-mode contracts**

Add to `tests/system/studio-web-confirm-dialog-foundation.test.mjs`:

```js
const confirmDialog = read("apps/web-vue/src/components/ConfirmDialog.vue");
const confirmComposable = read("apps/web-vue/src/composables/useConfirmDialog.ts");

assert.match(confirmComposable, /export type ConfirmDialogTone = "default" \| "danger" \| "safe";/);
assert.match(confirmDialog, /class="confirm-dialog__surface"/);
assert.match(confirmDialog, /class="confirm-dialog__actions"/);
assert.match(confirmDialog, /activeConfirmDialog\.tone === 'danger'/);
assert.match(confirmDialog, /activeConfirmDialog\.tone === 'safe'/);
```

Add to `tests/system/studio-web-shell-layout-redesign.test.mjs`:

```js
assert.match(appVue, /const \{ themeMode, setThemeMode \} = useThemePreference\(\);/);
assert.match(appVue, /<ConfirmDialog\b/);
assert.match(appVue, /class="shell-route-stage"/);
assert.match(appVue, /theme-mode="themeMode"/);
```

- [ ] **Step 2: Run the shell/dialog tests and verify they fail**

Run:

```bash
node --test tests/system/studio-web-confirm-dialog-foundation.test.mjs tests/system/studio-web-shell-layout-redesign.test.mjs
```

Expected: FAIL because the shared confirm dialog does not yet expose `safe` tone or the new surface/action class names.

- [ ] **Step 3: Implement the shared dialog and shell visual language**

Update `apps/web-vue/src/composables/useConfirmDialog.ts`:

```ts
export type ConfirmDialogTone = "default" | "danger" | "safe";

export interface ConfirmDialogOptions {
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  tone?: ConfirmDialogTone;
}
```

Update `apps/web-vue/src/components/ConfirmDialog.vue` so the dialog surface and actions are explicit and tone-aware:

```vue
<section
  class="confirm-dialog confirm-dialog__surface"
  :class="{
    'is-danger': activeConfirmDialog.tone === 'danger',
    'is-safe': activeConfirmDialog.tone === 'safe',
  }"
  role="alertdialog"
  aria-modal="true"
  :aria-label="activeConfirmDialog.title"
  @click.stop
>
  <header class="confirm-dialog__head">
    <h3>{{ activeConfirmDialog.title }}</h3>
    <p v-if="activeConfirmDialog.message">{{ activeConfirmDialog.message }}</p>
  </header>
  <footer class="confirm-dialog__actions">
    <button type="button" class="secondary-button" @click="confirmCancel">
      {{ activeConfirmDialog.cancelText }}
    </button>
    <button
      type="button"
      class="primary-button"
      :class="{
        'is-danger': activeConfirmDialog.tone === 'danger',
        'is-safe': activeConfirmDialog.tone === 'safe',
      }"
      @click="confirmAccept"
    >
      {{ activeConfirmDialog.confirmText }}
    </button>
  </footer>
</section>
```

Add the matching styles in `apps/web-vue/src/style.css`:

```css
.confirm-dialog__surface {
  border: 1px solid var(--border-strong);
  background: var(--surface-overlay);
  box-shadow: var(--shadow-popover);
}

.confirm-dialog__actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.confirm-dialog.is-danger {
  border-color: color-mix(in srgb, var(--danger) 34%, var(--border-strong));
}

.confirm-dialog.is-safe {
  border-color: color-mix(in srgb, var(--success) 34%, var(--border-strong));
}
```

Keep `App.vue` mounting `<ConfirmDialog />` at shell root and continue passing `themeMode` into shell controls.

- [ ] **Step 4: Run the shell/dialog tests and verify they pass**

Run:

```bash
node --test tests/system/studio-web-confirm-dialog-foundation.test.mjs tests/system/studio-web-shell-layout-redesign.test.mjs
```

Expected: PASS for both files.

- [ ] **Step 5: Commit the shared shell/dialog language**

```bash
git add apps/web-vue/src/App.vue apps/web-vue/src/components/ConfirmDialog.vue apps/web-vue/src/composables/useConfirmDialog.ts apps/web-vue/src/style.css tests/system/studio-web-confirm-dialog-foundation.test.mjs tests/system/studio-web-shell-layout-redesign.test.mjs
git commit -m "feat: 统一 Studio 壳层与确认对话视觉语言"
```

### Task 3: Refine Home into the approved product-grade control homepage

**Files:**
- Modify: `apps/web-vue/src/views/DashboardView.vue`
- Modify: `apps/web-vue/src/style.css`
- Modify: `tests/system/studio-web-home-layout-redesign.test.mjs`

- [ ] **Step 1: Write failing Home-page contracts for summary strip, quick actions, and recent stream language**

Add to `tests/system/studio-web-home-layout-redesign.test.mjs`:

```js
const dashboardView = read("apps/web-vue/src/views/DashboardView.vue");

assert.match(dashboardView, /home-situation-band/);
assert.match(dashboardView, /home-risk-stage/);
assert.match(dashboardView, /home-quick-action/);
assert.match(dashboardView, /home-resource-panel/);
assert.match(dashboardView, /home-recent-stream/);
assert.match(dashboardView, /home-risk-chip-strip/);
assert.match(dashboardView, /home-track-list/);
```

- [ ] **Step 2: Run the Home contract test and verify the new class contract fails before implementation**

Run:

```bash
node --test tests/system/studio-web-home-layout-redesign.test.mjs
```

Expected: FAIL if any of the new Home refinement classes are missing or renamed away during implementation.

- [ ] **Step 3: Implement the Home refinement with stronger summary, action, and stream layers**

Keep the existing structure, but tighten the computed data and visual hierarchy in `apps/web-vue/src/views/DashboardView.vue`.

Use this quick action model:

```ts
const homeQuickActions = computed(() => ([
  {
    to: '/chat',
    eyebrow: 'Chat',
    label: text('继续指挥会话', 'Continue operator chat'),
    copy: text('回到最近私聊，或直接开启新的指挥会话。', 'Return to recent private sessions or start a new operator thread.'),
  },
  {
    to: '/agents',
    eyebrow: 'Agents',
    label: text('查看执行单元', 'Inspect agents'),
    copy: text('核对 Agent 配置、工作区和当前状态。', 'Validate agent configuration, workspace assignment, and current state.'),
  },
  {
    to: '/system',
    eyebrow: 'System',
    label: text('进入系统诊断', 'Open diagnostics'),
    copy: text('追踪健康状态、bootstrap 与设备信任。', 'Track health, bootstrap state, and local device trust.'),
  },
]));
```

Use these key surface styles:

```css
.home-situation-band,
.home-risk-stage,
.home-resource-panel,
.home-recent-stream {
  border: 1px solid var(--border-subtle);
  background: var(--surface-base);
}

.home-situation-band {
  background:
    radial-gradient(560px 240px at 12% 0%, color-mix(in srgb, var(--accent-soft) 70%, transparent), transparent 58%),
    var(--surface-raised);
}

.home-quick-action:hover,
.home-risk-row:hover {
  border-color: color-mix(in srgb, var(--accent-primary) 30%, var(--border-subtle));
  background: var(--surface-raised);
}
```

- [ ] **Step 4: Run the Home contract test and the web typecheck**

Run:

```bash
node --test tests/system/studio-web-home-layout-redesign.test.mjs && npm run typecheck --workspace=apps/web-vue
```

Expected: PASS for the test and `tsc` exits with code 0.

- [ ] **Step 5: Commit the Home refinement**

```bash
git add apps/web-vue/src/views/DashboardView.vue apps/web-vue/src/style.css tests/system/studio-web-home-layout-redesign.test.mjs
git commit -m "feat: 强化 Studio Home 总控首页视觉表达"
```

### Task 4: Refine Chat into the calmer, more structured workspace stage

**Files:**
- Modify: `apps/web-vue/src/features/chat-v2/ChatShellPage.vue`
- Modify: `apps/web-vue/src/style.css`
- Modify: `tests/system/studio-web-chat-layout-redesign.test.mjs`
- Modify: `tests/system/studio-web-confirm-dialog-foundation.test.mjs`

- [ ] **Step 1: Write the failing Chat workspace and host-exec confirm-dialog contracts**

Extend `tests/system/studio-web-chat-layout-redesign.test.mjs`:

```js
assert.match(chatShellPage, /chat-session-rail/);
assert.match(chatShellPage, /chat-main-stage/);
assert.match(chatShellPage, /chat-side-inspector/);
assert.match(chatShellPage, /chat-mobile-session-rail/);
assert.match(chatShellPage, /chat-mobile-inspector-sheet/);
assert.match(chatShellPage, /chat-host-exec-confirm-dialog/);
assert.match(chatShellPage, /chat-shell-toast/);
```

Extend `tests/system/studio-web-confirm-dialog-foundation.test.mjs` with:

```js
const chatShellPage = read("apps/web-vue/src/features/chat-v2/ChatShellPage.vue");
assert.match(chatShellPage, /chat-host-exec-confirm-dialog/);
assert.match(chatShellPage, /chat-host-exec-confirm-primary/);
```

- [ ] **Step 2: Run the Chat and confirm-dialog tests and verify they fail on missing refined contracts**

Run:

```bash
node --test tests/system/studio-web-chat-layout-redesign.test.mjs tests/system/studio-web-confirm-dialog-foundation.test.mjs
```

Expected: FAIL if the refined Chat dialog / stage contract is not fully present.

- [ ] **Step 3: Implement the calmer Chat stage, secondary tool surfaces, and aligned host-exec confirmation treatment**

In `apps/web-vue/src/features/chat-v2/ChatShellPage.vue`, keep the current shell but align its visual surfaces to the semantic foundation.

Use this host-exec confirm surface structure:

```vue
<section v-if="hostManagementExecConfirmOpen" class="chat-host-exec-confirm-dialog">
  <header class="chat-host-exec-confirm-head">
    <div class="chat-host-exec-confirm-copy">
      <DialogTitle as-child>
        <strong>{{ text('开启本会话宿主管理 Exec', 'Enable host-management Exec for this chat') }}</strong>
      </DialogTitle>
      <DialogDescription as-child>
        <span>{{ text('开启后，这个会话里的私聊 chat 可以直接执行宿主管理类 exec / shell / bash 命令。', 'Once enabled, this chat can directly run host-management exec / shell / bash commands.') }}</span>
      </DialogDescription>
    </div>
  </header>
  <footer class="chat-host-exec-confirm-actions">
    <button type="button" class="chat-host-exec-confirm-secondary" @click="closeHostManagementExecConfirm">
      {{ text('取消', 'Cancel') }}
    </button>
    <button type="button" class="chat-host-exec-confirm-primary" @click="confirmSessionHostManagementExec">
      {{ text('确认开启', 'Enable now') }}
    </button>
  </footer>
</section>
```

In `apps/web-vue/src/style.css`, align the Chat shell surfaces:

```css
.chat-shell-sidebar,
.chat-side-inspector,
.chat-host-exec-confirm-dialog,
.chat-shell-toast {
  background: var(--surface-base);
  border: 1px solid var(--border-subtle);
}

.chat-main-stage {
  background: color-mix(in srgb, var(--surface-raised) 92%, transparent);
}

.chat-host-exec-confirm-primary {
  background: var(--accent-primary);
}
```

- [ ] **Step 4: Run the Chat-focused tests**

Run:

```bash
node --test tests/system/studio-web-chat-layout-redesign.test.mjs tests/system/studio-web-confirm-dialog-foundation.test.mjs tests/system/studio-web-mobile-layout-guardrails.test.mjs
```

Expected: PASS for all three files.

- [ ] **Step 5: Commit the Chat refinement**

```bash
git add apps/web-vue/src/features/chat-v2/ChatShellPage.vue apps/web-vue/src/style.css tests/system/studio-web-chat-layout-redesign.test.mjs tests/system/studio-web-confirm-dialog-foundation.test.mjs tests/system/studio-web-mobile-layout-guardrails.test.mjs
git commit -m "feat: 优化 Chat 主舞台与会话确认体验"
```

### Task 5: Unify Agents / Channels / Cron into one stronger Operate visual language

**Files:**
- Modify: `apps/web-vue/src/features/agents/AgentsWorkspaceLayout.vue`
- Modify: `apps/web-vue/src/features/channels/ChannelsWorkspaceLayout.vue`
- Modify: `apps/web-vue/src/features/cron/CronControlPage.vue`
- Modify: `apps/web-vue/src/style.css`
- Modify: `tests/system/studio-web-operate-layout-redesign.test.mjs`
- Modify: `tests/system/studio-web-mobile-layout-guardrails.test.mjs`

- [ ] **Step 1: Write failing Operate-domain tests for shared task-head, summary badges, and mobile stage tabs**

Extend `tests/system/studio-web-operate-layout-redesign.test.mjs`:

```js
assert.match(agentsWorkspaceLayout, /operate-workspace-shell/);
assert.match(agentsWorkspaceLayout, /operate-stage-task-head/);
assert.match(agentsWorkspaceLayout, /mobile-stage-tabs/);

assert.match(channelsWorkspaceLayout, /operate-workspace-shell/);
assert.match(channelsWorkspaceLayout, /channels-stage-badge/);
assert.match(channelsWorkspaceLayout, /mobile-stage-tabs/);

assert.match(cronControlPage, /operate-workspace-shell/);
assert.match(cronControlPage, /operate-stage-task-head/);
assert.match(cronControlPage, /mobile-stage-tabs/);
```

Add to `tests/system/studio-web-mobile-layout-guardrails.test.mjs`:

```js
assert.match(agentsWorkspaceLayout, /mobile-resource-drawer/);
assert.match(channelsWorkspaceLayout, /mobile-resource-drawer/);
assert.match(cronControlPage, /mobile-resource-drawer|mobile-stage-tabs/);
```

- [ ] **Step 2: Run the Operate tests and verify they fail before the shared visual pass**

Run:

```bash
node --test tests/system/studio-web-operate-layout-redesign.test.mjs tests/system/studio-web-mobile-layout-guardrails.test.mjs
```

Expected: FAIL if any page slips away from the shared Operate shell or mobile downshift contract.

- [ ] **Step 3: Implement the shared Operate summary-strip, resource-rail, and stage language**

In the three page files, keep the existing layout classes and strengthen the page-head + fact-badge grammar. Use these exact patterns:

```vue
<div class="agents-stage-header__facts">
  <span class="agents-summary-pill">{{ selectedAgent.model || text('系统默认模型', 'System model') }}</span>
  <span class="agents-summary-pill">{{ text(`${selectedAgent.sessionCount} 个会话`, `${selectedAgent.sessionCount} sessions`) }}</span>
</div>
```

```vue
<div class="channels-stage-badges">
  <span class="channels-stage-badge">{{ workspace.selectedChannel.value.enabled ? text('已启用', 'Enabled') : text('已禁用', 'Disabled') }}</span>
  <span class="channels-stage-badge">{{ text(`${workspace.selectedChannel.value.accountCount} 个账号`, `${workspace.selectedChannel.value.accountCount} accounts`) }}</span>
</div>
```

```vue
<div class="cron-stage-facts">
  <div class="cron-stage-fact">
    <span>{{ text('计划', 'Schedule') }}</span>
    <strong>{{ detail.job.schedule.label }}</strong>
  </div>
</div>
```

Unify the shared surface styles in `apps/web-vue/src/style.css`:

```css
.operate-workspace-shell .panel-card,
.operate-resource-rail,
.operate-stage {
  background: var(--surface-base);
  border: 1px solid var(--border-subtle);
}

.operate-stage-task-head,
.channels-stage-badges,
.cron-stage-facts,
.agents-stage-header__facts {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.channels-stage-badge,
.agents-summary-pill,
.cron-chip {
  border: 1px solid var(--border-subtle);
  background: color-mix(in srgb, var(--surface-raised) 90%, transparent);
}
```

- [ ] **Step 4: Run the Operate tests and the web build**

Run:

```bash
node --test tests/system/studio-web-operate-layout-redesign.test.mjs tests/system/studio-web-mobile-layout-guardrails.test.mjs && npm run build --workspace=apps/web-vue
```

Expected: PASS for both tests and a successful Vite build.

- [ ] **Step 5: Commit the Operate-domain refinement**

```bash
git add apps/web-vue/src/features/agents/AgentsWorkspaceLayout.vue apps/web-vue/src/features/channels/ChannelsWorkspaceLayout.vue apps/web-vue/src/features/cron/CronControlPage.vue apps/web-vue/src/style.css tests/system/studio-web-operate-layout-redesign.test.mjs tests/system/studio-web-mobile-layout-guardrails.test.mjs
git commit -m "feat: 统一 Operate 域视觉工作台语法"
```

### Task 6: Refine System and Terminal into the approved diagnostic tower and maintenance workspace

**Files:**
- Modify: `apps/web-vue/src/features/system/SystemControlPage.vue`
- Modify: `apps/web-vue/src/features/terminal/TerminalConsolePage.vue`
- Modify: `apps/web-vue/src/style.css`
- Modify: `tests/system/studio-web-system-terminal-layout-redesign.test.mjs`
- Modify: `tests/system/studio-web-mobile-layout-guardrails.test.mjs`

- [ ] **Step 1: Write failing contracts for System/Terminal surface hierarchy and narrow-screen main-stage priority**

Extend `tests/system/studio-web-system-terminal-layout-redesign.test.mjs` with:

```js
assert.match(systemControlPage, /system-control-surface/);
assert.match(systemControlPage, /system-health-strip/);
assert.match(systemControlPage, /system-main-stage/);
assert.match(systemControlPage, /system-stage-tabs\.mobile-stage-tabs/);
assert.match(systemControlPage, /@media \(max-width: 1180px\) \{[\s\S]*\.system-main-stage \{[\s\S]*order:\s*-1;/);

assert.match(terminalConsolePage, /terminal-workspace-surface/);
assert.match(terminalConsolePage, /terminal-main-canvas/);
assert.match(terminalConsolePage, /terminal-side-utilities/);
assert.match(terminalConsolePage, /@media \(max-width: 1120px\) \{[\s\S]*\.terminal-main-canvas \{[\s\S]*order:\s*-1;/);
```

- [ ] **Step 2: Run the System/Terminal tests and confirm they fail if the refined surfaces are incomplete**

Run:

```bash
node --test tests/system/studio-web-system-terminal-layout-redesign.test.mjs tests/system/studio-web-mobile-layout-guardrails.test.mjs
```

Expected: FAIL if either page loses the approved main-stage-first behavior or the refined stage contracts.

- [ ] **Step 3: Implement the stronger System and Terminal visual expression without changing the stage contracts**

In `apps/web-vue/src/features/system/SystemControlPage.vue`, keep `system-control-surface`, `system-health-strip`, `system-main-stage`, and `system-stage-tabs mobile-stage-tabs`, and align the surfaces to the semantic token layer.

Use these CSS rules:

```css
.system-sidebar-panel,
.system-topic-rail,
.system-stage-panel {
  background: var(--surface-base);
  border: 1px solid var(--border-subtle);
}

.system-stage-tabs.mobile-stage-tabs {
  background: color-mix(in srgb, var(--surface-raised) 88%, transparent);
}

.system-callout-error {
  background: var(--surface-danger);
  border-color: color-mix(in srgb, var(--danger) 28%, var(--border-subtle));
}
```

In `apps/web-vue/src/features/terminal/TerminalConsolePage.vue`, keep `terminal-workspace-surface`, `terminal-workspace-grid`, `terminal-main-canvas`, and `terminal-side-utilities`, and tighten the maintenance-workspace language:

```css
.terminal-card,
.terminal-toolbar-strip,
.terminal-main-canvas {
  background: var(--surface-base);
  border: 1px solid var(--border-subtle);
}

.terminal-main-canvas {
  background: color-mix(in srgb, var(--surface-raised) 90%, rgba(5, 10, 18, 0.2));
}

.terminal-toolbar-chip,
.terminal-card-chip,
.terminal-chip {
  background: color-mix(in srgb, var(--surface-raised) 92%, transparent);
}
```

Keep the narrow-screen ordering rules intact:

```css
@media (max-width: 1180px) {
  .system-main-stage {
    order: -1;
  }
}

@media (max-width: 1120px) {
  .terminal-main-canvas {
    order: -1;
  }
}
```

- [ ] **Step 4: Run the System/Terminal tests, typecheck, and build**

Run:

```bash
node --test tests/system/studio-web-system-terminal-layout-redesign.test.mjs tests/system/studio-web-mobile-layout-guardrails.test.mjs && npm run typecheck --workspace=apps/web-vue && npm run build --workspace=apps/web-vue
```

Expected: PASS for both tests, typecheck, and build.

- [ ] **Step 5: Commit the System/Terminal refinement**

```bash
git add apps/web-vue/src/features/system/SystemControlPage.vue apps/web-vue/src/features/terminal/TerminalConsolePage.vue apps/web-vue/src/style.css tests/system/studio-web-system-terminal-layout-redesign.test.mjs tests/system/studio-web-mobile-layout-guardrails.test.mjs
git commit -m "feat: 强化 System 与 Terminal 视觉主舞台"
```

### Task 7: Run final verification, update progress docs, and rebuild graphify

**Files:**
- Modify: `docs/当前进展.md`
- Regenerate: `graphify-out/GRAPH_REPORT.md`

- [ ] **Step 1: Add a short phase-two visual refinement entry to the progress log**

Append this section to `docs/当前进展.md`:

```md
## Visual Refinement（第二阶段）

- 已建立全站语义化视觉 token：surface / text / border / accent / focus。
- 已统一 ConfirmDialog、按钮、状态条、overlay surface 的共享语言。
- Home / Chat / Operate / System / Terminal 已收敛到同一产品语系。
- light / dark 与中文 / English 继续通过同一套语义层驱动。
- 窄屏下继续保持主舞台优先，侧区统一后撤为 drawer / sheet / tabs。
```

- [ ] **Step 2: Run the final Studio web verification set**

Run:

```bash
node --test tests/system/studio-web-dark-foundation.test.mjs tests/system/studio-web-confirm-dialog-foundation.test.mjs tests/system/studio-web-shell-layout-redesign.test.mjs tests/system/studio-web-home-layout-redesign.test.mjs tests/system/studio-web-chat-layout-redesign.test.mjs tests/system/studio-web-operate-layout-redesign.test.mjs tests/system/studio-web-system-terminal-layout-redesign.test.mjs tests/system/studio-web-mobile-layout-guardrails.test.mjs tests/system/studio-web-page-chrome-density.test.mjs && npm run typecheck --workspace=apps/web-vue && npm run build --workspace=apps/web-vue
```

Expected: all tests PASS, `tsc` exits with code 0, and Vite build succeeds.

- [ ] **Step 3: Rebuild the graph knowledge report required by repo policy**

Run:

```bash
python3.12 ~/.claude/graphify-rebuild.py .
```

Expected: `graphify-out/GRAPH_REPORT.md` is regenerated without errors.

- [ ] **Step 4: Commit the progress-doc and graph refresh**

```bash
git add docs/当前进展.md graphify-out/GRAPH_REPORT.md
git commit -m "docs: 更新 Studio 二阶段视觉精修进展"
```

---

## Self-review

### Spec coverage
- **Foundation / tokens / dual-theme semantic roles:** Covered by Task 1.
- **Shared UI language: shell, buttons, banners, dialog, overlay:** Covered by Task 2.
- **Home page expression:** Covered by Task 3.
- **Chat page expression and confirm behavior alignment:** Covered by Task 4.
- **Operate domain consistency across Agents / Channels / Cron:** Covered by Task 5.
- **System / Terminal expression and main-stage priority:** Covered by Task 6.
- **Responsive guardrails, docs update, final verification, graphify rebuild:** Covered by Task 7.

### Placeholder scan
- No `TODO`, `TBD`, or “similar to Task N” placeholders remain.
- Every task includes exact file paths, concrete snippets, and exact commands.

### Type / naming consistency
- Semantic token names are consistent across the plan: `--surface-base`, `--surface-raised`, `--surface-overlay`, `--accent-primary`, `--border-subtle`, `--border-strong`.
- Shared confirm dialog tone naming is consistent: `default | danger | safe`.
- Page contract names remain aligned with the current codebase: `chat-main-stage`, `operate-workspace-shell`, `system-control-surface`, `terminal-workspace-surface`, `mobile-stage-tabs`.
