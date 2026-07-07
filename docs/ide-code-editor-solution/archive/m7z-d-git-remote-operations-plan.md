# M7.z-D：Git remote operations foundation plan

## 状态

M7.z-D 已完成为 **docs-only 研究、现状审计与最小实现计划**。

本阶段不新增运行时代码，不扩张新的 Git API，也不把 push/pull/sync/publish 直接暴露为完整 VS Code parity。目标是先把 Git remote 操作的官方语义、本地已有代码表面、必要安全门禁、UI/测试切片和下一阶段验收口径写清楚。

下一阶段入口：**M7.z-E Git remote operations foundation hardening**。

## 官方 Git 依据

本阶段核对官方 Git 文档：

- [`git-fetch`](https://git-scm.com/docs/git-fetch.html)：下载 objects/refs，更新 remote-tracking branches 和 `.git/FETCH_HEAD`，通常不直接修改 working tree。
- [`git-pull`](https://git-scm.com/docs/git-pull)：先 fetch，再把远端分支集成到当前分支；Tracevane 第一阶段应限制为 `--ff-only`，避免隐式 merge/rebase。
- [`git-push`](https://git-scm.com/docs/git-push)：推送 refs 到 remote；支持 `--dry-run`、`--porcelain`、fast-forward safety、`--force-with-lease` 等安全/机器可读语义。
- [`git-remote`](https://git-scm.com/docs/git-remote)：管理 tracked repositories、remote URLs、remote-tracking refs 和 remote HEAD。

关键结论：

- `fetch` 是最低风险的 remote 基础动作，适合作为第一个可运行闭环。
- `pull` 会集成远端内容，必须避免隐式 merge/rebase；第一阶段只允许 fast-forward-only。
- `push` 会改变远端状态，必须有明确 remote/branch/upstream、dry-run/preview、确认、失败原因展示和 credentials 失败处理。
- `sync` 是组合动作，不应该先于 fetch/pull/push 单步验证成熟。
- `publish` 会创建 upstream 关系，必须显式确认 remote/branch，并处理 branch 已存在/权限不足/认证失败。

## 当前本地代码审计

本地已经存在 Git remote 相关表面：

- `apps/api/modules/git/routes.ts`
  - 已有 `POST /api/git/pull`
  - 已有 `POST /api/git/push`
  - 已有 `POST /api/git/sync`
  - 已有 `POST /api/git/publish`
- `apps/api/modules/git/service.ts`
  - `pull()` 当前使用 `git pull --ff-only ...`。
  - `push()` 当前使用 `git push ...`。
  - `sync()` 当前执行 `pull --ff-only` 后 `push`。
  - `publishBranch()` 当前执行 `git push --set-upstream remote branch`。
- `apps/web/src/lib/api/git.ts`
  - typed client 已绑定 `pullBranch` / `pushBranch` / `syncBranch` / `publishBranch`。
- `apps/web/src/features/ide-workbench/git/IdeSourceControlView.tsx`
  - 当前 Source Control 主要展示 status / branch / upstream / ahead-behind / stage / unstage / commit；remote 操作 UI 尚未正式验收。

这意味着 M7.z-E 不应该从零新建第二套 Git remote API，而应该：

1. 审计并收紧已有 API。
2. 增加 fetch/remote summary 等缺口，而不是复制 service。
3. 给既有 pull/push/sync/publish 加状态、日志、测试和 UI 门禁。
4. 明确哪些已有接口暂时仍为 internal/未暴露 UI，直到 smoke 证明可靠。

## 风险与安全边界

### 1. credentials / auth

Git remote 操作可能触发 SSH、credential helper、token、passphrase 或网络失败。Tracevane 当前不应实现自有凭据库。

第一阶段策略：

- 使用系统 Git / credential helper 的结果，不长期存储 token、password、passphrase。
- 后端只捕获退出状态、stderr 摘要和安全裁剪后的输出。
- 前端显示“认证失败 / 权限不足 / 网络失败 / remote 不存在”等可解释状态。
- 不在 Output channel 保存完整敏感 remote URL 或 token。

### 2. dirty working tree / opened editor

`pull --ff-only` 仍可能因本地修改、未提交文件、索引状态或冲突风险失败。

第一阶段策略：

- pull/sync 前读取 `GitStatusPayload`，若有 unstaged/staged/untracked 变更，UI 必须提示风险。
- fast-forward-only 失败时不自动 merge/rebase/stash。
- 任何导致 working tree 变化的成功操作后必须刷新 Git status、Explorer watcher、opened editor metadata。
- dirty Monaco 内容继续由 IDE Editor 的 dirty/save/conflict 流程保护，Git service 不直接写 editor model。

### 3. remote state mutation

push/publish 改变远端仓库状态。

第一阶段策略：

- push 前优先 dry-run / preview，至少获取 remote/branch/upstream/ahead-behind。
- 不支持 force push；`--force` 禁止。
- 未来如支持 force-with-lease，必须单独阶段、二次确认和明确 expected remote ref。
- publish branch 必须显示 remote、branch、本地 HEAD、将设置 upstream 的说明。

### 4. sync 组合动作

sync = pull + push，失败语义复杂。

第一阶段策略：

- UI 中 sync 后置，先完成 fetch/pull/push/publish 单步。
- 如果保留已有 `/api/git/sync`，下一阶段必须明确状态：experimental/internal 或受确认门禁保护。
- sync 不应在 pull 失败后继续 push。
- sync 输出必须拆分 pull 阶段和 push 阶段结果。

## 推荐 M7.z-E 实现切片

### A. Remote summary / fetch foundation

优先新增或正式验收：

- `GET /api/git/status` 中的 remote/upstream/ahead/behind 已有；评估是否够 UI 使用。
- 如缺失，补只读 remote summary：remote names、fetch URL 是否存在、push URL 是否存在、current upstream。
- 增加 `POST /api/git/fetch` 或收紧既有服务中的 fetch 方法。
- fetch 使用 explicit remote 优先，默认 upstream/origin 必须可解释。
- fetch 完成后刷新 status 和 Output channel。

验收：

- 非 Git repo 返回 unavailable。
- 无 remote 时有清晰提示。
- fetch origin 成功后 ahead/behind 刷新。
- 网络/认证失败不泄漏 token。

### B. Push dry-run / guarded push

在正式 UI push 前补：

- push dry-run 或 preview 结果。
- 禁止 force push。
- 解析 machine-readable / porcelain 输出，形成成功、up-to-date、rejected、remote rejected、remote failure 等状态。
- push 前显示 remote/branch/upstream/ahead commits。

验收：

- up-to-date push 可显示无需推送。
- non-fast-forward rejection 可解释。
- authentication/network failure 可解释。
- remote mutation 必须经用户显式点击确认。

### C. Pull fast-forward only

收紧已有 `pull --ff-only`：

- pull 前检查 working tree 状态。
- 有本地变更时 UI 提示，不自动 stash/merge/rebase。
- pull 只允许 fast-forward-only；失败后 Output 写明确原因。

验收：

- clean + behind 可 fast-forward。
- diverged 时失败并提示需要手动处理。
- dirty working tree 不被静默覆盖。

### D. Publish branch

对已有 `publishBranch()` 做正式 UI/测试闭环：

- 当前 branch 无 upstream 时显示 Publish Branch。
- remote 默认 `origin`，但必须允许确认/选择。
- 成功后 branch summary 显示 upstream。
- 失败不丢本地 commit。

### E. Sync 后置

只有当 fetch/pull/push/publish 均有 smoke 后，才考虑 UI 暴露 sync。

第一版可保留 API 但 UI 不展示，或展示为受确认保护的高级动作。

## UI / Source Control 建议

Source Control View 顶部建议逐步增加：

- Fetch 按钮：低风险，可先落地。
- Pull 按钮：仅在 behind > 0 时主显，dirty 时提示。
- Push 按钮：仅在 ahead > 0 或 publish needed 时主显。
- Publish Branch：无 upstream 时替代 Push。
- Sync：后置，或仅在清晰 remote/upstream 且 clean 状态下显示。

所有 remote 操作应写入 Output `Git` channel：

- command category（fetch/pull/push/publish/sync）
- target remote/branch（裁剪敏感 URL）
- status result
- rejected/failure reason

## 本阶段明确不做

- 不实现新的 runtime 行为。
- 不新增第二套 Git API。
- 不把 pull/push/sync/publish 标记为完整已验收能力。
- 不实现 credential manager / token storage / SSH key 管理。
- 不实现 checkout/create/delete/rename branch 的完整 UI 扩展。
- 不实现 merge/rebase/stash conflict automation。
- 不实现 Git graph / blame / timeline / PR provider。
- 不实现 force push 或 force-with-lease。
- 不实现多 remote group push。
- 不做新的 LSP mutation runtime 或 Debug parity 工作。

## 验收记录

M7.z-D 是 docs-only 阶段，验证范围为：

- touched docs Markdown relative link check。
- `git diff --check`。

Runtime Git smoke、remote network smoke 和 Source Control UI smoke 留给 M7.z-E。
