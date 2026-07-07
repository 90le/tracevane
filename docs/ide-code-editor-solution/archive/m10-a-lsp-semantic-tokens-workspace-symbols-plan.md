# M10-A LSP semantic tokens / workspace symbols foundation plan

## 状态

已完成：M10-A 是实现前研究、边界和最小实现计划，不包含运行时代码变更。

下一阶段入口：**M10-B LSP semantic tokens guarded implementation**。M10-B 先实现后端 semantic tokens contract 与 Monaco provider 最小接入；workspace symbols 建议作为 M10-C 独立切片，避免在同一阶段同时扩张两条索引/渲染链路。

## 当前代码审计结论

### 后端 LSP service

已存在：

- `apps/api/modules/lsp/routes.ts`
  - `GET /api/lsp/status`
  - `POST /api/lsp/diagnostics`
  - `POST /api/lsp/hover`
  - `POST /api/lsp/completion`
  - `POST /api/lsp/definition`
  - `POST /api/lsp/references`
  - `POST /api/lsp/rename`
  - `POST /api/lsp/formatting`
  - `POST /api/lsp/code-actions`
  - `POST /api/lsp/workspace-edit/preview`
  - `POST /api/lsp/workspace-edit/apply`
- `apps/api/modules/lsp/service.ts`
  - 复用 TypeScript Compiler API。
  - 已支持 JSON / TypeScript / JavaScript diagnostics、hover、completion、definition、references、rename、formatting、code actions。
  - TS/JS provider 走 bounded `LanguageServiceHost` / `ScriptSnapshot` / `createLanguageService`，不是完整 `tsserver` 进程。
  - 路径解析继续通过 Files root/path guard 语义，definition/references/rename 只允许 workspace root 内结果。
- `types/lsp.ts`
  - 已有 diagnostics、interaction、WorkspaceEdit preview/apply response type。

缺口：

- 没有 semantic tokens request/response type。
- 没有 `/api/lsp/semantic-tokens` route 或 WebSocket message type。
- `getStatus().features` 未声明 semantic tokens / workspace symbols。
- 没有 workspace symbols request/response type。
- 没有 bounded workspace symbol index/search helper。

### 前端 Monaco / IDE integration

已存在：

- `apps/web/src/features/ide-workbench/lsp/monacoLspProviders.ts`
  - 注册 JSON / TS / JS hover、completion、definition、references、rename、formatting、code actions provider。
  - 使用 `editorRefFromModelUri` 与 `editorModelUriString` 绑定 rootId/path。
- `apps/web/src/features/ide-workbench/lsp/lspInteractionClient.ts`
  - 统一通过 existing `/api/lsp/*` JSON endpoint 调用 provider。
- IDE Editor 已具备 Monaco model lifecycle、dirty/save/conflict、tab/split、preview/hex/media/file-surface 边界。
- Problems / Output 已承载 LSP diagnostics 与 lifecycle/error 日志。

缺口：

- 没有 `registerDocumentSemanticTokensProvider` / `registerDocumentRangeSemanticTokensProvider`。
- 没有 command palette / quick open / search UI 的 workspace symbols 入口。
- 没有 semantic token legend 与 token type/modifier 到 Monaco/Aurora token 的映射策略。

## M10 能力拆分建议

### M10-B：semantic tokens guarded implementation

目标：让当前打开的 TS/JS 文件获得后端驱动的语义 token 数据，并由 Monaco 按语义类型高亮。

范围：

- 新增 `LspSemanticTokensRequest` / `LspSemanticTokensResponse`。
- 新增 `POST /api/lsp/semantic-tokens`，可选增加 `/ws/lsp` message type。
- 后端只支持 `typescript` / `typescriptreact` / `javascript` / `javascriptreact`。
- 使用 TypeScript LanguageService 的 semantic classification/classifications API 或等价 Compiler API；不得用正则扫描。
- 返回 bounded full-document semantic token data；先不做 delta semantic tokens。
- 前端在 `monacoLspProviders.ts` 注册 semantic tokens provider。
- token legend 必须稳定，且仅通过 Monaco semantic token rules / Aurora theme adapter 表达颜色，不在业务组件硬编码 VS Code 主题色。
- unsupported language 安全降级，不影响 Monaco 自带 syntax highlighting。

不做：

- 不做 workspace symbols。
- 不做完整多语言 semantic tokens。
- 不做 tsserver / typescript-language-server 进程生命周期。
- 不做 semantic tokens delta、range tokens 或 theme designer。

建议验收：

- `npm run typecheck:api -- --pretty false`
- `npm run typecheck:web -- --pretty false`
- 新增 `npm run smoke:ide:lsp-semantic-tokens`
  - 创建 TS/JS 文件。
  - 调用 `/api/lsp/semantic-tokens` 验证 legend/data 非空且 token 数量有上限。
  - 进入 `/ide` 打开文件，确认 provider 注册不白屏。
  - unsupported language 返回明确空结果或 400 message，不破坏 editor。

### M10-C：workspace symbols foundation

目标：为 IDE 提供有界 workspace symbol 搜索基础，后续可接命令面板 / quick open / search view。

范围：

- 新增 `LspWorkspaceSymbolsRequest` / `LspWorkspaceSymbolsResponse`。
- 新增 `GET/POST /api/lsp/workspace-symbols`，复用现有 LSP service，不新建第二套 symbol API。
- 只支持 TS/JS 首版。
- 使用 TypeScript LanguageService `getNavigateToItems` 或有界 AST/source file symbol extraction；不得全仓库无界扫描。
- 复用 Files root guard，排除 `.git`、`node_modules`、`dist`、大文件、二进制和生成目录。
- 返回 path、range、kind、containerName、score/source provider 等可供 UI 跳转的数据。
- 前端首版可先做 command palette / Search side panel 内只读入口，点击跳转既有 editor reveal。

不做：

- 不做跨语言全集。
- 不做持久后台索引 daemon。
- 不做 watcher-driven symbol cache。
- 不做 fuzzy ranking 完整产品化。
- 不做 AI semantic search。

建议验收：

- `npm run typecheck:api -- --pretty false`
- `npm run typecheck:web -- --pretty false`
- 新增 `npm run smoke:ide:lsp-workspace-symbols`
  - 创建小型 TS/JS workspace。
  - 查询函数/类/变量名能返回 root 内位置。
  - 查询不存在项返回空列表。
  - root 外路径、排除目录和大文件不会进入结果。

## 共用 contract

### 后端边界

- 继续复用 `apps/api/modules/lsp`，不新增第二套 LSP service。
- 继续复用 Files root/path guard；所有 path/URI 必须映射到 workspace root 内。
- 请求必须携带 `rootId`、`path`、`language`、`content` 或有界 workspace query 信息。
- 对大文件、过长 query、过多 results、unsupported language 必须 bounded fail/empty。
- 不长期保存完整源文件内容。
- 不让 LSP service 直接写文件；所有可写能力仍走 WorkspaceEdit preview/apply。

### 前端边界

- Monaco 负责渲染 semantic tokens；React 只注册 provider 和传递 metadata/content。
- semantic tokens 不替代 Monaco syntax highlighting；provider 失败时必须退回基础高亮。
- workspace symbols 使用既有 editor reveal / Dockview tab open 规则；不新建 editor shell。
- Output `lsp` channel 记录 provider 注册/失败，不把大型 token payload 写入 Output。
- UI 颜色必须通过 Aurora token / Monaco theme adapter，不复制 VS Code 默认主题。

## 风险与缓解

| 风险 | 影响 | 缓解 |
| --- | --- | --- |
| TypeScript classification API 与 Monaco semantic token legend 不一致 | 高亮错位或失效 | M10-B 先定义稳定 legend，并用 smoke 验证 token 数组结构 |
| 大文件 semantic tokens 性能差 | 编辑器卡顿 | 限制文件大小、token 数量与超时，失败降级基础高亮 |
| workspace symbols 无界扫描 | CPU/IO 过高 | 排除目录、文件数量/大小/query 长度上限，M10-C 不做持久索引 |
| 与 Monaco 内置 TS worker 重叠 | 行为冲突 | Tracevane provider 只提供缺口能力，失败时不覆盖内置能力 |
| theme 硬编码 | light/dark 不一致 | 仅通过 Aurora token / Monaco theme adapter |

## 本阶段明确不做

- 不实现 semantic tokens runtime。
- 不实现 workspace symbols runtime。
- 不新增 LSP / Files / Search 第二套 API。
- 不引入完整 `tsserver`、`typescript-language-server`、pyright、gopls、rust-analyzer 等多语言进程。
- 不做 semantic token delta、range tokens、watcher-driven symbol index、AI semantic search。
- 不做 Debug、Git force push/merge/rebase、Terminal 新能力。
- 不改变 File Manager Online Editor 产品壳。

## 验证

M10-A 是 docs-only：

- touched docs Markdown relative link check。
- `git diff --check`。
