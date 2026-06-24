# Tracevane Aurora Console 设计方案

> 日期：2026-06-19
> 状态：方案待确认（先评审本文件，确认后再逐页出原型）
> 基线：`docs/prototypes/app.html`（SPA 框架入口，浅色默认 + 深浅双主题 + 可交互）
> 依据：`docs/产品需求.md`、`docs/系统架构.md`、`docs/界面设计守则.md` 与后端 14 个模块真实路由

## 1. 设计目标

让本地 AI Agent 工作流“可连接、可观察、可恢复、可证明”。界面只回答四件事：现在能不能工作、下一步做什么、过程用了什么、为什么卡住或失败。

不做：通用 OpenClaw 管理后台、通用 Chat UI、通用工作流编排器、把每个后端字段铺成表单。

## 2. 对 V8 的评估（为什么要新版）

V8 工整、克制、响应式没问题，但作为现代化美学标杆有四个短板：

1. 视觉重心散：三张均权状态卡 + 右栏同质线框，眼睛找不到主角。
2. 关键数字层级弱：核心指标和周围文字字重接近，扫读抓不住。
3. 深色发灰：蓝灰一团，面板与背景缺纵深。
4. 卡片边框噪声：每块都叠 border + 阴影 + 渐变高光，密集区显脏。

## 3. Aurora 视觉系统（已在仪表盘落地）

- 背景：浅色柔和 off-white、深色近黑画布，叠极淡 aurora 光场（非离散光球），建立纵深但不喧宾夺主。
- 层级：主对象区用 hero / 大指标拉开层级；关联区用行、卡、sparkline；配置进 Sheet / 抽屉。
- 主色：Tracevane 蓝为 primary，teal 作连接/恢复 accent；语义色绿/琥珀/红/紫各司其职。
- 双主题、4 套配色（蓝 / teal / 紫 / graphite），密度克制，圆角 9-18px，阴影低。
- 组件：行优先于卡；卡片只用于摘要、重复对象和弹层；命令面板补充导航。

## 4. 信息架构（左侧分组导航）

导航不复刻旧功能域，按“工作意图”分五组：

| 组 | 页面 | 形态 | 主要后端来源 |
| --- | --- | --- | --- |
| 总览 | 仪表盘 | Summary | dashboard summary + 各域聚合 |
| 运行 | 会话任务 | List-Detail + Status | chat、channel-connectors agent-sessions |
| 运行 | 工作区 IDE | Workbench | files、terminal、git |
| 运行 | 长任务 | List-Detail | cron、channel-connectors sessions、recovery |
| 连接 | 模型网关 | Status Console | model-gateway status/providers/usage/app-connections |
| 连接 | CLI Agents | List-Detail | agents |
| 连接 | IM 渠道 | List-Detail | channels、channel-connectors |
| 证据 | 文件证据 | Rows + Inspector | files、chat 附件、git diff |
| 证据 | 审批 | Rows + Inspector | channel-connectors 权限、recovery 写入预览 |
| 系统 | 自愈守护 | Status Console | openclaw-recovery、system、config |

## 5. 页面方案（首屏只放主对象，其余分层下沉）

### 仪表盘（已完成）
主对象是 readiness hero：一句话状态 + 三个关键指标 + 主操作。其下是带 sparkline 的接入态势卡（模型网关 / 渠道 / 外部）。右栏关注队列分“待处理 / 动态”。详情进 Sheet。

### 模型网关（Status Console）
首屏：当前激活模型 / Provider / endpoint + 路由健康 + smoke 证据。Provider 列表优先，单 Provider 配置、密钥引用、App Connection apply/rollback 进抽屉。Gateway key 等敏感项不平铺。

### 会话任务（List-Detail + Status）
左列会话/任务行（运行/等待/失败/完成状态优先），右舞台是选中会话的运行态、消息、工具调用、证据。日志进检视器，不与聊天平铺。

### 工作区 IDE（Workbench）
内部活动栏 + 文件树 + 多 tab 编辑器/预览 + 底部终端/输出 + Git/证据检视器。密集区用实色，材质退后。

### CLI Agents（List-Detail）
Agent 行 + 选中详情 tabs（persona / runtime / 模型绑定 / 工作目录 / 会话 / 高级 JSON）。配置进抽屉。

### IM 渠道（List-Detail）
账号/transport 行 + 选中详情（配对、Agent profile、权限、runtime/session）。凭据只显示引用。不做通用频道 CRUD。

### 文件证据（Rows + Inspector）
工作区文件、IM 附件、Agent 产物、预览截图、日志、diff 统一为行/表，详情进检视器。

### 审批（Rows + Inspector）
文件写入、命令执行、凭据访问、修复写入按风险排序，每条显示 diff/preview 后才可批准。

### 自愈守护（Status Console）
漂移检测项 + 推荐动作 + 修复路径。所有修复 backup → preview → apply → verify → rollback。

## 6. 交付节奏

1. 本文件确认后，先出 1 个最关键页（建议：会话任务 或 模型网关）单页原型对齐美学。
2. 认可后逐页出，共享同一 AppShell（侧栏/顶栏/命令面板/Sheet/双主题）。
3. 全部页面确认后再讨论是否进入 React + shadcn/ui + Tailwind 落地。

## 7. 约束

- 仅独立 HTML/CSS/JS，不连后端，不改 `apps/web`。
- 中文优先，库名/命令/协议保留英文。
- 每页深浅双主题、响应式、层次化（首屏只放主对象），无横向溢出。
- 后端缺的数据可先在原型里设计，后续补后端聚合（如 `/api/home/briefing`）。
