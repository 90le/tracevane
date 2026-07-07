# M7.z-A LSP / Git / Debug Post-M7 Enhancement Plan

## 状态

已完成：M7.z-A 是 post-M7 增强研究与最小计划，不包含运行时代码变更。

下一阶段入口：M7.z-B Advanced LSP references / rename / formatting plan or first implementation slice（建议先从 LSP references foundation 开始）。

## 研究依据

本阶段只做边界和切片计划，参考当前官方/上游协议与工具文档：

- [LSP 3.17 specification](https://github.com/Microsoft/language-server-protocol/blob/gh-pages/_specifications/lsp/3.17/specification.md)：LSP 使用 JSON-RPC 2.0，能力通过初始化时交换 capability flags；3.17 还包括 type hierarchy、inline values、inlay hints、notebook、meta model 等新增能力。
- [Debug Adapter Protocol overview](https://microsoft.github.io/debug-adapter-protocol/overview.html)：DAP 以通用 debugger UI 与 adapter 之间的 wire protocol 为目标，adapter 启动/连接分 single-session 与 multi-session 两类；adapter 需要发送 `initialized` event 后 host 才发送配置请求。
- [Git pull documentation](https://git-scm.com/docs/git-pull)：`pull` 涉及 fetch + merge/rebase，`--autostash` 可能在最终 stash apply 时产生非平凡冲突；remote/upstream 配置决定 pull/fetch/push 默认目标，push URL 与 fetch URL 也可能不同。

## 当前基线

Tracevane 当前已具备：

### LSP

- JSON diagnostics / hover / completion / definition。
- TypeScript / JavaScript diagnostics / hover / definition / completion。
- Existing `/api/lsp/*` 与 `/ws/lsp` gateway。
- Problems / Output / editor reveal 基础链路。
- Monaco provider bridge。
- Bounded TypeScript `LanguageServiceHost` foundation。

### Git

- Git status。
- Explorer decoration。
- Source Control View。
- Diff。
- Stage / unstage。
- Commit。
- Branch / upstream status display。

### Debug

- Debug Gateway skeleton。
- Debug View shell。
- Breakpoints + editor reveal。
- Minimal real adapter proof。
- Lifecycle foundation。
- Launch profile / config foundation。
- Minimal real Node inspector adapter。
- Controls / scopes。
- Debug Console watch / evaluate。

## Post-M7 共同原则

- 继续复用既有 Files / Git / Terminal / LSP / Debug API，不新增第二套 API。
- 先扩展后端 service contract，再接前端 UI；每个能力必须有 smoke 或最小系统验证。
- 不一次性追完整 VS Code parity。
- 不让 Dockview、Monaco、xterm、Debug View 或 Source Control View 拥有底层 IO/进程/协议生命周期。
- 所有路径继续走 workspace/root guard。
- 长耗时 Git / LSP / Debug 操作必须有状态、错误和 Output channel 记录。
- 用户可能丢数据或改历史的操作必须显式确认，默认只读或 preview。

## 推荐后续切片

### M7.z-B：Advanced LSP references foundation

目标：在既有 LSP gateway 中增加 references 基础能力。

建议范围：

- 后端新增 `/api/lsp/references` 与 `/ws/lsp` `references`，或在现有 interaction endpoint 中扩展同等事件；优先保持同一 gateway 模型。
- JSON 可以继续返回当前 symbol 的本文件位置，TS/JS 通过 bounded TypeScript language service 获取 references。
- 只返回 workspace root 内路径。
- 前端 Search/References 临时结果列表可以先复用 Problems/Search 样式，不做完整 References tree parity。

不做：rename、formatting、code actions、semantic tokens、project-wide server lifecycle。

### M7.z-C：LSP rename / formatting / code actions plan

目标：先研究并计划高风险 mutating LSP 能力。

建议范围：

- Rename 必须走 preview diff/apply，不允许直接改文件。
- Formatting 必须限定当前打开文件，先不做 format-on-save 默认开启。
- Code actions 必须先做 read-only preview，后续再 apply workspace edits。
- WorkspaceEdit 必须通过 Files API 和 dirty/conflict flow，不直接写磁盘。

### M7.z-D：Git remote operations foundation plan

目标：研究并计划 fetch / pull / push 的最小安全闭环。

建议范围：

- 先做 `fetch` + Output log + branch/upstream refresh。
- `pull` 只允许 clean worktree 或显式 stash/merge conflict flow。
- `push` 必须展示 remote/upstream/refspec、ahead commits、auth/error 状态。
- 不默认使用 `--autostash`；如支持必须把 stash apply 冲突作为显式状态处理。

不做：checkout/merge/rebase/stash/Git graph 同时落地。

### M7.z-E：Git checkout / merge / rebase / stash plan

目标：为会改变 working tree 或历史的 Git 操作建立安全边界。

建议范围：

- Checkout/switch branch：dirty worktree 必须阻止或进入显式 stash/commit/discard 流程。
- Merge/rebase：必须有 conflict detection、abort/continue 状态和 Output log。
- Stash：先 list/create/apply/pop/drop 的 plan，不直接和 pull 绑定。

### M7.z-F：Debug launch.json / attach parity plan

目标：扩展 Debug 但不一次性追完整 VS Code。

建议范围：

- launch profile 与 launch.json 子集映射。
- attach Node inspector 的 profile validation。
- adapter capabilities 读取和 UI gating。
- 条件断点 / logpoint 先计划后实现。

不做：多 adapter 市场、remote debug 隧道、完整 compound configurations。

## 建议优先级

1. M7.z-B LSP references foundation。
2. M7.z-C Rename / formatting / code actions plan。
3. M7.z-D Git fetch foundation plan。
4. M7.z-E Git checkout / merge / rebase / stash plan。
5. M7.z-F Debug launch.json / attach parity plan。

理由：

- LSP references 是只读能力，风险低，能复用 Search/Output/editor reveal。
- Rename/formatting/code actions 涉及 WorkspaceEdit 和 dirty/conflict，需要先计划。
- Git remote/pull/push 依赖认证、网络和冲突流，风险高于本地 status/diff/stage/commit。
- Debug parity 依赖 adapter capability gating 和 launch config 兼容策略，适合在现有 Debug hardening 后单独推进。

## 验收要求

每个后续切片必须更新：

- `.codex/project-context.md`
- `docs/ide-code-editor-solution/00-README.md`
- `docs/ide-code-editor-solution/07-终端运行语言服务Git方案.md`
- `docs/ide-code-editor-solution/08-实施阶段验收与风险.md`
- 对应 `archive/*summary.md` 或 `archive/*plan.md`

每个实现切片至少需要：

- `npm run typecheck:api -- --pretty false`
- `npm run typecheck:web -- --pretty false`
- 对应 feature smoke。
- `git diff --check`

Docs-only 切片需要：

- Touched-docs Markdown relative link check。
- `git diff --check`。

## 本阶段明确不做

- 不新增运行时代码。
- 不新增 LSP references / rename / formatting / code actions / semantic tokens。
- 不新增 Git fetch / pull / push / checkout / merge / rebase / stash / graph。
- 不扩展 Debug launch.json / attach / logpoint / conditional breakpoint parity。
- 不新增第二套 Files / Git / Terminal / LSP / Debug API。
- 不把 File Manager Online Editor 与 IDE Workbench 合并。

## 验证

M7.z-A 是 docs-only：

- Touched-docs Markdown relative link check。
- `git diff --check`。
