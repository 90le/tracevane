# Tracevane Docs

> 更新：2026-06-29
> 当前权威方向：Workspace-first。本目录只保留当前产品目标、架构、设计合同和仍有效领域文档；阶段性旧计划应删除或降级为参考。

## 1. 必读入口

按顺序阅读：

5. `整体目标.md` — Tracevane 当前最高目标和领域边界。
6. `产品需求.md` — 产品需求、核心域与近期优先级。
7. `Workspace设计文档.md` — PC/Tablet/Mobile 的 IDE + 文件管理 + 终端体验设计。
8. `Workspace架构.md` — Workspace 总体系统架构和边界。
9. `Workspace前端架构.md` — 新前端目录、状态、响应式布局和命令系统。
10. `Workspace后端设计.md` — 文件/终端/Git/搜索/证据/Agent handoff 后端设计；预览/渲染仅作为未来扩展边界。
11. `文件管理设计.md` — Workspace 文件管理目标。
12. `终端能力设计.md` — Terminal Runtime System 目标；明确终端不是 CLI Agent。
13. `研究先行开发清单.md` — 所有实现前必须遵守的 research-first 门禁.

## 2. 仍有效领域文档

这些文档描述 Workspace 外的 owner domain，仍有效，但不能覆盖 Workspace-first 总目标：

- `CLI代理目标与设计.md` — Codex / Claude Code / OpenCode runtime readiness 与 Agent Run 生命周期；不管理普通终端。
- `IM渠道目标与设计.md` / `IM渠道前端设计契约.md` — IM 平台账号、bot、绑定路由、投递会话。
- `平台域目标与设计.md` — 第三方平台域，OpenClaw 为第一个平台。
- `自愈守护进程目标.md` / `自愈守护进程进度.md` — OpenClaw 平台 guard 参考。
- 自研 Web Chat/Agent 会话域已删除；IM/第三方渠道对话以 `IM渠道目标与设计.md`、`IM渠道前端设计契约.md` 和 Channel Connectors 实现为准，历史聊天文档不再作为实现目标。
- 渲染相关：`混合渲染方案.md`、`富消息使用说明.md`。
- UI 总规则：`界面设计守则.md`。

## 3. 当前产品边界

| Domain | Owns | Must not own |
| --- | --- | --- |
| Workspace | 文件管理、代码编辑器、终端、Git、搜索、上下文证据；预览/渲染只作为未来扩展边界。 | CLI Agent runtime 配置、Provider secret、IM bot token、OpenClaw 平台原生 CRUD。 |
| Terminal | shell session、命令输入输出、tasks、logs、ports、terminal evidence。 | Codex/Claude/OpenCode runtime readiness 或 Agent Run 生命周期。 |
| CLI Agents | CLI Agent 安装/版本/配置/readiness、Gateway 连接状态、Agent Run 生命周期、Agent 结果证据。 | 普通 PTY、terminal tabs、shell 输入、terminal split/delete/rename、自研聊天 UI。 |
| Model Gateway | Provider、模型、协议、账号池、客户端接入、用量与路由证据。 | IM 账号、terminal、Agent Run UI。 |
| IM Channels | IM 账号、bot 凭据、绑定路由、投递会话、守护诊断。 | Provider 路由、terminal、Workspace 文件写入。 |
| Platform | 第三方平台目录与平台原生管理。 | Workspace 文件/终端、Gateway provider 写入、IM 投递路由。 |

## 4. 旧文档政策

- 旧“三域重构”、旧 Workspace 重设计原型、说明页式 UI 阶段文档不再作为最高叙事。
- 文件管理不再以“只读证据页”为目标；Workspace 文件管理必须是真操作。
- `/files` 如保留，应命名为 Evidence/Artifacts，而不是完整文件管理器。
- 未实现功能不得以“P1 占位/规划中”形式出现在用户首屏。
- 文档发生冲突时，以本 README 的“必读入口”顺序为准。

## 5. 变更记录

本目录已删除或降级历史原型与阶段性迁移记录；以当前 Goal 蓝图、权威文档和 git 历史追溯变更。
