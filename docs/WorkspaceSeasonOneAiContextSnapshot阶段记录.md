# Workspace Season One AI Context Snapshot 阶段记录

日期：2026-06-29

## 本阶段目标

继续把第一季 Workspace 从“静态预览壳”推进为“真实工作区状态驱动的新 IDE 前端框架”。本阶段接入现有 AI 上下文篮，让新的 Season One 架构能知道当前 AI 编程/写作任务已经附带多少文档上下文，而不是只展示演示数据。

## 设计判断

- 不修改旧 Workbench、旧编辑器、旧 AI Context Basket 文件，避免被旧框架牵引，也避免提交其他人正在改的代码。
- 在 `useWorkspaceSeasonOneLiveModel` 内新增 `createWorkspaceSeasonOneAiContextSnapshot`，把已有 localStorage 数据转换为 Season One 的产品模型输入。
- `WorkspaceSeasonOneLiveAdapter` 增加 `aiContextItems`，把 AI 上下文数量展示到资源摘要、AI Partner context、资源列表和空状态文案里。
- Evidence 仍然覆盖 AI context 的 agent state：有证据时进入 `waiting-review`；只有 AI context 时进入 `drafting`，符合“先上下文、再证据、后审批”的一流 AI 工作区闭环。

## 复用与边界

- 复用现有 `WORKSPACE_AI_CONTEXT_BASKET_STORAGE_KEY`，不新增存储协议。
- 复用 Season One snapshot/adapter seam，不直接耦合旧组件 UI。
- 仅对 AI Context Basket 的稳定数据形状做只读过滤：`kind/id/path/title/context/addedAt`。

## 验收计划

- `tests/workspace/workspace-season-one-source-snapshot.test.ts`：验证 AI context snapshot 解析、过滤、空状态与合并保留。
- `tests/workspace/workspace-season-one-live-adapter.test.ts`：验证产品模型展示 AI context 数量、资源项和 blocked/ready 状态。
- `tests/system/workspace-season-one-live-model-hook.test.mjs`：锁定 hook 继续通过可替换 snapshot seam 接入真实状态。
- 浏览器 smoke 继续保证 desktop/tablet/phone 不破坏。

## 风险

- 目前仍是 localStorage 只读快照，尚未订阅 basket update 事件；后续 live hook 可加入事件触发刷新。
- 还未接入 terminal/test run 的真实服务状态；下一阶段应继续推进 run panel 数据源。
