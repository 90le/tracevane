# OpenClaw Studio Docs Index

> 更新：2026-06-15
> 规则：`docs/` 只保存当前目标、边界、合同和少量专项追踪；历史过程看 git commit，不再把每轮实现追加成流水账。

## 当前主线

- `产品需求.md`：Studio 产品范围和当前优先级。
- `系统架构.md`：前后端模块、运行时守护进程和持久化边界。
- `当前进展.md`：当前可用能力、验证状态和下一步。
- `studio-gateway-goal.md`：Studio Gateway 的稳定目标、协议矩阵、daemon 生命周期和 App Connections 验收。
- `studio-gateway-progress.md`：Gateway 与 Channel Connectors 的最新进度快照。
- `studio-gateway-account-provider-plan.md`：GPT/ChatGPT/Codex 账户型 provider 调研、边界和验收。
- `channel-connectors-native-agent-bot-plan.md`：Channel Connectors / CLI Agent Bot 原生方案。
- `channel-connectors-cc-migration-checklist.md`：CC Go 迁移门禁和任务清单。
- `channel-connectors-native-feature-map.md`：CC/OpenClaw/OCTO 能力到 Studio 的映射。

## 专项追踪

- `feishu-long-connection-issue-tracker.md`：飞书长连接“假在线/不回复”专项。
- `feishu-channel-connectors-fix-plan.md`：2026-06-10 飞书稳定性 9 项修复归档。
- `openclaw-recovery-daemon-goal.md` / `openclaw-recovery-daemon-progress.md`：OpenClaw 自愈守护进程目标和进度。

## Chat 与渲染参考

- `聊天设计方案.md`：Studio Chat 当前架构结论。
- `聊天契约.md`：Studio Chat typed API / stream contract。
- `聊天会话策略.md`：Chat session 分类、写入和投递规则。
- `聊天开放门槛.md`：Chat 开放条件。
- `富消息使用说明.md`：Markdown / `studio_delivery` / 文件引用使用规则。
- `混合渲染方案.md`：Markdown/HTML/SVG 混合渲染策略。
- `chat-official-parity.md`：官方 Chat 集成 manifest/package 边界。
- `界面设计守则.md`：Studio UI 设计约束。

## 维护规则

1. 目标文档只写稳定目标和验收，不写每轮日志。
2. 进度文档只保留当前事实、最近验证、边界和下一步。
3. 已废弃方向必须明确标记为“停止扩展”或“归档”，不要继续追加半成品方案。
4. Channel Connectors 新功能必须先对照 CC Go / OpenClaw / Octo 插件，再迁移到 Studio。
5. 文档里不得写入真实 API key、token、tenant access token 或用户私有凭据。
