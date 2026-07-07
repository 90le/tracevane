# M9-B Git branch management safety plan

## 状态

已完成：M9-B 审计现有 Git service / client / Source Control View，并定义 branch delete / rename / upstream set 的安全计划。

本阶段只做计划与边界，不新增 Git API，不实现 UI，不执行危险 Git 写操作，不处理非 IDE model-gateway 改动。

下一步建议进入 **M9-C：Git branch management guarded implementation**，先实现后端受控 API 与 smoke，再接 UI；如果要发布 RC，则仍优先处理 M9-A 的 branch hygiene / release packaging。

## 当前代码审计结论

### 后端 Git service

已存在：

- `apps/api/modules/git/routes.ts`
  - `GET /api/git/status`
  - `GET /api/git/diff`
  - `GET /api/git/commit-detail`
  - `GET /api/git/stashes`
  - `POST /api/git/stage`
  - `POST /api/git/unstage`
  - `POST /api/git/commit`
  - `POST /api/git/branches`：create branch。
  - `POST /api/git/checkout`：checkout branch/ref。
  - `POST /api/git/fetch` / `pull` / `push` / `sync` / `publish`。
  - `POST /api/git/stashes` / `apply` / `pop` / `drop`。
- `apps/api/modules/git/service.ts`
  - root / path guard：`resolveGitDirectory`、`resolveRepositoryRoot`、`isPathInside`。
  - ref guard：`normalizeGitRefName`、`normalizeOptionalRemoteRef`。
  - path guard：`normalizeRepositoryPath(s)`。
  - existing branch ops：`createBranch`、`checkout`。
  - remote ops：`fetch`、`pull --ff-only`、`push`、`sync`、`publishBranch`。
  - stash ops：`saveStash`、`applyStash`、`popStash`、`dropStash`。

缺口：

- 没有 `deleteBranch` API。
- 没有 `renameBranch` API。
- 没有 `setUpstream` / `unsetUpstream` API。
- `GitStatusPayload.branches` 有 branch/upstream 列表，可作为 UI target source，但没有 per-branch safety metadata。

### 前端 Git client / query

已存在：

- `apps/web/src/lib/api/git.ts`
  - typed API bindings for status/diff/commit/stage/unstage/commit/create/checkout/fetch/pull/push/sync/publish/stash。
- `apps/web/src/lib/query/git.ts`
  - query keys and mutation invalidation for Git surface。

缺口：

- 没有 branch delete / rename / upstream set typed client。
- 没有对应 mutation hook。

### IDE Source Control View

已存在：

- `apps/web/src/features/ide-workbench/git/IdeSourceControlView.tsx`
  - branch summary / upstream / ahead-behind。
  - branch create input。
  - branch checkout per row，dirty worktree 时用 `window.confirm`。
  - fetch/pull/push/publish/sync gated by status/upstream/ahead/behind。
  - stash save/apply/pop/drop with confirm for destructive operations。

缺口：

- branch rows 没有 action menu。
- 没有 delete / rename / set upstream / unset upstream UI。
- 当前 confirmation 是基础 `window.confirm`，后续危险 branch 操作应使用更明确的确认文案或 confirmation phrase。

## 操作分级

### Safe / low-risk

- refresh status。
- fetch。
- copy branch name / upstream label。

### Medium-risk

- create branch without checkout。
- checkout clean worktree branch。
- set upstream / unset upstream：不改工作区文件，但会改变 branch tracking metadata。

### High-risk

- checkout dirty worktree branch。
- rename current branch：可能影响 publish/push/upstream mental model。
- delete merged local branch：删除 ref，但通常可从 history 找回。

### Destructive / requires strong guard

- delete unmerged branch。
- force delete branch。
- rename branch with existing target collision。
- upstream set to unexpected remote branch。

M9-C 默认不做 force delete。若未来需要，必须单独阶段和 confirmation phrase。

## M9-C 推荐后端 API

保持复用 `apps/api/modules/git`，不新增第二套 Git API。

### Shared request types

建议在 `types/git.ts` 增加：

```ts
export interface GitDeleteBranchRequest extends GitRepositoryRequest {
  name?: string;
  force?: boolean;
  expectedCurrentBranch?: string;
  expectedClean?: boolean;
}

export interface GitRenameBranchRequest extends GitRepositoryRequest {
  oldName?: string;
  newName?: string;
  expectedCurrentBranch?: string;
}

export interface GitSetUpstreamRequest extends GitRepositoryRequest {
  branch?: string;
  upstream?: string;
  unset?: boolean;
  expectedCurrentBranch?: string;
}
```

### Routes

建议：

- `POST /api/git/branches/delete`
- `POST /api/git/branches/rename`
- `POST /api/git/branches/upstream`

全部返回 refreshed `GitStatusPayload`，与当前 Git mutation 一致。

### Service methods

建议：

```ts
deleteBranch(rootId, directoryPath, name, options): GitStatusPayload
renameBranch(rootId, directoryPath, oldName, newName, options): GitStatusPayload
setBranchUpstream(rootId, directoryPath, branch, upstream, options): GitStatusPayload
unsetBranchUpstream(rootId, directoryPath, branch, options): GitStatusPayload
```

实现仍使用 `runGit(repositoryRoot, args)`，但先做 safety checks。

## M9-C 必须实现的 guard

### 通用 guard

- 复用 `resolveRepositoryRoot`，确保 root/directory 在 allowed root 内。
- 复用 `normalizeGitRefName`，拒绝空值、空白、`..`、`//`、`-` 开头、超长 ref、非法字符。
- 不接受任意 shell string；所有 git 参数必须数组化。
- 操作后返回 `buildStatus`。

### Dirty worktree guard

Branch delete / rename / upstream set 理论上不直接改工作区文件，但 UI 用户预期仍会受当前变更影响。

建议：

- 后端提供 helper：`getStatus(...).clean` 或直接检查 porcelain。
- 对 delete/rename/upstream set 默认允许 dirty，但 response/error message 需明确当前 dirty 状态。
- UI 对 dirty worktree 显示 warning。
- Checkout dirty 已有 confirm，保持不混入本阶段。

### Delete branch guard

默认只允许 safe delete：

- 禁止删除当前 branch。
- 禁止删除 `HEAD` / empty / detached pseudo branch。
- 默认使用 `git branch -d <name>`，不使用 `-D`。
- 当 Git 因 unmerged branch 拒绝时，把错误返回 UI；M9-C 不做 force delete。
- 禁止删除 remote-tracking branch（如 `origin/foo`）；只做 local branch delete。
- UI confirmation 至少包含 branch name，建议用户输入 branch name 才允许删除。

### Rename branch guard

- 禁止 oldName empty / HEAD。
- newName 必须通过 `normalizeGitRefName`。
- 禁止 oldName === newName。
- 先检查 target branch 不存在，避免覆盖。
- 如果 rename current branch：使用 `git branch -m <newName>`。
- 如果 rename non-current branch：使用 `git branch -m <oldName> <newName>`。
- 若 oldName 有 upstream，M9-C 不自动重写 upstream；UI 显示 rename 后需重新检查 upstream。

### Upstream guard

- branch 必须是 local branch。
- upstream 必须是 remote-tracking ref 或 `<remote>/<branch>` 风格 ref。
- `unset` 使用 `git branch --unset-upstream <branch>`。
- set 使用 `git branch --set-upstream-to <upstream> <branch>`。
- 禁止在 detached HEAD 上设置 current branch upstream。
- 若 upstream 不存在，返回 Git 错误，不隐式 fetch。

## UI 计划

在 `IdeSourceControlView` branch row 增加 branch action menu，而不是堆独立按钮：

- Checkout（已有能力，可迁入菜单或保留主按钮）。
- Rename。
- Delete。
- Set upstream。
- Unset upstream。
- Copy branch name。

交互建议：

- 当前 branch：禁用 Delete；允许 Rename / Set upstream / Unset upstream。
- 非当前 branch：允许 Delete / Rename / Checkout。
- Delete：使用强确认，至少要求输入 branch name。
- Rename：输入 new branch name，并显示 validation。
- Set upstream：从现有 branches/upstream 文本无法完整列 remote-tracking refs；M9-C 可先提供手输 upstream，M9-D 再做 remote branch picker。
- 所有操作成功后 refresh Git surface and stashes。
- 所有失败写入 Output channel + toast。

## Smoke / verification 计划

建议新增：

```bash
npm run smoke:ide:git-branch-management
```

覆盖最小安全路径：

1. 进入 `/ide`。
2. 读取 Source Control branch list。
3. 创建临时 branch。
4. Rename 临时 branch。
5. Set upstream 对不存在 upstream 返回明确错误，不白屏。
6. Delete clean merged/local 临时 branch。
7. 尝试删除 current branch 被拒绝。
8. 尝试非法 branch name 被拒绝。
9. Source Control 刷新后仍可用。

后端最小系统验证可用临时 repo 直接测 `apps/api/modules/git/service.ts`，避免真实工作区污染。

## 本次没有做

- 没有新增 branch delete / rename / upstream API。
- 没有新增 UI。
- 没有执行 Git 写操作。
- 没有新增 smoke。
- 没有处理非 IDE model-gateway 改动。

## 下一步

M9-C 建议只做 guarded implementation：

1. 先加 shared types + backend service/routes。
2. 增加后端临时 repo 覆盖或最小 smoke。
3. 再加 frontend api/query binding。
4. 最后接 Source Control branch action menu。
5. 验证 `npm run typecheck:api -- --pretty false`、`npm run typecheck:web -- --pretty false`、新增 Git branch management smoke、`git diff --check`。
