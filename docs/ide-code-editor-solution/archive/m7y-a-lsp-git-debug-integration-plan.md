# M7.y-A LSP / Git / Debug Integration Hardening Plan

## 1. 阶段目标

M7.y-A 是 M7 / M7.x 之后的集成增强计划阶段。它不新增运行时代码，而是把已经落地的 LSP、Git、Debug 能力放在同一张路线图里重新排序，避免后续在三个复杂方向同时扩张，导致重复 API、重复 UI 壳层或验收口径失控。

本阶段回答三个问题：

1. 现有 LSP / Git / Debug 各自已经做到哪里。
2. 下一个最有价值、风险最可控的实现切片是什么。
3. 哪些能力必须继续后置，不能为了“像 VS Code”而一次性追完整。

## 2. 当前基线

### 2.1 LSP 基线

当前 LSP 是单语言 JSON foundation：

- 后端复用 `apps/api/modules/lsp/service.ts` / `routes.ts`。
- HTTP 与 WebSocket 都已走同一套 LSP service 语义。
- 已支持 JSON diagnostics、hover、completion、definition。
- diagnostics 写入既有 Problems store/panel，LSP lifecycle/error 写入既有 Output LSP channel。
- 前端复用 `apps/web/src/features/ide-workbench/lsp/` 下的 diagnostics / interaction client 与 Monaco provider。
- 现有验证脚本包括 `smoke:ide:lsp-diagnostics` 与 `smoke:ide:lsp-interaction`。

当前未做：多语言 LSP、真实 language server 进程生命周期、workspace symbols、references、rename symbol、formatting、code actions、semantic tokens 或完整 VS Code LSP 行为。

### 2.2 Git 基线

当前 Git Source Control 已形成本地基础闭环：

- 后端复用 `apps/api/modules/git/service.ts` / `routes.ts`。
- 已完成 status、Explorer decoration、Editor tab decoration、Source Control View、diff、stage、unstage、commit、branch/upstream/ahead/behind 展示。
- Git lifecycle 写入既有 Output Git channel。
- 现有验证脚本包括 `smoke:ide:git-status`、`smoke:ide:git-diff`、`smoke:ide:git-stage`、`smoke:ide:git-commit`、`smoke:ide:git-branch-upstream`。

探查确认后端已有更宽的 Git API 表面，例如 branch create/checkout、pull/push/sync/publish、stash apply/pop/drop 等，但 IDE UI 还没有把这些能力产品化为安全可验收的交互。

当前未做：push/pull/fetch/sync/publish UI、branch checkout/create/delete/rename UI、merge/rebase、stash UI、Git graph/blame、remote credential UX、冲突解决助手或完整 VS Code Source Control 行为。

### 2.3 Debug 基线

当前 Debug 已完成 M7-F 与 M7.x hardening：

- Debug Gateway skeleton + Debug View shell。
- Breakpoints + editor reveal foundation。
- 最小真实 adapter proof。
- Debug lifecycle foundation。
- Launch profile / config foundation。
- Real Node inspector adapter minimal。
- Debug controls / scopes foundation。
- Debug Console watch / evaluate foundation。
- 现有验证脚本包括 `smoke:ide:debug-foundation`、`smoke:ide:debug-breakpoints`、`smoke:ide:debug-adapter-proof`、`smoke:ide:debug-lifecycle`、`smoke:ide:debug-launch-profile`、`smoke:ide:debug-node-inspector`、`smoke:ide:debug-controls-scopes`、`smoke:ide:debug-watch-evaluate`。

当前未做：完整 DAP adapter parity、真实 DAP evaluateRequest、真实 Node inspector Runtime.evaluate、watch 自动刷新、对象树懒加载、attach/remote、compound debug、preLaunchTask、`launch.json` 完整兼容、conditional breakpoints/logpoints、sourcemap 或完整 VS Code Debug 行为。

## 3. 集成原则

后续 M7.y 不能把 LSP、Git、Debug 做成三套互不相干的独立产品壳。必须遵守：

1. **不新增第二套 API**：继续复用现有 `lsp`、`git`、`debug` backend modules 与前端 client/store。
2. **不让 Dockview / Monaco / Debug UI 拥有 IO**：Dockview 管布局，Monaco 管编辑模型，LSP/Git/Debug service 管各自协议边界。
3. **Problems / Output 是共享承载层**：diagnostics、Git lifecycle、Debug lifecycle/error/proof 输出继续进入既有 panel/channel。
4. **危险 Git 操作必须先有 UX 与安全计划**：push/pull/checkout/stash/merge/rebase 不应在没有确认、恢复路径、credential/upstream 口径前直接铺进 UI。
5. **多语言 LSP 必须研究先行**：TypeScript/JavaScript 等真实 language server 接入需要先确认协议、进程生命周期、workspace/root guard、性能与验证面。
6. **Debug 继续 proof-first**：真实 DAP/Node inspector 能力必须 behind guard / allowlist，不为了功能完整而运行任意 adapter 或表达式副作用。
7. **用户价值优先**：下一步优先补齐 IDE 真实开发中每天会碰到的语言诊断，而不是先做高风险 remote Git 或完整 Debug parity。

## 4. 推荐后续切片

### M7.y-B：TypeScript / JavaScript LSP Diagnostics Foundation（推荐下一步）

推荐下一步先做 TypeScript / JavaScript diagnostics foundation。

原因：

- 用户价值高：TS/JS 是项目自身主要代码栈，打开代码后立即看到类型/语法问题比 Git remote 或 Debug parity 更基础。
- 风险可控：可以先只做 diagnostics，不做 completion/definition/rename/formatting 全集。
- 复用面清晰：继续复用现有 LSP diagnostics -> Problems / Output / editor reveal 链路。
- 为后续 M7.y-C code action / format / semantic tokens 奠定基础。

M7.y-B 建议范围：

- 先研究并记录 TypeScript/JavaScript language service 选择：`typescript`/`tsserver`、`typescript-language-server` 或项目已有 TS 编译能力。
- 后端仍走现有 LSP module，不新增第二套 language API。
- 支持 workspace/root guard 与大文件/依赖目录排除策略。
- diagnostics 继续进入既有 Problems panel 与 Output LSP channel。
- 前端 Monaco provider 只注册必要语言，不一次性启用所有语言服务能力。
- 新增或扩展 smoke，例如 `smoke:ide:lsp-typescript-diagnostics`。

M7.y-B 不做：rename symbol、references、formatting、code actions、semantic tokens、多语言全集、完整 language server 管理 UI。

### M7.y-C：LSP interaction expansion

在 M7.y-B 稳定后，再考虑扩展 TS/JS hover / completion / definition，或进入 code actions / formatting / semantic tokens 的最小切片。

### M7.y-D：Git remote / branch / stash UX safety plan

Git 后端已有较宽 API，但 UI 前必须先做安全计划：

- pull/push/fetch/sync/publish 的确认、错误展示、credential/upstream 状态。
- checkout/create branch 的 dirty editor / uncommitted changes 保护。
- stash save/apply/pop/drop 的可恢复路径与 Output 记录。
- 后续再决定最小实现顺序。

### M7.y-E：Debug real-DAP / attach / launch.json research plan

Debug 已有 proof，但真实 DAP parity 风险高。后续应先做研究与计划：

- real DAP adapter allowlist。
- `launch.json` 子集兼容。
- attach/remote 安全边界。
- evaluate/watch 副作用策略。
- variables lazy loading 与 scopes 性能边界。

### M7.y-F：Cross-feature command / status acceptance closeout

在 LSP/Git/Debug 分别完成下一轮增强后，统一检查：

- Command menu 是否能进入关键动作。
- StatusBar 是否反映 LSP/Git/Debug 状态但不过载。
- Problems / Output channel 是否清晰区分来源。
- Editor reveal、Explorer decoration、tab decoration 是否没有互相污染。

## 5. 当前阶段不做

M7.y-A 不做任何运行时代码，也不做：

- TypeScript/JavaScript LSP 实现。
- 多语言 LSP 全集。
- Git push/pull/fetch/sync/publish/checkout/stash UI。
- Git graph/blame/merge/rebase。
- real DAP attach/remote/launch.json 完整兼容。
- Debug Console 完整 REPL 或表达式副作用执行。
- 新 LSP/Git/Debug API。
- 新依赖。
- 完整 VS Code parity。

## 6. 验收与验证口径

M7.y-A 是 docs-only 阶段，验收证据为：

- 更新阶段状态与下一步入口。
- 记录 LSP/Git/Debug 当前基线、风险和后续切片。
- `git diff --check` 通过。
- touched docs markdown 相对链接检查通过。

运行时代码验证仍由既有 smoke 矩阵覆盖，M7.y-A 不重复运行全量 smoke。下一阶段 M7.y-B 若实现 TS/JS diagnostics，则必须运行 web/api typecheck 与新增/相关 LSP smoke。
