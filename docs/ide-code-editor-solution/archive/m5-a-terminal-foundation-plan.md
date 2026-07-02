# M5-A Real Terminal Foundation 研究、边界与最小实现计划

Status: Completed
Completed: 2026-07-02
Scope: M5-A research / boundary / implementation planning only
Next: M5-B Real Terminal Foundation minimal implementation

## 1. 本阶段目标

M5-A 只完成真实终端基础能力的本地探查、架构边界和 M5-B 最小实现计划。它不接入真实 xterm UI，不改 PTY 行为，不改变 Workbench PanelArea 运行时能力。

M5 的产品目标是：在独立 IDE Workbench 的 Terminal Panel 中提供真实可执行终端，并证明 create / input / output / resize / close / kill、cwd/root guard、shell allowlist 和状态处理可靠。

M5 不是完整 VS Code Terminal：terminal split/group、Panel right placement、Terminal View 全局 docking、LSP、Git、Debug、Problems/Output 数据接入全部后置。

## 2. 本地代码探查

| 项目 | 结论 | 影响 |
|---|---|---|
| `apps/api` 模块结构 | API 入口在 `apps/api/index.ts` / `apps/api/server.ts`，模块按 `apps/api/modules/*` 组织。 | Terminal 应继续作为 API module 接入，不另起服务。 |
| terminal 模块 | `apps/api/modules/terminal` 已存在，含 `service.ts`、`routes.ts`、session descriptor/ledger、action catalog。 | M5-B 应复用/加固现有模块，不新建第二套 TerminalGateway。 |
| WebSocket 接入 | `createTracevaneServer` 已处理 HTTP `upgrade`，并委托 `ctx.services.terminal.handleUpgrade(...)`；terminal service 处理 `/ws/terminal`。 | 可在现有 upgrade 路径上接 IDE terminal client。 |
| HTTP routes | `routes.ts` 已有 terminal status/check/sessions/input/resize/SSE/actions/profiles 等路由。 | M5-B 可复用 create/input/resize/end 等能力，并补 workspace root guard。 |
| PTY adapter | `service.ts` 通过 `@homebridge/node-pty-prebuilt-multiarch` 可选加载 PTY，并用 `pty.spawn(shell, [], { name: "xterm-256color", cols, rows, cwd, env })`。 | 后端已有真实 PTY 基础；M5-B 重点是安全边界和 Workbench 接入。 |
| cwd/root guard | Files service 内已有 `resolveRoot`、`resolveTargetPath`、`isWithinRoot` 等 root guard 语义；terminal 当前 `resolveLaunchCwd` 主要以 `openclawRoot` / `process.cwd()` 兜底。 | M5-B 必须把 terminal launch cwd 改为 rootId/workspace 受控路径，不允许逃逸 workspace。 |
| shell allowlist | 当前 terminal 创建 shell 主要使用 `process.env.SHELL || "/bin/bash"`。 | M5-B 必须新增 profile/shell allowlist，拒绝未知 shell。 |
| 依赖 | root `package.json` 已有 `@homebridge/node-pty-prebuilt-multiarch`、`ws`、`@types/ws`；`apps/api/package.json` 无独立 deps。 | M5-B 不需要新增后端依赖。 |
| Web xterm 依赖 | `apps/web/package.json` 已有 `@xterm/xterm`、`@xterm/addon-fit`、`@xterm/addon-web-links`、`@xterm/addon-webgl`。 | M5-B 可直接接 xterm shell；无需新增前端依赖。 |
| M4 PanelArea | `apps/web/src/features/ide-workbench/IdeWorkbenchPage.tsx` 已有 Terminal / Problems / Output / Debug Console 固定底部 tabs。 | M5-B 只替换 Terminal tab 内容，不影响其他 placeholder tabs。 |
| 布局状态 | `layoutState.ts` 已支持 panel visible/collapsed/height/maximized、activePanelId。 | xterm fit 应响应 Panel resize/collapse/maximize，不新增 split/group 状态。 |

## 3. 外部契约确认

M5-B 应遵守当前上游能力边界：

- xterm addon 通过 terminal API 加载；`@xterm/addon-fit` 负责根据容器尺寸计算终端行列。
- `ws` 支持 `WebSocketServer({ noServer: true })` 与 HTTP server 的 `handleUpgrade(...)` 集成，当前项目已经采用该形态。
- node-pty 的基本交互是 spawn PTY、写入 input、resize 行列、监听输出/退出并 kill/close session；当前项目使用预编译多架构包承载该能力。

因此 M5-B 不需要先引入新依赖；应优先把现有终端模块收敛到 IDE Workbench 的安全产品边界。

## 4. M5 范围

M5 做：

```txt
- Workbench Terminal Panel 中的真实 xterm 内容。
- backend PTY / session lifecycle。
- create / input / output / resize / close / kill。
- disconnect / exited / error 状态。
- cwd/root guard。
- shell allowlist。
- 多终端 Tab 可以作为基础能力，但不做 split/group。
- xterm theme adapter 使用 Tracevane Aurora token。
```

M5 不做：

```txt
- terminal split/group。
- Panel right placement。
- Terminal View 全局 docking / View Movement。
- LSP。
- Git。
- Debug。
- Problems / Output 数据接入。
- watcher。
- 插件市场。
- 完整 VS Code terminal behavior。
```

## 5. M5-B 推荐实现顺序

### 5.1 后端安全边界优先

1. 在现有 `apps/api/modules/terminal/service.ts` 上增加 IDE launch contract：`rootId/workspaceId`、relative `cwd`、profile/shell、初始 cols/rows。
2. 复用或抽出 Files service root guard：保持 `resolveRoot` / `resolveTargetPath` / `isWithinRoot` 等语义，不把 terminal cwd 交给任意绝对路径。
3. 增加 shell allowlist/profile：默认只允许安全配置中的 shell，拒绝未知 shell。
4. 明确 session status：connecting/running/exited/error/disconnected，并把 close/kill 与 PTY 退出区分清楚。
5. 保留现有 descriptor/ledger 用于状态和最小追踪，但不要默认长期记录完整敏感输出。

### 5.2 前端 Terminal Panel 最小接入

1. 新增 `apps/web/src/features/ide-workbench/terminal/TerminalPanel.tsx`。
2. 新增薄客户端：create/connect/input/resize/close，不拥有 PTY 语义。
3. 新增 `XtermHost`，只负责 xterm mount/dispose、input/output、fit、theme。
4. 在 `IdeWorkbenchPage.tsx` 的 Terminal tab 内替换 M4 placeholder；Problems/Output/Debug Console 仍保留 placeholder。
5. 多终端 Tab 可先是 flat sessions + activeSessionId；不要实现 split/group。

### 5.3 验证切片

建议新增最小验证：

```bash
npm run typecheck:web
npm run smoke:ide:workbench-layout
# 新增或临时运行 terminal smoke：
# - 创建 session
# - 读取初始输出
# - 输入 echo 命令并看到输出
# - resize
# - close/kill
# - 非法 cwd 被拒
# - 非白名单 shell 被拒

git diff --check
```

若 M5-B 暂时无法稳定自动化 PTY smoke，必须至少提供本地 manual verification 步骤和后端单点脚本，并把未自动化原因写进报告。

## 6. 风险与防偏移

| 风险 | 防线 |
|---|---|
| 复写第二套 TerminalGateway | 复用 `apps/api/modules/terminal`，必要时薄 refactor，不新建平行 API。 |
| cwd 可逃逸 workspace | terminal launch 必须经过 Files root guard 语义，不接受未经校验的绝对路径。 |
| shell 任意执行 | 加 shell allowlist/profile，拒绝未知 shell。 |
| xterm 主题割裂 | 用 `theme.css` / Aurora token 派生 XtermThemeAdapter。 |
| 一次做 split/group/docking | M5 只做基础 session + 可选 tabs；split/group 放 M5.x。 |
| Terminal 影响 Problems/Output/Debug | 只替换 Terminal tab 内容，其他 Panel tab 仍保持 M4 placeholder。 |
