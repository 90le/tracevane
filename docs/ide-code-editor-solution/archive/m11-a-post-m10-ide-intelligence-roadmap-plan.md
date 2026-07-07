# M11-A Post-M10 IDE Intelligence Roadmap and Release Gate Plan

## 状态

已完成。M11-A 是 docs-only roadmap / release gate 阶段，不新增 runtime 功能。它承接 M10 semantic tokens / workspace symbols 基线，决定 post-M10 语言智能、Command Palette、索引、多语言 LSP、Git/Debug parity 的推进顺序和准入门槛。

## 当前基线

M10 已建立的可复用能力：

- `apps/api/modules/lsp`：现有 LSP service，已覆盖 diagnostics、hover、completion、definition、references、rename、formatting、code actions、WorkspaceEdit preview/apply、semantic tokens、workspace symbols。
- `types/lsp.ts`：已有 semantic tokens 与 workspace symbols contract。
- IDE Monaco：已接 semantic tokens provider，失败不破坏基础高亮。
- IDE Search View：已有“文件/内容 / 符号”模式，符号结果可打开 editor tab 并 reveal。
- 安全边界：Files root/path/directory guard、bounded scan、排除目录/大文件/隐藏文件/symlink 边界。

## Roadmap 排序

### P0 / M11-B：IDE Command Palette / Go to Symbol shell foundation

优先做这个，因为它直接复用 M10-C workspace symbols，风险低于后台索引或多语言 LSP。

范围：

- 新增 IDE Command Palette 壳层入口。
- 支持打开/关闭 palette、输入过滤、键盘导航、点击/回车执行。
- 首批 commands 只接安全的既有 IDE action：打开 Search/Explorer/Source Control/Debug、保存当前文件、关闭当前 tab、Go to Symbol。
- Go to Symbol 首版调用 `/api/lsp/workspace-symbols` 或既有 frontend client，点击后复用 editor open/reveal。
- 使用 Aurora token 和现有 shared UI primitives。

明确不做：

- 不做第二套 command registry。
- 不做后台 symbol index。
- 不做全语言 LSP。
- 不做 AI semantic search。
- 不把 File Manager Online Editor 和 IDE Workbench 合并。

验收建议：

- `npm run typecheck:web -- --pretty false`
- `npm run smoke:ide:lsp-workspace-symbols`
- 新增 `npm run smoke:ide:command-palette`
- `git diff --check`

### P1 / M11-C+：Watcher-backed symbol index 研究与最小计划

只有当 M11-B 的直接 workspace symbols 调用在真实项目上出现明显性能瓶颈时再做。

要求：

- 必须复用 M6 watcher/search 基础。
- 不允许新增独立后台 index daemon。
- 不保存完整源码内容到 localStorage。
- 明确 index invalidation、root guard、ignored directories、large-file budget、privacy/security 边界。

### P2 / M11-D+：多语言 LSP 逐语言研究

多语言不能写成“一次性全支持”。每种语言必须独立评估：

- 上游 language server 是否成熟、维护活跃、许可证可接受。
- server lifecycle、workspace root、cwd、env、resource limits。
- 文件类型检测、fallback、失败降级。
- smoke 是否能在 CI/local 稳定运行。

建议候选顺序：

1. JSON/CSS/HTML：Monaco / lightweight provider 优先。
2. Python：需要研究 pyright/pylsp 依赖与运行边界。
3. Go/Rust/Java：后置，依赖工具链更重。

### P3：Git / Debug / Terminal parity 后置

继续后置：

- Git force push / merge / rebase / checkout conflict flows。
- 更完整 Debug Adapter Protocol parity。
- Terminal 新能力。

原因：这些是高风险 runtime/写操作/进程生命周期能力，不应和语言智能路线同时扩张。

## Release gate

M11-B 前置门槛：

- M10 semantic tokens / workspace symbols 现有 smoke 必须保持绿色。
- Command Palette 只能复用现有 command/action/search/LSP client；如发现需要新 registry，必须先做 M11-B-A 计划而不是直接实现。
- Go to Symbol 首版只走 M10-C workspace symbols；不引入后台索引或持久 symbol DB。

M11-B 完成门槛：

- `/ide` 不白屏。
- Palette 可以通过按钮和快捷键打开/关闭。
- 键盘上下/回车/ESC 可用。
- 基础 commands 可执行。
- Go to Symbol 能打开并 reveal TS/JS 符号。
- 移动端/触摸端至少有按钮入口，不依赖快捷键。
- smoke 覆盖 Command Palette 与 Go to Symbol 主路径。

## 下一步

进入 **M11-B：IDE Command Palette / Go to Symbol shell foundation**。
