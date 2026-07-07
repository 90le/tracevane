# M7.x-E Debug Controls / Scopes Foundation 验收总结

## 完成口径

M7.x-E 已完成 Debug controls / scopes 的最小基础闭环。该阶段继续复用既有 Debug Gateway、Debug View、Debug Console Output channel、breakpoint/editor reveal 和 M7.x-C/M7.x-D launch profile 能力；只做受控命令与 Scopes 呈现基础，不追完整 VS Code Debug。

已完成：

```txt
- 新增 DebugControlAction / DebugControlSessionRequest 类型。
- 后端新增 /api/debug/sessions/control，支持 continue / pause / stepOver / stepInto / stepOut 的受控 lifecycle proof。
- Debug Gateway 支持 control client event。
- Debug status 增加 debug-control-commands 与 debug-scopes feature。
- adapter proof / node-inspector-lite create session 会发出 scopes event。
- 前端 Debug client/store 支持 control session 与 scopesBySessionId。
- Debug View 增加继续、暂停、跳过、进入、跳出按钮。
- Debug View 增加 Scopes 分组：Local / Launch / Adapter，同时保留 Raw Variables 兼容既有验证。
- 新增 smoke:ide:debug-controls-scopes。
```

## 关键边界

```txt
- continue/pause/step* 目前是 Debug Gateway 的确定性 lifecycle/control proof，不是完整真实 DAP 执行控制。
- stepOver/stepInto/stepOut 只推进现有 active location proof，供 UI / store / Output / editor reveal 链路验收。
- continue 将 session 置为 running；pause 可将 running session 回到 stopped；stop/terminate 仍复用既有 stop flow。
- Scopes 是现有 variables 的结构化分组，不实现 lazy variablesReference 请求、分页、watch 或 evaluate。
- 不新增第二套 Debug API；只扩展既有 apps/api/modules/debug 与 apps/web Debug shell。
```

## 已知未做 / 后置

```txt
- 不做完整 VS Code Debug Adapter Protocol。
- 不做真实 Node inspector 长生命周期 continue/pause/step 控制。
- 不做 Debug Console REPL。
- 不做 watch expressions。
- 不做 evaluate。
- 不做 scopes lazy loading、variablesReference 请求、变量编辑或大对象展开。
- 不做 attach/remote debug、compound debug、preLaunchTask、launch.json 完整兼容或 sourcemap。
```

## 验证

```txt
npm run typecheck:api -- --pretty false
npm run typecheck:web -- --pretty false
npm run smoke:ide:debug-controls-scopes
npm run smoke:ide:debug-launch-profile
npm run smoke:ide:debug-node-inspector
npm run smoke:ide:debug-lifecycle
git diff --check
```

## 下一步入口

下一阶段建议进入 **M7.x-F Debug Console watch / evaluate foundation**：先设计并实现受控的只读 evaluate/watch proof，继续复用 Debug Gateway、Scopes/Variables、Output debug channel，并明确不直接追完整 Debug Console REPL 或多 adapter 复杂行为。
