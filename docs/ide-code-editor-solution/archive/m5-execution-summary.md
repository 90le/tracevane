# M5 Real Terminal Foundation 执行总结

Status: Completed
Completed: 2026-07-02
Scope: M5-A / M5-B / M5-C
Next: M5.x Terminal Split / Group / Panel Placement

## 1. 完成状态

M5 已从“下一步 / 进行中”收口为 **已完成 Real Terminal Foundation**。本阶段完成的是独立 IDE Workbench 的真实终端基础：bottom Panel Terminal tab 内的最小真实 xterm + 后端 PTY session 生命周期、安全 cwd/root guard、shell/profile allowlist、resize、close/kill 和 smoke 验证闭环。

M5 不是完整 VS Code Terminal，也不表示 terminal split/group、右侧 Panel、全局 View Movement、LSP、Git、Debug、Problems 或 Output 已接入。

## 2. M5-A 完成内容

M5-A 完成研究、边界和最小实现计划，记录见 [`m5-a-terminal-foundation-plan.md`](./m5-a-terminal-foundation-plan.md)。主要结论：

- 当前已有 `apps/api/modules/terminal`，包含 service/routes/session descriptor/ledger/action catalog。
- 当前已有 `/ws/terminal` WebSocket upgrade 与 HTTP terminal routes。
- 当前已有 `@homebridge/node-pty-prebuilt-multiarch`、`ws`、`@xterm/xterm`、`@xterm/addon-fit` 等依赖。
- M5-B 应复用并加固现有 terminal module，不新建第二套 Terminal API。
- M5-B 必须补齐 IDE workspace rootId/cwd guard、shell allowlist、Workbench Terminal Panel xterm host、session lifecycle 和 smoke。

## 3. M5-B 完成内容

M5-B 完成最小真实终端实现，记录见 [`m5-b-terminal-foundation-summary.md`](./m5-b-terminal-foundation-summary.md)。已完成：

- Workbench bottom Panel 的 Terminal tab 接入真实 xterm UI。
- 前端 `XtermHost` 使用 `@xterm/xterm` + `FitAddon`，通过 `ResizeObserver` fit 并回传 rows/cols。
- xterm theme 从 Tracevane Aurora CSS variables 派生，不使用纯黑或 VS Code 默认色。
- 后端复用 `apps/api/modules/terminal`，不新建第二套 Terminal API。
- create session 输入支持 `rootId` / `workspaceId`、relative `cwd`、`shell`、`cols`、`rows`。
- cwd 在传入 root/workspace 时必须是相对路径，并复用 Files root guard 语义。
- shell/profile allowlist 拒绝未知 shell / profile。
- 支持 create / input / output / resize / close / kill 基础状态流。
- 新增 `smoke:ide:terminal-foundation`，覆盖真实输出、resize、close/kill、非法 cwd 拒绝、非白名单 shell 拒绝和 `/ide` Terminal tab UI。

## 4. 当前 Terminal 能力边界

M5 当前完成：

```txt
- bottom Panel Terminal tab。
- 单终端 session 基础。
- create / input / output。
- resize。
- close / kill。
- disconnect / exited / error 的基础状态呈现。
- cwd/root guard。
- shell/profile allowlist。
- smoke:ide:terminal-foundation。
```

## 5. 明确未做并后置

后置到 M5.x / M6 / M7：

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

## 6. 验收证据

M5-B 已运行：

```bash
npm run typecheck:web -- --pretty false
npm run typecheck:api -- --pretty false
TRACEVANE_WEB_PORT=5187 TRACEVANE_WEB_SMOKE_URL=http://127.0.0.1:5187 npm run smoke:ide:workbench-layout
TRACEVANE_WEB_PORT=5186 TRACEVANE_WEB_SMOKE_URL=http://127.0.0.1:5186 npm run smoke:ide:terminal-foundation
git diff --check
```

M5-C 文档收口验证：

```bash
git diff --check
# 本地 markdown 相对链接检查覆盖本次触达文档
```

## 7. 下一阶段入口

下一阶段建议进入 **M5.x Terminal Split / Group / Panel Placement**：

- terminal split right / split down。
- terminal group / pane model。
- terminal pane resize / focus / close。
- terminal layout persistence。
- Panel bottom/right placement。

M6 仍是 Watcher / Search / Problems / Output；M7 仍是 LSP / Git / Debug。
