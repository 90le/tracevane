# Workspace 重设计总纲

> 状态：Active redesign charter
> 创建：2026-06-25
> 目的：明确本轮不是在现有半成品前端上继续补丁，而是推翻现有 Workspace/IDE/文件管理的错误产品模型，重新建立可长期演进的前端与后端边界。

## 1. 结论

当前 Workspace 前端不能按“补几个按钮、补几个面板”的方式继续。必须整体重设计：

- 先重建信息架构：Workspace 是项目工作面，不是 `/ide`、`/files`、`/terminal` 的拼盘。
- 再重建窗口系统：所有主要 pane 可以打开、关闭、折叠、拖拽 resize，并记忆状态。
- 再重建文件管理：文件管理是独立一等能力，不附属于终端，也不靠终端解释路径。
- 再重建终端能力：终端是 shell/process runtime，不是文件管理器，也不是 CLI Agent 页面。
- 最后接 Agent handoff：Workspace 只负责上下文、审查、证据与应用面；CLI Agents 拥有 Agent runtime/run 生命周期。

## 2. 四个绝对分区

| 分区 | 用户要完成的事 | 所属 UI | 不能混入 |
| --- | --- | --- | --- |
| 文件管理 | 浏览、搜索、打开、新建、重命名、复制、移动、删除、上传、下载、压缩、批量操作。 | Workspace Files / File Manager / Explorer | Terminal session、CLI Agent run、Provider 配置。 |
| 编辑/预览 | 编辑源码、Markdown 编辑/预览/源码模式、diff、preview、保存/回滚。 | Editor Stage / Inspector / Preview | 文件批量操作、terminal lifecycle。 |
| 终端 | shell、task、dev server、logs、ports、reconnect、replay、mobile input。 | Bottom Panel / Terminal fullscreen | 文件管理主流程、CLI Agent readiness/run 管理。 |
| CLI Agents | Codex/Claude/OpenCode readiness、配置状态、Agent Run 生命周期和结果证据。 | CLI Agents domain | 普通 PTY、shell tab、文件管理动作。 |

这四个分区可以互相传递证据和上下文，但不能互相拥有对方的生命周期。

## 3. 新 Workspace 的一级信息架构

```text
Workspace
├─ Activity Rail / Mobile Mode Nav
│  ├─ Files
│  ├─ Search
│  ├─ Git
│  ├─ Terminal
│  ├─ Evidence
│  └─ Agent Handoff
├─ Explorer / Manager Pane
├─ Editor Stage
├─ Inspector
└─ Bottom Panel
```

- PC：多 pane 专业工作台，拖拽 resize、折叠、关闭、恢复、记忆。
- Tablet：drawer + main stage + bottom sheet。
- Mobile：单栏模式，不压缩桌面多栏；所有右键/hover 功能都有按钮或 action sheet。

## 4. 设计红线

- 不继续维护“只读 `/files` + 半成品 `/ide`”的割裂体验。
- 不出现用户可见的“规划中”“P1 占位”作为主界面内容。
- 不用终端承担文件管理职责；终端最多接收当前路径、把输出加入证据。
- 不让 CLI Agents 管理普通 terminal tabs。
- 不恢复历史前端架构；只允许从当前原型设计和已验证用户任务出发。
- 不做夸张卡片墙、营销玻璃、巨大圆角、失控阴影；遵守 `DESIGN.md` 与 `docs/界面设计守则.md`。

## 5. 当前实现必须如何过渡

1. `/files` 已转入 `/workspace?mode=files`，后续必须只作为 Workspace 文件管理入口或 Evidence/Artifacts 入口。
2. 旧 `features/ide` 与 `features/files` 已删除；新的唯一 owner 是 `features/workspace`。
3. 新增任何 Workspace 能力前，必须检查本文、`Workspace前端原型.md`、`Workspace目标.md`、`文件管理设计.md`、`终端能力设计.md`。
4. 每个阶段提交前必须更新阶段目标与对应设计文档，避免代码和文档再次分叉。

## 6. 验收口径

一个阶段只有同时满足以下条件才算完成：

- 文档明确 owner 边界；
- PC 和 mobile 都有可用交互，不只是桌面壳；
- 没有横向溢出；
- 没有假按钮/假入口；
- 文件管理、终端、CLI Agents 没有语义混用；
- `npm run typecheck:web` 和最小 smoke 通过；
- git 提交记录说明约束、拒绝方案、验证和未验证缺口。

## 7. 旧设计处理规则

本轮反馈等同于宣布旧 Workspace 设计合同失效。后续不能继续沿着“把文件页、IDE 页、终端页拼到一起”的思路补丁式推进。处理规则：

1. `Workspace目标.md`、`Workspace设计文档.md`、`Workspace架构.md`、`Workspace前端架构.md`、`Workspace后端设计.md` 必须以本文为上位约束；若出现冲突，以本文的 owner 分区和红线为准。
2. 旧 `/files`、`features/files`、`features/ide`、`features/ide/terminal` 不再是实现或迁移目标；如需追溯只能看 git 历史。
3. 任何“文件操作通过终端命令完成”“终端面板顺便做文件管理”“CLI Agent run 复用普通 terminal tab”的方案直接拒绝，不进入实现。
4. 新阶段设计必须先画清楚用户任务、owner、生命周期、handoff 数据，再写 UI；不能从现有组件树反推产品。
5. 允许复用经过验证的 API 或组件片段，但复用后必须落入新的 owner 目录和交互模型。

## 8. File Manager / Terminal 防混淆验收

每个 PR/提交都必须回答：

- 这个改动是否让 Files 拥有文件生命周期？如果不是，为什么仍在 Files 分区？
- 这个改动是否让 Terminal 只拥有进程生命周期？有没有偷偷承担上传、下载、批量删除、移动、归档等文件管理主流程？
- 文件管理向终端传递的是否只是 cwd/path/context，而不是把任务交给 shell 输出解释？
- Terminal 输出进入 Evidence 时是否只是证据引用，而不是文件状态事实源？
- CLI Agents 是否仍由 CLI Agents owner 管理 readiness/run lifecycle？
