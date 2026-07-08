# P1-A Mainline UX Hardening Plan

## 状态

计划完成，作为下一轮实现入口。P1-A 承接 P0-B 缺口审计，不扩新 provider、不追 IDE parity，而是把远程代码工作台主链路的高频体验和验收缺口拆成可验证的小切片。

## 产品目标

让用户在真实远程项目里更放心地完成：

```txt
进入 /ide
→ 浏览长目录和真实项目文件树
→ 打开/编辑/预览边界文件
→ 保存/处理外部变化
→ 使用终端和 Git 做最小闭环
→ 刷新或重置布局后不丢工作上下文
```

P1-A 的产物不是大功能，而是明确 P1 hardening 的最小可执行队列、验证入口和不做边界。

## 输入证据

- P0-A baseline：[`p0-a-mainline-validation-baseline-summary.md`](./p0-a-mainline-validation-baseline-summary.md)
- P0-B gap audit：[`p0-b-mainline-gap-audit-summary.md`](./p0-b-mainline-gap-audit-summary.md)
- 产品聚焦覆盖层：[`../15-远程代码工作台产品聚焦与长期执行机制.md`](../15-远程代码工作台产品聚焦与长期执行机制.md)

## P1-A 优先队列

### A. 用户界面旧阶段文案清理

目标：界面不要暴露 M5/M6/P0 等工程阶段名，不让用户看到“后续阶段才支持”这种已经过期的提示。

范围：

- IDE Editor deleted / unsupported / empty state。
- Panel / StatusBar / Explorer footnote。
- File preview / Hex / media fallback 文案。

验收：

- 源码搜索不再在用户可见字符串中出现过期阶段提示。
- 保留文档里的历史阶段名，不把 archive 当成 UI copy 问题。
- 最小验证：`npm run typecheck:web -- --pretty false`，并视改动范围跑对应 smoke。

### B. Explorer 真实工作流验收

目标：证明 IDE Explorer 在真实长目录和高频文件操作下可用。

范围：

- 长目录滚动和焦点进入/释放。
- copy / cut / paste 快捷键不误拦截普通文本复制。
- drag move 有可理解的目标状态。
- 上传文件调用现有 File Manager upload dialog / upload pipeline。
- 拖文件到 Terminal 插入路径。

建议验证：

- 新增或扩展 `smoke:ide:explorer-mainline`。
- 自动化无法覆盖的系统文件管理器复制/拖拽进入手动 release checklist。

### C. Editor edge files 验收

目标：把文本、只读、大文件、deleted、media、binary/hex、unsupported fallback 放进同一验收视角。

范围：

- Monaco 文本文件仍可编辑/保存。
- readonly / large file 不误进入危险保存路径。
- deleted dirty 文件不静默丢内容。
- media/binary/hex 走 shared File Surface / IDE Preview。
- 文件信息进入 IDE StatusBar 或轻量 metadata，不挤压预览内容。

建议验证：

- 新增 `smoke:ide:editor-edge-files` 或维护手动 checklist。
- 继续复用 `shared/file-surface`，不新建第二套 preview API。

### D. IDE responsive / narrow layout 验收

目标：窄屏下主链路不横向溢出，操作入口可用。

范围：

- ActivityBar / Explorer / Editor tabs / action menu / Panel。
- Terminal bottom/right placement 在窄屏下不把按钮挤出视口。
- Tab 横向滚动和菜单保持可访问。

建议验证：

- 新增 `smoke:ide:responsive-mainline`。
- 如自动截图验证成本过高，先建立手动 viewport checklist。

### E. Persistence 主链路验收

目标：刷新页面、重置布局、切 route 不误清工作上下文。

范围：

- 打开的 editor tabs。
- dirty 状态和外部修改提示。
- terminal session descriptors / pinned 状态。
- Explorer workspace/root/current directory。
- layout reset 只重置布局，不等于关闭所有文件/终端。

建议验证：

- 新增 `smoke:ide:mainline-persistence`。
- 与 `smoke:ide:terminal-persistence` 保持互补，不重复测试 terminal 内部细节。

### F. Terminal clipboard / desktop integration 手测矩阵

目标：明确哪些剪贴板路径可自动验证，哪些必须手测。

范围：

- 终端选择文字复制到系统剪贴板。
- 终端右键菜单复制/粘贴不透明、不与 xterm 默认行为冲突。
- 系统剪贴板图片/文件粘贴到 IDE Explorer 或 Terminal。
- 文件拖拽到 Terminal 插入 shell-escaped path。

建议验证：

- 保留现有 `smoke:ide:terminal-foundation` 自动验证。
- 新增 release checklist：Linux/WSL + Chrome/Edge + 系统文件管理器复制文件/图片 + terminal paste。

## 不做边界

P1-A 不做：

- 新语言 provider 或 Go/Rust/clangd/Java deeper rich interactions。
- Debug parity。
- Git force push / merge / rebase / 复杂 conflict wizard。
- Terminal view movement、terminal-as-editor、完整 VS Code terminal parity。
- 新 Files/LSP/Git/Terminal API。
- 重写 Explorer / Editor / Terminal 产品壳。

## 推荐执行顺序

1. P1-A-1：清理用户可见旧阶段文案，成本低、收益直接。
2. P1-A-2：Explorer mainline smoke / checklist。
3. P1-A-3：Editor edge-files smoke / checklist。
4. P1-A-4：IDE responsive mainline smoke / checklist。
5. P1-A-5：Mainline persistence smoke / checklist。
6. P1-A-6：Terminal clipboard desktop integration checklist。

每个切片必须独立提交、独立验证。若任何切片复现数据丢失、误保存、白屏或 root guard 绕过，立即升级为 P0 blocker 修复。
