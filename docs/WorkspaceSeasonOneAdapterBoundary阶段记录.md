# Workspace Season One Adapter Boundary 阶段记录

日期：2026-06-29

## 目的

上一阶段已经把 Season One 预览升级为完整产品模型，但核心数据仍散落在 JSX 中。为了真正推翻旧 Workspace 框架，而不是继续写静态 UI，本阶段把第一季工作区的产品语义抽成可替换的 adapter 边界：`WorkspaceSeasonOneProductModel`。

## 新边界

新增 `apps/web/src/features/workspace/shared/WorkspaceSeasonOneProductModel.ts`：

- `WorkspaceSeasonOneProductModel`：Season One 工作区的完整 UI/UX 数据契约。
- `createWorkspaceSeasonOnePreviewModel()`：当前实验路由的默认模型。
- `WorkspaceSeasonOneActivityItem` / `WorkspaceSeasonOneResourceItem` / `WorkspaceSeasonOnePhase` / `WorkspaceSeasonOneInsightCard`：后续接真实文件、搜索、Git、terminal、agent evidence 时的薄 adapter 输入类型。
- `WorkspaceSeasonOneIconKey`：避免上游 adapter 直接依赖 lucide 组件，保持数据层和视图层分离。

## 为什么这是推翻式重构的一步

旧 Workspace 的问题不是单个按钮或颜色，而是页面结构、数据边界和交互模型耦合在一起。抽出 Season One model 后，预览不再是写死的装饰组件，而是可由真实 Workspace adapter 驱动的目标 shell：

- resources 可接文件树、搜索结果、Git diff、证据包；
- primary stage 可接编辑器、Markdown 写作、预览、diff；
- evidence rail 可接 live evidence basket 和审批状态；
- run panel 可接 terminal、测试、agent runs；
- mobileTasks 可接手机端任务切换状态。

## 验收

- 结构测试确认 preview 通过 `createWorkspaceSeasonOnePreviewModel()` 获取默认模型。
- 结构测试确认产品文案与移动任务不再依赖 JSX 字面量，而来自 product model。
- 浏览器 smoke 继续在 desktop/tablet/phone 真实 Chromium 中验证实验路由核心区域。

## 下一步

创建 live adapter：从当前 Workspace 的 root、activePath、Git diff、terminal/test/evidence 状态生成 `WorkspaceSeasonOneProductModel`，然后逐步把 `/workspace` 生产路由切到 Season One frame。
