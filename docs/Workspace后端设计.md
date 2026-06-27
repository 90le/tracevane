# Workspace 后端设计

> 状态：Active backend design
> 更新：2026-06-25

## 1. 后端目标

Workspace 后端不是另起一个巨大服务，而是在现有 files/git/terminal/chat/agents/evidence 能力上提供稳定的 workspace-facing 合同。

目标：

- 文件管理安全、可审计；
- 终端稳定、可恢复；
- Git/diff/preview 能形成证据；
- Agent handoff 有结构化来源和结果；
- PC 与移动端使用同一套后端能力。

## 2. 后端 owner 边界

后端也必须避免把文件、终端和 CLI Agents 混成一个服务：

| Backend owner | 负责 | 禁止 |
| --- | --- | --- |
| Files service | root allowlist、path normalize、CRUD、batch、archive、download/upload。 | 创建/管理 PTY session；管理 CLI Agent run。 |
| Terminal runtime | PTY lifecycle、input/output、replay、reconnect、resize、ports/logs。 | 文件批量操作；Provider/Agent runtime 配置。 |
| CLI Agents service | Agent runtime readiness、run lifecycle、result evidence refs。 | 普通 shell tab、terminal split/delete/rename。 |
| Evidence service | append-only evidence refs。 | 作为文件事实源或 terminal session registry。 |

## 3. 服务模块

```text
workspace-service
  ├─ workspace registry / roots
  ├─ file action orchestration
  ├─ editor save/diff helpers
  ├─ terminal session facade
  ├─ preview session facade
  ├─ evidence basket
  └─ agent handoff
```

短期可作为 BFF facade 组合现有服务；长期再沉淀统一存储。

## 4. 文件操作安全

文件 API 必须：

- 只允许 root allowlist 内路径。
- 统一 path normalize，拒绝 traversal。
- 写操作返回 `FilesMutationResponse`。
- 删除/覆盖/移动支持确认前 preview 信息。
- 批量操作返回逐项结果。
- 大文件、二进制、权限错误要结构化返回。
- archive/unarchive 限制目标路径和文件数量/大小。

## 5. Terminal Runtime System

终端后端必须升级为一等 runtime：

```ts
TerminalSessionRecord {
  id: string
  workspaceId: string
  cwd: string
  shell: string
  title: string
  status: "starting" | "attached" | "detached" | "closed" | "error"
  pid?: number
  exitCode?: number
  createdAt: string
  updatedAt: string
  lastSeq: number
  staleReason?: string
}
```

必须支持：

- session registry；
- output ring buffer；
- append-only output ledger；
- stream reconnect；
- replay from lastSeq；
- heartbeat；
- stale cleanup；
- kill/close/restart；
- resize debounce；
- input queue / backpressure；
- mobile-friendly command actions；
- evidence capture。

## 6. Preview 后端

Preview 能力分级：

| 类型 | 后端职责 |
| --- | --- |
| Markdown | 主要前端渲染，后端只负责资源 resolver。 |
| Static HTML | 安全 iframe URL / resource resolver。 |
| Local web app | dev server URL discovery / proxy metadata / console capture plan。 |
| Screenshot | 明确用户触发或验证任务触发，保存 artifact。 |

禁止把 secrets 注入 preview iframe。

## 7. Evidence

Evidence 是 append-only 记录，不是 UI 临时状态：

```ts
EvidenceRecord {
  id: string
  workspaceId: string
  source: "file" | "git" | "terminal" | "preview" | "agent" | "im" | "chat"
  kind: "diff" | "log" | "screenshot" | "artifact" | "command" | "verification"
  title: string
  refs: object
  createdAt: string
}
```

## 8. Agent handoff

Workspace 发起 Agent task 时只负责上下文和审查面；CLI Agents 负责 runtime/readiness/run lifecycle。

```text
Workspace POST /agent-tasks
  → creates task request with context bundle
CLI Agents executes/observes Agent Run
  → returns plan/diff/commands/evidence refs
Workspace reviews/applies/verifies
```

## 9. 验证要求

后端改动必须覆盖：

- path traversal tests；
- batch file operation partial failure；
- terminal replay/reconnect/stale cleanup；
- mobile-equivalent API paths；
- evidence record integrity；
- no terminal/CLI Agent semantic mixing。
