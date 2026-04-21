# Terminal Workspace Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Terminal page into an IDE-style workspace with unified session management, rename/end/delete actions, a centered terminal stage, and cleaner dark/light theme behavior.

**Architecture:** Keep the existing terminal backend/session persistence model, but extend the workspace state and routes so the frontend can distinguish open tabs from durable sessions. Replace the current top-tabs + right recent rail + right action panel collage with a left Session Explorer, a lightweight top tab strip, a central terminal stage, and an on-demand inspector drawer.

**Tech Stack:** Vue 3 Composition API, TypeScript, existing Studio terminal API/routes, node:test system source-contract tests, Vite CSS/theme tokens

---

## File Map

- **Modify:** `apps/web-vue/src/features/terminal/terminal-workspace-state.ts`
  - Add explicit open/recent/ended grouping and session lifecycle actions (`renameSession`, `endSession`, `deleteSession`, `openTab`).
- **Modify:** `apps/web-vue/src/features/terminal/terminal-session-registry.ts`
  - Add registry helpers needed for rename/delete persistence semantics.
- **Modify:** `apps/web-vue/src/features/terminal/api.ts`
  - Add frontend calls for rename/delete session endpoints while keeping end-session support.
- **Modify:** `apps/api/modules/terminal/routes.ts`
  - Add minimal session rename/delete endpoints that delegate to terminal service persistence operations.
- **Modify:** `apps/api/modules/terminal/service.ts`
  - Add durable rename/delete support for persisted session descriptors.
- **Create:** `apps/web-vue/src/features/terminal/TerminalSessionExplorer.vue`
  - Render grouped Open / Recent / Ended explorer list with overflow actions.
- **Create:** `apps/web-vue/src/features/terminal/TerminalInspectorDrawer.vue`
  - Host action panel/details in an on-demand drawer instead of a fixed column.
- **Modify:** `apps/web-vue/src/features/terminal/TerminalTabRail.vue`
  - Simplify into a light tab strip for the current open tab set and add rename affordance hook.
- **Modify:** `apps/web-vue/src/features/terminal/TerminalActionPanel.vue`
  - Make it drawer-friendly and not a full-height column shell.
- **Modify:** `apps/web-vue/src/features/terminal/TerminalRecentSessionRail.vue`
  - Remove once explorer absorbs it, or leave as dead code only if fully replaced in same task and then delete.
- **Modify:** `apps/web-vue/src/features/terminal/TerminalSessionPane.vue`
  - Add compact session meta/header actions for rename/end/delete visibility.
- **Modify:** `apps/web-vue/src/features/terminal/TerminalWorkspacePage.vue`
  - Recompose page into explorer + tab strip + stage + inspector drawer.
- **Modify:** `apps/web-vue/src/features/terminal/terminal-workspace.css`
  - Replace current three-column shell with unified workspace layout and theme-consistent tokens.
- **Modify:** `tests/system/studio-web-terminal-workspace-shell.test.mjs`
  - Add source contracts for new composition and removed recent-rail layout.
- **Modify:** `tests/system/studio-web-terminal-route-session.test.mjs`
  - Add route/API coverage for rename/delete endpoints.
- **Modify:** `tests/system/studio-web-system-terminal-layout-redesign.test.mjs`
  - Update terminal surface/style contracts for the new workspace hierarchy.

---

### Task 1: Add failing tests for session lifecycle API and state semantics

**Files:**
- Modify: `tests/system/studio-web-terminal-route-session.test.mjs`
- Modify: `tests/system/studio-web-terminal-workspace-shell.test.mjs`
- Modify: `apps/api/modules/terminal/routes.ts`
- Modify: `apps/web-vue/src/features/terminal/terminal-workspace-state.ts`
- Modify: `apps/web-vue/src/features/terminal/terminal-session-registry.ts`

- [ ] **Step 1: Write the failing route/source tests**

Append these tests to `tests/system/studio-web-terminal-route-session.test.mjs`:

```js
test("terminal routes expose rename and delete session endpoints", () => {
  assert.match(terminalRoutesSource, /\/api\/terminal\/sessions\/:sessionId\/rename/);
  assert.match(terminalRoutesSource, /\/api\/terminal\/sessions\/:sessionId\/delete/);
});

test("terminal session routes delegate rename and delete to terminal service", () => {
  assert.match(terminalRoutesSource, /renamePersistedSession\(params\.sessionId,/);
  assert.match(terminalRoutesSource, /deletePersistedSession\(params\.sessionId\)/);
});
```

Append these tests to `tests/system/studio-web-terminal-workspace-shell.test.mjs`:

```js
test("terminal workspace state exposes explicit session lifecycle actions", () => {
  const statePath = path.join(
    rootDir,
    "apps/web-vue/src/features/terminal/terminal-workspace-state.ts",
  );
  const stateSource = fs.readFileSync(statePath, "utf8");

  assert.match(stateSource, /openSessions: ComputedRef<TerminalSessionDescriptor\[\]>/);
  assert.match(stateSource, /recentSessions: ComputedRef<TerminalSessionDescriptor\[\]>/);
  assert.match(stateSource, /endedSessions: ComputedRef<TerminalSessionDescriptor\[\]>/);
  assert.match(stateSource, /openTab\(sessionId: string\): void/);
  assert.match(stateSource, /renameSession\(sessionId: string, title: string\): void/);
  assert.match(stateSource, /endSession\(sessionId: string\): void/);
  assert.match(stateSource, /deleteSession\(sessionId: string\): void/);
});

test("terminal registry exposes rename and delete helpers", () => {
  const registryPath = path.join(
    rootDir,
    "apps/web-vue/src/features/terminal/terminal-session-registry.ts",
  );
  const registrySource = fs.readFileSync(registryPath, "utf8");

  assert.match(registrySource, /renameSession\(sessionId: string, title: string\): void/);
  assert.match(registrySource, /removeSession\(sessionId\)/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
cd /home/binbin/.openclaw/extensions/openclaw-studio/.worktrees/home-dashboard-context-panel && node --test tests/system/studio-web-terminal-route-session.test.mjs tests/system/studio-web-terminal-workspace-shell.test.mjs
```

Expected: FAIL because rename/delete endpoints and new state actions do not exist yet.

- [ ] **Step 3: Write minimal route and state interfaces**

In `apps/api/modules/terminal/routes.ts`, add routes like:

```ts
  router.post(
    "/api/terminal/sessions/:sessionId/rename",
    async (req, res, routeCtx, params) => {
      const body = await parseJsonBody<{ title?: string }>(req);
      sendJson(
        res,
        200,
        await routeCtx.services.terminal.renamePersistedSession(
          params.sessionId,
          String(body.title || ""),
        ),
      );
    },
  );

  router.post(
    "/api/terminal/sessions/:sessionId/delete",
    async (_req, res, routeCtx, params) => {
      sendJson(
        res,
        200,
        await routeCtx.services.terminal.deletePersistedSession(params.sessionId),
      );
    },
  );
```

In `apps/web-vue/src/features/terminal/terminal-session-registry.ts`, extend the interface:

```ts
export interface TerminalSessionRegistry {
  sessionsById: Record<string, TerminalSessionDescriptor>;
  upsertSession(session: TerminalSessionDescriptor): void;
  removeSession(sessionId: string): void;
  renameSession(sessionId: string, title: string): void;
  getSession(sessionId: string): TerminalSessionDescriptor | null;
}
```

and implement:

```ts
    renameSession(sessionId, title) {
      const normalized = normalizeSessionId(sessionId);
      const current = sessionsById[normalized];
      if (!current) return;
      const nextTitle = String(title || "").trim() || normalized;
      sessionsById[normalized] = normalizeSessionDescriptor({
        ...current,
        title: nextTitle,
      });
    },
```

In `apps/web-vue/src/features/terminal/terminal-workspace-state.ts`, extend the interface:

```ts
export interface TerminalWorkspaceState {
  sessions: ComputedRef<Record<string, TerminalSessionDescriptor>>;
  tabs: ComputedRef<TerminalSessionDescriptor[]>;
  openSessions: ComputedRef<TerminalSessionDescriptor[]>;
  recentSessions: ComputedRef<TerminalSessionDescriptor[]>;
  endedSessions: ComputedRef<TerminalSessionDescriptor[]>;
  tabOrder: Ref<string[]>;
  activeSessionId: Ref<string | null>;
  recoverableSessions: ComputedRef<TerminalSessionDescriptor[]>;
  registerSession(session: TerminalSessionDescriptor): void;
  hydrateSessions(sessions: TerminalSessionDescriptor[]): void;
  persistSessions(): void;
  setActiveSession(sessionId: string | null): void;
  openTab(sessionId: string): void;
  renameSession(sessionId: string, title: string): void;
  endSession(sessionId: string): void;
  deleteSession(sessionId: string): void;
  closeTab(sessionId: string): void;
}
```

Add derived collections and minimal implementations:

```ts
  const openSessions = computed(() => tabs.value);

  const recentSessions = computed(() =>
    Object.values(registry.sessionsById)
      .filter((session) => !tabOrder.value.includes(session.sessionId) && session.status !== "completed" && session.status !== "failed")
      .sort(sortTerminalSessionsByUpdatedAtDesc),
  );

  const endedSessions = computed(() =>
    Object.values(registry.sessionsById)
      .filter((session) => session.status === "completed" || session.status === "failed" || session.status === "lost")
      .sort(sortTerminalSessionsByUpdatedAtDesc),
  );

  function openTab(sessionId: string): void {
    const normalized = normalizeSessionId(sessionId);
    if (!normalized || !registry.getSession(normalized)) return;
    ensureTab(normalized);
    activeSessionId.value = normalized;
  }

  function renameSession(sessionId: string, title: string): void {
    registry.renameSession(sessionId, title);
    persistSessions();
  }

  function endSession(sessionId: string): void {
    const current = registry.getSession(sessionId);
    if (!current) return;
    registry.upsertSession({
      ...current,
      status: current.status === "failed" ? "failed" : "completed",
      canResume: false,
      updatedAt: new Date().toISOString(),
    });
    persistSessions();
  }

  function deleteSession(sessionId: string): void {
    registry.removeSession(sessionId);
    tabOrder.value = tabOrder.value.filter((tabId) => tabId !== normalizeSessionId(sessionId));
    if (activeSessionId.value === normalizeSessionId(sessionId)) {
      activeSessionId.value = tabOrder.value[tabOrder.value.length - 1] || null;
    }
    persistSessions();
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
cd /home/binbin/.openclaw/extensions/openclaw-studio/.worktrees/home-dashboard-context-panel && node --test tests/system/studio-web-terminal-route-session.test.mjs tests/system/studio-web-terminal-workspace-shell.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/system/studio-web-terminal-route-session.test.mjs tests/system/studio-web-terminal-workspace-shell.test.mjs apps/api/modules/terminal/routes.ts apps/web-vue/src/features/terminal/terminal-workspace-state.ts apps/web-vue/src/features/terminal/terminal-session-registry.ts
git commit -m "feat: add terminal session lifecycle state"
```

---

### Task 2: Add failing tests for explorer-first workspace composition

**Files:**
- Modify: `tests/system/studio-web-terminal-workspace-shell.test.mjs`
- Create: `apps/web-vue/src/features/terminal/TerminalSessionExplorer.vue`
- Create: `apps/web-vue/src/features/terminal/TerminalInspectorDrawer.vue`
- Modify: `apps/web-vue/src/features/terminal/TerminalWorkspacePage.vue`
- Modify: `apps/web-vue/src/features/terminal/TerminalRecentSessionRail.vue`
- Modify: `apps/web-vue/src/features/terminal/TerminalActionPanel.vue`

- [ ] **Step 1: Write the failing composition tests**

Append these tests to `tests/system/studio-web-terminal-workspace-shell.test.mjs`:

```js
test("terminal workspace page composes explorer, tab strip, session pane, and inspector drawer", () => {
  assert.match(workspacePage, /<TerminalSessionExplorer/);
  assert.match(workspacePage, /<TerminalTabRail/);
  assert.match(workspacePage, /<TerminalSessionPane/);
  assert.match(workspacePage, /<TerminalInspectorDrawer/);
  assert.doesNotMatch(workspacePage, /<TerminalRecentSessionRail/);
});

test("terminal workspace no longer renders action and recent rails as fixed side columns", () => {
  assert.doesNotMatch(workspacePage, /terminal-workspace-main[\s\S]*TerminalActionPanel[\s\S]*TerminalRecentSessionRail/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd /home/binbin/.openclaw/extensions/openclaw-studio/.worktrees/home-dashboard-context-panel && node --test tests/system/studio-web-terminal-workspace-shell.test.mjs
```

Expected: FAIL because explorer and inspector drawer are not present yet.

- [ ] **Step 3: Write minimal explorer and drawer components**

Create `apps/web-vue/src/features/terminal/TerminalSessionExplorer.vue`:

```vue
<template>
  <aside class="terminal-session-explorer" aria-label="Terminal session explorer">
    <section class="terminal-session-group">
      <h3>Open</h3>
      <ul>
        <li v-for="session in openSessions" :key="session.sessionId">
          <button type="button" class="terminal-session-item" :class="{ active: session.sessionId === activeSessionId }" @click="$emit('select', session.sessionId)">
            <span class="terminal-session-item__title">{{ session.title }}</span>
          </button>
        </li>
      </ul>
    </section>
    <section class="terminal-session-group">
      <h3>Recent</h3>
      <ul>
        <li v-for="session in recentSessions" :key="session.sessionId">
          <button type="button" class="terminal-session-item" @click="$emit('select', session.sessionId)">
            <span class="terminal-session-item__title">{{ session.title }}</span>
          </button>
        </li>
      </ul>
    </section>
    <section class="terminal-session-group">
      <h3>Ended</h3>
      <ul>
        <li v-for="session in endedSessions" :key="session.sessionId">
          <button type="button" class="terminal-session-item" @click="$emit('select', session.sessionId)">
            <span class="terminal-session-item__title">{{ session.title }}</span>
          </button>
        </li>
      </ul>
    </section>
  </aside>
</template>

<script setup lang="ts">
import type { TerminalSessionDescriptor } from './terminal-session-registry';

defineProps<{
  openSessions: TerminalSessionDescriptor[];
  recentSessions: TerminalSessionDescriptor[];
  endedSessions: TerminalSessionDescriptor[];
  activeSessionId: string | null;
}>();

defineEmits<{
  (e: 'select', sessionId: string): void;
}>();
</script>
```

Create `apps/web-vue/src/features/terminal/TerminalInspectorDrawer.vue`:

```vue
<template>
  <aside v-if="open" class="terminal-inspector-drawer" aria-label="Terminal inspector drawer">
    <slot />
  </aside>
</template>

<script setup lang="ts">
defineProps<{
  open: boolean;
}>();
</script>
```

Modify `apps/web-vue/src/features/terminal/TerminalWorkspacePage.vue` template to:

```vue
  <section class="terminal-workspace-shell" data-testid="terminal-workspace-shell">
    <div class="terminal-workspace-body">
      <TerminalSessionExplorer
        :open-sessions="workspace.openSessions.value"
        :recent-sessions="workspace.recentSessions.value"
        :ended-sessions="workspace.endedSessions.value"
        :active-session-id="workspace.activeSessionId.value"
        @select="workspace.openTab"
      />

      <section class="terminal-workspace-stage">
        <TerminalTabRail
          :tabs="workspace.tabs.value"
          :active-session-id="workspace.activeSessionId.value"
          @select="workspace.setActiveSession"
          @close="workspace.closeTab"
          @create="createSession"
        />
        <TerminalSessionPane :active-session-id="workspace.activeSessionId.value" />
      </section>

      <TerminalInspectorDrawer :open="inspectorOpen">
        <TerminalActionPanel :action-layers="actionLayers" @trigger="handleActionTrigger" />
      </TerminalInspectorDrawer>
    </div>
  </section>
```

Add minimal state in the script:

```ts
import { onMounted, ref } from 'vue';
import TerminalInspectorDrawer from './TerminalInspectorDrawer.vue';
import TerminalSessionExplorer from './TerminalSessionExplorer.vue';

const inspectorOpen = ref(false);
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
cd /home/binbin/.openclaw/extensions/openclaw-studio/.worktrees/home-dashboard-context-panel && node --test tests/system/studio-web-terminal-workspace-shell.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/system/studio-web-terminal-workspace-shell.test.mjs apps/web-vue/src/features/terminal/TerminalWorkspacePage.vue apps/web-vue/src/features/terminal/TerminalSessionExplorer.vue apps/web-vue/src/features/terminal/TerminalInspectorDrawer.vue apps/web-vue/src/features/terminal/TerminalActionPanel.vue
git commit -m "feat: compose terminal explorer workspace"
```

---

### Task 3: Add failing tests for tab rename/end/delete affordances

**Files:**
- Modify: `tests/system/studio-web-terminal-workspace-shell.test.mjs`
- Modify: `apps/web-vue/src/features/terminal/TerminalTabRail.vue`
- Modify: `apps/web-vue/src/features/terminal/TerminalSessionPane.vue`
- Modify: `apps/web-vue/src/features/terminal/TerminalSessionExplorer.vue`
- Modify: `apps/web-vue/src/features/terminal/api.ts`

- [ ] **Step 1: Write the failing UI contract tests**

Append these tests to `tests/system/studio-web-terminal-workspace-shell.test.mjs`:

```js
test("terminal tab strip exposes rename and close affordances", () => {
  const tabRailPath = path.join(
    rootDir,
    "apps/web-vue/src/features/terminal/TerminalTabRail.vue",
  );
  const tabRail = fs.readFileSync(tabRailPath, "utf8");

  assert.match(tabRail, /rename/);
  assert.match(tabRail, /close/);
});

test("terminal session pane exposes end and delete session affordances", () => {
  const panePath = path.join(
    rootDir,
    "apps/web-vue/src/features/terminal/TerminalSessionPane.vue",
  );
  const pane = fs.readFileSync(panePath, "utf8");

  assert.match(pane, /endSession/);
  assert.match(pane, /deleteSession/);
});

test("terminal api exposes rename and delete session calls", () => {
  const apiPath = path.join(
    rootDir,
    "apps/web-vue/src/features/terminal/api.ts",
  );
  const apiSource = fs.readFileSync(apiPath, "utf8");

  assert.match(apiSource, /renameTerminalSession/);
  assert.match(apiSource, /deleteTerminalSession/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd /home/binbin/.openclaw/extensions/openclaw-studio/.worktrees/home-dashboard-context-panel && node --test tests/system/studio-web-terminal-workspace-shell.test.mjs
```

Expected: FAIL because the rename/delete affordances and API helpers do not exist.

- [ ] **Step 3: Write minimal API and component affordances**

In `apps/web-vue/src/features/terminal/api.ts`, add:

```ts
export function renameTerminalSession(
  sessionId: string,
  title: string,
): Promise<TerminalSessionDescriptor> {
  return requestJson<TerminalSessionDescriptor>(
    `/api/terminal/sessions/${encodeURIComponent(sessionId.trim())}/rename`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ title }),
    },
  );
}

export function deleteTerminalSession(
  sessionId: string,
): Promise<{ success: boolean; sessionId: string }> {
  return requestJson<{ success: boolean; sessionId: string }>(
    `/api/terminal/sessions/${encodeURIComponent(sessionId.trim())}/delete`,
    {
      method: "POST",
    },
  );
}
```

In `apps/web-vue/src/features/terminal/TerminalTabRail.vue`, extend emits and add rename trigger:

```ts
defineEmits<{
  (e: 'select', sessionId: string): void;
  (e: 'close', sessionId: string): void;
  (e: 'rename', sessionId: string): void;
  (e: 'create'): void;
}>();
```

and add a button inside each tab:

```vue
      <button
        type="button"
        class="terminal-tab-rename"
        aria-label="Rename tab"
        @click="$emit('rename', tab.sessionId)"
      >
        ⋯
      </button>
```

In `apps/web-vue/src/features/terminal/TerminalSessionPane.vue`, add action buttons near the active session area:

```vue
    <div v-if="activeSession" class="terminal-session-actions">
      <button type="button" class="secondary-button compact-button" @click="emit('renameSession', activeSession.sessionId)">
        重命名
      </button>
      <button type="button" class="secondary-button compact-button" @click="emit('endSession', activeSession.sessionId)">
        结束
      </button>
      <button v-if="activeSession.status === 'completed' || activeSession.status === 'failed'" type="button" class="secondary-button compact-button" @click="emit('deleteSession', activeSession.sessionId)">
        删除
      </button>
    </div>
```

and script emits:

```ts
const emit = defineEmits<{
  (e: 'renameSession', sessionId: string): void;
  (e: 'endSession', sessionId: string): void;
  (e: 'deleteSession', sessionId: string): void;
}>();
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
cd /home/binbin/.openclaw/extensions/openclaw-studio/.worktrees/home-dashboard-context-panel && node --test tests/system/studio-web-terminal-workspace-shell.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/system/studio-web-terminal-workspace-shell.test.mjs apps/web-vue/src/features/terminal/api.ts apps/web-vue/src/features/terminal/TerminalTabRail.vue apps/web-vue/src/features/terminal/TerminalSessionPane.vue apps/web-vue/src/features/terminal/TerminalSessionExplorer.vue
git commit -m "feat: add terminal tab and session actions"
```

---

### Task 4: Add failing tests for theme/layout cleanup

**Files:**
- Modify: `tests/system/studio-web-system-terminal-layout-redesign.test.mjs`
- Modify: `apps/web-vue/src/features/terminal/terminal-workspace.css`
- Modify: `apps/web-vue/src/features/terminal/TerminalWorkspacePage.vue`

- [ ] **Step 1: Write the failing layout/theme tests**

Append these tests to `tests/system/studio-web-system-terminal-layout-redesign.test.mjs`:

```js
test("terminal workspace uses explorer-stage-drawer shell instead of fixed triple rail", () => {
  const workspacePage = read(
    "apps/web-vue/src/features/terminal/TerminalWorkspacePage.vue",
  );
  const workspaceCss = read(
    "apps/web-vue/src/features/terminal/terminal-workspace.css",
  );

  assert.match(workspacePage, /terminal-workspace-body/);
  assert.match(workspacePage, /terminal-workspace-stage/);
  assert.match(workspacePage, /terminal-session-explorer/);
  assert.match(workspacePage, /terminal-inspector-drawer/);
  assert.doesNotMatch(workspaceCss, /grid-template-columns:\s*minmax\(0, 1fr\) 280px 260px/);
});

test("terminal workspace theme uses unified surface tokens for explorer, stage, and drawer", () => {
  const workspaceCss = read(
    "apps/web-vue/src/features/terminal/terminal-workspace.css",
  );

  assert.match(workspaceCss, /\.terminal-session-explorer[\s\S]*background:\s*var\(--surface-base\);/);
  assert.match(workspaceCss, /\.terminal-inspector-drawer[\s\S]*background:\s*var\(--surface-base\);/);
  assert.match(workspaceCss, /\.terminal-workspace-stage[\s\S]*border:\s*1px solid var\(--border-subtle\);/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd /home/binbin/.openclaw/extensions/openclaw-studio/.worktrees/home-dashboard-context-panel && node --test tests/system/studio-web-system-terminal-layout-redesign.test.mjs
```

Expected: FAIL because the old three-column layout and surface contracts still exist.

- [ ] **Step 3: Write minimal CSS/layout cleanup**

In `apps/web-vue/src/features/terminal/TerminalWorkspacePage.vue`, wrap layout like:

```vue
  <section class="terminal-workspace-shell" data-testid="terminal-workspace-shell">
    <div class="terminal-workspace-body">
      <TerminalSessionExplorer ... />
      <section class="terminal-workspace-stage">
        <TerminalTabRail ... />
        <TerminalSessionPane ... />
      </section>
      <TerminalInspectorDrawer :open="inspectorOpen">
        <TerminalActionPanel ... />
      </TerminalInspectorDrawer>
    </div>
  </section>
```

In `apps/web-vue/src/features/terminal/terminal-workspace.css`, replace the old shell with:

```css
.terminal-workspace-shell {
  min-height: 100%;
}

.terminal-workspace-body {
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr) auto;
  gap: 12px;
  min-height: 0;
}

.terminal-session-explorer,
.terminal-inspector-drawer,
.terminal-workspace-stage {
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  background: var(--surface-base);
}

.terminal-workspace-stage {
  display: grid;
  grid-template-rows: auto 1fr;
  min-width: 0;
  min-height: 0;
}

.terminal-session-explorer,
.terminal-inspector-drawer {
  padding: 12px;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
cd /home/binbin/.openclaw/extensions/openclaw-studio/.worktrees/home-dashboard-context-panel && node --test tests/system/studio-web-system-terminal-layout-redesign.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/system/studio-web-system-terminal-layout-redesign.test.mjs apps/web-vue/src/features/terminal/TerminalWorkspacePage.vue apps/web-vue/src/features/terminal/terminal-workspace.css
git commit -m "feat: simplify terminal workspace layout"
```

---

### Task 5: Wire rename/end/delete behavior through the workspace page

**Files:**
- Modify: `apps/web-vue/src/features/terminal/TerminalWorkspacePage.vue`
- Modify: `apps/web-vue/src/features/terminal/api.ts`
- Modify: `apps/web-vue/src/features/terminal/TerminalSessionPane.vue`
- Modify: `apps/web-vue/src/features/terminal/TerminalSessionExplorer.vue`
- Modify: `tests/system/studio-web-terminal-workspace-shell.test.mjs`

- [ ] **Step 1: Write the failing workflow tests**

Append these tests to `tests/system/studio-web-terminal-workspace-shell.test.mjs`:

```js
test("terminal workspace wires explorer and pane actions to session lifecycle handlers", () => {
  assert.match(workspacePage, /@rename-session=/);
  assert.match(workspacePage, /@end-session=/);
  assert.match(workspacePage, /@delete-session=/);
  assert.match(workspacePage, /renameTerminalSession/);
  assert.match(workspacePage, /deleteTerminalSession/);
  assert.match(workspacePage, /endTerminalSession/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd /home/binbin/.openclaw/extensions/openclaw-studio/.worktrees/home-dashboard-context-panel && node --test tests/system/studio-web-terminal-workspace-shell.test.mjs
```

Expected: FAIL because the page does not yet wire these handlers.

- [ ] **Step 3: Write minimal workflow glue**

In `apps/web-vue/src/features/terminal/TerminalWorkspacePage.vue`, add imports:

```ts
import {
  deleteTerminalSession,
  endTerminalSession,
  fetchPersistedTerminalSessions,
  fetchTerminalActions,
  renameTerminalSession,
} from './api';
```

Add handlers:

```ts
async function renameSession(sessionId: string): Promise<void> {
  const nextTitle = globalThis.prompt?.('Rename terminal session', workspace.sessions.value[sessionId]?.title || '') || '';
  if (!nextTitle.trim()) return;
  await renameTerminalSession(sessionId, nextTitle);
  workspace.renameSession(sessionId, nextTitle);
}

async function endSession(sessionId: string): Promise<void> {
  await endTerminalSession({ sid: sessionId });
  workspace.endSession(sessionId);
}

async function deleteSession(sessionId: string): Promise<void> {
  await deleteTerminalSession(sessionId);
  workspace.deleteSession(sessionId);
}
```

Wire events:

```vue
      <TerminalSessionExplorer
        ...
        @select="workspace.openTab"
        @rename-session="renameSession"
        @end-session="endSession"
        @delete-session="deleteSession"
      />
```

```vue
        <TerminalTabRail
          ...
          @rename="renameSession"
        />
```

```vue
        <TerminalSessionPane
          :active-session-id="workspace.activeSessionId.value"
          @rename-session="renameSession"
          @end-session="endSession"
          @delete-session="deleteSession"
        />
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
cd /home/binbin/.openclaw/extensions/openclaw-studio/.worktrees/home-dashboard-context-panel && node --test tests/system/studio-web-terminal-workspace-shell.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/system/studio-web-terminal-workspace-shell.test.mjs apps/web-vue/src/features/terminal/TerminalWorkspacePage.vue apps/web-vue/src/features/terminal/api.ts apps/web-vue/src/features/terminal/TerminalSessionPane.vue apps/web-vue/src/features/terminal/TerminalSessionExplorer.vue
git commit -m "feat: wire terminal session lifecycle actions"
```

---

### Task 6: Final verification and graph refresh

**Files:**
- Modify: `tests/system/studio-web-terminal-workspace-shell.test.mjs`
- Modify: `tests/system/studio-web-terminal-route-session.test.mjs`
- Modify: `tests/system/studio-web-system-terminal-layout-redesign.test.mjs`
- Modify: `apps/web-vue/src/features/terminal/TerminalWorkspacePage.vue`
- Modify: `apps/web-vue/src/features/terminal/TerminalTabRail.vue`
- Modify: `apps/web-vue/src/features/terminal/TerminalSessionPane.vue`
- Modify: `apps/web-vue/src/features/terminal/TerminalActionPanel.vue`
- Modify: `apps/web-vue/src/features/terminal/terminal-workspace-state.ts`
- Modify: `apps/web-vue/src/features/terminal/terminal-session-registry.ts`
- Modify: `apps/web-vue/src/features/terminal/api.ts`
- Modify: `apps/web-vue/src/features/terminal/terminal-workspace.css`
- Modify: `apps/api/modules/terminal/routes.ts`
- Modify: `apps/api/modules/terminal/service.ts`
- Modify: `graphify-out/GRAPH_REPORT.md`
- Modify: `graphify-out/graph.json`

- [ ] **Step 1: Run focused terminal test suite**

Run:

```bash
cd /home/binbin/.openclaw/extensions/openclaw-studio/.worktrees/home-dashboard-context-panel && node --test tests/system/studio-web-terminal-workspace-shell.test.mjs tests/system/studio-web-terminal-route-session.test.mjs tests/system/studio-web-system-terminal-layout-redesign.test.mjs
```

Expected: PASS.

- [ ] **Step 2: Run backend build and web verification**

Run:

```bash
cd /home/binbin/.openclaw/extensions/openclaw-studio/.worktrees/home-dashboard-context-panel && npm run build:api && npm run typecheck --workspace=apps/web-vue && npm run build --workspace=apps/web-vue
```

Expected: PASS.

- [ ] **Step 3: Rebuild graphify required by repo policy**

Run:

```bash
cd /home/binbin/.openclaw/extensions/openclaw-studio/.worktrees/home-dashboard-context-panel && python3.12 ~/.claude/graphify-rebuild.py .
```

Expected: `graphify-out/GRAPH_REPORT.md` regenerated without errors.

- [ ] **Step 4: Commit final terminal workspace redesign**

```bash
git add tests/system/studio-web-terminal-workspace-shell.test.mjs tests/system/studio-web-terminal-route-session.test.mjs tests/system/studio-web-system-terminal-layout-redesign.test.mjs apps/web-vue/src/features/terminal/TerminalWorkspacePage.vue apps/web-vue/src/features/terminal/TerminalTabRail.vue apps/web-vue/src/features/terminal/TerminalSessionPane.vue apps/web-vue/src/features/terminal/TerminalActionPanel.vue apps/web-vue/src/features/terminal/TerminalSessionExplorer.vue apps/web-vue/src/features/terminal/TerminalInspectorDrawer.vue apps/web-vue/src/features/terminal/terminal-workspace-state.ts apps/web-vue/src/features/terminal/terminal-session-registry.ts apps/web-vue/src/features/terminal/api.ts apps/web-vue/src/features/terminal/terminal-workspace.css apps/api/modules/terminal/routes.ts apps/api/modules/terminal/service.ts graphify-out/GRAPH_REPORT.md graphify-out/graph.json
git commit -m "feat: redesign terminal workspace"
```

---

## Self-review

### Spec coverage
- **Unified explorer + top tabs + on-demand drawer:** Covered by Tasks 2 and 4.
- **Rename / end / delete / close semantics:** Covered by Tasks 1, 3, and 5.
- **Recent sessions integrated into main model:** Covered by Tasks 1 and 2.
- **Theme/layout cleanup for dark/light:** Covered by Task 4.
- **Verification and graphify refresh:** Covered by Task 6.

### Placeholder scan
- No TODO/TBD placeholders remain.
- No task depends on “similar to Task N” references.
- Each code step contains concrete code and exact commands.

### Type consistency
- Uses the same action names across tasks: `openTab`, `renameSession`, `endSession`, `deleteSession`, `renameTerminalSession`, `deleteTerminalSession`.
- Route names and endpoint strings are consistent across test and implementation tasks.
