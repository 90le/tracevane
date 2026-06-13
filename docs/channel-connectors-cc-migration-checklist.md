# Channel Connectors CC Migration Checklist

> 更新：2026-06-13
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
| P0 | 清理 stale native platform skills | 已完成 | Codex 隔离 `codex-home/skills` 会删除历史 Feishu/Octo platform action skill，保留普通自定义 skill |
| P1 | Codex runner | 进行中：结构化 stdout/stderr、混合 content 工具结果、resume 图片参数顺序、app-server 视觉 args 证据、Gateway Responses->Chat 图片映射、图片 native smoke 已补；视频按 staged file 交给 Agent | `exec/resume`、thread、cwd、permission、tool stream、file manifest、stop/new/reset/compact 按 CC 验收；app-server 仍是 beta |
| P1 | Claude Code runner | 进行中：native compact、结构化/混合 tool_result、过程/最终回复、图片 native smoke 已补；视频按 staged file 交给 Agent | stream-json、permission prompt、session resume、tool event、文件/图片/视频输入、native compact/stop live driver |
| P1 | OpenCode runner | 进行中：parser 已对齐；结构化/混合 stdout/stderr/exitCode、native compact、图片 native smoke 已补；视频按 staged file 交给 Agent | JSON/SQLite fallback、session、tool stream、文件/图片/视频输入、native compact/stop live driver |
| P1 | Feishu 私聊 | 进行中：长连接 live 稳定；Markdown、入站文件/图片/视频 staged-path live、出站文件 24h live、权限审批 24h live、native-first compact wiring、三 Agent 显式 `/compact` 24h live 已补 | 持续抽查 |
| P1 | Octo 私聊 | 进行中：长连接 live 稳定；Markdown 已验证；入站文件/图片 staged-path live、入站文件路径返回 24h live、`.mp4` 文件形态视频 24h live、权限 24h live、媒体 payload 文本保留、auto compact 24h live、显式 `/compact` 24h live、出站文件 `outboundFilesSent` live 证据已补 | 继续复核未覆盖 CLI 事件形态 |
| P1 | 工具/思考/过程显示 | 继续推进：非飞书过程回复标题已移除；结构化/混合工具结果、per-agent live `--require-tool-output`、Codex reasoning summary、Octo `/thinking` 过滤、OpenCode live reasoning 和 parser/live 能力展示已补；Codex/Claude Code 有真实 IM 过程回复证据，OpenCode direct runner 已证明过程回复但仍缺最近 IM 样本 | 三个 Agent 都稳定提取工具名、输入、stdout/stderr、exit/status、思考流、过程回复和最终回复分类；继续复核真实 CLI 新事件形态 |
| P1 | 图片/视觉模型 fallback | 已完成：默认关闭；binding 可设启用和默认视觉模型；IM `/vision` 命令与 Feishu 卡片可临时开启/关闭/指定模型；Gateway catalog 只列健康 vision 模型 | 非视觉当前模型收到图片时按配置切到指定/自动健康视觉模型，失败回退附件说明模式 |
| P1 | 上下文预算与 compact | 继续推进 | resolved model 预算进入 IM session；优先 Agent-native compact，不支持/失败再 Gateway compact |
| P1 | 文件/消息收发 | 继续推进 | 私聊入站 staging、出站 manifest、原始文件名、yolo 权限、大文件策略、Feishu/Octo live smoke |
| P2 | durable queue | 进行中：pending-agent-run store 已接入 Octo/Feishu；daemon/API/UI 运行态可见性已补；Octo daemon restart 回归已通过；Feishu live 脚本已区分 durable replay 与 same-process FIFO，Feishu FIFO 24h live 已通过 | daemon 重启不丢失未开始任务；继续触发真实 Feishu IM 重启 replay 场景并跑 live smoke |
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
- `node --test --test-name-pattern "mixed content tool output" tests/system/channel-connectors-service.test.mjs` 通过，覆盖 Codex / Claude Code / OpenCode 混合文本块与结构化工具输出。
- `node --test --test-name-pattern "(structured tool output|mixed content tool output|final text|JSON progress|agent messages before later tools|stream-json progress|text before later tools|DB fallback keeps tool results|persistent Claude driver keeps intermediate)" tests/system/channel-connectors-service.test.mjs`，10/10 通过。
- `node scripts/smoke-channel-connectors-agent-run-live.mjs --since-minutes 1440 --require-ok --require-reply --require-tool --require-tool-output --min-runs 1 --limit-runs 5 --json` 通过，最近 24h 匹配带可见工具输出的成功 IM run。
- `node scripts/smoke-channel-connectors-agent-run-live.mjs --since-minutes 720 --agents codex,claude-code,opencode --require-agent-coverage --require-ok --require-reply --require-tool --require-tool-output --min-runs 3 --limit-runs 12` 通过，近 12h 三个 Agent 均有成功工具调用和可见工具输出证据。
- `node scripts/smoke-channel-connectors-agent-run-live.mjs --since-minutes 1440 --agents codex,claude-code,opencode --require-agent-coverage --require-ok --require-reply --require-process-reply --min-runs 3 --limit-runs 12` 未满足，当前匹配 Codex / Claude Code；OpenCode 真实 IM 中间过程回复样本仍需补齐。
- 真实 direct runner smoke：OpenCode + Gateway `glm-5` 顺序执行 3 次 shell 工具，得到 `assistantIntermediateCount=3`、`toolOutputCount=6`、`assistantFinalCount=1`。
- `node --test tests/system/channel-connectors-agent-run-live-script.test.mjs`，11/11 通过，覆盖 `--agents`、`--require-agent-coverage`、`--require-process-reply`、`--require-tool-output`、`--require-stop-command`、入站图片/视频/文件 staged local path、Octo `.mp4` 作为 `file` 的视频识别、Feishu 卡片审批 command 形态，以及 human 输出只展示匹配 run。
- `node scripts/smoke-channel-connectors-agent-run-live.mjs --since-minutes 1440 --require-ok --require-reply --require-inbound-file --require-staged-files --min-runs 1 --limit-runs 3 --json` 通过，匹配 Feishu/Octo 入站文件且本地 staged 路径存在。
- `node scripts/smoke-channel-connectors-agent-run-live.mjs --since-minutes 1440 --require-ok --require-reply --require-inbound-image --require-staged-files --min-runs 1 --limit-runs 3 --json` 通过，匹配 Feishu/Octo 入站图片且本地 staged 路径存在。
- `node scripts/smoke-channel-connectors-agent-run-live.mjs --since-minutes 1440 --require-ok --require-reply --require-inbound-video --require-staged-files --min-runs 1 --limit-runs 3 --json` 通过，匹配 Feishu 入站视频且本地 staged 路径存在。
- `node scripts/smoke-channel-connectors-agent-run-live.mjs --since-minutes 1440 --platforms octo --require-ok --require-reply --require-inbound-video --require-staged-files --min-runs 1 --limit-runs 3 --json` 通过，匹配 Octo `.mp4` 以 `file` 形态入站且 staged 路径存在。
- `node scripts/smoke-channel-connectors-agent-run-live.mjs --since-minutes 1440 --platforms feishu --require-ok --require-reply --require-file --min-runs 1 --limit-runs 3` 通过，匹配 Feishu 出站文件 24h 成功样本。
- `node scripts/smoke-channel-connectors-agent-run-live.mjs --since-minutes 1440 --platforms feishu --require-ok --require-permission-prompt --require-permission-resolved --require-feishu-permission-progress-card --min-runs 1 --limit-runs 3` 通过，匹配 4 条 Feishu 卡片权限审批成功样本。
- `node scripts/smoke-channel-connectors-agent-run-live.mjs --since-minutes 1440 --platforms octo --require-ok --require-reply --require-inbound-file --require-staged-files --min-runs 1 --limit-runs 3` 通过，匹配 Octo 入站文件 staged 路径存在样本。
- `node --test --test-name-pattern "Octo group process replies before final reply|daemon keeps Feishu dispatcher parity diagnostics" tests/system/channel-connectors-service.test.mjs`，2/2 通过。
- `node --test --test-name-pattern "Codex reasoning summaries|Codex app-server maps reasoning" tests/system/channel-connectors-service.test.mjs`，2/2 通过。
- `node --test --test-name-pattern "Codex reasoning summaries|Claude Code stream-json progress|OpenCode JSON progress|thinking display toggles" tests/system/channel-connectors-service.test.mjs`，4/4 通过。
- `node --test --test-name-pattern "IM commands switch agent|command surface renders text" tests/system/channel-connectors-service.test.mjs`，2/2 通过。
- `npm run build:web`
- `node --test --test-name-pattern "agent runner builds gateway-backed Codex turns|visual turns select Gateway vision models|stages attachments|outbound file manifests" tests/system/channel-connectors-service.test.mjs`，4/4 通过。
- `node --test --test-name-pattern "agent runner builds gateway-backed Codex turns|visual turns select Gateway vision models|daemon registers Octo and opens WuKongIM WebSocket" tests/system/channel-connectors-service.test.mjs`，3/3 通过。
- `node --test tests/system/channel-connectors-codex-app-server-driver.test.mjs`，14/14 通过。
- `node --test --test-name-pattern "model gateway adapts non-streaming codex responses requests to openai chat providers" tests/system/model-gateway-service.test.mjs`，覆盖 Responses `input_image` 到 Chat `image_url` 映射。
- 真实 smoke：`/v1/responses` + `gpt-5.4-mini` / `gpt-5.5` 受控三色方块图片识别通过；`codex exec --image` + `gpt-5.4-mini` 同图识别通过。
- `node --test --test-name-pattern "Octo adapter dry-run dispatch resolves binding, session key, and reply plan" tests/system/channel-connectors-service.test.mjs` 通过，覆盖 Octo 图片/视频 payload 文本保留。
- `node --test --test-name-pattern "native Channel Connectors agent runner builds gateway-backed Codex turns" tests/system/channel-connectors-service.test.mjs` 通过，覆盖三 Agent 图片输入、非视觉 fallback 和视频 staged local file 输入。
- `node --test --test-name-pattern "image" tests/system/channel-connectors-codex-app-server-driver.test.mjs` 通过。
- `node --test --test-name-pattern "IM commands switch agent|visual turns select Gateway vision models|model menus can read live Gateway model lists|command surface renders text" tests/system/channel-connectors-service.test.mjs`，4/4 通过，覆盖 `/vision` 命令、指定视觉模型、Gateway vision 菜单和 Feishu 卡片。
- 真实 runner smoke：Codex / Claude Code / OpenCode + `gpt-5.4-mini` 均识别受控三色方块图片成功；非视觉 `glm-5` 图片请求不传 native 图片并按附件说明退回；视频附件不做 Studio 预抽帧，只以 staged local file 进入 Agent。
- `node --test --test-name-pattern "queues same-session|serializes same-session|replays queued Octo Agent turns" tests/system/channel-connectors-service.test.mjs`，3/3 通过，覆盖同 session FIFO 和 Octo 已入队未启动消息的 daemon 重启重放。
- `node --test --test-name-pattern "replays queued Octo Agent turns" tests/system/channel-connectors-service.test.mjs` 通过，覆盖 daemon `/status` 的 pending queue 记录和 replay 事件。
- `node --test tests/system/channel-connectors-feishu-durable-queue-live-script.test.mjs`，6/6 通过，覆盖 Feishu live 证据脚本的 long-connection queued/replay/finished、same-process FIFO 和 any 模式判定。
- `node scripts/smoke-channel-connectors-feishu-durable-queue-live.mjs --mode fifo --since-minutes 1440 --json` 通过，识别 Feishu 24h 内同进程 FIFO 排队后成功执行证据。
- `node scripts/smoke-channel-connectors-feishu-durable-queue-live.mjs --since-minutes 1440 --json` 仍未发现 durable `pending_replay`，当前真实候选是 FIFO 不是重启重放。
- `node --test --test-name-pattern "replays queued Octo Agent turns|daemon keeps Feishu dispatcher parity diagnostics" tests/system/channel-connectors-service.test.mjs`，2/2 通过。
- `npm run typecheck:web`
- `npm run build:web`
- `node --test --test-name-pattern "daemon registers Octo and opens WuKongIM WebSocket" tests/system/channel-connectors-service.test.mjs`，1/1 通过。
- `node --test tests/system/channel-connectors-service.test.mjs`，102/102 通过。
- `node --test tests/system/channel-connectors-feishu-compact-live-script.test.mjs`，5/5 通过。
- `node --test tests/system/channel-connectors-compact-live-script.test.mjs`，4/4 通过，覆盖 Feishu 长连接 compact 约束、Octo auto compact 和 Octo 显式 `/compact` event-log 证据。
- `node scripts/smoke-channel-connectors-feishu-compact-live.mjs --mode auto --since-minutes 1440 --json` 通过，识别 3 条 Feishu long-connection native auto compact 证据。
- `node scripts/smoke-channel-connectors-feishu-compact-live.mjs --mode explicit --since-minutes 30 --json` 通过，识别 Codex 显式 `/compact` native 证据。
- `node scripts/smoke-channel-connectors-feishu-compact-live.mjs --mode explicit --agent claude-code --since-minutes 45 --json` 通过，识别 Claude Code 显式 `/compact` native 证据。
- `node scripts/smoke-channel-connectors-feishu-compact-live.mjs --mode explicit --agent opencode --since-minutes 45 --json` 通过，识别 OpenCode 显式 `/compact` native 证据。
- `node scripts/smoke-channel-connectors-compact-live.mjs --platform feishu --mode explicit --since-minutes 1440 --json` 通过，识别 Feishu 24h 内三 Agent 显式 `/compact` native 证据。
- `node scripts/smoke-channel-connectors-compact-live.mjs --platform octo --mode auto --since-minutes 1440 --json` 通过，识别 Octo 24h 内 auto compact native 证据。
- `node scripts/smoke-channel-connectors-compact-live.mjs --platform octo --mode explicit --since-minutes 1440 --json` 通过，识别 Octo 24h 内显式 `/compact` native 证据。
- 用户确认 Feishu/Octo 最新手动验收全部通过，包括 Feishu 发文件、权限审批、Octo 收文件并返回路径；`hello-live.txt` 和 `studio-greeting.txt` 临时文件已删除。
- `node scripts/smoke-channel-connectors-agent-run-live.mjs --since-minutes 1440 --platforms octo --require-ok --require-reply --require-file --min-runs 1 --limit-runs 5 --json` 通过，识别 Octo 出站文件自动事件证据：`outboundFilesSent=1`。
- `node --test tests/system/channel-connectors-persistent-live-script.test.mjs`，1/1 通过。
- `node --test --test-name-pattern "stops Codex app-server persistent turns|Agent process cancelled|native compact" tests/system/channel-connectors-service.test.mjs`，2/2 通过，覆盖 Codex app-server persistent `/stop`。
- `node scripts/smoke-channel-connectors-agent-run-live.mjs --since-minutes 1440 --platforms octo --require-stop-command --min-runs 1 --limit-runs 5 --json` 通过，识别 Octo `/stop` 命令与同 session cancelled run 的真实 IM 日志证据。
- `node --test --test-name-pattern "native Channel Connectors agent runner builds gateway-backed Codex turns" tests/system/channel-connectors-service.test.mjs` 通过，覆盖持久 `codex-home/skills` 旧平台 action skill 清理。
- Feishu 文件消息 `om_x100b6df679c474a4c23ef686549039b` live 通过：`messageType=file`、`attachmentCount=1`、staging 文件存在、history 有附件摘要、Agent 成功读取并回复。

## 下一步

1. 补齐 OpenCode 真实中间 assistant 过程回复 IM event-log 样本；后续工具流 live smoke 默认带 `--agents codex,claude-code,opencode --require-agent-coverage --require-tool-output`。
2. Octo 出站文件用户手动验收和自动 `outboundFilesSent` live 证据均已通过；Octo 视频和 Octo 显式 `/compact` 24h 已验收。
3. Provider Center 能力测试：图片 smoke 失败时不要自动标记 vision，并提示协议/端点不匹配。
4. durable queue：真实 Feishu IM 里触发长任务排队并重启 daemon，运行 `scripts/smoke-channel-connectors-feishu-durable-queue-live.mjs --mode durable --wait --json` 验证 pending/replay 记录与实际回复一致；普通排队只用 `--mode fifo` 证明。
