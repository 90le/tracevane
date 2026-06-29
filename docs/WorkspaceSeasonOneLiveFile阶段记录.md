# Workspace Season One Live File 阶段记录

日期：2026-06-29

## 本阶段目标

默认 Workspace 已经进入 Season One 新框架后，下一步必须避免它停留在“漂亮展示壳”。本阶段把真实 Files API 的活动文件读取接入 Season One，让主舞台显示当前活动文档内容摘要与代码/文本预览。

## 实现

- `useWorkspaceSeasonOneLiveModel` 接入 `useFileReadQuery`。
- 新增 `createWorkspaceSeasonOneActiveFileReadParams`，从 Season One source snapshot 派生只读文件请求。
- 新增 `createWorkspaceSeasonOneActiveFileContentSnapshot`，把 `FilesReadPayload` 转成 Season One adapter 输入。
- `WorkspaceSeasonOneLiveAdapter` 新增：
  - `activeContent`
  - `activeContentLanguage`
  - `activeContentLabel`
  - `activeContentEditable`
- 主舞台现在在读取成功后显示：
  - `Live document loaded from DESIGN.md`
  - `Live file preview: DESIGN.md`
  - 文件行数/令牌数/字节快照

## 关键修正

最初默认活动文件使用 `docs/DESIGN.md`，真实 `project-root` 下该路径不存在，Files API 返回 `Requested path was not found`。已改为根目录真实存在的 `DESIGN.md`，浏览器探测确认：

- `/api/files/summary` 返回 `project-root`
- `/api/files/read?rootId=project-root&path=DESIGN.md&limit=16000` 返回 200
- 默认 `#/workspace` 页面显示 `Live file preview: DESIGN.md`

## 验收

- 单元/契约测试覆盖 active file read params、content snapshot、adapter 文案。
- 默认入口 smoke 等待并验证真实 live file preview。
- desktop/tablet/phone responsive smoke 等待并验证真实 live file preview。

## 后续

下一阶段应继续迁移真实编辑能力：从只读 live preview 进入受控编辑草稿、diff preview、evidence-gated apply，而不是回退旧 Workbench。
