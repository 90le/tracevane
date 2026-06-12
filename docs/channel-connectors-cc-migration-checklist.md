# Channel Connectors CC Migration Checklist

> 更新：2026-06-12
> 原则：CC Go 先 1:1 迁移，Studio 再精修。禁止在 CC 已有成熟方案时重新造轮子。

## 迁移门禁

每个 Channel / Agent 功能进入实现前必须完成：

1. 定位 CC Go 源码：`release/openclaw-studio-0.1.70/resources/codex-stack/cc-connect-source`。
2. 写明要迁移的 contract：消息、命令、状态、文件、权限、错误、重试、测试。
3. 先移植等价行为，再做 Studio typed config / Gateway / UI 优化。
4. 用自动测试和真实 IM/CLI smoke 验证用户可见行为。
5. 偏离 CC 时，在本清单和 commit trailer 记录原因。

参考源：

- CC Go：`release/openclaw-studio-0.1.70/resources/codex-stack/cc-connect-source`
- Octo 插件：`~/.openclaw/extensions/octo`
- Feishu 最新 OpenClaw 参考：`/home/binbin/.openclaw/projects/openclaw/latest/extensions/feishu`
- Gateway 协议转换：`/tmp/cc-switch-src`
- Feishu 长连接专项：`docs/feishu-long-connection-issue-tracker.md`

## 当前边界

- 当前 live Agent 只支持 Codex、Claude Code、OpenCode；其它 Agent 保留路线图，未迁移完成前不得进入可选 `supportedAgents`。
- Feishu/Octo 首期只继续推进私聊完整性：文本、文件、图片、Agent CLI 原生能力、工具流、过程回复、compact、stop、session/model/permission/workdir 切换。
- `studio-channel-skill`、`studio-octo-actions`、`studio-feishu-actions`、platform runtime action index 和文档/群/管理类 platform action 不再是目标。
- Agent prompt/skills 只保留私聊消息、文件/图片附件、工作目录、权限、compact 和 Agent CLI 原生命令说明。
- 出站附件和私聊消息仍由 Studio native transport 执行；Agent 只声明 `studio-channel-files` / `studio-channel-messages`。
- 产品未发布前不为旧实验命令/字段做兼容负担；已取消的工作流不再保留 UI 入口。

## 任务清单

| 优先级 | 任务 | 状态 | 验收 |
| --- | --- | --- | --- |
| P0 | CC-first 门禁 | 已完成 | `AGENTS.md` 和本文件记录约束 |
| P0 | Studio Gateway / Channel daemon supervisor | 已完成 | Studio/OpenClaw 崩溃后 daemon direct endpoint 可继续服务 |
| P0 | 删除 active platform action layer | 已完成 | Agent prompt/env/UI/daemon endpoint 不再暴露 `studio-channel-skill` 或 platform action；旧 action block 不触发审批/API |
| P1 | Codex runner | 进行中：结构化 stdout/stderr 回归已补 | `exec/resume`、thread、cwd、permission、tool stream、file manifest、stop/new/reset/compact 按 CC 验收；app-server 仍是 beta |
| P1 | Claude Code runner | 进行中：native compact、结构化 tool_result 与过程/最终回复回归已补 | stream-json、permission prompt、session resume、tool event、文件/图片输入、native compact/stop live driver |
| P1 | OpenCode runner | 进行中：parser 已对齐；结构化 stdout/stderr/exitCode 与 native compact 回归已补 | JSON/SQLite fallback、session、tool stream、文件/图片输入、native compact/stop live driver |
| P1 | Feishu 私聊 | 进行中：长连接 live 稳定；Markdown 已验证；native-first compact wiring、真实长连接 auto compact、Codex/Claude Code/OpenCode 显式 `/compact` smoke 已补 | 文件/图片、权限审批、工具流卡片、私聊文件/图片/审批复验 |
| P1 | Octo 私聊 | 进行中：长连接 live 稳定；Markdown 已验证 | 文件/图片、权限审批、compact live smoke |
| P1 | 工具/思考/过程显示 | 继续推进：非飞书过程回复标题已移除；Codex reasoning summary、Octo `/thinking` 过滤、OpenCode live reasoning 和 parser/live 能力展示已补 | 三个 Agent 都稳定提取工具名、输入、stdout/stderr、exit/status、思考流、过程回复和最终回复分类 |
| P1 | 上下文预算与 compact | 继续推进 | resolved model 预算进入 IM session；优先 Agent-native compact，不支持/失败再 Gateway compact |
| P1 | 文件/消息收发 | 继续推进 | 私聊入站 staging、出站 manifest、原始文件名、yolo 权限、大文件策略、Feishu/Octo live smoke |
| P2 | durable queue | 未完成 | daemon 重启不丢失未开始任务 |
| P3 | 更多平台 | 路线图 | 微信/企微/钉钉/Telegram/Slack/Discord/QQ/LINE 等只按私聊能力迁移 |
| P3 | 更多 Agent | 路线图 | Gemini、Kimi、Cursor、Qoder、iFlow、Devin、ACP 等逐个补 runner 验收 |

## 最近代码验证

- `npm run typecheck:api`
- `npm run build:api`
- `npm run typecheck:web`
- `node --test --test-name-pattern "OpenCode DB fallback|OpenCode JSON progress|OpenCode tool-calls|Claude Code stream-json progress|Claude text before later tools|Codex command execution progress|Codex agent messages before later tools" tests/system/channel-connectors-service.test.mjs`，7/7 通过。
- `node --test --test-name-pattern "persistent Claude and OpenCode drivers run native compact" tests/system/channel-connectors-service.test.mjs` 通过。
- `node --test --test-name-pattern "routes Claude and OpenCode compact" tests/system/channel-connectors-service.test.mjs` 通过。
- `node --test --test-name-pattern "Feishu compact native-first" tests/system/channel-connectors-service.test.mjs` 通过。
- `node --test --test-name-pattern "persistent Claude driver keeps intermediate text|Claude text before later tools|Claude Code final text" tests/system/channel-connectors-service.test.mjs` 通过。
- `node --test --test-name-pattern "OpenCode structured tool output|OpenCode JSON progress|OpenCode DB fallback" tests/system/channel-connectors-service.test.mjs`，3/3 通过。
- `node --test --test-name-pattern "stages attachments|outbound file manifests|outbound IM message manifests|Feishu transport sends markdown|Feishu transport-smoke uploads and sends files|Feishu transport downloads message resources|Feishu transport uploads and sends images or files|Octo transport direct uploads|Octo upload-and-send media|Octo transport preserves outbound upload file names|Octo auto upload falls back|Octo transport smoke uploads and sends media" tests/system/channel-connectors-service.test.mjs`，12/12 通过。
- `node --test --test-name-pattern "Codex structured command output|Codex command execution progress|OpenCode structured tool output" tests/system/channel-connectors-service.test.mjs`，3/3 通过。
- `node --test --test-name-pattern "Claude structured tool output|persistent Claude driver keeps intermediate text|Claude Code stream-json progress|Claude text before later tools" tests/system/channel-connectors-service.test.mjs`，4/4 通过。
- `node --test --test-name-pattern "Octo group process replies before final reply|daemon keeps Feishu dispatcher parity diagnostics" tests/system/channel-connectors-service.test.mjs`，2/2 通过。
- `node --test --test-name-pattern "Codex reasoning summaries|Codex app-server maps reasoning" tests/system/channel-connectors-service.test.mjs`，2/2 通过。
- `node --test --test-name-pattern "Codex reasoning summaries|Claude Code stream-json progress|OpenCode JSON progress|thinking display toggles" tests/system/channel-connectors-service.test.mjs`，4/4 通过。
- `node --test --test-name-pattern "IM commands switch agent|command surface renders text" tests/system/channel-connectors-service.test.mjs`，2/2 通过。
- `npm run build:web`
- `node --test tests/system/channel-connectors-service.test.mjs`，100/100 通过。
- `node --test tests/system/channel-connectors-feishu-compact-live-script.test.mjs`，4/4 通过。
- `node scripts/smoke-channel-connectors-feishu-compact-live.mjs --mode auto --since-minutes 1440 --json` 通过，识别 3 条 Feishu long-connection native auto compact 证据。
- `node scripts/smoke-channel-connectors-feishu-compact-live.mjs --mode explicit --since-minutes 30 --json` 通过，识别 Codex 显式 `/compact` native 证据。
- `node scripts/smoke-channel-connectors-feishu-compact-live.mjs --mode explicit --agent claude-code --since-minutes 45 --json` 通过，识别 Claude Code 显式 `/compact` native 证据。
- `node scripts/smoke-channel-connectors-feishu-compact-live.mjs --mode explicit --agent opencode --since-minutes 45 --json` 通过，识别 OpenCode 显式 `/compact` native 证据。

## 下一步

1. 稳定 Codex / Claude Code / OpenCode 工具流和回复解析。
2. 私聊文件/图片/权限/compact 做 Feishu 与 Octo live smoke；Markdown 后续只做抽查。
3. 评估 durable queue。
