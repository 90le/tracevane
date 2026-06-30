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
type TerminalSession = {
  id: string;
  workspaceId: string;
  name: string;
  cwd: string;
  shell: string;
  status: "connecting" | "running" | "exited" | "error";
  exitCode?: number | null;
  createdAt: string;
};
```

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

第二版：
- 接一个后端 LSP Gateway。
- 先支持最重要的一种语言。

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

Git 不建议第一版做。

后续可分阶段：

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

Debug 是复杂能力，建议后置。

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
第一阶段不做。
第二阶段只做运行任务。
第三阶段按具体语言接入 DAP。
```

## 8. 能力建设优先级

推荐顺序：

```txt
1. Monaco 编辑闭环
2. 独立 IDE 布局
3. xterm 终端
4. 任务运行
5. Diff / Search / Problems 空面板
6. 单语言 LSP
7. Git 只读状态
8. Git 基础操作
9. Debug
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

