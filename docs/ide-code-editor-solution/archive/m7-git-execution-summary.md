# M7 Git Source Control 总体验收总结

## 状态

M7 Git Source Control 能力链路已完成阶段性验收。该收口覆盖 M7-D 到 M7-E-D 已落地的 Git 基础能力，并把后续入口切换到 M7-F Debug Adapter Protocol 研究与最小实现计划。

本收口是文档与验收口径更新，不新增运行时代码，不扩大 Git 功能边界。

## 已完成能力

M7 Git 分段完成内容：

1. **M7-D：Git status + Explorer decoration + Source Control View**
   - 复用后端 `apps/api/modules/git` 和前端 `apps/web/src/lib/api/git.ts`。
   - SideBar Source Control View 展示工作区变更。
   - Explorer / Editor tab 能展示 Git 装饰状态。
   - StatusBar 能展示当前 Git 状态摘要。

2. **M7-E-A：Git Diff Foundation**
   - 从 Source Control 变更项打开 diff。
   - 复用 IDE Editor / File Surface 预览边界和 Monaco diff 基础。
   - Output Git channel 记录关键 Git 操作反馈。

3. **M7-E-B：Git stage / unstage foundation**
   - 支持变更项 stage / unstage。
   - 操作后刷新 Source Control 状态。
   - 保持文件 API 与 Git API 分层，不新增第二套 Git 接口。

4. **M7-E-C：Git commit foundation**
   - 支持 staged changes commit。
   - Commit 后刷新变更状态与 Output 反馈。
   - 不做 commit all 自动暂存或复杂提交模板。

5. **M7-E-D：Git branch / upstream status foundation**
   - Source Control / StatusBar 展示 branch、upstream、ahead/behind 和变更汇总。
   - 支持缺 upstream、detached HEAD、非 Git 仓库等状态的可解释展示。
   - 继续只读展示分支/上游状态，不实现切换或同步远端。

## 架构边界

本阶段坚持以下边界：

- Git runtime 继续由既有 `apps/api/modules/git` 承载。
- 前端继续通过既有 Git API/query 层读取状态和执行受控操作。
- Source Control View 是 IDE Workbench shell 的 Git 产品壳，不复用 File Manager Online Editor 产品壳。
- Explorer decoration、Editor tab decoration、Diff、Output 与 StatusBar 复用各自已有基础能力。
- 不新增第二套 Git API、文件 API、Source Control 数据模型或 Monaco diff 所有权边界。

## 明确未做，后置到未来阶段

M7 Git 收口后仍不包含：

- push / pull / fetch / sync / publish。
- branch checkout / create / delete / rename。
- merge / rebase / stash。
- hunk stage / partial stage / conflict hunk editor。
- Git graph / blame / timeline。
- credentials / remote auth / account integration。
- 完整 VS Code Source Control 行为。
- Debug Adapter Protocol、breakpoints、variables、debug console。

这些能力需要后续独立阶段设计与验收，不能在 Git closeout 中顺手扩展。

## 验收证据

M7 Git 各分段已有阶段性 smoke 证据：

- `npm run smoke:ide:git-status`
- `npm run smoke:ide:git-diff`
- `npm run smoke:ide:git-stage`
- `npm run smoke:ide:git-commit`
- `npm run smoke:ide:git-branch-upstream`

本次 closeout 为文档收口，验证重点是：

- Markdown 相对链接检查覆盖本次 touched docs。
- `git diff --check`。

## 下一步入口

下一阶段进入 **M7-F-A：Debug Adapter Protocol 研究与最小实现计划**。

M7-F-A 应先做协议、依赖、后端 runtime 边界和前端 Workbench Debug shell 的研究与计划；不要直接实现完整 VS Code Debug，也不要回头扩大 M7 Git 范围。
