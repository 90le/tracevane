# P1-A-5 Persistence / Terminal Clipboard Checklist Summary

日期：2026-07-08

## 完成口径

P1-A-5 目标是补齐远程代码工作台主链路里“刷新 / 重置布局 / 换浏览器上下文后不丢工作上下文”的自动验收，并把终端剪贴板 / 文件粘贴路径明确纳入 release checklist。

本阶段新增自动化验证：

- `smoke:ide:mainline-persistence`
  - 进入 `/ide/:rootId`。
  - 用户主动进入 Explorer 子目录后，刷新页面仍停留在该目录。
  - 打开的 Editor tab 在刷新页面、重置布局和新浏览器上下文后仍保留。
  - dirty tab metadata 在刷新页面、重置布局和新浏览器上下文后仍保留，避免 reset layout 被误用为“关闭工作区”。
  - Panel 从 bottom 移动到 right 后可持久化；Reset layout 只恢复布局 placement，不清空打开文件或终端 descriptor。
  - Terminal tab / pane descriptor 在 reload、reset layout 和新浏览器上下文后仍可恢复到同一 active terminal id。

已有自动化验证继续作为互补覆盖：

- `smoke:ide:terminal-persistence`：覆盖 terminal split/group layout metadata、pinned/resumable descriptor 与 panel placement 持久化。
- `smoke:ide:terminal-foundation`：覆盖 terminal create/input/output/resize/close/kill、非法 cwd/shell 拒绝，以及浏览器剪贴板文件/图片粘贴到 workspace-scoped terminal temp 目录并插入路径的自动路径。
- `smoke:ide:responsive-mainline`：继续覆盖窄屏主链路，并新增 Explorer 长文件列表可滚动断言，防止侧边资源管理器被后续布局改动撑破或失去滚动能力。

## Terminal clipboard / desktop integration checklist

自动化覆盖有限，release 前仍需要按桌面环境手测以下矩阵：

| 场景 | 期望 |
| --- | --- |
| Linux/WSL + Chrome 终端选中文字后执行“复制选中内容” | 系统剪贴板可在终端外粘贴该文本 |
| Linux/WSL + Edge 终端选中文字后执行“复制选中内容” | 系统剪贴板可在终端外粘贴该文本 |
| 终端右键菜单复制 / 粘贴 | 菜单为实体 panel，不透明，不被 xterm 默认右键行为吞掉 |
| 系统文件管理器复制文件后在 IDE Explorer 粘贴 | 复用文件管理器上传/粘贴上传路径，不误触普通文本粘贴 |
| 系统文件管理器复制图片后在 IDE Explorer 粘贴 | 上传到当前 Explorer 目录或明确提示浏览器权限限制 |
| 系统文件管理器复制文件/图片后在 Terminal 粘贴 | 上传到 workspace-scoped terminal temp 目录，并向 active terminal 插入 shell-escaped path |
| Explorer 文件拖拽到 Terminal | 插入 shell-escaped path，不改变 terminal cwd |
| 浏览器 Clipboard API 不可用 / 无权限 | 给出明确提示，不静默失败 |

## 没做什么

P1-A-5 不做：

- 新 Terminal API 或新的 PTY/session model。
- Terminal split/group 新能力、right/bottom placement 新能力或高级 view movement。
- Git / LSP / Debug 新能力。
- 完整离线草稿内容恢复系统。本阶段自动验收 dirty metadata 和工作上下文不丢；完整 unsaved content durable draft 仍归入后续 Save / Dirty / Conflict hardening。
- 新的文件上传 API；继续复用现有 File Manager / Files API / Terminal temp upload 路径。

## 验证

- `npm run typecheck:web -- --pretty false`
- `npm run smoke:ide:mainline-persistence`
- `npm run smoke:ide:terminal-persistence`
- `npm run smoke:ide:terminal-foundation`
- `npm run smoke:ide:responsive-mainline`
- `git diff --check`

## 下一阶段

下一步进入 `P1 TS/JS Web Stack Experience Hardening`：聚焦 TS/JS/JSON/HTML/CSS/ESLint 的高频真实改代码体验，而不是继续扩张 terminal advanced layout、Debug parity 或 heavy provider rich interactions。
