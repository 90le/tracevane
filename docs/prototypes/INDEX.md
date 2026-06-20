# Tracevane 前端原型

> 更新：2026-06-20（v3.2 SPA 框架）

## 当前架构：SPA 原型框架

原型为**单一入口 + 按需加载片段**的框架，详见 `app/ARCHITECTURE.md`。

```text
docs/prototypes/
├── app.html              # 唯一入口（shell + stage + overlay）
├── app/                  # styles.css / states.js / router.js / pages.js / shell.js
├── pages/*.html          # 11 个页面片段（只含主体）
└── data/pages-data.js    # 各页专属交互 AURORA_PAGE_MOUNT[path]
```

运行：

```bash
cd docs/prototypes && python3 -m http.server 8088
# 浏览器打开 http://localhost:8088/app.html
```

v3 已解决：统一 shell（导航/主题/overlay 只一份）、修复换行符暴露（log 段不再用 `\n`/`__NL__`，改逗号分隔 + 结构化 `openSheet(obj)`）、hash 路由可靠互联（`#/path`）、落地 React 近似 1:1 映射。已用 headless Chrome + CDP 验证仪表盘/模型网关/IDE 加载、导航切换、面包屑联动、异常 0。

## 调研与审计

- `react-frontend-direction-research.md` - React + shadcn/ui 方向调研，记录生态证据、拒绝路线、风险和验证计划。
- `reference-design-audit.md` - `chat-workbench-rebuild-20260617` 全目录参考审计，记录可吸收优点和必须丢弃的缺陷。
- `aurora-design-system.md` - Aurora 设计体系（当前基线）：理念、token、应用壳、组件、页面形态、验收与 React 落地映射。
- `aurora-design-plan.md` - Aurora 方案说明：视觉系统、信息架构和逐页计划。

## 框架资产

- `app/styles.css` - 设计 token + 应用壳 + List-Detail / Workbench / Chat / 状态三态组件。
- `app/states.js` - 数据契约与状态组件：`openSheet/openDialog/toast/states`，换行在运行时 join，杜绝字符暴露。
- `app/router.js` - hash 路由，fetch 片段到 `#stage`，调用 mount，失败可重试。
- `app/pages.js` - 页面注册表 + 导航分组 + 全局命令。
- `app/shell.js` - 应用壳行为：导航/主题/命令面板/事件分发。
- `data/pages-data.js` - 各页 `AURORA_PAGE_MOUNT[path]`。

## 页面片段（`pages/`）

| 文件 | 页面 | 形态 | 说明 |
| --- | --- | --- | --- |
| `dashboard.html` | 仪表盘 | Summary | hero readiness + 接入态势卡 + 关注队列 + 三态演示（数据/加载/空/错误）。 |
| `model-gateway.html` | 模型网关 | 多视图 | 概览/Provider/配置/模型/账号池/接入/用量 7 视图；apply/rollback 走 Dialog + diff 预览。 |
| `ide.html` | 工作区 IDE | Workbench | 活动栏联动左面板 + 多 tab 编辑器 + 底部面板（终端/任务/问题/端口）+ 状态栏；手机端纵向堆叠。 |
| `chat.html` | 会话/Agent 工作台 | Chat Workbench | 会话列表 + 对话（工具调用/审批条）+ 证据检视器；手机端会话/检视器抽屉化。 |
| `cli-agents.html` | CLI Agents | List-Detail | Agent 实例 profile/会话/权限；模型路由只读引用并跳转网关；接入向导 Drawer，移除 Dialog。 |
| `im-channels.html` | IM 渠道 | List-Detail | 渠道/账号 + transport + 会话 + 投递证据；配置 Drawer，daemon 日志 Sheet。 |
| `external.html` | 外部连接 | List-Detail | MCP/OAuth/第三方集成，transport + 暴露工具 + 凭据引用。 |
| `files.html` | 文件证据 | Rows + Inspector | 文件/附件/生成物/截图/diff，检视器 diff 预览。 |
| `approvals.html` | 审批 | Console | 待审批 + 风险分级 + diff/preview，批准 Dialog。 |
| `recovery.html` | 自愈守护 | Status Console | 问题列表 + 修复流程（备份→预览→应用→校验→回滚）+ 服务。 |
| `long-tasks.html` | 长任务 | List-Detail | Agent run/cron/recovery，进度/暂停/停止/证据。 |

交互模式：不一律用抽屉。按 `aurora-design-system.md` §4.1/§8.2——行内控件做切换/编辑，Drawer 做表单编辑，Dialog 做危险确认，Sheet 只承载只读详情/证据，Toast 做即时反馈，列表选中就地更新检视器。

响应式：所有页面适配手机 / 平板 / 桌面 / 宽屏，断点 520 / 768 / 920 / 1080 / 1240 / 1600。List-Detail 在 ≤1080px 选中行后右侧检视器以抽屉滑入（带返回/遮罩/esc 关闭）。

域边界：模型网关是路由唯一真相（Provider/endpoint/模型/账号池/客户端接入 apply）；CLI Agents 管 Agent 实例（工作目录/persona/权限/session），模型路由只读引用并跳转网关。详见 `aurora-design-system.md` §8.1。

验收：11 片段 div 平衡、无重复 id、无 `\n`/`__NL__` 暴露、框架 JS 语法通过；CSS 含深浅主题、4 配色、6 个响应式断点、reduced-motion。headless Chrome + CDP 实测仪表盘/模型网关/IDE 加载与导航切换正常。

## 已清理方向

已删除（被 SPA 框架取代）：11 个旧单页 `tracevane-aurora-*.html`、旧 `aurora-shell.css`/`aurora-shell.js`、V8 基线 `dashboard-v3-balanced-workbench-theme-v8-durable-shell.html` 及其说明、早期 shadcn/Fluent/Material/V2-V7 探索。

## 共同约束

- 页面片段只含主体，shell/overlay 由 `app.html` 统一提供。
- 不连接后端。
- 不修改 `apps/web-vue`。
- 原型阶段中文为主，库名、命令、协议名保留英文。
- 包含深浅主题切换。
- 包含基础交互：主题切换、配色切换、对象 Sheet、命令面板、导航折叠、移动导航抽屉。
- Aurora 是当前应用壳基线：左侧分组导航、轻顶栏、柔和整体背景 + 极淡 aurora 光场、抬升实色面板、克制 accent。
- 后续全页面原型按 Tracevane 新定位组织：总览、运行、连接、证据、系统。
- 保留层次化：主对象层只承载当前任务或对象；关联层进入检视器 / Sheet / 子页面；低频配置默认不可见。
- 不恢复 Dreaming、旧插件管理、通用 OpenClaw CRUD 或旧模型链路诊断矩阵。
