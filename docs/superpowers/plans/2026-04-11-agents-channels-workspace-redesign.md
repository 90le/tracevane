# Studio Agents / Channels 工作台重构 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 Studio 的 `agents` 与 `channels` 收敛为统一的工作台结构：左侧只选对象，右侧只做当前任务，默认薄概览，深页全部改成单任务面板。

**Architecture:** 保留现有 `/agents` 与 `/channels` 主路由和工作台壳层，不新建第二套路由系统。实现上分两段推进：先把 `agents` 深页和概览快改统一到同一工作台语言，再把 `channels` 的 provider 概览、账号索引卡和深页编辑器压平到 `Provider 优先 + 单任务面板` 模式。

**Tech Stack:** TypeScript, Vue 3, Vue Router, Studio workspace view-models, shared CSS in `apps/web-vue/src/style.css`, node:test system contract tests

---

## Frontend Boundary

- 所有改动优先限制在 `extensions/openclaw-studio/apps/web-vue/src/features/agents/` 与 `extensions/openclaw-studio/apps/web-vue/src/features/channels/`。
- 通用样式只落在 `extensions/openclaw-studio/apps/web-vue/src/style.css`，不再新建第三套工作台主题文件。
- 只在当前测试资产下扩展契约，不引入新测试框架。

## File Map

**Agents**

- Modify: `extensions/openclaw-studio/apps/web-vue/src/features/agents/AgentsControlPage.vue`
- Modify: `extensions/openclaw-studio/apps/web-vue/src/features/agents/AgentDocsPage.vue`
- Modify: `extensions/openclaw-studio/apps/web-vue/src/features/agents/AgentBindingsPage.vue`
- Modify: `extensions/openclaw-studio/apps/web-vue/src/features/agents/AgentSessionsPage.vue`
- Modify: `extensions/openclaw-studio/apps/web-vue/src/features/agents/AgentAdvancedPage.vue`

**Channels**

- Modify: `extensions/openclaw-studio/apps/web-vue/src/features/channels/ChannelsControlPage.vue`
- Modify: `extensions/openclaw-studio/apps/web-vue/src/features/channels/ChannelProviderOverview.vue`
- Modify: `extensions/openclaw-studio/apps/web-vue/src/features/channels/ChannelAccountIndex.vue`
- Modify: `extensions/openclaw-studio/apps/web-vue/src/features/channels/ChannelAccountCard.vue`
- Modify: `extensions/openclaw-studio/apps/web-vue/src/features/channels/ChannelProviderSettingsPage.vue`
- Modify: `extensions/openclaw-studio/apps/web-vue/src/features/channels/ChannelAccountDetailPage.vue`
- Modify: `extensions/openclaw-studio/apps/web-vue/src/features/channels/ChannelAccessControlPage.vue`
- Modify: `extensions/openclaw-studio/apps/web-vue/src/features/channels/ChannelPairingPage.vue`
- Modify: `extensions/openclaw-studio/apps/web-vue/src/features/channels/ChannelBindingsPage.vue`
- Modify: `extensions/openclaw-studio/apps/web-vue/src/features/channels/ChannelCredentialDrawer.vue`

**Shared UI**

- Modify: `extensions/openclaw-studio/apps/web-vue/src/style.css`

**Tests**

- Modify: `extensions/openclaw-studio/tests/system/studio-web-agents-workbench.test.mjs`
- Modify: `extensions/openclaw-studio/tests/system/studio-web-agents-quick-config.test.mjs`
- Modify: `extensions/openclaw-studio/tests/system/studio-web-agents-routes.test.mjs`
- Create: `extensions/openclaw-studio/tests/system/studio-web-agents-deep-pages.test.mjs`
- Modify: `extensions/openclaw-studio/tests/system/studio-web-channels-workspace.test.mjs`
- Modify: `extensions/openclaw-studio/tests/system/studio-web-channels-overview.test.mjs`
- Modify: `extensions/openclaw-studio/tests/system/studio-web-channels-deep-pages.test.mjs`
- Create: `extensions/openclaw-studio/tests/system/studio-web-channels-account-cards.test.mjs`
- Modify: `extensions/openclaw-studio/tests/system/studio-web-page-chrome-density.test.mjs`

**Docs**

- Modify: `extensions/openclaw-studio/docs/当前进展.md`

---

### Task 1: 先锁定工作台契约，补齐 agents/channels 的单任务页面测试

**Files:**
- Modify: `extensions/openclaw-studio/tests/system/studio-web-agents-routes.test.mjs`
- Modify: `extensions/openclaw-studio/tests/system/studio-web-agents-workbench.test.mjs`
- Create: `extensions/openclaw-studio/tests/system/studio-web-agents-deep-pages.test.mjs`
- Modify: `extensions/openclaw-studio/tests/system/studio-web-channels-workspace.test.mjs`
- Modify: `extensions/openclaw-studio/tests/system/studio-web-channels-overview.test.mjs`
- Modify: `extensions/openclaw-studio/tests/system/studio-web-channels-deep-pages.test.mjs`
- Create: `extensions/openclaw-studio/tests/system/studio-web-channels-account-cards.test.mjs`
- Modify: `extensions/openclaw-studio/tests/system/studio-web-page-chrome-density.test.mjs`

- [ ] **Step 1: 先写 agents 深页失败测试，锁定“单任务面板”结构**

```js
test('agents deep pages use task heads instead of repeating page-level chrome', () => {
  assert.match(agentDocsPage, /agents-stage-task-head/);
  assert.match(agentAdvancedPage, /agents-stage-task-head/);
  assert.match(agentSessionsPage, /agents-stage-task-head/);
  assert.doesNotMatch(agentDocsPage, /page-header-row/);
  assert.doesNotMatch(agentAdvancedPage, /page-header-row/);
  assert.doesNotMatch(agentSessionsPage, /page-header-row/);
});
```

- [ ] **Step 2: 写 channels 账号索引卡失败测试，锁定“索引卡而不是全功能卡”**

```js
test('channel account card stays an index card with concise facts and routed task actions', () => {
  assert.match(channelAccountCard, /channel-account-card__summary/);
  assert.match(channelAccountCard, /open-account|edit/);
  assert.match(channelAccountCard, /credentials/);
  assert.match(channelAccountCard, /access/);
  assert.match(channelAccountCard, /pairing/);
  assert.doesNotMatch(channelAccountCard, /form-input/);
  assert.doesNotMatch(channelAccountCard, /textarea/);
});
```

- [ ] **Step 3: 运行测试，确认当前实现确实失败**

Run:

```bash
cd /home/binbin/.openclaw/extensions/openclaw-studio
node --test \
  tests/system/studio-web-agents-routes.test.mjs \
  tests/system/studio-web-agents-workbench.test.mjs \
  tests/system/studio-web-channels-workspace.test.mjs \
  tests/system/studio-web-channels-overview.test.mjs \
  tests/system/studio-web-channels-deep-pages.test.mjs \
  tests/system/studio-web-page-chrome-density.test.mjs
```

Expected:

```text
at least 1 FAIL for missing agents-stage-task-head or channel-account-card__summary
```

- [ ] **Step 4: 提交只包含测试契约的失败基线**

```bash
cd /home/binbin/.openclaw
git add \
  extensions/openclaw-studio/tests/system/studio-web-agents-routes.test.mjs \
  extensions/openclaw-studio/tests/system/studio-web-agents-workbench.test.mjs \
  extensions/openclaw-studio/tests/system/studio-web-agents-deep-pages.test.mjs \
  extensions/openclaw-studio/tests/system/studio-web-channels-workspace.test.mjs \
  extensions/openclaw-studio/tests/system/studio-web-channels-overview.test.mjs \
  extensions/openclaw-studio/tests/system/studio-web-channels-deep-pages.test.mjs \
  extensions/openclaw-studio/tests/system/studio-web-channels-account-cards.test.mjs \
  extensions/openclaw-studio/tests/system/studio-web-page-chrome-density.test.mjs
git commit -m "test: lock workspace single-task contracts for agents and channels"
```

### Task 2: 重构 agents 概览与深页，统一成“薄概览 + 单任务面板”

**Files:**
- Modify: `extensions/openclaw-studio/apps/web-vue/src/features/agents/AgentsControlPage.vue`
- Modify: `extensions/openclaw-studio/apps/web-vue/src/features/agents/AgentDocsPage.vue`
- Modify: `extensions/openclaw-studio/apps/web-vue/src/features/agents/AgentBindingsPage.vue`
- Modify: `extensions/openclaw-studio/apps/web-vue/src/features/agents/AgentSessionsPage.vue`
- Modify: `extensions/openclaw-studio/apps/web-vue/src/features/agents/AgentAdvancedPage.vue`
- Modify: `extensions/openclaw-studio/apps/web-vue/src/style.css`
- Test: `extensions/openclaw-studio/tests/system/studio-web-agents-workbench.test.mjs`
- Test: `extensions/openclaw-studio/tests/system/studio-web-agents-deep-pages.test.mjs`
- Test: `extensions/openclaw-studio/tests/system/studio-web-page-chrome-density.test.mjs`

- [ ] **Step 1: 在概览页加入受限快改区，只保留启用、模型、工作区**

```vue
<section class="agents-overview-quick-edit">
  <label class="toggle-card">
    <input v-model="quickEdit.enabled" class="form-checkbox" type="checkbox" />
    <div>
      <strong>{{ text('启用状态', 'Enabled') }}</strong>
      <span>{{ text('概览页只允许改高频字段。', 'The overview only allows high-frequency changes.') }}</span>
    </div>
  </label>

  <div class="form-field">
    <label class="form-label">{{ text('模型', 'Model') }}</label>
    <GlassSelect v-model="quickEdit.model" :options="modelOptions" />
  </div>

  <div class="form-field">
    <label class="form-label">{{ text('工作区', 'Workspace') }}</label>
    <input v-model="quickEdit.workspace" class="form-input" />
  </div>
</section>
```

- [ ] **Step 2: 把 docs / sessions / advanced / bindings 的顶部 page chrome 改成统一任务头**

```vue
<div class="agents-stage-task-head">
  <div>
    <p class="eyebrow">{{ agentId }}</p>
    <h3>{{ text('工作区文档', 'Workspace Docs') }}</h3>
    <p>{{ text('当前页面只处理文档任务。', 'This page only handles the docs task.') }}</p>
  </div>

  <div class="page-actions">
    <button type="button" class="primary-button" @click="saveCurrentDoc">
      {{ text('保存', 'Save') }}
    </button>
  </div>
</div>
```

- [ ] **Step 3: 将 advanced 页改成连续编辑器，按分组收口而不是三张大卡堆叠**

```vue
<section class="agents-advanced-stack">
  <article class="panel-card agents-stage-panel">
    <div class="agents-stage-task-head">
      <div>
        <p class="eyebrow">{{ text('CORE', 'CORE') }}</p>
        <h3>{{ text('基础配置', 'Core configuration') }}</h3>
      </div>
    </div>
    <!-- core fields -->
  </article>

  <article class="panel-card agents-stage-panel">
    <div class="agents-stage-task-head">
      <div>
        <p class="eyebrow">{{ text('IDENTITY', 'IDENTITY') }}</p>
        <h3>{{ text('身份与运行时', 'Identity and Runtime') }}</h3>
      </div>
    </div>
    <!-- identity/runtime fields -->
  </article>
</section>
```

- [ ] **Step 4: 跑 agents 定向验证**

Run:

```bash
cd /home/binbin/.openclaw/extensions/openclaw-studio
npm run typecheck --workspace=apps/web-vue
node --test \
  tests/system/studio-web-agents-routes.test.mjs \
  tests/system/studio-web-agents-workbench.test.mjs \
  tests/system/studio-web-agents-quick-config.test.mjs \
  tests/system/studio-web-agents-deep-pages.test.mjs \
  tests/system/studio-web-page-chrome-density.test.mjs
```

Expected:

```text
PASS typecheck
PASS all listed agents tests
```

- [ ] **Step 5: 提交 agents 工作台重构**

```bash
cd /home/binbin/.openclaw
git add \
  extensions/openclaw-studio/apps/web-vue/src/features/agents/AgentsControlPage.vue \
  extensions/openclaw-studio/apps/web-vue/src/features/agents/AgentDocsPage.vue \
  extensions/openclaw-studio/apps/web-vue/src/features/agents/AgentBindingsPage.vue \
  extensions/openclaw-studio/apps/web-vue/src/features/agents/AgentSessionsPage.vue \
  extensions/openclaw-studio/apps/web-vue/src/features/agents/AgentAdvancedPage.vue \
  extensions/openclaw-studio/apps/web-vue/src/style.css \
  extensions/openclaw-studio/tests/system/studio-web-agents-routes.test.mjs \
  extensions/openclaw-studio/tests/system/studio-web-agents-workbench.test.mjs \
  extensions/openclaw-studio/tests/system/studio-web-agents-quick-config.test.mjs \
  extensions/openclaw-studio/tests/system/studio-web-agents-deep-pages.test.mjs \
  extensions/openclaw-studio/tests/system/studio-web-page-chrome-density.test.mjs
git commit -m "refactor: unify agents workspace task panels"
```

### Task 3: 收 channels provider 概览，改成 Provider 优先的薄概览

**Files:**
- Modify: `extensions/openclaw-studio/apps/web-vue/src/features/channels/ChannelsControlPage.vue`
- Modify: `extensions/openclaw-studio/apps/web-vue/src/features/channels/ChannelProviderOverview.vue`
- Modify: `extensions/openclaw-studio/apps/web-vue/src/features/channels/ChannelsWorkspaceLayout.vue`
- Modify: `extensions/openclaw-studio/apps/web-vue/src/style.css`
- Test: `extensions/openclaw-studio/tests/system/studio-web-channels-workspace.test.mjs`
- Test: `extensions/openclaw-studio/tests/system/studio-web-channels-overview.test.mjs`

- [ ] **Step 1: 给 provider 概览加入受限快改区，只保留启用状态、默认账号、新建账号**

```vue
<section class="channel-provider-quick-edit">
  <label class="toggle-card">
    <input v-model="providerQuickEdit.enabled" class="form-checkbox" type="checkbox" />
    <div>
      <strong>{{ text('频道启用状态', 'Provider enabled') }}</strong>
      <span>{{ text('这里只处理高频快改。', 'Only high-frequency changes belong here.') }}</span>
    </div>
  </label>

  <div class="form-field">
    <label class="form-label">{{ text('默认账号', 'Default account') }}</label>
    <GlassSelect v-model="providerQuickEdit.defaultAccount" :options="defaultAccountOptions" />
  </div>
</section>
```

- [ ] **Step 2: 让 overview 页面只保留摘要、异常和账号索引，不再自己承载第二套主头部**

```vue
<section class="channel-provider-overview">
  <ChannelSummaryStrip :channel="channel" :binding-count="bindings.length" />
  <ChannelIssueList :issues="issues" @activate-issue="$emit('activate-issue', $event)" />
  <ChannelAccountIndex
    :accounts="channel.accounts"
    :binding-count-by-account="bindingCountByAccount"
    :busy-account-id="busyAccountId"
    @open-account="$emit('open-account', $event)"
  />
</section>
```

- [ ] **Step 3: 跑 channels 概览级验证**

Run:

```bash
cd /home/binbin/.openclaw/extensions/openclaw-studio
npm run typecheck --workspace=apps/web-vue
node --test \
  tests/system/studio-web-channels-workspace.test.mjs \
  tests/system/studio-web-channels-overview.test.mjs \
  tests/system/studio-web-page-chrome-density.test.mjs
```

Expected:

```text
PASS typecheck
PASS all listed channels overview tests
```

- [ ] **Step 4: 提交 provider 概览重构**

```bash
cd /home/binbin/.openclaw
git add \
  extensions/openclaw-studio/apps/web-vue/src/features/channels/ChannelsControlPage.vue \
  extensions/openclaw-studio/apps/web-vue/src/features/channels/ChannelProviderOverview.vue \
  extensions/openclaw-studio/apps/web-vue/src/features/channels/ChannelsWorkspaceLayout.vue \
  extensions/openclaw-studio/apps/web-vue/src/style.css \
  extensions/openclaw-studio/tests/system/studio-web-channels-workspace.test.mjs \
  extensions/openclaw-studio/tests/system/studio-web-channels-overview.test.mjs \
  extensions/openclaw-studio/tests/system/studio-web-page-chrome-density.test.mjs
git commit -m "refactor: simplify channels provider overview"
```

### Task 4: 瘦身账号索引卡，并把深页统一成单任务面板

**Files:**
- Modify: `extensions/openclaw-studio/apps/web-vue/src/features/channels/ChannelAccountIndex.vue`
- Modify: `extensions/openclaw-studio/apps/web-vue/src/features/channels/ChannelAccountCard.vue`
- Modify: `extensions/openclaw-studio/apps/web-vue/src/features/channels/ChannelProviderSettingsPage.vue`
- Modify: `extensions/openclaw-studio/apps/web-vue/src/features/channels/ChannelAccountDetailPage.vue`
- Modify: `extensions/openclaw-studio/apps/web-vue/src/features/channels/ChannelAccessControlPage.vue`
- Modify: `extensions/openclaw-studio/apps/web-vue/src/features/channels/ChannelPairingPage.vue`
- Modify: `extensions/openclaw-studio/apps/web-vue/src/features/channels/ChannelBindingsPage.vue`
- Modify: `extensions/openclaw-studio/apps/web-vue/src/features/channels/ChannelCredentialDrawer.vue`
- Modify: `extensions/openclaw-studio/apps/web-vue/src/style.css`
- Test: `extensions/openclaw-studio/tests/system/studio-web-channels-deep-pages.test.mjs`
- Test: `extensions/openclaw-studio/tests/system/studio-web-channels-account-cards.test.mjs`
- Test: `extensions/openclaw-studio/tests/system/studio-web-channels-drawers.test.mjs`

- [ ] **Step 1: 把账号卡收成“摘要 + 任务入口”**

```vue
<article class="channel-account-card">
  <div class="channel-account-card__summary">
    <div>
      <strong>{{ account.id }}</strong>
      <p>{{ account.kind === 'default' ? text('默认配置档', 'Default profile') : text('命名账号', 'Named account') }}</p>
    </div>
    <StatusPill :label="account.enabled ? text('启用', 'Enabled') : text('禁用', 'Disabled')" :tone="account.enabled ? 'sage' : 'neutral'" />
  </div>

  <div class="channel-account-card__tasks">
    <button type="button" class="ghost-action" @click="$emit('edit')">{{ text('账号详情', 'Account') }}</button>
    <button type="button" class="ghost-action" @click="$emit('credentials')">{{ text('凭据', 'Credentials') }}</button>
    <button type="button" class="ghost-action" @click="$emit('access')">{{ text('权限', 'Access') }}</button>
    <button type="button" class="ghost-action" @click="$emit('pairing')">{{ text('配对', 'Pairing') }}</button>
    <button type="button" class="ghost-action" @click="$emit('bindings')">{{ text('绑定', 'Bindings') }}</button>
  </div>
</article>
```

- [ ] **Step 2: 把所有 channels 深页顶部统一为任务头，不再重复 stage 级大标题**

```vue
<div class="channels-stage-task-head">
  <div>
    <p class="eyebrow">{{ channel.type }} · {{ account.id }}</p>
    <h3>{{ text('访问控制', 'Access Control') }}</h3>
    <p>{{ text('当前页面只处理白名单任务。', 'This page only handles allowlists.') }}</p>
  </div>
</div>
```

- [ ] **Step 3: 让凭据编辑器继续保留 drawer，但任务语义与深页一致**

```vue
<header class="surface-drawer-head channels-drawer-task-head">
  <div>
    <p class="eyebrow">{{ accountId }}</p>
    <h3>{{ text('凭据', 'Credentials') }}</h3>
    <p>{{ text('这里只编辑当前账号凭据，不混入其它设置。', 'Only account credentials are edited here.') }}</p>
  </div>
</header>
```

- [ ] **Step 4: 跑 channels 深页验证**

Run:

```bash
cd /home/binbin/.openclaw/extensions/openclaw-studio
npm run typecheck --workspace=apps/web-vue
node --test \
  tests/system/studio-web-channels-deep-pages.test.mjs \
  tests/system/studio-web-channels-account-cards.test.mjs \
  tests/system/studio-web-channels-drawers.test.mjs \
  tests/system/studio-web-page-chrome-density.test.mjs
```

Expected:

```text
PASS typecheck
PASS all listed channels deep-page tests
```

- [ ] **Step 5: 提交 channels 单任务面板重构**

```bash
cd /home/binbin/.openclaw
git add \
  extensions/openclaw-studio/apps/web-vue/src/features/channels/ChannelAccountIndex.vue \
  extensions/openclaw-studio/apps/web-vue/src/features/channels/ChannelAccountCard.vue \
  extensions/openclaw-studio/apps/web-vue/src/features/channels/ChannelProviderSettingsPage.vue \
  extensions/openclaw-studio/apps/web-vue/src/features/channels/ChannelAccountDetailPage.vue \
  extensions/openclaw-studio/apps/web-vue/src/features/channels/ChannelAccessControlPage.vue \
  extensions/openclaw-studio/apps/web-vue/src/features/channels/ChannelPairingPage.vue \
  extensions/openclaw-studio/apps/web-vue/src/features/channels/ChannelBindingsPage.vue \
  extensions/openclaw-studio/apps/web-vue/src/features/channels/ChannelCredentialDrawer.vue \
  extensions/openclaw-studio/apps/web-vue/src/style.css \
  extensions/openclaw-studio/tests/system/studio-web-channels-deep-pages.test.mjs \
  extensions/openclaw-studio/tests/system/studio-web-channels-account-cards.test.mjs \
  extensions/openclaw-studio/tests/system/studio-web-channels-drawers.test.mjs \
  extensions/openclaw-studio/tests/system/studio-web-page-chrome-density.test.mjs
git commit -m "refactor: unify channels task panels and account cards"
```

### Task 5: 文档收口与整体验证

**Files:**
- Modify: `extensions/openclaw-studio/docs/当前进展.md`

- [ ] **Step 1: 更新当前进展文档，明确 agents/channels 已切换到工作台型单任务面板**

```md
- `agents` 已完成深页单任务面板化，概览页只保留受限快改
- `channels` 已完成 Provider 优先概览、账号索引卡瘦身与深页任务头统一
```

- [ ] **Step 2: 跑最终前端构建与完整定向回归**

Run:

```bash
cd /home/binbin/.openclaw/extensions/openclaw-studio
npm run typecheck --workspace=apps/web-vue
npm run build --workspace=apps/web-vue
node --test \
  tests/system/studio-web-agents-routes.test.mjs \
  tests/system/studio-web-agents-workbench.test.mjs \
  tests/system/studio-web-agents-quick-config.test.mjs \
  tests/system/studio-web-agents-deep-pages.test.mjs \
  tests/system/studio-web-channels-workspace.test.mjs \
  tests/system/studio-web-channels-overview.test.mjs \
  tests/system/studio-web-channels-deep-pages.test.mjs \
  tests/system/studio-web-channels-account-cards.test.mjs \
  tests/system/studio-web-channels-drawers.test.mjs \
  tests/system/studio-web-page-chrome-density.test.mjs
```

Expected:

```text
PASS typecheck
PASS build
PASS all listed system tests
```

- [ ] **Step 3: 提交文档和最终收口**

```bash
cd /home/binbin/.openclaw
git add \
  extensions/openclaw-studio/docs/当前进展.md \
  extensions/openclaw-studio/docs/superpowers/plans/2026-04-11-agents-channels-workspace-redesign.md
git commit -m "docs: record agents channels workspace rollout"
```

---

## Self-Review

### Spec coverage

- `agents` 默认概览、少量快改、深页单任务面板：由 Task 2 覆盖。
- `channels` Provider 优先概览、账号索引卡瘦身、深页单任务面板：由 Task 3 和 Task 4 覆盖。
- 路由保持不大改、继续用现有工作台壳层：由 Task 1 契约和各任务文件边界覆盖。
- 统一样式语言与页面密度：由 Task 2、Task 3、Task 4 中的 `style.css` 修改和 `studio-web-page-chrome-density` 回归覆盖。

### Placeholder scan

- 本计划没有 `TBD / TODO / implement later / similar to` 这类占位描述。
- 每个实现任务都给出具体文件、具体代码形态和验证命令。

### Type consistency

- `agents-stage-task-head` 用于 agents 深页。
- `channels-stage-task-head` 用于 channels 深页。
- `channel-account-card__summary` / `channel-account-card__tasks` 用于账号索引卡。
- 快改边界只落在 `agents` 概览和 `channels` provider 概览，不把复杂配置重新塞回概览页。
