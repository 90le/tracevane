# SiYuan 功能借鉴与 Tracevane Docs Renderer 融合分析

> 状态：持续跟进。本文把思源/SiYuan Protyle 的功能族与 Tracevane Docs Renderer 的静态、安全、离线渲染目标做映射，避免“照搬编辑器”而破坏在线文档安全边界。

## 边界结论

Tracevane Docs Renderer 不是可编辑块数据库，也不是本地笔记工作台；它的核心是把 Markdown 文档静态渲染成可离线发布的安全 HTML。因此：

- **可借鉴**：显式块类型分发、只读预览、块引用预览、引用关系、行内备注、导出/复制、深浅主题、一键搜索、无占位悬浮工具栏。
- **谨慎借鉴**：HTML 预览、图表/公式/脑图等富渲染器；必须显式 fence、sandbox、CSP、源码可见、回归测试保护。
- **不照搬**：可编辑 Protyle block DOM、数据库块查询、服务端 backlink、挂件/插件执行、脚本型 HTML、实时协同、账号同步、资产管理器。

## SiYuan 功能族 × 当前项目状态

| SiYuan / Protyle 能力族 | 设计价值 | Tracevane 当前状态 | 融合决策 |
| --- | --- | --- | --- |
| `data-type` / `data-subtype` 渲染分发 | 不同块由独立 renderer 处理，避免主流程膨胀 | Lua filter + runtime 已分发 Mermaid / HTML Preview / Chart / Mindmap / Table / Code | 保留；新增 renderer 必须显式语法 + render-once 标记 + 测试 |
| Mermaid / ECharts / Graphviz / Mindmap / PlantUML 等图形 | 文档内表达架构与流程 | Mermaid 离线 bundle、内置 Chart SVG、Mindmap SVG 已有；Graphviz/PlantUML 未做 | 继续优先本地静态 SVG；不引远程服务；Graphviz/PlantUML 暂缓 |
| HTML block 预览 | 支持设计片段与嵌入式说明 | `html-preview` sandbox iframe + `script-src 'none'`；普通 `html` 只做源码 | 保留强安全边界；不启用脚本；不 raw DOM 注入 |
| Block reference / backlink / breadcrumb | 读者不离开上下文即可理解引用关系 | 同页 heading block-ref popover 已有；跨文档引用关系待增强 | 新增静态 Link Graph：生成时从 Markdown 链接提取入链/出链 |
| Inline Memo | 行内旁注，比脚注更轻 | `[文本]{.inline-memo memo="..."}` 已实现，只读 hover/focus/print 展开 | 保留；不做编辑面板、不存数据库 |
| Outline / TOC / 折叠 | 长文导航 | 左侧文档导航、当前页 TOC、移动端抽屉已有 | 后续可加 heading section 折叠，但默认不折叠正文 |
| 搜索 | 快速定位块与文档 | 多文档搜索、当前页高亮、iframe preview 文本搜索已有 | 保留；继续避免 URL query 传播，使用 sessionStorage |
| 复制/导出 | 内容复用 | 代码复制、表格 Markdown/CSV、Mermaid/Chart/Mindmap SVG/PNG | 保留；新增 Link Graph 只复制链接文本即可 |
| 数据库/查询/embed | 结构化知识库 | 无块数据库 | 不做；静态站点无法安全/准确复制该模型 |
| 插件/挂件/动态脚本 | 可扩展能力 | 不允许作者脚本执行 | 不做；与在线 HTML 安全目标冲突 |
| 编辑器工具栏/快捷输入 | 写作体验 | Renderer 只读 | 不做编辑器；只做阅读侧工具栏和源码查看 |
| 资源面板/附件管理 | 笔记资产管理 | 静态 HTML embed resources | 不做资产数据库；保持 Pandoc resource path |
| 双链图谱 | 知识关系可视化 | 待增强 | 先做轻量“引用关系”侧栏；全站图谱需另行评估可读性与体积 |

## 本轮新增方向：静态引用关系 / Backlinks

SiYuan 的 backlink 强依赖块 ID 和数据库查询。Tracevane 的静态等价物应该在生成阶段完成：

1. 扫描所有 Markdown 文档中的普通 Markdown 链接。
2. 将同站 `.md` / `.markdown` / `.html` 链接归一为输出 HTML 路径。
3. 对每个页面注入当前页的 `incoming` / `outgoing` 关系 JSON。
4. Runtime 在侧栏生成“引用关系”小节：
   - 入链：哪些文档引用当前文档。
   - 出链：当前文档引用哪些站内文档。
   - 保持普通 `<a>` 跳转，支持键盘与搜索共存。
5. 不扫描外部 URL、不抓远程页面、不创建数据库、不把引用关系放入正文流。

## 后续候选（按优先级）

1. **Graphviz/PlantUML 静态渲染入口**：仅当本地 CLI 存在时启用；缺失时显示源码与安装提示。
2. **公式/Math 体验增强**：Pandoc 已能输出数学；后续可补更好的复制/主题样式。
3. **章节折叠/阅读模式**：借鉴 Protyle 折叠，但必须避免默认隐藏正文影响搜索和打印。
4. **全站关系图谱**：只在文档数量较少时可视化；大站点默认列表更可靠。
5. **更细粒度块 ID**：可为 heading/figure/table 自动索引，但不引入数据库语义。

## 明确拒绝项

- 不复制 SiYuan 的编辑器 DOM 与块数据库。
- 不允许作者 HTML/JS 在主文档执行。
- 不为 HTML Preview 启用 `allow-scripts`。
- 不把远程渲染服务作为默认能力。
- 不新增未经验证的第三方依赖。
