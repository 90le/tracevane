# M7-F-A Debug Adapter Protocol 研究与最小实现计划

## 状态

M7-F-A 是 M7 Git Source Control 收口后的下一阶段入口。本阶段只做 Debug Adapter Protocol（DAP）研究、Tracevane 本地现状探查、边界定义和最小实现计划，不直接实现完整 Debug runtime。

## 外部协议研究

参考资料：

- 官方 DAP 网站：<https://microsoft.github.io/debug-adapter-protocol/>
- DAP Overview：<https://microsoft.github.io/debug-adapter-protocol/overview>
- DAP GitHub 仓库：<https://github.com/microsoft/debug-adapter-protocol>
- `@vscode/debugadapter` npm 包：<https://www.npmjs.com/package/@vscode/debugadapter>

关键结论：

```txt
- DAP 定义 IDE/editor 与 debug adapter 之间的抽象协议，而不是具体语言 debugger。
- 官方页面显示当前最新协议规范版本为 1.71.0。
- 协议消息使用 JSON，请求/响应/事件通过 base protocol 传输。
- 单 session 模式通常由开发工具启动 adapter 子进程，并通过 stdin/stdout 通信。
- 多 session 模式通常连接已运行 adapter 监听的端口。
- 初始化阶段通过 initialize 交换 capabilities；未声明的 capability 应视为不支持。
- launch / attach 的参数依赖具体 adapter；开发工具需要在自身层做配置 UI 与校验。
- breakpoints 由 IDE 管理并通过 setBreakpoints 等请求发送给 adapter。
- adapter 通过 initialized / stopped / thread / breakpoint / output 等事件驱动 UI 更新。
- stopped 后 IDE 通常再请求 threads / stackTrace / scopes / variables。
```

对 Tracevane 的影响：

- Tracevane 不应把 Debug 写成某个语言专用 UI；Workbench shell 应抽象 session、breakpoint、call stack、variables、debug console。
- Adapter 进程启动属于后端安全边界，不能由前端直接执行命令。
- `launch.json` 兼容可以后置；M7-F 先定义受控 profile/config 输入。
- Debug Console 应复用现有 Output/Panel 基础，但不能把大日志无限写入 layout/localStorage。

## 本地现状探查

### 后端

当前已有：

```txt
apps/api/modules/terminal
apps/api/modules/lsp
apps/api/modules/git
apps/api/modules/ide-workbench
```

现状结论：

- 暂无 `apps/api/modules/debug`。
- `apps/api/index.ts` 已创建 terminal、git、lsp、ideWorkbench 等服务。
- `apps/api/server.ts` 的 WebSocket upgrade 当前依次处理 model-gateway unsupported realtime、terminal、lsp。
- `apps/api/modules/lsp/service.ts` 已提供一个可参考的 WebSocket gateway shape。
- `apps/api/modules/terminal/service.ts` 已提供 PTY / tmux / root/cwd/profile guard 的后端 runtime 经验。
- 根依赖已有 `ws`；暂无 DAP 专用依赖。
- 根依赖已有 `@homebridge/node-pty-prebuilt-multiarch`，但 Debug Adapter 子进程不应默认复用 terminal PTY，除非 adapter/debuggee 明确需要 integrated terminal。

### 前端

当前已有：

```txt
apps/web/src/features/ide-workbench
apps/web/src/features/ide-workbench/problems
apps/web/src/features/ide-workbench/output
apps/web/src/features/ide-workbench/terminal
apps/web/src/features/ide-workbench/editor
```

现状结论：

- `WorkbenchActivityId` 已有 `run`，但当前 ActivityBar 中 disabled。
- Panel 已有 `debugConsole` tab，但仍是 placeholder。
- Problems / Output 已有可复用 store 与 panel 基础。
- EditorDock 已能打开真实 Monaco/file preview/git diff tab，为 breakpoint gutter/reveal active frame 提供承载点。
- StatusBar 已有 Git/Problems/Output 等基础，后续可展示 debug session 状态。
- 前端暂无 debug client、debug store、breakpoints store 或 Run and Debug View。

## M7-F 总体边界

M7-F 做：

```txt
- Debug Gateway / Debug session 数据模型。
- 后端受控 adapter process host 设计。
- create / initialize / launch 或 attach / setBreakpoints / configurationDone / continue / pause / step / disconnect 的最小状态流。
- stopped / thread / stackTrace / scopes / variables / output / terminated / exited / error 事件桥接。
- 前端 Run and Debug Activity/View。
- 前端 Debug Console panel 接入最小 output。
- Breakpoints 数据模型与 editor gutter 的最小联动。
- Problems / Output / StatusBar 只做必要联动，不新建平行面板。
```

M7-F 不做：

```txt
- 完整 VS Code Debug 行为。
- 完整 launch.json 兼容。
- 多语言 adapter 全量接入。
- Remote attach / browser debug / compound debug。
- Data breakpoints、function breakpoints、conditional/logpoint 完整 UI。
- Variable editing / watch expressions 完整体验。
- Debug Console REPL 完整表达式求值。
- 断点持久化云同步或跨 workspace 同步。
- Push/pull/checkout 等 Git 后续能力。
```

## 推荐架构

### 后端 Debug 模块

建议新增：

```txt
apps/api/modules/debug/service.ts
apps/api/modules/debug/routes.ts
apps/api/modules/debug/dapTransport.ts
apps/api/modules/debug/sessionManager.ts
types/debug.ts
```

职责：

```txt
- service：统一 DebugService 接口，暴露 status/create/list/control/disconnect/handleUpgrade。
- routes：提供只读 status/profiles/sessions 和受控 control HTTP 接口。
- dapTransport：实现 DAP base protocol framing（Content-Length + JSON）。
- sessionManager：管理 adapter 子进程、seq、pending requests、events、lifecycle。
- types/debug.ts：定义 Tracevane Debug Gateway 事件，不直接把全部 DAP schema 泄漏给前端。
```

WebSocket 建议：

```txt
/ws/debug
```

后端安全规则：

```txt
- Debug session 必须绑定 rootId/workspaceId。
- cwd 必须复用 Files root guard，禁止逃逸 workspace。
- adapter/profile 必须 allowlist，不接受任意 shell command。
- launch/attach config 必须按 profile schema 校验。
- 不长期保存完整 debug output、变量值或敏感环境变量。
- disconnect/terminate/kill 必须有明确状态与清理路径。
```

### 前端 Debug Workbench shell

建议新增：

```txt
apps/web/src/features/ide-workbench/debug/DebugView.tsx
apps/web/src/features/ide-workbench/debug/DebugConsolePanel.tsx
apps/web/src/features/ide-workbench/debug/debugClient.ts
apps/web/src/features/ide-workbench/debug/debugStore.ts
apps/web/src/features/ide-workbench/debug/debugTypes.ts
apps/web/src/features/ide-workbench/debug/index.ts
```

职责：

```txt
- DebugView：Run and Debug Activity 主视图，管理 profile、start/stop、sessions、call stack、variables skeleton。
- DebugConsolePanel：替换当前 debugConsole placeholder，接入 debug output events。
- debugClient：HTTP/WebSocket 薄客户端，不绕过后端 DebugService。
- debugStore：前端 session/breakpoint/output 状态；不保存完整大输出到 layout/localStorage。
- debugTypes：Workbench 内部类型，保持与 types/debug.ts 分层。
```

与现有模块关系：

```txt
- EditorDock / Monaco：承载 breakpoint gutter、active frame reveal，不拥有 DAP session。
- Problems：后续可展示 debugger errors，但不作为 Debug state 主存储。
- Output：记录 Debug channel 日志，Debug Console 显示 session output。
- Terminal：只在 adapter 通过 runInTerminal 或 profile 明确要求时用于 debuggee terminal；M7-F-A 不实现。
- Layout：只保存 view/panel 可见性和 breakpoint metadata，不保存 adapter 输出或变量快照。
```

## 最小实现切片建议

### M7-F-B：Debug Gateway skeleton + Debug View shell

目标：先证明 Workbench 可进入 Debug 模式且状态流可观测。

```txt
后端：
- 新增 apps/api/modules/debug skeleton。
- 新增 /api/debug/status 与 /ws/debug。
- 支持 mock/noop debug provider：create session -> initialized -> stopped/terminated 可控事件。
- 定义 DebugGatewayEvent / DebugSessionDescriptor / DebugBreakpoint 类型。
- 接入 app context 与 upgrade handler。

前端：
- Run ActivityBar 从 disabled 改为可打开 DebugView。
- Debug Console placeholder 替换为 DebugConsolePanel shell。
- DebugView 显示 provider/status/session 列表和 Start/Stop skeleton。
- Output 添加 Debug channel 事件。
- 新增 smoke:ide:debug-foundation，验证 /ide 不白屏、Run view 可打开、Debug Console 可切换、mock session 事件可显示。
```

M7-F-B 不做真实语言 adapter，不做 breakpoints gutter，不做 variables 真数据。

### M7-F-C：Breakpoints + editor reveal foundation

```txt
- Monaco gutter 点击添加/移除普通 line breakpoint。
- Breakpoints 存储绑定 rootId/path/line/enabled。
- DebugView 展示 breakpoints 列表。
- Mock provider 接收 setBreakpoints 并返回 verified/unverified。
- stopped event 可 reveal active frame 到 EditorDock。
```

### M7-F-D：最小真实 adapter proof

建议只选一个低风险 adapter/profile：

```txt
候选 A：Node inspect / js-debug adapter（需要进一步依赖与包体评估）。
候选 B：Python debugpy（依赖 Python 环境，不适合默认必需）。
候选 C：项目内 mock adapter 保持为默认，真实 adapter 作为可选 profile。
```

推荐路径：先保留 mock adapter 作为 CI/smoke 稳定基线，再评估真实 Node adapter 可选接入。不要为了演示直接要求用户机器安装 Python/debugpy。

### M7-F-E：Debug acceptance closeout

```txt
- 汇总 Debug skeleton / breakpoints / adapter proof 完成边界。
- 更新 00/07/08、project-context、archive summary。
- 明确后续 M7.x：variables 深化、watch expressions、debug console REPL、launch.json、multi-session/compound、remote attach。
```

## 验证计划

M7-F-A 本轮验证：

```txt
- Markdown 相对链接检查覆盖 touched docs。
- git diff --check。
```

M7-F-B 起建议新增：

```txt
npm run typecheck:api -- --pretty false
npm run typecheck:web -- --pretty false
npm run smoke:ide:debug-foundation
```

后续真实 adapter 阶段再追加：

```txt
- create / initialize / launch / setBreakpoints / configurationDone / stopped / stackTrace / scopes / variables / continue / disconnect 状态流验证。
- cwd/root guard 拒绝逃逸 workspace。
- adapter allowlist 拒绝未知 adapter/profile。
- Debug Console 输出不写入 layout/localStorage。
```

## 风险与缓解

| 风险 | 原因 | 缓解 |
| --- | --- | --- |
| DAP 范围膨胀 | 协议能力多，VS Code 行为复杂 | M7-F-B 先做 mock provider 与 shell，不直接追完整 adapter |
| 进程安全边界不清 | Debug adapter 与 debuggee 都是后端执行 | root/cwd guard、profile allowlist、config schema 先行 |
| 依赖选择过早 | Node/Python/Chrome adapter 生态差异大 | 真实 adapter proof 后置，M7-F-A 不新增依赖 |
| 输出/变量泄漏敏感信息 | Debugger 会暴露 stdout、env、变量值 | 不持久化完整 output/variables，UI 显式 session 生命周期 |
| 与 Terminal/Output 重复 | runInTerminal、Debug Console、Output 易重叠 | Terminal 只负责 terminal UI；DebugService 负责 DAP；Output 只做 channel log |

## M7-F-A 完成口径

```txt
- 已确认本地暂无 Debug/DAP module 与 DAP 依赖。
- 已确认可复用 terminal/lsp WebSocket 与 root guard 经验。
- 已确认前端有 Run Activity placeholder、Debug Console placeholder、Problems/Output/EditorDock 可复用基础。
- 已记录 DAP 官方协议要点和 spec version。
- 已给出 M7-F-B/M7-F-C/M7-F-D/M7-F-E 分段路线。
- 未实现 runtime 功能代码，未新增依赖。
```
