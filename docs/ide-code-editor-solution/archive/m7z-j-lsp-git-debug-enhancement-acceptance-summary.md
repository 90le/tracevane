# M7.z-J LSP / Git / Debug enhancement acceptance closeout 验收总结

## 状态

已完成。

M7.z-J 是 post-M7 enhancement 的总体验收收口，不新增运行时代码。它汇总 M7.z-B 到 M7.z-I 的 advanced LSP、Git remote/branch/stash 与 Debug hardening 增强，确认 Tracevane IDE 已完成 M7 之后的主要 LSP / Git / Debug 基础增强闭环，并把下一阶段入口切到 M8 IDE stabilization and release-candidate plan。

## 完成能力矩阵

### LSP

已完成：

- M7.z-B：Advanced LSP references foundation。
- M7.z-C：LSP rename / formatting / code actions 安全计划。
- M7.z-F：WorkspaceEdit preview/apply foundation。
- M7.z-G：rename / formatting / code actions UI foundation。

当前 LSP 边界：

- 复用既有 LSP gateway、Monaco provider、Problems/Output 和 editor reveal。
- WorkspaceEdit 通过 preview/apply、root guard、dirty/conflict skip 和 FilesService 写回基础层收束风险。
- TypeScript / JavaScript 已具备 diagnostics、hover、definition、completion、references、rename、formatting、code action 基础。

仍后置：

- 完整多语言 LSP 管理器。
- 真实 language-server process lifecycle。
- workspace symbol、semantic tokens、call hierarchy、inlay hints 等更完整 IDE parity。
- 自动跨 dirty 文件强制写回。

### Git

已完成：

- M7.z-D：Git remote operations foundation plan。
- M7.z-E：Git remote operations foundation hardening。
- M7.z-H：Git branch / stash UI foundation。
- M7.z-I：Git branch / stash hardening and acceptance closeout。

当前 Git 边界：

- 复用现有 `apps/api/modules/git` service/routes 和 `apps/web/src/lib/api/git.ts` client。
- Source Control 已具备 status、diff、stage/unstage、commit、branch/upstream status、fetch/pull/push/publish/sync、branch list/create/checkout、stash list/save/apply/pop/drop 的受控入口。
- 高风险变更操作使用 confirmation、禁用态、错误 toast 和 Output 记录。
- branch / stash hardening 已覆盖无效 branch name、创建分支不隐式 checkout、clean repo 禁用 stash save、stash drop confirmation。

仍后置：

- force push。
- merge / rebase / conflict resolver。
- branch delete / rename / upstream set UI。
- Git graph / blame。
- credential manager。
- hunk / partial stage。
- 完整 VS Code SCM parity。

### Debug

已完成：

- M7-F-A 到 M7-F-E：DAP 研究、Debug gateway skeleton、Breakpoints、最小真实 adapter proof、Debug acceptance closeout。
- M7.x-A 到 M7.x-G：lifecycle、launch profile / config、real Node inspector adapter minimal、controls / scopes、watch / evaluate、hardening acceptance closeout。

当前 Debug 边界：

- 复用 Debug gateway / Debug View / editor reveal / Output 基础链路。
- Node inspector adapter 已有最小真实 proof 和基础 controls/scopes/watch/evaluate。
- 不把 Debug View 做成完整 VS Code Debugger。

仍后置：

- 完整 launch.json parity。
- attach 多进程 / remote debug 完整体验。
- source map 高级映射。
- conditional / logpoint / hit-count breakpoint 完整实现。
- 多语言 Debug Adapter 管理器。

## 验证矩阵

M7.z 阶段已建立并运行过的关键验证包括：

```bash
npm run smoke:ide:lsp-typescript-references
npm run smoke:ide:lsp-workspace-edit-foundation
npm run smoke:ide:lsp-rename-format-code-actions
npm run smoke:ide:git-remote-foundation
npm run smoke:ide:git-branch-upstream
npm run smoke:ide:git-branch-stash-foundation
npm run smoke:ide:git-branch-stash-hardening
npm run typecheck:api -- --pretty false
npm run typecheck:web -- --pretty false
```

M7.z-J 本身为 docs-only closeout，本次验证以 touched docs relative link check 和 `git diff --check` 为准。

## 阶段边界

M7.z-J 不做：

- 新运行时代码。
- 新 LSP/Git/Debug API。
- File Manager Online Editor 与 IDE Workbench 合并。
- 完整 VS Code parity。
- Git force push / merge / rebase。
- 完整多语言 LSP/DAP 管理器。

## 下一步

M8：IDE stabilization and release-candidate plan。

建议 M8 先做 release-candidate 级别的横向稳定化计划，而不是继续扩张功能：

1. 整理 IDE 全链路 smoke 矩阵和必跑集。
2. 梳理已知缺口、风险和 release blockers。
3. 做跨域回归：Editor / File Surface / Explorer / Terminal / Search / Problems / Output / LSP / Git / Debug。
4. 确认哪些能力进入 release candidate，哪些进入 post-M8 roadmap。
5. 清理文档阶段状态和历史过期口径。
