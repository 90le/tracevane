# Tracevane Aurora 原型框架架构

> 状态：Active 架构说明
> 日期：2026-06-19
> 范围：原型从“一页一文件”升级为 SPA 框架。本文件定义目录结构、模块职责、数据契约与落地映射。

## 1. 为什么要框架化

旧做法：每个页面是独立 HTML，各自复制一整套 shell（侧栏/顶栏/overlay），数据契约不统一（`\n` 字面量、`__NL__`、`data-sheet` 各写各的）。问题：
- 改导航要改 11 处。
- 字符暴露（换行符 `\n` 显示到前端）。
- 信息架构重复，落地 React 时几乎无法映射。

新做法：单一入口 + 按需加载的页面片段 + 统一数据契约。

## 2. 目录结构

```text
docs/prototypes/
├── app.html                 # 唯一入口：shell + stage + overlay + 脚本加载
├── app/
│   ├── styles.css           # 设计系统：token / base / shell / components / states
│   ├── states.js            # 数据契约与状态组件（sheet/dialog/toast/states）
│   ├── router.js            # hash 路由，按需 fetch 片段到 #stage
│   ├── pages.js             # 页面注册表 + 导航分组 + 全局命令
│   └── shell.js             # 应用壳行为（导航/主题/命令面板/事件分发）
├── pages/
│   └── *.html               # 页面片段（只含 <main> 主体，无 shell）
└── data/
    └── pages-data.js        # 各页面专属交互（AURORA_PAGE_MOUNT[path]）
```

## 3. 模块职责

| 模块 | 职责 | 不做 |
| --- | --- | --- |
| `app.html` | 提供唯一一套 overlay + stage 容器 + 脚本加载顺序 | 不含业务内容 |
| `styles.css` | 全部 token 与组件样式 | 不含页面专属类堆叠 |
| `states.js` | `openSheet/openDialog/toast/states` + `refreshIcons` | 不绑定全局事件 |
| `router.js` | hash 路由、fetch 片段、调用 mount | 不含 UI |
| `pages.js` | 注册页面（path/label/group/fragment）+ 导航分组 | 不含逻辑 |
| `shell.js` | 构建导航/命令面板、绑定 shell 事件、dispatch data-sheet/data-toast | 不含业务 mount |
| `pages/*.html` | 单页主体内容 | 不含 shell、overlay、script |
| `pages-data.js` | 每页 `AURORA_PAGE_MOUNT[path]` | 不重复绑定 overlay |

## 4. 数据契约（杜绝字符暴露）

旧：`data-sheet="标题|副标题|状态|来源|动作|说明|log1\nlog2\nlog3"` —— `\n` 是字面量，会显示到前端。

新：
- `data-sheet` 仍是管道分隔，但**第 7 段 log 一律用逗号/空格**，禁止 `\n` / `__NL__`。
- `states.openSheet(obj)` 接受结构化对象：`{ title, sub, status, owner, action, note, log:[...] , diff }`。log 用数组，渲染时 `join("\n")` 产生真实换行——**换行只发生在 JS 运行时，绝不进 HTML 属性**。
- 复杂对象（diff、多字段）走 `openSheet({ diff: '<div class="dl add">…</div>' })`，不再拼字符串。

## 5. 路由

- `pages.js` 用 `AuroraDefinePage({ path, label, group, fragment })` 注册。
- 导航项 `<a href="#/path" data-route="path">`，hash 变化触发 `router.render()`。
- `render()` fetch `pages/<fragment>.html` → 注入 `#stage` → `refreshIcons()` → 调用 `AURORA_PAGE_MOUNT[path](stage, shell)`。
- 跨页跳转用 `data-route` 或 `href="#/path"`。

## 6. 落地映射（原型 → React）

| 原型 | React |
| --- | --- |
| `router.js` hash 路由 | React Router |
| `pages/*.html` 片段 | page component |
| `pages-data.js` mount | page component 内 useEffect |
| `states.js` | shadcn Sheet/Dialog + 自定义 toast + TanStack Query 状态 |
| `pages.js` 导航 | 路由配置 + Sidebar manifest |
| `data-sheet` | 对象 → 组件 props |

## 7. 运行

需要通过本地静态服务（片段用 fetch 加载，不能直接 file:// 打开）：

```bash
cd docs/prototypes && python3 -m http.server 8088
# 浏览器打开 http://localhost:8088/app.html
```

## 8. 验证清单

- `node --check` 全部 `app/*.js`、`data/*.js` 通过。
- `grep -rn '\\n\|__NL__' pages/` 无输出（无字符暴露）。
- 每个片段 div 开闭平衡。
- 导航所有项可达，命令面板可搜索。
- 三态（loading/empty/error）在 dashboard 可演示。

## 8.1 健壮性（v3.1）

- **片段加载失败**：router 给出可重试的错误态（statebox error + 重试按钮），不再白屏。
- **错误信息转义**：异常 message 进 DOM 前做 HTML 转义，防注入。
- **mount 失败隔离**：页面专属交互抛错被单独捕获，仅 `console.warn`，不影响已加载的内容显示。
- **致命 bug 修复（v3.2）**：`shell.js` 关闭按钮绑定误写 `$(...).split(",")`（querySelector 返回元素非字符串，无 `.split`），导致 `bindShellEvents` 抛异常 → `window.AuroraShell` 未设置 → `router.init()` 未调用 → stage 全空白。修正为选择器数组逐个绑定。已用 headless Chrome + CDP 验证 11 页全部加载、导航切换、面包屑联动正常。
- **死代码清理**：移除了未完成的并行 `frame/`（views 空、无引用、与 `app/styles.css` 同源重复）。

## 8.2 运行环境说明

原型片段通过 `fetch` 加载，**不能直接用 file:// 打开**（浏览器跨域限制）。必须起本地静态服务：

```bash
cd docs/prototypes && python3 -m http.server 8088
# 浏览器打开 http://localhost:8088/app.html
```

注意：在 Codex 受限沙箱（bubblewrap + 网络隔离）内无法绑定 socket / 起服务 / 渲染浏览器，因此原型的人工验证（导航互联、三态、字符是否干净）需在能联网的本地环境进行。

## 8.3 已验证（headless Chrome + CDP）

在 `network unrestricted` 环境实测：
- 仪表盘：stage 加载 hero + conn-grid，导航 11 项，`\n` 暴露 = 0，无错误态。
- 模型网关：viewbar + provider 表格加载，路由 `#/model-gateway` 切换正常。
- 工作区 IDE：workbench + 终端加载。
- 异常数 0；导航 active 与面包屑随路由联动。
