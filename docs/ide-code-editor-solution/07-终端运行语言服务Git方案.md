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

M5.y / M5.5：IDE Editor Foundation（已完成，终端保持 M5.x 边界）
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
- M7-F-C Breakpoints + editor reveal foundation、M7-F-D 最小真实 adapter proof 与 M7-F-E Debug acceptance closeout 已完成，记录见 [`archive/m7-f-debug-execution-summary.md`](./archive/m7-f-debug-execution-summary.md)。M7.x-A Debug hardening plan 已完成，记录见 [`archive/m7x-a-debug-hardening-plan.md`](./archive/m7x-a-debug-hardening-plan.md)。M7.x-B Debug lifecycle foundation 已完成，记录见 [`archive/m7x-b-debug-lifecycle-summary.md`](./archive/m7x-b-debug-lifecycle-summary.md)。M7.x-C Launch profile / config foundation 已完成，记录见 [`archive/m7x-c-debug-launch-profile-summary.md`](./archive/m7x-c-debug-launch-profile-summary.md)。M7.x-D Real Node inspector adapter minimal 已完成，记录见 [`archive/m7x-d-debug-node-inspector-summary.md`](./archive/m7x-d-debug-node-inspector-summary.md)。M7.x-E Debug controls / scopes foundation 已完成，记录见 [`archive/m7x-e-debug-controls-scopes-summary.md`](./archive/m7x-e-debug-controls-scopes-summary.md)。M7.x-F Debug Console watch / evaluate foundation 已完成，记录见 [`archive/m7x-f-debug-watch-evaluate-summary.md`](./archive/m7x-f-debug-watch-evaluate-summary.md)。M7.x-G Debug hardening acceptance closeout 已完成，记录见 [`archive/m7x-debug-hardening-execution-summary.md`](./archive/m7x-debug-hardening-execution-summary.md)。M7.y-A LSP / Git / Debug integration hardening plan 已完成，记录见 [`archive/m7y-a-lsp-git-debug-integration-plan.md`](./archive/m7y-a-lsp-git-debug-integration-plan.md)。M7.y-B TypeScript / JavaScript LSP diagnostics foundation 已完成，记录见 [`archive/m7y-b-typescript-javascript-lsp-diagnostics-summary.md`](./archive/m7y-b-typescript-javascript-lsp-diagnostics-summary.md)。M7.y-C TypeScript / JavaScript LSP interaction expansion plan 已完成，记录见 [`archive/m7y-c-typescript-javascript-lsp-interaction-plan.md`](./archive/m7y-c-typescript-javascript-lsp-interaction-plan.md)。M7.y-D TypeScript / JavaScript hover and definition foundation 已完成，记录见 [`archive/m7y-d-typescript-javascript-hover-definition-summary.md`](./archive/m7y-d-typescript-javascript-hover-definition-summary.md)。M7.y-E TypeScript / JavaScript completion foundation 已完成，记录见 [`archive/m7y-e-typescript-javascript-completion-summary.md`](./archive/m7y-e-typescript-javascript-completion-summary.md)。M7.y-F LSP interaction acceptance closeout 已完成，记录见 [`archive/m7y-f-lsp-interaction-acceptance-summary.md`](./archive/m7y-f-lsp-interaction-acceptance-summary.md)。M7.z-A LSP / Git / Debug post-M7 enhancement plan 已完成，记录见 [`archive/m7z-a-lsp-git-debug-enhancement-plan.md`](./archive/m7z-a-lsp-git-debug-enhancement-plan.md)。M7.z-B Advanced LSP references foundation 已完成，记录见 [`archive/m7z-b-lsp-references-summary.md`](./archive/m7z-b-lsp-references-summary.md)。M7.z-C LSP rename / formatting / code actions plan 已完成，记录见 [`archive/m7z-c-lsp-rename-format-code-actions-plan.md`](./archive/m7z-c-lsp-rename-format-code-actions-plan.md)。M7.z-D Git remote operations foundation plan 已完成，记录见 [`archive/m7z-d-git-remote-operations-plan.md`](./archive/m7z-d-git-remote-operations-plan.md)。M7.z-E Git remote operations foundation hardening 已完成，记录见 [`archive/m7z-e-git-remote-foundation-summary.md`](./archive/m7z-e-git-remote-foundation-summary.md)。M7.z-F 已完成 LSP WorkspaceEdit preview/apply foundation，M7.z-G 已完成 LSP rename / formatting / code actions UI foundation，M7.z-H 已完成 Git branch / stash UI foundation，M7.z-I 已完成 Git branch / stash hardening and acceptance closeout，M7.z-J 已完成 LSP / Git / Debug enhancement acceptance closeout，M8-A 已完成 IDE stabilization and release-candidate plan，M8-B 已完成 RC smoke matrix runner / documentation cleanup foundation，M8-C 已完成 RC quick gate execution and blocker triage，M8-D 已完成 full/domain RC matrix execution and blocker triage，M8-E 已完成 RC acceptance baseline and CI gate decision，M8-F 已完成 RC release checklist and post-M8 roadmap freeze，M8-G 已完成 RC signoff and release-candidate handoff，M9-A 已完成 post-M8 roadmap prioritization and branch-hygiene / release packaging decision，M9-B 已完成 Git branch management safety plan，M9-C 已完成 Git branch management guarded implementation，M9-D 已完成 Git graph / blame read-only foundation，M10-A 已完成 LSP semantic tokens / workspace symbols foundation plan，M10-B 已完成 LSP semantic tokens guarded implementation，M10-C 已完成 LSP workspace symbols foundation，M10-D 已完成 LSP semantic/workspace symbols acceptance closeout，M11-A 已完成 post-M10 IDE intelligence roadmap and release gate plan，M11-B 已完成 IDE Command Palette / Go to Symbol shell foundation，M11-C 已完成 watcher-backed symbol index research and minimal plan，M11-C-B 已完成 watcher-backed symbol index guarded implementation，M11-D 已完成 multi-language LSP provider research plan，M11-E-A 已完成 provider registry extraction，M11-E-B 已完成 JSON official language service migration，M11-E-C 已完成 HTML/CSS lightweight language services guarded implementation，M11-E-D 已完成 multi-language provider acceptance closeout，M11-F-A 已完成 external language server gateway research plan，M11-F-B 已完成 external language server gateway skeleton guarded implementation，M11-F-C 已完成 first real external language server provider proof，M11-F-D 已完成 external provider lifecycle/status hardening and acceptance closeout，M11-G 已完成 external provider expansion and IDE status UI plan，M11-H 已完成 IDE external provider status UI foundation，M11-I 已完成 Bash external provider proof，M11-J External provider installer/version policy plan 已完成，M11-K External provider optional installer/status implementation、M11-L External provider dependency hygiene / exact pin readiness 与 M11-M Pyright external provider guarded implementation plan、M11-N Pyright external provider guarded implementation、M11-O External provider acceptance / heavy provider expansion decision、M11-P Dockerfile external provider guarded proof、M11-Q Markdown / vscode-langservers-extracted provider plan 与 M11-R Markdown external provider guarded implementation 已完成，下一步进入 M11-S ESLint external provider project-config/runtime safety plan；Debug、force push/merge/rebase、heavy provider 完整接入仍不同时追完整。
```

## 4. LSP 语言服务方案

Monaco 提供编辑器能力，但完整 IDE 体验需要 LSP。

M7.y-A 已完成 LSP / Git / Debug integration hardening plan，记录见 [`archive/m7y-a-lsp-git-debug-integration-plan.md`](./archive/m7y-a-lsp-git-debug-integration-plan.md)。M7.y-B 已完成 TypeScript / JavaScript LSP diagnostics foundation，记录见 [`archive/m7y-b-typescript-javascript-lsp-diagnostics-summary.md`](./archive/m7y-b-typescript-javascript-lsp-diagnostics-summary.md)。当前 TS/JS diagnostics 复用既有 `/api/lsp/diagnostics`、`/ws/lsp`、Problems、Output 和 editor reveal 链路；M7.y-C 已确认 TS/JS interaction 应基于 TypeScript `LanguageServiceHost` / `ScriptSnapshot` / `createLanguageService` 的有界 provider，而不是一次性正则或临时 compiler proof；M7.y-D 已完成 TS/JS hover + definition foundation；M7.y-E 已完成 TS/JS completion foundation；M7.y-F 已完成 LSP interaction acceptance closeout；M7.z-A 已完成 post-M7 enhancement plan；M7.z-B 已完成 references foundation；M7.z-C 已完成 rename / formatting / code actions 安全计划，明确 WorkspaceEdit preview/apply、dirty/conflict 和 root guard 边界。M7.z-D 已完成 Git remote operations foundation plan，M7.z-E 已完成 Git remote operations foundation hardening：补齐 fetch API/client、Source Control Fetch/Pull/Push/Publish/Sync 受控入口和 smoke:ide:git-remote-foundation。M7.z-F 已完成 LSP WorkspaceEdit preview/apply foundation；M7.z-G 已完成 LSP rename / formatting / code actions UI foundation；M7.z-H 已完成 Git branch / stash UI foundation；M7.z-I 已完成 Git branch / stash hardening and acceptance closeout；M7.z-J 已完成 LSP / Git / Debug enhancement acceptance closeout；M8-A 已完成 IDE stabilization and release-candidate plan，M8-B 已完成 RC smoke matrix runner / documentation cleanup foundation，M8-C 已完成 RC quick gate execution and blocker triage，M8-D 已完成 full/domain RC matrix execution and blocker triage，M8-E 已完成 RC acceptance baseline and CI gate decision，M8-F 已完成 RC release checklist and post-M8 roadmap freeze，M8-G 已完成 RC signoff and release-candidate handoff，M9-A 已完成 post-M8 roadmap prioritization and branch-hygiene / release packaging decision，M9-B 已完成 Git branch management safety plan；M9-C 已完成 Git branch management guarded implementation：branch delete/rename/upstream set/unset 通过既有 Git service/client 和 Source Control branch action menu 受控接入。M9-D 已完成 Git graph / blame read-only foundation：只读 graph/blame API、Source Control 历史/Blame 入口和 smoke 已接入。M10-A 已完成 LSP semantic tokens / workspace symbols foundation plan，记录见 [`archive/m10-a-lsp-semantic-tokens-workspace-symbols-plan.md`](./archive/m10-a-lsp-semantic-tokens-workspace-symbols-plan.md)。M10-B 已完成 LSP semantic tokens guarded implementation，记录见 [`archive/m10-b-lsp-semantic-tokens-summary.md`](./archive/m10-b-lsp-semantic-tokens-summary.md)。M10-C 已完成 LSP workspace symbols foundation，记录见 [`archive/m10-c-lsp-workspace-symbols-summary.md`](./archive/m10-c-lsp-workspace-symbols-summary.md)。M10-D 已完成 LSP semantic/workspace symbols acceptance closeout，记录见 [`archive/m10-d-lsp-semantic-workspace-symbols-acceptance-summary.md`](./archive/m10-d-lsp-semantic-workspace-symbols-acceptance-summary.md)。M11-A 已完成 post-M10 IDE intelligence roadmap and release gate plan，记录见 [`archive/m11-a-post-m10-ide-intelligence-roadmap-plan.md`](./archive/m11-a-post-m10-ide-intelligence-roadmap-plan.md)。M11-B 已完成 IDE Command Palette / Go to Symbol shell foundation，记录见 [`archive/m11-b-command-palette-go-to-symbol-summary.md`](./archive/m11-b-command-palette-go-to-symbol-summary.md)。M11-C 已完成 watcher-backed symbol index research and minimal plan，记录见 [`archive/m11-c-watcher-backed-symbol-index-plan.md`](./archive/m11-c-watcher-backed-symbol-index-plan.md)。M11-C-B 已完成 watcher-backed symbol index guarded implementation，记录见 [`archive/m11-c-b-watcher-backed-symbol-index-summary.md`](./archive/m11-c-b-watcher-backed-symbol-index-summary.md)。M11-D 已完成 multi-language LSP provider research plan，记录见 [`archive/m11-d-multi-language-lsp-provider-plan.md`](./archive/m11-d-multi-language-lsp-provider-plan.md)。M11-E-A 已完成 provider registry extraction，记录见 [`archive/m11-e-a-provider-registry-summary.md`](./archive/m11-e-a-provider-registry-summary.md)。M11-E-B 已完成 JSON official language service migration，记录见 [`archive/m11-e-b-json-language-service-summary.md`](./archive/m11-e-b-json-language-service-summary.md)。M11-E-C 已完成 HTML/CSS lightweight language services guarded implementation；M11-E-D 已完成 multi-language provider acceptance closeout；M11-F-A 已完成 external language server gateway research plan；M11-F-B 已完成 external language server gateway skeleton guarded implementation，记录见 [`archive/m11-f-b-external-lsp-gateway-skeleton-summary.md`](./archive/m11-f-b-external-lsp-gateway-skeleton-summary.md)；M11-F-C 已完成 first real external language server provider proof，记录见 [`archive/m11-f-c-yaml-external-provider-proof-summary.md`](./archive/m11-f-c-yaml-external-provider-proof-summary.md)；下一步优先进入 M11-F-D external provider lifecycle/status hardening and acceptance closeout，force push/merge/rebase、heavy provider 完整接入与更完整 DAP parity 继续后置，不和后续语言智能路线同时扩张。

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

### M10-A 已完成：Semantic Tokens / Workspace Symbols 计划

M10-A 已完成，记录见 [`archive/m10-a-lsp-semantic-tokens-workspace-symbols-plan.md`](./archive/m10-a-lsp-semantic-tokens-workspace-symbols-plan.md)。

完成口径：

```txt
- 审计现有 apps/api/modules/lsp 与 IDE Monaco providers。
- 确认当前 LSP 已有 diagnostics、hover、completion、definition、references、rename、formatting、code actions 与 WorkspaceEdit preview/apply。
- 明确 M10-B 先做 TS/JS semantic tokens guarded implementation。
- 明确 M10-C 再做 workspace symbols foundation。
- 继续复用既有 LSP service、Files root guard、Monaco provider、Output channel 和 editor reveal，不新增第二套 LSP API。
```

M10-A 不实现 runtime 功能代码，不接完整 tsserver / typescript-language-server 进程，不做多语言全集，不做 watcher-driven symbol index。

### M10-B 已完成：LSP Semantic Tokens Guarded Implementation

M10-B 已完成，记录见 [`archive/m10-b-lsp-semantic-tokens-summary.md`](./archive/m10-b-lsp-semantic-tokens-summary.md)。

完成口径：

```txt
- 新增 LspSemanticTokensRequest / LspSemanticTokensResponse contract。
- 后端复用 apps/api/modules/lsp/service.ts 与 Files root/path guard，新增 /api/lsp/semantic-tokens 与 /ws/lsp semanticTokens message。
- 首版只支持 TypeScript / JavaScript / TSX / JSX，使用 TypeScript LanguageService 的 2020 semantic classification 编码并转换为 Monaco/LSP full token data。
- 增加文件大小与 token 数量上限，大文件 bounded empty/truncated，unsupported language 400 明确降级。
- 前端复用既有 Monaco LSP provider 注册 document semantic tokens provider，不新增第二套 LSP API 或编辑器壳。
- 新增 smoke:ide:lsp-semantic-tokens。
```

M10-B 不做 workspace symbols、semantic token delta/range、多语言全集、完整 tsserver/typescript-language-server 进程、watcher-driven symbol index、Debug/Git/Terminal 新能力或 File Manager Online Editor 产品壳变更；M10-C 已按受控范围补齐 workspace symbols foundation。

### M10-C 已完成：LSP Workspace Symbols Foundation

M10-C 已完成，记录见 [`archive/m10-c-lsp-workspace-symbols-summary.md`](./archive/m10-c-lsp-workspace-symbols-summary.md)。

完成口径：

```txt
- 新增 LspWorkspaceSymbolsRequest / LspWorkspaceSymbolsResponse contract。
- 后端复用 apps/api/modules/lsp/service.ts 与 Files root/directory guard，新增 /api/lsp/workspace-symbols 与 /ws/lsp workspaceSymbols message。
- 首版只支持 TypeScript / JavaScript / TSX / JSX workspace symbols，使用 TypeScript LanguageService getNavigateToItems。
- 增加 query length、result count、scan file count、单文件大小、隐藏文件、排除目录和 symlink 跳过等边界。
- 前端复用 IDE Search View 增加“符号”模式，结果点击打开 IDE Editor tab 并 reveal 到符号位置。
- 新增 smoke:ide:lsp-workspace-symbols，覆盖 direct API、/ws/lsp、bounded long-query failure 和 /ide Search 符号结果打开。
```

M10-C 不做完整 tsserver/typescript-language-server 进程、不做 watcher-driven symbol index、不做 AI semantic search、不做多语言全集、不做 fuzzy global command palette、不改变 File Manager Online Editor 产品壳；M10-D 已收口 semantic/workspace symbols 验收。

### M10-D 已完成：LSP Semantic / Workspace Symbols Acceptance Closeout

M10-D 已完成，记录见 [`archive/m10-d-lsp-semantic-workspace-symbols-acceptance-summary.md`](./archive/m10-d-lsp-semantic-workspace-symbols-acceptance-summary.md)。

完成口径：

```txt
- 收口 M10-A 计划、M10-B semantic tokens guarded implementation、M10-C workspace symbols foundation。
- 确认 LSP semantic/workspace symbols 均复用现有 apps/api/modules/lsp、Files root/path guard、IDE Monaco/Search/open-reveal 链路。
- 固化验证证据：typecheck:api、typecheck:web、build:api、smoke:ide:lsp-semantic-tokens、smoke:ide:lsp-workspace-symbols、docs link check 与 git diff --check。
- 更新阶段状态：M10-D 已完成；下一步 M11-A 先做 post-M10 roadmap / release gate plan，再决定是否推进 watcher-backed index、多语言 LSP、Command Palette 或更完整 DAP/Git parity。
```

M10-D 不新增 runtime 功能，不改变 semantic tokens/workspace symbols API，不推进完整 tsserver/typescript-language-server、不推进 watcher-backed index、不推进 AI semantic search、不推进 force push/merge/rebase 或 Debug/Git/Terminal 新能力；M11-A 已完成 post-M10 路线排序与 release gate 计划。

### M11-A 已完成：Post-M10 IDE Intelligence Roadmap and Release Gate Plan

M11-A 已完成，记录见 [`archive/m11-a-post-m10-ide-intelligence-roadmap-plan.md`](./archive/m11-a-post-m10-ide-intelligence-roadmap-plan.md)。

路线决策：

```txt
P0：M11-B IDE Command Palette / Go to Symbol shell foundation 已完成。
P1：再评估 watcher-backed symbol index，与 M6 watcher/search 复用，不新建独立 index daemon。
P2：多语言 LSP 需要逐语言研究 provider/依赖/安全边界，不能一次性“全支持”。
P3：Git force/merge/rebase、Debug DAP parity 与 Terminal 新能力继续后置，避免和语言智能同时扩张。
```

Release gate：

```txt
- M11-B 前必须保持 M10 semantic tokens 与 workspace symbols smoke 绿色。
- Command Palette 只能复用现有 command/action/search/LSP client，不新建第二套 command registry 或 LSP API。
- Go to Symbol 首版只调用 M10-C workspace symbols，不做后台索引、不持久化 symbol DB。
- 若 M11-B 引入 UI runtime，至少补 smoke:ide:command-palette 或同等 /ide smoke。
```

M11-A 不新增 runtime 代码，不改变 LSP/Git/Debug/Terminal API，不推进 watcher index、多语言 LSP 或 Command Palette 实现；它只确定下一阶段顺序和验收门槛。M11-B 已新增 Command Palette / Go to Symbol shell。M11-C 已完成 watcher-backed symbol index 研究与最小计划，定义复用 M6 watcher/search、M10 workspace symbols、Files content-index 模式的索引边界，但仍不实现 runtime index、多语言 LSP、Git remote/history rewrite、Debug parity 或 Terminal 新能力。

### M11-C 已完成：Watcher-backed Symbol Index Research and Minimal Plan

M11-C 已完成，记录见 [`archive/m11-c-watcher-backed-symbol-index-plan.md`](./archive/m11-c-watcher-backed-symbol-index-plan.md)。本阶段只做研究、边界和最小计划，不实现 runtime symbol index。

完成口径：

```txt
- 复盘 M6 watcher/search、Files content-index、M10-C workspace symbols 与 M11-B Command Palette 的复用点。
- 确认未来 symbol index 继续隐藏在 /api/lsp/workspace-symbols provider 内，不新增前端调用面或第二套 LSP API。
- 明确 index 只保存 root/path/language/version/symbol/range/provider metadata，不保存完整源码。
- 明确 created/changed/deleted/rename/move 的 stale/delete/rebuild 规则和 direct scan fallback。
- 定义 M11-C-B watcher-backed symbol index guarded implementation 的最小切片与验证。
```

M11-C 不做 runtime index、独立 symbol daemon、第二套 Files/Search/LSP API、完整源码持久化、多语言 LSP、完整 tsserver/typescript-language-server 长驻进程、AI semantic search、Git force/merge/rebase、Debug parity、Terminal 新能力或 File Manager Online Editor 产品壳变更。M11-C-B 已完成受控实现；M11-D 已完成 multi-language LSP provider research plan；M11-E-A 已完成 provider registry extraction；M11-E-B 已完成 JSON official language service migration；M11-E-C 已完成 HTML/CSS lightweight language services guarded implementation；M11-E-D 已完成 multi-language provider acceptance closeout；M11-F-A 已完成 external language server gateway research plan；M11-F-B 已完成 external language server gateway skeleton guarded implementation；M11-F-C 已完成 first real external language server provider proof；M11-F-D 已完成 external provider lifecycle/status hardening and acceptance closeout；M11-G 已完成 external provider expansion and IDE status UI plan；M11-H 已完成 IDE external provider status UI foundation；M11-I 已完成 Bash external provider proof；M11-J 已完成 External provider installer/version policy plan；M11-K 已完成 External provider optional installer/status implementation；M11-L 已完成 External provider dependency hygiene / exact pin readiness；M11-M 已完成 Pyright external provider guarded implementation plan；M11-N 已完成 Pyright external provider guarded implementation；M11-O 已完成 external provider acceptance / heavy provider expansion decision；M11-P 已完成 Dockerfile external provider guarded proof；M11-Q 已完成 Markdown / vscode-langservers-extracted provider plan；M11-R 已完成 Markdown external provider guarded implementation；M11-S 已完成 ESLint external provider project-config/runtime safety plan；M11-T 已完成 ESLint external provider guarded diagnostics implementation；下一步 M11-U 进入 ESLint monorepo / workingDirectories hardening plan。

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
M7.x-A：Debug hardening plan（已完成）。
M7.x-B：Debug lifecycle foundation（已完成）。
M7.x-C：Launch profile / config foundation（已完成）。
M7.x-D：Real Node inspector adapter minimal（已完成）。
M7.x-E：Debug controls / scopes foundation（已完成）。
M7.x-F：Debug Console watch / evaluate foundation（已完成）。
M7.x-G：Debug hardening acceptance closeout（已完成）。
M7.y-A：LSP / Git / Debug integration hardening plan（已完成）。
M7.y-B：TypeScript / JavaScript LSP diagnostics foundation（已完成）。
M7.y-C：TypeScript / JavaScript LSP interaction expansion plan（已完成）。
M7.y-D：TypeScript / JavaScript hover and definition foundation（已完成）。
M7.y-E：TypeScript / JavaScript completion foundation（已完成）。
M7.y-F：LSP interaction acceptance closeout（已完成）。
M7.z-A：LSP / Git / Debug post-M7 enhancement plan（已完成）。
M7.z-B：Advanced LSP references foundation（已完成）。
M7.z-C：LSP rename / formatting / code actions plan（已完成）。
M7.z-D：Git remote operations foundation plan（已完成）。
M7.z-E：Git remote operations foundation hardening（已完成）。
M7.z-F：LSP WorkspaceEdit preview/apply foundation（已完成）。
M7.z-G：LSP rename / formatting / code actions UI foundation（已完成）。
M7.z-H：Git branch / stash UI foundation（已完成）。
M7.z-I：Git branch / stash hardening and acceptance closeout（已完成）。
M7.z-J：LSP / Git / Debug enhancement acceptance closeout（已完成）。
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
21. M7.x-B：Debug lifecycle foundation（已完成）
22. M7.x-C：Launch profile / config foundation（已完成）
23. M7.x-D：Real Node inspector adapter minimal（已完成）
24. M7.x-E：Debug controls / scopes foundation（已完成）
25. M7.x-F：Debug Console watch / evaluate foundation（已完成）
26. M7.x-G：Debug hardening acceptance closeout（已完成）
27. M7.y-A：LSP / Git / Debug integration hardening plan（已完成）
28. M7.y-B：TypeScript / JavaScript LSP diagnostics foundation（已完成）
29. M7.y-C：TypeScript / JavaScript LSP interaction expansion plan（已完成）
30. M7.y-D：TypeScript / JavaScript hover and definition foundation（已完成）
31. M7.y-E：TypeScript / JavaScript completion foundation（已完成）
32. M7.y-F：LSP interaction acceptance closeout（已完成）
33. M7.z-A：LSP / Git / Debug post-M7 enhancement plan（已完成）
34. M7.z-B：Advanced LSP references foundation（已完成）
35. M7.z-C：LSP rename / formatting / code actions plan（已完成）
36. M7.z-D：Git remote operations foundation plan（已完成）
37. M7.z-E：Git remote operations foundation hardening（已完成）
38. M7.z-F：LSP WorkspaceEdit preview/apply foundation（已完成）
39. M7.z-G：LSP rename / formatting / code actions UI foundation（已完成）
40. M7.z-H：Git branch / stash UI foundation（已完成）
41. M7.z-I：Git branch / stash hardening and acceptance closeout（已完成）
42. M7.z-J：LSP / Git / Debug enhancement acceptance closeout（已完成）
43. M8-A：IDE stabilization and release-candidate plan（已完成）
44. M8-B：RC smoke matrix runner / documentation cleanup foundation（已完成）
45. M8-C：RC quick gate execution and blocker triage（已完成）
46. M8-D：full/domain RC matrix execution and blocker triage（已完成）
47. M8-E：RC acceptance baseline and CI gate decision（已完成）
48. M8-F：RC release checklist and post-M8 roadmap freeze（已完成）
49. M8-G：RC signoff and release-candidate handoff（已完成）
50. M9-A：post-M8 roadmap prioritization and branch-hygiene / release packaging decision（已完成）
51. M9-B：Git branch management safety plan（已完成）
52. M9-C：Git branch management guarded implementation（已完成）
53. M9-D：Git graph / blame read-only foundation（已完成）
54. M10-A：LSP semantic tokens / workspace symbols foundation plan（已完成）
55. M10-B：LSP semantic tokens guarded implementation（已完成）
56. M10-C：LSP workspace symbols foundation（已完成）
57. M10-D：LSP semantic/workspace symbols acceptance closeout（已完成）
58. M11-A：post-M10 IDE intelligence roadmap and release gate plan（已完成）
59. M11-B：IDE Command Palette / Go to Symbol shell foundation（已完成）
60. M11-C：watcher-backed symbol index research and minimal plan（已完成）
61. M11-C-B：watcher-backed symbol index guarded implementation（已完成）
62. M11-D：multi-language LSP provider research plan（已完成）
63. M11-E-A：provider registry extraction（已完成）
64. M11-E-B：JSON official language service migration（已完成）
65. M11-E-C：HTML/CSS lightweight language services guarded implementation（已完成）
66. M11-E-D：multi-language provider acceptance closeout（已完成）
67. M11-F-A：external language server gateway research plan（已完成）
68. M11-F-B：external language server gateway skeleton guarded implementation（已完成）
69. M11-F-C：first real external language server provider proof（已完成）
70. M11-F-D：external provider lifecycle/status hardening and acceptance closeout（已完成）
71. M11-G：external provider expansion and IDE status UI plan（已完成）
72. M11-H：IDE external provider status UI foundation（已完成）
73. M11-I：Bash external provider proof（已完成）
74. M11-J：External provider installer/version policy plan（已完成）
75. M11-K：External provider optional installer/status implementation（已完成）
76. M11-L：External provider dependency hygiene / exact pin readiness（已完成）
77. M11-M：Pyright external provider guarded implementation plan（已完成）
78. M11-N：Pyright external provider guarded implementation（已完成）
79. M11-O：External provider acceptance / heavy provider expansion decision（已完成）
80. M11-P：Dockerfile external provider guarded proof（已完成）
81. M11-Q：Markdown / vscode-langservers-extracted provider plan（已完成）
82. M11-R：Markdown external provider guarded implementation（已完成）
83. M11-S：ESLint external provider project-config/runtime safety plan（下一步）
```

### M11-J 已完成：External Provider Installer / Version Policy Plan

M11-J 已完成，记录见 [`archive/m11-j-external-provider-installer-version-policy-plan.md`](./archive/m11-j-external-provider-installer-version-policy-plan.md)。本阶段是 docs-only policy closeout：在 YAML 与 Bash 两个真实 external language server proof 后，先定义 provider 安装、版本、安全审计和 optional provider 状态策略，不继续盲目新增 heavy provider。

完成口径：

```txt
- 审计当前 external provider：YAML 与 Bash 都通过 server-side allowlist profile、process.execPath 与 require.resolve 启动。
- 核验当前 npm provider 候选：yaml-language-server 1.23.0、bash-language-server 5.6.0、pyright 1.1.411、typescript-language-server 5.3.0、vscode-langservers-extracted 4.10.0。
- 明确 external provider 默认不允许 runtime npm install / npx / 用户传 command；前端只能读状态。
- 明确 external provider 版本优先 exact pin，YAML 当前 ^1.23.0 后续应进入依赖 hygiene。
- 明确 npm audit 当前完整依赖树为 13 项漏洞，生产依赖视角为 10 项；不得用 audit fix --force 自动修复 provider 链路。
- 明确 M11-K 下一步只做 optional installer/status metadata，不直接接 Pyright runtime。
```

M11-J 明确不做 runtime provider、auto install、Pyright/tsserver/gopls/rust-analyzer 接入、system binary discovery、前端安装按钮、external gateway 行为修改、第二套 LSP/Files/Search API、Git force/merge/rebase、Debug parity、Terminal 新能力或 File Manager Online Editor 产品壳变更。

### M11-K 已完成：External Provider Optional Installer / Status Implementation

M11-K 已完成，记录见 [`archive/m11-k-external-provider-optional-status-summary.md`](./archive/m11-k-external-provider-optional-status-summary.md)。本阶段实现 provider install/version/audit/policy 只读 metadata，接入 `/api/lsp/status` 与 IDE 外部 LSP Provider 状态对话框。

完成口径：

```txt
- 新增 externalProviderMetadata，记录 provider package/source/install status/resolved version/pinned version/license/audit/policy。
- /api/lsp/status.externalProviders 增加 profiles[].install 与 metadata[]。
- IDE provider status dialog 展示 installed、version、pin、source、package、audit note 和 policy note。
- smoke:ide:lsp-provider-status 校验 YAML/Bash metadata 与 UI 展示。
```

M11-K 明确不做 Pyright/tsserver/gopls/rust-analyzer/Vue/Svelte runtime provider、自动安装、前端安装按钮、用户自定义 command/args、system binary discovery、external gateway 生命周期改写、第二套 LSP API 或 File Manager Online Editor 产品壳变更。M11-L 已完成 dependency hygiene / exact pin readiness；M11-M 已完成 Pyright guarded implementation plan；M11-N 已完成 Pyright guarded implementation；M11-O 已完成 external provider acceptance / heavy provider expansion decision；M11-P 已完成 Dockerfile external provider guarded proof；M11-Q 已完成 Markdown / vscode-langservers-extracted provider plan；M11-R 已完成 Markdown external provider guarded implementation；M11-S 已完成 ESLint external provider project-config/runtime safety plan；M11-T 已完成 ESLint external provider guarded diagnostics implementation，下一步 M11-U 进入 ESLint monorepo / workingDirectories hardening plan。

### M11-N 已完成：Pyright External Provider Guarded Implementation

M11-N 已完成，记录见 [`archive/m11-n-pyright-external-provider-summary.md`](./archive/m11-n-pyright-external-provider-summary.md)。本阶段把 M11-M 的计划落到最小受控实现：Pyright 作为 bundled npm exact-pin external provider，只证明 Python diagnostics 与 provider status，不扩大到完整 Python IDE 能力。

完成口径：

```txt
- 新增 exact pinned `pyright@1.1.411` 依赖，并记录 MIT license、package metadata、audit/policy note。
- 通过 `process.execPath` + `require.resolve("pyright/langserver.index.js")` + `--stdio` 建立 server-side allowlisted profile。
- provider registry 增加 `pyright`，语言范围限制为 python / py / python3 / pyi。
- `/api/lsp/diagnostics` 的 Python 路由复用既有 external language server gateway，只返回 diagnostics/status proof。
- IDE External Provider Status dialog 展示 Pyright installed/version/pin/source，并修复 provider 增长后弹窗内容可滚动、footer close 可见。
- 新增 `test:system:lsp-pyright-provider`，同时扩展 provider hygiene、external gateway 与 status smoke 验证。
```

M11-N 明确不做：Python hover/completion/definition/references/rename/format/code action、virtualenv/interpreter discovery、Pylance 私有能力、用户自定义 provider command/env、system binary discovery、auto install、第二套 LSP/Files/Search API、Git force/merge/rebase、Debug parity、Terminal 新能力或 File Manager Online Editor 产品壳变更。M11-O 已完成 external provider acceptance / heavy provider expansion decision；M11-P 已完成 Dockerfile external provider guarded proof；M11-Q 已完成 Markdown / vscode-langservers-extracted provider plan；M11-R 已完成 Markdown external provider guarded implementation；M11-S 已完成 ESLint external provider project-config/runtime safety plan；M11-T 已完成 ESLint external provider guarded diagnostics implementation；下一步 M11-U 进入 ESLint monorepo / workingDirectories hardening plan。

### M11-O 已完成：External Provider Acceptance / Heavy Provider Expansion Decision

M11-O 已完成，记录见 [`archive/m11-o-external-provider-acceptance-expansion-decision.md`](./archive/m11-o-external-provider-acceptance-expansion-decision.md)。本阶段只做 acceptance / decision closeout，不新增 provider runtime，也不安装依赖。

完成口径：

```txt
- 固化 YAML / Bash / Pyright 三个 external provider 的共同验收 gate：exact pin、package-lock/metadata/status UI 一致、server-side allowlist、provider-specific system test、status smoke、root/cwd guard、bounded stderr tail。
- 核验当前 npm 候选 provider 元数据：dockerfile-language-server-nodejs、typescript-language-server、vscode-langservers-extracted、@vue/language-server、svelte-language-server、Pyright、YAML 与 Bash。
- 决定下一步 M11-P 选择 Dockerfile external provider guarded proof：体量小、MIT、npm-first、bin 入口明确、与现有 in-process provider 不重叠。
- 暂缓 TypeScript Language Server migration、Pyright advanced features、vscode-langservers-extracted 替换、Vue/Svelte framework providers、Go/Rust/Java/C/C++ toolchain providers。
```

M11-O 明确不做：Dockerfile runtime provider、任何新依赖安装、YAML upgrade、TS/JS external migration、Python advanced LSP、auto install、system binary discovery、用户自定义 command/env、第二套 LSP/Files/Search API、Git force/merge/rebase、Debug parity、Terminal 新能力或 File Manager Online Editor 产品壳变更。M11-P 已完成 Dockerfile external provider guarded proof；M11-Q 已完成 Markdown / vscode-langservers-extracted provider plan；M11-R 已完成 Markdown external provider guarded implementation；M11-S 已完成 ESLint external provider project-config/runtime safety plan；M11-T 已完成 ESLint external provider guarded diagnostics implementation；下一步 M11-U 进入 ESLint monorepo / workingDirectories hardening plan。

### M11-P 已完成：Dockerfile External Provider Guarded Proof

M11-P 已完成，记录见 [`archive/m11-p-dockerfile-external-provider-summary.md`](./archive/m11-p-dockerfile-external-provider-summary.md)。本阶段按 M11-O gate 接入 Dockerfile 作为第四个 real external provider proof，只做 diagnostics/status，不接 Docker daemon，也不做 Dockerfile hover/completion/formatting。

完成口径：

```txt
- 新增 exact pinned `dockerfile-language-server-nodejs@0.15.0` 依赖。
- external provider metadata 增加 dockerfile package/source/install status/pin/license/audit/policy。
- server-side profile 使用 `process.execPath` + `require.resolve("dockerfile-language-server-nodejs/bin/docker-langserver")` + `--stdio`。
- provider registry 增加 dockerfile，语言范围限制为 dockerfile / docker。
- `/api/lsp/diagnostics` 的 Dockerfile 路由复用 existing external gateway，返回 Dockerfile diagnostics proof。
- IDE external provider status smoke 展示 Dockerfile installed/version/pin/source。
- 新增 `test:system:lsp-dockerfile-provider` 覆盖 profile/lifecycle 与 diagnostics。
```

M11-P 明确不做：Dockerfile hover/completion/definition/references/formatting/code action、Docker daemon/container runtime discovery、auto install、system binary discovery、前端 provider command/env、YAML upgrade、TS/JS external migration、Python advanced features、第二套 LSP/Files/Search API、Git force/merge/rebase、Debug parity、Terminal 新能力或 File Manager Online Editor 产品壳变更。M11-Q 已完成 Markdown / vscode-langservers-extracted provider plan；M11-R 已完成 Markdown external provider guarded implementation；M11-S 已完成 ESLint external provider project-config/runtime safety plan；M11-T 已完成 ESLint external provider guarded diagnostics implementation，下一步 M11-U 进入 ESLint monorepo / workingDirectories hardening plan。

### M11-Q 已完成：Markdown / vscode-langservers-extracted Provider Plan

M11-Q 已完成，记录见 [`archive/m11-q-markdown-vscode-langservers-extracted-plan.md`](./archive/m11-q-markdown-vscode-langservers-extracted-plan.md)。本阶段只做 provider-pack 研究与边界计划，不安装依赖、不启动 runtime provider，也不替换现有 JSON / HTML / CSS in-process provider。

完成口径：

```txt
- 核验 `vscode-langservers-extracted@4.10.0` 当前 npm 元数据：MIT、multi-bin、包含 JSON/HTML/CSS/ESLint/Markdown language server bins。
- 明确该包与现有 in-process JSON / HTML / CSS provider 重叠，因此 M11-R 只允许启用 `vscode-markdown-language-server` bin。
- 决定 M11-R 使用 exact pinned bundled npm dependency、server-side allowlisted profile、metadata/status UI 与 provider-specific system test。
- 定义 Markdown language scope 为 markdown / md / mdx；MDX 仅按 Markdown text diagnostics/status 处理，不承诺 JSX/TSX semantics。
- 明确 Markdown server 可能对普通文本返回空 diagnostics；验收允许 bounded empty diagnostics，但必须证明 lifecycle/status/route 不崩。
```

M11-Q 明确不做：安装 `vscode-langservers-extracted`、启用 Markdown runtime provider、启用 JSON/HTML/CSS/ESLint bins、替换现有 in-process provider、Markdown hover/completion/definition/references/formatting/code action、Markdown preview/render、MDX JSX semantics、link validation、auto install、system binary discovery、前端 provider command/env、第二套 LSP/Files/Search API、Git force/merge/rebase、Debug parity、Terminal 新能力或 File Manager Online Editor 产品壳变更。M11-R 已完成 Markdown external provider guarded implementation；M11-S 已完成 ESLint external provider project-config/runtime safety plan；M11-T 已完成 ESLint external provider guarded diagnostics implementation；下一步 M11-U 进入 ESLint monorepo / workingDirectories hardening plan。

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

### M11-S 已完成：ESLint External Provider Project-Config / Runtime Safety Plan

M11-S 已完成，记录见 [`archive/m11-s-eslint-external-provider-safety-plan.md`](./archive/m11-s-eslint-external-provider-safety-plan.md)。本阶段只做 ESLint external provider 的项目配置、cwd/root guard、workspace trust、runtime budget 和验收切片计划，不启用 `vscode-eslint-language-server` runtime provider。

验收与风险收口：

```txt
- `vscode-langservers-extracted@4.10.0` already contains `vscode-eslint-language-server`, but M11-R intentionally left it disabled.
- ESLint differs from Markdown/Dockerfile: it resolves project config/plugins/parsers from cwd and may execute project-controlled code paths.
- M11-T must use root-level config activation gate, existing external gateway cwd/root guard, server-side command allowlist, bounded request budgets, metadata/status UI and provider-specific tests.
- M11-T diagnostics-only proof must not enable fix/format/code actions or user-provided command/env/runtime settings.
```

M11-S 明确不做：启用 ESLint runtime provider、ESLint auto-fix、formatting、code actions、fix on save、monorepo glob workingDirectories、用户自定义 `eslint.runtime` / `eslint.nodePath` / `eslint.execArgv` / provider command/env、auto install、system binary discovery、JSON/HTML/CSS bins、替换现有 TS/JS/JSON/HTML/CSS provider、第二套 LSP/Files/Search API、Git force/merge/rebase、Debug parity、Terminal 新能力或 File Manager Online Editor 产品壳变更。M11-T 已完成 guarded diagnostics implementation，下一步 M11-U 进入 ESLint monorepo / workingDirectories hardening plan。

### M11-T 已完成：ESLint External Provider Guarded Diagnostics Implementation

M11-T 已完成，记录见 [`archive/m11-t-eslint-external-provider-summary.md`](./archive/m11-t-eslint-external-provider-summary.md)。本阶段启用受控 ESLint diagnostics/status proof：`vscode-eslint-language-server` 只由后端 allowlist 启动，JS/TS 文件只有在路径内发现 ESLint activation marker 时才切到 ESLint diagnostics；无 marker 时继续走 TypeScript provider。ESLint 使用 LSP pull diagnostics (`textDocument/diagnostic`)；外部 gateway root/cwd 收敛到 marker directory。

M11-T 明确不做：ESLint fix、format、code action、fix on save、monorepo glob workingDirectories、frontend/user command/env/cwd/runtime/options、JSON/HTML/CSS bins、第二套 LSP/Files/Search API 或替换既有 TS/JS interaction provider。下一步 M11-U 进入 ESLint monorepo / workingDirectories hardening plan。
