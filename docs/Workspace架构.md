# Workspace 架构（IDE-first 当前参考）

> 状态：IDE-first architecture reference
> 更新：2026-06-29
> 上位目标：`Workspace全球顶级AI编程IDE工作区Goal蓝图.md`
> UI/UX 验收合同：`WorkspaceIDE-UIUX重设计验收.md`

本文只描述当前 IDE-first 阶段的 Workspace 架构边界。写作、渲染、预览增强、富媒体阅读体验不属于当前 Phase 0/1/2 架构验收；若未来启用，必须作为可插拔扩展 Provider 通过 ADR 单独评估。

## 1. 架构原则

Workspace 是一个前后端协同的本地 AI 编程 IDE 工作区系统。它必须以同一个 workspace context 串联文件、代码编辑、终端、Git、搜索、证据和 Agent handoff，而不是各页面各自维护状态。

前端 UI 不应直接散绑底层 API；Workspace 应通过明确 adapter 消费 files/git/terminal/search/evidence/agent-handoff 能力，保证桌面、平板、手机共享同一事实源。

## 2. 当前分层

```text
apps/web Workspace IDE UI
  ↓ typed query / mutations
apps/api Workspace-facing BFF / adapters
  ↓ service modules
files / git / terminal / search / evidence / agent-handoff services
  ↓
local filesystem / git CLI / node-pty / ripgrep-like search / evidence store / CLI agent runners
```

Future extension boundary:

```text
preview / rendering / writing providers
  ↓ only after ADR + IDE core completion
optional iframe / renderer / document engine integrations
```

## 3. Workspace Context

前后端共同使用以下概念：

```ts
WorkspaceContext {
  workspaceId: string
  rootId: string
  rootPath: string
  cwd: string
  activePath?: string
  activeTaskId?: string
  activeTerminalId?: string
  activeGitRef?: string
  evidenceBasketId?: string
}
```

前端状态不等于事实源。事实源仍在后端：filesystem、git、terminal registry、search index/output、evidence store。

## 4. 当前领域边界

| 模块 | 后端事实源 | 前端表现 |
| --- | --- | --- |
| Files | 本地 filesystem + root allowlist | Explorer / File Manager / Editor tabs |
| Editor buffers | 前端 dirty buffer + 后端 read/write API | Code/Diff/Config editor |
| Git | Git service / CLI | Changes / Diff / Stage / Commit |
| Terminal | node-pty session registry + output ledger | Terminal panel / Tasks / Logs |
| Search | file/content search service + replace plan evidence | Search panel / reviewable replace plan |
| Evidence | append-only records / artifacts | Evidence basket / inspector |
| Agent Handoff | task request records + CLI Agents handoff | Agent panel / run link |

不在当前主线领域表中列 Preview/Rendering/Writing。它们未来只能作为扩展 Provider 接入，不可抢占 IDE 核心架构。

## 5. CLI Agents 与 Terminal 的关系

```text
Terminal: local shell/process tool inside Workspace.
CLI Agents: Codex/Claude/OpenCode runtime readiness and Agent Run lifecycle.
```

允许关联：

- Workspace 可以把 terminal output 放入 Agent context。
- Agent run 可以产出 evidence 回到 Workspace。
- CLI Agents 可以显示来源为 Workspace 的 Agent Run。

禁止混同：

- 不把普通 terminal session 显示成 CLI Agent Run。
- 不在 CLI Agents 管理 terminal tabs。
- 不在 Terminal 管理 Codex/Claude/OpenCode 配置。

## 6. 当前 API 方向

未来应收敛出 workspace-facing API：

```text
GET    /api/workspaces
GET    /api/workspaces/:id/state
PATCH  /api/workspaces/:id/state

GET    /api/workspaces/:id/files/browse
POST   /api/workspaces/:id/files/actions

GET    /api/workspaces/:id/search
POST   /api/workspaces/:id/search/replace-plans
POST   /api/workspaces/:id/search/replace-plans/:pid/apply

GET    /api/workspaces/:id/git/status
POST   /api/workspaces/:id/git/actions

GET    /api/workspaces/:id/terminals
POST   /api/workspaces/:id/terminals
GET    /api/workspaces/:id/terminals/:sid/stream
POST   /api/workspaces/:id/terminals/:sid/input
POST   /api/workspaces/:id/terminals/:sid/actions

GET    /api/workspaces/:id/evidence
POST   /api/workspaces/:id/evidence

POST   /api/workspaces/:id/agent-tasks
```

短期可以复用现有 `/api/files`、`/api/git`、`/api/terminal` 等能力，但前端应通过 Workspace adapter 消费，避免 UI 直接散绑底层 API。

## 7. 可靠性要求

- 所有写操作必须返回 affected paths / action / evidence。
- 危险写操作必须支持 review / confirm / rollback 或明确不可逆说明。
- Terminal 输出必须可 replay。
- Search replace 必须先形成可审查计划，再显式 apply。
- Agent 文件修改必须走 diff/approval。
- Mobile 与 Desktop 使用同一 API，不走功能缩水 API。
