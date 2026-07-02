# M5-B Real Terminal Foundation 最小真实终端实现总结

Status: Completed
Completed: 2026-07-02
Scope: M5-B minimal real terminal foundation
Next: M5-C / M5 docs acceptance, then M5.x Terminal Split / Group / Panel Placement

## 1. 完成内容

M5-B 在 M4 IDE Workbench 的 bottom Panel 内接入了最小真实 Terminal：后端复用现有 `apps/api/modules/terminal` PTY/session/WebSocket 能力，前端在 Workbench Terminal tab 内挂载 xterm。

本阶段仍然只做 Real Terminal Foundation，不做 terminal split/group、Panel right placement、Terminal View 全局 docking、LSP、Git、Debug、Problems/Output 数据接入、watcher 或插件市场。

## 2. 后端安全边界

后端没有新建第二套 Terminal API，而是在现有 terminal module 上收紧创建 session 输入：

- `TerminalGatewayAttachPayload` 增加 `rootId` / `workspaceId`、`shell`、`cols`、`rows`。
- Terminal cwd 在传入 root/workspace 时必须是相对路径；任意绝对路径会被拒绝。
- cwd 解析复用 Files service 的 root guard 语义，通过 `resolveFilesServiceDirectoryPath` 解析并确保目标目录在选定 root 内。
- shell 经过 allowlist/profile 校验；未知 profile 会被拒绝，已知 profile 保持兼容，shell basename 必须在 allowlist 中。
- 初始 cols/rows 会进入 `pty.spawn`，后续 resize 仍走现有 resize/control payload。

## 3. 前端 Terminal Panel

新增 `apps/web/src/features/ide-workbench/terminal`：

- `TerminalPanel.tsx`：Terminal tab 壳层，自动创建 local shell session、连接 WebSocket、处理状态与关闭。
- `TerminalTabs.tsx`：最小终端 tab/status/close UI。
- `XtermHost.tsx`：xterm mount/dispose、input/output、FitAddon、ResizeObserver。
- `terminalClient.ts`：create/end session 与 `/ws/terminal` URL 构造。
- `xtermTheme.ts`：从 Aurora CSS variables 派生 xterm theme。

`IdeWorkbenchPage.tsx` 只替换 PanelArea 的 Terminal tab 内容；Problems / Output / Debug Console 继续保持 placeholder，不接入真实数据。

## 4. 状态流与验证

M5-B 验证覆盖：

- create session。
- WebSocket attach。
- output 事件写入 xterm / direct smoke buffer。
- input 写入 PTY。
- resize control payload 与 HTTP resize。
- close/kill 经 `/api/terminal/end` 结束 PTY。
- 非法 absolute cwd 被拒。
- 非白名单 shell 被拒。
- `/ide` Workbench Terminal tab 可见、xterm 可见、resize 后无异常、关闭后状态明确。

新增脚本：

```bash
npm run smoke:ide:terminal-foundation
```

为避免本地已有 5176 dev server 干扰，IDE smoke 脚本支持 `TRACEVANE_WEB_PORT` / `TRACEVANE_WEB_SMOKE_URL` 覆盖端口；默认仍是 5176。

## 5. 明确未做

后置到 M5.x / M6 / M7：

- terminal split/group。
- Panel right placement。
- Terminal View 全局 docking / View Movement。
- Terminal 作为 editor-like tab。
- LSP。
- Git。
- Debug。
- Problems / Output 数据接入。
- watcher 外部变更监听。
- 插件市场。
- 完整 VS Code terminal behavior。
