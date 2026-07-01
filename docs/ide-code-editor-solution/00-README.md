# React 项目代码编辑器与 IDE 能力建设方案

## 文档目的

本文档包用于评估并拆解在现有 React 项目中增加代码编辑与 IDE 能力的完整方案。

重点不是 UI 配色、视觉风格或某个固定页面长什么样，而是定义：

- 文件管理器里的在线代码编辑器应该做什么。
- 独立 IDE 工作台应该做什么。
- 两者哪些能力复用，哪些能力必须隔离。
- 前端需要哪些模块、状态、组件和依赖。
- 后端需要哪些文件、终端、任务、权限和安全能力。
- 如何避免做成一个固定死板、后期无法扩展的三栏 IDE 页面。

## 核心结论

不要把需求做成一个单一的固定 IDE 页面。

推荐拆成两种产品形态，并共享底层能力：

```txt
形态一：文件管理器在线编辑器
- 类似宝塔面板双击文件后的在线文本编辑器。
- 用于快速打开、编辑、保存一个或多个文件。
- 重点是轻量、稳定、快速，不承载完整 IDE 的复杂布局。

形态二：独立 IDE 工作台
- 类似 VS Code / Cursor / Visual Studio Code 类产品的工作台。
- 用于项目级开发，支持资源管理器、多编辑组、终端、问题面板、输出面板、布局拖拽与持久化。
- 必须使用成熟 docking layout 体系，不能手写固定三栏布局。

共享底层内核：
- FileService
- EditorService
- Monaco model 管理
- Tab 状态
- dirty 状态
- 保存与冲突处理
- 文件权限与路径安全
- 后续可扩展 LSP、Git、任务运行、终端
```

## 文档清单

| 文档 | 说明 |
|---|---|
| [12-file-surface-unification-and-monaco-gap-plan.md](./12-file-surface-unification-and-monaco-gap-plan.md) | 统一文件打开/编辑/预览表面，删除旧预览编辑器冲突，补齐 Monaco 快捷键、本地化、媒体预览与能力诊断计划 |
| [m2-execution-plan.md](./m2-execution-plan.md) | M2 统一 File Surface、Monaco 剪贴板/中文/能力诊断、媒体预览和旧预览删除执行计划 |
| [m2-progress.md](./m2-progress.md) | M2 进度、验证证据、风险和决策日志 |
| [01-产品边界与形态拆分.md](./01-产品边界与形态拆分.md) | 解释为什么要拆成“文件管理器编辑器”和“独立 IDE”两套入口 |
| [02-共享内核与总体架构.md](./02-共享内核与总体架构.md) | 说明共享服务层、状态模型、命令体系、文件模型 |
| [03-文件管理器在线编辑器方案.md](./03-文件管理器在线编辑器方案.md) | 详细定义文件管理器内的多标签代码编辑器能力 |
| [m1-execution-plan.md](./m1-execution-plan.md) | 已验证的 M1 文件管理器在线编辑器执行记录与提交前说明 |
| [m1-progress.md](./m1-progress.md) | M1 实施进度、验证证据、风险和决策日志 |
| [m1x-execution-plan.md](./m1x-execution-plan.md) | M1 之后继续增强文件管理器在线编辑器的 M1.x 路线图 |
| [10-monaco-first-online-editor-strategy.md](./10-monaco-first-online-editor-strategy.md) | Monaco-first 方向：Monaco 负责编辑器原生能力，Tracevane 负责文件生命周期、多标签、保存安全和性能边界 |
| [11-monaco-full-capability-plan.md](./11-monaco-full-capability-plan.md) | Monaco 全能力启用方案：全量 editor contributions、全语言懒加载、版本与验证策略 |
| [monaco-first-cleanup-plan.md](./monaco-first-cleanup-plan.md) | Monaco-first cleanup 的执行计划：简化重复编辑器 UI/state、引入 Monaco option profiles、保持 M1.x 保存安全 |
| [monaco-first-cleanup-progress.md](./monaco-first-cleanup-progress.md) | Monaco-first cleanup 的进度、验证证据、风险和下一步 |
| [04-独立IDE工作台方案.md](./04-独立IDE工作台方案.md) | 详细定义独立 IDE 的布局、编辑区、面板、可拖拽能力 |
| [05-前端实现方案.md](./05-前端实现方案.md) | 说明 React 前端需要的模块、组件、状态、Monaco 接入方式 |
| [06-后端服务与接口方案.md](./06-后端服务与接口方案.md) | 说明文件 API、终端 API、权限、安全、watcher、冲突处理 |
| [07-终端运行语言服务Git方案.md](./07-终端运行语言服务Git方案.md) | 说明 xterm.js、node-pty、LSP、Git、任务运行的扩展路线 |
| [08-实施阶段验收与风险.md](./08-实施阶段验收与风险.md) | 分阶段落地计划、验收标准、风险清单 |

## 推荐技术选型

基础编辑能力：

```bash
npm i monaco-editor @monaco-editor/react
```

独立 IDE 布局能力：

```bash
npm i dockview
```

终端 UI：

```bash
npm i @xterm/xterm @xterm/addon-fit
```

后端真实终端：

```bash
npm i ws node-pty
```

后续语言服务：

```bash
npm i monaco-languageclient vscode-ws-jsonrpc
```

## 最小推荐路线

```txt
第一阶段：
做文件管理器在线编辑器。
实现双击打开文件、Monaco 编辑、多 Tab、保存、全部保存、关闭未保存确认；搜索/替换优先使用 Monaco 原生能力。

第一阶段增强（M1.x）：
继续补强文件管理器在线编辑器本身，包括窗口最大化/最小化/关闭、Tab 操作补全、Tab 自适应缩小与横向滚动、外部修改冲突检测、reload/compare/overwrite、状态栏元数据、主题偏好和更多编辑入口；M1.x 完成后进入 Monaco-first cleanup，删除重复的搜索/替换外围状态。

第二阶段：
创建独立 IDE 页面。
接入左侧资源管理器、中间多 Tab 编辑器、底部面板框架，并使用 Dockview 预留可拖拽布局能力。

第三阶段：
接入 xterm.js 和后端 PTY。
实现真实终端、多终端、workspace cwd、resize、kill session。

第四阶段：
补充 Diff、全局搜索、文件 watcher、外部修改提示、Problems、Output。

第五阶段：
接入 LSP、Git、任务运行、调试等完整 IDE 能力。
```

## 重要原则

1. 文件管理器编辑器和独立 IDE 不要合并成一个页面。
2. 文件管理器负责文件操作，编辑器负责文本编辑，Workbench 负责布局和命令。
3. Monaco 负责代码编辑器原生能力；Tracevane 不重复实现搜索/替换、多光标、折叠、minimap、context menu 等 Monaco 已有能力。
4. xterm.js 只解决终端 UI，不执行命令。
5. 独立 IDE 的布局必须可拖动、可拆分、可持久化，不能写死。
6. 文件内容不要长期放 React state，应由 Monaco model 承载。
7. 后端必须做 workspace 路径安全限制。
8. 终端执行能力要优先考虑容器或受限环境，不建议直接暴露宿主机 shell。
