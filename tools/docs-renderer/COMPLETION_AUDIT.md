# Tracevane Docs Renderer Completion Audit

日期：2026-06-25

本审计用于收口“15 轮优化后完成渲染工具”的目标。它记录当前功能边界、交付物和验证证据。最终完成判断以 `npm run docs:render:verify-all`、`npm run docs:render:smoke` 和 `git diff --check` 的当前输出为准。

## 交付物

| 交付物 | 路径 | 状态 |
| --- | --- | --- |
| CLI 渲染器 | `tools/docs-renderer/render-docs.py` | 完成 |
| Pandoc Lua filter | `tools/docs-renderer/filters/rich-blocks.lua` | 完成 |
| Standalone HTML template | `tools/docs-renderer/templates/standalone.html` | 完成 |
| 主题/布局样式 | `tools/docs-renderer/styles/tracevane-docs.css` | 完成 |
| 运行时模块 | `tools/docs-renderer/renderer/runtime/*.js` | 完成 |
| 示例文档 | `tools/docs-renderer/renderer/fixtures/*.md` | 完成 |
| README / 使用说明 | `tools/docs-renderer/README.md` | 完成 |
| SiYuan 融合分析 | `tools/docs-renderer/SIYUAN_FUSION_ANALYSIS.md` | 完成 |
| 15 轮优化记录 | `tools/docs-renderer/OPTIMIZATION_ROUNDS.md` | 完成至 Round 15 |
| 回归测试 | `tools/docs-renderer/tests/*.py` | 完成 |
| 一键验证入口 | `npm run docs:render:verify-all` | 完成 |
| 渲染输出 | `.tmp/docs-renderer-preview/`、`.tmp/docs-renderer-preview-site/` | 每轮重新生成 |

## 功能矩阵

| 能力 | 当前证据 | 验证 |
| --- | --- | --- |
| 单文件/目录站点渲染 | `render-docs.py` 支持文件和目录输入，目录生成 `index.html` | `docs:render:smoke` |
| 离线 Mermaid | 默认 `--mermaid-mode local`，按需内嵌本地 bundle | `docs:render:smoke`、`docs:render:verify-examples` |
| Mermaid SVG/PNG/源码/全屏 | `rich-blocks.js` 工具栏与导出逻辑 | `docs:render:verify-export`、`docs:render:verify-toolbar` |
| HTML Preview 静态沙箱 | `html-preview` iframe + CSP + no `allow-scripts` | `docs:render:verify-security`、`docs:render:verify-examples` |
| HTML Preview 全屏 viewport | Browser Viewer 手机/平板/桌面/全宽 | `docs:render:verify-browser` |
| 动态 HTML 安全边界 | 普通 `html` 只显示源码，带脚本 preview 不执行 | `docs:render:verify-examples`、`docs:render:verify-security` |
| Chart SVG/PNG/JSON/错误兜底 | 内置 bar/line SVG 和 parser error | `docs:render:verify-export`、`docs:render:verify-examples` |
| Mindmap SVG/PNG/源码/全屏 | 内置缩进文本到 SVG 的静态 mindmap 渲染 | `docs:render:verify-export`、`docs:render:verify-toolbar`、`docs:render:verify-examples` |
| 块引用 hover/focus 预览 | 同页 heading 锚点摘要 popover | `docs:render:verify-block-ref`、`docs:render:verify-all` |
| Inline Memo | Pandoc span 备注 hover/focus popover，打印展开 | `docs:render:verify-inline-memo`、`docs:render:verify-all` |
| 表格复制/全屏/横向滚动 | Markdown/CSV 复制、全屏表格、滚动提示 | `docs:render:verify-table` |
| 代码高亮/复制/换行 | 多语言高亮、复制全部/选区、换行状态 | `docs:render:verify-code` |
| 多文档搜索 | inline search index，不使用 `?q=`，覆盖 iframe/code/table | `docs:render:verify-search` |
| 静态引用关系 / Backlinks | 生成时扫描站内 Markdown 链接，侧栏展示入链/出链 | `docs:render:verify-link-graph`、`docs:render:verify-all` |
| 深色/浅色主题 | 主题 token 同步 Mermaid/Chart/Table/iframe | `docs:render:verify-theme` |
| 非侵入工具栏 | body-level fixed 外置微工具栏，不占内容位 | `docs:render:verify-toolbar` |
| 图片灯箱 | 图片自适应与灯箱查看 | `rich-rendering-gallery.md` + smoke |
| 打印/PDF | Print button + `@media print` | `docs:render:verify-print` |
| 可访问性 | skip link、ARIA search、modal focus trap | `docs:render:verify-a11y` |
| 性能 | 共享 viewport scheduler、lazy autosize、无 per-block 轮询 | `docs:render:verify-performance` |
| 安全后处理 | raw HTML sanitizer、危险 URL/属性阻断、CSP | `docs:render:verify-security` |

## 最终验证命令

```bash
npm run docs:render:verify-all
git diff --check
```

## 已知边界

- `html-preview` 是静态预览，不执行脚本；动态 HTML 需要未来新增独立显式语法和隔离模型。
- Chart 目前内置 bar/line；复杂图表应继续走 Mermaid 或未来新增受控 spec。
- 生成 HTML 使用 meta CSP 和 sandbox 作为静态文档防线；生产托管仍建议叠加 HTTP CSP header。
