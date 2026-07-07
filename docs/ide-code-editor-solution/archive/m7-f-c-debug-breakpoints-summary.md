# M7-F-C Breakpoints + Editor Reveal Foundation 总结

## 状态

已完成。

M7-F-C 在 M7-F-B Debug Gateway skeleton + Debug View shell 之后，补齐 Debug 断点状态、Monaco gutter 联动、Debug View breakpoint list 和 mock stopped 后打开/定位 editor 行的最小闭环。当前仍是 mock provider，不接真实 Debug Adapter 进程。

## 完成内容

### Debug 类型与 Gateway

- `types/debug.ts` 新增 `DebugSourceLocation` 与 `DebugBreakpointLocation`。
- Debug session descriptor 支持 `activeLocation`。
- create session 请求可携带 `breakpoints`。
- 后端 `apps/api/modules/debug/service.ts` 继续复用现有 Debug service/routes，不新增第二套 Debug API。
- mock provider 会校验 breakpoint 的 `rootId/path/lineNumber`，并复用 Files root/path guard 语义防止路径逃逸。
- mock session 会停在第一个启用断点，并通过 `stopped` event 携带 source location。

### 前端 Debug state 与 Debug View

- `debugStore` 增加 breakpoints 列表与 `activeStoppedLocation`。
- 支持 toggle / enable-disable / remove breakpoint。
- `DebugView` 展示 Breakpoints 列表，可打开断点位置、启用/禁用、删除。
- `DebugView` 启动 mock session 时把当前启用断点传给 Debug Gateway。
- Debug stopped event 继续写入 Debug Console 与 Output 的 `debug` channel，不新建第二套 Output 系统。

### Monaco gutter 与 editor reveal

- `CodeEditor` 支持 `debugBreakpoints`、`debugStoppedLine` 与 `onGutterLineClick`。
- Monaco gutter / line number 点击可切换当前文件断点。
- 断点和当前停止行使用 Aurora token 映射的 Monaco decoration，不硬编码 VS Code 默认色。
- `IdeEditorFilePanel` 将当前文件断点传入 Monaco，并暴露 smoke data attributes。
- `IdeWorkbenchPage` 监听 `activeStoppedLocation`，复用既有 `openFilePath(..., reveal)` 打开并定位文件行。

### 验证

- 新增 `tests/ide-workbench/ide-debug-breakpoints.smoke.mjs`。
- 新增 `npm run smoke:ide:debug-breakpoints`。
- smoke 覆盖：
  - Debug API create session 接收 breakpoint location 并返回 activeLocation。
  - IDE 预打开 Monaco 文件。
  - gutter 点击添加断点。
  - Debug View 显示 breakpoint list。
  - 启动 mock session 后 stopped at breakpoint。
  - editor panel reveal 当前停止行。
  - Debug Console 显示 breakpoint stopped event。

## 明确未做

M7-F-C 不做：

- 真实 Debug Adapter 进程。
- 完整 DAP initialize / launch / attach / setBreakpoints / configurationDone / threads / stackTrace / scopes / variables / evaluate。
- `launch.json` 解析。
- 多语言 adapter。
- remote attach / compound debug。
- 条件断点、日志断点、hit count。
- Watch expressions。
- Debug Console REPL。
- 完整 VS Code Debug 行为。

## 下一步

下一阶段建议进入 M7-F-D：最小真实 adapter proof。

M7-F-D 应继续保持小切片：选择一个最小 mock/Node adapter proof，证明 Debug Gateway 可以桥接 adapter lifecycle、setBreakpoints、stopped、stack/variables 的最小数据流；不要一次性追完整 VS Code Debug。
