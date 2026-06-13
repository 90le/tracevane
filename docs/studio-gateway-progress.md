# Studio Gateway / Channel Connectors 进度

> 更新：2026-06-13
> 规则：只记录当前事实、本轮完成、验证、边界和下一步；历史细节看 git commit。

## 当前事实

- Studio Gateway 是唯一正式模型中转目标；旧 Codex Stack / CPA / Compact 生产前后端已删除。
- Gateway daemon 与 Channel daemon 都必须由 OS/user supervisor 守护；Studio / OpenClaw 崩溃时，CLI 与 IM bot 应继续直连本地 daemon。
- Gateway 对外提供 Anthropic Messages、OpenAI Responses / compact、OpenAI Chat Completions；`GET /v1/models` 聚合启用 provider，并保留模型别名、模型池、能力标记、上下文窗口和输出预算。
- Provider Center 支持自定义 provider、启停、模型列表/别名/默认模型、能力勾选、批量模型导入、批量预算/能力应用、priority、App scope、active routing、自动协议/模型识别、secret 和 smoke。
- Provider Center 不再按模型名自动标记 vision；图片能力只来自用户配置、上游显式能力元数据或图片 smoke 通过后用户确认写回。
- App Connections 覆盖 Codex CLI、Claude Code、OpenCode、OpenClaw 的脱敏 preview/apply、备份、rollback、profile 切换和隔离 HOME HTTP 验收。
- Channel Connectors 走 Studio 原生 CLI Agent Bot 路线；当前 live Agent 只暴露 Codex、Claude Code、OpenCode。
- Feishu/Octo 首期验收已收窄为私聊完整性：文本对话、文件/图片传输、Agent CLI 原生能力、工具流/回复解析、`/compact`、`/stop`、session/model/permission/workdir 切换。
- 已实现的群聊、thread、多 bot、GROUP.md/THREAD.md、Octo 管理命令和 Feishu 群上下文仅保留 best-effort；不再作为当前主线或发布前阻断项。
- Channel prompt 只描述私聊文件、私聊消息、工作目录、权限、compact 和 Agent CLI 原生命令；不再引导 Agent 调用平台扩展 action。
- `studio-channel-files` 和 `studio-channel-messages` 是保留的 Agent 出站声明合同；文件/消息实际发送仍由 Studio native transport 执行。
- Feishu/Octo 长连接已由用户 live 验证稳定；Feishu 专项跟踪进入 monitored 状态，任意假在线反馈先写入 `docs/feishu-long-connection-issue-tracker.md` 并对照 OpenClaw/CC 实现排查。
- Channel 侧 `/usage` / token 统计不再继续建设；模型消耗后续统一到 Gateway usage/模型消耗页。

## 本轮完成

- 清理并压缩 `docs/`：
  - 新增 `docs/README.md` 作为文档索引和维护规则。
  - 压缩 Gateway、Channel Connectors、Feishu、Chat、富消息、渲染、PRD、架构和当前进展文档。
  - 将 Feishu 9 项稳定性方案归档，当前长连接事实统一写入 `feishu-long-connection-issue-tracker.md`。
  - 将 Chat 长篇实现日志改为 typed contract / session policy / open gate 摘要。
  - 明确 `studio-channel-skill`、platform action、群聊/管理类扩展不是当前目标。
- 上一轮代码完成仍保留为当前事实：
  - OpenCode SQLite/DB fallback 已共用 realtime JSONL parser，工具调用/工具结果和最终回复分离。
  - active `studio-channel-skill` 层已从 prompt/env/UI/daemon endpoint 删除。
  - Codex 隔离 `codex-home/skills` 会清理历史生成的 Feishu/Octo platform action skill；当前运行态旧目录已删除，避免 stale YAML 继续导致 Agent 加载失败。
- 本轮代码补强：
  - 新增 Claude Code / OpenCode persistent session driver native compact 回归。
  - Claude Code 验证同一个 stream-json 常驻进程接收普通 turn 和 `/compact`，不回退 one-shot。
  - OpenCode 验证 `/compact` 通过 `run --session <id>` 续接 live session，不回退 one-shot。
  - 新增 Octo daemon 私聊 `/compact` 回归，证明 IM 入口会路由到 Claude/OpenCode persistent session，不走 Gateway fallback。
  - 新增 Feishu daemon native-first wiring 回归，锁定 Feishu 长连接派发会先调用 native compact，再允许 Gateway fallback。
  - 修复 Claude Code persistent driver：过程回复不再进入最终回复，且进度回调兼容 `agentTurnRequest.onProgress`。
  - 修复 OpenCode 结构化工具输出解析：`stdout`、`stderr`、`exitCode` 不再被压成空工具结果。
  - 修复 Codex 结构化命令输出解析：嵌套或直接 `stdout` / `stderr` 都会进入工具结果进度。
  - 修复 Claude Code one-shot 与 persistent driver 的结构化 `tool_result` 解析，`stdout` / `stderr` / `exit_code` 会进入工具结果进度。
  - 加固 Codex / Claude Code / OpenCode 混合 content 工具结果解析：同一个工具结果里普通文本块与结构化 `stdout` / `stderr` / `exit_code` 会同时保留，不再择一丢失。
  - 加固真实 IM live 证据脚本：新增 `--require-tool-output`，区分“有工具事件”和“工具结果确实有可见输出”，避免空工具结果被误判通过。
  - 加固真实 IM live 证据脚本：新增 `--agents`、`--require-agent-coverage`、`--require-process-reply`，可按 Codex / Claude Code / OpenCode 分别验证工具输出和过程回复覆盖。
  - 加固真实 IM live 证据脚本：`--require-process-reply` 下普通最终回复样本只进入 `requirementWarnings` 诊断，不再阻断已有合格过程回复证据；`--limit-runs 0` 会隐藏 warning 明细，只保留计数。
  - 新增真实 direct runner smoke 脚本：`smoke-channel-connectors-agent-runner-direct.mjs` 直接调用 Channel runner，用于验证 CLI parser/runner，不注入 Feishu/Octo 事件。
  - 加固真实 IM 附件验收脚本：新增 `--require-inbound-image`、`--require-inbound-video`、`--require-staged-files`，图片/视频/文件 live smoke 会同时验证附件类型和本地 staged 路径存在。
  - 优化非飞书气泡式进度流：assistant 过程回复不再携带“过程回复”标题，按最终回复同格式发送正文。
  - 补齐 Codex thinking/reasoning 解析：one-shot 和 app-server 都按 CC Go 合同读取 `summary` / `summary_text` / `content`，无文本时不伪造思考进度。
  - 锁定 `/thinking on/off` 进度显示链路：Octo 私聊端到端验证关闭后不发 reasoning 气泡，重新开启后恢复发送；Feishu/Octo 共用同一进度过滤函数。
  - `/status`、`/current`、Feishu 菜单和前端 Channel Connectors 页面已区分 `thinking` parser 支持与当前 Agent/模型 live 输出观测状态，避免把显示开关误当作 live 能力。
  - 新增通用 compact live 证据脚本：Feishu 仍要求 `longConnection=true` 入站证据；Octo 按自身 event log 的 `threshold/channel.command -> native_compact.finished -> auto_compact.finished(action=native)` 关联验收。
  - 本轮 live/contract 验证：
  - 用户确认 Feishu 与 Octo 长连接都处于稳定状态，标记完成并进入监控态。
  - 用户确认 Markdown 已验证；自动化复验覆盖 Feishu Markdown、Feishu/Octo 文件和媒体收发 contract。
  - Feishu 显式 `/compact` 24h live 已验证 Codex / Claude Code / OpenCode，均为 `longConnection=true`、`commandOk=true`、`nativeOk=true`。
  - Octo auto compact 和显式 `/compact` 24h live 均已验证：`action=native` / `commandOk=true`、`nativeOk=true`、`progressEventCount=4`。
  - Feishu 入站文件 live 已验证：`messageType=file`、`attachmentCount=1`、本地 staging 文件存在、history 有 `attachmentSummaries`，Claude Code 可读取文件内容并回复。
  - Feishu 权限卡片链路同轮观察通过：文件处理触发 Bash `permission-pending`，用户 `approve-all` 后进入 `permission-allowed-all`，工具结果回到 Agent 流。
  - Feishu 出站文件 24h live 已验证：用户触发 `hello-live.txt` 创建和发送，event log 记录 `outboundFilesSent=1`、`permission-pending -> allowed`、工具输出 `live-ok`。
  - Feishu 权限审批 24h live 已验证：真实链路为 Feishu 进度卡片 `permission-pending/allowed` + 卡片按钮 `channel.command commandAction=permission commandOk=true`；live 脚本已兼容这条真实形态。
  - Feishu queue live 脚本已区分 `durable`、`fifo`、`any`：24h 日志中已有同进程 FIFO 排队顺序执行证据，默认 durable 模式仍要求 daemon 重启后的 `pending_replay`。
  - Octo 入站文件 24h live 已验证：用户侧文件进入 staging，本地路径存在，Agent 可返回路径；Octo 视频真实形态会以 `file` + `.mp4` staged path 出现，live smoke 已按视频类文件识别并验收通过。
  - Octo 出站文件 24h live 自动事件证据已验证：`octo-studio-cc` 最近成功 run 记录 `outboundFilesDeclared=1`、`outboundFilesResolved=1`、`outboundFilesSent=1`，且无 `outboundFileErrors`。
  - 用户确认 Feishu/Octo 最新手动验收全部通过，包括 Feishu 发文件、权限审批、Octo 收文件并返回路径；本轮已删除 `hello-live.txt` 和 `studio-greeting.txt` 临时文件。
  - `/stop` 自动回归和真实日志 smoke 已验证：脚本按同 session + 时间窗口关联 stop 命令和 cancelled run，兼容两者 messageId 不同的真实 IM 形态。
  - 图片自动切视觉模型已改为平台 binding 显式 opt-in，默认关闭；开启后若视觉模型链路失败，会回退原模型并以附件说明/本地路径模式继续对话。
  - 排查 Codex 图片识别异常：当前 Feishu 私聊 override 实际为 `/model gpt-5.4-mini`，不是 Claude 4-6；Codex app-server 视觉输入事件之前缺少 args 证据，已补保留。
  - 修复 Codex `exec resume` 图片参数顺序：`--image` / `--json` 等 option 现在固定放在 session id 之前，避免被 CLI 当成 positional prompt。
  - 修复 Gateway Responses -> Chat-compatible provider 图片丢失：`input_image` 现在会映射为 Chat `image_url` block，避免 Codex 经第三方 Chat provider 时只能靠历史和附件摘要猜图。
  - 真实受控图片 smoke：`gpt-5.4-mini`、`gpt-5.5` 直连 `/v1/responses` 可正确识别左上蓝、右上红、下方绿三色方块；隔离 `CODEX_HOME` 的 `codex exec --image` + `gpt-5.4-mini` 也正确识别同一图片。
  - 当前模型目录没有 `gpt5.5-mini` / `gpt-5.5-mini`，只有 `gpt-5.5` 与 `gpt-5.4-mini`；前者缺失会返回 503，不能误判为图片能力失败。
  - `claude-opus-4-6` 目前经 `mlamp` Chat-compatible provider 传图片返回 400 `Unexpected item type in content`；该 provider 的 Claude 视觉能力需改用可接受图片的协议/端点后再验收。
  - Codex / Claude Code / OpenCode runner 已共用 native visual input 合同：图片直接传给 CLI；视频作为 staged local file 进入 Agent prompt，不由 Studio 预抽帧或转图片，交给 Agent CLI/模型或工具按任务处理。
  - Octo 媒体 payload 修复：图片/视频消息带 `content`、`caption` 等文本时会保留用户任务文本，没有文本时才使用 `[image]` / `[video]` 占位。
  - 真实 runner smoke：三 Agent + `gpt-5.4-mini` 均正确识别受控三色方块图片；`glm-5` 非视觉 fallback 不传 `--image` 且回复已收到图片、请用户给下一步；视频合同验证为本地文件路径进入 Agent，不做 Studio 预抽帧。
  - 真实 CLI thinking smoke：
    - Claude Code 2.1.86 + `claude-sonnet-4-5` + `--effort max` 在当前 Gateway 下只输出 `text`，未输出 `thinking` item。
    - OpenCode 1.17.0 + `--thinking`：`gpt-5.4-mini` 未输出 reasoning；`claude-sonnet-4-5` 输出真实 `reasoning` part。
  - 修复 Provider Center vision 能力推断：后端 detect 和前端“补齐默认能力”不再因为 `gpt-*`、`claude-*`、`gemini` 等模型名自动勾选图片能力；显式 `input_modalities: ["image"]` 仍会保留。
  - 新增 Provider Center 图片 smoke：使用红色测试图按 provider 原生协议发送图片请求；HTTP 成功但未识别红色也算失败，并提示协议、endpoint 或模型可能不接受图片输入；失败不会写回 vision，也不会打开 provider circuit。

## 最近验证

- 上一轮代码验证通过：`npm run typecheck:api`
- 上一轮代码验证通过：`npm run build:api`
- 上一轮代码验证通过：`npm run typecheck:web`
- 本轮验证通过：`npm run build:api`
- 本轮验证通过：`node --test --test-name-pattern "persistent Claude and OpenCode drivers run native compact" tests/system/channel-connectors-service.test.mjs`
- 本轮验证通过：`node --test --test-name-pattern "routes Claude and OpenCode compact" tests/system/channel-connectors-service.test.mjs`
- 本轮验证通过：`node --test --test-name-pattern "Feishu compact native-first" tests/system/channel-connectors-service.test.mjs`
- 本轮验证通过：`node --test --test-name-pattern "persistent Claude driver keeps intermediate text|Claude text before later tools|Claude Code final text" tests/system/channel-connectors-service.test.mjs`
- 本轮验证通过：`node --test --test-name-pattern "OpenCode structured tool output|OpenCode JSON progress|OpenCode DB fallback" tests/system/channel-connectors-service.test.mjs`
- 本轮验证通过：`node --test --test-name-pattern "stages attachments|outbound file manifests|outbound IM message manifests|Feishu transport sends markdown|Feishu transport-smoke uploads and sends files|Feishu transport downloads message resources|Feishu transport uploads and sends images or files|Octo transport direct uploads|Octo upload-and-send media|Octo transport preserves outbound upload file names|Octo auto upload falls back|Octo transport smoke uploads and sends media" tests/system/channel-connectors-service.test.mjs`，12/12 通过。
- 本轮验证通过：`node --test --test-name-pattern "Codex structured command output|Codex command execution progress|OpenCode structured tool output" tests/system/channel-connectors-service.test.mjs`，3/3 通过。
- 本轮验证通过：`node --test --test-name-pattern "Claude structured tool output|persistent Claude driver keeps intermediate text|Claude Code stream-json progress|Claude text before later tools" tests/system/channel-connectors-service.test.mjs`，4/4 通过。
- 本轮验证通过：`node --test --test-name-pattern "mixed content tool output" tests/system/channel-connectors-service.test.mjs`，覆盖 Codex / Claude Code / OpenCode 混合文本块与结构化工具输出。
- 本轮验证通过：`node --test --test-name-pattern "(structured tool output|mixed content tool output|final text|JSON progress|agent messages before later tools|stream-json progress|text before later tools|DB fallback keeps tool results|persistent Claude driver keeps intermediate)" tests/system/channel-connectors-service.test.mjs`，10/10 通过。
- 本轮 live 只读验证通过：`node scripts/smoke-channel-connectors-agent-run-live.mjs --since-minutes 1440 --require-ok --require-reply --require-tool --require-tool-output --min-runs 1 --limit-runs 5 --json`，最近 24h 匹配 5 条带可见工具输出的成功 IM run。
- 本轮验证通过：`node --test tests/system/channel-connectors-agent-run-live-script.test.mjs`，12/12 通过，覆盖 `--require-tool-output`、`--require-process-reply` warning 诊断、`--limit-runs 0` 输出压缩、`--require-stop-command`、入站图片/视频/文件 staged local path、Octo `.mp4` 作为 `file` 的视频识别、Feishu 卡片审批 command 形态，以及 human 输出只展示匹配 run。
- 本轮 live 只读验证通过：`node scripts/smoke-channel-connectors-agent-run-live.mjs --since-minutes 1440 --require-ok --require-reply --require-inbound-file --require-staged-files --min-runs 1 --limit-runs 3 --json`，匹配 Feishu/Octo 入站文件且 staged 路径存在。
- 本轮 live 只读验证通过：`node scripts/smoke-channel-connectors-agent-run-live.mjs --since-minutes 1440 --require-ok --require-reply --require-inbound-image --require-staged-files --min-runs 1 --limit-runs 3 --json`，匹配 Feishu/Octo 入站图片且 staged 路径存在。
- 本轮 live 只读验证通过：`node scripts/smoke-channel-connectors-agent-run-live.mjs --since-minutes 1440 --require-ok --require-reply --require-inbound-video --require-staged-files --min-runs 1 --limit-runs 3 --json`，匹配 Feishu 入站视频且 staged 路径存在。
- 本轮 live 只读验证通过：`node scripts/smoke-channel-connectors-agent-run-live.mjs --since-minutes 1440 --platforms octo --require-ok --require-reply --require-inbound-video --require-staged-files --min-runs 1 --limit-runs 3 --json`，匹配 Octo `.mp4` 以 `file` 形态入站且 staged 路径存在。
- 本轮 live 只读验证通过：`node scripts/smoke-channel-connectors-agent-run-live.mjs --since-minutes 1440 --platforms feishu --require-ok --require-reply --require-file --min-runs 1 --limit-runs 3`，匹配 Feishu 出站文件 24h 成功样本。
- 本轮 live 只读验证通过：`node scripts/smoke-channel-connectors-agent-run-live.mjs --since-minutes 1440 --platforms feishu --require-ok --require-permission-prompt --require-permission-resolved --require-feishu-permission-progress-card --min-runs 1 --limit-runs 3`，匹配 4 条 Feishu 卡片权限审批成功样本。
- 本轮 live 只读验证通过：`node scripts/smoke-channel-connectors-agent-run-live.mjs --since-minutes 1440 --platforms octo --require-ok --require-reply --require-inbound-file --require-staged-files --min-runs 1 --limit-runs 3`，匹配 Octo 入站文件 staged 路径存在样本。
- 本轮 live 只读验证通过：`node scripts/smoke-channel-connectors-agent-run-live.mjs --since-minutes 1440 --platforms octo --require-ok --require-reply --require-file --min-runs 1 --limit-runs 5 --json`，匹配 Octo 出站文件成功样本，`outboundFilesSent=1`。
- 本轮验证通过：`node --test --test-name-pattern "Octo group process replies before final reply|daemon keeps Feishu dispatcher parity diagnostics" tests/system/channel-connectors-service.test.mjs`，2/2 通过。
- 本轮验证通过：`node --test --test-name-pattern "Codex reasoning summaries|Codex app-server maps reasoning" tests/system/channel-connectors-service.test.mjs`，2/2 通过。
- 本轮验证通过：`node --test --test-name-pattern "Codex reasoning summaries|Claude Code stream-json progress|OpenCode JSON progress|thinking display toggles" tests/system/channel-connectors-service.test.mjs`，4/4 通过。
- 本轮验证通过：`node --test --test-name-pattern "IM commands switch agent|command surface renders text" tests/system/channel-connectors-service.test.mjs`，2/2 通过。
- 本轮验证通过：`npm run build:web`
- 本轮验证通过：`node --test --test-name-pattern "agent runner builds gateway-backed Codex turns|visual turns select Gateway vision models|stages attachments|outbound file manifests" tests/system/channel-connectors-service.test.mjs`，4/4 通过。
- 本轮验证通过：`node --test --test-name-pattern "agent runner builds gateway-backed Codex turns|visual turns select Gateway vision models|daemon registers Octo and opens WuKongIM WebSocket" tests/system/channel-connectors-service.test.mjs`，3/3 通过。
- 本轮验证通过：`node --test tests/system/channel-connectors-codex-app-server-driver.test.mjs`，14/14 通过。
- 本轮验证通过：`node --test --test-name-pattern "Octo adapter dry-run dispatch resolves binding, session key, and reply plan" tests/system/channel-connectors-service.test.mjs`
- 本轮验证通过：`node --test --test-name-pattern "native Channel Connectors agent runner builds gateway-backed Codex turns" tests/system/channel-connectors-service.test.mjs`，覆盖图片 native 输入、非视觉 fallback、视频 staged local file 输入。
- 本轮验证通过：`node --test --test-name-pattern "image" tests/system/channel-connectors-codex-app-server-driver.test.mjs`
- 本轮验证通过：`node --test --test-name-pattern "daemon registers Octo and opens WuKongIM WebSocket" tests/system/channel-connectors-service.test.mjs`，1/1 通过。
- 本轮验证通过：`node --test tests/system/channel-connectors-service.test.mjs`，102/102 全部通过。
- 本轮验证通过：`node --test tests/system/channel-connectors-feishu-compact-live-script.test.mjs`，5/5 通过。
- 本轮验证通过：`node --test tests/system/channel-connectors-compact-live-script.test.mjs`，4/4 通过，覆盖 Feishu 长连接 compact 约束、Octo auto compact 和 Octo 显式 `/compact` event-log 证据。
- 本轮验证通过：`node --test --test-name-pattern "model gateway adapts non-streaming codex responses requests to openai chat providers" tests/system/model-gateway-service.test.mjs`，覆盖 Responses `input_image` 到 Chat `image_url` 映射。
- 本轮验证通过：`node --test tests/system/model-gateway-service.test.mjs`，54/54 通过，覆盖 Provider detect 显式图片元数据保留、名称-only `gpt-5.4-mini` / `claude-opus-4-6` 不自动标记 vision，以及图片 smoke 不污染 provider health/circuit。
- 本轮验证通过：`npm run typecheck:api`
- 本轮验证通过：`npm run build:api`
- 本轮验证通过：`npm run typecheck:web`
- 本轮验证通过：`npm run build:web`
- 本轮验证通过：`node --test tests/system/studio-web-model-gateway-page.test.mjs`，锁定 Provider Center 图片 smoke UI 合同。
- 本轮真实 smoke 通过：`/v1/responses` + `gpt-5.4-mini` / `gpt-5.5` 受控三色方块图片识别；`codex exec --image` + `gpt-5.4-mini` 识别同图成功。
- 本轮真实 runner smoke 通过：Codex / Claude Code / OpenCode + `gpt-5.4-mini` 均识别受控三色方块图片成功；非视觉 `glm-5` 图片请求不传 native 图片并按附件说明退回；视频附件不做 Studio 预抽帧，只以本地文件路径进入 Agent。
- 本轮 live 验证通过：`node scripts/smoke-channel-connectors-feishu-compact-live.mjs --mode auto --since-minutes 1440 --json`，识别 3 条 Feishu long-connection native auto compact 证据。
- 本轮 live 验证通过：`node scripts/smoke-channel-connectors-feishu-compact-live.mjs --mode explicit --since-minutes 30 --json`，识别 1 条 Feishu long-connection Codex 显式 `/compact` native 证据。
- 本轮 live 验证通过：`node scripts/smoke-channel-connectors-feishu-compact-live.mjs --mode explicit --agent claude-code --since-minutes 45 --json`，识别 1 条 Feishu long-connection Claude Code 显式 `/compact` native 证据。
- 本轮 live 验证通过：`node scripts/smoke-channel-connectors-feishu-compact-live.mjs --mode explicit --agent opencode --since-minutes 45 --json`，识别 1 条 Feishu long-connection OpenCode 显式 `/compact` native 证据。
- 本轮 live 验证通过：`node scripts/smoke-channel-connectors-compact-live.mjs --platform feishu --mode explicit --since-minutes 1440 --json`，识别 Feishu 24h 内 Codex / Claude Code / OpenCode 三条显式 `/compact` native 证据。
- 本轮 live 验证通过：`node scripts/smoke-channel-connectors-compact-live.mjs --platform octo --mode auto --since-minutes 1440 --json`，识别 Octo 24h 内 auto compact native 证据。
- 本轮 live 验证通过：`node scripts/smoke-channel-connectors-compact-live.mjs --platform octo --mode explicit --since-minutes 1440 --json`，识别 Octo 24h 内显式 `/compact` native 证据。
- 本轮验证通过：`node --test tests/system/channel-connectors-feishu-durable-queue-live-script.test.mjs`，6/6 通过，覆盖 durable replay、same-process FIFO 和 any 模式。
- 本轮 live 验证通过：`node scripts/smoke-channel-connectors-feishu-durable-queue-live.mjs --mode fifo --since-minutes 1440 --json`，识别 Feishu 24h 内 FIFO 排队后成功执行证据。
- 本轮 live 只读检查：默认 durable 模式仍未发现 `pending_replay` 证据；当前 24h 候选是同进程 FIFO，不是 daemon 重启重放。
- 本轮 live 验证通过：Feishu 文件消息 `om_x100b6df679c474a4c23ef686549039b`，staging 路径存在，`agent.run.finished agentOk=true replySent=true`。
- 本轮 live 只读验证通过：`node scripts/smoke-channel-connectors-agent-run-live.mjs --since-minutes 1440 --require-ok --require-reply --require-tool --require-tool-output --min-runs 1 --limit-runs 5 --json`，最近 24h 匹配 6 条带可见工具输出的成功 IM run。
- 本轮 live 只读验证通过：`node scripts/smoke-channel-connectors-agent-run-live.mjs --since-minutes 720 --agents codex,claude-code,opencode --require-agent-coverage --require-ok --require-reply --require-tool --require-tool-output --min-runs 3 --limit-runs 12`，近 12h 三个 Agent 均有成功工具调用和可见工具输出证据。
- 本轮 live 只读检查：`--require-process-reply` 近 24h 匹配 Codex / Claude Code，OpenCode 仍缺少最近真实 IM 中间 assistant 过程回复样本；普通最终回复样本现在只计 `requirementWarnings=30`，不再作为硬失败。
- 本轮真实 direct runner smoke：OpenCode + Gateway `glm-5` 顺序执行 3 次 shell 工具，得到 `assistantIntermediateCount=3`、`toolOutputCount=6`、`assistantFinalCount=1`，证明 OpenCode parser/direct runner 可输出过程回复和工具结果；剩余缺口是 IM event-log 现场样本。
- 本轮真实 direct runner smoke：`node scripts/smoke-channel-connectors-agent-runner-direct.mjs --agents codex,claude-code,opencode --json` 通过，Codex / Claude Code / OpenCode 均得到 3 条过程回复、3 个可见工具结果和 1 条最终回复。
- 本轮验证通过：`node --test tests/system/channel-connectors-agent-runner-direct-script.test.mjs`，锁定 direct runner smoke 是 parser-only proof，不替代 Feishu/Octo event-log 证据。
- 本轮加固 direct runner smoke 清理策略：默认使用 `/tmp` 隔离 CLI runtime，结束后自动删除；旧 `direct-runner-smoke` 目录已清理。
- 本轮补齐现场触发入口：live smoke help 和迁移清单现在给出 OpenCode 过程回复等待命令、Feishu durable replay 操作顺序。
- 本轮验证通过：`node --test tests/system/channel-connectors-agent-run-live-script.test.mjs tests/system/channel-connectors-feishu-durable-queue-live-script.test.mjs`，18/18 通过。
- 本轮验证通过：`node --test tests/system/channel-connectors-persistent-live-script.test.mjs`，1/1 通过。
- 本轮验证通过：`node --test --test-name-pattern "stops Codex app-server persistent turns|Agent process cancelled|native compact" tests/system/channel-connectors-service.test.mjs`，2/2 通过。
- 本轮 live 验证通过：`node scripts/smoke-channel-connectors-agent-run-live.mjs --since-minutes 1440 --platforms octo --require-stop-command --min-runs 1 --limit-runs 5 --json`，识别 Octo `/stop` 命令 `2065665014106066944` 和 cancelled run `2065664678767267840`。
- 本轮验证通过：`node --test --test-name-pattern "native Channel Connectors agent runner builds gateway-backed Codex turns" tests/system/channel-connectors-service.test.mjs`，覆盖持久 `codex-home/skills` 旧平台 action skill 清理。
- 本轮文档清理验证以 `git diff --check` 和 stale term 检查为准。

## 已知边界

- Feishu transport 内仍保留一套低层 legacy action helper 和对应直接 transport 回归；它已不再由 Agent prompt、runner、daemon endpoint 或 UI 暴露。后续如继续瘦身，应单独删除这段 Doc/Drive/Wiki/Bitable 直接 API helper，避免和私聊文件/图片 transport 误删混在一起。
- Octo/Feishu 群聊和管理能力已有实现继续 best-effort 保留，但新需求默认不继续扩展。
- 同 session FIFO queue 已有 pending-agent-run store；已入队但未启动的消息会落盘并在 daemon 重启后重放。Octo 重启回归已通过；Feishu 24h live 已证明同进程 FIFO 排队顺序执行，daemon 重启 replay 仍需真实 IM 场景复验。
- Claude Code / OpenCode native compact 已覆盖 driver 层、Octo daemon 私聊入口、Feishu native-first wiring、Feishu 显式 `/compact` 三 Agent 24h live、Octo auto compact 24h live 和 Octo 显式 `/compact` 24h live。
- 图片自动切视觉模型默认关闭；需要在平台 binding 打开。非视觉图片 fallback 已有回归；Feishu/Octo 入站文件/图片、Feishu 入站视频、Octo `.mp4` 文件形态视频、Feishu/Octo 出站文件、Feishu/Octo 权限 24h live 已有证据。
- Provider 模型 vision 能力不会再从模型名推断；Chat-compatible provider 即使模型名像 Claude/GPT，也必须由用户显式配置、上游显式能力元数据或图片 smoke 通过后确认标记。
- 工具流仍需继续 live 复核：Codex、Claude Code、OpenCode 近 12h 均已有可见工具输出 live 证据；Codex / Claude Code 已有过程回复真实 IM 证据，OpenCode 已有 direct runner 过程回复证据但仍需补最近 IM event-log 样本。
- 思考流 parser 支持 Codex、Claude Code、OpenCode 原生 thinking/reasoning 事件；Octo 私聊 `/thinking on/off` 已做端到端回归；状态/UI 已区分 parser 支持和 live 输出观测。真实 smoke 证明 OpenCode 会在支持 reasoning 的模型上输出 `reasoning`，Claude Code 2.1.86 当前未输出 `thinking` item；没有原生思考事件的 Agent/模型组合只能标为不支持，不伪造。

## 下一步

1. 补齐 OpenCode 真实中间 assistant 过程回复 IM event-log 样本，并用 `--agents ... --require-agent-coverage --require-process-reply` 验收。
2. 触发真实 Feishu 长连接入站排队 + daemon 重启场景，用 live 证据脚本验收 pending replay。
3. 后续可选 OpenAI Platform 官方端点 proof。
