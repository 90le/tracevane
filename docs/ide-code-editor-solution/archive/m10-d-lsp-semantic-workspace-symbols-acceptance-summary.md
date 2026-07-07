# M10-D LSP Semantic / Workspace Symbols Acceptance Closeout

## 状态

已完成。M10-D 是文档与验收收口阶段，不新增 runtime 功能；它把 M10-A 计划、M10-B semantic tokens guarded implementation、M10-C workspace symbols foundation 合并为一个稳定的 LSP language-intelligence 基线。

## M10 最终完成口径

M10-A / M10-B / M10-C 的最终边界如下：

- M10-A：完成 semantic tokens / workspace symbols 研究、边界和最小实现计划。
- M10-B：完成 TypeScript / JavaScript semantic tokens guarded implementation。
- M10-C：完成 TypeScript / JavaScript workspace symbols foundation。
- M10-D：完成 M10 总体验收口径、后置边界和下一阶段入口收口。

当前能力：

- semantic tokens：
  - `types/lsp.ts` 暴露 semantic tokens request/response 和 legend contract。
  - `apps/api/modules/lsp` 通过现有 LSP service 提供 `POST /api/lsp/semantic-tokens` 与 `/ws/lsp` `semanticTokens` message。
  - IDE Monaco provider 注册 document semantic tokens provider，失败时不破坏 Monaco 基础 syntax highlighting。
- workspace symbols：
  - `types/lsp.ts` 暴露 workspace symbols request/response、symbol item、location 和 scan metadata contract。
  - `apps/api/modules/lsp` 通过现有 LSP service 提供 `POST /api/lsp/workspace-symbols` 与 `/ws/lsp` `workspaceSymbols` message。
  - IDE Search View 提供“文件/内容 / 符号”模式，符号结果复用 IDE Editor open/reveal。
- 安全与边界：
  - 复用 Files root/path/directory guard。
  - 不接收任意 host path。
  - semantic tokens 有 file length / token count 上限。
  - workspace symbols 有 query length、result count、scan file count、单文件大小、隐藏文件、排除目录和 symlink 跳过边界。

## 验收证据

M10-B / M10-C 实现阶段已通过：

- `npm run typecheck:api -- --pretty false`
- `npm run typecheck:web -- --pretty false`
- `npm run build:api`
- `npm run smoke:ide:lsp-semantic-tokens`
- `npm run smoke:ide:lsp-workspace-symbols`
- `git diff --check`
- touched docs Markdown relative link check

M10-D 收口阶段验证：

- touched docs Markdown relative link check
- `git diff --check`

## 明确后置

M10 不做、且继续后置：

- 完整 `tsserver` / `typescript-language-server` 长驻进程。
- watcher-backed symbol index / background indexing daemon。
- 全语言 semantic tokens / workspace symbols。
- AI semantic search。
- 完整 Command Palette / VS Code “Go to Symbol in Workspace” parity。
- File Manager Online Editor 产品壳变更。
- Git force push / merge / rebase 等高风险写操作。
- 更完整 Debug Adapter Protocol parity。
- Terminal 新能力。

## 下一步

下一阶段建议为 **M11-A：post-M10 IDE intelligence roadmap and release gate plan**。

M11-A 不应直接扩 runtime；它应先排序和决策：

1. 是否先做 Command Palette / Go to Symbol UX shell。
2. 是否需要 watcher-backed symbol index，及其与 M6 watcher/search 的复用边界。
3. 是否推进更多语言 LSP，及每种语言的 provider/依赖/安全边界。
4. 是否先做 post-M10 release gate，确保 M8 RC matrix 与 M10 新能力组合稳定。
5. Git/Debug parity 与语言智能路线的优先级如何排序，避免多条高风险线同时扩张。
