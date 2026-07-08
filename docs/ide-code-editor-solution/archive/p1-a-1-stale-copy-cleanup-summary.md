# P1-A-1 User-facing Stale Copy Cleanup Summary

## 状态

已完成。P1-A-1 是 P1-A hardening 的第一个实现切片，只清理 IDE 用户界面中残留的工程阶段名、placeholder 文案和“后续阶段”提示，不新增功能、不改文件/终端/Git/LSP 行为。

## 完成内容

清理了以下用户可见区域：

- Output 空状态：从 “M6-E channel/log 基础” 改为用户能理解的日志说明。
- Problems 空状态：从 “M6-E 结构化问题面板基础” 改为问题来源说明。
- Debug 空状态：从 “当前阶段 mock provider 骨架” 改为启动配置说明。
- Git binary diff：从 “M7-E-A 文本 diff 基础” 改为二进制差异解释。
- Editor split empty panel：从 Dockview/M5.y-C 分裂占位说明改为编辑器分组说明。
- Editor deleted/truncated/loading/unsupported 状态：移除 M5.y-B/M5.y-C/M5.y-D 与 shared API 暴露文案，改为恢复、复制、另存、只读等用户动作建议。
- Explorer 快速过滤：移除“预留 / M6 Search 阶段”提示。
- Explorer 删除确认：把 “placeholder tab / dirty / deleted” 改为已打开标签页、未保存修改和已删除状态。
- ActivityBar disabled/pending view：从“后续阶段”改为“暂不可用”。
- Provider status toolchain 区块：从 M12-H/status skeleton 改为工具链候选/状态候选说明。
- Editor placeholder badge：从 `IDE editor placeholder` 改为 `编辑器分组`。

## 保留内容

未清理代码注释和内部类型里的历史兼容名，例如 `split-placeholder`、`lsp-placeholder`、旧 layout compatibility 注释。这些不是用户界面 copy，贸然改名会扩大风险。

## 验证

- `npm run typecheck:web -- --pretty false`
- `git diff --check`（针对本阶段 touched files）
- `rg` 检查 IDE 用户可见源码范围中不再出现当前清理目标：`M[0-9]`、`P0/P1`、`后续阶段`、`只显示读取边界`、`placeholder tab`、`IDE editor placeholder`、`当前阶段`、`预留`、`status skeleton`、`Monaco diff`。剩余命中仅为注释/内部类型。

## 下一步

进入 P1-A-2 Explorer mainline workflow：验证和修复真实长目录、焦点快捷键、copy/cut/paste、drag move、上传 dialog、拖文件到终端插入路径等 Explorer 高频链路。
