# M9-A post-M8 roadmap prioritization and branch-hygiene / release packaging decision

## 状态

已完成：M9-A 对 post-M8 roadmap 做优先级排序，并给出当前分支卫生与 release packaging 决策。

本阶段只做 roadmap / branch hygiene / release packaging plan，不新增 IDE runtime 功能，不新增 CI workflow，不修改 Files / Terminal / LSP / Git / Debug API，不处理非 IDE model-gateway 改动。

下一步建议进入 **M9-B：Git branch management safety plan**，前提是继续产品增强；如果目标改为发布 RC，则先执行本文的 release packaging branch hygiene 步骤。

## 当前分支卫生结论

当前本地分支包含 IDE RC 文档与矩阵稳定化提交，也包含非 IDE model-gateway 提交/未提交改动。发布或 PR 前必须先决定分支策略。

### 已知 IDE RC / handoff 相关提交

- `427b30f5`：M8-D full/domain RC matrix 稳定化。
- `00faa076`：M8-E RC acceptance baseline / CI gate decision。
- `ca048251`：M8-F RC release checklist / post-M8 roadmap freeze。
- `d1a8a289`：M8-G RC signoff / handoff。

### 已知非 IDE 范围提交/改动

- `4e4ce5b8`：model-gateway Anthropic container upload 适配。
- `3d6a2764`：model-gateway Chat top logprobs 适配。
- 当前未提交：`apps/api/modules/model-gateway/anthropic-chat-adapter.ts`。
- 当前未提交：`tests/system/model-gateway-service.test.mjs`。

### 决策

1. **如果要发 IDE RC / PR：** 不应直接用当前混合分支发布。
   - 从目标 base 创建干净 release branch。
   - 只 cherry-pick IDE RC commits，或把非 IDE commits 明确拆到独立 PR。
   - 在干净 release branch 上重新运行 M8-F 清单中的 quick gate / domain matrix。
2. **如果继续 IDE post-M8 功能：** 可以继续在当前工作树规划，但每个 IDE 提交必须只 stage IDE 范围文件。
   - 非 IDE model-gateway 改动不得混入 IDE 阶段提交。
   - 每个提交前检查 `git diff --cached --name-status`。
3. **默认不自动 push / tag / create PR。** 这些都是外部发布动作，需要用户明确授权。

## post-M8 roadmap 优先级

优先级以“用户可见价值 + 风险边界 + 复用现有基础 + 不重新横向扩张”为准。

### P1：Git branch management safety plan / foundation

建议下一阶段 M9-B 先做 Git branch management safety plan，而不是直接实现全部 Git parity。

目标：补齐当前 Git branch / stash foundation 之后最自然的安全边界：

- branch delete UI plan。
- branch rename UI plan。
- upstream set / unset UI plan。
- 远端分支/本地分支风险提示。
- root / repo guard、dirty worktree guard、confirmation phrase、dry-run/preview 边界。
- 不做 force push、merge/rebase、Git graph/blame。

原因：

- 已有 Git status、fetch/pull/push/sync/publish、branch/stash UI 和 hardening 基础。
- branch delete/rename/upstream set 是 M8-F 明确冻结到 post-M8 的 Git 项，风险可被小阶段计划先约束。
- 先写安全计划可避免把危险 Git 操作直接推入 UI。

### P2：Git graph / blame read-only foundation

只读价值高、写入风险低，但 UI/性能面较大，应在 branch management safety plan 之后。

边界：

- 只读 commit graph / blame foundation。
- 不做 rebase/merge/cherry-pick/write operations。
- 不做完整 VS Code Source Control parity。

### P3：LSP semantic tokens / workspace symbols plan

用户体验价值高，但可能涉及性能、缓存和多语言边界。

边界：

- 先计划 semantic tokens 与 workspace symbols 的 provider 边界。
- 继续复用现有 LSP/TS provider/Problems/Output/Editor reveal。
- 不一次性承诺 all languages 或 tsserver 进程化替代。

### P4：Debug attach / compound launch plan

Debug 能力后续价值高，但 DAP parity 面很宽，必须保持计划先行。

边界：

- attach / compound launch / launch profile schema 计划。
- 不追 reverse debugging、完整 variable editing、完整 adapter matrix。

### P5：Terminal editor-like tab / view movement plan

和 Workbench layout、Dockview、terminal lifecycle 交叉较多，建议等 Git/LSP/Debug post-M8 首轮稳定后再排。

边界：

- 先计划 Terminal editor-like tab 和 View Movement。
- 不做 Secondary SideBar / full VS Code View Movement parity。

## M9 阶段边界

M9 不应变成“补齐所有 VS Code parity”。每个 M9 子阶段必须满足：

- 一个阶段只解决一个明确能力族。
- 先 plan / risk / smoke 再实现危险写操作。
- 不新增第二套 Files / Git / Terminal / LSP / Debug API。
- 不把 File Manager Online Editor 和 IDE Workbench 合并。
- 不把 post-M8 全量路线变成当前阶段 blocker。

## 推荐下一步

### 默认下一步：M9-B Git branch management safety plan

建议先做 docs / plan 阶段：

1. 阅读现有 Git service/client/Source Control View 与 M7.z-H/I summary。
2. 审计 branch delete / rename / upstream set 可复用接口和缺口。
3. 定义危险操作 confirmation、dry-run/preview、dirty worktree guard、remote tracking guard。
4. 输出 archive summary，不直接实现写操作。

### 如果用户要求发布 RC

先做 release packaging branch hygiene：

1. 处理或隔离当前非 IDE model-gateway 未提交改动。
2. 从目标 base 创建干净 release branch。
3. cherry-pick IDE RC commits。
4. 重新运行 `npm run ide:rc:quick`。
5. 按 M8-F 清单运行 release-candidate domain matrix。
6. 用户确认后再 push / tag / create PR。

## 本次没有做

- 没有新增 runtime feature。
- 没有新增 Git branch delete / rename / upstream set UI。
- 没有新增 CI workflow。
- 没有处理或提交非 IDE model-gateway 改动。
- 没有 push / tag / create release branch / PR。

## 验证

M9-A 为 docs / planning 阶段，验证：

```bash
# touched docs relative link check
git diff --check
```
