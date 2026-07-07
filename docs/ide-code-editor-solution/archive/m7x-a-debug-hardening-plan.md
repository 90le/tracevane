# M7.x-A Debug Hardening Plan

M7.x-A 是 M7-F Debug foundation 之后的实现前计划阶段。目标是把当前 `node-lite` adapter proof 推进为可持续扩展的 Debug hardening 路线，但仍不一次性追完整 VS Code Debug。

## 当前基线

已完成并可复用：

- Debug API / Gateway：`apps/api/modules/debug`。
- Debug WebSocket：`/ws/debug`。
- Debug View / Run and Debug Activity。
- Debug Console：复用既有 Output `debug` channel。
- Breakpoint store 与 Monaco line-number/gutter toggle。
- stopped location -> IDE Editor open/reveal。
- `node-lite` adapter proof：受 Files root guard 保护的 program、stackTrace、variables。
- Smoke：`smoke:ide:debug-foundation`、`smoke:ide:debug-breakpoints`、`smoke:ide:debug-adapter-proof`。

## M7.x 总体边界

M7.x 做 Debug hardening，但仍按小阶段推进。

M7.x 可以逐步做：

```txt
- 更完整的 Debug session lifecycle state machine。
- launch profile / launch config foundation。
- 真实 Node inspector adapter 的最小接入。
- continue / pause / step controls。
- threads / stack / scopes / variables 的增量展开。
- Watch / evaluate / Debug Console REPL 的受控接入。
- 更完整的 error / disconnect / terminate / restart 语义。
```

M7.x 不应一次性做：

```txt
- 完整 VS Code Debug parity。
- 任意外部 adapter 直接执行。
- 无 allowlist 的 shell/debug runtime。
- remote attach 默认开放。
- compound debug 默认开放。
- Debug Gateway 持有 Monaco model 或 Editor lifecycle。
- Debug Console 长期保存完整敏感输出。
- 第二套 Debug / Output / Files API。
```

## 推荐切片

### M7.x-B：Debug lifecycle foundation

目标：把当前 proof flow 收紧为明确 lifecycle 状态机，不接真实 Node inspector。

范围：

- session 状态从 `running/stopped/terminated` 扩展为更明确的内部状态：`created / initializing / configured / running / stopped / terminating / terminated / error / disconnected`。
- Gateway event 增加或规范化：`initialized`、`configured`、`continued`、`paused`、`terminated`、`exited`、`disconnect`、`error`。
- Stop/Terminate/Disconnect 语义区分清楚。
- Debug View 展示 session 状态、last error、termination reason。
- Output `debug` channel 记录 lifecycle event。
- Smoke 覆盖 start、stop、error、disconnect/reconnect 或至少 disconnect 状态不白屏。

不做：真实 adapter、launch.json、step controls、watch/evaluate/REPL。

### M7.x-C：Launch profile / config foundation

目标：从 hardcoded `node-lite` 过渡到可控 profile/config，不直接追完整 `launch.json`。

范围：

- 设计 `DebugLaunchProfile` / `DebugLaunchRequest` 的稳定字段。
- 支持最小 UI profile 选择。
- 可选读取 workspace 内受 guard 保护的 `.tracevane/launch.json` 或未来 `launch.json`，但第一版可以只做内部 profile schema。
- 校验 profile allowlist、program path、cwd、args 基础安全边界。
- 配置错误写入 Debug View + Output。

不做：完整 VS Code launch schema、remote attach、compound、preLaunchTask、envFile 全量语义。

### M7.x-D：Real Node inspector adapter minimal

目标：在受限 profile 下接入真实 Node inspector 或 Node debug adapter 的最小路径。

范围：

- 明确依赖和许可证，再决定是否引入 Node inspector/debug adapter 依赖。
- 后端执行受 root/cwd/profile guard 保护。
- 支持启动一个 Node script，命中 source breakpoint 并产生 stopped event。
- 继续复用 Debug Gateway / Debug View / Output / Editor reveal。
- Smoke 覆盖 guard、启动、断点、停止、terminate。

不做：多语言、remote attach、compound、完整 variable paging、REPL。

### M7.x-E：Execution controls foundation

目标：接入最小 continue / pause / step controls。

范围：

- Debug View 控制条支持 continue / pause / step over / step in / step out。
- Gateway command 与 event 状态明确。
- stopped/running 状态驱动按钮 disabled。
- Smoke 覆盖至少 continue -> stopped/terminated 之一。

不做：复杂多线程、多进程、conditional breakpoints。

### M7.x-F：Scopes / variables / watch / evaluate foundation

目标：把 M7-F-D 的 variables proof 升级为可展开、可评估的受控调试数据。

范围：

- Call Stack frame -> scopes -> variables 展开。
- Watch expression 最小新增/删除/刷新。
- Evaluate 使用 allowlist + session 状态限制，输出写入 Debug Console。
- 对敏感输出和大对象做 truncation / cap。

不做：完整 Debug Console REPL、side-effectful evaluate 默认开放、长期保存完整输出。

### M7.x-G：Debug acceptance closeout

目标：收口 M7.x，明确真实 Debug 当前能力和仍后置内容。

范围：

- 更新 `00/07/08`、`.codex/project-context.md` 和 archive summary。
- 汇总 smokes 与边界。
- 下一阶段再评估是否进入多语言 LSP/Git/Debug 增强或完整 IDE polish。

## 推荐 M7.x-B 最小实现顺序

1. 后端 types：补齐 lifecycle state / event 类型，但保持 API 兼容。
2. 后端 service：把当前 create/stop mock/proof flow 包进状态机。
3. Gateway：按状态发 normalized lifecycle events。
4. 前端 store：保存 session lifecycle、lastError、terminationReason。
5. Debug View：展示 lifecycle，并让 stop/disconnect/error 反馈明确。
6. Smoke：扩展或新增 `smoke:ide:debug-lifecycle`。

## 验收建议

M7.x-B 起的功能阶段建议运行：

- `npm run typecheck:api -- --pretty false`
- `npm run typecheck:web -- --pretty false`
- `npm run smoke:ide:debug-foundation`
- `npm run smoke:ide:debug-breakpoints`
- `npm run smoke:ide:debug-adapter-proof`
- 新增对应阶段 smoke，例如 `smoke:ide:debug-lifecycle`
- `git diff --check`

M7.x-A 本身为 docs-only plan，验证：

- `git diff --check`
- touched docs Markdown relative link check
