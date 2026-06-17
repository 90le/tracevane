# Channel Connectors CC Migration Checklist

> 更新：2026-06-16
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
- 前端信息架构：`/channel-connectors` 只承载渠道运营概览、渠道绑定、daemon/runtime 和会话日志；Agent CLI Profile 的高频配置、Gateway 模型选择、绑定摘要、Profile 操作和会话记录进入独立 `/channel-connectors/profiles`，不得挂回 OpenClaw Agents 子页，也不得作为主页面内嵌快改子页。
- Profile/App Connection 关闭验收以真实 IM event log 为准；本轮已重新采集 Feishu OpenCode 过程回复和 Feishu 显式 `/compact` native 成功证据，并通过统一 closure gate。

## 任务清单

| 优先级 | 任务 | 状态 | 验收 |
| --- | --- | --- | --- |
| P0 | CC-first 门禁 | 已完成 | `AGENTS.md` 和本文件记录约束 |
| P0 | Studio Gateway / Channel daemon supervisor | 已完成 | Studio/OpenClaw 崩溃后 daemon direct endpoint 可继续服务 |
| P0 | 删除 active platform action layer | 已完成 | Agent prompt/env/UI/daemon endpoint 不再暴露 `studio-channel-skill` 或 platform action；旧 action block 不触发审批/API |
| P0 | 清理 stale native platform skills | 已完成 | Codex 隔离 `codex-home/skills` 会删除历史 Feishu/Octo platform action skill，保留普通自定义 skill |
| P1 | Codex runner | 进行中：结构化 stdout/stderr、混合 content 工具结果、resume 图片参数顺序、app-server 视觉 args 证据、Gateway Responses->Chat 图片映射、图片 native smoke 已补；app-server turn 超时改为空闲超时，普通静默默认 3 分钟，审批请求和批准工具会刷新/延长 idle，长 gpt5.5 多工具任务有进度时不再被总时长误杀，fallback 恢复型 timeout 不进入用户进度流；native CLI 心跳超时已与 Claude/OpenCode runner 对齐，stdout/stderr TUI 刷新会续期等待，只有停止心跳才报 `process/heartbeat-timeout`；持续只有 TUI 心跳会记录 `process/heartbeat-stall` 非终态诊断且不刷新 timeout，重复诊断退避节流；本地矩阵已覆盖 stdout、stderr CR-only TUI、heartbeat-only stall、idleTimeout 替代总超时和静默 timeout；视频按 staged file 交给 Agent | `exec/resume`、thread、cwd、permission、tool stream、file manifest、stop/new/reset/compact 按 CC 验收；app-server 仍是 beta |
| P1 | Claude Code runner | 进行中：native compact、结构化/混合 tool_result、过程/最终回复、图片 native smoke 已补；native CLI 心跳超时已与 Codex/OpenCode runner 对齐，`Imagining...` / `esc interrupt` 等 stderr/TUI 刷新会续期等待；持续只有 TUI 心跳会记录 `process/heartbeat-stall` 非终态诊断且不刷新 timeout，重复诊断退避节流；本地矩阵已覆盖 stdout、stderr CR-only TUI、heartbeat-only stall、idleTimeout 替代总超时和静默 timeout；视频按 staged file 交给 Agent | stream-json、permission prompt、session resume、tool event、文件/图片/视频输入、native compact/stop live driver |
| P1 | OpenCode runner | 进行中：parser 已对齐；结构化/混合 stdout/stderr/exitCode、native compact、图片 native smoke 已补；native CLI 心跳超时已与 Codex/Claude runner 对齐，`Imagining...` / `esc interrupt` 等 stderr/TUI 刷新会续期等待；持续只有 TUI 心跳会记录 `process/heartbeat-stall` 非终态诊断且不刷新 timeout，重复诊断退避节流；本地矩阵已覆盖 stdout、stderr CR-only TUI、heartbeat-only stall、idleTimeout 替代总超时和静默 timeout；视频按 staged file 交给 Agent | JSON/SQLite fallback、session、tool stream、文件/图片/视频输入、native compact/stop live driver |
| P1 | Feishu 私聊 | 进行中：长连接 live 稳定；Markdown、入站文件/图片/视频 staged-path live、出站文件 24h live、权限审批 24h live、命令 reaction + reply-to、compact command progress、进度卡条数可在卡片内设置、工作目录快捷切换/分页/搜索、`home/parent/recent/child` 文本快捷命令和最近/子目录直达列表、主卡/更多页直达真实配置页、配置页分区和单按钮切换、卡片 action 同步 callback response、native-first compact wiring、三 Agent 显式 `/compact` 24h live 已补；进度卡片中间工具/步骤错误不再提前切 failed 终态 | 持续抽查 |
| P1 | Octo 私聊 | 进行中：长连接 live 稳定；Markdown 已验证；入站文件/图片 staged-path live、入站文件路径返回 24h live、`.mp4` 文件形态视频 24h live、权限 24h live、媒体 payload 文本保留、auto compact 24h live、显式 `/compact` 24h live、出站文件 `outboundFilesSent` live 证据已补 | 继续复核未覆盖 CLI 事件形态 |
| P1 | 工具/思考/过程显示 | 继续推进：非飞书过程回复标题已移除；结构化/混合工具结果、per-agent live `--require-tool-output`、Codex reasoning summary、Octo `/thinking` 过滤、OpenCode live reasoning 和 parser/live 能力展示已补；Codex/Claude Code/OpenCode 均有真实 IM 过程回复证据 | 三个 Agent 都稳定提取工具名、输入、stdout/stderr、exit/status、思考流、过程回复和最终回复分类；继续复核真实 CLI 新事件形态 |
| P1 | 图片/视觉模型 fallback | 已完成：默认关闭；binding 可设启用和默认视觉模型；IM `/vision` 命令与 Feishu 卡片可临时开启/关闭/指定模型；Gateway catalog 只列健康 vision 模型 | 非视觉当前模型收到图片时按配置切到指定/自动健康视觉模型，失败回退附件说明模式 |
| P1 | Channel Connectors CLI Profile 管理面 | 已完成本轮关闭验收：`/channel-connectors/profiles` 已作为独立工作台承接 Profile、Gateway 模型、上下文预算、IM 绑定、持久会话和事件记录；顶部 Profile 摘要条、独立 CLI App Connection 区、右侧 Activity 三段式会话/事件日志、默认折叠 trace、Profile 复制、删除保护、设为默认、模型网关 App Connection deep-link、CLI App Connection config target/backup/launch hint 摘要、脱敏 preview、当前 CLI App 直接 apply、Profile 列表 effective model、IM binding requested/effective session driver 摘要、active session trace、session event trace/失败标记、IM binding/requested persistent binding/session/event deep-link、binding 行事件过滤快捷入口、事件按 binding/type 筛选和 8/20/50 显示数量、当前 Profile 活动 session 批量停止、未保存撤销、Profile ID 重命名绑定迁移、App Connection effective model 展示、Agent 切换时清理 stale App Profile ref、Profile Apply-to-CLI 不改 Gateway 全局默认模型已补；`/agents/:agentId/cli` 已删除 | 真实保存/事件筛选/Claude Code apply+rollback、三 Agent live run、Feishu/Octo compact 和入站图片 gate 已验收 |
| P1 | Channel Connectors 主配置页信息架构 | 进行中：主页面已收敛为 Overview / Bindings / Runtime / Sessions 四个同级工作区；Bindings 已改为左侧绑定列表 + 右侧分区编辑器；Runtime 已改为 daemon/链路 + compact/queue 双列工作台；Sessions 已改为策略/绑定 + 活动会话/事件双列工作台，原始日志默认折叠；内嵌 Profile 快改和 Skills 管理已移除 | 后续继续精修 Profile 工作台细节，避免再次形成子页面套子页面 |
| P1 | 上下文预算与 compact | 核心完成：`/status` 展示 resolved model window/reserve/threshold/remaining，auto compact 已按 native-first、baseline 和 fallback 记录接入；显式 `/compact` 命令已进入 session FIFO，native compact 禁止 one-shot crash fallback | post-fix Feishu 显式 `/compact` native live 已通过；不伪造 Agent 内部 token 预算 |
| P1 | 文件/消息收发 | 核心完成：私聊入站 staging、出站 file/message manifest、原始文件名、Feishu/Octo 上传发送和 Octo COS/STS 大文件路径已覆盖；Feishu/Octo live 证据已通过 | 后续只做平台大小限制、真实大文件和异常路径抽查 |
| P2 | durable queue | 已完成：pending-agent-run store 已接入 Octo/Feishu；daemon/API/UI 运行态可见性已补；Octo daemon restart 回归已通过；Feishu same-process FIFO 和 daemon restart replay 均有 live 证据 | 后续仅做回归抽查 |
| P3 | 更多平台 | 路线图 | 微信/企微/钉钉/Telegram/Slack/Discord/QQ/LINE 等只按私聊能力迁移 |
| P3 | 更多 Agent | 路线图 | Gemini、Kimi、Cursor、Qoder、iFlow、Devin、ACP 等逐个补 runner 验收 |

## 最近代码验证

- `node --test tests/system/studio-web-channel-connector-profiles-page.test.mjs tests/system/studio-web-channel-connectors-page.test.mjs`，5/5 通过，覆盖 Profile 工作台 requested persistent binding/session/event deep-link、当前 CLI App Connection apply/preview 入口、binding 行事件过滤快捷入口、会话事件 binding/type 筛选和显示数量控制。
- `node --test tests/system/studio-web-channel-connector-profiles-page.test.mjs` 通过，覆盖 Agent 切换清理 stale App Profile ref、新建 Profile 默认 `default` App Profile、Profile Apply-to-CLI 不改 Gateway 全局默认模型。
- `npm run typecheck:api`
- `npm run build:api`
- `node --test tests/system/channel-connectors-agent-session-driver.test.mjs tests/system/channel-connectors-compact-live-script.test.mjs tests/system/channel-connectors-profile-closure-script.test.mjs`，19/19 通过，覆盖 persistent session busy guard、native compact 禁用 one-shot crash fallback、显式 compact 关闭 gate 合同。
- Python Playwright 真实交互通过：`/channel-connectors/profiles?profileId=claude` 点击“应用到 CLI”，验证 `profile.model` 保持 `null`、`appModels["claude-code"]` 被应用、Claude Code rollback 成功，App Connection profile 在 finally 中恢复原值。
- `node scripts/smoke-channel-connectors-agent-sessions.mjs --json` 通过，daemon session 管理 endpoint reachable，Feishu/Octo binding 均为 effective persistent，当前 active session 为 0。
- `node scripts/smoke-channel-connectors-native-cli-sessions.mjs --apps claude-code,opencode --json` 通过，isolated real CLI session 覆盖 Claude Code / OpenCode normal turn、file manifest、native visual input、native compact 和 stop/cancel，不污染真实 HOME/runtime。
- `node scripts/smoke-channel-connectors-command-live.mjs --recent-sessions --probe --commands /status,/model,/mode,/dir,/compact --json` 通过，Feishu/Octo 最近 session 可 dry-run 解析模型、权限、工作目录和 compact 命令；probe 不发送平台消息、不修改状态，不替代真实 IM live。
- `node scripts/smoke-channel-connectors-feishu-long-connection.mjs --json` 通过，70 秒采样内 Feishu 长连接 connected/sdkConnected，ping/pong 正常，`transportStale=false`，`violations=0`；runtime 同时显示 Octo connection 为 1、pending queue 为 0。
- `node scripts/smoke-channel-connectors-profile-closure.mjs --plan --json` 通过，闭环验收入口会统一检查三 Agent live run、Feishu 显式 `/compact`、Octo 显式 `/compact`、入站图片 staged-path 四个真实 IM gate，并输出缺口触发口径。
- `node scripts/smoke-channel-connectors-profile-closure.mjs --json` 通过，`three-agent-live-run`、`feishu-explicit-compact`、`octo-explicit-compact`、`inbound-image` 四个真实 IM gate 全绿。
- `node --test tests/system/channel-connectors-codex-app-server-driver.test.mjs`，17/17 通过，覆盖 Codex app-server 空闲超时、审批/批准工具刷新 idle、fallback 恢复时不发用户 timeout 进度和真正卡死 interrupt。
- `node scripts/smoke-channel-connectors-agent-heartbeat-local.mjs --json` 与 `npm run smoke:channel-connectors:agent-heartbeat-local -- --json` 均 16/16 通过，合成本地子进程覆盖三 Agent stderr CR-only TUI、stdout 心跳、heartbeat-only stall 诊断、idleTimeout 替代总超时、静默 heartbeat timeout 和非 runtime Agent 固定超时。
- `node --test tests/system/channel-connectors-agent-heartbeat-local-script.test.mjs`，2/2 通过，覆盖本地 heartbeat smoke 帮助文本和完整矩阵。
- `node --test --test-name-pattern "native Channel Connectors process runner" tests/system/channel-connectors-service.test.mjs`，27/27 通过，覆盖 Codex / Claude Code / OpenCode TUI 心跳续期、stdout 心跳、CR-only TUI 刷新、heartbeat-only stall 诊断、stall 诊断不刷新 timeout、重复 stall 诊断退避节流、idleTimeout 替代总超时、静默 heartbeat timeout、最后活动流诊断、非 runtime Agent 固定 timeout、三 Agent 工具流和权限处理。
- `node --test --test-name-pattern "native Channel Connectors daemon owns Feishu long-connection ingress" tests/system/channel-connectors-service.test.mjs` 通过，覆盖 Feishu 进度卡片中间错误非终态。
- `npm run typecheck:web`、`npm run build:web` 通过；`node --test tests/system/studio-web-channel-connectors-page.test.mjs tests/system/studio-web-channel-connector-profiles-page.test.mjs`，5/5 通过，锁定 Channel Connectors 主页面新四区结构、不再内嵌 Profile 快改/Skills 管理，以及 Profile 独立工作台路由。
- Headless Chrome 验证 `/channel-connectors` 桌面/窄屏截图；CDP 读取 `documentElement.scrollWidth === clientWidth`，主页面无水平滚动。
- Headless Chrome 验证 `/channel-connectors?bindingId=feishu-live&profileId=feishu-codex` 桌面/390px 截图；CDP 读取 `documentElement.scrollWidth === clientWidth`，Bindings 分区编辑器无水平滚动。
- Headless Chrome 验证 `/channel-connectors` Runtime / Sessions 桌面/390px 截图；CDP 读取 `documentElement.scrollWidth === clientWidth` 且可见元素无溢出，窄屏 Tab 为两列。
- Headless Chrome 验证 `/channel-connectors/profiles?profileId=feishu-codex` 桌面/900px/390px 截图；CDP 读取 `documentElement.scrollWidth === clientWidth` 且可见元素无溢出，Profile 摘要条和独立 App Connection 区渲染。
- Headless Chrome 验证 `/channel-connectors/profiles?profileId=feishu-codex` Sessions 区桌面/900px/390px 截图；CDP 读取 `documentElement.scrollWidth === clientWidth` 且可见元素无溢出，事件 trace 默认折叠，请求行文本不粘连。
- Python Playwright 验证 `/channel-connectors/profiles?profileId=feishu-codex`，1440/390 宽度下 Profile 列表显示 resolved model 标签，2 条 IM binding 摘要均展示 session driver mode/reason，CLI App Connection 卡片显示配置文件/最近备份/App 连接入口，2 条 requested persistent binding 和 8 条 session event 均有“绑定”入口，8 条 session event 均渲染 agent/model/session/message/workdir trace，当前 live 样本 active session 为 0 且无横向溢出；active session trace 由源码合同测试覆盖。
- `npm run typecheck:api`
- `npm run build:api`
- `node --test tests/system/channel-connectors-service.test.mjs`，104/104 通过，覆盖 Feishu `/help` 菜单、进度卡条数卡片内设置、工作目录快捷切换/分页/搜索、配置页分区/单按钮切换、会话动作和 card action 同步 callback response。
- `node --test tests/system/channel-connectors-command-live-script.test.mjs`，8/8 通过。
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
- `node scripts/smoke-channel-connectors-agent-run-live.mjs --since-minutes 1440 --agents codex,claude-code,opencode --require-agent-coverage --require-ok --require-reply --require-tool --require-tool-output --require-process-reply --min-runs 3 --limit-runs 0 --json` 通过，三 Agent 均匹配过程回复证据，`missingAgents=0`、`requirementViolations=0`。
- `node scripts/smoke-channel-connectors-agent-run-live.mjs --wait --timeout-ms 600000 --poll-ms 1000 --agents opencode --require-agent-coverage --require-ok --require-reply --require-tool --require-tool-output --require-process-reply --min-runs 1 --json` 通过，匹配 Feishu OpenCode 真实 IM run：`assistantIntermediateProgressCount=3`、`toolOutputSignalCount=3`、`latestFeishuProgressCardStatus=completed`。
- `node scripts/smoke-channel-connectors-agent-runner-direct.mjs --agents codex,claude-code,opencode --json` 通过，三 Agent 均得到 3 条过程回复、3 个可见工具结果和 1 条最终回复。
- `node scripts/smoke-channel-connectors-agent-runner-direct.mjs --json` 通过，默认 OpenCode direct runner smoke 可单独复验。
- `node --test tests/system/channel-connectors-agent-runner-direct-script.test.mjs`，2/2 通过。
- direct runner smoke 默认自动清理隔离 runtime；需要调试时显式传 `--keep-temp`。
- `node --test tests/system/channel-connectors-agent-run-live-script.test.mjs`，12/12 通过，覆盖 `--agents`、`--require-agent-coverage`、`--require-process-reply`、process warning 诊断、`--limit-runs 0` 输出压缩、`--require-tool-output`、`--require-stop-command`、入站图片/视频/文件 staged local path、Octo `.mp4` 作为 `file` 的视频识别、Feishu 卡片审批 command 形态，以及 human 输出只展示匹配 run。
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
- `node --test tests/system/model-gateway-service.test.mjs`，54/54 通过，覆盖名称-only 模型不自动 vision、显式图片元数据保留和图片 smoke 不污染 provider health/circuit。
- `node --test tests/system/studio-web-model-gateway-page.test.mjs` 通过，锁定 Provider Center 图片 smoke UI 合同。
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
- `node scripts/smoke-channel-connectors-feishu-durable-queue-live.mjs --mode durable --since-minutes 10 --wait --timeout-ms 600000 --poll-ms 1000 --json` 通过，识别 Feishu queued message 在 daemon 重启后 replay 并完成：`proofCount=1`、`agent=opencode`、`agentOk=true`、`replySent=true`。
- `node --test --test-name-pattern "IM commands switch|Feishu transport can reply|Feishu command replies use progress reactions|daemon keeps Feishu compact native-first" tests/system/channel-connectors-service.test.mjs`，4/4 通过，覆盖 Feishu reply-to、命令 reaction 和 compact command progress。
- `node --test tests/system/channel-connectors-command-live-script.test.mjs`，8/8 通过，覆盖命令进度日志和 Feishu command progress card patch。
- `node --test --test-name-pattern "progress|Channel Connectors page calls" tests/system/channel-connectors-service.test.mjs tests/system/studio-web-channel-connectors-page.test.mjs`，13/13 通过，覆盖 Feishu 进度卡条数配置和前端保存字段。
- `node --test --test-name-pattern "command surface renders text and Feishu card actions" tests/system/channel-connectors-service.test.mjs` 通过，锁定 Feishu 主菜单清爽配置面板、低频功能二级“更多”页、子页主菜单/更多导航和文本 `/help` 排版。
- `node --test --test-name-pattern "IM commands switch|slash compact works|Feishu command replies use progress reactions|daemon keeps Feishu compact native-first" tests/system/channel-connectors-service.test.mjs`，4/4 通过。
- `node --test --test-name-pattern "replays queued Octo Agent turns|daemon keeps Feishu dispatcher parity diagnostics" tests/system/channel-connectors-service.test.mjs`，2/2 通过。
- `npm run typecheck:web`
- `npm run build:web`
- `node --test tests/system/studio-web-channel-connector-profiles-page.test.mjs`，覆盖 Channel Connectors Profile 三栏布局、Gateway 预算索引、auto compact 展示和 Agents 旧 CLI 路由删除。
- Python Playwright 验证目标更新为 `/channel-connectors/profiles`，确保独立 Profile 工作台在 1440/900/390 宽度下无横向溢出。
- `node --test --test-name-pattern "daemon registers Octo and opens WuKongIM WebSocket" tests/system/channel-connectors-service.test.mjs`，1/1 通过。
- `node --test tests/system/channel-connectors-service.test.mjs`，104/104 通过。
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
- OpenCode `gpt-5.5` Gateway 回归：runner 不再传 `--thinking`，App Connection 生成 `reasoning:false`，真实 `opencode run --model studio-gateway/gpt-5.5` 工具调用通过；Gateway Chat 兼容层会清理 `tools + reasoning_effort`。
- Feishu 文件消息 `om_x100b6df679c474a4c23ef686549039b` live 通过：`messageType=file`、`attachmentCount=1`、staging 文件存在、history 有附件摘要、Agent 成功读取并回复。

## 下一步

1. 继续抽查 Codex / Claude Code / OpenCode 真实 IM 工具流、过程回复、思考流和审批路径；工具流 live smoke 默认带 `--agents codex,claude-code,opencode --require-agent-coverage --require-tool-output`。
2. Octo 出站文件用户手动验收和自动 `outboundFilesSent` live 证据均已通过；Octo 视频和 Octo 显式 `/compact` 24h 已验收。
3. durable queue：真实 Feishu daemon restart replay 和普通 FIFO 均已验收，后续只保留回归抽查。

现场触发口径：

- OpenCode 过程回复复验：先在 IM 中切到 OpenCode，再运行 `node scripts/smoke-channel-connectors-agent-run-live.mjs --wait --agents opencode --require-agent-coverage --require-ok --require-reply --require-tool --require-tool-output --require-process-reply --min-runs 1 --json`，发送要求“每个工具前后都输出一句话”的三步 shell prompt。
- Feishu durable replay 复验：先运行 `node scripts/smoke-channel-connectors-feishu-durable-queue-live.mjs --mode durable --wait --json`，再发送长任务、同 chat 第二条消息、重启 `openclaw-studio-channel-connectors.service`，等待 `pending_replay -> agent.run.finished`。
