# M7-F Debug Foundation Execution Summary

M7-F Debug foundation 已完成阶段性验收收口。该阶段从 DAP 研究开始，按最小可验证切片推进到 Debug Gateway skeleton、Run and Debug View、source breakpoint、editor reveal、Debug Console Output channel，以及 `node-lite` 最小真实 adapter proof。

## 阶段完成口径

### M7-F-A：Debug Adapter Protocol 研究与最小实现计划

已完成：

- 查证 DAP 官方协议和核心生命周期术语。
- 探查后端现状：此前没有 Debug service；terminal/lsp WebSocket 与 Files root guard 可作为实现参考。
- 探查前端现状：已有 Run Activity placeholder、Debug Console placeholder、Problems/Output、EditorDock 和 editor reveal 基础。
- 明确先做 Debug Gateway skeleton + Debug View shell，不直接接完整真实 adapter。

### M7-F-B：Debug Gateway skeleton + Debug View shell

已完成：

- 新增 Debug service/routes/types。
- 注册 `/api/debug/status`、`/api/debug/sessions`、`/api/debug/sessions/stop` 与 `/ws/debug`。
- Debug Gateway 支持 mock/noop provider、session list/create/stop 和 ready/status/session/output/stopped/terminated/error 事件。
- create session 复用 Files root guard 语义校验 rootId/cwd，并通过 allowlist 只接受早期 mock profile。
- 前端启用 Run and Debug Activity、Debug View、Debug Gateway Bridge 与 Debug Console panel。
- Debug Console 写入既有 Output store 的 `debug` channel，不新建第二套 Output 系统。
- 新增 `smoke:ide:debug-foundation`。

### M7-F-C：Breakpoints + editor reveal foundation

已完成：

- Debug 类型新增 source location / breakpoint location。
- Debug create session 可接收 breakpoints，并在最小 mock flow 中停在启用断点。
- Debug stopped event 携带 rootId/path/line/column。
- Debug store 维护 breakpoints 与 active stopped location。
- Debug View 展示 breakpoint list，支持打开、启用/禁用、删除。
- Monaco gutter / line number 点击可切换当前文件断点。
- stopped event 复用既有 IDE Editor openFilePath + reveal。
- 新增 `smoke:ide:debug-breakpoints`。

### M7-F-D：最小真实 adapter proof

已完成：

- Debug profile 新增 `node-lite` adapter-proof。
- `node-lite` 要求受 Files root guard 保护的 `program`，并限制 JavaScript / TypeScript 源文件扩展。
- create session 根据 program 内启用断点生成 stopped source location。
- Debug Gateway 新增 `stackTrace` / `variables` 事件。
- Debug store 按 session 保存 call stack 与 variables。
- Debug View 可从当前活动编辑器文件启动 Node Lite Adapter Proof。
- Debug View 展示 session profile、program、Call Stack、Variables。
- stopped location 继续复用 IDE Editor openFilePath + reveal。
- 新增 `smoke:ide:debug-adapter-proof`。

## 当前 Debug 能力边界

当前 Debug 能力可用于验证 Tracevane IDE 的 Debug 基础链路：

```txt
Debug View -> Debug Gateway -> guarded session create
source breakpoint -> stopped source location -> editor reveal
Debug Gateway event -> store -> Run and Debug UI / Debug Console Output
node-lite adapter proof -> stackTrace / variables -> UI 展示
```

当前 Debug 不宣称：

- 完整 DAP lifecycle。
- 真实 Node inspector adapter。
- `launch.json` 解析或配置 UI。
- 多语言 adapter。
- continue / pause / step over / step in / step out。
- threads / scopes 完整展开。
- 条件断点、日志断点、hit count。
- Watch expressions。
- evaluate。
- Debug Console REPL。
- Remote attach。
- Compound debug。
- 完整 VS Code Debug 行为。

## 架构边界

- Debug 继续复用 `apps/api/modules/debug`，不新增第二套 Debug API。
- Debug `program` / `cwd` 继续复用 Files root guard 语义，禁止路径逃逸。
- Debug Console 继续写入既有 Output `debug` channel，不新建第二套 Output 系统。
- stopped location 继续复用 IDE Editor open/reveal，不让 Debug Gateway 拥有 Editor 或 Monaco 生命周期。
- Terminal 仍只负责终端 UI/PTY，不承担 Debug Adapter 执行职责。
- LSP/Git/Problems/Output 的现有边界不因 Debug 收口改变。

## 验收证据

M7-F 阶段已有验证命令：

- `npm run smoke:ide:debug-foundation`
- `npm run smoke:ide:debug-breakpoints`
- `npm run smoke:ide:debug-adapter-proof`
- `npm run typecheck:api -- --pretty false`
- `npm run typecheck:web -- --pretty false`
- `git diff --check`

M7-F-E 为文档/验收收口阶段，本次验证要求：

- `git diff --check`
- 本次 touched docs 的 Markdown 相对链接检查

## 下一步：M7.x Debug hardening

建议 M7.x 继续按小切片推进，避免一次追完整 VS Code：

1. Debug adapter lifecycle hardening：initialize / launch / configurationDone / terminate/disconnect 状态更完整。
2. Launch profile / config foundation：最小 `launch.json` 或 UI profile，不默认启用危险配置。
3. Real Node inspector adapter：在受 root guard 与 profile allowlist 保护下接入真实 Node debug。
4. Execution controls：continue / pause / step over / step in / step out。
5. Stack/scopes/variables expansion：从当前 proof 数据升级为可展开 scopes。
6. Watch / evaluate / Debug Console REPL：明确权限、输出保留和敏感数据边界后再接。
7. Remote attach / compound debug：最后阶段，需单独安全设计和验收。
