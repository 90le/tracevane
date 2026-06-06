# Studio Gateway 进度

> 状态：Studio Gateway core completed；Provider Center/App Connections completed；Channel Connectors native F4 group reply buffer slice completed；OpenAI Platform vendor proof optional
> 更新：2026-06-06
> 文档规则：本文件只保留当前状态、最近完成、验证、边界和下一步；流水细节不继续追加。

## 当前状态

- Studio Gateway 是唯一正式模型中转目标；旧 Codex Stack / CPA / Compact 功能面已停止演进并从生产前后端删除。
- Gateway daemon 使用独立 OS/user supervisor 守护；Studio / OpenClaw 挂掉后，CLI 应继续直连 daemon endpoint。
- Provider Center 已支持用户自定义 provider、启用/停用、模型列表/别名/默认模型、priority、App scope、active routing、自动协议/模型识别、secret、provider-native smoke 和 active-route smoke。
- `GET /v1/models` 聚合所有启用 provider。不同 provider 同名 model 合法并形成模型池；同 provider 内重复 model ID / alias 会被拒绝。
- 本地 Gateway client key 可编辑/生成；启用后保护 `/v1/models`、Chat Completions、Responses、Responses compact、Anthropic Messages，且不会透传 upstream key。
- App Connections 已覆盖 Codex CLI、Claude Code、OpenCode、OpenClaw 的脱敏 preview、apply、备份、rollback、profile 切换、隔离 HOME HTTP 验收和真实 CLI 启动 smoke harness。
- Channel Connectors 已切换为 Studio 原生 CLI Agent Bot 路线；CC/OpenClaw 只作为参考，不再走短期托管 cc-connect。
- Channel daemon 已支持 Octo(dmwork) 与 Feishu 的 native ingress/outbound、Codex/Claude Code/OpenCode runner、Studio Gateway client key、IM session override、slash command、Feishu card action、bot menu、长连接、processing reaction 和 Feishu progress card。

## 本轮完成

- Feishu Agent 运行进度从多条文本回发改为单张 `Studio Agent Progress` 卡片：首条 send，后续 patch，完成/失败时强制落最终状态，避免“运行中 / 错误 / 失败 / Agent 失败”重复刷屏。
- Codex JSONL progress 已识别 `item.started` / `item.completed` 的 `command_execution` 为工具调用/工具结果，卡片会展示命令、退出码和输出摘要；`/stream` 控制整体进度卡片，`/tools` 控制工具/思考项。
- Agent/upstream 错误在 runner 和 daemon 双层清洗，优先抽取 `message/type/code`；进度卡已发送时失败不再额外发送重复失败文本，只在卡片发送失败时兜底文本。
- 本轮参考的 CC 源码重点：`core/progress_compact.go`、`core/streaming.go`、`platform/feishu/feishu.go` 的 compact progress、tool step 和 card patch 思路。
- Gateway Responses -> Chat 工具历史转换已按 `cc-switch` 对齐：system/developer 合并到 head、function_call/function_call_output 顺序映射、tool args/output JSON canonical、tool-call reasoning placeholder、reasoning_content 保留。
- Codex resume 参数顺序已按 CC Go runner 对齐为 `codex exec resume <thread_id> --json -`，避免 resume 模式下 CLI 参数被误读。
- F4 长回复拆分已落地：共享文本 chunk helper 按 CC `splitMessage` 规则实现 Unicode 安全切分，优先换行边界；Feishu text 发送会自动拆成多条消息并返回 `chunkCount/messageIds`；Octo 回复拆分也复用同一规则。
- F4 Feishu thread/reply 会话隔离已对齐 CC：群线程默认按 `root_id/message_id` 生成独立 session，metadata 可关闭；私聊保持每用户 session；daemon/service 共用同一 session helper，事件日志和 webhook 返回保留 `rootId/parentId/threadId`。
- F4 附件基础合同已落地：Feishu `image/file/audio/media/sticker` 解析为统一 attachment metadata，Octo 也补齐同一结构；Agent prompt 只接收无平台 key 的附件摘要，API/日志记录 `messageType/attachmentCount/attachmentKinds`。
- F4 Feishu 附件下载/staging 已落地：长连接进入 Agent 前以 streaming 方式下载 Feishu resource 到 `agent-runtime/attachments/<messageId>`，文件名和 messageId 做路径清洗；daemon 仅设置可配置安全阀，默认 128MB，binding metadata 可用 `attachmentMaxBytes` / `attachment_max_bytes` 覆盖，`0` / `unlimited` 可关闭 daemon 侧上限；失败只写 `stagingError` 不阻断会话；Agent prompt 引用本地路径，不泄露平台 key。
- F4 IM history context 已落地：按 `bindingId + sessionKey` 保存最近 user/assistant 脱敏摘要，Agent 调用前注入同一 IM session 的短上下文；`/new` 与 `/reset` 会同步清理 history。
- F4 群聊 context 已落地：Agent prompt 会注入当前群聊 channel、sender、bot id、reply message、mention 和入站可用成员列表；Feishu 当前先注入已解析 chat/root/thread/from 信息，不拉取完整群成员。
- F4 长回复 group buffer 已落地：群聊成功回复超过阈值时保存完整内容到本地 `channel-reply-buffers.json`，群里只发送短预览和 buffer id；私聊、错误回执仍按原逻辑发送。

## 验证

- 通过：`npm run build:api`。
- 通过：`node --test tests/system/channel-connectors-service.test.mjs --test-name-pattern "text chunking|Feishu transport sends replies|Feishu transport splits long text|Feishu transport manages processing reactions|Octo adapter dry-run"`。
- 通过：`node --test tests/system/channel-connectors-service.test.mjs --test-name-pattern "Feishu webhook parses|Feishu transport sends replies|Feishu transport splits long text|Feishu transport manages processing reactions|command surface"`。
- 通过：`node --test tests/system/model-gateway-service.test.mjs --test-name-pattern "streamed codex tool-call history|inline codex tool-result|restores codex tool-call history"`。
- 通过：`node --test tests/system/channel-connectors-service.test.mjs --test-name-pattern "agent runner builds gateway-backed Codex turns|process runner maps Codex command execution progress"`。
- 通过：`node --test tests/system/channel-connectors-service.test.mjs --test-name-pattern "agent runner builds gateway-backed Codex turns|Feishu webhook parses|Octo adapter dry-run|Feishu transport sends replies"`。
- 通过：`node --test tests/system/channel-connectors-service.test.mjs --test-name-pattern "stages attachments|Feishu transport downloads message resources|agent runner builds gateway-backed Codex turns|Feishu webhook parses|Feishu transport sends replies"`。
- 通过：`node --test tests/system/channel-connectors-service.test.mjs --test-name-pattern "conversation history|agent runner builds gateway-backed Codex turns|IM commands switch agent|Feishu webhook parses|Feishu transport sends replies|stages attachments"`。
- 通过：`node --test tests/system/channel-connectors-service.test.mjs --test-name-pattern "agent runner builds gateway-backed Codex turns|conversation history|IM commands switch agent|Octo adapter follows group|Feishu webhook parses|Feishu transport sends replies|stages attachments"`。
- 通过：`node --test tests/system/channel-connectors-service.test.mjs --test-name-pattern "buffers long group replies|text chunking|agent runner builds gateway-backed Codex turns|Octo adapter follows group|Feishu transport splits long text|Feishu webhook parses|Feishu transport sends replies"`。
- 通过：隔离 `CODEX_HOME` 真实 Codex CLI smoke，`glm-5` 经 Studio Gateway 调用 shell 读取 `probe.txt` 后返回 `ok`；Gateway requestLog 显示两次 `/v1/responses` 均为 200，修复前同路径曾返回 400/1213。
- 通过：隔离 `CODEX_HOME` 三工具调用 smoke，`glm-5` 连续 3 次 `command_execution` 后返回 `ok`，退出码 0。
- 通过：真实飞书客户端复测 `调用三次阅读工具回复我ok`；长连接入站、processing reaction、Progress card send/patch、3 次工具步骤、最终 `agentStatus=completed` / `agentError=null`。Gateway 最新 4 次 `/v1/responses` 均为 200，无 1213。
- 已重启：`openclaw-studio-model-gateway.service`、`openclaw-studio-channel-connectors.service`、dev backend/frontend。

## 已知边界

- OpenAI Platform official smoke 已降为可选 vendor proof；GMN 已作为 Responses-native substitute 完成当前验收。
- Feishu progress card 已替代文本进度；附件 staging 已具备 streaming 落盘、安全本地路径和可配置大小安全阀；真实 Feishu 大文件/压缩包客户端 smoke 尚未执行；reply buffer 查看命令/UI、飞书完整群成员拉取和治理策略仍属于 F4/F5。

## 下一步

1. 继续 F4/F5：治理策略、reply buffer 查看命令/UI、飞书完整群成员拉取。
2. 后续 UI 精修 Feishu card/menu 样式时继续参考 CC 原卡片结构，避免重新发明交互。
