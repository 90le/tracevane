# Tracevane Docs Renderer

Tracevane 独立 Markdown 富文档渲染器。它把 Markdown 文件或目录渲染为可直接打开的静态 HTML，并提供 Tracevane 品牌、侧栏目录、本页目录、代码块工具栏、Mermaid 工具栏、HTML preview、Chart preview、表格复制与弹出预览等能力。

## 使用

渲染单个文件：

```bash
python3 extensions/tracevane/tools/docs-renderer/render-docs.py extensions/tracevane/docs/Tracevane-Markdown渲染器Goal规格.md
```

渲染目录站点：

```bash
python3 extensions/tracevane/tools/docs-renderer/render-docs.py extensions/tracevane/docs --out /tmp/tracevane-docs-site --clean --site-title "Tracevane Docs"
```

默认会从本地 `node_modules` 打包 Mermaid 到生成 HTML，支持离线打开。若只想保留 Mermaid 源码、不打包渲染器：

```bash
python3 extensions/tracevane/tools/docs-renderer/render-docs.py extensions/tracevane/docs --out /tmp/tracevane-docs-site --clean --mermaid-mode disabled
```


## 功能矩阵

| 内容类型 | 语法 | 默认渲染 | 工具能力 | 安全/离线边界 |
| --- | --- | --- | --- | --- |
| 普通 Markdown | 标准 Markdown / Pandoc Markdown | 标题目录、脚注、任务列表、定义列表 | 搜索、高亮、打印/PDF | 纯静态 HTML |
| 代码块 | ```` ```js ```` 等 | 语法高亮、复制全部/选区、换行切换 | 源码弹层、搜索代码文本 | 不执行代码 |
| Mermaid | ```` ```mermaid ```` | 本地 bundle 离线 SVG 渲染 | 源码、SVG/PNG、全屏缩放拖动 | `securityLevel: strict`，默认 local bundle |
| HTML Preview | ```` ```html-preview ```` | sandbox iframe 静态预览、自适应高度 | 源码、全屏 Browser Viewer、手机/平板/桌面视口 | iframe CSP `script-src 'none'`，无 `allow-scripts` |
| 普通 HTML 源码 | ```` ```html ```` | 作为源码显示 | 代码块工具栏 | 不进入主 DOM，不执行 |
| Chart | ```` ```chart ```` JSON | 内置 SVG 柱状/折线 | JSON、SVG/PNG、全屏缩放拖动 | JSON 解析 + HTML escape，无外部依赖 |
| Mindmap | ```` ```mindmap ```` 缩进文本 | 依赖内置布局生成 SVG 思维导图 | 源码、SVG/PNG、全屏缩放拖动 | 借鉴 SiYuan Protyle subtype 分发，静态离线无脚本 |
| Markdown 表格 | `| A | B |` | 响应式横向滚动 | Markdown/CSV 复制、全屏表格查看 | 纯文本复制，不注入脚本 |
| 图片 | Markdown image | 自适应 + 灯箱 | 灯箱浏览 | 阻断危险 URL，支持 data:image 示例 |
| 块引用预览 | `[标题](#heading-id)` | 同页 heading 引用 hover/focus 预览摘要 | 点击仍按普通锚点跳转 | 借鉴 SiYuan block-ref popover，仅读取本页静态文本 |
| Inline Memo | `[文本]{.inline-memo memo="备注"}` | hover/focus 展示行内备注 | 打印时展开为括号备注 | 借鉴 SiYuan inline-memo，只读静态文本 |
| 引用关系 / Backlinks | 普通站内 Markdown 链接 | 侧栏显示入链/出链 | 普通链接跳转、键盘可达 | 生成时静态扫描，不抓远程、不建数据库 |

## HTML / 动态内容判定

- `html` 代码块永远是源码：用于展示代码，不渲染为 DOM。
- `html-preview` 是显式静态预览：进入 sandbox iframe，可展示 HTML/CSS，但脚本与事件处理器不会执行。
- raw HTML 不能作为主文档能力依赖：主文档后处理会清理高风险标签、事件属性、危险 URL 与固定定位样式。
- 动态 Demo 目前不是支持能力。未来如需支持，必须新增独立语法（例如 `html-live`），默认不启用，要求运行按钮、独立 CSP、无同源能力和清晰权限提示。

## 验证命令

常用回归：

```bash
npm run docs:render:smoke
npm run docs:render:verify-toolbar -- .tmp/docs-renderer-preview-site/rich-rendering-gallery.html
npm run docs:render:verify-search -- .tmp/docs-renderer-preview-site/rich-rendering-gallery.html
npm run docs:render:verify-security -- .tmp/docs-renderer-preview-site/unsafe-html.html
npm run docs:render:verify-examples -- .tmp/docs-renderer-preview-site/renderer-edge-cases.html
```

完整视觉/交互回归见 `tools/docs-renderer/tests/`。

## 富内容语法

### Mermaid

````markdown
```mermaid
flowchart LR
  A --> B
```
````

### HTML Preview

````markdown
```html-preview
<div style="padding:16px;border:1px solid #ddd;border-radius:12px;">Preview</div>
```
````

### Inline Memo

````markdown
[安全边界]{.inline-memo memo="普通 html 代码块保持源码，html-preview 只做静态沙箱预览。"}
````

### Mindmap Preview

````markdown
```mindmap
Docs Renderer
  Input
    Markdown
    Fixtures
  Output
    HTML
    Search index
  Safety
    Sandbox iframe
    CSP
  Link graph
    Incoming docs
    Outgoing docs
```
````

### Chart Preview

````markdown
```chart
{"title":"任务数","labels":["P0","P1","P2"],"series":[{"name":"Count","data":[5,8,3]}]}
```
````

支持 `type: "bar"` 分组柱状图与 `type: "line"` 折线图：

````markdown
```chart
{"title":"质量趋势","type":"line","labels":["v1","v2","v3"],"series":[{"name":"UX","data":[62,78,91]},{"name":"Safety","data":[70,86,94]}]}
```
````

### Callout

````markdown
::: warning
**Warning**：主文档默认不执行作者 HTML，动态示例必须使用未来单独的安全沙箱语义。
:::
````

更多示例见 `tools/docs-renderer/renderer/fixtures/rich-rendering-gallery.md`。

## SiYuan 借鉴说明

本工具借鉴思源笔记 Protyle 的两个稳定思想：

1. **显式渲染类型分发**：类似 Protyle 的 `data-subtype` renderer map，`mermaid`、`chart`、`mindmap`、`html-preview` 都有独立渲染器和 `data-*-ready` 防重复渲染标记。
2. **块引用预览**：同页 heading 锚点链接会获得只读 popover 摘要，类似思源 block-ref popover，但不依赖数据库、服务端查询或可编辑块模型。
3. **静态引用关系**：生成时扫描站内 Markdown 链接，在侧栏展示当前文档入链/出链，借鉴 SiYuan backlink 的阅读价值但不复制数据库查询模型。

我们没有复制思源的动态 HTML block、可编辑 Protyle block、嵌入块查询或 `securityLevel: loose` Mermaid 配置；这些不适合当前“可在线托管的静态安全文档”边界。

## 设计边界

- 默认按“可在线托管的静态 HTML”安全边界生成：Markdown 原始 HTML 被禁用，普通 ```html 只作为源码显示，不会直接进入主文档 DOM。
- `html-preview` 是显式 opt-in，当前以 `sandbox` iframe 隔离预览内容，并在 iframe `srcdoc` 内注入 `script-src 'none'` CSP，不允许脚本执行。
- 生成页会注入顶层 CSP meta，限制 `default-src`/`object-src`/`base-uri`/`form-action`，并对内联运行时脚本使用 SHA-256 hash 放行；这是一层防御，不等价于后端发布平台的 HTTP CSP header。
- Mermaid 默认用 `--mermaid-mode local` 从本地 `node_modules` 打包到包含 Mermaid 图的 HTML，并使用 `securityLevel: "strict"`；没有 Mermaid 图的页面不会嵌入大体积 bundle。可用 `--mermaid-mode cdn` 生成更小但依赖网络的文件，或用 `--mermaid-mode disabled` 生成只显示源码的无网络版本。
- 文档侧栏内置当前页搜索（`Ctrl/⌘+K` 聚焦），结果会高亮并支持 Enter 跳转下一处。
- 多文档站点会注入静态引用关系数据，侧栏显示当前文档被哪些文档引用、当前文档引用哪些站内文档。
- Mermaid、HTML Preview、Chart、表格和代码块工具栏采用 hover/focus 显示，降低阅读噪声；键盘聚焦时仍可访问。
- `--clean` 会拒绝清理仓库根、工具目录、用户家目录和过浅路径，避免误删。
- 后续若要支持“动态 HTML / 带脚本 Demo”，必须做成单独显式语法（例如 `html-live`），使用不含 `allow-same-origin` 的脚本沙箱、运行按钮和独立 CSP；不能把 `html-preview` 改成默认执行脚本。
