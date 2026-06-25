# OpenClaw 平台工作台重构规格

> Status: active implementation spec
> Updated: 2026-06-25
> Owner: Platform / OpenClaw

## 1. 背景与目标

Platform 域已经收敛为第三方平台管理域，`/platforms` 首页只展示真实平台目录。OpenClaw 是当前唯一真实平台，但现有 OpenClaw 子页仍处于过渡状态：多个子页集中在 `OpenClawSections.tsx`，页面形态偏“摘要块 + EvidenceRow”，不利于长期维护，也不符合 Tracevane 的 Aurora 工作台设计原则。

本轮目标是把 OpenClaw 做成 **Platform Workbench**：

- 子页面结构清晰，支持未来多平台扩展。
- 每个 section 有独立文件、独立页面职责、独立可测试边界。
- 页面形态从“卡片/摘要堆叠”升级为列表、表格、状态条、详情 Sheet/Drawer、设置分组和证据行。
- 可写能力只在存在后端契约、确认流、结果证据时开放；没有契约时保持只读证据，不做假按钮。
- OpenClaw 原生能力与 Tracevane owner 域严格分离：Model Gateway、IM Channels、CLI Agents、IDE 的写入口不搬入 OpenClaw。

## 2. 非目标

- 不复刻旧版 OpenClaw 管理后台的全部配置表单。
- 不在前端伪造没有后端支持的新增、编辑、删除、安装、密钥写入。
- 不把 Model Gateway Provider、IM Bot/route/session、CLI Agent Runs、IDE 文件/终端控制迁移进 Platform。
- 不删除兼容路由 `/recovery`、`/runtime-admin`；它们继续跳转到 OpenClaw Guard。
- 不引入新的前端依赖或新的视觉体系。

## 3. 信息架构

OpenClaw 目标路由保持：

```text
/platforms/openclaw
/platforms/openclaw/overview
/platforms/openclaw/guard
/platforms/openclaw/config
/platforms/openclaw/agents
/platforms/openclaw/skills
/platforms/openclaw/channels
/platforms/openclaw/bindings
/platforms/openclaw/services
/platforms/openclaw/logs
/platforms/openclaw/diagnostics
```

后续详情页预留：

```text
/platforms/openclaw/agents/:agentId
/platforms/openclaw/skills/:skillId
/platforms/openclaw/channels/:channelId
/platforms/openclaw/bindings/:bindingId
```

每个 OpenClaw 子页面统一使用：

```text
Platform breadcrumb
OpenClaw platform header / identity strip
OpenClaw local section navigation
Primary work surface
Optional detail Sheet / Drawer / Dialog
```

## 4. 前端目录结构目标

`features/platforms` 保留通用 Platform 外壳；OpenClaw 进入独立目录：

```text
apps/web/src/features/platforms/
├─ PlatformsPage.tsx
├─ sections.ts
├─ types.ts
├─ usePlatformsAggregate.ts
├─ _shared.tsx
├─ views/
│  ├─ OverviewView.tsx
│  └─ index.ts
└─ openclaw/
   ├─ OpenClawWorkspace.tsx
   ├─ OpenClawView.tsx
   ├─ components.tsx
   └─ sections/
      ├─ ConfigPage.tsx
      ├─ AgentsPage.tsx
      ├─ SkillsPage.tsx
      ├─ ChannelsPage.tsx
      ├─ BindingsPage.tsx
      ├─ ServicesPage.tsx
      ├─ LogsPage.tsx
      ├─ DiagnosticsPage.tsx
      └─ index.ts
```

迁移规则：

- 删除 `views/OpenClawSections.tsx` 聚合大文件。
- `views/OpenClawWorkspace.tsx` 迁移到 `openclaw/OpenClawWorkspace.tsx`。
- `views/OpenClawView.tsx` 迁移到 `openclaw/OpenClawView.tsx`。
- `views/index.ts` 只导出 Platform 首页与 OpenClaw workspace。
- 页面共享组件先集中在 `openclaw/components.tsx`，后续再按复杂度拆小。

## 5. 子页面设计

### 5.1 Overview

回答“OpenClaw 是否可用、有什么能力、下一步去哪”。

应展示：

- 平台身份、root/config 路径、最近检查。
- Gateway/service/daemon 基本状态。
- Agents/Skills/Channels/Config/Guard 能力入口。
- 重要异常和去 Guard/Diagnostics 的动作。

不得展示：

- Provider 编辑、IM route 编辑、CLI session 控制、完整 JSON 编辑。

### 5.2 Guard

承接原 Recovery。负责底座守护、修复、备份、恢复和 daemon/service 生命周期。

要求：

- 所有危险/写入动作必须有确认和结果证据。
- Guard 是修复入口；Diagnostics 是发现问题入口。

### 5.3 Config

配置页分为：

- Defaults
- Models & Compaction
- MCP Servers
- Commands
- Runtime paths
- Raw evidence

当前阶段：只读摘要 + 明确写入边界。
后续写入必须走：`edit -> validate -> diff -> backup -> apply -> verify`。

### 5.4 Agents

展示 OpenClaw Agent 定义，不管理 CLI Agent Runs。

页面形态：

- 搜索/过滤工具条。
- Agent 行列表。
- 选中/详情证据区或 Sheet。
- CLI 运行入口只做 owner-domain handoff。

### 5.5 Skills

展示技能注册、启用、依赖和阻塞状态。

页面形态：

- 状态过滤。
- 技能列表。
- 状态 badge。
- 详情证据。

不得做无契约的 marketplace install/remove。

### 5.6 Channels

展示 OpenClaw 原生 channel 配置摘要。Tracevane IM 账号、Bot token、路由、队列和会话投递仍在 IM Channels。

页面形态：

- Channel 类型表。
- account/binding/profile 数量。
- 到 IM Channels 的明确跳转。

### 5.7 Bindings

展示 OpenClaw channel -> agent/acp 静态绑定证据。IM 会话级动态路由仍在 IM Channels。

页面形态：

- 过滤/摘要。
- 绑定规则表。
- 技术条件和 owner 边界可读化。

### 5.8 Services

展示 runtime、gateway、daemon、supervisor 服务状态。启动/停止/安装等动作复用 Guard 的确认流。

页面形态：

- 服务状态表。
- 关键字段：service、supervisor、active、enabled、pid、path、last checked。
- 写操作入口优先跳 Guard。

### 5.9 Logs

展示人可读事件，不直接把原始日志铺满。

页面形态：

- severity/source/time 摘要。
- 近期事件列表。
- 原始 payload/技术 id 进入二级详情。

### 5.10 Diagnostics

展示检查项、失败项、修复建议和命令证据。

页面形态：

- 问题优先 checklist。
- Security/bootstrap/device trust/runtime 分组。
- 修复动作跳 Guard 或 owner 域。

## 6. 数据与写入边界

当前可用读来源：

- `/api/config`
- `/api/agents`
- `/api/channels`
- `/api/skills`
- `/api/system/*`
- `/api/openclaw-recovery/*`

写入原则：

1. 页面不得直接拼接 API URL。
2. 写入必须有 typed API/query hook。
3. 写入必须有确认、loading、成功/失败反馈和 query invalidate。
4. 配置写入必须 validate/diff/backup/apply/verify。
5. 没有后端契约的能力只显示 read-only evidence，不显示 disabled 假按钮。

## 7. 验收标准

- `/platforms/openclaw/*` 所有 section 可访问。
- OpenClaw 子页文件已从 `OpenClawSections.tsx` 拆分。
- 页面不再表现为介绍页或卡片墙，而是工作台形态。
- owner-domain 边界文案仍存在：IM route 属于 IM Channels，CLI runs 属于 CLI Agents。
- 桌面/移动无横向溢出风险：长文本、长路径、技术 ID 必须 truncate/wrap。
- TypeScript、web build、platform system tests 通过。
- 文档与系统测试同步更新。

## 8. 前端功能闭环要求

OpenClaw 子页面不是静态报表。每个 read/evidence 页面必须提供最小可用交互闭环：

- 可刷新：工具条提供刷新动作，触发对应 query refetch，并显示 loading/spinner 状态。
- 可筛选/搜索：对象多于一组时提供搜索或状态过滤。
- 可选择：表格行可点击、可键盘 Enter/Space 选择，具备 `aria-selected` 和明确选中态。
- 可联动：右侧详情 rail 必须显示当前选中对象，不能永远展示第一条。
- 可恢复：过滤结果为空时显示空状态，详情 rail 不崩溃；过滤结果变化时自动选择仍存在的对象或第一条。
- 可读：技术 ID、路径和 JSON 摘要必须 truncate/wrap，不得撑破页面。
- 可边界：只读页面必须持续显示 read-only 和 owner-domain handoff，避免用户误解为可在 Platform 编辑所有东西。

当前实现通过 `SelectableRow`、`useSelectedKey`、`RefreshButton`、`ResponsiveTable` 和 `DetailRail` 收敛交互模式。后续新增 section 必须复用这些模式，除非有明确设计原因和测试覆盖。


## 9. Config 第一阶段写入范围

OpenClaw Config 页面第一阶段只开放低风险、可由现有 `PATCH /api/config` 合并保存的字段：

- `agents.defaults.model`：默认模型。
- `agents.defaults.maxConcurrent`：最大并发。
- `agents.defaults.workspace`：默认工作目录。
- `agents.defaults.repoRoot`：默认仓库根。
- `agents.defaults.contextTokens`：上下文 token 预算。
- `agents.defaults.compaction.mode`：压缩模式。
- `agents.defaults.compaction.model`：压缩模型。
- `agents.defaults.compaction.reserveTokensFloor`：压缩保留 token 下限。

交互要求：

- 使用 draft 表单，不直接边输入边保存。
- 有脏状态 badge、保存、重置、保存中、成功和失败反馈。
- 保存成功后刷新 config 与 diagnostics。
- MCP servers、Commands、raw JSON、Provider、密钥、IM/CLI owner 域配置继续只读，直到有更细的 typed backend contract、备份和 diff/validate 流。

守护服务状态要求：`GET /api/openclaw-recovery/daemon-service` 和 `/status` 必须执行安全只读 service-manager probe；存储快照里的 `unknown` 不能覆盖实时探测出的 `active/enabled/inactive/disabled`。

## 10. 配置工作台分组与空白页修复

- Config 不再作为单一巨型表单，也不回退到只读摘要；当前拆为 `基础 / 模型 / 策略 / 安全 / 网关 / 会话消息 / 高级证据` 七个子页面式分组。
- 可写范围统一走 `PATCH /api/config`：defaults、compaction、sandbox、tools、execApprovals defaults、gateway、session、messages 这些已有后端 merge/save/audit 契约的字段。
- 高风险对象保持证据只读：Provider secret、MCP server、Commands、raw JSON、IM/CLI owner 数据。后续如开放写入，必须先增加 validate → diff → backup → apply → verify 的专门流程。
- OpenClaw 所有 workbench 子页必须遵守 React Hooks 顺序：`useSelectedKey` 等 Hook 必须在 loading/error early return 前调用，避免数据加载后 hook order 改变导致页面白屏。
- Agents/Skills/Channels/Bindings/Services/Logs/Diagnostics 的空白页根因与 Config 相同，均已纳入 system test 回归。

## 11. Config 性能与中文化约束

- Config 首屏只等待 `/api/config`，不再等待较慢的 diagnostics；诊断证据作为右侧 rail 的可选补充，未返回时显示 `—`。
- 子页面只渲染当前分组字段；高级证据只在进入高级分组时渲染 Provider / MCP / Commands 摘要，避免首屏创建大量 JSON DOM。
- 用户可见字段必须中文化；内部保存值仍保持 OpenClaw 原始枚举，例如 `read-only`、`workspace-write`、`rw`、`ro`，不能为了中文显示改写配置值。
- 设置项来源以 `ConfigSummaryPayload` 和 `applyConfigUpdate` 已支持的写入契约为准；旧 Vue 版本若后续找到，只作为字段覆盖参考，不作为直接迁移依据。
