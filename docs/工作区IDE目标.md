# 工作区 IDE 目标（兼容入口）

> 状态：Superseded by `Workspace目标.md`
> 更新：2026-06-25

旧版“工作区 IDE”目标已升级为 **Workspace-first** 目标。以后实现、设计和验收以以下文档为准：

- `整体目标.md`
- `Workspace目标.md`
- `Workspace设计文档.md`
- `Workspace架构.md`
- `Workspace前端架构.md`
- `Workspace后端设计.md`
- `文件管理设计.md`
- `终端能力设计.md`

保留本文件只是为了旧链接不失效。

## 关键修正

1. IDE 不再只是 `/ide` 全屏壳，而是 Workspace。
2. 文件管理不再拆成 `/files` 只读证据 + IDE 右键写操作。
3. 终端是 Workspace 工具，不是 CLI Agent。
4. CLI Agents 只负责 Codex / Claude Code / OpenCode runtime readiness 和 Agent Run 生命周期。
5. 手机端是单栏任务流，不是压缩 PC 多栏。
