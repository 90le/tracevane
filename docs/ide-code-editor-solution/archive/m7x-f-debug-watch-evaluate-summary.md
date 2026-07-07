# M7.x-F Debug Console Watch / Evaluate Foundation 验收总结

## 完成口径

M7.x-F 已完成 Debug Console watch / evaluate 的最小基础闭环。该阶段继续复用既有 Debug Gateway、Debug View、Debug Console Output channel、Scopes/Variables 和 M7.x launch profile / Node Lite 能力；只做受控只读 proof，不追完整 VS Code Debug Console REPL。

已完成：

```txt
- 新增 DebugEvaluateMode / DebugEvaluateRequest / DebugEvaluateResult / DebugEvaluatePayload 类型。
- 后端新增 /api/debug/sessions/evaluate，支持 mode=evaluate 与 mode=watch。
- Debug Gateway WebSocket 支持 evaluate client event，并广播 evaluation server event。
- Debug status 增加 debug-console-evaluate-proof 与 debug-watch-expressions-proof feature。
- 后端 evaluate 使用白名单只读表达式，不执行用户代码，不触发副作用。
- 支持 session.state、cwd、program、profileId、args.length、envKeys、lineNumber、activeLocation.path 等 proof 表达式。
- 前端 Debug client/store 支持 evaluate/watch result。
- Debug Console 增加表达式输入、求值、添加监视、Evaluate/Watch 结果区域。
- Debug Console evaluate/watch 输出同步写入既有 Output debug channel。
- 新增 smoke:ide:debug-watch-evaluate。
```

## 关键边界

```txt
- evaluate/watch 是 Debug Gateway 的安全只读 proof，不是完整 Debug Adapter Protocol evaluateRequest。
- 不执行任意 JavaScript，不访问真实运行时对象，不允许表达式产生副作用。
- watch expression 目前是用户触发的表达式快照/upsert，不实现每次 stop 自动刷新。
- Debug Console 不是 REPL；只用于验证 UI/store/API/output 链路和少量白名单调试元数据。
- 不新增第二套 Debug API；只扩展 apps/api/modules/debug 与 apps/web Debug shell。
```

## 已知未做 / 后置

```txt
- 不做完整 VS Code Debug Console REPL。
- 不做真实 DAP evaluateRequest。
- 不做真实 Node inspector Runtime.evaluate。
- 不做对象展开、variablesReference lazy loading、变量编辑或大对象分页。
- 不做 watch expressions 自动刷新、禁用/删除/排序或复杂表达式管理。
- 不做条件断点、日志断点、attach/remote debug、compound debug、preLaunchTask、launch.json 完整兼容或 sourcemap。
```

## 验证

```txt
npm run typecheck:api -- --pretty false
npm run typecheck:web -- --pretty false
npm run smoke:ide:debug-watch-evaluate
npm run smoke:ide:debug-controls-scopes
npm run smoke:ide:debug-node-inspector
npm run smoke:ide:debug-lifecycle
git diff --check
```

## 下一步入口

下一阶段建议进入 **M7.x-G Debug hardening acceptance closeout**：收口 M7.x Debug hardening 文档、统一 lifecycle/profile/node-inspector/control/scopes/evaluate/watch 完成口径，并决定后续是否继续做真实 DAP evaluate / watch auto refresh / attach / launch.json 等增强。
