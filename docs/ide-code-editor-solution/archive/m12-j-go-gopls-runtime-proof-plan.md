# M12-J Go / gopls Toolchain Provider Runtime Proof Plan

## 状态

M12-J 已完成。这是 docs-only runtime proof plan：在 M12-H/M12-I 已有 toolchain provider status/config/trust 基础上，为第一个 heavy toolchain runtime provider（Go / gopls）定义最小安全实现切片、验收证据和后置边界。本阶段不安装、不探测、不启动 `gopls`。

## 官方契约依据

- Go 官方文档将 `gopls` 定义为 Go team 维护的官方 Go language server：<https://go.dev/gopls/>。
- `gopls` 官方 CLI 文档说明其命令行能力与 `gopls help`/子命令形态：<https://go.dev/gopls/command-line>。
- `gopls` workspace 文档强调 workspace root 通常由 `go.mod` / `go.work` 等项目文件决定：<https://go.dev/gopls/workspace>。
- `gopls` diagnostics 文档说明 diagnostics 可能来自 `go list`、compiler/type checking，也支持 pull diagnostics：<https://go.dev/gopls/features/diagnostics>。

这些 contract 决定 M12-K 不能只“启动一个二进制”：必须同时处理 Go workspace 前置、`go list` 成本、pull/push diagnostics 形态、resource budget 和 degraded status。

## M12-J 目标

M12-J 只做实现前计划，目标是把 M12-K 的最小 proof 收敛为可验证、可回滚、安全的单语言切片：

```txt
配置 trusted Go provider
→ 校验 workspace root / cwd / Go project marker
→ 校验 allowlisted gopls profile
→ 以 bounded stdio gateway 启动 gopls
→ 初始化单 workspace folder
→ 对一个 .go 文件请求 diagnostics/status
→ 将结果接入现有 Problems/Output/LSP status surface
```

## M12-K 推荐最小实现范围

### 1. 后端 Go provider profile

复用现有：

- `apps/api/modules/lsp/toolchain/toolchainProviderStatus.ts`
- existing external gateway / LSP request lifecycle 能复用的边界
- M12-I `lsp.toolchains.go.gopls` trusted config gate
- Files/workspace root guard 语义

新增或调整建议：

```txt
apps/api/modules/lsp/toolchain/goGoplsProvider.ts
apps/api/modules/lsp/toolchain/goWorkspace.ts
apps/api/modules/lsp/toolchain/goGoplsRuntime.test helper（如需要）
```

Go provider profile 必须满足：

- `enabled=true` 且 `trusted=true`。
- `profileId="workspace"`。
- 不接受 frontend/user-provided `command` / `args` / `env` / `cwd`。
- command 只能来自 server-side allowlisted profile；如果未来允许 explicit path，必须单独阶段设计 path validation。
- cwd 必须解析到 workspace root 内的 Go project root，不能使用任意绝对路径。

### 2. Workspace 前置与 degraded states

M12-K 应先实现 conservative marker detection：

| 状态 | 条件 | 行为 |
|---|---|---|
| `configured` | trusted config 存在，但尚未针对文件启动 | status 可显示 ready-to-prove |
| `missingWorkspaceConfig` | 当前 workspace/file 范围内找不到 `go.mod` / `go.work`，且不支持 GOPATH fallback | 不启动 gopls，显示 degraded reason |
| `missingBinary` | allowlisted profile 的 `gopls` 无法启动或版本 probe 缺失 | 不进入 diagnostics |
| `unsupportedVersion` | version probe 返回不可接受版本 | 不进入 diagnostics |
| `disabledByTrust` | config 未 trusted | 不启动 |
| `unavailable` | startup/initialize/diagnostics timeout 或协议错误 | 输出 bounded reason |

Marker policy：

- 优先 `go.work`，其次 nearest `go.mod`。
- 不递归扫描整个 workspace；只从目标文件目录向上查找至 workspace root。
- 默认不启用 GOPATH fallback，除非后续阶段明确需求和测试。
- 忽略 `node_modules` / `.git` / `dist` / `build` / coverage / `.tracevane-trash` 等无关目录。

### 3. Version / binary proof

M12-K 可做最小 safe probe，但必须与启动区分：

- Probe 只允许固定 allowlisted 命令，例如 `gopls version` 或同等官方安全版本命令。
- Probe timeout 必须短且可观测。
- Probe 不读取 PATH；只能使用 server profile 解析出的 binary。
- Probe 失败进入 `missingBinary` / `unsupportedVersion` / `unavailable`，不能静默降级为 no-op。
- 不把完整 stderr/stdout 长期保存；只保存 bounded summary。

### 4. Runtime proof lifecycle

M12-K 的最小 runtime lifecycle：

```txt
create gopls session for workspace root
initialize with one workspace folder
open one .go document
request/receive diagnostics with timeout
close/kill session cleanly
surface status + diagnostics count
```

约束：

- 后端执行 `gopls`；前端只显示状态/diagnostics。
- 每个 session 必须绑定 workspace/rootId，不跨 workspace 复用。
- 资源预算包括 startup timeout、diagnostics timeout、max output/log bytes、max open docs。
- Diagnostics 初期只要求 proof route，不要求 hover/completion/definition/references/rename/formatting/code actions。
- `go list` 可能较重，默认只跑最小临时 Go module smoke；真实项目大 workspace 后置。

### 5. API / UI 接入

不新增第二套 API。M12-K 建议最小接入：

- `/api/lsp/status`：Go candidate 可从 `configured` 进入 runtime proof status，例如 `ready` / `running` / `degraded`（具体命名应复用现有 status vocabulary）。
- `/api/lsp/diagnostics`：仅当当前文件是 `.go` 且 trusted Go provider 可用时，路由到 Go provider；否则保持现有 provider 行为。
- Provider Status UI：显示 Go provider runtime proof 状态、workspace marker、binary/version summary、degraded reason。
- Problems/Output：复用 M6/M7 existing diagnostics/output surfaces，不为 Go 新建 UI。

## M12-K 验证建议

### 自动 system test

新增建议脚本：

```txt
npm run test:system:lsp-go-gopls-provider
```

覆盖：

- 无 trusted config：`disabledByTrust` / `notConfigured`，不启动。
- 缺少 `go.mod` / `go.work`：`missingWorkspaceConfig`，不启动。
- trusted config + fake/missing binary：`missingBinary` 或 `unavailable`，bounded reason。
- forbidden config key：沿用 M12-I，继续拒绝 `command` / `args` / `env` / `cwd`。
- 如果本机有 allowlisted `gopls` test fixture：临时 Go module + bad Go file 能返回 diagnostics。

### Smoke / manual gate

新增建议脚本：

```txt
npm run smoke:ide:lsp-go-gopls-provider
```

因为普通 CI 不一定安装 Go/gopls，smoke 必须具备 skip/manual-required 策略：

- 缺少 allowlisted gopls fixture 时，smoke 不失败主线，但必须证明 UI 显示 `missingBinary` / manual-required。
- 有 fixture 时，证明 `.go` 文件 diagnostics 出现在 Problems，并且 Provider Status 显示 Go runtime proof。

## M12-J 明确未做

M12-J 不做：

- 安装 `gopls` 或 Go toolchain。
- 启动 `gopls`。
- PATH 探测、system binary auto-discovery、auto install、npx/shell installer。
- Go diagnostics runtime routing。
- Go hover / completion / definition / references / rename / formatting / code actions。
- Rust / Java / C/C++ provider runtime。
- 修改 Terminal / Git / Debug。
- 新增第二套 LSP / Files / Search API。
- 允许前端或用户配置任意 command / args / env / cwd。

## M12-K 推荐下一步

M12-K：Go / gopls guarded runtime proof。

推荐顺序：

1. 为 Go provider 抽出 marker detection 与 status degraded helper。
2. 增加 server-side allowlisted gopls profile 解析，但不接受 frontend command。
3. 增加 safe version/binary probe，bounded timeout。
4. 最小复用 existing LSP gateway 启动 gopls stdio session。
5. 只接 `.go` diagnostics proof route。
6. 增加 system test + provider status smoke；CI 无 gopls 时走 manual-required / skipped proof，不阻塞其它阶段。

## 验证

M12-J 是 docs-only 阶段，验证范围：

- touched-doc relative link check。
- `git diff --check`。
