# P1-A-2 Explorer mainline workflow summary

## 状态

已完成。P1-A-2 没有扩展 IDE parity，也没有新增 Files / Terminal API；本阶段只把 IDE Explorer 的真实高频工作流纳入自动化验收，并用该验收保护后续主线硬化。

## 产品目标

证明用户在 `/ide` 中面对真实长目录时，可以完成远程代码工作台主链路里的 Explorer 高频动作：

```txt
进入 /ide
→ Explorer 打开长目录
→ 用键盘复制 / 剪切 / 粘贴文件
→ 拖拽文件到目录移动
→ 把文件路径插入终端
→ 打开统一上传窗口
```

## 改动

- 新增 `tests/ide-workbench/ide-explorer-mainline.smoke.mjs`。
- 新增 `npm run smoke:ide:explorer-mainline`。

## 自动化覆盖

`smoke:ide:explorer-mainline` 覆盖：

1. 通过 Files API 创建隔离 smoke 目录，目录内包含 70 个长目录条目，验证 Explorer scroll container 确实可滚动。
2. 进入 `/ide/:rootId` 并使用指定 Explorer directory layout。
3. `Ctrl/Cmd+C` + `Ctrl/Cmd+V`：复制选中文件到目标目录，验证源文件仍在、目标副本出现。
4. `Ctrl/Cmd+X` + `Ctrl/Cmd+V`：移动选中文件到目标目录，验证目标出现且源路径消失。
5. pointer drag move：拖拽文件到目标目录，验证拖拽浮层出现、目标文件出现且源路径消失。
6. Explorer context menu “插入路径到终端”：监听 `tracevane:ide-terminal-insert-text` 事件，验证 shell-escaped path 被发送给活动终端通道。
7. Explorer toolbar “上传文件”：打开复用的 File Manager `UploadManagerDialog`，验证 “选择文件夹” 等上传管理入口可见。

## 边界保持

本阶段不做：

- 新 Explorer 产品壳。
- 第二套 Files API。
- 第二套上传 API。
- Terminal 新生命周期能力。
- OS 文件管理器到浏览器的系统级拖拽 / 剪贴板手测矩阵。
- Editor edge files、responsive、persistence 或 terminal clipboard 后续切片。

## 验证

- `npm run typecheck:web -- --pretty false`：通过。
- `npm run smoke:ide:explorer-mainline`：通过。
- `git diff --check`：通过。
- 临时 Markdown 相对链接检查：通过。

## 下一步

进入 P1-A-3 Editor edge-files workflow：把 Monaco 文本、readonly、大文件、deleted、media、binary/hex、unsupported fallback 放入同一验收视角，继续复用 shared File Surface / IDE Preview，不新建第二套 preview API。
