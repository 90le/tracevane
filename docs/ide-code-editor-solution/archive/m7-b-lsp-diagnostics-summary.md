# M7-B：单语言 LSP diagnostics -> Problems 验收总结

更新时间：2026-07-06

## 完成口径

M7-B 已完成一个低风险、可替换的 LSP diagnostics 最小闭环：

- 后端新增 `apps/api/modules/lsp`，提供 JSON diagnostics provider。
- 后端暴露：
  - `GET /api/lsp/status`
  - `POST /api/lsp/diagnostics`
  - `WS /ws/lsp` one-shot diagnostics gateway foundation
- 后端 diagnostics 入口复用 Files root/path guard，诊断路径必须解析到现有 workspace 文件。
- 前端 IDE Editor 在 Monaco 文本文件打开和内容变化时触发 diagnostics。
- diagnostics 写入既有 M6 Problems store，source 为 `lsp`。
- LSP lifecycle/error 写入既有 Output store 的 `LSP` channel。
- 点击 Problems 行继续复用 M6 `onOpenProblem`，打开并 reveal IDE Editor。
- 新增 smoke：`npm run smoke:ide:lsp-diagnostics`。

## 单语言选择

本阶段选择 JSON：

- 不新增语言服务器依赖。
- 能覆盖语法错误 diagnostics、位置映射、Problems 写入、Output lifecycle、编辑器 reveal 的完整通路。
- 后续 M7-C/M7.x 可把 provider 从内置 JSON parse 替换或扩展为真实外部 language server/client 协议，而不改变 Problems/Output/Editor 的承载边界。

## 明确未做

M7-B 不做：

- hover / completion / definition / references / rename symbol。
- 多语言 LSP。
- 外部 language server 安装、进程池、重启策略。
- Git status/diff/stage/commit。
- Debug / DAP。
- 完整 VS Code LSP 行为。
- 新 Problems、Output、Files API。

## 验证

本阶段验证命令：

```bash
npm run typecheck:web -- --pretty false
npm run typecheck -- --pretty false
npm run smoke:ide:lsp-diagnostics
npm run smoke:ide:problems-output
git diff --check
```

## 下一步

下一阶段建议进入 M7-C：LSP hover / completion / definition foundation。M7-C 仍应基于 M7-B 的 diagnostics bridge 与 M6 Problems/Output，不应跳到 Git 或 Debug，也不应一次性追完整 VS Code LSP。
