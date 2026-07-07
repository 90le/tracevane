# M7.x Debug Hardening 总体验收总结

## 完成口径

M7.x 已完成 Debug hardening 的阶段性收口。该阶段从 M7-F 的 Debug skeleton / breakpoint / adapter proof 继续推进，但仍保持 Tracevane 的小切片边界：复用既有 Debug Gateway、Debug View、Debug Console Output channel、Files root guard、IDE Editor reveal 和 Problems/Output 基础，不追完整 VS Code Debug parity。

M7.x 已完成：

```txt
- M7.x-A：Debug hardening plan。
- M7.x-B：Debug lifecycle foundation。
- M7.x-C：Launch profile / config foundation。
- M7.x-D：Real Node inspector adapter minimal。
- M7.x-E：Debug controls / scopes foundation。
- M7.x-F：Debug Console watch / evaluate foundation。
```

当前 Debug 能力：

```txt
- Debug Gateway / HTTP routes / WebSocket gateway。
- Debug status、session list、create、stop、control、evaluate。
- normalized lifecycle：created / initializing / configured / running / stopped / terminating / terminated / disconnected / error。
- launch profile metadata 与 profile allowlist。
- mock-node、node-lite adapter-proof、node-inspector-lite 三类受控 profile。
- cwd/program/args/env 输入 guard：program/cwd 复用 Files root guard，args/env 有界校验，session 只暴露 envKeys。
- 本地 Node inspector proof：以 --inspect-brk=127.0.0.1:0 启动短生命周期 Node 进程并映射 pause/stack/variables。
- Debug View：Run and Debug Activity、launch profile UI、sessions、breakpoints、call stack、variables、scopes、continue/pause/step* controls。
- Monaco gutter breakpoint toggle 与 stopped location -> IDE Editor open/reveal。
- Debug Console：事件输出、evaluate、watch proof；输出继续写入既有 Output debug channel。
- Smokes 覆盖 Debug foundation、breakpoints、adapter proof、lifecycle、launch profile、node inspector、controls/scopes、watch/evaluate。
```

## 关键边界

```txt
- Debug Gateway 是 Debug runtime 边界，不拥有 Monaco model、Editor lifecycle、Terminal PTY、Git state 或 LSP state。
- Debug Console 复用既有 Output debug channel，不新建第二套 Output 系统。
- node-inspector-lite 是短生命周期 local proof，不是长生命周期完整 Node 调试会话。
- continue/pause/step* 是确定性 lifecycle/control proof，不是真实 Node inspector 长生命周期执行控制。
- scopes 是现有 variables 的结构化分组，不做 lazy variablesReference 请求。
- evaluate/watch 是白名单只读 proof，不执行用户代码，不触发运行时副作用。
- 不新增第二套 Debug / Files / Output API。
```

## 已知未做 / 后置

```txt
- 完整 VS Code Debug Adapter Protocol parity。
- 完整 Debug Console REPL。
- 真实 DAP evaluateRequest。
- 真实 Node inspector Runtime.evaluate。
- 长生命周期 Node inspector keep-alive 与真实 continue/pause/step。
- threads、多进程、多目标调试。
- watch expressions 自动刷新、禁用、删除、排序和复杂表达式管理。
- lazy variablesReference、变量分页、对象展开、变量编辑。
- conditional breakpoints、logpoints、hit count。
- launch.json 完整 schema 读取/写回。
- attach / remote attach / compound debug / preLaunchTask / postDebugTask。
- sourcemap、TypeScript transpile、worker/thread 多目标调试。
- 多语言 adapter marketplace 或外部 adapter 任意执行。
```

## 验证矩阵

M7.x 阶段累计使用并通过的代表性验证：

```txt
npm run typecheck:api -- --pretty false
npm run typecheck:web -- --pretty false
npm run smoke:ide:debug-foundation
npm run smoke:ide:debug-breakpoints
npm run smoke:ide:debug-adapter-proof
npm run smoke:ide:debug-lifecycle
npm run smoke:ide:debug-launch-profile
npm run smoke:ide:debug-node-inspector
npm run smoke:ide:debug-controls-scopes
npm run smoke:ide:debug-watch-evaluate
git diff --check
```

M7.x-G 本身为 docs/context closeout，验证：

```txt
touched docs Markdown relative link check
git diff --check
```

## 下一步入口

下一阶段建议进入 **M7.y-A LSP / Git / Debug integration hardening plan**。

目的不是立刻做大而全 IDE，而是基于 M7 已完成的 LSP/Git/Debug 各自基础能力，重新盘点剩余高价值增强，决定后续优先级：

```txt
- LSP：是否从 JSON 单语言扩展到 TypeScript/JavaScript 或多语言 gateway。
- Git：是否进入 pull/push/fetch/checkout/branch 创建/merge/rebase/stash 等危险操作前的安全设计。
- Debug：是否进入真实 DAP evaluate/watch auto refresh/attach/launch.json 或继续保持 proof 层。
- Cross-feature：Problems/Output/Editor reveal/StatusBar/Command menu 如何统一承载 LSP/Git/Debug 状态。
```

仍需遵守：先研究和边界确认，再小切片实现；不新增第二套 Files/Git/Debug/LSP API；不把 File Manager Online Editor 与 IDE Workbench 合并。
