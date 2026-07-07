# M7.x-D Real Node Inspector Adapter Minimal 验收总结

## 完成口径

M7.x-D 已完成 Debug Gateway 上的最小真实 Node inspector 适配证明。该阶段仍然保持 Debug hardening 的“小步闭环”边界：只证明 Tracevane 可以在受控 workspace 内启动本地 Node 程序、连接 Node inspector protocol、命中断点并把结果映射回现有 Debug View / Output / editor reveal 基础，不追完整 VS Code Debug。

已完成：

```txt
- 新增 node-inspector-lite Debug launch profile。
- create debug session 可通过 rootId/cwd/program/args/env 启动受 Files root guard 约束的本地 Node 程序。
- Node 进程使用 --inspect-brk=127.0.0.1:0 暴露临时 inspector WebSocket，只监听本机 loopback。
- Debug service 连接 Node inspector protocol，执行 Runtime.enable / Debugger.enable / Debugger.setBreakpointByUrl / Runtime.runIfWaitingForDebugger。
- 支持从既有 breakpoint model 设置当前 program 的断点。
- 捕获 Debugger.paused 后映射 activeLocation、stackTrace 与 variables 事件。
- Debug View 可显示 node-inspector-lite stopped session、stack frame、adapter/inspector/args/envKeys variables。
- Debug Output channel 记录 Node Inspector Lite lifecycle/output。
- 新增 smoke:ide:debug-node-inspector。
```

## 关键实现边界

```txt
- 复用 apps/api/modules/debug 现有 Debug Gateway、routes、session lifecycle 和 frontend Debug View。
- 复用 M7.x-C launch profile validation：program/cwd/args/env 仍由 profile 约束。
- program 继续通过 Files root/path guard 解析；不接受任意绝对路径。
- env 只持有当前 launch 的 string key/value，session descriptor 只暴露 envKeys，不长期保存 secret value。
- Node inspector 子进程是短生命周期 proof：创建 session 完成后即 cleanup/kill，不保留长时间运行的真实 debug process。
```

## 已知未做 / 后置

```txt
- 不做完整 VS Code Debug Adapter Protocol。
- 不做完整 Node debug session keep-alive。
- 不做 continue / pause / step over / step into / step out 控制。
- 不做 scopes/variables 分页、watch、evaluate、Debug Console REPL。
- 不做 attach、remote debug、compound debug、preLaunchTask、postDebugTask。
- 不做 launch.json 文件读取/写回。
- 不做 sourcemap、TypeScript transpile、worker/thread 多目标调试。
- 不做 LSP/Git 与 Debug 的深度联动。
```

## 验证

```txt
npm run typecheck:api -- --pretty false
npm run typecheck:web -- --pretty false
npm run smoke:ide:debug-node-inspector
npm run smoke:ide:debug-foundation
npm run smoke:ide:debug-breakpoints
npm run smoke:ide:debug-adapter-proof
npm run smoke:ide:debug-lifecycle
npm run smoke:ide:debug-launch-profile
git diff --check
```

## 下一步入口

下一阶段建议进入 **M7.x-E Debug controls / scopes foundation**：在现有 mock / adapter-proof / node-inspector-lite 边界上，先补最小 Debug 控制按钮、变量/Scopes 呈现和 Debug Console 边界设计。仍然不要直接追完整 VS Code Debug 行为。
