# M7-A LSP / Git / Debug 研究、边界与最小实现计划

## 状态

M7-A 已完成。M7-A 是研究和计划阶段，不实现 LSP/Git/Debug 功能代码，不新增依赖，不改变 Workbench runtime 行为。

M7 的总目标是在已完成的 M6 watcher/search/diff/problems/output 基础上，分阶段接入语言服务、Git 和 Debug。M7 不能一次性追完整 VS Code，应先把外部协议、后端进程边界、前端数据写入点和验证方式收清楚。

## 本地现状探查

### 后端现状

已探查：

- `apps/api/server.ts`
  - 已注册 `registerFilesRoutes`、`registerGitRoutes`、`registerIdeWorkbenchRoutes`、`registerTerminalRoutes`。
  - HTTP upgrade 当前只交给 model-gateway realtime unsupported handler 和 terminal service；没有 LSP/DAP WebSocket gateway。
- `apps/api/index.ts`
  - 已创建 `files`、`git`、`ideWorkbench`、`terminal` service。
  - 没有 LSP service 或 Debug service。
- `apps/api/modules/files/service.ts`
  - 已有 `resolveRoot`、`resolveTargetPath`、`isWithinRoot` 语义，可作为 LSP/Git/Debug 的 workspace/root guard 参考。
  - 已有 search、watch snapshot、read/write/version/download/range 等能力。
- `apps/api/modules/git/service.ts` / `routes.ts`
  - 已有 Git service 和 `/api/git/*` routes。
  - 使用 `execFileSync("git", args, { cwd, timeout, maxBuffer })`，已有 root/path guard、diff truncation、branch/ref/message/path normalization。
  - 已支持 status、diff、commit-detail、stage、unstage、commit、branch、checkout、pull/push/sync/publish、stash 等 API。
  - Git 后端能力比 Workbench UI 入口更早成熟，M7 Git 阶段应先复用现有 API，而不是新建第二套 Git 服务。
- `apps/api/modules/terminal`
  - 已有 PTY/WebSocket、profile allowlist、cwd guard 和 session lifecycle。LSP/DAP 可借鉴进程 lifecycle 与 WebSocket upgrade，但不能复用 terminal PTY 作为协议执行层。

当前依赖：

- root / api / web package 未安装 `vscode-languageserver-protocol`、`monaco-languageclient`、`vscode-ws-jsonrpc`、DAP client/server 相关库。
- `apps/web` 已有 `monaco-editor`。
- 当前没有 LSP/DAP runtime 依赖，M7-B 实现前必须做依赖选择和版本兼容验证。

### 前端现状

已探查：

- `apps/web/src/features/ide-workbench/problems`
  - M6-E 已有 `WorkbenchProblem` store/panel。
  - `source` 目前包含 `lsp-placeholder`，可演进为 `lsp`，但需要迁移命名避免真实/placeholder 混淆。
  - 点击 problem 已能打开文件并 reveal line/column。
- `apps/web/src/features/ide-workbench/output`
  - M6-E 已有 channel/event store/panel。
  - 可接 LSP/Git/Debug logs；不能持久化完整大日志。
- `apps/web/src/features/ide-workbench/editor`
  - M5.y 已有真实 Monaco 文件 panel、preview/pinned tabs、split、dirty/save/conflict、reveal。
  - M7 LSP client 应接 Monaco model lifecycle，不应把完整文件内容写入 React state。
- `apps/web/src/features/ide-workbench/search`
  - M6-C 已有 Search View，可作为 Source Control / Run and Debug View 的布局参考。
- `apps/web/src/features/ide-workbench/types.ts`
  - Activity 已预留 `git` 和 `run`，但 `IdeWorkbenchPage.tsx` 当前仍禁用 Source Control / Run and Debug ActivityBar item。
- `apps/web/src/lib/api/git.ts` / `apps/web/src/lib/query/git.ts`
  - 已有 Git API client 和 React Query hooks。
  - M7 Git UI 应优先启用这些 hooks，而不是新建 API 层。

## 外部契约研究

### LSP

来源：Microsoft Language Server Protocol 3.17 specification。

关键结论：

- LSP 3.17 使用 JSON-RPC 2.0 message 模型。
- 协议初始化通过 client/server capability flags 协商，不能假设所有 server 都支持 diagnostics、semantic tokens、inlay hints、rename 等能力。
- Browser Monaco 场景通常需要 language client 和后端 language server 进程之间的桥接；TypeFox `monaco-languageclient` 示例覆盖 Monaco 通过 WebSocket 或 worker 连接 language server 的模式。
- Tracevane 第一阶段不应多语言齐上，应先选择一个语言/一种 server 做 diagnostics -> Problems 的最小闭环。

参考：

- https://github.com/Microsoft/language-server-protocol/blob/gh-pages/_specifications/lsp/3.17/specification.md
- https://github.com/TypeFox/monaco-languageclient

### Git

来源：Git 官方文档。

关键结论：

- Git status 人类长格式不适合机器解析；官方文档说明默认 long output 面向人类，内容和格式可能变化。
- `--porcelain=v1` 保证不会因 Git 版本或用户配置发生向后不兼容变化；`-z` 更适合机器解析路径和 rename。
- 本项目现有 Git service 已具备 status/diff/stage/commit 等接口，M7 Git UI 应先消费现有 typed API；后端后续如要增强 rename/submodule/conflict 解析，可优先切到 porcelain v1/v2 + `-z`。

参考：

- https://git-scm.com/docs/git-status
- https://git-scm.com/docs/git-diff

### Debug / DAP

来源：Microsoft Debug Adapter Protocol。

关键结论：

- DAP 抽象的是 development tool 与 debugger/runtime adapter 的通信。
- 协议消息是 JSON；Debug Adapter 作为中间组件适配具体 runtime/debugger。
- Debug 比 LSP/Git 更重，M7-A 不应直接实现；建议放到 M7.x，先只保留 Run and Debug Activity 和 Debug Console 的架构入口。

参考：

- https://microsoft.github.io/debug-adapter-protocol/
- https://microsoft.github.io/debug-adapter-protocol/overview.html

## M7 总体边界

M7 必须复用：

- M6 Problems store/panel：LSP diagnostics、Git conflicts、debug errors 都写入现有 Problems 数据模型或其演进版本。
- M6 Output store/panel：LSP server logs、Git command logs、Debug adapter logs 都写入现有 Output channel。
- M5.y IDE Editor open/reveal/tab：diagnostics、definition、Git diff、debug frame 跳转都通过现有 editor reveal/open 能力。
- Files root/path guard：所有后端 LSP/Git/Debug cwd/path 操作必须限制在 workspace/root 内。
- M5 Terminal 的 process/session 安全经验：LSP/DAP 是后端进程和协议 gateway，不是前端执行命令。
- Aurora token：diagnostics、Git status、breakpoint/current frame、debug state 都通过语义 token 映射。

M7 禁止：

- 新建第二套 Problems 面板。
- 新建第二套 Output 面板。
- 新建第二套 Files/Search API。
- 让 Dockview 拥有 LSP/Git/Debug 数据或文件 IO。
- 让 Monaco model 内容长期复制到 React/localStorage。
- 前端直接执行 Git/LSP/Debug 命令。
- 一次性接多语言 LSP、完整 Git SCM、完整 Debug Adapter。

## 分阶段建议

### M7-B：单语言 LSP Diagnostics -> Problems

目标：只证明一个语言 server 的 diagnostics 能进入 IDE Problems，并能点击跳转。

推荐切片：

- 后端新增 `apps/api/modules/lsp`，提供 LSP session manager / gateway skeleton。
- 选择一个低风险语言 server：优先 JSON 或 TypeScript/JavaScript；具体依赖在 M7-B 前确认。
- WebSocket route 建议使用 `/ws/lsp` 或 HTTP session + WebSocket attach，复用 server upgrade 模式但不与 terminal service 混用。
- 前端新增 `features/ide-workbench/lsp` 或 `shared/lsp-client` 薄层，接 Monaco model lifecycle。
- diagnostics 转换为 `WorkbenchProblem`，source 使用 `lsp`，不再使用 `lsp-placeholder` 表示真实来源。
- LSP server stderr/stdout lifecycle logs 写入 Output channel `lsp`。

验收：

- 打开支持语言文件后产生 diagnostics。
- Problems 显示 diagnostics。
- 点击 Problems 打开/reveal 编辑器。
- 修改文件后 diagnostics 更新或清除。
- LSP server exit/error 写入 Output 并显示状态。
- 不实现 completion/hover/definition。

### M7-C：LSP Hover / Completion / Definition 最小能力

前提：M7-B diagnostics 稳定。

目标：在同一语言 server 上补最小交互能力，不扩多语言。

范围：

- completion、hover、go to definition。
- capability negotiation 检查；不支持则 UI 禁用或 no-op。
- Definition 跳转复用 IDE editor open/reveal。

不做：rename symbol、code action、format、semantic tokens、多语言 server 管理。

### M7-D：Git Status + Explorer Decoration + Source Control View

前提：直接复用现有 `apps/api/modules/git` 和 `apps/web/src/lib/query/git.ts`。

目标：启用 Source Control Activity，展示当前分支、change list、文件状态标记。

范围：

- Source Control View 使用现有 `useGitStatusQuery`。
- StatusBar 显示 branch/ahead/behind/dirty count。
- Explorer file decoration 显示 modified/added/deleted/untracked/conflicted。
- Output channel `git` 记录 refresh/error。

不做：stage/unstage/commit、remote 操作、discard。

### M7-E：Git Diff / Stage / Unstage / Commit

前提：M7-D 只读状态稳定。

范围：

- 单文件 diff 复用 M6-D MonacoDiffPanel 或 shared diff。
- stage/unstage 使用现有 API。
- commit 需要 message 校验和明确失败提示。
- discard/reset 类危险操作后置或必须二次确认。

不做：rebase/merge conflict resolution、branch graph、完整 history UI、远程凭证管理。

### M7-F：Debug Adapter Protocol 研究与最小骨架

目标：Debug 后置，但先收清 architecture。

范围：

- 后端 `apps/api/modules/debug` plan：adapter process manager、session lifecycle、DAP transport。
- 前端 Run and Debug Activity shell、Debug Console 接 Output/Debug channel。
- breakpoints 数据模型预研，但不接真实 runtime。

不做：真实 language debug adapter、variables/watch/call stack 完整 UI。

### M7.x：真实 Debug Adapter 最小实现

只在 M7-F 完成后进入。选择一种 runtime，例如 Node.js，先跑最小 launch/attach、breakpoint、continue/step、stopped event。

## 推荐 M7-B 实现顺序

1. 依赖与协议最终确认。
2. 后端 LSP module skeleton：session manager、process adapter、root/cwd guard、WebSocket attach、exit/error cleanup。
3. 前端 LSP client adapter：Monaco model open/change/close 与 diagnostics subscription。
4. diagnostics -> Problems bridge。
5. LSP lifecycle -> Output channel。
6. 最小 smoke：打开一个能产生诊断的文件，等待 Problems，点击跳转，修改后更新。

## 验证计划

M7-A 是 docs-only：

```bash
git diff --check
# touched Markdown 相对链接检查
```

M7-B 起需要：

```bash
npm run typecheck:web -- --pretty false
npm run typecheck:api -- --pretty false # 或 npm run typecheck
npm run smoke:ide:workbench-layout
npm run smoke:ide:problems-output
npm run smoke:ide:lsp-diagnostics # 新增
```

M7-D 起需要：

```bash
npm run smoke:ide:git-status # 新增
```

M7.x Debug 起需要：

```bash
npm run smoke:ide:debug-foundation # 新增
```

## 主要风险

| 风险 | 表现 | 应对 |
|---|---|---|
| 一次性追完整 VS Code | LSP/Git/Debug 同时铺开 | M7-B 只做单语言 diagnostics；Git/Debug 后置 |
| Problems/Output 重复建设 | 新建 diagnostics panel 或 log panel | 所有 producer 写入 M6 store/panel |
| LSP server lifecycle 泄漏 | 打开文件/刷新页面后残留进程 | 后端 session manager 必须有 close/kill/timeout/error cleanup |
| 文档同步不可靠 | Monaco model 与 LSP document version 不一致 | 前端 adapter 只从 Monaco model lifecycle 发 didOpen/didChange/didClose |
| Git 危险操作误触 | discard/reset/checkout 覆盖用户改动 | 只读 status/diff 先行；危险操作二次确认并尊重 dirty/conflict |
| DAP 复杂度失控 | Debug UI 与 adapter 同时追完整 | 先做 M7-F research/shell，再做单 runtime 最小实现 |
| 主题割裂 | Git/diagnostic/debug 状态使用随机色 | 新增语义状态必须映射 Aurora token |
