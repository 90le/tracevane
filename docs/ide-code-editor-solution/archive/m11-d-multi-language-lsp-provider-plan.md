# M11-D Multi-language LSP Provider Research Plan

## 状态

已完成。M11-D 是 docs-only 研究、边界和最小实现计划，不新增 runtime provider、不新增 API、不引入依赖。它承接 M10/M11-C-B 的 TypeScript/JavaScript/JSON 基线和 watcher-backed workspace symbol metadata index，规划后续逐语言 provider 路线。

下一阶段入口：**M11-E provider registry + JSON/HTML/CSS lightweight language services guarded implementation**。M11-E 应先抽薄 provider registry，再接入轻量 in-process language service；不要直接启动外部 language server 进程。

## 当前基线审计

### 已有能力

- `apps/api/modules/lsp/service.ts`
  - 单一 Tracevane LSP service，已有 HTTP routes 与 `/ws/lsp` gateway。
  - JSON：当前是本地最小 provider，支持 diagnostics、hover、completion、definition、references、formatting、code action surface。
  - TypeScript / JavaScript：复用 TypeScript Compiler API / LanguageService，支持 diagnostics、hover、completion、definition、references、rename、formatting、code actions、semantic tokens、workspace symbols。
  - M11-C-B 已在既有 `workspaceSymbols` provider 内加入 root/path/includeHidden scoped in-memory symbol metadata index 与 direct fallback。
- `types/lsp.ts`
  - 已有 diagnostics、interaction、semantic tokens、workspace symbols、WorkspaceEdit preview/apply、rename/formatting/code actions contract。
  - `LspWorkspaceSymbolsResponse.index` 已能暴露 providerVersion、fresh/rebuilt/direct、scope 和 stale 信息。
- `apps/web/src/features/ide-workbench/lsp/monacoLspProviders.ts`
  - Monaco provider 已注册 JSON 与 TS/JS hover/completion/definition/references/rename/formatting/code actions/semantic tokens。
  - 前端只做 provider 注册、request bridge 和 WorkspaceEdit preview/apply；不拥有后端 provider lifecycle。
- Root guard / budget：LSP 文件路径继续复用 Files root/path guard，workspace symbols 继承排除目录、大文件、symlink/root 外路径、结果数、文件数和 query 长度上限。

### 当前缺口

- Provider dispatch 仍散落在 `service.ts` 中的 `if (TYPESCRIPT_LANGUAGES.has(...)) / json` 分支；继续加语言会使单文件膨胀。
- JSON provider 是项目自建最小能力，未复用 `vscode-json-languageservice` 的 schema、completion、validation、formatting 能力。
- HTML/CSS/SCSS/LESS/YAML/Python/Go/Rust 等还没有 provider contract、依赖边界、runtime 检测或 smoke。
- 没有 external language server process manager；因此不能假设 `pyright`、`gopls`、`rust-analyzer`、`typescript-language-server` 一定可用。
- `getStatus().supportedLanguages` 是静态数组，后续需要区分 installed/available/degraded provider 状态。

## 依赖与环境核验（2026-07-08）

### 当前项目已安装

- Root devDependency：`typescript: ^5.3.0`。
- Web dependency：`monaco-editor: ^0.55.1`。
- 未安装：`vscode-json-languageservice`、`vscode-html-languageservice`、`vscode-css-languageservice`、`vscode-languageserver`、`typescript-language-server`、`pyright`、`yaml-language-server` 等 LSP provider 依赖。

### npm 当前候选版本 / 许可证

通过 `npm view <pkg> version license repository.url --json` 核验：

| 候选 | 当前版本 | License | 用途判断 |
| --- | --- | --- | --- |
| `vscode-json-languageservice` | `5.7.2` | MIT | P0，替换/增强现有 JSON provider，支持 schema/validation/completion/formatting |
| `vscode-html-languageservice` | `5.6.2` | MIT | P0，HTML in-process provider |
| `vscode-css-languageservice` | `6.3.10` | MIT | P0，CSS/SCSS/LESS in-process provider |
| `vscode-languageserver` | `10.1.0` | MIT | P1，后续 external LSP bridge 类型/协议基础 |
| `typescript-language-server` | `5.3.0` | Apache-2.0 | P2，若未来从 Compiler API 转外部 tsserver bridge，需要独立生命周期计划 |
| `pyright` | `1.1.411` | MIT | P2，Python provider 候选，但需要 Node package install / binary lifecycle / resource guard |
| `yaml-language-server` | `1.23.0` | MIT | P2，YAML provider 候选，依赖 schema/catalog 策略 |
| `@volar/language-server` | `2.4.28` | MIT | P3，Vue provider 候选，依赖 TS/Vue project model |
| `svelte-language-server` | `0.18.3` | MIT | P3，Svelte provider 候选 |
| `bash-language-server` | `5.6.0` | MIT | P3，shell provider 候选 |

### 本机外部二进制观察

本机检查结果只能作为开发环境观察，不能作为产品假设：

- `pyright` 可执行存在但版本为 `1.1.408`，落后于 npm 当前 `1.1.411`。
- `typescript-language-server` 可执行存在但版本为 `5.1.3`，落后于 npm 当前 `5.3.0`。
- `gopls` 未安装。
- `pylsp` 未安装。
- `rust-analyzer` 命令存在但当前 rustup toolchain 报错，不能作为可用 provider。

结论：Tracevane 不能依赖用户环境里“刚好有某个 language server”。外部 server provider 必须走显式依赖/运行时探测/allowlist/profile 和失败降级。

## 多语言 provider 分层路线

### Tier 0：保持现有基线

| 语言 | 当前能力 | 后续动作 |
| --- | --- | --- |
| TypeScript / TSX / JavaScript / JSX | Compiler API / LanguageService；diagnostics、hover、completion、definition、references、rename、formatting、code actions、semantic tokens、workspace symbols | 保持；M11-E 不迁移到外部 `typescript-language-server` |
| JSON | 项目自建最小 provider | M11-E 用 `vscode-json-languageservice` 增强/替换，但保持同一 Tracevane LSP contract |

### Tier 1：优先 in-process lightweight language services

第一批推荐：JSON / HTML / CSS / SCSS / LESS。

原因：

- 都有 VS Code 官方拆分出的 language service package，MIT，适合 Node in-process 使用。
- 不需要长驻外部进程，不需要复杂初始化握手、workspace folders、进程杀死、stderr 处理。
- 能复用现有 request/response contract、WorkspaceEdit preview/apply、root guard 和 Monaco provider bridge。
- 适合先验证 provider registry、feature capability matrix 和 smoke。

M11-E 建议最小能力：

- JSON：diagnostics、completion、hover、formatting；schema/catalog 首版禁用远程拉取，只允许内置/本地 schema 后续扩展。
- HTML：diagnostics、completion、hover、formatting；definition/references/rename 后置。
- CSS/SCSS/LESS：diagnostics、completion、hover、definition、references、formatting；rename/code actions 后置。
- Workspace symbols：首版仍只走 TS/JS provider index；HTML/CSS symbol extraction 后置，避免把 M11-E 扩成搜索/索引项目。

### Tier 2：外部 Node language servers，逐个计划

候选：Python(Pyright)、YAML、Bash、Vue、Svelte、TypeScript language server。

进入条件：

- 必须先有 `ExternalLanguageServerGateway` 计划和实现：spawn/initialize/open/change/request/shutdown/kill、timeout、stderr/output budget、root/cwd guard、profile allowlist。
- 每个 provider 单独 smoke，不能把“安装 package”当作支持完成。
- 不能把外部 server 的 WorkspaceEdit 直接写文件，仍走 Tracevane WorkspaceEdit preview/apply。
- 不能把 server output 或源代码长期写入 localStorage / docs / Output。

建议首个 Tier 2 候选：Python / Pyright，但它必须是单独 M11-F 研究计划，不在 M11-E 抢跑。

### Tier 3：工具链 heavy language servers

候选：Go(gopls)、Rust(rust-analyzer)、Java(JDT LS)、C/C++(clangd)。

后置原因：

- 用户机器可能未安装或版本不匹配。
- 工具链索引成本大，workspace root/cwd/env 影响大。
- 需要更强的 process lifecycle、resource quotas、workspace config、large repo policy。

这些不属于 M11-E；后续应逐语言独立阶段推进。

## 建议架构

### 1. 保持单一 Tracevane LSP API

继续保留当前 routes 与 WebSocket message：

- `/api/lsp/diagnostics`
- `/api/lsp/hover`
- `/api/lsp/completion`
- `/api/lsp/definition`
- `/api/lsp/references`
- `/api/lsp/semantic-tokens`
- `/api/lsp/workspace-symbols`
- `/api/lsp/rename`
- `/api/lsp/formatting`
- `/api/lsp/code-actions`
- `/api/lsp/workspace-edit/preview`
- `/api/lsp/workspace-edit/apply`
- `/ws/lsp`

不新增 `/api/lsp/json/*`、`/api/lsp/html/*`、`/api/lsp/symbol-index/*` 或 provider-specific API。

### 2. 新增薄 provider registry，而不是巨大新框架

建议 M11-E 新增内部类型（路径可放在 `apps/api/modules/lsp/providers/`）：

```ts
interface TracevaneLanguageProvider {
  id: "json" | "typescript" | "html" | "css" | string;
  source: string;
  languages: string[];
  mode: "in-process" | "external" | "fallback";
  capabilities: {
    diagnostics?: boolean;
    hover?: boolean;
    completion?: boolean;
    definition?: boolean;
    references?: boolean;
    semanticTokens?: boolean;
    workspaceSymbols?: boolean;
    rename?: boolean;
    formatting?: boolean;
    codeActions?: boolean;
  };
  diagnose?(request: ValidatedInteractionRequest): LspDiagnosticsResponse;
  hover?(request: LspPositionRequest, validated: ValidatedInteractionRequest): LspHoverResponse;
  // ...同现有 response contract 对齐
}
```

约束：

- Registry 只是 dispatch 和 capability metadata，不拥有 Files API、WorkspaceEdit apply、Monaco model lifecycle 或 Search UI。
- Unsupported capability 必须返回空结果或明确 disabledReason，不抛出会破坏 editor 的异常。
- Provider output 必须映射到 `types/lsp.ts` 现有 contract；若 contract 必须扩展，先做类型和 smoke。
- Provider status 应支持 available/degraded/unavailable，供 `/api/lsp/status` 与 Output channel 展示。

### 3. 语言识别与文件类型

- 继续以前端 Monaco languageId + backend `normalizeLanguage(request.language, path, content)` 双保险。
- 不仅靠扩展名：沿用 File Surface / editor-core 的内容嗅探经验，但 LSP provider 不能为大文件读取全文做语言猜测。
- 对无扩展名或多后缀文件：只在已打开 editor model 提供 `content` 时做轻量 sniff；workspace-wide provider 不做全内容嗅探。
- Provider registry 应能回答：`languageId -> provider`、`extension -> suggested language`、`content hint -> maybe language`，但不要写成另一个 File Surface 产品壳。

### 4. 安全与资源边界

所有 provider 必须满足：

- rootId/path 通过 Files root guard。
- 不接收任意绝对路径。
- 大文件、长 query、大结果集、超时均 bounded。
- 外部 server 必须 profile allowlist，cwd 在 workspace root 内，env 最小化。
- WorkspaceEdit 仍走 preview/apply，dirty/open file protection 不绕过。
- 不持久化完整源码、diagnostics 大 payload 或 language server stdout。

## M11-E 最小实现切片

推荐拆分：

### M11-E-A：Provider registry extraction

目标：把当前 JSON/TS/JS 分支抽成薄 registry，不改变行为。

范围：

- 新增 `apps/api/modules/lsp/providers/`。
- 抽出 JSON provider 与 TypeScript provider 的内部模块。
- `service.ts` 只负责 request validation、root guard、route/WebSocket glue、provider dispatch。
- `/api/lsp/status` 返回 provider capability matrix。
- 不引入新依赖、不改变 API、不改变 Monaco provider 行为。

验证：

- `npm run typecheck:api -- --pretty false`
- `npm run typecheck:web -- --pretty false`
- `npm run smoke:ide:lsp-interactions` 或现有 LSP interaction smoke 集合
- `npm run smoke:ide:lsp-semantic-tokens`
- `npm run smoke:ide:lsp-workspace-symbols`
- `npm run smoke:ide:command-palette`
- `git diff --check`

### M11-E-B：JSON official language service migration

目标：复用 `vscode-json-languageservice` 增强 JSON provider，但仍输出 Tracevane contract。

范围：

- 新增依赖前记录 license/size/maintenance 结论。
- JSON diagnostics/completion/hover/formatting 走 official service。
- 禁止默认远程 schema 拉取；schema 支持后置。
- 保持现有 JSON smoke，新增 schema-disabled fallback 断言。

### M11-E-C：HTML/CSS lightweight providers

目标：接入 `vscode-html-languageservice` 与 `vscode-css-languageservice` 的 in-process provider。

范围：

- HTML/CSS/SCSS/LESS diagnostics/completion/hover/formatting 首版。
- Monaco provider 注册对应 languageId。
- Unsupported features 返回空结果/disabled action，不破坏编辑器。
- 不做 workspace symbols、rename、external server、Vue/Svelte framework intelligence。

## M11-D 明确不做

- 不实现 runtime provider。
- 不新增依赖。
- 不新增第二套 LSP/Files/Search API。
- 不启动 `typescript-language-server`、`pyright`、`gopls`、`rust-analyzer` 或任何外部 language server。
- 不迁移现有 TS/JS provider 到外部 `typescript-language-server`。
- 不做“一次性全语言支持”。
- 不做 AI semantic search。
- 不做 Git force/merge/rebase、Debug parity、Terminal 新能力。
- 不改变 File Manager Online Editor 产品壳。

## 验证

M11-D 是 docs-only：

- npm/local dependency landscape check。
- touched docs Markdown relative link check。
- `git diff --check`。
