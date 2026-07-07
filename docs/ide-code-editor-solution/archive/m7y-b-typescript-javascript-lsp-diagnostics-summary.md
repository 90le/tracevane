# M7.y-B TypeScript / JavaScript LSP Diagnostics Foundation Summary

## 1. 完成状态

M7.y-B 已完成：TypeScript / JavaScript diagnostics foundation 已接入既有 LSP diagnostics 链路。

本阶段不是完整 TypeScript language server，也不是完整 VS Code LSP parity；它是在现有 `apps/api/modules/lsp` 基础上增加一个安全、可验证的 TS/JS diagnostics provider proof，让 IDE 打开 TS/JS/TSX/JSX 文件后能够把基础编译诊断写入 Problems / Output / editor reveal 既有链路。

## 2. 实现内容

### 后端 LSP service

修改 `apps/api/modules/lsp/service.ts`：

- `getStatus()` provider 从单一 `json` 扩展为 `tracevane-lsp`。
- `supportedLanguages` 增加：
  - `typescript`
  - `typescriptreact`
  - `javascript`
  - `javascriptreact`
- `/api/lsp/diagnostics` 与 `/ws/lsp` 的 diagnose 继续复用同一 `diagnoseDocument` 入口。
- JSON diagnostics 保持原有行为。
- TS/JS diagnostics 使用项目已安装的 `typescript` package，不新增依赖。
- TS/JS diagnostics 继续复用 Files root/path guard：请求路径必须解析为既有 workspace 文件，不接受任意宿主机路径。
- 使用 TypeScript Compiler API 对当前 editor model 内容创建 in-memory `SourceFile`，并返回当前文件的 `TSxxxx` diagnostics。

### 前端 Problems / Output

修改 `apps/web/src/features/ide-workbench/lsp/useLspDiagnostics.ts`：

- Problems 写入仍使用既有 `replaceWorkbenchProblemsForFileSource`。
- Output LSP channel 的 ready 文案从固定 `JSON diagnostics active` 改为按语言显示：
  - `JSON diagnostics active`
  - `TypeScript diagnostics active`
  - `JavaScript diagnostics active`

### 类型边界

修改 `types/lsp.ts`：

- `LspDiagnosticsResponse.provider` 扩展为 `"json" | "typescript"`。
- WebSocket ready event provider 调整为 `tracevane-lsp`，表达当前 gateway 可承载多个 diagnostics provider。

### Smoke 验证

新增 `tests/ide-workbench/ide-lsp-typescript-diagnostics.smoke.mjs`：

- 创建 `invalid.ts`。
- 直接调用 `/api/lsp/diagnostics`，验证返回 `TS2322`。
- 通过 `/ws/lsp` 发送 diagnose，验证返回 `TS2322`。
- 进入 `/ide`，从 Explorer 打开 TS 文件。
- 验证 Problems panel 出现 `TS2322`。
- 点击 Problems row 后仍能 reveal/open editor tab。
- 验证 Output LSP channel 出现 `TypeScript diagnostics active`。

同时新增 `scripts/dev-web-smoke-external-api.sh`，并把 LSP smoke 脚本切换到 external API helper：

- 先启动 standalone API，确认 `/api/lsp/status` 可用。
- 再启动 Vite 并通过 `TRACEVANE_USE_EXTERNAL_API=1` 代理到 standalone API。
- LSP smokes 使用独立端口，避免历史 5176 残留 dev server 污染验证。

## 3. 边界保持

M7.y-B 明确没有做：

- 完整 tsserver / typescript-language-server 进程生命周期。
- Project-wide type checking。
- 跨文件 symbol resolution 的完整准确性。
- hover / completion / definition 的 TS/JS provider。
- references、rename symbol、formatting、code actions、semantic tokens。
- 多语言 LSP 全集。
- Git remote / branch / stash UI。
- Debug real-DAP / attach / launch.json。
- 新 LSP API 或第二套 language service API。

## 4. 后续建议

下一阶段建议进入 M7.y-C：TypeScript / JavaScript LSP interaction expansion plan / foundation。

推荐先研究并决定是否从当前 Compiler API proof 升级到真实 `tsserver` / `typescript-language-server` 进程，还是继续做更小的 TS/JS hover/definition proof。若要做真实 tsserver，必须先明确：

- workspace/root guard。
- project config discovery。
- node_modules / 大文件排除。
- process lifecycle。
- diagnostics debounce / cancellation。
- Problems stale result 清理。
- Output channel 错误降噪。

## 5. 验证证据

已运行：

```txt
npm run typecheck:api -- --pretty false
npm run typecheck:web -- --pretty false
npm run smoke:ide:lsp-typescript-diagnostics
npm run smoke:ide:lsp-diagnostics
npm run smoke:ide:lsp-interaction
```

后续提交前还需运行：

```txt
git diff --check
```
