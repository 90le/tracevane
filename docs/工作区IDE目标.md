# 工作区 IDE 目标（旧链接兼容入口）

> 状态：Superseded compatibility entry
> 更新：2026-06-29
> 当前权威蓝图：`Workspace全球顶级AI编程IDE工作区Goal蓝图.md`
> 当前验收合同：`WorkspaceIDE-UIUX重设计验收.md`

旧版“工作区 IDE”目标不再作为实现、设计或验收权威。保留本文件只为旧链接不失效；进入任何 Workspace 规划、实现或验收前，必须先阅读当前权威蓝图和 UI/UX 验收合同。

## 当前跳转

- `Workspace全球顶级AI编程IDE工作区Goal蓝图.md` — 当前最高 Goal 合同。
- `WorkspaceIDE-UIUX重设计验收.md` — 当前 IDE 主体、终端、Git、搜索、文件/编辑器/命令/布局、电脑端和手机端验收合同。
- `WorkspaceIDE工作区现状审计与下一步清理计划.md` — 当前工作树脏文件约束下的小步清理计划。

## 已纠正的旧误区

1. IDE 不再只是 `/ide` 全屏壳，而是 Workspace 的真实 Web IDE 工作台。
2. 当前主线不是写作、渲染、预览增强或概念原型，而是 IDE 主体、终端、Git、搜索、文件/编辑器/命令/布局。
3. 文件管理不再拆成 `/files` 只读证据 + IDE 右键写操作；文件能力必须回到 Workspace 工作流。
4. 终端是 Workspace 的一等 IDE 面板，不是 CLI Agent Run 的附属显示区。
5. CLI Agents 负责 runtime readiness 和 Agent Run 生命周期；Workspace 只接收 evidence、plan、diff、command approval 和 handoff。
6. 手机端不是压缩 PC 多栏，而是单栏任务流、模式切换和 bottom sheet。

## 不再作为当前权威

- `整体目标.md`
- `Workspace目标.md`
- 任何旧 Workspace 原型、旧重设计总纲、第一季展示页或说明页式 UI 文档
