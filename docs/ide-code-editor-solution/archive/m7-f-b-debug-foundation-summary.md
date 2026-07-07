# M7-F-B Debug Gateway Skeleton + Debug View Shell 总结

## 状态

已完成。

M7-F-B 在 M7-F-A Debug Adapter Protocol 研究与最小实现计划之后，先建立 Tracevane IDE Debug 的最小前后端闭环：后端 Debug Gateway skeleton、Run and Debug 侧栏、Debug Console 面板和 smoke 验证。当前阶段仍是 mock/noop provider，不接真实语言调试适配器。

## 完成内容

### 后端 Debug Gateway skeleton

- 新增共享 Debug 类型：`types/debug.ts`。
- 新增 `apps/api/modules/debug/service.ts`：
  - 暴露 mock provider 状态。
  - 管理内存 Debug session descriptor。
  - 提供 `create / stop / list` 最小 lifecycle。
  - 通过 WebSocket `/ws/debug` 推送 ready/status/sessions/session/output/stopped/terminated/error 事件。
  - 复用 Files root guard 语义校验 `rootId + cwd`，禁止 cwd 逃逸 workspace。
  - 只允许 `mock-node` profile，拒绝未知 profile。
- 新增 `apps/api/modules/debug/routes.ts`：
  - `GET /api/debug/status`
  - `GET /api/debug/sessions`
  - `POST /api/debug/sessions`
  - `POST /api/debug/sessions/stop`
- 在 API context/router/server upgrade chain 中注册 Debug service、routes 和 WebSocket upgrade。

### 前端 Debug View / Debug Console shell

- 新增 `apps/web/src/lib/api/debug.ts`，复用现有 API client，不创建第二套 HTTP 客户端。
- 新增 `apps/web/src/features/ide-workbench/debug/`：
  - `DebugGatewayBridge.tsx`：建立 `/ws/debug` 连接并同步事件。
  - `DebugView.tsx`：启用 Run and Debug activity，提供 mock session start/stop 与 session list。
  - `DebugConsolePanel.tsx`：承载 Debug output/stopped/terminated 事件。
  - `debugStore.ts`：维护轻量 Debug snapshot 和 console events。
  - `debugClient.ts`：封装 Debug HTTP/WebSocket client。
- `Debug Console` 同步写入既有 Workbench Output store 的 `debug` channel，避免新建第二套 Output 通道系统。
- PanelArea 的 Debug Console placeholder 替换为真实 Debug Console shell。

### 验证

- 新增 `tests/ide-workbench/ide-debug-foundation.smoke.mjs`。
- 新增 `npm run smoke:ide:debug-foundation`。
- smoke 覆盖：
  - `/api/debug/status` 返回 mock provider。
  - 非法 cwd 被拒绝。
  - 非 allowlist profile 被拒绝。
  - `/ide` Run and Debug activity 可打开。
  - Debug Console panel 可见。
  - 启动 mock session 后出现 stopped session 与 console 输出。
  - stop 后 session 进入 terminated 并输出 terminated 事件。

## 明确未做

M7-F-B 不做：

- 真实 Debug Adapter 进程。
- 完整 DAP initialize / launch / attach / threads / stackTrace / scopes / variables / evaluate。
- `launch.json` 解析。
- 多语言 adapter。
- remote attach。
- compound debug。
- 断点持久化与真实 editor gutter breakpoint。
- watch expressions。
- Debug Console REPL。
- 完整 VS Code Debug 行为。

## 下一步

下一阶段建议进入 M7-F-C：Breakpoints + editor reveal foundation。

M7-F-C 应继续保持最小边界：先把 editor gutter/line breakpoint 状态、Debug View breakpoint list、session stopped reveal 当前行和 Problems/Output/Debug Console 的交互打通；仍不直接追完整真实 adapter。
