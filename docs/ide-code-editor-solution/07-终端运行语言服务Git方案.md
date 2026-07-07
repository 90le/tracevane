# 终端、运行、语言服务与 Git 方案

## 1. 能力关系

独立 IDE 后续会逐步引入：

```txt
- 终端
- 任务运行
- 语言服务 LSP
- Git
- 调试
```

这些能力不建议放进文件管理器在线编辑器第一版。

推荐放在独立 IDE 工作台内，并作为分阶段能力建设。

## 2. 终端方案

终端最终目标接近 VS Code，但分阶段交付：

```txt
M5：Real Terminal Foundation（已完成）
- 已接入 Workbench bottom Panel Terminal tab 的真实 xterm + WebSocket + node-pty/PTY 基础。
- 已完成单终端 session 基础、create/input/output/resize/close/kill。
- 已完成 cwd/root guard、shell/profile allowlist、session cleanup 与基础状态呈现。
- 已补 `smoke:ide:terminal-foundation`。
- 未做 split terminal pane、terminal group、Panel right placement、Terminal 全局 docking、LSP/Git/Debug。

M5.x：Terminal Split / Group / Panel Placement（已完成）
- TerminalGroup / TerminalPane 模型。
- Split Terminal Right / Split Terminal Down。
- pane resize、focus、close/kill、move between groups。
- terminal tabs/groups layout persistence（服务端 layout API 是跨刷新/跨浏览器上下文恢复来源；localStorage 只是快速缓存）。
- Terminal Session Manager 基础持久化：即使没有 tmux，浏览器刷新、WebSocket 断开、路由切换、Panel bottom/right 切换也不 kill node-pty session；close/kill 才结束 session。
- Terminal Profiles / Shell Selection：前端 New Terminal 保留默认创建入口，并通过下拉菜单展示后端 `/api/terminal/profiles` 确认可用且在 allowlist 内的本地 shell（bash/sh/zsh/fish/pwsh/powershell/cmd）；split 继承当前 pane 的 profile/shell。
- pinned terminal session durability：tmux 是可选增强后端，不是 shell，也不是硬依赖；可用时用于后端 dev/API 进程重启后 attach，同一 shell 进程尽量恢复；不可用时降级为 PTY 并清晰显示能力边界。
- Terminal Panel bottom/right placement。
- 浏览器剪贴板文件/图片上传到 workspace-scoped terminal temp 目录并插入路径；这条链路不依赖终端内 CLI 读取系统剪贴板。
- 不做 LSP/Git/Debug，不做 Terminal 作为 editor-like tab。
- 收口记录见 [`archive/m5x-execution-summary.md`](./archive/m5x-execution-summary.md)。

M5.y / M5.5：IDE Editor Foundation（下一步，终端保持 M5.x 边界）
- 将 IDE EditorDock 从 placeholder 升级为真实 Monaco 文件编辑器基础。
- 复用 shared/editor-core / Files API / Monaco-first 底层能力，不复用 File Manager Online Editor 产品壳。
- 不改变 M5.x 终端 API，不做 LSP/Git/Debug，不做 Problems/Output 数据接入。

M6 已完成 / M7+：终端参与更完整 Workbench 全局布局
- Terminal View 在 Panel / SecondarySideBar / dockable region 间移动。
- 可评估 Terminal 最大化为主区域，或作为 editor-like tab 打开。
- Terminal / Problems / Output 基础已在 M6 完成；Debug Console 仍到 M7.x。
- Terminal / Problems / Output / Debug Console 与 Workbench layout 一起保存/恢复。
- 持久化验收必须覆盖：刷新页面、重新进入 `/ide`、清空 localStorage、以及后端重启后 pinned terminal 尽量恢复同一 shell 进程。
```

### 前端

使用：

```bash
npm i @xterm/xterm @xterm/addon-fit
```

前端职责：

```txt
- 显示终端内容。
- 接收用户输入。
- 复制/粘贴。
- 文件/图片粘贴分两类：文本粘贴交给 xterm/shell；文件或图片粘贴由 Tracevane 前端读取浏览器 Clipboard/Paste/DataTransfer，复用 Files upload API 上传到 workspace-scoped 临时目录，再把路径写入 PTY。
- 终端内运行的 CLI（例如 Codex CLI）读取的是后端/系统剪贴板，不能直接等同浏览器剪贴板；因此 UI 必须提供“粘贴文件/图片为路径”的显式入口。
- 搜索输出。
- resize。
- 多终端 Tab。
- 清屏。
```

### 后端

使用：

```bash
npm i ws node-pty
```

后端职责：

```txt
- 创建真实 shell。
- 管理 sessionId。
- 限制 cwd。
- 转发 input/output。
- resize PTY。
- kill process。
- 断线处理。
```

### 数据流

```txt
xterm.js
  ⇅ WebSocket
TerminalGateway
  ⇅ node-pty
Shell / Container / Remote Workspace
```

### 多终端模型

```ts
type TerminalSessionStatus =
  | "connecting"
  | "running"
  | "exited"
  | "error"
  | "disconnected";

type TerminalSession = {
  id: string;
  workspaceId: string;
  name: string;
  cwd: string;
  shell: string;
  status: TerminalSessionStatus;
  exitCode?: number | null;
  createdAt: string;
  updatedAt: string;
};

type TerminalPane = {
  id: string;
  sessionId: string;
};

type TerminalGroup = {
  id: string;
  orientation: "horizontal" | "vertical";
  panes: TerminalPane[];
  activePaneId?: string;
  sizes?: number[];
};

type TerminalLayoutState = {
  activeGroupId?: string;
  groups: TerminalGroup[];
};
```

M5 可以先只实现 `sessions + activeSessionId` 的多 Tab 终端，但模型和 store 边界必须能演进到 `TerminalLayoutState`，不要把终端状态写死成简单 `sessionId[]`。

### 安全建议

必须明确：

```txt
- 终端运行在宿主机、容器还是远端机器。
- 用户是否能访问 workspace 外目录。
- 是否允许安装依赖。
- 是否允许网络访问。
- 多用户 workspace 是否隔离。
- 是否记录命令审计。
```

生产建议：

```txt
- 优先容器隔离。
- cwd 限制在 workspace。
- shell 白名单。
- 权限控制 canOpenTerminal。
- 终端 session 超时清理。
- close/kill 必须真实杀掉 PTY 进程。
- 不默认记录完整终端输出，避免隐私和安全问题。
- 断线后明确显示 disconnected/exited/error，不伪造仍在运行。
```

## 2.1 M5-A 本地探查结论与实现边界

M5-A 只做研究、边界和最小实现计划，不直接实现真实终端。当前代码库已经有一套可复用的后端终端基础，M5-B 应优先加固和接入，而不是新建第二套 Terminal API。

本地探查结论：

```txt
- apps/api/modules/terminal 已存在，包含 service/routes/session descriptor/ledger/action catalog。
- API server 已注册 terminal routes，并在 HTTP upgrade 中把 /ws/terminal 交给 terminal service。
- terminal service 已使用 ws 的 noServer WebSocketServer，并具备 raw WebSocket attach、HTTP input/resize、Gateway input/resize、session descriptor 和 ledger。
- terminal service 已通过 @homebridge/node-pty-prebuilt-multiarch 可选加载 PTY，并使用 pty.spawn 创建 xterm-256color session。
- 当前 terminal launch cwd 主要以 openclawRoot / process.cwd() 兜底；M5-B 必须补齐 IDE workspace rootId + relative cwd guard，不能允许终端逃逸 workspace。
- 当前 shell 主要来自 process.env.SHELL || /bin/bash；M5-B 必须补显式 shell allowlist/profile 选择。
- root package.json 已有 @homebridge/node-pty-prebuilt-multiarch、ws、@types/ws；apps/web 已有 @xterm/xterm、@xterm/addon-fit、@xterm/addon-web-links、@xterm/addon-webgl。
- M4 Workbench PanelArea 已有 Terminal / Problems / Output / Debug Console 固定底部 tabs；M5-B 只替换 Terminal tab 内容，不接入 Problems/Output/Debug 数据。
```

外部契约校验：xterm addon 应通过 xterm API 加载，例如 FitAddon；`ws` 支持 `WebSocketServer({ noServer: true })` + `handleUpgrade(...)` 嵌入现有 HTTP server；node-pty 的核心模型是 `spawn`、`write`、`resize` 和进程退出回调。M5-B 可以沿用当前项目依赖，不需要新增依赖。

M5-B 最小实现切片：

```txt
Backend
- 复用 apps/api/modules/terminal/service.ts，不新建第二套终端服务。
- 增加或收紧 create session 输入：rootId/workspaceId、relative cwd、profile/shell、cols/rows。
- 复用或抽出 Files service 的 root guard：resolveRoot / resolveTargetPath / isWithinRoot 语义。
- 增加 shell allowlist/profile 校验，拒绝未知 shell。
- 明确 create/input/output/resize/close/kill/disconnect/exited/error 状态流。
- 保留现有 descriptor/ledger，但不要默认长期保存完整敏感输出。

Frontend
- 在 features/ide-workbench/terminal 下新增 TerminalPanel / TerminalTabs / XtermHost / terminalClient。
- 只嵌入 Workbench PanelArea 的 Terminal tab；Problems/Output/Debug Console 仍保持 M4 placeholder。
- xterm 主题通过 Aurora token 适配，不使用第三方默认纯黑/VS Code 配色。
- FitAddon + ResizeObserver 负责 panel resize 后 fit，并把 cols/rows 发给后端。
- 多终端 Tab 可以作为 M5 基础，但不实现 split/group。

Verification
- 最小 API/system smoke：创建 session、读取输出、发送 input、resize、close/kill、非法 cwd 被拒、非白名单 shell 被拒。
- 最小前端 smoke/manual：进入 /ide，Terminal tab 显示真实 xterm，输入命令有输出，拖动底部 Panel 后 fit 正常，关闭终端后状态明确，Problems/Output/Debug Console 不受影响。
```

M5-A 明确不做：真实终端实现、前端 xterm 接入、terminal split/group、Panel right placement、Terminal View 全局 docking、LSP、Git、Debug、Problems/Output 数据、watcher、插件市场、完整 VS Code terminal behavior。

## 2.2 M5-C 验收收口

M5 已完成 Real Terminal Foundation，汇总见 [`archive/m5-execution-summary.md`](./archive/m5-execution-summary.md)。

当前 Terminal 能力边界：

```txt
- bottom Panel Terminal tab。
- 单终端 session 基础。
- create / input / output。
- resize。
- close / kill。
- cwd/root guard。
- shell/profile allowlist。
- smoke:ide:terminal-foundation。
```

M5 明确未做，并后置到 M5.x / M6 / M7：

```txt
- terminal split/group。
- Panel right placement。
- Terminal View 全局 docking / View Movement。
- Terminal 作为 editor-like tab。
- Problems / Output 数据接入。
- watcher。
- LSP。
- Git。
- Debug。
- 插件市场。
- 完整 VS Code terminal behavior。
```

## 3. 任务运行方案

终端适合自由输入命令，但 IDE 还需要结构化任务。

任务来源：

```txt
- package.json scripts
- Makefile
- 自定义 tasks.json
- 项目配置
- 后端预设任务
```

任务能力：

```txt
- 运行
- 停止
- 查看日志
- 状态跟踪
- 失败码
- 绑定输出面板
```

任务模型：

```ts
type TaskDefinition = {
  id: string;
  label: string;
  command: string;
  args?: string[];
  cwd?: string;
  group?: "build" | "test" | "dev" | "custom";
  problemMatcher?: string;
};
```

输出流：

```txt
TaskRunner
→ Output Panel
→ Problems parser 可后续接入
```

推荐顺序：

```txt
先做终端。
再做 package.json scripts 识别。
最后做 tasks.json 或项目自定义任务。
```

## 3.1 M6 / M7 边界

```txt
M6：Watcher / Search / Problems / Output（已完成）
- 已做文件 watcher、全局搜索、DiffEditor、Problems 数据模型、Output channel/log 基础。
- Problems 可以展示结构化问题数据，但不要求来自 LSP diagnostics。
- Output 可以展示 watcher/系统/自定义 channel，不持久化完整大日志。
- 不做 LSP Gateway，不做 Git，不做 Debug。
- 总体验收见 [`archive/m6-execution-summary.md`](./archive/m6-execution-summary.md)。

M7：LSP / Git / Debug
- M7-A 研究与最小实现计划已完成，记录见 [`archive/m7-a-lsp-git-debug-plan.md`](./archive/m7-a-lsp-git-debug-plan.md)。
- M7-B 单语言 JSON diagnostics 已接入既有 Problems/Output，记录见 [`archive/m7-b-lsp-diagnostics-summary.md`](./archive/m7-b-lsp-diagnostics-summary.md)。
- M7-C JSON hover/completion/definition foundation 已完成，记录见 [`archive/m7-c-lsp-interaction-summary.md`](./archive/m7-c-lsp-interaction-summary.md)。
- M7-D Git status + Explorer decoration + Source Control View 已完成，记录见 [`archive/m7-d-git-status-source-control-summary.md`](./archive/m7-d-git-status-source-control-summary.md)。
- M7-E-A 已复用现有 Git API 接入 diff 查看；M7-E-B 已复用现有 Git API 接入 stage/unstage；M7-E-C 已复用现有 Git API 接入 staged commit；M7-E-D 已复用 Git status payload 在 Source Control / StatusBar 展示 branch、upstream、ahead/behind 与变更汇总。
- M7 Git Source Control 总体验收已完成，记录见 [`archive/m7-git-execution-summary.md`](./archive/m7-git-execution-summary.md)。
- M7-F-A Debug Adapter Protocol 研究与最小实现计划已完成，记录见 [`archive/m7-f-a-debug-adapter-plan.md`](./archive/m7-f-a-debug-adapter-plan.md)。
- M7-F-B Debug Gateway skeleton + Debug View shell 已完成，记录见 [`archive/m7-f-b-debug-foundation-summary.md`](./archive/m7-f-b-debug-foundation-summary.md)。
- M7-F-C Breakpoints + editor reveal foundation、M7-F-D 最小真实 adapter proof 与 M7-F-E Debug acceptance closeout 已完成，记录见 [`archive/m7-f-debug-execution-summary.md`](./archive/m7-f-debug-execution-summary.md)。M7.x-A Debug hardening plan 已完成，记录见 [`archive/m7x-a-debug-hardening-plan.md`](./archive/m7x-a-debug-hardening-plan.md)。下一步进入 M7.x-B Debug lifecycle foundation；Debug 仍不和 LSP/Git 同时追完整。
```

## 4. LSP 语言服务方案

Monaco 提供编辑器能力，但完整 IDE 体验需要 LSP。

LSP 能力：

```txt
- Diagnostics
- Completion
- Hover
- Go to Definition
- Find References
- Rename Symbol
- Code Actions
- Format Document
- Semantic Tokens
```

架构：

```txt
Monaco Editor
  ⇅ monaco-languageclient
WebSocket
  ⇅ LSP Gateway
Language Server
```

语言服务示例：

```txt
TypeScript / JavaScript: tsserver 或 typescript-language-server
Python: pyright
Go: gopls
Rust: rust-analyzer
Java: jdtls
Vue: vue-language-server
YAML: yaml-language-server
JSON: Monaco 内置或 vscode-json-languageserver
```

推荐策略：

```txt
第一版：
- 使用 Monaco 内置 JS/TS/JSON/CSS/HTML 基础能力。

第二版（M7-B）：
- 接一个后端 LSP Gateway。
- 先支持最重要的一种语言。
- diagnostics 只写入现有 Problems store/panel；LSP lifecycle/error 写入现有 Output channel。

第三版：
- 多语言按 workspace 配置启用。
```

不要第一版同时接入多种语言服务，复杂度过高。

## 5. Problems 面板

Problems 来源：

```txt
- LSP diagnostics
- TypeScript/ESLint 输出
- build/test task 输出
- 自定义校验
```

问题模型：

```ts
type ProblemItem = {
  id: string;
  workspaceId: string;
  path: string;
  severity: "error" | "warning" | "info" | "hint";
  message: string;
  source?: string;
  startLine: number;
  startColumn: number;
  endLine?: number;
  endColumn?: number;
};
```

行为：

```txt
- 点击问题跳转到文件和行列。
- 编辑器 gutter 显示标记。
- Status Bar 显示问题数量。
```

## 6. Git 方案

Git 不属于 M6，也不阻塞 M7-B 的 LSP diagnostics。M7-A 探查确认项目已有后端 Git service 和前端 API/query hooks，因此 M7-D/M7-E 应复用现有能力继续分阶段：

### Git 阶段一：只读状态

```txt
- 当前分支
- changed files
- added/modified/deleted
- 文件树显示状态标记
```

### Git 阶段二：基础操作

```txt
- 查看 diff
- stage
- unstage
- commit
- discard changes
```

### Git 阶段三：远程操作

```txt
- pull
- push
- fetch
- branch
- checkout
```

Git 后端接口：

```txt
GET  /api/workspaces/:id/git/status
GET  /api/workspaces/:id/git/diff?path=
POST /api/workspaces/:id/git/stage
POST /api/workspaces/:id/git/unstage
POST /api/workspaces/:id/git/commit
POST /api/workspaces/:id/git/pull
POST /api/workspaces/:id/git/push
```

安全注意：

```txt
- Git 凭证管理。
- 私有仓库 token。
- commit 用户身份。
- 大文件 diff。
- discard changes 属于危险操作，需要确认。
```

## 7. Debug 方案

Debug 是复杂能力，M7-F-A 已完成 DAP 研究和分段计划；后续仍必须分阶段推进，不和单语言 LSP、Git status/diff 同时追完整。

如果要做，需要考虑：

```txt
- Debug Adapter Protocol
- breakpoint
- call stack
- variables
- watch
- debug console
- launch configuration
```

建议阶段：

```txt
M7-F-B：Debug Gateway skeleton + Debug View shell（已完成）。
M7-F-C：Breakpoints + editor reveal foundation（已完成）。
M7-F-D：最小真实 adapter proof（已完成）。
M7-F-E：Debug acceptance closeout（已完成）。
```

## 8. 能力建设优先级

推荐顺序：

```txt
1. Monaco 编辑闭环
2. 独立 IDE 布局
3. xterm 终端
4. 任务运行
5. M6：Diff / Search / Watcher / Problems 数据基础 / Output channel（已完成）
6. M7-A：LSP / Git / Debug 研究与最小实现计划（已完成）
7. M7-B：单语言 JSON diagnostics -> Problems/Output（已完成）
8. M7-C：LSP hover / completion / definition（已完成）
9. M7-D：Git status + Explorer decoration + Source Control View（已完成）
10. M7-E-A：Git Diff Foundation（已完成）
11. M7-E-B：Git stage / unstage foundation（已完成）
12. M7-E-C：Git commit foundation（已完成）
13. M7-E-D：Git branch / upstream status foundation（已完成）
14. M7 Git acceptance closeout（已完成）
15. M7-F-A：Debug Adapter Protocol 研究与最小实现计划（已完成）
16. M7-F-B：Debug Gateway skeleton + Debug View shell（已完成）
17. M7-F-C：Breakpoints + editor reveal foundation（已完成）
18. M7-F-D：最小真实 adapter proof（已完成）
19. M7-F-E：Debug acceptance closeout（已完成）
20. M7.x-A：Debug hardening plan（已完成）
21. M7.x-B：Debug lifecycle foundation（下一步）
```

## 9. 验收标准

终端：

```txt
- 可以创建终端。
- 可以输入命令并收到输出。
- resize 后终端显示正常。
- 可以关闭终端进程。
- cwd 限制在 workspace。
```

任务：

```txt
- 可以识别 package.json scripts。
- 可以运行任务并显示输出。
- 可以停止任务。
- 任务失败有状态码。
```

LSP：

```txt
- 打开文件后能收到 diagnostics。
- 点击 Problems 能跳转。
- Hover / Completion 至少支持一种语言。
```

Git：

```txt
- Status Bar 显示分支。
- 文件树显示变更状态。
- 可以查看单文件 diff。
```


### M5.x-C Terminal Profiles / Shell Selection 补充

- `profileId` 与 `shell` 由前端从现有 `/api/terminal/profiles` 读取并传给现有 Terminal Gateway / sessions API；后端继续执行 `KNOWN_TERMINAL_PROFILE_IDS` 与 `ALLOWED_TERMINAL_SHELLS` 校验。
- bash、sh、zsh、fish、pwsh、powershell、cmd 是 shell/profile 候选；只有后端探测为 launchable 的项才应在 Workbench New Terminal 菜单中展示。
- tmux 不是 shell/profile 候选。tmux 只作为 pinned terminal 的可选 durable backend；不可用时仍使用 PTY，并在 pane 状态中显示 backend 边界。
- New Terminal 可以选择新的 shell/profile；Split Right / Split Down 继承被拆分 pane 的 shell/profile，避免同一个 tab 内的分屏意外切换 shell。
- layout persistence 只保存 terminalId、profileId、shell、title、split metadata 等 UI/session metadata，不保存完整终端输出。
