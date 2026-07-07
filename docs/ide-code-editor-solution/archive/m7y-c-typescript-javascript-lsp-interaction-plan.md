# M7.y-C TypeScript / JavaScript LSP Interaction Expansion Plan

## 状态

已完成：M7.y-C 是实现前计划与边界收口，不包含运行时代码变更。

下一阶段入口：M7.y-D TypeScript / JavaScript hover + definition foundation。

## 背景

M7.y-B 已把 TypeScript / JavaScript diagnostics 接入既有 `apps/api/modules/lsp`：

- 复用项目已安装 `typescript` Compiler API。
- 继续使用既有 `/api/lsp/diagnostics` 与 `/ws/lsp`。
- diagnostics 写入既有 Problems panel，生命周期与错误写入 Output 的 LSP channel。
- 不新增第二套 LSP API，也不引入完整 tsserver / typescript-language-server 进程。

当前 interaction 基线仍是 JSON-only：

- `apps/api/modules/lsp/service.ts` 的 `hoverDocument` / `completeDocument` / `defineDocument` 仍通过 `validateJsonInteractionRequest` 限制为 JSON。
- `types/lsp.ts` 中 hover / completion / definition response 的 `provider` 仍为 `"json"`。
- `apps/web/src/features/ide-workbench/lsp/monacoLspProviders.ts` 仍只向 Monaco 注册 JSON hover / completion / definition provider。

因此 M7.y-C 先规划 TS/JS interaction 扩展，不直接把 diagnostics 的一次性 Compiler API proof 扩成临时 hover/completion/definition 拼装。

## 外部与本地 API 探查结论

本地安装的 TypeScript public declaration 暴露了可复用语言服务入口：

- `LanguageServiceHost`
- `ScriptSnapshot`
- `createLanguageService(host, createDocumentRegistry())`
- `getQuickInfoAtPosition(fileName, position)`
- `getCompletionsAtPosition(fileName, position, options, formattingSettings?)`
- `getDefinitionAtPosition(fileName, position)`

实现 TS/JS interaction 时，应该使用有版本、snapshot、workspace 文件读取策略的 `LanguageServiceHost`，而不是在每次 hover/completion/definition 请求里用一次性 `transpileModule`、单文件 `createProgram` 或正则推断。

## 推荐架构

### 后端

在现有 `apps/api/modules/lsp` 内增加一个薄的 TypeScript interaction provider，不新增第二套 LSP API。

建议职责：

1. 复用 Files root/path guard。
   - `rootId` 与 `path` 必须解析到 workspace 内文件。
   - 不接受任意 host absolute path。
2. 建立 per-workspace / bounded 的 TypeScript language service host。
   - 维护 document version 与 `ScriptSnapshot`。
   - 当前 editor content 优先覆盖磁盘文件内容。
   - 对 workspace 文件读取、大小、目录深度、排除目录做限制。
3. 支持语言：
   - `typescript`
   - `typescriptreact`
   - `javascript`
   - `javascriptreact`
4. 输出继续走既有 response shape / WebSocket event。
   - provider 可扩展为 `"json" | "typescript"`。
   - 不让前端直接接触 TypeScript API。
5. 限制首批能力。
   - M7.y-D 先做 hover + definition。
   - completion 单独切片，因为它涉及排序、触发字符、snippet、auto-import、性能和噪声控制。

### 前端

复用现有 `monacoLspProviders.ts` 与 `lspInteractionClient.ts`：

1. JSON provider 保留。
2. TS/JS provider 新增时应注册到 Monaco 的 `typescript` / `typescriptreact` / `javascript` / `javascriptreact` language id。
3. request 继续携带当前 Monaco model content/version，React 只传 metadata，不保存完整文件内容。
4. Output LSP channel 区分 JSON interaction 与 TS/JS interaction 的注册/错误状态。

### 性能和安全边界

- 不在浏览器里运行 TypeScript compiler service。
- 不长期保存完整源文件内容到 localStorage 或 React store。
- 不扫描 `node_modules`、`dist`、`.git`、大型二进制/生成目录。
- 大文件、截断读取和 unsupported language 必须安全降级。
- completion 需要 debounce / cancellation 口径，避免每次键入触发重型 workspace 分析。
- 先接受“workspace 内 bounded language service”而不是完整 VS Code tsserver parity。

## 推荐后续切片

### M7.y-D：TypeScript / JavaScript hover + definition foundation

目标：

- 后端 provider 支持 TS/JS `getQuickInfoAtPosition` 与 `getDefinitionAtPosition`。
- 前端 Monaco provider 注册 TS/JS hover 和 definition。
- 定义跳转返回 workspace 内 editor URI；跨文件定义只跳 workspace 内安全路径。
- 保持 JSON interaction smoke 通过。

不做：completion、references、rename、formatting、code actions、semantic tokens、auto-import。

### M7.y-E：TypeScript / JavaScript completion foundation

目标：

- 支持基础 completion items。
- 控制 trigger characters、kind mapping、sortText、insertText。
- 先不做 auto-import / completion details / code action。

### M7.y-F：LSP interaction acceptance closeout

目标：

- 收口 JSON + TS/JS diagnostics / hover / definition / completion 的文档与验收。
- 明确后续多语言、rename、references、formatting、semantic tokens、real language server lifecycle 的边界。

## 本阶段明确不做

- 不实现 TS/JS hover/completion/definition runtime。
- 不引入完整 tsserver / typescript-language-server 进程。
- 不新增第二套 LSP API。
- 不做 project-wide strict type checking。
- 不做 references、rename symbol、formatting、code actions、semantic tokens。
- 不做 Git remote / checkout / merge / rebase / stash UI。
- 不做真实 DAP attach / launch.json parity。
- 不追完整 VS Code LSP 行为。

## 验证

M7.y-C 是 docs-only：

- Markdown 相对链接检查覆盖本文件与 touched docs。
- `git diff --check`。
