# Workspace Season One Preview Composition 阶段记录

日期：2026-06-29

## 目的

用户明确要求第一季不要继续修补旧 IDE 外壳，而是推翻并重新设计前端框架、UI/UX、产品布局和响应式体验。本阶段把 Season One 预览从“布局占位骨架”推进为更接近真实产品方向的组合预览：命令中心、任务资源地图、主工作舞台、AI 工作伙伴、写作/代码双态画布、证据审批栏、运行面板和移动端任务导航。

## 新增产品锚点

- `data-season-one-command-center`：全局命令中心与 AI handoff 入口。
- `data-season-one-resource-map`：按任务组织的文件、测试、证据和运行上下文。
- `data-season-one-primary-workstage`：第一季主工作舞台，强调单一任务 artifact。
- `data-season-one-ai-copilot`：带引用/证据约束的 AI 工作伙伴区域。
- `data-season-one-work-canvas`：写作与代码共存的工作画布雏形。
- `data-season-one-evidence-rail`：审批、证据、风险和 handoff 状态右栏。
- `data-season-one-run-panel`：终端、测试、agent runs 的底部运行面板。
- `data-season-one-mobile-navigation`：手机端单舞台任务切换导航。

## 验收

- 新增结构测试 `tests/system/workspace-season-one-preview-composition.test.mjs`，锁定第一季产品模型锚点和核心文案。
- 更新浏览器 smoke，让真实 Chromium 跨 desktop/tablet/phone 检查这些新区域是否在实验路由中渲染。

## 下一步

继续把这些预览锚点接入真实 Workspace adapter：资源地图接文件/搜索/Git，主舞台接编辑器和预览，证据栏接 live evidence basket，运行面板接 terminal/test/agent run 状态。
