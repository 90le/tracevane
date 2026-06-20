# Research-First Development Checklist

> 更新：2026-06-21
> 原则：任何新功能、行为修改、协议/SDK/Provider/Channel/Agent 适配，都必须先核验当前外部合同，再设计和实现。

## 开工门禁

每个 Gateway、Channel Connectors、CLI Agent runner、IM workflow、Provider、SDK/API、协议转换或用户可见 UI 行为进入实现前必须完成：

1. 定义变更范围：影响的用户路径、协议、平台、Agent、provider、runtime 状态和失败态。
2. 官方优先核验：官方文档、API/spec、SDK 文档、changelog、release notes、CLI help 或内置 schema。
3. GitHub 核验：活跃仓库源码、issues、discussions、release notes、PR 讨论，重点看事件格式、breaking change、失败模式和未解决问题。
4. 社区核验：社区帖子、实践记录、错误报告只作为风险输入；采用前必须回到官方或真实 smoke 验证。
5. 本地边界对比：确认 Tracevane 的 TypeScript/runtime、daemon、secret、session、file staging、UI 和测试边界能承载该合同。
6. 写入文档：在目标、进度或专项文档记录核验日期、来源、稳定结论、拒绝方案、风险和验证计划。
7. 再实现：没有当前合同或真实 smoke 证据的能力保持结构化 unsupported，不做半截 passthrough 或伪成功。

## 产品命名门禁

产品更名、公开命名、包名、域名、菜单品牌名或对外文档品牌名进入实现前必须完成：

1. 精确短语查重：web、GitHub、npm、PyPI、Docker Hub、浏览器扩展市场、VS Code Marketplace。
2. 近似短语查重：大小写、连字符、空格、复数、`AI` / `Agent` / `Tracevane` / `Ops` 等常见后缀组合。
3. 域名预检：至少检查 `.com`、`.dev`、`.ai` 和一个中性备用域。
4. 商标预检：公开发布前检查目标市场商标库；普通 web search 不能当法律结论。
5. 冲突记录：把拒绝名称、拒绝原因和来源写入 `docs/product-strategy-reset-plan.md`。
6. 分批落地：Tracevane 已作为当前产品名落地；仓库路径、插件 id、`/tracevane` base path、旧配置目录和旧环境变量只能在有迁移计划时改，不要造成安装断裂。

初始禁止直接采用的高风险名称族：

- `AgentOps`-style names
- `Agent` / `AI Agent` plus generic workspace suffixes
- `Agent Nexus` / `Nexus`
- Relay-style workspace names
- `Agent Harbor`
- `Runplane` / `Workplane` / `ThreadRail` / `Lattice Ops` / `AgentWard`

## 产品设计门禁

任何新增或重构主产品页面、Workspace IDE 能力、Agent task surface、预览/编辑工作流、Observability/Eval 面板、Channel 操作流或 Gateway 可视化配置前，必须先更新或引用 `docs/product-benchmark-strategy.md`：

1. 至少核验对应类别的官方资料和活跃 GitHub/社区风险。
2. 写明要吸收的市场优势，以及明确拒绝复制的行为。
3. 把能力翻译成 Tracevane 自身工作流：本地文件、Agent/runtime 状态、Gateway 路由、Channel 投递、Evidence、Recovery、diff/approval/rollback。
4. 不允许因为某竞品有某页面，就直接新增同名页面；必须先证明它强化至少一个产品支柱和一个真实用户循环。
5. 无法提供状态、取消、证据、失败解释或回滚边界的能力，默认不能成为主流程。

## 资料优先级

| 优先级 | 来源 | 用途 |
| --- | --- | --- |
| P0 | 官方 API/spec/SDK/CLI/changelog | 决定实现合同、事件格式、认证、错误 envelope 和兼容边界 |
| P1 | 官方或项目 GitHub 仓库、issues、discussions、release notes | 发现 breaking change、未文档化边缘、版本差异和维护状态 |
| P2 | 社区实践、博客、论坛、Stack Overflow、OpenAI/Anthropic/OpenCode 社区讨论 | 收集故障模式和运维风险 |
| P3 | 本地历史实现、旧迁移文档、第三方项目快照 | 只做历史背景或测试灵感，不作为必须迁移目标或实现权威 |

## 历史资料政策

- 旧第三方迁移源、旧本地快照和早期实验项目只能作为归档背景。
- 不再把任何第三方项目当作开工前必须参考的迁移源。
- 不再以“迁移某项目合同”作为完成标准；完成标准必须来自当前官方/SDK/API/GitHub/community 核验、本地代码边界和测试证据。
- 如果第三方实现暴露了有价值风险，必须重新用官方资料、当前 GitHub 证据或本地/live smoke 证实后才能写入设计。

## 当前能力边界

- 2026-06-19 Model Gateway Codex Chat adapter 点号噪声收口：
  - 范围：Codex 通过 Gateway `/v1/responses` 使用 OpenAI Chat-compatible endpoint profile 承载 `claude-opus-4-8` 等模型时的流式/非流式响应适配，以及 Codex CLI 刷新模型元数据时的 `/v1/models` 响应形态。
  - 来源核验：本机真实 Codex CLI `exec --json --model claude-opus-4-8` 和用户给出的 Codex resume session `019ed8c6-6761-74a0-9fbe-be3ad4652bfc` 复现了两类 Codex-only 噪声：Chat->Responses 适配可能把上游 `reasoning_content` / `reasoning` 点号占位变成 `response.reasoning_summary_text.delta`，也可能把正文 `content` 末尾或独立消息里的 `...\n\n...` 点号段原样转成 `output_text`；本机 usage ledger 中 mlamp/`claude-opus-4-8` 出现 247k/257k 级输出 token，证明不是 UI 渲染误差。Codex 0.141.0 当前模型管理器仍要求 `/v1/models` 顶层存在 `models` 字段和一组 Codex catalog 字段（例如 `slug`、`shell_type`、`supported_in_api`、`priority`、`input_modalities`）；本机 `~/.codex/models_cache.json` 用作字段形状样例，真实 `codex exec` 用作最终合同验证。
  - 稳定结论：Gateway 应过滤只由 `.` / `…` / 空白组成的 reasoning delta/summary，也应过滤 Chat->Responses 正文输出尾部或独立的点号 placeholder 段；有实际文字的 reasoning 和正文中的正常省略号继续保留。`/v1/models` 保持 OpenAI 标准 `{ object, data }`，并额外返回同内容 `models` alias 与 Codex catalog 兼容字段；Codex catalog 的 `input_modalities` 只暴露 Codex 当前接受的 `text` / `image`，音频能力继续保留在 Tracevane `features` 内。
  - 拒绝方案：拒绝关闭所有 reasoning summary，因为 DeepSeek/Qwen 等真正 reasoner 仍需要保留有文字的 reasoning；拒绝把 `/v1/models` 改成非 OpenAI 标准结构；拒绝在 Codex catalog 暴露 `audio` modality，因为 Codex 当前 parser 会拒绝该值；拒绝把正文里所有 `...` 都删掉，只过滤尾部/独立 placeholder 段。
  - 风险与验证：需要覆盖 streaming / non-streaming placeholder reasoning 与 output text 被过滤、正常 DeepSeek reasoning 不回归、OpenAI `data` 和 Codex `models` 双字段都存在，并用真实 Codex CLI 工具调用 smoke 确认不再输出点号、不再提示 model metadata fallback、不再 dump 模型列表。
- 2026-06-19 Model Gateway Codex custom tool 互通：
  - 范围：Codex `/v1/responses` 通过 OpenAI Chat-compatible endpoint profile 使用 Claude 模型时的 freeform/custom tool 请求、响应和历史重放，尤其是 Codex 内置 `apply_patch`。
  - 来源核验：本机真实 `codex exec --json --model claude-opus-4-8` 复现 `tool apply_patch invoked with incompatible payload`，表现为 Claude 连续尝试 `apply_patch` 后提前询问权限；`codex-history.json` 中存在大量 `custom_tool_call` / `custom_tool_call_output`，而旧历史恢复只记录 `function_call`。OpenAI Responses custom/freeform tools 的稳定边界是 custom tool 返回 `custom_tool_call` + 原始 `input`，不能在回给 Codex 时伪装成普通 function JSON 参数。
  - 稳定结论：Gateway 可在请求发往 Chat-compatible 或 Anthropic Messages 上游时把 Codex custom tool 暂时映射为 function/tool_use `{ input: string }`，但响应回 Codex、SSE `output_item.done` 和历史恢复必须恢复为 `custom_tool_call` / `custom_tool_call_output`；普通 function tool 继续保持 `function_call`。
  - 拒绝方案：拒绝把所有 custom tool 永久降级为 function tool，因为 Codex 工具路由会按工具名选择 freeform handler；拒绝要求模型改用 shell 代替 `apply_patch`，这会绕开 Codex 原生编辑工具合同。
  - 风险与验证：需要系统测试覆盖非流式 Chat response、流式 Chat SSE、非流式 Anthropic response、流式 Anthropic SSE、custom tool history restore，并用真实 `claude-opus-4-8` 执行 `apply_patch -> shell -> shell` 工具链验证不会提前结束。
- 2026-06-19 Model Gateway 三协议 reasoning effort 互通：
  - 范围：Client connections 生成 `~/.codex/config.toml` 时的 `model_reasoning_effort` 写入条件，以及 Gateway 在 Codex/OpenAI Responses、OpenAI Chat-compatible、Anthropic Messages 三类协议之间转换 thinking/reasoning effort 的请求字段。
  - 来源核验：OpenAI Codex 当前手册（2026-06-19 通过 `openai-docs` Codex manual helper 获取）确认 `model_reasoning_effort` 是 Codex `config.toml` 配置项，custom model provider 可配置 `model_provider` 与 `[model_providers.*]` 指向代理/Gateway；OpenAI Responses API reference（2026-06-19，`https://developers.openai.com/api/reference/resources/responses/methods/create`）确认 `reasoning.effort` 支持 `none/minimal/low/medium/high/xhigh`；Anthropic Claude migration guide（2026-06-19，`https://platform.claude.com/docs/en/about-claude/models/migration-guide`）确认 Claude 4.7+ 推荐 `thinking: { type: "adaptive" }` 与 `output_config.effort`，并迁移旧 `thinking.enabled + budget_tokens`。
  - 稳定结论：reasoning effort 是客户端/协议层偏好，不应再由 Codex App Connection 按模型名白名单删除。Codex 顶层 `model_reasoning_effort` 对所有 Gateway 模型保留；Gateway 请求适配按目标协议输出兼容字段：Responses 使用 `reasoning.effort`，Chat-compatible 使用 provider reasoning 配置或内部桥接 `reasoning_effort`，Anthropic Messages 使用 `thinking: adaptive` + `output_config.effort`；Anthropic passthrough 也要把 Claude Code 旧 `thinking.enabled + budget_tokens` 归一化为 `adaptive + output_config.effort`，避免 Bedrock Claude 4.7+ 拒绝旧形态。
  - 拒绝方案：拒绝继续用 GPT/o/Codex 模型名判断是否写入 Codex effort；拒绝为 Anthropic 4.7+ 生成旧 `budget_tokens` thinking 形态；拒绝把未知 reasoning 字段盲目透传给上游，协议适配必须按目标 API 清理/翻译。
  - 风险与验证：需要系统测试覆盖 Responses->Chat、Responses->Anthropic、Chat->Responses、Chat->Anthropic、Anthropic->Chat、Anthropic->Responses 的 effort 映射、Anthropic passthrough 旧 thinking 归一化，并继续保留 OpenAI Chat `tools + reasoning_effort` 清理，避免已知上游不兼容回归。
- 2026-06-19 Model Gateway GLM 双端点 Codex/Claude 互通：
  - 范围：`glm-5.2` 在智谱 Coding Plan 的 OpenAI Chat-compatible 端点和 Anthropic Messages 端点上，分别承接 Codex `/v1/responses` 与 Claude Code `/v1/messages` 工具调用链路。
  - 来源核验：智谱官方 Coding Plan 文档（2026-06-19，`https://docs.bigmodel.cn/cn/guide/develop/coding-plan`）确认 Coding Plan endpoint 为 `https://open.bigmodel.cn/api/coding/paas/v4`，用于 Codex/OpenCode 等 OpenAI-compatible 调用；智谱 Claude API 兼容文档（2026-06-19，`https://docs.bigmodel.cn/cn/guide/api-compatible/claude_api`）确认 Anthropic-compatible base URL 为 `https://open.bigmodel.cn/api/anthropic`，Messages 路径为 `/v1/messages`。
  - 稳定结论：Gateway adapter 路由不能只按客户端 routeId 选择默认路径；当客户端协议需要转到上游原生协议时，必须优先使用上游 provider 原生协议 endpoint override。Codex `/v1/responses` 转 Anthropic provider 应使用 `endpoints.anthropic_messages`，否则 GLM Anthropic 会被错误打到 `/api/anthropic/messages`。
  - 拒绝方案：拒绝把 GLM Anthropic 只当 Claude Code 专属端点；拒绝用 Chat 端点覆盖所有 Codex 场景，因为 GLM 官方同时提供 Anthropic-compatible 端点，Gateway 应保持两端点都可测、可路由。
  - 风险与验证：当前 live 2x2 smoke 显示 Chat 端点对 Codex/Claude 均通过，Anthropic 端点对 Claude 原生通过、对 Codex 工具链也能完成 3 工具；但 Codex+GLM Anthropic 的自然语言过程回复会被合并，严格的多过程回复计数不如 Chat 端点稳定。需要保留系统测试覆盖 endpoint override，后续再加更复杂 `read -> edit -> test` 工具链压测。
- 2026-06-19 Model Gateway GLM Codex `call` / premature-stop 根因：
  - 范围：Codex CLI 通过 Gateway 使用 `glm-5.2` Chat-compatible 与 Anthropic-compatible 端点时，工具调用前后出现 `call` / `...` 占位、长 reasoning、工具完成后最终轮卡顿或截断。
  - 来源核验：本机真实 `codex exec` + 临时 capture proxy 复现并抓取上游请求/响应；智谱 Coding Plan 仍按官方 Chat-compatible endpoint 测试。捕获显示旧请求会把上一轮 Codex `reasoning` 回放为 Chat 历史里的 `assistant.reasoning_content`，GLM Chat 默认又会流式返回 `reasoning_content`，导致 reasoning 在多工具回合中逐轮放大；最终轮还观察到一次上游流 `terminated`。
  - 稳定结论：Responses 的 reasoning 是内部推理状态，不是 Chat-compatible 历史合同。Gateway 发往 Chat/Anthropic 上游时只回放 assistant 文本、tool_calls 和 tool_result，不再把 Codex reasoning 写回 `reasoning_content`。对 `glm-5.*` Chat-compatible 请求，如果客户端没有显式 reasoning/thinking，Gateway 默认写入 `thinking: { type: "disabled" }`；显式 `reasoning.effort` 开启时映射为 `thinking: { type: "enabled" }`。
  - 拒绝方案：拒绝仅在前端/TUI 层隐藏 `call` 或 `...`，因为根因是上游请求污染和 GLM 默认 thinking；拒绝删除所有有文字 reasoning，DeepSeek/Qwen 等真 reasoner 的有效 reasoning 仍应保留在响应输出中。
  - 风险与验证：系统测试覆盖 GLM implicit/explicit thinking、placeholder `call`/`...` reasoning 过滤、Codex tool history 不回放 `reasoning_content`、Codex->Anthropic synthetic SSE。真实 capture 验证 5 次 GLM Chat 上游请求均为 `thinking.disabled`、历史 `reasoning_content=0`、原始响应不含 `reasoning_content` / `call`；真实 `codex exec` 串行 2 工具返回 `THINKING_DISABLED_OK`。
- 2026-06-19 Model Gateway GLM 双端点通用化：
  - 范围：GLM `glm-5.2` 作为其它主流供应商两类协议的代表样本，覆盖 OpenAI Chat-compatible 与 Anthropic Messages-compatible endpoint profile、Codex/Claude Code/OpenCode 三个工具入口，以及显式/隐式 thinking 处理。
  - 来源核验：智谱 Coding Plan “接入工具”文档确认提供两种协议端点：OpenAI Chat Completions `https://open.bigmodel.cn/api/coding/paas/v4` 与 Anthropic Messages `https://open.bigmodel.cn/api/anthropic`；智谱 Claude API 兼容文档确认实际 Messages 请求路径为 `https://open.bigmodel.cn/api/anthropic/v1/messages`；Claude Code 工具页确认 `ANTHROPIC_BASE_URL` 使用 `https://open.bigmodel.cn/api/anthropic`。
  - 稳定结论：Tracevane endpoint profile 应保存“网关可追加 route path”的 base URL：Chat profile 为 `https://open.bigmodel.cn/api/coding/paas/v4`，Anthropic profile 为 `https://open.bigmodel.cn/api/anthropic/v1`。GLM `thinking.disabled` 不能只放在 Codex->Chat adapter 里，必须下沉到所有 OpenAI Chat 上游出口，覆盖 OpenCode 直连 Chat、Claude Code Anthropic->Chat adapter、Codex Responses->Chat adapter；显式 `reasoning.effort` / `reasoning_effort` / `output_config.effort` 仍必须开启 thinking 并保留 effort。
  - 拒绝方案：拒绝把 GLM 问题当作 TUI 文本拦截；拒绝为了工具兼容无条件删除所有 `reasoning_effort`，因为 GLM Chat + tools 支持显式 effort；拒绝把 Anthropic base 配到 `/api/anthropic` 后让 Gateway 追加 `/messages`，该组合真实返回 404。
  - 风险与验证：系统测试新增 OpenAI Chat passthrough 与 Anthropic->Chat adapter 两条 GLM thinking 归一化；真实 active-route matrix 验证 `coding-anthropic` 命中 `https://open.bigmodel.cn/api/anthropic/v1/messages`、`coding-chat` 命中 `https://open.bigmodel.cn/api/coding/paas/v4/chat/completions`；真实 Channel Connector runner 用 `glm/glm-5.2` 分别驱动 Codex、Claude Code、OpenCode 完成 `date +%s` / `pwd` / `whoami` 三工具链。
- 2026-06-19 Model Gateway App Connections Gateway key 前置处理：
  - 范围：Client connections 页应用 Codex、Claude Code、OpenCode、OpenClaw 配置前的本地 Gateway client key 状态提示、生成/启用入口和前端 guard。
  - 来源核验：本次不改变外部客户端配置格式、endpoint、header 或模型协议，只修正 Tracevane 本地管理 UI 对既有 `/api/model-gateway/client-auth` 与 `/api/model-gateway/app-connections` 合同的呈现和操作顺序；沿用 2026-06-18 Gateway App Connections 已验证的客户端写入边界。
  - 稳定结论：客户端配置必须写入本地 Gateway key；当 key 未生成、缺失或已保存但停用时，不能让用户只看到后端英文 issue 或 disabled apply 按钮，必须在应用路径内提供生成/启用/手动编辑入口。
  - 拒绝方案：拒绝在 apply 时静默生成并轮换已有 key；已有 key 只启用，缺失时才生成。拒绝改变后端 issue 字符串，避免破坏 API/系统测试合同。
  - 风险与验证：前端 guard 不替代后端管理校验；需要用 web 类型检查、Gateway 页面系统源检查和 diff check 验证。
- 2026-06-18 Model Gateway Provider Center 编辑与模型目录 UX：
  - 范围：provider 上游密钥编辑、自动识别配置、模型目录刷新和 Provider Center 模型配置列表。
  - 来源核验：OpenAI API reference `GET /v1/models`（https://platform.openai.com/docs/api-reference/models/list）；Anthropic List Models（https://docs.anthropic.com/en/api/models-list）；OpenRouter Models API（https://openrouter.ai/docs/api/api-reference/models/get-models）和公开模型目录（https://openrouter.ai/models）；GitHub/community 只做“大目录/兼容模型端点可能很大”的风险搜索，不作为实现合同。
  - 稳定结论：OpenAI-compatible `/models` 可能一次返回完整列表；Anthropic 官方模型列表支持分页参数；OpenRouter 作为聚合商会暴露大量模型。Tracevane 不能把识别到的全部模型自动写入响应式配置表，也不能要求用户重新粘贴已保存的本地 upstream key 才能重新识别。
  - 本地边界：`/api/model-gateway/providers` 继续只返回 masked secret；新增的单 provider secret reveal 只走管理态编辑接口，用于把本地 key 默认隐藏载入编辑框和识别请求。识别结果进入候选目录，用户搜索/筛选/勾选后再导入配置模型。
  - 拒绝方案：拒绝在 providers 列表返回明文 key；拒绝检测后全量自动 merge 几百个模型；拒绝把大目录全部渲染成可编辑行。
  - 风险与验证：明文 key 只存在编辑器内存和受信管理响应中，关闭/保存后清空草稿；需要用系统测试验证列表不泄露 secret、单 provider reveal 可用、前端保留候选导入/窗口化渲染合同，并跑 `git diff --check`。
- Channel Connectors 当前只继续推进 Feishu/Octo 私聊完整性和 Codex、Claude Code、OpenCode 三个 live Agent。
- 默认 Agent session driver 使用结构化 persistent 路径：Codex app-server、Claude Code stream-json、OpenCode `run --session`。one-shot/TUI runner 只作为显式 opt-out、persistent fallback 或尚未支持 Agent 的兼容路径。
- 普通 IM 消息不排队、不落 pending store、不 daemon 重启 replay；同 binding + IM session 已有 active/delivering run 时直接 busy guard，用户用 `/stop`、`/cancel` 或等待结束后重发。
- Feishu/Octo 出站附件和私聊消息由 Tracevane native transport 执行；Agent 只声明受控 manifest。
- 未经当前合同验证的 Realtime/WebSocket、音频、image edits、媒体 passthrough 或新 Agent 事件格式必须返回结构化 unsupported 或保持受控 fallback；官方已有能力不等于 Tracevane Gateway 已有可承载 bridge。

## 风险清单

| 风险 | 防护 |
| --- | --- |
| 任务未结束却误判结束 | 优先结构化 session/SDK 事件；one-shot fallback 必须有权威终态、lingering grace、idle heartbeat 和取消优先级 |
| 任务已结束却继续等待 | 识别官方终态、进程退出、transport close、result/error 事件；终态后进入 bounded cleanup，不无限等待 |
| TUI 只有状态刷新但无真实进展 | TUI 心跳可证明进程存活，但不能无限续期；持续无结构化进展时记录非终态诊断并进入 bounded async/idle 策略 |
| 子 agent/deep research 主窗口静止 | 识别官方/结构化 child-task、subagent、task progress 或 harness 状态；没有结构化事件时用 bounded async idle grace |
| CLI/SDK 事件格式升级 | unknown event 记录 bounded sample 和版本信息；不崩溃、不伪完成；缺少最终回复时返回兼容提示并要求补 parser |
| 网络/SDK 文档不可用 | 不凭记忆新增合同；文档标记 stale-risk，unsupported route 保持明确错误 |
| 多账户复杂度误伤单账户 | 默认单账户可用；多账户 round-robin/sticky/concurrency 只作为增强，不作为基础 smoke 前提 |
| Gateway 已开始的流式请求中途失败却被记为成功 | SSE adapter 必须把已写给客户端的 `error` / `response.failed` 同步反馈给 service，runtime 记 `failure`，health/circuit 可触发 fallback，Codex account quota/rate/capacity 可进入 cooldown |
| Gateway 忽略上游 Retry-After 继续打受限 provider | 普通 provider 和 endpoint health 持久化 `retryAfterUntil`；带 Retry-After 的失败立即打开 circuit，到期前不 probe，优先 fallback |
| Endpoint profile 已降级但状态摘要仍显示健康 | `/api/model-gateway/status` 必须把启用 endpoint profile 的 health/circuit 纳入 `healthSummary`；全部 endpoint open 的 provider 不计入 `okProviders` |
| 用户等待无反馈 | IM 返回结构化状态：running、waiting-for-permission、delivering、failed、unsupported、fallback，不把内部诊断伪装成最终回复 |

## 当前任务清单

| 优先级 | 任务 | 状态 | 验收 |
| --- | --- | --- | --- |
| P0 | Research-first 门禁 | 已完成 | `AGENTS.md` 和本文件记录开工前外部核验、文档记录和 unsupported 策略 |
| P0 | `.meta-kim/` 工作区状态 | 已完成 | `.gitignore` 忽略 `.meta-kim/`，避免本地运行态进入提交 |
| P0 | 用户可见第三方引用清理 | 已完成本轮 | 文档和 unsupported 错误不再把旧第三方项目作为实现依据 |
| P0 | 产品战略重置文档 | 已完成本轮 | `product-strategy-reset-plan.md`、PRD、架构、进展和 README 改为 Tracevane 方向 |
| P0 | 产品 benchmark 策略 | 已完成本轮 | `product-benchmark-strategy.md` 记录 AI IDE、CLI Agent、app builder、observability/eval、workflow/runtime 的市场吸收和拒绝规则 |
| P0 | 产品命名门禁 | 已完成本轮 | 本文件和战略重置文档记录查重流程、禁止直接采用的高风险名称族和分批落地规则 |
| P0 | React 前端重做基线 | 已完成本轮 | `apps/web-vue` 已从 Vue 切换为 React + TypeScript + Vite 8 + Tailwind v4，Aurora 11 页原型映射为 React routes |
| P1 | Agent session 判断稳定性 | 进行中 | Codex/Claude Code/OpenCode 默认 persistent；one-shot fallback 覆盖 heartbeat、async child task、idle timeout、unknown event 和终态 race |
| P1 | Gateway unsupported 合同 | 进行中 | 未验证的 image edits、audio、Realtime/WebSocket 返回结构化 unsupported，错误说明当前缺少稳定合同和替代路径 |
| P1 | Gateway endpoint profile 回归 | 已补本地回归 | 原生协议优选、passthrough 错误归属和 adapter-required 错误归属均锁定 endpoint profile |
| P1 | Gateway started streaming failure 收口 | 已补本地回归 | 已开始的 SSE adapter 失败会保持客户端失败事件，同时更新 runtime failure、provider health、circuit 和 fallback |
| P1 | Gateway Retry-After / circuit 收口 | 已补本地回归 | 普通 provider 和 endpoint profile 429 保留上游错误码，Retry-After 写入对应 health 并阻止到期前 probe |
| P1 | Gateway endpoint health summary 收口 | 已补本地回归 | endpoint profile circuit 纳入 status healthSummary，全部 endpoint open 的 provider 不再算 ok |
| P1 | Channel final delivery / reaction 回归 | 已补本地回归 | Feishu reaction stop failure 可观测但不阻断生命周期；Feishu 投递失败落卡路径保持源码回归 |
| P1 | Channel legacy action helper 清理 | 已完成本轮 | Feishu transport 删除未暴露 Docx/Drive/Wiki/Bitable 直接 action helper，只保留旧 code fence 剥除 |
| P1 | 真实外部核验记录 | 持续 | 每次新增 provider、SDK、协议、Channel、Agent 或 UI 行为前更新目标/进度/专项文档 |

## 最近验证

- 2026-06-17：核验 OpenAI Codex `AGENTS.md` 官方说明，确认项目级指令是 Codex 开始工作前读取的控制面。
- 2026-06-17：核验 Claude Code 官方 Agent SDK / hooks 文档，确认 hooks、sessions、subagents、Stop/StopFailure 等生命周期事件应优先作为结构化判断来源。
- 2026-06-17：核验 OpenCode 官方 CLI / SDK 文档，确认 `--format json`、headless server、session API 和 SDK types 是优先于 TUI 文本的结构化路径。
- 2026-06-17：核验 Git `gitignore` 官方文档，确认所有开发者都应忽略的本地工作区产物应写入仓库 `.gitignore`。
- 2026-06-17：本轮按用户要求先不跑渠道 live；本地补 Gateway endpoint profile passthrough/adapter 错误归属回归，以及 Feishu reaction stop failure/daemon delivery failure 源码合同回归。
- 2026-06-17：重新核验 Codex app-server、Claude Code Agent SDK / TypeScript SDK、OpenCode CLI / SDK 官方文档；本地补真实 Claude `◯ deep-research ... ↓ tokens`、Codex subagents、OpenCode parallel tasks 的 async child-task TUI 回归，确认优先结构化 driver，TUI 只作 bounded fallback。
- 2026-06-17：核验 Feishu 官方开放平台 Docs/API、官方 Node SDK 和官方 OpenClaw Lark 插件安全边界；本地删除 Tracevane 未暴露的 Feishu direct action helper，保留私聊 transport 主链路和旧 code fence 剥除。
- 2026-06-18：核验 OpenAI 官方 Realtime/audio、Responses WebSocket mode 和 `openai-node` Realtime WebSocket 说明；结论是官方能力存在，但 Tracevane Gateway 对 Codex account backend 仍缺完整 turn-state/tool-cache/history/close 合同，所以继续结构化 unsupported，并补齐 audio/realtime 错误 envelope 的可行性、参考和替代路径。
- 2026-06-18：核验智谱官方 GLM Coding Plan 快速开始、GLM-5.2 模型页和模型切换文档；结论是 Coding Plan 使用专属 `https://open.bigmodel.cn/api/coding/paas/v4` endpoint，GLM-5.2 为 1M context / 128K output，Claude Code 是官方覆盖的切换场景。本地用已配置 `glm` provider 完成 Codex / Claude Code / OpenCode 三协议 active-route smoke，验证后 activeProviders 恢复原状。
- 2026-06-18：将 Gateway provider 三协议 proof 固化为 `scripts/smoke-model-gateway-active-routes.mjs`：脚本会保存原 activeProviders、必要时临时启用 provider、临时激活目标 provider、逐 scope 调用 active-route-smoke、finally 恢复 enabled/activeProviders 并二次读取 `/providers` 校验恢复一致性；本地 GLM `glm-5.2` live 通过并断言两个 endpoint profile，GMN `gpt-5.4` 在临时启用后 live 通过并恢复禁用。
- 2026-06-20：补强 Gateway active-route smoke 运行保护。该脚本会临时写入 `/api/model-gateway/active-provider`，并发执行会让后续 GLM/Codex/Claude live proof 互相污染，因此新增本地跨进程锁、超时 JSON 失败、stale lock 清理和系统回归；协议矩阵 mock 回归已确认仍能覆盖 GLM Anthropic / GLM Chat-compatible / Codex account Responses 三类路由选择。
- 2026-06-20：继续加固 GLM/Chat-compatible 工具流。复查 Chat SSE -> Codex Responses / Anthropic Messages 的工具分片转换，发现空 `delta.tool_calls` 和无有效工具的 `finish_reason=tool_calls` 会被误判为真实工具等待，可能造成客户端出现 `call` 残片后提前结束。已改为只有 id/name/arguments 或既有工具状态时才创建工具块，且只有真实工具块存在时才映射 `tool_use`；本地系统测试和真实 GLM 三 agent 三工具 direct runner 均通过。
- 2026-06-20：继续补齐 Responses SSE -> Chat / Anthropic 反向桥的空工具事件防护。孤立且无身份的 `response.function_call_arguments.*` 事件不再创建默认 `call_x/tool` 工具块，completed output fallback 也只接受有 id/call/name 身份的工具项；系统测试覆盖空 Responses 工具事件不会转成 Chat `tool_calls` 或 Anthropic `tool_use`，并确认正常 Responses 工具流不回退。
- 2026-06-20：继续补齐 Anthropic Messages SSE -> Chat / Responses 反向桥的空工具事件防护。核验 Anthropic Messages streaming / fine-grained tool streaming 官方文档：`content_block_start` 中的 `tool_use` 建立工具块，后续同 index 的 `input_json_delta` 追加参数；核验 OpenAI Responses streaming 官方文档：`response.function_call_arguments.delta/done` 带 `item_id` / `output_index` 并归属于已有 output item。结论：Gateway 不能把缺少 id/name 的 Anthropic `tool_use` 空壳、孤立 `input_json_delta`、或只有 `stop_reason=tool_use` 但无真实工具块的结束事件转成 Chat `tool_calls` / Responses `function_call`，否则会让 Codex/Claude/OpenCode 等客户端进入假工具等待并表现为 `call` 残片或提前结束。本地系统测试、daemon 协议矩阵和 GLM `glm-5.2` 三客户端真实工具调用均通过。
- 2026-06-20：继续收紧三协议工具调用身份合同。核验 OpenAI Chat tool calls、OpenAI Responses function_call 和 Anthropic tool_use 的可续轮语义后，结论是桥接层不应为缺失调用 id 的工具调用合成 synthetic id：客户端会拿这个 id 回传 tool result，但上游并没有对应调用，容易形成“工具调用已显示但下一轮无法对账”的假生命周期。已改为 Chat `tool_calls`、Anthropic `tool_use`、Responses `function_call` 都必须同时具备调用 id 与工具名才会进入跨协议工具生命周期；半身份事件只按普通结束处理，不向客户端暴露工具调用。Protocol matrix 也拆分为 GLM Anthropic、GLM Chat、Codex Responses 三个独立 stage，避免一个 live 端点的瞬时 `fetch failed` 掩盖其它端点 proof。
- 2026-06-20：继续收紧工具结果身份合同。Chat `tool` message、Anthropic `tool_result`、Responses `function_call_output` / `custom_tool_call_output` 没有对应 call id 时，不再传给上游 provider adapter；否则上游会收到无法对应任何真实 tool call 的孤儿结果，污染下一轮上下文。Active-route smoke 只对 `fetch failed` / reset / timeout 这类未形成模型响应的 transient proof 失败默认重试一次，生产 Gateway POST 请求仍不做自动重试，避免重复推理或重复 side effect。
- 2026-06-20：继续收紧 Chat-compatible streaming 工具分片身份合同。GLM 等 Chat-compatible endpoint 可能先发 `function.arguments` 增量、后发 `id/name`，也可能出现只有 arguments 的异常 tool delta；Gateway 现在对 Codex Responses SSE 与 Anthropic Messages SSE 路径按 tool index 缓冲乱序参数，只有真实 `id + name` 到齐后才开启跨协议工具生命周期，永远没有身份的孤立参数直接丢弃，不再合成默认 `call_x/tool`。底层 streaming helper 同步收紧：新建工具块必须有真实 id/name，缺失返回 null，不再提供 synthetic fallback。本地回归覆盖乱序参数可恢复、孤立 `call call call` 不外泄、正常工具流不回退。
- 2026-06-20：继续收紧 Responses SSE 终态合同。Responses SSE 的正常完成必须以 `response.completed` 为准，不能把单独的 `[DONE]` 或网络 close 当成模型成功完成；否则 partial delta 会被 Chat/Anthropic adapter 伪装成 `stop` / `end_turn`，造成客户端任务提前结束。Gateway 现在在 Responses SSE -> Chat / Anthropic adapter 中遇到缺失 `response.completed` 的流会输出协议内 error 并记录 runtime failure，错误码 `model_gateway_responses_stream_missing_completed`；本地回归覆盖 partial 后 `[DONE]` 不再成功 finalize。
- 2026-06-20：继续收紧 Chat-compatible SSE 终态合同。OpenAI Chat-compatible streaming 的正常结束必须有最终 `finish_reason`，不能把单独的 `[DONE]` 或网络 close 当成模型成功完成；否则 partial delta 会被 Codex Responses / Anthropic Messages adapter 伪装成 `response.completed` / `message_stop`。Gateway 现在在 Chat SSE -> Codex Responses / Anthropic Messages adapter 中遇到缺失 `finish_reason` 的流会输出协议内 error 并记录 runtime failure，错误码 `model_gateway_chat_stream_missing_finish_reason`；本地回归覆盖 partial 后 `[DONE]` 不再成功 finalize。
- 2026-06-20：继续收紧 Anthropic Messages SSE 终态合同。Anthropic streaming 的正常结束必须有 `message_stop`，不能把网络 close 当成模型成功完成；否则 partial `content_block_delta` 会被 Chat adapter 伪装成 `finish_reason=stop`。Gateway 现在在 Anthropic SSE -> Chat adapter 中遇到缺失 `message_stop` 的流会输出协议内 error 并记录 runtime failure，错误码 `model_gateway_anthropic_stream_missing_message_stop`；本地回归覆盖 partial 后断流不再成功 finalize。
- 2026-06-20：重新核验 Codex app connection 的自动 compact 预算。OpenAI/codex 官方仓库 issue #10365 中有 maintainer 说明 `model_auto_compact_token_limit` 存在但不建议随意修改，因为阈值随模型变化；issue #16033 报告显式 `model_context_window` / `model_auto_compact_token_limit` 后 auto-compaction 不触发；issue #14456 说明 profile-scoped context/compact 键不受支持；issue #19409 专门记录 `gpt-5.5` 在 Codex Desktop/App 中出现 400k/1M catalog 与 session effective window 不一致。Tracevane runtime 也记录到一次 `gpt-5.5` 经 Gateway `/v1/responses` 返回 `context_length_exceeded`，且同段日志没有 `/v1/responses/compact` 请求；这些证据只能证明当时的有效窗口/阈值需要继续校准，不能证明 Codex 不支持顶层预算键。
- 2026-06-21：纠正上一轮“Codex 不写 context/compact”的阶段性结论。OpenAI Codex 官方 manual 示例明确保留 `model_context_window` 与 `model_auto_compact_token_limit`；本地源码核验 `ModelInfo::auto_compact_token_limit()` 会在显式值缺省时按 resolved context 的 90% 派生，并把显式 compact limit clamp 到 context 的 90%，`model_auto_compact_token_limit_scope` 的有效值为 `total` / `body_after_prefix`。真实 `codex exec` 小预算测试用 `model_context_window=2000`、`model_auto_compact_token_limit=200`、`scope=total` 跑通并在 session JSONL 中记录 `model_context_window:1900` 与 `context_compacted` 事件，证明这些键会进入运行时并能触发 auto compact。因此 Gateway 继续按 App Connection 所选模型的解析预算写入 Codex 顶层 `model_context_window` / `model_auto_compact_token_limit`；前端恢复统一预算语义，回归覆盖 Codex 预算写入和模型级预算合并。
- 2026-06-21：核验 React/Vite/Tailwind/shadcn/TanStack 当前官方资料后落地 Aurora React 前端。来源包括 React 新项目建议（`https://react.dev/learn/start-a-new-react-project`）、Vite 指南（`https://vite.dev/guide/`）、Tailwind v4 Vite 安装（`https://tailwindcss.com/docs/installation/using-vite`）、shadcn/ui Vite 与 Tailwind v4 文档（`https://ui.shadcn.com/docs/installation/vite`、`https://ui.shadcn.com/docs/tailwind-v4`）、React Router（`https://reactrouter.com/start/declarative/installation`）和 TanStack Query React（`https://tanstack.com/query/latest/docs/framework/react/overview`）。结论：React + Vite + Tailwind v4 + shadcn ownership 与用户指定方向一致，Vite 8 需要 `@vitejs/plugin-react@6`，因此本轮连同 Vite 升级。验证通过 web/api typecheck/build、diff check 和 Playwright 11 路由 smoke。
- 2026-06-21：前端目标从“原型重构”升级为“真实功能重做”。继续核验 React Router nested route、TanStack Query、Tailwind v4、shadcn/ui 方向，并用本机 OpenClaw 2026.6.8 CLI help 核验 `dashboard`、`config get/set/patch/schema/validate`、`doctor --lint/--repair`、`gateway status/restart/diagnostics`、`plugins`、`skills`、`agents`、`channels`、`secrets` 等官方管理面已存在。结论：Tracevane 主导航不复制完整 OpenClaw 控制台；新增 `/runtime-admin` 子域集中承载 OpenClaw 配置、扩展、Agent/渠道、服务和 doctor/recovery 支撑面，页面默认只读，只允许安全 `probe` 动作，repair/restart 需要后续确认流。架构记录见 `docs/frontend-functional-architecture.md`。
- 2026-06-21：继续优化大模型目录识别后的选择合同。本次不改变外部 provider API，只修正本地 UI 对已获取模型候选的批量选择语义：候选列表保持分页渲染，批量按钮从“选择当前筛选”收窄为“选择当前可见”，只勾选当前已渲染窗口，避免几百个模型时一次误选整套筛选结果并造成保存/管理混乱。静态回归锁定 `selectVisibleDetectedModels` 只遍历 `visibleDetectedCandidateModels`。
- 2026-06-21：继续收窄模型配置表的批量编辑范围。Provider 模型表支持分页渲染后，批量预算/能力按钮不能再默认修改隐藏行；本轮把“应用到全部”改为“应用到可见”，实现只遍历 `visibleDraftModelRowEntries`，降低大目录编辑时误改未渲染模型预算/能力的风险。静态回归锁定文案和遍历对象。
- 2026-06-21：继续加固 provider 自动识别的卡顿边界。本次不改变外部协议，仅修正本地探测实现：`detect-provider` 的 `timeoutMs` 后端统一 clamp 到 1s-30s，且 `/models` 和协议 probe 的响应正文读取也纳入同一个 timeout，并限制单个探测响应 body 最大 2MB；避免上游只返回 headers 后用超大/慢速 body 让管理接口长时间挂起。系统回归覆盖超大 `/models` body 会成为结构化 probe failure，且不会持久化 registry/secrets。
- 2026-06-18：核验 OpenAI Codex 官方 Advanced Configuration：`https://developers.openai.com/codex/config-advanced#oss-mode-local-providers` 是用户粘贴缺失后的正确入口；custom model providers / `openai_base_url` / `wire_api="responses"` 对 Tracevane Gateway 生成 Codex CLI 配置有帮助，`--oss` 主要面向 Ollama/本地模型 provider，不替代 Gateway 三协议适配测试。
- 2026-06-18：将“GLM 两种上游原生协议 + Codex 登录账户官方 Responses”整理为发布级协议矩阵，并新增 `scripts/smoke-model-gateway-protocol-matrix.mjs`；真实执行证明 GLM `coding-anthropic`、GLM `coding-chat`、`codex-account` 三项主流协议 proof 均通过，验证后 activeProviders 恢复为空。
- 2026-06-18：核验 OpenAI rate-limit 指南（`https://developers.openai.com/cookbook/examples/how_to_handle_rate_limits`）、Anthropic 错误文档（`https://docs.anthropic.com/en/api/errors` / `https://platform.claude.com/docs/en/api/errors`）、OpenAI Node `Retry-After` 讨论（`https://github.com/openai/openai-node/issues/1108`、`https://github.com/openai/openai-node/issues/1477`）和 Claude Code / community rate-limit 失败报告（例如 `https://github.com/anthropics/claude-code/issues/64030`、`https://github.com/vercel/ai/issues/5018`）；结论是 Gateway 不应对 rate/quota/capacity 失败做盲目同路由立即重试，而应保留上游错误、尊重 cooldown/Retry-After、更新 health/circuit 并允许 fallback。本地补 started streaming adapter failure 和 Retry-After 回归：已开始的 Chat/Responses/Anthropic SSE adapter 失败仍向客户端写协议内失败事件，同时 runtime 记 `failure`，provider 连续失败打开 circuit，下一次请求路由到 backup provider；普通 provider 和 endpoint profile 429 会保留上游错误码、写入对应 `health.retryAfterUntil`，到期前不 probe。
- 2026-06-18：本地补 Gateway endpoint health summary 回归；同 provider 多 endpoint fallback 后，`/api/model-gateway/status` 会显示 endpoint `openCircuits/degradedProviders`，全部启用 endpoint open 时 provider 不再计入 `okProviders`，避免 Overview/状态 API 掩盖真实路由不可用。
- 2026-06-18：核验 OpenClaw 官方 Gateway security/secrets、Gateway runbook、Gateway CLI restart `--safe`、plugins uninstall/manage 文档，以及本机 `openclaw gateway restart --help`；结论是 Recovery 应收敛 Gateway token 到 SecretRef/env 单一来源、清理废弃插件 allow/entry/index 残留、配置修复后优先 safe restart，并在修复前备份 runtime sidecar。本地补 Recovery 回归：SecretRef/env sync、Discord token 移除、`tracevane-local.gatewayAuthToken` 清理、`acpx`/`discord` residue 清理、legacy install index 归档、sidecar 回滚和 safe restart 合同。
- 2026-06-18：按用户要求制造真实 OpenClaw Recovery 损坏样本：破坏 Linux systemd Gateway service `ExecStart` 后，Recovery full repair 成功 reinstall/start 并等到 RPC ready；删除全局包 `openclaw.mjs` 后，Recovery 通过 install manifest 执行 `npm install -g openclaw@2026.6.8` 恢复 CLI。本轮因此修复 Gateway service repair 后过早 deep probe 的误判，以及 CLI shim 对 shell wrapper 的执行方式。
- 2026-06-18：核验 OpenClaw secrets 官方 CLI：`audit` 是只读扫描，`configure` 是交互式 helper，非交互 `--plan-out` 在当前环境需要 TTY。实际 audit 仍有 28 个 BigModel 明文 key finding 和 1 个 OpenAI OAuth legacy residue；已将 agent `models.json` 权限收紧到 `0600`，但明文迁移不由 Recovery 自动改写，后续应走官方交互式 SecretRef 迁移。
- 2026-06-18：核验 OpenClaw 官方 Web UI、Open WebUI、LibreChat、Dify、n8n、Microsoft/Oracle 企业 Agent builder、Langfuse、Codex CLI、Claude Code、OpenCode，以及 `AgentOps`、`Agent`、`Agent Nexus`、`Relay`、`Agent Harbor`、`Runplane`、`Workplane` 等名称占用情况；结论是 Tracevane 应避免 generic OpenClaw 管理控制台、generic chat UI、generic agent builder 和拥挤命名族。
- 2026-06-18：完成首轮产品命名候选预检。`TaskSmith` 已是 Claude Code unattended ops layer，`Runyard` 已是本地 AI 模型/AI Yard 产品，`Runcell` 已是 Jupyter-native AI Agent，`Opsmith` 已是 Progress/Chef IT Ops agentic AI 产品，`TraceLynx` 已是 traceability 软件公司；这些证明 `Task/Run/Ops/Trace+常见后缀` 需要更严格避让。当前采用 `Tracevane`：npm/PyPI/Docker official library 均返回 404，GitHub repo-name search 为 0，本机 DNS 未发现 `tracevane.{com,dev,ai,io,app}` 记录；仍需 registrar 和商标预检后才能公开发布。
- 2026-06-18：核验 Workspace IDE 方向的官方/原始资料：VS Code for the Web（`https://code.visualstudio.com/docs/remote/vscode-web`）证明浏览器 IDE UX 可行但受浏览器沙箱限制；Monaco Editor（`https://microsoft.github.io/monaco-editor/`）适合文本/代码/diff 编辑但不是完整 IDE；VS Code Webview 和 Custom Editor 文档（`https://code.visualstudio.com/api/extension-guides/webview`、`https://code.visualstudio.com/api/extension-guides/custom-editors`）验证预览/自定义编辑器应作为隔离视图与宿主通信；WebContainers（`https://webcontainers.io/guides/introduction`、`https://webcontainers.io/api`）证明浏览器 Node runtime 可行但应作为未来可选加速路径。结论：Tracevane Workspace IDE 应优先复用本机文件系统、进程、端口和 daemon-managed tasks；浏览器端负责编辑器、预览、证据和交互，不把项目文件或 secrets 放进纯浏览器运行时。
- 2026-06-18：补充产品 benchmark 研究并形成 `docs/product-benchmark-strategy.md`。核验 Cursor、Devin Desktop/Windsurf、OpenAI Codex、Claude Code、GitHub Copilot Agent、VS Code Agents、Cline/Roo/Continue/Aider/OpenHands、Replit/Lovable/Bolt/v0/Builder.io、Langfuse/LangSmith/Phoenix/Braintrust/AgentOps、Dify/n8n/Zapier 等方向；结论是 Tracevane 需要持续吸收 AI IDE、app builder、observability/eval、workflow/runtime 的优势，但每项能力必须翻译成本地优先、可监督、可证据化、可恢复的 Tracevane 工作流，不能做竞品页面集合。
