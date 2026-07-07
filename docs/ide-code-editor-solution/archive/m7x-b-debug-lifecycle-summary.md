# M7.x-B Debug Lifecycle Foundation Summary

M7.x-B 已完成 Debug lifecycle foundation。该阶段目标是把 M7-F 的 Debug proof flow 收紧为明确的 session lifecycle 状态机和可见事件反馈；不接真实 Node inspector、不做 launch.json、不做 step/watch/evaluate。

## 已完成

- `DebugSessionState` 扩展为可表达 lifecycle 的状态：
  - `created`
  - `initializing`
  - `configured`
  - `running`
  - `stopped`
  - `terminating`
  - `terminated`
  - `disconnected`
  - `error`
- 新增 `DebugLifecycleEventKind` 与 Debug Gateway `lifecycle` event。
- Debug status features 新增：
  - `lifecycle-events`
  - `session-state-machine`
- `createSession` 在保持 HTTP 返回最终 stopped session 的同时，按顺序发出：
  - `created`
  - `initialized`
  - `configured`
  - `running`
  - `stopped`
- `stopSession` 在保持 HTTP 返回最终 terminated session 的同时，按顺序发出：
  - `terminating`
  - `terminated`
- Debug session descriptor 增加：
  - `lifecycleEvent`
  - `terminationReason`
  - `lastError`
- 前端 Debug store 处理 `lifecycle` event，并写入既有 Output `debug` channel。
- Debug View 展示 session lifecycle、termination reason、last error。
- Stop 按钮避免对 `terminating` / `terminated` / `disconnected` session 重复操作。
- 新增 `smoke:ide:debug-lifecycle`，覆盖 API features、HTTP lifecycle 字段、UI lifecycle console、session lifecycle 展示和 stop/terminate flow。

## 保留边界

M7.x-B 不做：

- 真实 Node inspector adapter。
- 完整 DAP lifecycle parity。
- `launch.json` 或完整 profile/config UI。
- continue / pause / step over / step in / step out。
- threads / scopes / variables paging。
- Watch expressions。
- evaluate。
- Debug Console REPL。
- Remote attach。
- Compound debug。
- 多语言 adapter。
- 第二套 Debug / Output / Files API。

## 架构边界

- Debug lifecycle 继续在 `apps/api/modules/debug` 内演进，不新增第二套 Debug API。
- Debug Console 继续复用 Output `debug` channel。
- stopped location 继续复用 IDE Editor open/reveal。
- Debug service 不拥有 Monaco model 或 Editor lifecycle。
- Program/cwd 安全仍依赖 Files root guard。
- Terminal / LSP / Git / Problems / Output 现有边界未改变。

## 验收命令

- `npm run typecheck:api -- --pretty false`
- `npm run typecheck:web -- --pretty false`
- `npm run smoke:ide:debug-foundation`
- `npm run smoke:ide:debug-breakpoints`
- `npm run smoke:ide:debug-adapter-proof`
- `npm run smoke:ide:debug-lifecycle`
- `git diff --check`

## 下一步

M7.x-C：Launch profile / config foundation。

建议先做最小、受控的 profile/config schema：

- `DebugLaunchProfile` / `DebugLaunchRequest` 稳定字段。
- profile allowlist。
- program/cwd/args/env 的安全校验。
- 最小 UI profile 选择。
- 可选 workspace config 探查，但不直接追完整 VS Code `launch.json`。
