# M8-G RC signoff and release-candidate handoff summary

## 状态

已完成：M8-G 输出 Tracevane IDE release-candidate signoff / handoff 记录。

本阶段是 RC 交付收口与证据汇总，不新增 IDE runtime 功能，不新增 CI workflow，不新增 Files / Terminal / LSP / Git / Debug API，不创建 release branch / tag / PR。

M8 的 release-candidate 文档闭环已完成。下一步进入 **M9-A：post-M8 roadmap prioritization and branch-hygiene / release packaging decision**。

## RC handoff 范围

M8-G handoff 覆盖 M8-A 到 M8-F：

| 阶段 | 记录 | 结论 |
| --- | --- | --- |
| M8-A | [`m8-a-ide-stabilization-rc-plan.md`](./m8-a-ide-stabilization-rc-plan.md) | 定义 RC 范围、分层 smoke 矩阵和 release blocker 分类。 |
| M8-B | [`m8-b-rc-smoke-matrix-runner-summary.md`](./m8-b-rc-smoke-matrix-runner-summary.md) | 建立 `ide:rc:*` 本地矩阵 runner、npm 入口与阶段文档清理。 |
| M8-C | [`m8-c-rc-quick-gate-summary.md`](./m8-c-rc-quick-gate-summary.md) | 稳定 quick gate 的端口、BASE_URL、Vite smoke cache/watch 与失败残留清理。 |
| M8-D | [`m8-d-full-domain-rc-matrix-summary.md`](./m8-d-full-domain-rc-matrix-summary.md) | full/domain matrix 全域通过并修复 runner / smoke 稳定性 blocker。 |
| M8-E | [`m8-e-rc-acceptance-baseline-summary.md`](./m8-e-rc-acceptance-baseline-summary.md) | 固化 quick gate、domain/full matrix 分层验收策略，暂不新增 CI workflow。 |
| M8-F | [`m8-f-rc-release-checklist-summary.md`](./m8-f-rc-release-checklist-summary.md) | 固化 RC 发布清单、失败分级、日志留存、签核要求和 post-M8 roadmap freeze。 |

## 当前 RC 证据摘要

M8-D 已完成并记录以下通过证据：

```bash
node --check scripts/ide-rc-matrix.mjs
bash -n scripts/dev-web-smoke-external-api.sh
node --check tests/ide-workbench/ide-lsp-diagnostics.smoke.mjs
node --check tests/ide-workbench/ide-lsp-interaction.smoke.mjs
node --check tests/ide-workbench/ide-lsp-typescript-diagnostics.smoke.mjs
node --check tests/ide-workbench/ide-lsp-typescript-interaction.smoke.mjs
node --check tests/ide-workbench/ide-lsp-typescript-completion.smoke.mjs
node --check tests/ide-workbench/ide-lsp-typescript-references.smoke.mjs
node --check tests/ide-workbench/ide-lsp-workspace-edit-foundation.smoke.mjs
node --check tests/ide-workbench/ide-lsp-rename-format-code-actions.smoke.mjs
node scripts/ide-rc-matrix.mjs --domain=fileSurface --continue-on-error
node scripts/ide-rc-matrix.mjs --domain=terminal --continue-on-error
node scripts/ide-rc-matrix.mjs --domain=lsp --continue-on-error
node scripts/ide-rc-matrix.mjs --domain=git --continue-on-error
node scripts/ide-rc-matrix.mjs --domain=workbenchEditor --continue-on-error
node scripts/ide-rc-matrix.mjs --domain=searchProblemsOutput --continue-on-error
node scripts/ide-rc-matrix.mjs --domain=debug --continue-on-error
npm run ide:rc:quick
git diff --check
```

M8-E / M8-F / M8-G 是 docs / process 收口阶段，未重复运行 full matrix；如果要切正式 release branch 或 tag，应按 M8-F 清单重新运行 quick gate 和 release-candidate domain matrix。

## 当前提交与分支卫生

M8 相关提交：

- `427b30f5`：M8-D full/domain RC matrix 稳定化。
- `00faa076`：M8-E RC acceptance baseline / CI gate decision。
- `ca048251`：M8-F RC release checklist / post-M8 roadmap freeze。

当前分支中还存在非 IDE RC 范围提交，需要在 release branch / PR 前明确处理：

- `4e4ce5b8`：model-gateway Anthropic container upload 适配。
- `3d6a2764`：model-gateway Chat top logprobs 适配。

处理建议：

1. 如果当前分支作为 IDE RC PR，先把非 IDE model-gateway 提交 cherry-pick / rebase / split 到独立 PR，或在 PR 描述中显式标记为非 IDE 范围。
2. 如果当前分支仅作为本地阶段分支，可保留，但 release branch 应从干净 base 重新 cherry-pick IDE RC 提交。
3. 默认不自动 push、tag、创建 release branch 或 PR；这些属于外部发布动作，需要用户明确授权。

## Release blocker 结论

基于 M8-D 记录的全域 matrix 证据与 M8-F 的失败分级：

- 当前无已登记 P0 blocker。
- 当前无已登记 P1 blocker。
- post-M8 roadmap 项不作为 RC blocker。
- 正式发布前必须重新确认当前 HEAD 与 release branch scope；如果包含非 IDE 提交，需要先完成分支卫生处理或显式纳入 release scope。

## Handoff 给后续阶段

### 若继续发布候选包装

下一步可做一个非常窄的 release packaging 任务：

1. 从目标 base 创建干净 release branch。
2. 只 cherry-pick IDE RC 相关提交，或显式记录非 IDE 提交的来源与风险。
3. 重新运行 `npm run ide:rc:quick`。
4. 按需运行 full/domain matrix。
5. 再由用户确认是否 push / tag / 创建 PR。

### 若继续产品增强

进入 post-M8 roadmap 时，优先做 M9-A：

1. 按产品价值与风险排序 Git / LSP / Debug / Terminal / Workbench 后置能力。
2. 保持每个 M9 子阶段单一边界，避免再次横向扩张。
3. 不把 File Manager Online Editor 与 IDE Workbench 合成一个产品壳。
4. 不新增第二套 Files / Git / Terminal / LSP / Debug API。

建议优先候选：

- Git branch delete / rename / upstream set UI 的安全计划。
- Git graph / blame 只读 foundation。
- LSP semantic tokens / workspace symbols 计划。
- Debug attach / compound launch 计划。
- Terminal editor-like tab / view movement 计划。

## 本次没有做

- 没有新增 runtime feature。
- 没有新增 CI workflow。
- 没有运行 full/domain matrix。
- 没有 push / tag / 创建 release branch / PR。
- 没有修改 model-gateway 等非 IDE 代码。

## 验证

M8-G 为 docs / handoff 阶段，验证：

```bash
# touched docs relative link check
git diff --check
```

运行时代码与 RC matrix 证据沿用 M8-D；正式 release branch / tag 前必须重新按 M8-F 清单执行 quick gate 与 domain matrix。
