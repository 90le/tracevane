# M7-C：LSP Hover / Completion / Definition Foundation 验收总结

更新时间：2026-07-06

## 完成口径

M7-C 已完成基于 M7-B LSP bridge 的单语言 JSON 交互能力最小闭环：

- 后端 `apps/api/modules/lsp` 扩展 JSON provider：
  - `POST /api/lsp/hover`
  - `POST /api/lsp/completion`
  - `POST /api/lsp/definition`
  - `WS /ws/lsp` 支持 `hover` / `completion` / `definition` message type
- 前端 `CodeEditor` 注册 Monaco JSON providers：
  - hover provider
  - completion item provider
  - definition provider
- provider 调用现有 `/api/lsp/*`，不在前端执行语言分析进程。
- provider 注册 lifecycle 写入既有 Output 的 `LSP` channel。
- 路径继续通过 Files root/path guard，不能绕过 workspace root。
- 新增 smoke：`npm run smoke:ide:lsp-interaction`。

## 单语言选择

M7-C 继续选择 JSON，原因与 M7-B 一致：

- 无需新增外部 language server 依赖。
- 能用较小实现验证 Monaco provider、后端 LSP feature endpoint、WebSocket gateway、Output lifecycle 与 IDE Editor 载体之间的边界。
- 后续可把 JSON 内置 provider 替换为真实 language-server-backed provider，而不重写 Monaco/Output/Problems 接入层。

## 明确未做

M7-C 不做：

- 多语言 LSP。
- 外部 language server 进程池、安装、重启或崩溃恢复。
- workspace/symbol、references、rename symbol、code action、formatting。
- Git status/diff/stage/commit。
- Debug / DAP。
- 完整 VS Code LSP 行为。
- 新 Problems、Output、Files API。

## 验证

本阶段验证命令：

```bash
npm run typecheck:web -- --pretty false
npm run typecheck -- --pretty false
TRACEVANE_WEB_PORT=5188 npm run smoke:ide:lsp-interaction
TRACEVANE_WEB_PORT=5188 npm run smoke:ide:lsp-diagnostics
git diff --check
```

说明：本机 5176 有长期运行的旧开发服务时，smoke 使用 5188 避免误连旧路由。

## 下一步

下一阶段建议进入 M7-D：Git status + Explorer decoration + Source Control View。Git 已在 M7-A 探查确认有后端 service/API 与前端 query hooks，应复用现有 Git 能力，不新建第二套 Git API。
