# Chat Official Parity

> 更新时间：2026-04-08

这份文档只记录 Studio chat 插件清单与宿主安装元数据的职责边界，避免 `package.json` 和 `openclaw.plugin.json` 再次混用。

## 结论

1. `package.json` 是 Studio 的宿主安装元数据权威来源。
2. `openclaw.plugin.json` 只保留轻量插件清单信息，不再承载宿主运行时入口语义。

## package.json 负责什么

`package.json` 负责：

1. `openclaw.id`
2. `openclaw.extensions`
3. `openclaw.install.minHostVersion`

这些字段直接决定宿主安装和 host compatibility 约束。

## openclaw.plugin.json 负责什么

`openclaw.plugin.json` 现在只保留插件市场/清单层需要的轻量信息。

它不再负责：

1. `minHostVersion`
2. `requirements`
3. `provides`
4. 宿主运行时入口声明

## 维护规则

以后如果需要调整 host compatibility：

1. 先改 `package.json`
2. 不要把同类安装语义重新写回 `openclaw.plugin.json`
