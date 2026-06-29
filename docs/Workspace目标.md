# Workspace 目标（已降级参考）

> 状态：Superseded reference
> 更新：2026-06-29
> 当前权威蓝图：`Workspace全球顶级AI编程IDE工作区Goal蓝图.md`

本文保留为旧 Workspace 目标的参考入口，不再作为当前实现门禁。当前阶段只以 `Workspace全球顶级AI编程IDE工作区Goal蓝图.md` 为最高执行合同：先完成真实 Web IDE 工作区本体，再讨论写作、渲染、预览等扩展线。

## 当前必须执行的定位

Workspace 首先是 Tracevane 的 **IDE-first / AI-native 编程工作区**：

```text
本地项目 + 文件管理 + 代码编辑器 + 终端 + Git + 搜索 + 命令面板 + 证据 + Agent handoff
```

它不是说明页、卡片墙、概念海报、普通聊天页，也不是把文件管理器、终端、Agent 页面和预览器拼在一起的半成品外壳。所有可见能力必须服务于真实 IDE 工作流：打开项目、编辑代码、运行命令、搜索定位、查看 Git 变更、收集证据、审查并交给 Agent。

## 当前主线能力

| 能力 | 当前阶段目标 |
| --- | --- |
| Files | 项目树、路径栏、搜索、文件管理、批量动作、移动端 action sheet。 |
| Editor | 多 tab、dirty buffer、保存/回滚、代码编辑、文件证据。 |
| Terminal | 稳定 session、输出 replay、重连、stale cleanup、task runner、移动端输入增强。 |
| Git | changes、diff、stage/unstage、commit、revert、hunk evidence。 |
| Search | 文件/内容搜索、可审查替换计划、显式写入。 |
| Commands | command palette 只暴露真实 IDE 动作；不可用动作必须禁用并说明原因。 |
| Evidence | 文件、diff、终端输出、日志、验证结果统一证据篮。 |
| Agent Handoff | 选择上下文，审查 plan/diff/命令/验证结果，再交给 Agent。 |

## 当前不作为主线

- 不建设独立写作工作区。
- 不推进渲染增强、预览主题、富媒体阅读体验。
- 不把 Markdown 实时预览、所见即所得、截图证据当作 Phase 0/1/2 验收目标。
- 不以“当前原型设计”为实现门禁；门禁是 IDE-first 蓝图、真实工作流、前后端契约、测试与可运行验证。
- 不新增说明页式、卡片墙式、第一季展示页式 Workspace。

## 响应式目标

### Desktop

```text
Activity Rail | Explorer | Editor Stage | Inspector
              |          | Bottom Panel
```

- Explorer / Inspector / Bottom Panel 可折叠、关闭、重新打开。
- Pane 尺寸、折叠状态和活动模式必须持久化记忆。
- Terminal、Diff、Git、Search 是一等 IDE 面板。
- 支持快捷键、右键菜单、command palette。

### Tablet

```text
Drawer Explorer | Main Stage | Optional Inspector Sheet
Bottom Panel as collapsible sheet
```

- 保留文件、编辑、终端、Git、搜索能力。
- Inspector 默认折叠。
- Bottom panel 支持半屏/全屏切换。

### Mobile

```text
Top Bar
Main Stage
Bottom Mode Nav: Files / Edit / Terminal / Git / Search / Evidence
```

- 手机端不是缩小版桌面 IDE。
- 多栏内容转换为模式切换或 bottom sheet。
- 文件操作走 action sheet。
- 终端全屏并提供移动输入增强栏。
- diff/approval 全屏审查。

## 分期参考

1. **Phase 0：清理归零** — 删除或降级旧目标、旧原型、说明页式 UI 与误导文案；锁定 IDE-first 蓝图。
2. **Phase 1：Workspace Shell** — 建立真实 IDE 基础布局、命令面板、可恢复状态、桌面/平板/手机结构。
3. **Phase 2：核心 IDE 能力** — 文件、编辑器、终端、Git、搜索进入闭环。
4. **Phase 3：证据与 Agent handoff** — 证据篮、diff/命令/验证审查、Agent 交接。
5. **Future：扩展线** — 写作、渲染、预览增强、富媒体阅读体验只在 IDE 基础完成后作为可插拔扩展评估。
