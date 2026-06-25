# Workspace 前端架构

> 状态：Active frontend architecture
> 更新：2026-06-25

## 1. 目录目标

新增或迁移到：

```text
apps/web/src/features/workspace/
  WorkspacePage.tsx
  WorkspaceShell.tsx
  workspace-store.ts
  workspace-types.ts
  layout/
    DesktopWorkspace.tsx
    TabletWorkspace.tsx
    MobileWorkspace.tsx
    useWorkspaceLayout.ts
  explorer/
  file-manager/
  editor/
  terminal/
  git/
  preview/
  agent/
  evidence/
  commands/
  api/
```

`features/ide` 和 `features/files` 后续应被迁移或降级为兼容层，不继续各自扩张。

## 2. Store 模型

```ts
WorkspaceUiState {
  rootId: string
  cwd: string
  activePath?: string
  openTabs: EditorTab[]
  dirtyBuffers: Record<string, DirtyBuffer>
  selectedFiles: string[]
  activeActivity: "files" | "search" | "git" | "terminal" | "agent" | "evidence"
  activeInspector: "preview" | "file-info" | "agent-plan" | "diff" | "evidence" | "console" | null
  bottomPanel: {
    tab: "terminal" | "tasks" | "problems" | "output" | "ports" | "logs"
    open: boolean
    height: number
    maximized: boolean
  }
  layoutMode: "mobile" | "tablet" | "desktop" | "wide"
}
```

原则：

- server state 用 TanStack Query。
- transient UI state 用 local store/context。
- dirty buffers 不直接写后端，必须明确 save/apply。
- layout state 可持久化，但不得影响文件事实源。

## 3. 响应式实现

### Breakpoints

```text
mobile: < 768px
 tablet: 768–1023px
 desktop: 1024–1439px
 wide: >= 1440px
```

### Desktop

- CSS grid 多栏。
- 可拖拽 resize。
- hover/right-click/keyboard shortcuts。
- command palette。

### Tablet

- Explorer 变 drawer。
- Inspector 默认 sheet。
- Bottom panel 半屏。

### Mobile

- 单栏。
- bottom mode nav。
- action sheet。
- full-screen editor / terminal / diff / preview。
- 禁止整体横向滚动。

## 4. Component 责任

| Component | 责任 | 禁止 |
| --- | --- | --- |
| WorkspaceShell | layout、mode、pane orchestration | 直接写文件/跑命令 |
| Explorer | browse/search/select/context menu | 管理 editor buffer |
| FileManager | batch ops/table/grid/path | 审查 Agent diff |
| EditorStage | tabs/editor/diff/dirty/save | 直接访问 terminal session |
| Inspector | preview/info/agent/evidence switch | 固定空 preview |
| TerminalPanel | terminal sessions/tasks/logs/ports | 管理 CLI Agent runtime |
| AgentPanel | context basket/plan/patch approval | 替代 CLI Agents 页面 |
| EvidencePanel | evidence basket and artifact preview | 替代全局审计库 |

## 5. 命令系统

所有高频动作注册到 command registry：

```ts
WorkspaceCommand {
  id: string
  label: string
  scope: "file" | "editor" | "terminal" | "git" | "agent" | "workspace"
  enabled(context): boolean
  run(context): Promise<void>
  mobilePresentation?: "sheet" | "dialog" | "fullscreen"
  risk?: "safe" | "confirm" | "danger"
}
```

同一动作应同时支持：

- toolbar；
- context menu；
- command palette；
- mobile action sheet。

## 6. 验收测试

每个 Workspace 迭代必须至少覆盖：

- desktop 1440×900 screenshot/smoke；
- mobile 390×844 screenshot/smoke；
- no horizontal overflow；
- keyboard focus path；
- touch alternative for context menu；
- terminal reconnect/stale state；
- file action success/error toast and evidence；
- typecheck/build。
