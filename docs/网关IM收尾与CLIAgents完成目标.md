# 网关模型 / IM 渠道收尾与 CLI Agents 完成目标

> 状态：Active execution spec
> 创建：2026-06-24
> 适用范围：Model Gateway、IM Channels、CLI Agents、Agent Runs 聚合、相关前端/后端/文档/测试。
> 设计约束：以 `DESIGN.md`、`docs/界面设计守则.md`、`docs/prototypes/Aurora设计体系.md`、`docs/prototypes/pages/model-gateway.html`、`docs/prototypes/pages/im-channels.html`、`docs/prototypes/pages/cli-agents.html` 为准。

## 1. 当前判断

### 1.1 Model Gateway 当前状态

Model Gateway 已完成主链路：Provider、模型、端点、路由、客户端接入、active-route smoke、Provider smoke、Codex Account、用量/缓存证据、模型上下文显示、主要响应式边界。当前剩余工作不是继续重构主域，而是收尾：

- 用真实客户端继续验证 Codex / Claude Code / OpenCode 路由一致性。
- 确保页面继续保持 table/list/detail 形态，不回退成 card wall。
- 把 Gateway 相关运行态引用明确跳转到 CLI Agents，不在 Gateway 重复 Agent Runtime。
- 保持 usage 口径：只展示 provider usage 证据，不伪造成本、折扣或缓存命中率。

### 1.2 IM Channels 当前状态

IM Channels 已完成 P0/P1 主链路：平台账号、绑定路由、会话投递、独立 Agent/模型/目录/权限、全局并发/队列、守护诊断、保存并重启闭环、飞书私聊/群聊证据链、会话覆盖和重置。当前剩余工作是收尾：

- 真实飞书私聊/群聊事件需要人工或真实平台触发验证，代码侧只保留证据链。
- 页面形态必须继续是 Aurora viewbar + rows/table + Drawer/Dialog/Sheet；不做卡片墙。
- IM 页不拥有 Provider、模型路由、CLI runtime、通用终端写操作。
- IM 会话可链接到 CLI Agents / Agent Runs，但不重复实现 Agent Run 管理。

### 1.3 CLI Agents 当前状态

CLI Agents 已经从 OpenClaw/Persona/通用终端混杂状态中初步收敛：

- `/api/agents/runs` 已能聚合 terminal / IM / chat 三类 Agent Run。
- 前端有 `overview` / `runs` / `cli` / `evidence` 四个 view。
- `runs` 是只读运行态列表。
- `cli` 读取 `/api/terminal/status` 和 Gateway health。
- `evidence` 只读展示 IM session driver 和 Chat bootstrap 证据。

但 CLI Agents 仍未完成 P0：

1. **CLI readiness 不够完整**
   只显示安装状态，没有把安装目标、缺失修复、配置路径、网关接入状态、模型路由引用组织成可操作的 workbench。

2. **Launch/session flow 不完整**
   前端已有 `useLaunchTerminalMutation`、`useEndTerminalSessionMutation`、`useDeleteTerminalSessionMutation`，但 CLI Agents 页面没有完整承载：
   - 选择 CLI
   - 解析启动命令
   - 复制命令或跳转 IDE 终端执行
   - 查看由终端产生的 Agent Run
   - 对运行/分离 session 提供安全 stop/end
   - 对非活跃 persisted session 提供 delete

3. **终端边界表达仍需更准确**
   通用终端归 IDE，但 CLI Agents 可以管理“Agent-sourced terminal session”的 stop/delete/link evidence。不能重新做 xterm，不接管 input/resize/terminal UI。

4. **运行证据仍然偏技术**
   IM active session title、terminal session、chat run 需要在 Agent Runs 表里显示更可读的来源、模型、目录、状态、最后错误、证据跳转。

5. **后端 Agent Run projection 字段不够完整**
   现在 `AgentRuntimeRunSummary` 缺少 source label、actionability/canStop/canDelete、primary href 等便利字段；前端只能自己推断，容易分散。

6. **缺少 CLI Agents web/system regression**
   目前主要有 `agents-runtime-runs.test.mjs`，缺少 CLI Agents 页面边界、Launch/Session 控制、非卡片化设计的静态回归。

## 2. 总目标

一次性完成除人工验证外的自动化任务：

1. **Model Gateway 收尾**
   保持现有完成态，补必要文档和回归，避免重复 Agent runtime、卡片化或用量口径漂移。

2. **IM Channels 收尾**
   保持现有完成态，补必要文档和回归，确保页面形态、飞书证据链、队列/会话/路由边界稳定。

3. **CLI Agents P0/P1 完成**
   前端和后端都达到可真实使用：CLI readiness、Gateway route reference、launch command flow、Agent Runs、Agent terminal session controls、Evidence links、错误/空状态/响应式、文档和测试闭环。

## 3. 非人工可完成任务

### 3.1 后端 / 类型

- 扩展 `types/agents.ts` 的 `AgentRuntimeRunSummary`：
  - `sourceLabel`
  - `primaryHref`
  - `canOpen`
  - `canStop`
  - `canDelete`
  - `lastErrorSummary`
  - `metadata`（只放脱敏、可展示字段）
- 更新 `apps/api/modules/agents/runtime-runs.ts`：
  - terminal run：可 stop/delete 的判定来自 session status。
  - IM run：stop/reset/kill 仍属于 IM Channels，CLI Agents 只提供链接，不直接操作。
  - chat run：操作回到 Chat。
  - 运行排序优先 running/failed，再按 updatedAt。
  - title 不使用不可读 raw id；能用 title、session name、agent/model/workspace 组合。
- 保持 `/api/agents/runs` 为只读 BFF，不把 IM/Gateway/PTY 写操作合并进去。
- 不增加未验证的真实 CLI 启动 endpoint；已存在 `/api/terminal/launch` 是解析命令，不 spawn PTY。

### 3.2 CLI Agents 前端

#### Overview

- 保持摘要页，不重复 IM/Gateway/Terminal 详情。
- 显示：CLI readiness、Gateway health、Agent Run totals、待处理错误。
- 提供入口：运行中、CLI 状态、证据、模型网关、IM 渠道、IDE。

#### Runs

- 作为主运行表：row/table/list-first，不做卡片墙。
- 支持筛选：全部 / running / failed / terminal / IM / chat。
- 每行显示：来源、CLI、模型、目录、状态、更新时间、错误摘要、证据跳转。
- 只对可证明归属的 terminal run 显示 `停止` / `删除记录`；其它来源显示“去所属页面处理”。
- 删除/停止必须 Dialog 确认；结果 Toast；成功后 refetch。
- 小屏使用列优先级和首列摘要，不改成卡片页。

#### CLI Runtime

- 每个 CLI 一行：Codex / Claude Code / OpenCode。
- 显示安装状态、版本、二进制路径、可安装与否、默认模型/Provider、Gateway health。
- 支持“解析启动命令”：调用 `/api/terminal/launch`，显示命令、复制、跳 IDE。
- 缺失 CLI 显示安装建议，但不自动安装，除非已有 backend install flow 且明确标注影响。
- 路由/模型修改跳到 Model Gateway，不在这里编辑。

#### Evidence

- 改为“原始证据索引”，不是主操作页。
- IM / Chat / Terminal 证据均只读，并链接到 owning domain。
- 降低 raw event 的主视觉权重。

### 3.3 文档

- 更新 `docs/CLI代理目标与设计.md`：从目标升级为完成规格和验收标准。
- 更新 `docs/Tracevane三域重构任务目标.md`：补本轮收尾状态。
- 更新 `docs/前端功能架构.md` / `docs/系统架构.md` 中 CLI Agents 的职责表述。
- 更新 `docs/研究先行开发清单.md`：记录设计来源、边界、拒绝项、验证计划。

### 3.4 测试

- 扩展 `tests/system/agents-runtime-runs.test.mjs`：覆盖新增字段、排序、actionability。
- 新增或扩展 `tests/system/web-cli-agents.test.mjs`：
  - view set 完整。
  - 不出现 OpenClaw generic persona/admin 主入口。
  - Runs 有筛选、stop/delete 确认、owning domain links。
  - CLI runtime 有 launch command flow、Gateway handoff、缺失/安装提示。
  - 保持 list/table/row-first，不出现 card wall。
- 保留现有 Gateway/IM 回归，确保收尾不破坏已完成域。

## 4. 可以做

- 修改前端 TypeScript/React 代码。
- 修改后端 BFF、类型和只读 projection。
- 使用已有 terminal launch/end/delete API。
- 增加系统测试和静态契约测试。
- 更新文档、研究清单、任务目标。
- 重启本地 dev 服务验证。
- 提交 git commit，使用 Lore protocol。

## 5. 不能做

- 不把 Model Gateway、IM Channels、CLI Agents 合并为一个巨型后端或页面。
- 不在 CLI Agents 编辑 Provider 密钥、模型路由、IM token、IM 绑定。
- 不在 CLI Agents 实现通用 terminal/xterm/input/resize UI。
- 不伪造 CLI context/compaction 能力；无法检测则显示未知或跳转配置源。
- 不为了响应式把管理台改成卡片墙。
- 不新增依赖，除非用户明确批准。
- 不执行需要人工确认的真实外部账号授权、真实 IM 消息发送、真实 Provider 花费测试；这些只列为人工验证项。

## 6. 人工保留项

以下需要用户或真实环境参与，不作为自动完成阻塞：

- 真实飞书 DM / 群聊各发一条消息，确认 UI 标识。
- 真实 Codex / Claude Code / OpenCode CLI 使用用户账号跑长任务。
- 真实 Provider 费用型压测。
- 用户决定是否允许自动安装缺失 CLI。

## 7. 验收标准

- `npm run typecheck:api` 通过。
- `npm run typecheck:web` 通过。
- `npm run build:api` 通过。
- `npm run build:web` 通过。
- `node --test tests/system/agents-runtime-runs.test.mjs tests/system/web-cli-agents.test.mjs` 通过。
- 相关 Gateway/IM web regression 通过。
- `git diff --check` / `git diff --cached --check` 通过。
- 本地服务重启后 frontend/backend health 可访问。
- 文档更新完成，并明确剩余人工项。

## 8. 2026-06-24 执行进度

### 8.1 设计修正：CLI Agents 做减法

根据最新评估，CLI Agents 不应重复 Model Gateway 和 IM Channels 的配置能力。本轮执行把 CLI Agents 重新收敛为 **Agent CLI 运行管理台**：

- 主对象：Codex / Claude Code / OpenCode 的 readiness、启动命令、Agent Runs、Agent-sourced terminal session 操作、证据跳转。
- 只读引用：Model Gateway 仅作为模型/Provider/路由依赖链接；IM Channels 仅作为 IM session/evidence owner 链接。
- 删除/避免：Provider 新建、模型路由编辑、IM 账号/凭据/绑定编辑、通用终端 PTY 输入/resize、OpenClaw persona CRUD。
- 页面形态：继续使用 Aurora viewbar + table/list + dialog；不采用 card wall。

### 8.2 已实施代码任务

- 后端 `AgentRuntimeRunSummary` 增加 `sourceLabel`、`primaryHref`、`canOpen`、`canStop`、`canDelete`、`lastErrorSummary`、`metadata`。
- `/api/agents/runs` 统一投影 terminal / IM / chat：
  - terminal 只对 Codex / Claude / OpenCode 这类 Agent CLI session 标记 stop/delete 能力；普通 bash 不在 CLI Agents 越权管理。
  - IM session 使用平台 + 私聊/群聊语义生成可读来源，原始 poolKey/sessionKey 放入 metadata。
  - Chat run 只投影活跃、异常或 abort/error 状态，不把普通 idle 历史刷进运行台。
- CLI Agents 前端重构为：
  - `概览`：任务路由与边界说明，不重复 Gateway/IM 主页面。
  - `运行台`：table-first Agent Runs，支持筛选、打开 evidence、stop/delete 安全确认。
  - `启动台`：CLI readiness + 启动命令解析/复制/跳 IDE。
  - `证据索引`：只读证据入口。
- 新增 `tests/system/web-cli-agents.test.mjs`，保护 CLI Agents 边界、table-first、launch handoff 和非重复设计。

### 8.3 人工保留项

- 真实 Codex / Claude Code / OpenCode 外部登录授权。
- 真实 IM 平台消息触发和 webhook/长连接事件。
- 真实付费模型压测和长上下文费用验证。


### 8.4 验证结果

自动验证已完成：

- `npm run typecheck:api`：通过。
- `npm run typecheck:web`：通过。
- `npm run build:api`：通过。
- `node --test tests/system/agents-runtime-runs.test.mjs tests/system/web-cli-agents.test.mjs tests/system/web-channel-connectors.test.mjs tests/system/web-model-gateway.test.mjs`：31 个测试通过。
- `npm run build:web`：通过。
- `git diff --check`：通过。
- `bash scripts/restart-dev.sh`：前端 `5176`、后端 `3761` ready。
- `curl http://127.0.0.1:5176/`：通过。
- `curl http://127.0.0.1:3761/api/agents/runs`：通过，返回新增 `sourceLabel` / `primaryHref` / `canStop` / `canDelete` / `metadata` 字段。

### 8.5 完成状态

- Model Gateway：本轮未改主链路，只保留回归，避免 CLI 页面重复 Gateway 管理。
- IM Channels：本轮未改主链路，只保留回归；CLI 页面只链接 IM evidence，不重复 IM 账号/路由配置。
- CLI Agents：P0 完成；P1 中“真实 CLI config path/context/compaction 自动检测”仍保留为后续增强，因为需要各 CLI 官方稳定配置合约和本机真实登录状态。

## 9. 2026-06-25 十轮继续优化记录

目标：在不扩大 Gateway / IM / CLI 三域职责、不引入重复配置页的前提下，继续把 CLI Agents 做成可实际管理的运行工作台。

1. **运行台可检索**：Agent Runs 增加搜索框，支持按 run 标题、模型、目录、错误、session、metadata 搜索。
2. **操作边界后端化**：`AgentRuntimeRunSummary` 增加 `actionLabel` 与 `actionReason`，由后端明确告诉前端能否在 CLI Agents 操作以及原因。
3. **终端控制更安全**：只有后端识别为 Codex / Claude Code / OpenCode 的 Agent terminal session 才展示 stop/delete；普通终端只跳 IDE。
4. **运行台说明更清晰**：每行显示 action reason，用户能看到“为什么要去 IM / Chat / IDE”。
5. **启动台刷新更完整**：刷新 CLI 状态时同步刷新 Gateway 依赖，避免 CLI readiness 和路由状态不同步。
6. **启动命令复制更稳**：Clipboard API 不可用时回退到隐藏 textarea + `execCommand('copy')`，失败时给出手动复制提示。
7. **启动按钮状态更明确**：未安装 CLI 时按钮 title 说明无法解析启动命令，避免误以为网关问题。
8. **证据索引事件可读化**：IM session driver 原始事件类型映射为“开始处理消息 / Agent 回复完成 / 新会话已创建”等中文动作。
9. **证据索引来源统一**：平台 + 私聊/群聊标签通过统一 helper 生成，避免不同区域文案不一致。
10. **回归测试补强**：`web-cli-agents.test.mjs` 和 `agents-runtime-runs.test.mjs` 增加搜索、action reason、复制降级、Gateway refresh、事件翻译断言。

当前已验证：

- `npm run typecheck:api`：通过。
- `npm run typecheck:web`：通过。
- `node --test tests/system/web-cli-agents.test.mjs`：通过。
