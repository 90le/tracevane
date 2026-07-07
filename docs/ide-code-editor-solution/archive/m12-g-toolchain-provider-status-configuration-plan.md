# M12-G Toolchain Provider Status / Configuration Foundation Plan

## 状态

M12-G 已完成。这是 docs-only foundation plan：定义 Go / Rust / Java / C / C++ toolchain-backed provider 的状态模型、配置边界、UI 呈现和后续实现切片，不安装、不发现、不启动任何 heavy language server。

## 背景

M12-F 已确认 Vue / Svelte 属于 npm-first framework provider proof，而 Go / Rust / Java / C / C++ 属于 toolchain-backed provider：它们依赖系统 runtime、binary、workspace 构建文件、项目配置和资源预算，不能沿用 bundled npm exact-pin provider gate。

M12-G 的目标不是让这些语言立即可诊断，而是先建立一个安全、可解释、可扩展的 provider status / configuration foundation，避免后续为了“全语言支持”而绕过 trust 与 runtime guard。

## Provider candidates

第一批 toolchain-backed candidates：

| Provider | Language ids | Runtime / binary | Workspace prerequisite | 初始状态口径 |
|---|---|---|---|---|
| Go | `go` | `gopls` + `go` command | `go.mod` / `go.work` / GOPATH project | status/config only |
| Rust | `rust` | `rust-analyzer` + rust toolchain / rust-src | `Cargo.toml` / rust-project.json | status/config only |
| Java | `java` | Java 21+ + Eclipse JDT LS distribution | Maven / Gradle / standalone Java + workspace data | status/config only |
| C/C++ | `c`, `cpp`, `objective-c`, `objective-cpp` | `clangd` + compiler toolchain | `compile_commands.json` / `compile_flags.txt` / fallback flags | status/config only |

## Status model

M12-G 建议新增一个 read-only toolchain provider status model，先作为文档/类型计划，M12-H 才落代码。

```ts
type ToolchainProviderId = "go" | "rust" | "java" | "clangd";

type ToolchainProviderStatus =
  | "notConfigured"
  | "configured"
  | "missingBinary"
  | "unsupportedVersion"
  | "missingWorkspaceConfig"
  | "disabledByTrust"
  | "unavailable";

interface ToolchainProviderStatusSnapshot {
  id: ToolchainProviderId;
  label: string;
  languages: string[];
  status: ToolchainProviderStatus;
  configured: boolean;
  executablePath?: string;
  executableSource?: "profile" | "user-config";
  version?: string;
  workspaceConfig?: {
    present: boolean;
    kind?: "go.mod" | "go.work" | "Cargo.toml" | "pom.xml" | "build.gradle" | "compile_commands.json" | "compile_flags.txt";
  };
  trust: {
    workspaceTrusted: boolean;
    reason?: string;
  };
  degradedReason?: string;
  nextAction?: string;
}
```

### 状态语义

- `notConfigured`: 用户未配置 toolchain profile，Tracevane 不尝试猜测系统路径。
- `configured`: 配置存在且静态校验通过；不代表 server 已启动。
- `missingBinary`: 配置的 executable 不存在或不可执行。
- `unsupportedVersion`: version probe 明确返回不支持版本。
- `missingWorkspaceConfig`: workspace 缺少 provider 所需项目文件，例如 `Cargo.toml` 或 `compile_commands.json`。
- `disabledByTrust`: workspace trust / policy 禁止使用该 provider。
- `unavailable`: 其它明确失败，需给出 degraded reason。

## Configuration schema boundary

M12-G 建议未来只允许严格 schema，不允许任意 command/env。

```ts
interface ToolchainProviderConfig {
  id: ToolchainProviderId;
  enabled: boolean;
  executablePath?: string;
  profileId?: string;
  workspaceDataPath?: string; // JDT LS only, must be under Tracevane managed cache/root policy.
  versionProbe?: "disabled" | "safe";
}
```

约束：

- `executablePath` 必须来自 explicit user config；M12-G/M12-H 不做 auto-discovery。
- 禁止 `args` / `env` / arbitrary command template。
- JDT LS `workspaceDataPath` 必须放到 Tracevane 管理路径或通过明确 root/cache policy，不能任意写 host 目录。
- `versionProbe` 默认 disabled；启用也必须是固定 allowlisted probe，例如 `--version` 或语言官方安全版本命令，且有 timeout。
- Frontend 只提交 schema 字段，不提交 shell command。

## API / service shape recommendation

M12-G 不落代码，但建议 M12-H 如需实现，复用现有 LSP status / provider status surface：

```txt
GET /api/lsp/status
  externalProviders.profiles[] 继续展示 npm-first providers
  toolchainProviders.candidates[] 新增 read-only status snapshot

POST /api/lsp/toolchain-providers/config
  后置；必须单独设计 trust / validation，不在 M12-G 实现
```

原则：

- 不新增第二套 LSP diagnostics API。
- 不把 toolchain config 混进 external provider command profile。
- 不让 IDE frontend 直接决定可执行命令。
- Toolchain provider runtime proof 前，只显示状态与下一步说明。

## IDE Provider Status UI

M12-H/M12-I 可让 IDE provider status dialog 增加 Toolchain section：

```txt
Toolchain Providers
- Go / gopls: Not configured — configure gopls path to enable future diagnostics.
- Rust / rust-analyzer: Not configured — configure rust-analyzer path and rust-src.
- Java / JDT LS: Not configured — Java 21+ and JDT LS distribution required.
- C/C++ / clangd: Not configured — clangd path and compile_commands.json required.
```

UI 必须：

- 明确显示“不自动发现 / 不自动安装”。
- 对每个 provider 给出下一步 action。
- 不提供“一键运行系统探测”默认按钮。
- 如果后续增加配置入口，必须经过 explicit user action 和 trust notice。

## Verification strategy for future runtime stages

在任何 heavy provider runtime proof 前，需要按 provider 定义 smoke：

- Go：临时 workspace + `go.mod` + configured `gopls` + configured `go` command；证明 status -> diagnostics。
- Rust：临时 Cargo workspace + configured rust-analyzer + rust-src；证明 status -> diagnostics。
- Java：临时 Maven/Gradle 或 standalone Java workspace + Java 21+ + JDT LS distribution + managed workspace data；证明 status -> diagnostics。
- C/C++：临时 workspace + `compile_commands.json` 或 `compile_flags.txt` + clangd；证明 status -> diagnostics。

所有 smoke 必须可跳过或标记 manual-required，不能让缺少本机 toolchain 的普通 CI 失败。

## M12-H 推荐下一步

M12-H：Toolchain provider status skeleton guarded implementation。

建议实现范围：

- 增加 toolchain provider read-only candidate metadata/type。
- 在 `/api/lsp/status` 暴露 `toolchainProviders.candidates`，全部默认 `notConfigured`。
- IDE provider status dialog 展示 toolchain section。
- 不读取系统 PATH，不探测 binary，不启动 server，不新增 diagnostics route。
- 增加 API/system test 和 provider status smoke，证明 UI 能显示 Go/Rust/Java/clangd candidates 与 notConfigured reason。

## 明确未做

M12-G 不做：

- 安装或启动 `gopls` / `rust-analyzer` / Eclipse JDT LS / `clangd`。
- system binary auto-discovery。
- auto install、npx、shell installer。
- 用户自定义任意 command / env / runtime / cwd / options。
- Go / Rust / Java / C / C++ diagnostics。
- 修改 `/api/lsp/diagnostics` runtime routing。
- Vue / Svelte rich interactions。
- 第二套 LSP / Files / Search API。
- Git / Debug / Terminal 新能力。
- File Manager Online Editor 产品壳变更。

## 验证

M12-G 是 docs-only 阶段，验证范围：

- touched-doc relative link check。
- `git diff --check`。
