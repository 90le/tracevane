# Tracevane 前端原型

本地优先的 AI Agent 控制工作台的前端原型。基于 Aurora 设计体系，单入口 SPA 框架。

> 2026-06-21：Aurora 原型已落入 `apps/web-vue` 的 React + TypeScript + Vite 前端。本文仍保留原型运行方式，作为视觉/交互源和后续页面调整的参考。
> 同日更新：生产前端目标不是停留在 raw HTML 原型渲染。原型只作为视觉/交互合同，真实功能逐页迁移到 React component + TanStack Query + 现有 API。详见 `../frontend-functional-architecture.md`。

## 快速开始

```bash
cd docs/prototypes
python3 -m http.server 8088
# 浏览器打开 http://localhost:8088/app.html
```

> 片段通过 fetch 加载，不能直接用 `file://` 打开，必须起本地静态服务。

## 架构（一图看懂）

```
app.html              唯一入口：shell + #stage + overlay（sheet/dialog/cmd/toast）
  └ app/              框架
     ├ styles.css     token + 全部组件样式
     ├ states.js      数据契约：openSheet / openDialog / toast / states（三态）
     ├ router.js      hash 路由，fetch 片段到 #stage，调用 mount
     ├ pages.js       页面注册表 + 导航分组 + 全局命令
     └ shell.js       应用壳行为：导航 / 主题 / 命令面板 / 事件分发
  └ pages/*.html      11 个页面片段（只含主体，无 shell）
  └ data/pages-data.js  各页专属交互 AURORA_PAGE_MOUNT[path]
```

详见 `app/ARCHITECTURE.md`。

## 导航

点击左侧栏切换页面，或用命令面板（`⌘K` / `Ctrl+K`）。URL 形如 `app.html#/model-gateway`，可直接分享/刷新。

## 加一个新页面

1. 在 `pages/` 新建 `my-page.html`，只写 `<main>` 主体片段。
2. 在 `app/pages.js` 的 `defs` 加一行：`{ path: "my-page", label: "我的页", group: "运行", fragment: "my-page" }`，并在对应 `AURORA_NAV` 组里加导航项。
3. 如需交互，在 `data/pages-data.js` 加 `window.AURORA_PAGE_MOUNT["my-page"] = function(stage, shell){ ... }`。
4. 用 `shell.openSheet(obj)` / `shell.openDialog(cfg)` / `shell.toast(msg)` / `shell.states(el, kind)`，不要自己绑 overlay。

## 数据契约（避免字符暴露）

sheet 数据用结构化对象，换行在运行时 join，**不要在 HTML 属性里写 `\n`**：

```js
shell.openSheet({ title, sub, status, owner, action, note, log: ["a", "b"] });
```

简单场景仍可用 `data-sheet="标题|副标题|状态|来源|动作|说明|log 纯文本逗号分隔"`，第 7 段不要含 `\n` 或 `__NL__`。

## 交互模式（不一律抽屉）

按 `aurora-design-system.md` §4.1/§8.2：行内控件做切换/编辑，Drawer 做表单，Dialog 做危险确认，Sheet 只承载只读详情，Toast 做即时反馈，列表选中就地更新检视器。

## 落地 React

| 原型 | React |
| --- | --- |
| `router.js` | React Router |
| `pages/*.html` | page component |
| `pages-data.js` mount | useEffect |
| `states.js` | shadcn Sheet/Dialog + toast + TanStack Query |
| `pages.js` 导航 | Sidebar manifest + 路由配置 |

当前实现：

- `apps/web-vue/src/app/route-manifest.ts` 对应 `app/pages.js`。
- `apps/web-vue/src/app/PrototypePage.tsx` 把 11 个 HTML 片段作为 raw fragments 渲染为 React page。
- `apps/web-vue/src/app/page-mounts.ts` 对应 `data/pages-data.js` 的交互 mount。
- `apps/web-vue/src/app/AuroraShell.tsx` 对应 shell / overlay / command / theme / navigation。
- `apps/web-vue/src/app/PlatformIntegrationsPage.tsx` 是平台集成总览，挂载 `/platforms`，只展示第三方平台身份、健康、权限和诊断边界。
- `apps/web-vue/src/app/OpenClawPlatformPage.tsx` 是第一个深度平台子域，挂载 `/platforms/openclaw` 和 `/platforms/openclaw/:section`，消费现有系统、配置、Agent、渠道、Skills、服务和 OpenClaw Recovery API；旧 `/runtime-admin` 路由只做跳转。

迁移规则：

1. 先保留 Aurora 布局和路由合同。
2. 明确页面需要的现有 API 数据。
3. 用 TanStack Query 接入真实数据和 loading/empty/error。
4. 再删除对应 prototype-only DOM mount 行为。
5. 为每个完成迁移的页面补系统合同测试。

## 相关文档

- `app/ARCHITECTURE.md` — 架构、模块职责、数据契约、验证清单
- `aurora-design-system.md` — 设计体系（token / 组件 / 页面形态 / 验收）
- `INDEX.md` — 文件清单与页面形态映射
