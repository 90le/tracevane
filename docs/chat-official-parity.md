# Chat Official Parity

> 更新时间：2026-04-08

这份文档只记录 Studio chat 插件清单与宿主安装元数据的职责边界，避免 `package.json` 和 `openclaw.plugin.json` 再次混用。

## 结论

1. `package.json` 是 Studio 的宿主安装元数据权威来源。
2. `openclaw.plugin.json` 保留插件清单、5.x activation 和 runtime contracts 信息，不承载宿主运行时入口语义。

## package.json 负责什么

`package.json` 负责：

1. `openclaw.id`
2. `openclaw.extensions`
3. `openclaw.runtimeExtensions`
4. `openclaw.install.minHostVersion`

这些字段直接决定宿主安装、源码/构建入口和 host compatibility 约束。

## openclaw.plugin.json 负责什么

`openclaw.plugin.json` 现在只保留插件市场/清单层需要的信息，以及 OpenClaw 5.x Gateway 规划插件启动所需的轻量运行时声明。

它负责：

1. `activation`
2. `contracts`

它不再负责：

1. `minHostVersion`
2. `requirements`
3. `provides`
4. 宿主运行时入口声明

## 维护规则

以后如果需要调整 host compatibility：

1. 先改 `package.json`
2. 不要把同类安装语义重新写回 `openclaw.plugin.json`

以后如果新增注册到宿主的工具或 Gateway 启动期能力：

1. 在 `openclaw.plugin.json` 更新 `contracts`
2. 需要 Gateway 启动时立即注册路由/服务/Hook 的能力，必须保留 `activation.onStartup`
