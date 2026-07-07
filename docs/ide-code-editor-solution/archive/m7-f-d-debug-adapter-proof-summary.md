# M7-F-D Debug Adapter Proof Summary

M7-F-D 已完成最小真实 adapter proof。该阶段目标不是实现完整 VS Code Debug 或完整 Debug Adapter Protocol，而是在现有 Debug Gateway / Debug View / Debug Console / Monaco reveal 基础上证明：受保护的 `program` 输入、source breakpoint、stopped source location、stack trace 和 variables 可以形成一条可验证闭环。

## 已完成

- 后端 Debug service 保持现有 `/api/debug/*` 与 `/ws/debug`，未新增第二套 Debug API。
- 新增 `node-lite` profile，作为 `adapter-proof` 类型的最小调试配置。
- `node-lite` 要求传入受 Files root guard 约束的 `program`，只接受 JavaScript / TypeScript 源文件扩展。
- create session 会根据当前 program 的启用断点计算 stopped location；无匹配断点时停在入口行。
- Debug Gateway 事件新增：
  - `stackTrace`
  - `variables`
- 前端 Debug store 保存每个 session 的 stack frames 与 variables。
- Run and Debug View 支持从当前活动编辑器文件启动 `Node Lite Adapter Proof`。
- Debug View 展示 session profile、program、Call Stack 与 Variables。
- stopped location 继续复用 IDE Editor 的打开与 reveal 逻辑。
- Debug Console 继续写入既有 Output `debug` channel，不新建第二套 Output 系统。
- 新增 `smoke:ide:debug-adapter-proof`，覆盖 API guard、UI 启动、breakpoint、stack、variables、console 与 editor reveal。

## 明确保留边界

M7-F-D 不做：

- 完整 DAP initialize / launch / configurationDone / threads / scopes / continue / step 生命周期。
- `launch.json` 解析或配置 UI。
- 多语言 adapter 或真实 Node inspector adapter。
- 条件断点、日志断点、hit count。
- Watch expressions、evaluate、Debug Console REPL。
- Remote attach、compound debug、多进程 debug。
- 完整 VS Code Debug 行为。

## 验收命令

- `npm run typecheck:api -- --pretty false`
- `npm run typecheck:web -- --pretty false`
- `npm run smoke:ide:debug-foundation`
- `npm run smoke:ide:debug-breakpoints`
- `npm run smoke:ide:debug-adapter-proof`
- `git diff --check`

## 下一步

M7-F-E：Debug acceptance closeout。

建议只做文档、验收与阶段边界收口：更新 M7-F-A/B/C/D 的完成口径，确认 Debug 当前能力边界，并把完整 DAP lifecycle、真实 adapter、watch/evaluate/REPL、remote attach 等移入 M7.x Debug hardening。
