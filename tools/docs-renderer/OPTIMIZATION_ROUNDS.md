# Tracevane Docs Renderer 15 轮优化记录

目标：在保持离线、安全、可验证的前提下，把 `tools/docs-renderer` 迭代成高质量文档渲染器。每轮必须有明确改动、重新渲染预览 HTML、并记录验证证据。

## 轮次进度

### Round 1 / 15 — 统一上下文工具栏，不占正文布局

状态：完成。

改进：

- 将 Mermaid、HTML Preview、Chart、Table 的上下文工具栏统一为 `body` 级浮层。
- 工具栏不再存在于 `main` 文章流，也不再存在于对应内容块内部。
- 默认隐藏，hover/focus 或键盘 `Enter` 才显示。
- 添加 `role="toolbar"`、内容块 `tabindex="0"`，键盘可达。
- 同一时间只保留一个浮层可见，避免多个工具栏互相遮挡。
- `Escape` 可关闭当前浮层且不会被焦点回流立刻重新打开。
- 保留并验证 HTML/Chart 全屏入口可从 body 浮层触发。

验证：

- `python3 /tmp/tracevane_docs_round1_unified_toolbar_verify.py`
- `python3 /tmp/tracevane_docs_body_toolbars_verify.py`
- `python3 /tmp/tracevane_docs_html_body_toolbar_verify.py`
- `python3 /tmp/tracevane_docs_chart_body_toolbar_verify.py`
- `python3 /tmp/tracevane_docs_security_verify.py`
- `npm run docs:render:smoke`
- `git diff --check`

预览输出：

- `.tmp/docs-renderer-preview/rich-rendering-gallery.html`
- `.tmp/docs-renderer-preview-site/index.html`
- `.tmp/docs-renderer-preview-site/rich-rendering-gallery.html`

### Round 2 / 15 — CSS 覆盖收敛和浮层样式稳定

状态：完成。

改进：

- 删除末尾多轮临时叠加的工具栏/表格/代码换行 CSS 覆盖，减少互相打架的 `!important` 链。
- 将相关规则收敛为单一 `Round 2` 稳定段：富内容 wrapper、body 级浮层、表格浮层、modal 表格工具、代码换行状态。
- 保留 Round 1 的 body 级浮层机制，确认 Mermaid / HTML Preview / Chart / Table 工具栏仍不在文章流内。
- 保持代码块自动换行的可见状态和真实 `white-space` 切换。

验证：

- `node --check tools/docs-renderer/renderer/runtime/rich-blocks.js`
- `node --check tools/docs-renderer/renderer/runtime/code-block.js`
- `python3 /tmp/tracevane_docs_round1_unified_toolbar_verify.py`
- `python3 /tmp/tracevane_docs_body_toolbars_verify.py`
- `python3 /tmp/tracevane_docs_html_body_toolbar_verify.py`
- `python3 /tmp/tracevane_docs_chart_body_toolbar_verify.py`
- `python3 /tmp/tracevane_docs_table_code_current_verify.py`
- `python3 /tmp/tracevane_docs_security_verify.py`
- `npm run docs:render:smoke`
- `git diff --check`

### Round 3 / 15 — 搜索覆盖增强与回归脚本沉淀

状态：完成。

改进：

- 当前页搜索扩展到 HTML Preview sandbox iframe 的可读文本。
- iframe 内部搜索命中会注入 `mark.doc-search-hit`，并具备 iframe 内高亮样式。
- 当前页搜索继续覆盖代码块、表格、Chart 源码、HTML Preview 源码等文本。
- 多文档搜索继续使用 `sessionStorage` 携带查询，不使用 `?q=`，避免 URL 查询参数造成性能和状态问题。
- 构建期搜索索引清洗增强：去掉 HTML/script/style 标签噪声，让全站搜索片段更接近可读文本。
- 新增可复用 Playwright 回归脚本：`tools/docs-renderer/tests/playwright_search_regression.py`。
- 新增 npm 脚本：`docs:render:verify-search`。

验证：

- `python3 tools/docs-renderer/tests/playwright_search_regression.py .tmp/docs-renderer-preview-site/rich-rendering-gallery.html`
- `npm run docs:render:verify-search -- .tmp/docs-renderer-preview-site/rich-rendering-gallery.html`
- `python3 /tmp/tracevane_docs_body_toolbars_verify.py`
- `python3 /tmp/tracevane_docs_html_body_toolbar_verify.py`
- `python3 /tmp/tracevane_docs_chart_body_toolbar_verify.py`
- `python3 /tmp/tracevane_docs_table_code_current_verify.py`
- `python3 /tmp/tracevane_docs_security_verify.py`
- `npm run docs:render:smoke`
- `git diff --check`

### Round 4 / 15 — HTML Preview Browser Viewer 调试面板

状态：完成。

改进：

- Browser Viewer 状态条现在显示当前 viewport 类型、实际尺寸和缩放比例。
- 手机 / 平板 / 桌面 / 全宽切换会实时更新状态信息。
- 全局缩放按钮会同步更新状态条百分比。
- 新增 `复制视口` 按钮，可复制当前 viewport + 尺寸 + zoom 信息。
- 状态信息写入 `data-browser-info`，方便调试和回归测试。
- 优化 Browser Viewer toolbar 样式，避免状态文本过长挤压按钮。
- 新增可复用 Playwright 回归脚本：`tools/docs-renderer/tests/playwright_browser_viewer_regression.py`。
- 新增 npm 脚本：`docs:render:verify-browser`。

验证：

- `python3 tools/docs-renderer/tests/playwright_browser_viewer_regression.py .tmp/docs-renderer-preview-site/rich-rendering-gallery.html`
- `npm run docs:render:verify-browser -- .tmp/docs-renderer-preview-site/rich-rendering-gallery.html`
- `npm run docs:render:verify-search -- .tmp/docs-renderer-preview-site/rich-rendering-gallery.html`
- `python3 /tmp/tracevane_docs_body_toolbars_verify.py`
- `python3 /tmp/tracevane_docs_html_body_toolbar_verify.py`
- `python3 /tmp/tracevane_docs_chart_body_toolbar_verify.py`
- `python3 /tmp/tracevane_docs_table_code_current_verify.py`
- `python3 /tmp/tracevane_docs_security_verify.py`
- `npm run docs:render:smoke`
- `git diff --check`

### Round 5 / 15 — Mermaid / Chart 导出体验统一

状态：完成。

改进：

- Mermaid 工具栏从单一“保存 SVG”升级为 `SVG` / `PNG` 两种导出。
- Chart 工具栏新增 `SVG` / `PNG` 导出。
- Mermaid 与 Chart 共享统一导出 helper：SVG 序列化、PNG canvas 转换、文件名 slug、成功/失败反馈。
- 导出按钮使用 `data-export-format`，便于测试与后续样式统一。
- PNG 导出以当前主题 paper 色作为背景，避免透明背景在查看器中不可读。
- 新增可复用 Playwright 回归脚本：`tools/docs-renderer/tests/playwright_export_regression.py`。
- 新增 npm 脚本：`docs:render:verify-export`。

验证：

- `python3 tools/docs-renderer/tests/playwright_export_regression.py .tmp/docs-renderer-preview-site/rich-rendering-gallery.html`
- `npm run docs:render:verify-export -- .tmp/docs-renderer-preview-site/rich-rendering-gallery.html`
- `npm run docs:render:verify-browser -- .tmp/docs-renderer-preview-site/rich-rendering-gallery.html`
- `npm run docs:render:verify-search -- .tmp/docs-renderer-preview-site/rich-rendering-gallery.html`
- `python3 /tmp/tracevane_docs_body_toolbars_verify.py`
- `python3 /tmp/tracevane_docs_security_verify.py`
- `npm run docs:render:smoke`
- `git diff --check`

### Round 6 / 15 — 代码块交互升级

状态：完成。

改进：

- 代码块复制按钮从“复制”改为更明确的 `复制全部`。
- 新增 `复制选区`：仅复制用户当前选中的代码文本；无选区时显示错误状态，不误报成功。
- 自动换行状态持久化到 `localStorage(tracevane-docs-code-wrap)`。
- 页面刷新后会恢复用户上次的自动换行偏好。
- 自动换行按钮继续同步 `aria-pressed`、文案和真实 `white-space` 布局状态。
- 新增可复用 Playwright 回归脚本：`tools/docs-renderer/tests/playwright_code_regression.py`。
- 新增 npm 脚本：`docs:render:verify-code`。

验证：

- `python3 tools/docs-renderer/tests/playwright_code_regression.py .tmp/docs-renderer-preview-site/rich-rendering-gallery.html`
- `npm run docs:render:verify-code -- .tmp/docs-renderer-preview-site/rich-rendering-gallery.html`
- `npm run docs:render:verify-export -- .tmp/docs-renderer-preview-site/rich-rendering-gallery.html`
- `npm run docs:render:verify-browser -- .tmp/docs-renderer-preview-site/rich-rendering-gallery.html`
- `npm run docs:render:verify-search -- .tmp/docs-renderer-preview-site/rich-rendering-gallery.html`
- `python3 /tmp/tracevane_docs_security_verify.py`
- `npm run docs:render:smoke`
- `git diff --check`

### Round 7 / 15 — 表格与悬浮工具栏体验升级

状态：完成。

改进：

- 表格工具栏保持 body-level fixed 悬浮，不再位于表格内容内部，也不占用文章排版空间。
- 悬浮工具栏定位策略改为优先使用内容块外侧 gutter；无侧边空间时才落到块上方/下方，避免遮挡渲染内容。
- 工具栏视觉重新压缩：更小按钮、更轻边框、更低存在感的拟态半透明背景，深色/浅色均适配。
- Markdown 表格新增 `复制表格` 与 `CSV` 复制能力。
- 宽表格保留自然列宽，支持横向滚动，并显示不占点击区域的滚动提示。
- 表格全屏预览显示行/列元信息，并支持 Markdown/CSV 复制。
- Rich rendering gallery 增加宽表格样例，覆盖表格横向滚动和工具栏外置场景。
- 新增可复用 Playwright 回归脚本：`tools/docs-renderer/tests/playwright_table_regression.py`。
- 新增 npm 脚本：`docs:render:verify-table`。

验证：

- `node --check tools/docs-renderer/renderer/runtime/rich-blocks.js`
- `python3 -m py_compile tools/docs-renderer/tests/playwright_table_regression.py`
- `python3 tools/docs-renderer/render-docs.py tools/docs-renderer/renderer/fixtures/rich-rendering-gallery.md -o .tmp/docs-renderer-preview --clean --site-title 'Tracevane Docs Renderer Preview' --description 'Rich rendering regression gallery'`
- `python3 tools/docs-renderer/render-docs.py tools/docs-renderer/renderer/fixtures -o .tmp/docs-renderer-preview-site --clean --site-title 'Tracevane Docs Renderer Preview Site' --description 'Multi-document renderer regression site'`
- `npm run docs:render:verify-table -- .tmp/docs-renderer-preview-site/rich-rendering-gallery.html`
- `npm run docs:render:verify-code -- .tmp/docs-renderer-preview-site/rich-rendering-gallery.html`
- `npm run docs:render:verify-export -- .tmp/docs-renderer-preview-site/rich-rendering-gallery.html`
- `npm run docs:render:verify-browser -- .tmp/docs-renderer-preview-site/rich-rendering-gallery.html`
- `npm run docs:render:verify-search -- .tmp/docs-renderer-preview-site/rich-rendering-gallery.html`
- `npm run docs:render:smoke`

### Round 8 / 15 — 主题系统审计与富渲染颜色统一

状态：完成。

研究：

- 已记录到 `docs/研究先行开发清单.md`：Mermaid 官方 Theme Configuration、MDN `color-scheme`、MDN `prefers-color-scheme`、MDN `color-mix()`。
- 结论：显式主题切换应作为 Mermaid、Chart、Table、sandbox HTML Preview 的单一来源，不能只依赖 OS `prefers-color-scheme`。

改进：

- `theme.js` 在每次应用主题时同步 `color-scheme`，并广播 `tracevane:themechange` 事件。
- Mermaid runtime 改为 `theme: base` + 显式 `themeVariables`，并在主题变化时用原始源码重新渲染图表。
- HTML Preview iframe 的基础样式改为主题 token 驱动，支持 `data-theme=dark/light` 与 iframe 内部 `color-scheme` 同步。
- Lua filter 与运行时 HTML Preview 样式保持一致，避免初始 iframe 和全屏 iframe 主题行为分裂。
- Chart/Table/Mermaid 统一使用 `--doc-rich-*` 富渲染 token，确保深色/浅色默认文字、边框、背景一致。
- 添加 forced-colors 基础兜底，避免高对比模式下硬编码 SVG 文本不可读。
- 新增可复用 Playwright 回归脚本：`tools/docs-renderer/tests/playwright_theme_regression.py`。
- 新增 npm 脚本：`docs:render:verify-theme`。

验证：

- `node --check tools/docs-renderer/renderer/runtime/mermaid.js`
- `node --check tools/docs-renderer/renderer/runtime/theme.js`
- `node --check tools/docs-renderer/renderer/runtime/rich-blocks.js`
- `python3 -m py_compile tools/docs-renderer/tests/playwright_theme_regression.py`
- `python3 tools/docs-renderer/render-docs.py tools/docs-renderer/renderer/fixtures/rich-rendering-gallery.md -o .tmp/docs-renderer-preview --clean --site-title 'Tracevane Docs Renderer Preview' --description 'Rich rendering regression gallery'`
- `python3 tools/docs-renderer/render-docs.py tools/docs-renderer/renderer/fixtures -o .tmp/docs-renderer-preview-site --clean --site-title 'Tracevane Docs Renderer Preview Site' --description 'Multi-document renderer regression site'`
- `npm run docs:render:verify-theme -- .tmp/docs-renderer-preview-site/rich-rendering-gallery.html`
- `npm run docs:render:verify-table -- .tmp/docs-renderer-preview-site/rich-rendering-gallery.html`
- `npm run docs:render:verify-code -- .tmp/docs-renderer-preview-site/rich-rendering-gallery.html`
- `npm run docs:render:verify-export -- .tmp/docs-renderer-preview-site/rich-rendering-gallery.html`
- `npm run docs:render:verify-browser -- .tmp/docs-renderer-preview-site/rich-rendering-gallery.html`
- `npm run docs:render:verify-search -- .tmp/docs-renderer-preview-site/rich-rendering-gallery.html`
- `python3 /tmp/tracevane_docs_security_verify.py`
- `npm run docs:render:smoke`
- `git diff --check`

### Round 9 / 15 — 安全边界审计与恶意 HTML 回归

状态：完成。

研究：

- 已记录到 `docs/研究先行开发清单.md`：MDN iframe sandbox、MDN CSP `script-src`、OWASP XSS Prevention Cheat Sheet。
- 结论：默认在线 HTML 文档必须把作者 HTML 视为不可信；显式 `html-preview` 是唯一渲染 HTML 内容入口，且继续禁用脚本。

改进：

- `sanitize_html_fragment` 先保护工具生成的 trusted HTML Preview iframe，再清理其它 raw iframe 和危险标签。
- 主文档内容新增 defense-in-depth 清理：事件属性、`style`、非预览 `srcdoc`、`javascript:` / `vbscript:` / `data:text/html` URL。
- 保持 HTML Preview iframe 的 sandbox 不启用 `allow-scripts`，继续依赖 iframe 内 CSP `script-src 'none'` 禁止脚本/事件执行。
- `unsafe-html.md` 增加恶意语料：SVG onload/xlink、iframe srcdoc、form action、data:text/html link、style overlay、preview 内脚本和 onerror。
- Smoke 安全断言更新为区分“文档中转义展示的攻击源码”和“真实 active DOM”。
- 新增可复用 Playwright 回归脚本：`tools/docs-renderer/tests/playwright_security_regression.py`。
- 新增 npm 脚本：`docs:render:verify-security`。

验证：

- `python3 -m py_compile tools/docs-renderer/render-docs.py`
- `python3 -m py_compile tools/docs-renderer/tests/playwright_security_regression.py`
- `node --check tools/docs-renderer/renderer/runtime/rich-blocks.js`
- `python3 tools/docs-renderer/render-docs.py tools/docs-renderer/renderer/fixtures/rich-rendering-gallery.md -o .tmp/docs-renderer-preview --clean --site-title 'Tracevane Docs Renderer Preview' --description 'Rich rendering regression gallery'`
- `python3 tools/docs-renderer/render-docs.py tools/docs-renderer/renderer/fixtures -o .tmp/docs-renderer-preview-site --clean --site-title 'Tracevane Docs Renderer Preview Site' --description 'Multi-document renderer regression site'`
- `npm run docs:render:verify-security -- .tmp/docs-renderer-preview-site/unsafe-html.html`
- `npm run docs:render:verify-theme -- .tmp/docs-renderer-preview-site/rich-rendering-gallery.html`
- `npm run docs:render:verify-table -- .tmp/docs-renderer-preview-site/rich-rendering-gallery.html`
- `npm run docs:render:verify-code -- .tmp/docs-renderer-preview-site/rich-rendering-gallery.html`
- `npm run docs:render:verify-export -- .tmp/docs-renderer-preview-site/rich-rendering-gallery.html`
- `npm run docs:render:verify-browser -- .tmp/docs-renderer-preview-site/rich-rendering-gallery.html`
- `npm run docs:render:verify-search -- .tmp/docs-renderer-preview-site/rich-rendering-gallery.html`
- `npm run docs:render:smoke`
- `git diff --check`

### Round 10 / 15 — 运行时性能优化与统一调度

状态：完成。

研究：

- 已记录到 `docs/研究先行开发清单.md`：MDN `requestAnimationFrame`、MDN Intersection Observer API、MDN ResizeObserver API、web.dev Optimize long tasks。
- 结论：大文档运行时应合并 viewport 监听、用 rAF 批量读写、用 IntersectionObserver 懒激活离屏工作，用 ResizeObserver 监听局部尺寸。

改进：

- 新增 `renderer/runtime/scheduler.js`，提供 `rafThrottle`、`onViewportChange`、`whenVisible`。
- 悬浮工具栏从“每个工具栏各自注册 window scroll/resize”改为全局单一 viewport 调度。
- 阅读进度条改用共享 viewport 调度和 rAF 节流。
- HTML Preview 自适应从 per-frame window scroll/resize + interval 轮询，改为 IntersectionObserver 懒激活 + ResizeObserver 局部监听 + rAF 批量 resize。
- 表格横向滚动状态从 per-table window resize 监听，改为 ResizeObserver 局部监听；scroll 更新 rAF 节流。
- 移除 HTML Preview 每块 MutationObserver 主题兜底，改用 Round 8 的 `tracevane:themechange` 事件。
- 新增可复用 Playwright 回归脚本：`tools/docs-renderer/tests/playwright_performance_regression.py`。
- 新增 npm 脚本：`docs:render:verify-performance`。

验证：

- `node --check tools/docs-renderer/renderer/runtime/scheduler.js`
- `node --check tools/docs-renderer/renderer/runtime/rich-blocks.js`
- `node --check tools/docs-renderer/renderer/runtime/reading-progress.js`
- `python3 -m py_compile tools/docs-renderer/tests/playwright_performance_regression.py`
- `python3 tools/docs-renderer/render-docs.py tools/docs-renderer/renderer/fixtures/rich-rendering-gallery.md -o .tmp/docs-renderer-preview --clean --site-title 'Tracevane Docs Renderer Preview' --description 'Rich rendering regression gallery'`
- `python3 tools/docs-renderer/render-docs.py tools/docs-renderer/renderer/fixtures -o .tmp/docs-renderer-preview-site --clean --site-title 'Tracevane Docs Renderer Preview Site' --description 'Multi-document renderer regression site'`
- `npm run docs:render:verify-performance -- .tmp/docs-renderer-preview-site/rich-rendering-gallery.html`
- `npm run docs:render:verify-security -- .tmp/docs-renderer-preview-site/unsafe-html.html`
- `npm run docs:render:verify-theme -- .tmp/docs-renderer-preview-site/rich-rendering-gallery.html`
- `npm run docs:render:verify-table -- .tmp/docs-renderer-preview-site/rich-rendering-gallery.html`
- `npm run docs:render:verify-code -- .tmp/docs-renderer-preview-site/rich-rendering-gallery.html`
- `npm run docs:render:verify-export -- .tmp/docs-renderer-preview-site/rich-rendering-gallery.html`
- `npm run docs:render:verify-browser -- .tmp/docs-renderer-preview-site/rich-rendering-gallery.html`
- `npm run docs:render:verify-search -- .tmp/docs-renderer-preview-site/rich-rendering-gallery.html`
- `npm run docs:render:smoke`
- `git diff --check`

### Round 11 / 15 — 可访问性审计与键盘/ARIA 回归

状态：完成。

研究：

- 已记录到 `docs/研究先行开发清单.md`：WAI-ARIA APG Modal Dialog Pattern、WCAG 2.2、MDN `aria-live`、MDN `prefers-reduced-motion`。
- 结论：富预览 modal 必须 trap focus、Escape 关闭、关闭后恢复触发按钮焦点；搜索状态/结果需要 live region 与关联描述；静态文档需要 skip link。

改进：

- 模板新增 `skip-link`，正文 `main` 支持 `tabindex=-1` 作为跳转落点。
- 搜索状态增加 `aria-live="polite"`、`aria-atomic="true"`；搜索结果增加 `role=list`，结果项增加 `role=listitem`。
- 搜索输入运行时关联 `aria-describedby` 与 `aria-controls`，结果渲染期间同步 `aria-busy`。
- Modal 打开时使用具体标题更新 `aria-label`，初始焦点进入 modal。
- Modal 新增 Tab / Shift+Tab focus trap，Escape 关闭后恢复触发控件焦点。
- `prefers-reduced-motion` 下补充 skip link 和 focus 滚动兜底。
- 修复 Pandoc 模板变量注入运行时源码时会吞掉 `$...$` 的隐患：runtime 改为 postprocess marker 注入，不再走 `$runtime_source$` 模板变量。
- 新增可复用 Playwright 回归脚本：`tools/docs-renderer/tests/playwright_accessibility_regression.py`。
- 新增 npm 脚本：`docs:render:verify-a11y`。

验证：

- `node --check tools/docs-renderer/renderer/runtime/modal.js`
- `node --check tools/docs-renderer/renderer/runtime/search.js`
- `node --check tools/docs-renderer/renderer/runtime/code-block.js`
- `node --check tools/docs-renderer/renderer/runtime/rich-blocks.js`
- `python3 -m py_compile tools/docs-renderer/tests/playwright_accessibility_regression.py`
- `python3 -m py_compile tools/docs-renderer/render-docs.py tools/docs-renderer/smoke-test.py`
- `python3 tools/docs-renderer/render-docs.py tools/docs-renderer/renderer/fixtures/rich-rendering-gallery.md -o .tmp/docs-renderer-preview --clean --site-title 'Tracevane Docs Renderer Preview' --description 'Rich rendering regression gallery'`
- `python3 tools/docs-renderer/render-docs.py tools/docs-renderer/renderer/fixtures -o .tmp/docs-renderer-preview-site --clean --site-title 'Tracevane Docs Renderer Preview Site' --description 'Multi-document renderer regression site'`
- `npm run docs:render:verify-a11y -- .tmp/docs-renderer-preview-site/rich-rendering-gallery.html`
- `npm run docs:render:verify-security -- .tmp/docs-renderer-preview-site/unsafe-html.html`
- `npm run docs:render:verify-performance -- .tmp/docs-renderer-preview-site/rich-rendering-gallery.html`
- `npm run docs:render:verify-theme -- .tmp/docs-renderer-preview-site/rich-rendering-gallery.html`
- `npm run docs:render:verify-table -- .tmp/docs-renderer-preview-site/rich-rendering-gallery.html`
- `npm run docs:render:verify-code -- .tmp/docs-renderer-preview-site/rich-rendering-gallery.html`
- `npm run docs:render:verify-export -- .tmp/docs-renderer-preview-site/rich-rendering-gallery.html`
- `npm run docs:render:verify-browser -- .tmp/docs-renderer-preview-site/rich-rendering-gallery.html`
- `npm run docs:render:verify-search -- .tmp/docs-renderer-preview-site/rich-rendering-gallery.html`
- `npm run docs:render:smoke`
- `git diff --check`

### Round 12 / 15 — 打印/PDF 导出模式优化

状态：完成。

研究：

- 已记录到 `docs/研究先行开发清单.md`：MDN Printing guide、MDN `break-inside`、MDN `window.print()`、MDN `@media`。
- 结论：打印/PDF 模式需要专用 `@media print`，隐藏交互层，强制浅色纸张 token，并保护富渲染块分页。

改进：

- 模板新增 `打印/PDF` 操作按钮，运行时 `print.js` 调用 `window.print()`，并通过 `beforeprint`/`afterprint` 标记打印状态。
- 顶部主题/打印按钮收拢到 `doc-quick-actions`，屏幕端保持可见，打印端完全隐藏。
- 新增 `@page` A4 默认页边距。
- 打印模式强制浅色 tokens、禁用动画/阴影/浮层/搜索/导航/modal/工具栏。
- 表格打印宽度归一：取消屏幕端 `min-width: 980px`，打印时 `width:100%`、`min-width:0`、可分页。
- Mermaid/Chart/SVG 打印时 `max-width:100%`、`height:auto`，文字强制黑色提高可读性。
- 代码块打印时隐藏操作按钮，保留语言栏，代码自动换行，避免横向裁切。
- 链接打印补 URL，但内部锚点/mailto/javascript 不追加无用地址。
- 新增可复用 Playwright 回归脚本：`tools/docs-renderer/tests/playwright_print_regression.py`。
- 新增 npm 脚本：`docs:render:verify-print`。

验证：

- `node --check tools/docs-renderer/renderer/runtime/print.js`
- `node --check tools/docs-renderer/renderer/runtime/index.js`
- `python3 -m py_compile tools/docs-renderer/tests/playwright_print_regression.py`
- `python3 tools/docs-renderer/render-docs.py tools/docs-renderer/renderer/fixtures/rich-rendering-gallery.md -o .tmp/docs-renderer-preview --clean --site-title 'Tracevane Docs Renderer Preview' --description 'Rich rendering regression gallery'`
- `python3 tools/docs-renderer/render-docs.py tools/docs-renderer/renderer/fixtures -o .tmp/docs-renderer-preview-site --clean --site-title 'Tracevane Docs Renderer Preview Site' --description 'Multi-document renderer regression site'`
- `npm run docs:render:verify-print -- .tmp/docs-renderer-preview-site/rich-rendering-gallery.html`
- `npm run docs:render:verify-a11y -- .tmp/docs-renderer-preview-site/rich-rendering-gallery.html`
- `npm run docs:render:verify-performance -- .tmp/docs-renderer-preview-site/rich-rendering-gallery.html`
- `npm run docs:render:verify-security -- .tmp/docs-renderer-preview-site/unsafe-html.html`
- `npm run docs:render:verify-theme -- .tmp/docs-renderer-preview-site/rich-rendering-gallery.html`
- `npm run docs:render:verify-table -- .tmp/docs-renderer-preview-site/rich-rendering-gallery.html`
- `npm run docs:render:verify-code -- .tmp/docs-renderer-preview-site/rich-rendering-gallery.html`
- `npm run docs:render:verify-export -- .tmp/docs-renderer-preview-site/rich-rendering-gallery.html`
- `npm run docs:render:verify-browser -- .tmp/docs-renderer-preview-site/rich-rendering-gallery.html`
- `npm run docs:render:verify-search -- .tmp/docs-renderer-preview-site/rich-rendering-gallery.html`
- `npm run docs:render:smoke`
- `git diff --check`

### Round 13 / 15 — 外置微型工具栏与非侵入交互修正

状态：完成。

研究：

- 已记录到 `docs/研究先行开发清单.md`：MDN `position`、MDN `display`、MDN `pointer-events`、MDN ARIA `toolbar` role。
- 结论：上下文工具栏必须是 body-level fixed sidecar，不进入渲染块、不覆盖当前渲染内容、不占 article flow；桌面优先放在正文列外侧，空间不足才放到当前块上/下方，极窄视口使用 viewport rail 微胶囊。

改进：

- 重写富渲染工具栏定位策略：基于 `main` 正文列计算外侧轨道，优先 `outside-content-left/right`，其次 `outside-block-left/right/above/below`，最后才使用 `viewport-rail`。
- 左侧外置轨道会避开固定导航栏，避免工具栏漂到目录/搜索区域里。
- 保证 Mermaid、HTML Preview、Chart、Table 工具栏始终移动到 `document.body`，使用 `position: fixed`，不进入渲染块 DOM，不在文章流中占位。
- 缩短工具按钮文案：如 `复制`、`源码`、`预览`、`MD`、`CSV`，同时保留完整 `aria-label`。
- 重新设计工具栏视觉：20px 微型按钮、胶囊玻璃底、轻边框、低阴影、深浅主题细化，避免“大块白框/工具条”破坏正文。
- 极窄 viewport 下工具栏以边缘 rail 形式半收起，hover/focus 后展开，降低遮挡风险。
- 更新已有 browser/table/a11y 回归中对按钮文案的断言。
- 新增可复用 Playwright 回归脚本：`tools/docs-renderer/tests/playwright_toolbar_regression.py`。
- 新增 npm 脚本：`docs:render:verify-toolbar`。

验证：

- `python3 tools/docs-renderer/render-docs.py tools/docs-renderer/renderer/fixtures --out .tmp/docs-renderer-preview-site --site-title 'Tracevane Docs Renderer' --clean --mermaid-mode local`
- `python3 tools/docs-renderer/render-docs.py tools/docs-renderer/renderer/fixtures/rich-rendering-gallery.md --out .tmp/docs-renderer-preview --site-title 'Tracevane Docs Renderer' --clean --mermaid-mode local`
- `npm run docs:render:verify-toolbar -- .tmp/docs-renderer-preview-site/rich-rendering-gallery.html`
- `npm run docs:render:verify-table -- .tmp/docs-renderer-preview-site/rich-rendering-gallery.html`
- `npm run docs:render:verify-code -- .tmp/docs-renderer-preview-site/rich-rendering-gallery.html`
- `npm run docs:render:verify-export -- .tmp/docs-renderer-preview-site/rich-rendering-gallery.html`
- `npm run docs:render:verify-browser -- .tmp/docs-renderer-preview-site/rich-rendering-gallery.html`
- `npm run docs:render:verify-a11y -- .tmp/docs-renderer-preview-site/rich-rendering-gallery.html`
- `npm run docs:render:verify-print -- .tmp/docs-renderer-preview-site/rich-rendering-gallery.html`
- `npm run docs:render:verify-search -- .tmp/docs-renderer-preview-site/rich-rendering-gallery.html`
- `npm run docs:render:verify-theme -- .tmp/docs-renderer-preview-site/rich-rendering-gallery.html`
- `npm run docs:render:verify-security -- .tmp/docs-renderer-preview-site/unsafe-html.html`
- `npm run docs:render:verify-performance -- .tmp/docs-renderer-preview-site/rich-rendering-gallery.html`
- `npm run docs:render:smoke`
- `git diff --check`

### Round 14 / 15 — 文档和示例补全，覆盖边界场景

状态：完成。

研究：

- 已记录到 `docs/研究先行开发清单.md`：Mermaid OSS Diagram Syntax、Pandoc User’s Guide、MDN iframe/CSP。
- 结论：普通 `html` 代码块必须保持源码；只有显式 `html-preview` 进入静态 sandbox iframe；带脚本 HTML 只能作为“不执行”的安全示例；示例必须进入 fixture 并有回归。

改进：

- 新增 `tools/docs-renderer/renderer/fixtures/renderer-edge-cases.md`。
- 示例覆盖普通 HTML 源码、静态 HTML Preview、带脚本 preview 被阻止、更多 Mermaid flowchart/class/gantt、Chart 右对齐、Chart JSON 错误兜底、宽表格与离线发布清单。
- README 新增功能矩阵、HTML/动态内容判定、常用验证命令。
- Smoke fixture 集合扩展到 6 份文档。
- 新增可复用 Playwright 回归脚本：`tools/docs-renderer/tests/playwright_examples_regression.py`。
- 新增 npm 脚本：`docs:render:verify-examples`。

验证：

- `python3 tools/docs-renderer/render-docs.py tools/docs-renderer/renderer/fixtures --out .tmp/docs-renderer-preview-site --site-title 'Tracevane Docs Renderer' --clean --mermaid-mode local`
- `python3 tools/docs-renderer/render-docs.py tools/docs-renderer/renderer/fixtures/rich-rendering-gallery.md --out .tmp/docs-renderer-preview --site-title 'Tracevane Docs Renderer' --clean --mermaid-mode local`
- `npm run docs:render:verify-examples -- .tmp/docs-renderer-preview-site/renderer-edge-cases.html`
- `npm run docs:render:verify-toolbar -- .tmp/docs-renderer-preview-site/rich-rendering-gallery.html`
- `npm run docs:render:verify-table -- .tmp/docs-renderer-preview-site/rich-rendering-gallery.html`
- `npm run docs:render:verify-code -- .tmp/docs-renderer-preview-site/rich-rendering-gallery.html`
- `npm run docs:render:verify-export -- .tmp/docs-renderer-preview-site/rich-rendering-gallery.html`
- `npm run docs:render:verify-browser -- .tmp/docs-renderer-preview-site/rich-rendering-gallery.html`
- `npm run docs:render:verify-a11y -- .tmp/docs-renderer-preview-site/rich-rendering-gallery.html`
- `npm run docs:render:verify-print -- .tmp/docs-renderer-preview-site/rich-rendering-gallery.html`
- `npm run docs:render:verify-search -- .tmp/docs-renderer-preview-site/rich-rendering-gallery.html`
- `npm run docs:render:verify-theme -- .tmp/docs-renderer-preview-site/rich-rendering-gallery.html`
- `npm run docs:render:verify-security -- .tmp/docs-renderer-preview-site/unsafe-html.html`
- `npm run docs:render:verify-performance -- .tmp/docs-renderer-preview-site/rich-rendering-gallery.html`
- `npm run docs:render:smoke`
- `git diff --check`

### Round 15 / 15 — 最终完成审计与一键验证入口

状态：完成。

研究：

- 已记录到 `docs/研究先行开发清单.md`：Playwright Best Practices、Python Locators、Assertions。
- 结论：最终完成必须基于新渲染产物和全套回归，而不是旧 `.tmp` 或单个 smoke；验证入口应顺序运行避免浏览器状态互相污染。

改进：

- 新增 `tools/docs-renderer/tests/run_regressions.py`：先重渲染 `.tmp/docs-renderer-preview-site` 与 `.tmp/docs-renderer-preview`，再顺序运行 examples/toolbar/table/code/export/browser/a11y/print/search/theme/security/performance/smoke。
- 新增 npm 脚本：`docs:render:verify-all`。
- 新增 `tools/docs-renderer/COMPLETION_AUDIT.md`，固化交付物、功能矩阵、最终验证命令与已知边界。
- 最终渲染输出已刷新：`.tmp/docs-renderer-preview/rich-rendering-gallery.html` 与 `.tmp/docs-renderer-preview-site/*.html`。

验证：

- `npm run docs:render:verify-all`
- `git diff --check`


## SiYuan-inspired enhancement — Protyle subtype render dispatch

状态：完成。

研究：

- 已记录到 `docs/研究先行开发清单.md`：SiYuan GitHub `app/src/protyle/render/processCode.ts`、`mermaidRender.ts`、`htmlRender.ts`、`blockRender.ts`。
- 借鉴点：显式 `data-subtype`/`data-type` 分发到独立 renderer；`data-render="true"` 防止重复渲染；每类 renderer 保留源码/编辑/导出入口；隐藏节点和错误场景需要可恢复。
- 拒绝复制：不引入 SiYuan/Lute runtime 依赖，不启用脚本型 HTML block，不实现服务端 block query embed，不把 Mermaid 改成 `securityLevel: loose`。

改进：

- 新增显式 `mindmap` fence，Lua filter 输出 `.mindmap-wrap` / `.mindmap-source` / `.mindmap-surface`。
- Runtime 新增 `initMindmapBlocks`，按缩进文本生成静态 SVG 思维导图，并使用 `data-mindmap-ready` 防重复渲染。
- Mindmap 复用统一外置微工具栏：复制源码、源码弹层、SVG/PNG 导出、全屏 canvas 预览。
- 代码块增强逻辑排除 `.mindmap-wrap` 内部源码，避免隐藏源码被 code wrapper 改写。
- README、edge cases、rich gallery、completion audit 增加 Mindmap 说明与示例。
- 回归扩展：examples、toolbar、export、search、smoke、verify-all 均覆盖 mindmap。

验证：

- `node --check tools/docs-renderer/renderer/runtime/rich-blocks.js`
- `node --check tools/docs-renderer/renderer/runtime/index.js`
- `node --check tools/docs-renderer/renderer/runtime/code-block.js`
- `python3 tools/docs-renderer/render-docs.py tools/docs-renderer/renderer/fixtures --out .tmp/docs-renderer-preview-site --site-title 'Tracevane Docs Renderer' --clean --mermaid-mode local`
- `python3 tools/docs-renderer/render-docs.py tools/docs-renderer/renderer/fixtures/rich-rendering-gallery.md --out .tmp/docs-renderer-preview --site-title 'Tracevane Docs Renderer' --clean --mermaid-mode local`
- `npm run docs:render:verify-examples -- .tmp/docs-renderer-preview-site/renderer-edge-cases.html`
- `npm run docs:render:verify-toolbar -- .tmp/docs-renderer-preview-site/rich-rendering-gallery.html`
- `npm run docs:render:verify-export -- .tmp/docs-renderer-preview-site/rich-rendering-gallery.html`
- `npm run docs:render:verify-search -- .tmp/docs-renderer-preview-site/rich-rendering-gallery.html`
- `npm run docs:render:verify-all`
- `git diff --check`

## SiYuan-inspired enhancement — Block reference popover

状态：完成。

研究：

- 已记录到 `docs/研究先行开发清单.md`：SiYuan `renderBacklink.ts`、toolbar block-ref / inline-memo / popover 相关逻辑。
- 借鉴点：块引用和面包屑引用不只是跳转，还能给读者一个低成本预览层。
- 静态化取舍：没有 SiYuan 块数据库时，选择同页 heading 锚点摘要 popover。

改进：

- 新增 `tools/docs-renderer/renderer/runtime/link-preview.js`。
- 同页 `#heading-id` / `.html#heading-id` 链接自动增强为 `.block-ref-link`。
- hover/focus 时显示 body-level fixed `.block-ref-popover`，包含目标标题、摘要和跳转提示。
- Popover 不进入正文流，不占位，打印时隐藏，深浅主题适配。
- Rich gallery 增加块引用预览示例。
- README 和 Completion Audit 增加 SiYuan block-ref 借鉴说明。
- 新增 `tools/docs-renderer/tests/playwright_block_ref_regression.py` 与 npm 脚本 `docs:render:verify-block-ref`。
- 一键回归 `run_regressions.py` 纳入 block-ref 测试。

验证：

- `node --check tools/docs-renderer/renderer/runtime/link-preview.js`
- `node --check tools/docs-renderer/renderer/runtime/index.js`
- `python3 tools/docs-renderer/render-docs.py tools/docs-renderer/renderer/fixtures --out .tmp/docs-renderer-preview-site --site-title 'Tracevane Docs Renderer' --clean --mermaid-mode local`
- `python3 tools/docs-renderer/render-docs.py tools/docs-renderer/renderer/fixtures/rich-rendering-gallery.md --out .tmp/docs-renderer-preview --site-title 'Tracevane Docs Renderer' --clean --mermaid-mode local`
- `npm run docs:render:verify-block-ref -- .tmp/docs-renderer-preview-site/rich-rendering-gallery.html`
- `npm run docs:render:verify-all`
- `git diff --check`

## SiYuan-inspired enhancement — Rendered block-ref preview + inline memo

状态：完成。

研究：

- 已记录到 `docs/研究先行开发清单.md`：SiYuan `toolbar/InlineMemo.ts`、`toolbar/index.ts`、`wysiwyg/index.ts` 的 inline-memo / block-ref popover 逻辑。
- 结论：块引用预览必须读取渲染后的可见文本；hidden source 只应服务复制/导出，不应出现在 reader popover。

改进：

- 修复 block-ref popover 摘要：HTML Preview 读取 iframe body 可见文本并移除 `style/script/meta/link/title`；Chart/Mindmap/Mermaid 读取 SVG text/title；隐藏源码不再进入摘要。
- 新增 `inline-memo` Pandoc span 支持：`[文本]{.inline-memo memo="备注"}`。
- 新增 `tools/docs-renderer/renderer/runtime/inline-memo.js`，hover/focus 显示只读备注 popover。
- 打印模式下 inline memo 自动展开为括号备注，避免纸面丢失上下文。
- Rich gallery / README / smoke / verify-all 增加 inline memo 覆盖。
- 新增回归：`tools/docs-renderer/tests/playwright_inline_memo_regression.py`。

验证：

- `node --check tools/docs-renderer/renderer/runtime/link-preview.js`
- `node --check tools/docs-renderer/renderer/runtime/inline-memo.js`
- `python3 tools/docs-renderer/render-docs.py tools/docs-renderer/renderer/fixtures --out .tmp/docs-renderer-preview-site --site-title 'Tracevane Docs Renderer' --clean --mermaid-mode local`
- `python3 tools/docs-renderer/render-docs.py tools/docs-renderer/renderer/fixtures/rich-rendering-gallery.md --out .tmp/docs-renderer-preview --site-title 'Tracevane Docs Renderer' --clean --mermaid-mode local`
- `npm run docs:render:verify-inline-memo -- .tmp/docs-renderer-preview-site/rich-rendering-gallery.html`
- `npm run docs:render:verify-block-ref -- .tmp/docs-renderer-preview-site/rich-rendering-gallery.html`
- `npm run docs:render:verify-all`
- `git diff --check`

## SiYuan-inspired enhancement — Static link graph / backlinks

状态：完成。

研究：

- 已记录到 `docs/研究先行开发清单.md`，并新增 `tools/docs-renderer/SIYUAN_FUSION_ANALYSIS.md` 功能矩阵。
- 借鉴点：SiYuan backlink/breadcrumb 能帮助读者理解知识关系；Tracevane 静态站点没有块数据库，所以在生成阶段提取站内 Markdown 链接。

改进：

- `render-docs.py` 新增 `build_link_graph`：扫描所有 Markdown 文档，归一 `.md` / `.markdown` / `.html` 站内链接，按当前页面注入 incoming/outgoing JSON。
- 模板新增 `tracevane-link-graph` JSON 注入点。
- Runtime 新增 `link-graph.js`，在侧栏渲染“引用关系”小节，不进入正文流、不占正文空间。
- CSS 增加深浅色适配、键盘焦点和打印隐藏。
- Fixture 增加双向引用样例；README 增加 Backlinks 功能矩阵。
- 新增回归：`playwright_link_graph_regression.py`，并纳入 `docs:render:verify-all`。

验证计划：

- `python3 tools/docs-renderer/render-docs.py tools/docs-renderer/renderer/fixtures --out .tmp/docs-renderer-preview-site --site-title 'Tracevane Docs Renderer' --clean --mermaid-mode local`
- `python3 tools/docs-renderer/render-docs.py tools/docs-renderer/renderer/fixtures/rich-rendering-gallery.md --out .tmp/docs-renderer-preview --site-title 'Tracevane Docs Renderer' --clean --mermaid-mode local`
- `npm run docs:render:verify-link-graph -- .tmp/docs-renderer-preview-site/offline-rendering-test.html`
- `npm run docs:render:verify-all`
- `git diff --check`

## Round 16 — Docs Renderer compact frame boundary correction

状态：完成。

触发：用户澄清“整体缩放到 90%”指的是 `tools/docs-renderer` 渲染工具，而不是 Tracevane 主项目 `apps/web`。

边界：

- 撤回主项目 AppShell/theme 误改，后续不再修改 `apps/web` 框架页面。
- 本轮只修改 `tools/docs-renderer/styles/tracevane-docs.css` 与 docs-renderer 渲染输出。
- 保留 package docs-render scripts，因为它们属于 docs-renderer 验证入口。

改进：

- 左侧文档导航宽度从 `300px` 收敛到 `270px`，折叠宽度从 `64px` 收敛到 `58px`。
- 文档基础字号从 `16px` 收敛到 `14.5px`，正文行高同步收敛。
- Cover、main padding、标题、导航行高和侧栏字号做约 90% 视觉比例收敛。
- 新增 docs-renderer-only compact overrides：`--doc-reading-width`、`--doc-wide-width`、`--doc-compact-radius`。
- 富渲染块默认阅读宽度收敛到 `1060px`，图表/表格/脑图保留按内容自适应但最大宽度收敛。
- 外置 floating toolbar 视觉缩放为 `.9`，继续保持 body-level fixed，不进入正文流。
- 移动端 cover/main padding 同步收敛，避免小屏仍显得过大。

验证：

- `python3 tools/docs-renderer/render-docs.py tools/docs-renderer/renderer/fixtures --out .tmp/docs-renderer-preview-site --clean --site-title 'Tracevane Docs Renderer'`
- `npm run docs:render:verify-toolbar -- .tmp/docs-renderer-preview-site/rich-rendering-gallery.html`
- `npm run docs:render:verify-browser -- .tmp/docs-renderer-preview-site/rich-rendering-gallery.html`
- `npm run docs:render:verify-table -- .tmp/docs-renderer-preview-site/rich-rendering-gallery.html`
- `npm run docs:render:verify-code -- .tmp/docs-renderer-preview-site/rich-rendering-gallery.html`
- 视觉截图：`/tmp/tracevane-docs-renderer-visual/rich-gallery-top.png`

## Round 17 — Reading-first visual polish

状态：完成。

目标：在 Round 16 的 90% 框架收敛基础上继续优化阅读友好、视觉友好和富渲染块融合度，仍然只作用于 `tools/docs-renderer` 生成页面。

改进：

- 新增 reading-first token：`--doc-text-measure`、`--doc-section-gap`、`--doc-block-gap`、`--doc-soft-line`、`--doc-surface-flat`。
- 弱化 cover 和 document 背景的装饰强度，保留轻量品牌氛围。
- 重新设计 h2/h3 层级：更轻的左侧强调线、更小渐变范围、更稳的标题间距。
- 优化中文阅读宽度：从过窄 72ch 调整到 88ch，并将 reading/wide width 调整为 1120/1220px。
- 弱化 blockquote/callout 阴影，改为更贴近正文的轻提示面，降低卡片墙感。
- 代码块工具栏、字号、边框和阴影继续收敛，保持复制/换行交互可见。
- Mermaid/Chart/Mindmap/Table 默认表面改为更平的融合背景，hover/focus 才轻微强化边界。
- 微型外置工具栏继续保持 body-level fixed，不占正文空间；修正按钮高度保持 20px，满足既有 toolbar 回归。
- 深色模式同步优化 document/rich block 背景，避免默认字体和渲染块在 dark mode 下发灰或突兀。

验证：

- `python3 tools/docs-renderer/render-docs.py tools/docs-renderer/renderer/fixtures --out .tmp/docs-renderer-preview-site --clean --site-title 'Tracevane Docs Renderer'`
- `python3 tools/docs-renderer/render-docs.py tools/docs-renderer/renderer/fixtures/rich-rendering-gallery.md --out .tmp/docs-renderer-preview --clean --site-title 'Tracevane Docs Renderer'`
- 视觉截图：`/tmp/tracevane-docs-renderer-visual/rich-gallery-top.png`
- 首次 `npm run docs:render:verify-all` 发现 toolbar 按钮高度被压到 19px，已修正为 20px。
- `npm run docs:render:verify-toolbar -- .tmp/docs-renderer-preview-site/rich-rendering-gallery.html`
- `npm run docs:render:verify-all`
- `git diff --check`

## Round 18 — Rich examples and renderer friendliness

状态：完成。

目标：继续丰富渲染示例，并改善富渲染内容在浅色/深色下的友好度，尤其是 Mermaid、表格和示例覆盖。

改进：

- Rich gallery 新增 Mermaid 示例：Flowchart 安全渲染管线、Class Diagram 渲染器模块边界。
- Rich gallery 新增 Chart 示例：阅读体验/能力热力矩阵。
- Rich gallery 新增 HTML Preview 示例：面向发布的状态卡片，以及更明确的长内容自适应高度示例标题。
- Rich gallery 新增 TypeScript 代码块，覆盖类型声明、interface 和对象字面量高亮场景。
- Mermaid 深色模式改为“深色节点面 + 浅色文字”，保留 theme regression 对 Mermaid 文字亮度的要求，同时修复浅色节点中浅色字不可读的问题。
- 表格在中窄视口保留横向滚动能力；禁用 `.table-wrap` 的 `content-visibility`，确保滚动宽度指标在 Playwright/运行时增强前稳定可读。
- 富内容容器继续保持 editorial integration：代码、图表、表格、HTML preview 默认更贴近正文，交互时再增强边界。

验证：

- `python3 tools/docs-renderer/render-docs.py tools/docs-renderer/renderer/fixtures --out .tmp/docs-renderer-preview-site --clean --site-title 'Tracevane Docs Renderer'`
- 视觉截图：`/tmp/tracevane-docs-renderer-round18/light-code.png`、`dark-mermaid.png`、`light-html.png`
- `npm run docs:render:verify-table -- .tmp/docs-renderer-preview-site/rich-rendering-gallery.html`
- `npm run docs:render:verify-theme -- .tmp/docs-renderer-preview-site/rich-rendering-gallery.html`
- `npm run docs:render:verify-all`

## Round 19 — Heading anchor copy feedback

状态：完成。

目标：优化长文阅读与引用体验，让标题锚点不只是一个隐形 `#`，而是在复制后给用户清晰反馈。

改进：

- `headings.js` 中标题锚点点击后显示复制成功状态：`#` 临时变为 `✓`。
- 更新 `aria-label` / `title`：复制前为“复制标题链接”，复制后为“标题链接已复制 / 已复制”。
- 添加失败状态：复制失败时显示 `!` 与“复制失败”。
- CSS 增加复制成功/失败的轻量胶囊提示；移动端隐藏悬浮 tooltip，避免遮挡阅读。
- 保持原有 hash 更新和复制链接行为不变。

验证：

- `node --check tools/docs-renderer/renderer/runtime/headings.js`
- `python3 tools/docs-renderer/render-docs.py tools/docs-renderer/renderer/fixtures --out .tmp/docs-renderer-preview-site --clean --site-title 'Tracevane Docs Renderer'`
- Playwright 专项：`/tmp/docs_renderer_heading_anchor_check.py`，验证 hover 可见、点击后 `data-copy-state="copied"`、`aria-label="标题链接已复制"`、URL hash 更新。
- `npm run docs:render:verify-all`

## Round 20 — Search result step navigation

状态：完成。

目标：让文档搜索在保持无 query-string 状态传递的前提下，支持当前页命中项的显式上一处/下一处跳转，并覆盖 HTML Preview iframe 内可见文本。

改进：

- 搜索表单新增“上一处 / 下一处”控制按钮，不再依赖重复提交搜索框才能跳转。
- `search.js` 维护 `activeHits`，统一管理主文档 `mark.doc-search-hit` 与 HTML Preview iframe 内高亮命中。
- 当前搜索状态显示“当前页 N 处（第 X 处）；全站 M 个文档”，导航时不重置搜索结果。
- Shift+Enter 支持反向跳转；Enter/下一处支持正向跳转。
- 搜索结果链接继续使用 sessionStorage 传递搜索词，不添加 `?q=`。
- CSS 增加紧凑的搜索导航按钮，避免侧栏搜索区域挤压导航内容。

验证：

- `node --check tools/docs-renderer/renderer/runtime/search.js`
- `python3 tools/docs-renderer/render-docs.py tools/docs-renderer/renderer/fixtures --out .tmp/docs-renderer-preview-site --clean --site-title 'Tracevane Docs Renderer' --mermaid-mode local`
- Playwright 专项：搜索 `Preview` 后验证 prev/next enabled、状态序号变化、搜索结果 href 不含 `?q=`。
- `npm run docs:render:verify-search -- .tmp/docs-renderer-preview-site/rich-rendering-gallery.html`
- `npm run docs:render:verify-all`

## Round 21 — Friendlier rich rendering gallery and example regression

状态：完成。

目标：继续丰富渲染示例，让测试文档更接近真实文档内容，并把“新增示例必须真实渲染”纳入自动回归。

改进：

- Rich gallery 新增 Dockerfile、TOML、Markdown 代码示例，覆盖更多常见文档源码场景。
- Mermaid 示例扩展 Gantt、Pie、Journey，验证多图族离线渲染。
- HTML Preview 新增“产品说明卡与表单控件”示例，覆盖 responsive grid、form、select、button 和深色模式样式。
- HTML Preview 新增“脚本被阻止的友好提示”示例，明确展示 sandbox + CSP 下脚本不会执行。
- 新增 `playwright_gallery_examples_regression.py`，验证新增 diagram/html/code 示例真实渲染、脚本示例保持 inert、搜索导航不使用 `?q=`。
- `run_regressions.py` 将 gallery examples regression 纳入 `docs:render:verify-all`。
- 导出与 a11y 回归改为显式 reveal toolbar（scroll + hover + focus fallback），避免示例增多后因滚动/hover 时机导致测试误报。
- 新增 `tools/docs-renderer/.gitignore` 忽略 Python 缓存。

渲染输出：

- 多文档站点：`.tmp/docs-renderer-preview-site/index.html`
- 富渲染示例：`.tmp/docs-renderer-preview-site/rich-rendering-gallery.html`
- 单文档预览：`.tmp/docs-renderer-preview/rich-rendering-gallery.html`
- 本轮截图：`/tmp/tracevane-docs-renderer-round21-gallery.png`

验证：

- `PYTHONDONTWRITEBYTECODE=1 python3 -m py_compile tools/docs-renderer/render-docs.py tools/docs-renderer/smoke-test.py tools/docs-renderer/tests/*.py`
- `node --check tools/docs-renderer/renderer/runtime/search.js`
- `node --check tools/docs-renderer/renderer/runtime/rich-blocks.js`
- `python3 /tmp/docs_renderer_round21_check.py`
- `python3 tools/docs-renderer/tests/playwright_export_regression.py .tmp/docs-renderer-preview-site/rich-rendering-gallery.html`
- `python3 tools/docs-renderer/tests/playwright_accessibility_regression.py .tmp/docs-renderer-preview-site/rich-rendering-gallery.html`
- `npm run docs:render:verify-all`

## Round 22 — Reader settings and typography controls

状态：完成。

目标：把“阅读友好”从固定样式推进到用户可调，让同一份静态文档在长文阅读、宽屏排查、紧凑速览场景下都更舒服，同时保持离线、安全和无主项目侵入。

改进：

- 顶部文档操作区新增“阅读”按钮和轻量设置面板。
- 支持四组阅读偏好：字号（小/标准/大）、行宽（窄/舒适/宽）、行距（紧凑/标准/宽松）、密度（安静/标准/紧凑）。
- 新增 `reading-settings.js`：偏好写入 `localStorage`，通过 `documentElement.dataset.reader*` 驱动 CSS token，不修改正文 DOM。
- CSS 新增 reader token：`--doc-reader-font-size`、`--doc-reader-line-height`、`--doc-reader-measure`、`--doc-reader-reading-width`、`--doc-reader-wide-width`、`--doc-reader-block-gap-scale`。
- 阅读设置面板使用玻璃拟态但保持轻量，不进入正文流；移动端转为 fixed 面板，避免溢出。
- 打印模式隐藏阅读设置，避免污染 PDF。
- 新增 `playwright_reader_settings_regression.py`，验证面板可见性、aria-expanded、字号/行宽/行距/密度生效、localStorage 持久化和重置。
- `docs:render:verify-all` 纳入 reader settings regression。

渲染输出：

- 多文档站点：`.tmp/docs-renderer-preview-site/index.html`
- 富渲染示例：`.tmp/docs-renderer-preview-site/rich-rendering-gallery.html`
- 单文档预览：`.tmp/docs-renderer-preview/rich-rendering-gallery.html`
- 本轮截图：`/tmp/tracevane-docs-renderer-round22-reader-settings.png`

验证：

- `python3 tools/docs-renderer/render-docs.py tools/docs-renderer/renderer/fixtures --out .tmp/docs-renderer-preview-site --clean --site-title 'Tracevane Docs Renderer' --mermaid-mode local`
- `python3 tools/docs-renderer/render-docs.py tools/docs-renderer/renderer/fixtures/rich-rendering-gallery.md --out .tmp/docs-renderer-preview --clean --site-title 'Tracevane Docs Renderer' --mermaid-mode local`
- `python3 tools/docs-renderer/tests/playwright_reader_settings_regression.py .tmp/docs-renderer-preview-site/rich-rendering-gallery.html`
- `PYTHONDONTWRITEBYTECODE=1 python3 -m py_compile tools/docs-renderer/render-docs.py tools/docs-renderer/smoke-test.py tools/docs-renderer/tests/*.py`
- `node --check tools/docs-renderer/renderer/runtime/reading-settings.js`
- `node --check tools/docs-renderer/renderer/runtime/index.js`
- `node --check tools/docs-renderer/renderer/runtime/search.js`
- `node --check tools/docs-renderer/renderer/runtime/rich-blocks.js`
- `npm run docs:render:verify-all`

## Round 23 — Current-section navigator and TOC state

状态：完成。

目标：继续提升长文阅读导航友好度，让读者在离开目录侧栏后仍能知道“当前读到哪一节”，并能快速跳到上一/下一章节，同时不占用正文流。

改进：

- 新增 `section-nav.js`：从 `main h2/h3/h4[id]` 构建 body-level 当前章节导航胶囊。
- 章节导航显示当前标题，提供上一节/下一节按钮，并支持 `Alt+↑` / `Alt+↓` 快捷跳转。
- 跳转时使用 `scrollIntoView` 并通过 `history.replaceState` 更新 hash，不重新加载页面。
- `toc.js` 当前目录项新增 `aria-current="location"`，读屏和样式状态更明确。
- CSS 新增 `.section-navigator` 玻璃拟态小胶囊，固定在视口底部，不占正文空间；移动端自适应为底部横条；打印模式隐藏。
- 新增 `playwright_section_nav_regression.py`，验证章节导航可见、TOC aria-current、下一节/上一节和键盘快捷键跳转。
- `docs:render:verify-all` 纳入 section navigator regression。

渲染输出：

- 多文档站点：`.tmp/docs-renderer-preview-site/index.html`
- 富渲染示例：`.tmp/docs-renderer-preview-site/rich-rendering-gallery.html`
- 单文档预览：`.tmp/docs-renderer-preview/rich-rendering-gallery.html`
- 本轮截图：`/tmp/tracevane-docs-renderer-round23-section-nav.png`

验证：

- `python3 tools/docs-renderer/render-docs.py tools/docs-renderer/renderer/fixtures --out .tmp/docs-renderer-preview-site --clean --site-title 'Tracevane Docs Renderer' --mermaid-mode local`
- `python3 tools/docs-renderer/render-docs.py tools/docs-renderer/renderer/fixtures/rich-rendering-gallery.md --out .tmp/docs-renderer-preview --clean --site-title 'Tracevane Docs Renderer' --mermaid-mode local`
- `python3 tools/docs-renderer/tests/playwright_section_nav_regression.py .tmp/docs-renderer-preview-site/rich-rendering-gallery.html`
- `PYTHONDONTWRITEBYTECODE=1 python3 -m py_compile tools/docs-renderer/render-docs.py tools/docs-renderer/smoke-test.py tools/docs-renderer/tests/*.py`
- `node --check tools/docs-renderer/renderer/runtime/section-nav.js`
- `node --check tools/docs-renderer/renderer/runtime/toc.js`
- `node --check tools/docs-renderer/renderer/runtime/index.js`
- `npm run docs:render:verify-all`

## Round 24 — Focus reading mode

状态：完成。

目标：进一步推进阅读友好，让长文可以一键进入“专注阅读”状态，临时移除目录、封面、页脚等框架干扰，但不改变正文 DOM、不牺牲搜索/富渲染/章节导航能力。

改进：

- 阅读设置新增“模式”：标准阅读 / 专注阅读。
- `reading-settings.js` 扩展 `focus` 偏好，使用同一套 `localStorage` 与 `documentElement.dataset.readerFocus` 状态，不新增独立全局按钮。
- 专注阅读模式隐藏 cover、TOC、toc FAB、backdrop 和 footer；正文居中，文档左 padding 归零。
- 专注模式下保留顶部快捷操作、章节导航、富内容工具栏和搜索状态，不修改正文内容。
- 专注模式下阅读按钮有高亮状态，方便用户知道当前处于 focus mode。
- 移动端保持章节导航底部横条，避免居中 transform 造成溢出。
- 打印/PDF 模式仍隐藏阅读设置和专注控件。
- 扩展 `playwright_reader_settings_regression.py`：验证 focus mode 开启后 cover/TOC 隐藏、document padding 收敛、localStorage 持久化、reset 后恢复。

渲染输出：

- 多文档站点：`.tmp/docs-renderer-preview-site/index.html`
- 富渲染示例：`.tmp/docs-renderer-preview-site/rich-rendering-gallery.html`
- 单文档预览：`.tmp/docs-renderer-preview/rich-rendering-gallery.html`
- 本轮截图：`/tmp/tracevane-docs-renderer-round24-focus-mode.png`

验证：

- `python3 tools/docs-renderer/render-docs.py tools/docs-renderer/renderer/fixtures --out .tmp/docs-renderer-preview-site --clean --site-title 'Tracevane Docs Renderer' --mermaid-mode local`
- `python3 tools/docs-renderer/render-docs.py tools/docs-renderer/renderer/fixtures/rich-rendering-gallery.md --out .tmp/docs-renderer-preview --clean --site-title 'Tracevane Docs Renderer' --mermaid-mode local`
- `python3 tools/docs-renderer/tests/playwright_reader_settings_regression.py .tmp/docs-renderer-preview-site/rich-rendering-gallery.html`
- `PYTHONDONTWRITEBYTECODE=1 python3 -m py_compile tools/docs-renderer/render-docs.py tools/docs-renderer/smoke-test.py tools/docs-renderer/tests/*.py`
- `node --check tools/docs-renderer/renderer/runtime/reading-settings.js`
- `node --check tools/docs-renderer/renderer/runtime/index.js`
- `npm run docs:render:verify-all`

## Round 25 — Unified copy/export feedback toast

状态：完成。

目标：继续优化交互细节，让复制、复制选区、导出等操作不只依赖按钮局部状态，而是给读者一个统一、轻量、可读屏感知的反馈层；反馈层不进入正文流、不遮挡主要内容。

改进：

- `clipboard.js` 新增 `showDocFeedback()` 与 body-level `doc-feedback-toast`。
- `flashButton()` 成功/失败时同步更新按钮状态、可选局部 status 与全局 toast。
- `code-block.js` 的“复制选区”独立路径接入全局反馈：无选区时提示“复制失败，请先选择代码”，成功时提示“已复制选区”。
- `rich-blocks.js` 导出 SVG/PNG 的 `markButton()` 接入全局反馈：成功“已导出”，失败“导出失败”。
- CSS 新增 `.doc-feedback-toast`：玻璃拟态轻量胶囊，`role=status` / `aria-live=polite`，深色/移动端/打印适配。
- 新增 `playwright_feedback_regression.py`，验证复制成功、复制选区失败、导出成功都复用同一反馈层。
- `docs:render:verify-all` 纳入 feedback regression。

渲染输出：

- 多文档站点：`.tmp/docs-renderer-preview-site/index.html`
- 富渲染示例：`.tmp/docs-renderer-preview-site/rich-rendering-gallery.html`
- 单文档预览：`.tmp/docs-renderer-preview/rich-rendering-gallery.html`
- 本轮截图：`/tmp/tracevane-docs-renderer-round25-feedback-toast.png`

验证：

- `python3 tools/docs-renderer/render-docs.py tools/docs-renderer/renderer/fixtures --out .tmp/docs-renderer-preview-site --clean --site-title 'Tracevane Docs Renderer' --mermaid-mode local`
- `python3 tools/docs-renderer/render-docs.py tools/docs-renderer/renderer/fixtures/rich-rendering-gallery.md --out .tmp/docs-renderer-preview --clean --site-title 'Tracevane Docs Renderer' --mermaid-mode local`
- `python3 tools/docs-renderer/tests/playwright_feedback_regression.py .tmp/docs-renderer-preview-site/rich-rendering-gallery.html`
- `PYTHONDONTWRITEBYTECODE=1 python3 -m py_compile tools/docs-renderer/render-docs.py tools/docs-renderer/smoke-test.py tools/docs-renderer/tests/*.py`
- `node --check tools/docs-renderer/renderer/runtime/clipboard.js`
- `node --check tools/docs-renderer/renderer/runtime/code-block.js`
- `node --check tools/docs-renderer/renderer/runtime/rich-blocks.js`
- `npm run docs:render:verify-all`

## Round 26 — Keyboard shortcut help

状态：完成。

目标：提升交互可发现性。docs-renderer 已经有 Ctrl/⌘+K、Alt+方向键、Esc、Enter/Space 等快捷键，但缺少统一说明入口；本轮新增轻量帮助面板，不占正文流，不影响阅读。

改进：

- 顶部文档操作区新增“快捷键”按钮。
- 新增 `keyboard-help.js`：body-level 快捷键帮助面板，列出搜索、搜索命中跳转、章节跳转、富内容工具栏、Esc 和 `?` 等快捷键。
- 支持点击按钮打开/关闭，支持 `?` 打开/关闭；输入框/textarea/select/contenteditable 内不会拦截 `?`。
- 面板使用 `role="dialog"`、`aria-label="快捷键帮助"`；关闭按钮自动聚焦，Esc 可关闭。
- CSS 新增 `.keyboard-help-toggle` 与 `.keyboard-help-panel`，与阅读设置/反馈 toast 的玻璃拟态系统一致，深色/移动端/打印适配。
- 新增 `playwright_keyboard_help_regression.py`，验证按钮、aria-expanded、面板内容、Esc、`?` 快捷键和输入框不拦截。
- `docs:render:verify-all` 纳入 keyboard help regression。

渲染输出：

- 多文档站点：`.tmp/docs-renderer-preview-site/index.html`
- 富渲染示例：`.tmp/docs-renderer-preview-site/rich-rendering-gallery.html`
- 单文档预览：`.tmp/docs-renderer-preview/rich-rendering-gallery.html`
- 本轮截图：`/tmp/tracevane-docs-renderer-round26-keyboard-help.png`

验证：

- `python3 tools/docs-renderer/render-docs.py tools/docs-renderer/renderer/fixtures --out .tmp/docs-renderer-preview-site --clean --site-title 'Tracevane Docs Renderer' --mermaid-mode local`
- `python3 tools/docs-renderer/render-docs.py tools/docs-renderer/renderer/fixtures/rich-rendering-gallery.md --out .tmp/docs-renderer-preview --clean --site-title 'Tracevane Docs Renderer' --mermaid-mode local`
- `python3 tools/docs-renderer/tests/playwright_keyboard_help_regression.py .tmp/docs-renderer-preview-site/rich-rendering-gallery.html`
- `PYTHONDONTWRITEBYTECODE=1 python3 -m py_compile tools/docs-renderer/render-docs.py tools/docs-renderer/smoke-test.py tools/docs-renderer/tests/*.py`
- `node --check tools/docs-renderer/renderer/runtime/keyboard-help.js`
- `node --check tools/docs-renderer/renderer/runtime/index.js`
- `npm run docs:render:verify-all`

## Round 27 — Copy current document link

状态：完成。

目标：提升文档分享与引用体验。用户阅读文档时经常需要复制当前页面链接；此前只能手动复制地址栏。本轮在 docs-renderer 顶部操作区增加轻量“链接”按钮，并复用 Round 25 的全局反馈层。

改进：

- 顶部文档操作区新增“链接”按钮，`aria-label="复制当前文档链接"`。
- 新增 `share-link.js`：复制当前 `window.location.href`。
- 复用 `flashButton()` 与 `.doc-feedback-toast`：成功提示“已复制文档链接”，失败提示“复制链接失败，请手动复制地址栏”。
- CSS 新增 `.doc-link-copy`，视觉与主题/阅读/快捷键/打印操作保持同一玻璃拟态体系；打印模式隐藏。
- 新增 `playwright_share_link_regression.py`，验证按钮可见、aria、copy state、toast 文案和 feedback state。
- `docs:render:verify-all` 纳入 share link regression。

渲染输出：

- 多文档站点：`.tmp/docs-renderer-preview-site/index.html`
- 富渲染示例：`.tmp/docs-renderer-preview-site/rich-rendering-gallery.html`
- 单文档预览：`.tmp/docs-renderer-preview/rich-rendering-gallery.html`
- 本轮截图：`/tmp/tracevane-docs-renderer-round27-share-link.png`

验证：

- `python3 tools/docs-renderer/render-docs.py tools/docs-renderer/renderer/fixtures --out .tmp/docs-renderer-preview-site --clean --site-title 'Tracevane Docs Renderer' --mermaid-mode local`
- `python3 tools/docs-renderer/render-docs.py tools/docs-renderer/renderer/fixtures/rich-rendering-gallery.md --out .tmp/docs-renderer-preview --clean --site-title 'Tracevane Docs Renderer' --mermaid-mode local`
- `python3 tools/docs-renderer/tests/playwright_share_link_regression.py .tmp/docs-renderer-preview-site/rich-rendering-gallery.html`
- `PYTHONDONTWRITEBYTECODE=1 python3 -m py_compile tools/docs-renderer/render-docs.py tools/docs-renderer/smoke-test.py tools/docs-renderer/tests/*.py`
- `node --check tools/docs-renderer/renderer/runtime/share-link.js`
- `node --check tools/docs-renderer/renderer/runtime/index.js`
- `npm run docs:render:verify-all`

## Round 28 — Quick action rail responsive polish

状态：完成。

目标：顶部文档操作区经过多轮新增主题、阅读、复制链接、快捷键、打印按钮后，窄屏下需要统一收敛，避免溢出、遮挡标题或出现杂乱按钮墙。

改进：

- `.doc-quick-actions` 增加轻量 rail 背景、统一边框和 blur，使多个按钮成为一个整体操作组。
- 顶部按钮统一取消重复阴影，减少视觉噪声；保留各自 hover/focus 状态。
- 720px 以下切换为 icon-only 34px 胶囊按钮：主题、阅读、链接、快捷键、打印均保留可点击和 aria-label，不依赖可见文字。
- 移动端 cover 顶部 padding 增加，避免操作区压住标题区域。
- 380px 以下整体轻微 scale，保证极窄屏仍可容纳全部操作。
- 新增 `playwright_quick_actions_regression.py`，验证 390px 视口下 rail 不溢出、五个按钮均可见且尺寸收敛，并验证阅读设置/快捷键面板仍能打开。
- `docs:render:verify-all` 纳入 quick actions regression。

渲染输出：

- 多文档站点：`.tmp/docs-renderer-preview-site/index.html`
- 富渲染示例：`.tmp/docs-renderer-preview-site/rich-rendering-gallery.html`
- 单文档预览：`.tmp/docs-renderer-preview/rich-rendering-gallery.html`
- 本轮截图：`/tmp/tracevane-docs-renderer-round28-mobile-quick-actions.png`

验证：

- `python3 tools/docs-renderer/render-docs.py tools/docs-renderer/renderer/fixtures --out .tmp/docs-renderer-preview-site --clean --site-title 'Tracevane Docs Renderer' --mermaid-mode local`
- `python3 tools/docs-renderer/render-docs.py tools/docs-renderer/renderer/fixtures/rich-rendering-gallery.md --out .tmp/docs-renderer-preview --clean --site-title 'Tracevane Docs Renderer' --mermaid-mode local`
- `python3 tools/docs-renderer/tests/playwright_quick_actions_regression.py .tmp/docs-renderer-preview-site/rich-rendering-gallery.html`
- `PYTHONDONTWRITEBYTECODE=1 python3 -m py_compile tools/docs-renderer/render-docs.py tools/docs-renderer/smoke-test.py tools/docs-renderer/tests/*.py`
- `npm run docs:render:verify-all`

## Round 29 — Unified quick action button grammar

状态：完成。

目标：继续推进顶部文档操作区的友好度。前几轮逐步增加主题、阅读、复制链接、快捷键、打印后，按钮样式来自多个历史实现，虽然功能可用，但 hover/focus/深浅色和移动端 icon-only 规则分散。本轮将它们收敛到一个共享 action class，降低后续新增按钮的样式漂移风险。

改进：

- 顶部五个操作按钮统一增加 `doc-action-button` 语义 class：主题、阅读、链接、快捷键、打印/PDF。
- 新增统一 glass action 样式：尺寸、边框、背景、字体、hover、focus、expanded、copied、error 状态都由一套规则管理。
- 保留每个按钮原有图标语义和 aria-label，同时让移动端 icon-only 规则直接作用于共享 class。
- 深色模式下统一提高按钮文字/图标对比度，减少历史按钮之间的明暗不一致。
- 扩展 `playwright_quick_actions_regression.py`，验证五个按钮都具备共享 class，避免后续新增/回退造成样式系统断裂。

渲染输出：

- 多文档站点：`.tmp/docs-renderer-preview-site/index.html`
- 富渲染示例：`.tmp/docs-renderer-preview-site/rich-rendering-gallery.html`
- 单文档预览：`.tmp/docs-renderer-preview/rich-rendering-gallery.html`
- 本轮截图：`/tmp/tracevane-docs-renderer-round29-action-rail.png`

验证：

- `python3 tools/docs-renderer/render-docs.py tools/docs-renderer/renderer/fixtures --out .tmp/docs-renderer-preview-site --clean --site-title 'Tracevane Docs Renderer' --mermaid-mode local`
- `python3 tools/docs-renderer/render-docs.py tools/docs-renderer/renderer/fixtures/rich-rendering-gallery.md --out .tmp/docs-renderer-preview --clean --site-title 'Tracevane Docs Renderer' --mermaid-mode local`
- `python3 tools/docs-renderer/tests/playwright_quick_actions_regression.py .tmp/docs-renderer-preview-site/rich-rendering-gallery.html`
- `PYTHONDONTWRITEBYTECODE=1 python3 -m py_compile tools/docs-renderer/render-docs.py tools/docs-renderer/smoke-test.py tools/docs-renderer/tests/*.py`
- `npm run docs:render:verify-all`

## Round 30 — More friendly rich-rendering examples

状态：完成。

目标：继续丰富渲染内容示例，让测试文档更接近真实使用场景，并把新增示例纳入回归，避免“写了 Markdown 但没有实际渲染成功”。

改进：

- `rich-rendering-gallery.md` 增加 CSS container query 示例代码块，用于验证更多代码语言和高亮文本进入搜索索引。
- Mermaid 示例新增 ER Diagram：覆盖文档、章节、富渲染块、沙箱和搜索命中的对象关系表达。
- HTML Preview 新增响应式时间线：覆盖 container query、深浅色 `prefers-color-scheme`、自适应布局和静态 iframe 渲染。
- `playwright_gallery_examples_regression.py` 提升 Mermaid/HTML Preview 数量断言，并检查新增 ER Diagram、响应式时间线与 CSS 示例实际存在。
- `rich-blocks.js` 对 body-level 浮动工具栏增加二次 rAF/timeout 重定位：长内容被 Playwright 或浏览器滚动到视口后，工具栏不会保留滚动前的 stale x/y，也不会覆盖 Mindmap 等高块内容。
- `playwright_toolbar_regression.py` 的失败信息补充 toolbar/anchor rect，便于后续定位外置工具栏是否真的覆盖内容。

渲染输出：

- 多文档站点：`.tmp/docs-renderer-preview-site/index.html`
- 富渲染示例：`.tmp/docs-renderer-preview-site/rich-rendering-gallery.html`
- 单文档预览：`.tmp/docs-renderer-preview/rich-rendering-gallery.html`
- 本轮截图：`/tmp/tracevane-docs-renderer-round30-more-examples.png`

验证：

- `python3 tools/docs-renderer/render-docs.py tools/docs-renderer/renderer/fixtures --out .tmp/docs-renderer-preview-site --clean --site-title 'Tracevane Docs Renderer' --mermaid-mode local`
- `python3 tools/docs-renderer/render-docs.py tools/docs-renderer/renderer/fixtures/rich-rendering-gallery.md --out .tmp/docs-renderer-preview --clean --site-title 'Tracevane Docs Renderer' --mermaid-mode local`
- `python3 tools/docs-renderer/tests/playwright_gallery_examples_regression.py .tmp/docs-renderer-preview-site/rich-rendering-gallery.html`
- `python3 tools/docs-renderer/tests/playwright_toolbar_regression.py .tmp/docs-renderer-preview-site/rich-rendering-gallery.html`
- `python3 tools/docs-renderer/tests/playwright_quick_actions_regression.py .tmp/docs-renderer-preview-site/rich-rendering-gallery.html`
- `PYTHONDONTWRITEBYTECODE=1 python3 -m py_compile tools/docs-renderer/render-docs.py tools/docs-renderer/smoke-test.py tools/docs-renderer/tests/*.py`
- `node --check tools/docs-renderer/renderer/runtime/rich-blocks.js`
- `npm run docs:render:verify-all`

## Round 31 — Section navigator reading progress polish

状态：完成。

目标：继续优化长文阅读体验。此前底部章节导航只显示当前章节和上下跳转，读者仍需要通过顶部细进度条判断总体阅读位置；本轮把阅读进度整合到章节导航胶囊内，让长文阅读时的“当前位置 + 进度”更直接。

改进：

- `section-nav.js` 的当前章节按钮拆分为标题与百分比两段，保留点击回到当前章节的行为。
- 新增 `.section-navigator__progress` 小型进度徽标，深浅色模式下统一低干扰玻璃质感。
- 为所有正文标题锚点增加 `scroll-margin-top`，章节跳转和 hash 定位不再贴顶。
- 扩展 `playwright_section_nav_regression.py`，验证进度徽标可见且显示百分比。

渲染输出：

- 多文档站点：`.tmp/docs-renderer-preview-site/index.html`
- 富渲染示例：`.tmp/docs-renderer-preview-site/rich-rendering-gallery.html`
- 单文档预览：`.tmp/docs-renderer-preview/rich-rendering-gallery.html`
- 本轮截图：`/tmp/tracevane-docs-renderer-round31-section-progress.png`

验证：

- `python3 tools/docs-renderer/render-docs.py tools/docs-renderer/renderer/fixtures --out .tmp/docs-renderer-preview-site --clean --site-title 'Tracevane Docs Renderer' --mermaid-mode local`
- `python3 tools/docs-renderer/render-docs.py tools/docs-renderer/renderer/fixtures/rich-rendering-gallery.md --out .tmp/docs-renderer-preview --clean --site-title 'Tracevane Docs Renderer' --mermaid-mode local`
- `python3 tools/docs-renderer/tests/playwright_section_nav_regression.py .tmp/docs-renderer-preview-site/rich-rendering-gallery.html`
- `PYTHONDONTWRITEBYTECODE=1 python3 -m py_compile tools/docs-renderer/render-docs.py tools/docs-renderer/smoke-test.py tools/docs-renderer/tests/*.py`
- `node --check tools/docs-renderer/renderer/runtime/section-nav.js`
- `npm run docs:render:verify-all`

## Round 32 — Image lightbox affordance and caption polish

状态：完成。

目标：继续完善图片渲染体验。此前图片可点击进入全屏灯箱，但正文内缺少明确的可预览提示，弹层也只显示图片本身，复制按钮语义不够准确。本轮把图片变成更明确、可键盘访问、可复制地址的阅读友好媒体块。

改进：

- `media.js` 为非链接图片包裹 `doc-lightbox-frame`，添加轻量“预览”徽标，不额外占用文章工具栏位置。
- 图片保留 `role="button"` 与键盘 Enter/Space 打开能力，`aria-label` 包含图片 alt 文本。
- 图片灯箱弹层新增底部 caption，显示图片 alt，避免打开后失去上下文。
- 图片灯箱复制按钮改为“复制链接”，aria 文案改为“复制图片地址”。
- 新增 `playwright_media_lightbox_regression.py`，验证图片 wrapper、badge、aria、键盘打开、caption、复制链接状态。
- `docs:render:verify-all` 纳入 media lightbox regression。

渲染输出：

- 多文档站点：`.tmp/docs-renderer-preview-site/index.html`
- 富渲染示例：`.tmp/docs-renderer-preview-site/rich-rendering-gallery.html`
- 单文档预览：`.tmp/docs-renderer-preview/rich-rendering-gallery.html`
- 本轮截图：`/tmp/tracevane-docs-renderer-round32-image-lightbox.png`

验证：

- `python3 tools/docs-renderer/render-docs.py tools/docs-renderer/renderer/fixtures --out .tmp/docs-renderer-preview-site --clean --site-title 'Tracevane Docs Renderer' --mermaid-mode local`
- `python3 tools/docs-renderer/render-docs.py tools/docs-renderer/renderer/fixtures/rich-rendering-gallery.md --out .tmp/docs-renderer-preview --clean --site-title 'Tracevane Docs Renderer' --mermaid-mode local`
- `python3 tools/docs-renderer/tests/playwright_media_lightbox_regression.py .tmp/docs-renderer-preview-site/rich-rendering-gallery.html`
- `PYTHONDONTWRITEBYTECODE=1 python3 -m py_compile tools/docs-renderer/render-docs.py tools/docs-renderer/smoke-test.py tools/docs-renderer/tests/*.py`
- `node --check tools/docs-renderer/renderer/runtime/media.js`
- `npm run docs:render:verify-all`

## Round 34 — Search nav compaction and top-action pruning

状态：完成。

目标：按用户反馈修正文档导航区搜索溢出，以及删除顶部无意义操作。顶部“复制链接”和“打印/PDF”在当前文档阅读场景中价值较低，还增加移动端拥挤；底部章节导航与侧栏目录职责重复，改为轻量返回顶部按钮。

改进：

- 顶部操作区删除“链接”和“打印/PDF”按钮，仅保留主题、阅读、快捷键。
- 移除 `print.js`、`share-link.js` 运行时入口，并从全量回归中删除对应按钮回归。
- 文档导航新增固定首页入口：`首页 · Index`，所有文档页都能从侧栏回到 `index.html`，首页自身显示 active。
- 搜索区文案收敛：按钮从“上一处/下一处”改为“上一个/下一个”，状态文案从“搜索当前站点与当前文档”改为“搜索站点和本文”。
- 搜索控件 CSS 改为更紧凑的 grid，按钮和状态都强制在 `.doc-search` 内部断行/省略，避免侧栏宽度下溢出。
- 删除章节导航运行时与回归，新增/保留 `back-to-top` 浮动按钮作为轻量返回顶部快捷入口。
- 更新 quick actions/search/back-to-top 回归，验证删除按钮、首页导航、搜索区不溢出、返回顶部可用。

渲染输出：

- 多文档站点：`.tmp/docs-renderer-preview-site/index.html`
- 富渲染示例：`.tmp/docs-renderer-preview-site/rich-rendering-gallery.html`
- 单文档预览：`.tmp/docs-renderer-preview/rich-rendering-gallery.html`
- 本轮截图：`/tmp/tracevane-docs-renderer-round34-search-home-top.png`

验证：

- `python3 tools/docs-renderer/render-docs.py tools/docs-renderer/renderer/fixtures --out .tmp/docs-renderer-preview-site --clean --site-title 'Tracevane Docs Renderer' --mermaid-mode local`
- `python3 tools/docs-renderer/render-docs.py tools/docs-renderer/renderer/fixtures/rich-rendering-gallery.md --out .tmp/docs-renderer-preview --clean --site-title 'Tracevane Docs Renderer' --mermaid-mode local`
- `python3 tools/docs-renderer/tests/playwright_search_regression.py .tmp/docs-renderer-preview-site/rich-rendering-gallery.html`
- `python3 tools/docs-renderer/tests/playwright_quick_actions_regression.py .tmp/docs-renderer-preview-site/rich-rendering-gallery.html`
- `python3 tools/docs-renderer/tests/playwright_back_to_top_regression.py .tmp/docs-renderer-preview-site/rich-rendering-gallery.html`
- `PYTHONDONTWRITEBYTECODE=1 python3 -m py_compile tools/docs-renderer/render-docs.py tools/docs-renderer/smoke-test.py tools/docs-renderer/tests/*.py`
- `node --check tools/docs-renderer/renderer/runtime/index.js tools/docs-renderer/renderer/runtime/back-to-top.js tools/docs-renderer/renderer/runtime/search.js`
- `npm run docs:render:verify-all`
