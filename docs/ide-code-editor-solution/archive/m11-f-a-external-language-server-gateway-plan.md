# M11-F-A External Language Server Gateway Research Plan

状态：已完成。M11-F-A 是 research / boundary / minimal implementation plan，不实现外部 language server runtime，不新增第二套 LSP API，不把任何 heavy provider 标记为已支持。

## 背景

M11-E-D 已收口当前 in-process provider matrix：JSON、TypeScript/JavaScript、HTML、CSS/SCSS/LESS。下一类能力是 Python/YAML/Go/Rust 等外部 language server，但这些 server 涉及进程生命周期、stdio JSON-RPC framing、workspace root/cwd/env guard、资源预算和崩溃降级，不能直接塞进现有 `service.ts` 分支。

M11-F-A 的目标是定义 `ExternalLanguageServerGateway` 的最小安全边界，为 M11-F-B skeleton guarded implementation 提供可执行入口。

## 当前本地基线

### Tracevane 已有

- `apps/api/modules/lsp/routes.ts`：单一 `/api/lsp/*` HTTP routes 与 workspace-edit preview/apply routes。
- `apps/api/modules/lsp/service.ts`：LSP request validation、Files root/path guard、provider dispatch、WebSocket `/ws/lsp` bridge、workspace symbols index。
- `apps/api/modules/lsp/providers/registry.ts`：provider capability matrix，当前 provider id 为 `json` / `typescript` / `html` / `css`，mode 类型已包含 `external`。
- `apps/api/modules/lsp/workspaceEdit.ts`：WorkspaceEdit preview/apply，必须继续作为唯一写文件路径。
- `types/lsp.ts`：Tracevane 的 HTTP/WebSocket response contract。

### 当前依赖

已安装：

- `typescript ^5.3.0`
- `vscode-json-languageservice ^5.7.2`
- `vscode-html-languageservice ^5.6.2`
- `vscode-css-languageservice ^6.3.10`

未安装 / 未接入 runtime：

- `vscode-languageserver`
- `vscode-languageclient`
- `pyright`
- `yaml-language-server`
- `gopls`
- `rust-analyzer`
- Java / Vue / Svelte language servers

## 上游核验（2026-07-08）

通过官方 LSP 网站和 `npm view` 核验：

- LSP 官方站点说明 LSP 是 editor/IDE 与 language server 之间的 JSON-RPC 协议，用于 completion、definition、references 等语言能力；最新 specification 为 3.18。
- `vscode-languageserver@10.1.0`，MIT，Microsoft `vscode-languageserver-node`，依赖 `vscode-languageserver-protocol@3.18.2`。
- `vscode-languageclient@10.1.0`，MIT，Microsoft `vscode-languageserver-node`。
- `pyright@1.1.411`，MIT，Microsoft `pyright`，bin 包含 `pyright` 与 `pyright-langserver`。
- `yaml-language-server@1.23.0`，MIT，Red Hat `yaml-language-server`，bin 包含 `yaml-language-server`。
- `vscode-json-languageserver@1.3.4`，MIT，bin 包含 `vscode-json-languageserver`，但 Tracevane 当前已用 in-process `vscode-json-languageservice`，暂不需要改为外部 JSON server。

结论：外部 provider 可以通过 stdio LSP 复用成熟 server，但 Tracevane 必须先实现自己的 guarded gateway，而不是把 package/bin 直接暴露给前端或让 provider 直接写文件。

## M11-F Gateway 设计边界

### 继续保持单一 Tracevane LSP API

M11-F 不新增 provider-specific API。外部 provider 仍通过现有入口：

- `/api/lsp/diagnostics`
- `/api/lsp/hover`
- `/api/lsp/completion`
- `/api/lsp/definition`
- `/api/lsp/references`
- `/api/lsp/rename`
- `/api/lsp/formatting`
- `/api/lsp/code-actions`
- `/api/lsp/status`
- `/ws/lsp`
- `/api/lsp/workspace-edit/preview`
- `/api/lsp/workspace-edit/apply`

外部 provider 只是 registry 后面的 `mode: "external"` backend implementation。

### `ExternalLanguageServerGateway` 职责

建议新增内部模块，不改变公共 API：

```txt
apps/api/modules/lsp/external/
  externalLanguageServerGateway.ts
  externalLanguageServerTypes.ts
  lspStdioTransport.ts
  lspMessageFraming.ts
  externalProviderProfiles.ts
```

职责：

- profile allowlist：provider id、command、args、languages、capabilities、启动策略。
- spawn lifecycle：create / initialize / open / change / request / close / shutdown / kill。
- stdio framing：`Content-Length: <bytes>\r\n\r\n<json>`。
- JSON-RPC correlation：request id、timeout、response resolve/reject、notification dispatch。
- diagnostics：订阅 `textDocument/publishDiagnostics`，映射到 Tracevane `LspDiagnostic`。
- status：`available` / `degraded` / `unavailable` / `starting` / `stopped` / `crashed`。
- output budget：stderr/stdout 非协议日志必须截断并写入 LSP Output channel，不保存完整源码。
- resource guard：max sessions、idle timeout、request timeout、init timeout、kill timeout、max stderr bytes、max diagnostics per file。

不属于 Gateway 的职责：

- 不拥有 Files API。
- 不绕过 WorkspaceEdit preview/apply。
- 不把 Monaco model 内容长期存入 React/localStorage。
- 不做 provider 自动安装。
- 不做全语言 workspace symbol index。

### Provider profile 初始形态

M11-F-B 先只允许显式 profile。示例：

```ts
interface ExternalLanguageServerProfile {
  id: string;
  displayName: string;
  languages: string[];
  command: string;
  args: string[];
  cwd: "workspaceRoot";
  env?: Record<string, string>;
  initializationOptions?: unknown;
  settings?: unknown;
  capabilities: Partial<Record<TracevaneLspProviderFeature, boolean>>;
  budgets: {
    initializeMs: number;
    requestMs: number;
    idleMs: number;
    killMs: number;
    maxDiagnostics: number;
    maxOutputBytes: number;
  };
}
```

首版 profile 来源应为代码内 allowlist 或 server config allowlist；不能从前端传任意 command。

### Root / cwd / env guard

- `cwd` 必须解析到 workspace root 或其子目录。
- 禁止任意绝对路径作为 cwd。
- `textDocument.uri` 必须由 root guard 解析出的文件路径生成。
- `workspaceFolders` 只包含当前 root。
- env 默认最小化，允许 `PATH` 的策略需要明确；不得传入敏感 Tracevane secrets。
- provider 对 WorkspaceEdit 的返回必须进入 Tracevane preview/apply，不直接写文件。

### Text document sync 策略

M11-F-B skeleton 推荐：

- 仅对当前请求文件做 `textDocument/didOpen`，内容来自已验证 request content 或 Files API 读取。
- 每次 request 前使用最新 content/version 做 open/change，request 后可保持 session 或按 idle timeout 回收。
- 首版不做全 workspace didOpen。
- 首版不把 external provider 纳入 watcher-backed workspace symbol index。

### 状态与降级

`/api/lsp/status` 后续应能展示：

```txt
provider: pyright
mode: external
status: unavailable | starting | available | degraded | crashed | stopped
reason: missing_binary | initialize_timeout | request_timeout | crashed | disabled_by_profile
languages: [python]
capabilities: {...}
```

unsupported 或 unavailable provider 必须返回空结果或明确 error response，不让 Monaco/editor 白屏。

## 推荐 M11-F-B 最小实现切片

M11-F-B 只做 gateway skeleton，不接真实 heavy provider 作为完成标准：

1. 新增 `apps/api/modules/lsp/external/` 内部模块：types、stdio framing、profile registry、gateway skeleton。
2. 扩展 provider registry 支持 external descriptor/status，但默认没有 enabled heavy provider。
3. 增加一个 test-only mock/echo stdio language server harness，用于验证 initialize/request/notification/kill/status，不作为产品 provider。
4. 在 service 层接入 external provider dispatch 的空/disabled/degraded 路径，保持现有 JSON/TS/HTML/CSS 行为不变。
5. 新增 smoke 或 system test：
   - framing encode/decode。
   - initialize timeout。
   - request timeout。
   - diagnostics notification mapping。
   - crash -> degraded/unavailable status。
   - cwd/root escape 被拒。
6. 更新 docs 与 status，进入后续 M11-F-C：首个 real external provider proof。

## 首个真实 provider 建议

M11-F-C 才选择首个 real provider。推荐候选排序：

1. YAML：`yaml-language-server`，Node package/bin 明确，语言范围小，适合验证 diagnostics/completion/hover/formatting；但 schema/catalog 和 remote schema 必须默认关闭或显式 allowlist。
2. Python：`pyright`，生态价值高，但项目解释器、venv、类型检查成本和 large workspace 性能风险更高。
3. Go/Rust：后置，因为依赖用户工具链和 workspace indexing 成本更高。

## 明确不做

M11-F-A 不做：

- 外部 server runtime 实现。
- 自动安装 provider。
- pyright/yaml/gopls/rust-analyzer 真实接入。
- 一次性全语言支持。
- 多语言 workspace symbols。
- remote schema fetching / schema association UI。
- provider 返回 WorkspaceEdit 后直接写文件。
- 第二套 LSP / Files / Search API。
- Git force / merge / rebase。
- Debug parity、Terminal 新能力。
- File Manager Online Editor 产品壳变更。

## 验证

M11-F-A 为 docs-only research/plan，验证方式：

- `npm view vscode-languageserver version license repository.url bin dependencies --json`
- `npm view vscode-languageclient version license repository.url dependencies --json`
- `npm view pyright version license repository.url bin dependencies --json`
- `npm view yaml-language-server version license repository.url bin dependencies --json`
- `npm view vscode-json-languageserver version license repository.url bin dependencies --json`
- touched docs Markdown relative link check
- `git diff --check`
