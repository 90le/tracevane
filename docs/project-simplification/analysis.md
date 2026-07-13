# Tracevane 全仓瘦身分析

日期：2026-07-11  
分支：`codex/project-simplification`  
基线提交：`a0e33754`

## 1. 目标与判定标准

本轮目标不是按文件大小机械拆分，也不是为了减少行数引入新的框架。清理对象必须至少满足一项：

- 没有运行时、构建、测试或发布入口；
- 只为已经删除的功能、数据格式或页面保留；
- 同一职责存在多个实现，且可以收敛到已有边界；
- 只做参数转发、命名转换或预留扩展，但没有第二个真实调用方；
- 依赖、脚本、文档或资源已经没有当前产品用途；
- 单文件混合多个可独立验证的职责，已显著妨碍维护和测试。

删除证据必须同时考虑静态引用、动态入口、测试契约、外部协议和打包流程。仅仅“搜索不到 import”不足以删除 ambient declaration、插件入口、Vite 动态模块或外部协议兼容层。

## 2. 当前量化基线

| 范围 | 文件/规模 | 观察 |
| --- | ---: | --- |
| API TypeScript | 153 文件 / 114,591 行 | 业务逻辑高度集中在少数 service/daemon |
| Web TypeScript/TSX | 236 文件 / 64,686 行 | File Manager 与 IDE 页面存在多个超大组件 |
| 共享类型 | 19 文件 / 8,386 行 | Channel Connectors、Model Gateway、Chat 类型体积较大 |
| 测试 | 88 个 system test / 65,734 行 | 单个 Model Gateway 测试文件超过 24k 行 |
| smoke | 93 个 smoke 文件 | IDE smoke 存在大量重复启动、布局与 fixture 代码 |
| scripts | 42 个文件 / 14,175 行 | live smoke、兼容 smoke 与本地工具混在同一目录 |

基线验证：

- `npm run typecheck`：通过；
- `npm run typecheck:web`：通过；
- `npm run build:api`：通过；
- `npm run build:web`：通过；
- API 严格未使用检查：53 条诊断；
- Web 严格未使用检查：36 条 Web 诊断，另重复报告由 Vite 配置引入的 API 诊断；
- 全量 system test：后台执行中，结果写入 `/tmp/tracevane-project-simplification-baseline-tests.log`。

前端构建同时暴露两项明确问题：

- `FileOnlineEditorDialog.tsx` 同时被静态和动态导入，动态导入无法形成独立 chunk；
- `explorer-ui` 约 3.84 MB，`IdeWorkbenchPage` 约 658 KB，`FileManagerPage` 约 215 KB；需要区分 Monaco/图标资源的合理体积与错误聚合。

## 3. 热点分布

### 后端

| 文件 | 行数 | 当前判断 |
| --- | ---: | --- |
| `apps/api/modules/channel-connectors/daemon.ts` | 14,438 | 连接监管、派发、会话、队列、回复和平台分支混合；高风险拆责 |
| `apps/api/modules/model-gateway/service.ts` | 13,658 | 配置、路由、鉴权、健康、用量和协议编排混合；高风险拆责 |
| `apps/api/modules/channel-connectors/command-router.ts` | 5,248 | 命令解析和业务动作集中；需先按行为建立测试边界 |
| `apps/api/modules/channel-connectors/service.ts` | 4,668 | 已完成 v3-only 清理后仍有明显未使用辅助逻辑 |
| `apps/api/modules/files/service.ts` | 4,329 | SQLite 主路径与旧 shard/trash 迁移函数并存 |
| `apps/api/modules/config/service.ts` | 3,536 | 配置 schema、规范化和运行时读取集中 |

### 前端

| 文件 | 行数 | 当前判断 |
| --- | ---: | --- |
| `FileManagerPage.tsx` | 3,571 | 页面状态、命令编排、数据操作和对话框控制混合 |
| `FileManagerList.tsx` | 2,753 | 列表渲染、选择、键盘、拖放和菜单逻辑混合 |
| `FileManagerChrome.tsx` | 2,078 | 桌面/移动工具栏与多个未使用 props 共存 |
| `IdeSourceControlView.tsx` | 1,859 | Git 状态、提交、分支、stash、graph、blame 集中 |
| `IdeWorkbenchPage.tsx` | 1,779 | Workbench 编排合理，但已接近需要按领域抽 hook 的阈值 |
| `IdeExplorerView.tsx` | 1,592 | Explorer 操作与 UI 状态混合，且存在未使用传输辅助导入 |

大文件本身不是删除理由。只有当可以明确划出已有职责、减少重复或删除旧路径时才拆分；禁止把一个大文件替换成大量单调用方 wrapper。

## 4. 高置信度清理候选

### A. 可直接进入第一批清理

| 候选 | 证据 | 风险 | 验证 |
| --- | --- | --- | --- |
| `bcryptjs`、`@types/bcryptjs` | 除 manifest/lockfile 外全仓零引用 | 低 | install、typecheck、system tests |
| API 53 条严格未使用诊断 | TypeScript `noUnusedLocals/noUnusedParameters` 直接报告 | 低到中 | 逐模块测试 + typecheck |
| Web 36 条严格未使用诊断 | TypeScript 直接报告 | 低到中 | web typecheck + 页面 smoke |
| `apps/api/modules/lsp/external/index.ts` | 仓内零入站引用，消费者均直引具体模块 | 低 | LSP system tests + API build |
| `apps/web/src/shared/layouts/*Layout.tsx` | 仅定义，无页面引用；对应 `tv-*` CSS 也无真实消费者 | 低到中 | web typecheck + responsive smoke |
| 未使用 API/query 导出 | 全仓只有定义命中 | 中 | 对应 API contract test + 页面 smoke |
| `FileOnlineEditorDialog` 重复静态/动态导入 | Vite 明确给出无效动态导入警告 | 低到中 | web build + editor smoke |

第一批严格未使用诊断中，以下是明确旧逻辑信号，而不只是回调参数命名：

- Channel Connectors：`slugify`、旧 ID 判定器、`extractBindingSecrets`、旧 Feishu binding 选择器等；
- Files：旧 trash/content-index shard 迁移函数、旧 shard 读写辅助、未使用迁移状态；
- Model Gateway：未使用 latency 初始化、timeout fetch、stream failure 提取函数；
- Terminal/Git/System/LSP：未使用 helper、类型和导入；
- Web：废弃图标、未消费 props、旧 mutation/query hook 和 React 19 不再需要的默认 React 导入。

### B. 需先修正测试契约再删除

| 候选 | 阻碍 | 处理方式 |
| --- | --- | --- |
| `shared/file-editor/FileEditor.tsx` | 运行时零引用，但 `web-file-editor.test.mjs` 强制它存在 | 先确认产品已统一到 Editor Core，再删除旧测试契约和组件 |
| `types/chat.ts` | 仓内几乎零消费者，但可能是历史公开类型面 | 项目 private 且未发布，可在确认根导出后删除并用 API/typecheck 验证 |
| 文件版本、chmod、transfer、Git、Terminal query hooks | 页面零调用，但 system tests 可能只验证声明存在 | 删除“只证明代码存在”的测试，保留真实页面/API 行为测试 |
| IDE smoke 重复布局/启动 helper | 约几十个 smoke 各自复制 | 先提取测试 helper，再逐个迁移，避免产品代码重构与测试重构同时发生 |

### C. 不能凭静态搜索直接删除

| 范围 | 原因 |
| --- | --- |
| OpenClaw gateway `v2/v3` 签名回退 | 这是当前外部宿主协议兼容，不等同于 Tracevane 历史版本兼容 |
| Model Gateway unsupported endpoint 列表 | 明确 unsupported 也是协议合同的一部分 |
| Monaco ambient declarations/语言 loader | 可能通过 Vite glob、worker 或 TypeScript include 使用 |
| `types/openclaw-plugin-sdk.d.ts` | 可能为插件源码编译提供 ambient contract，需要先验证源码入口 |
| `assets/` 与 `apps/web/public/` 重复图片 | 可能分别服务安装包与 Web 构建，需检查 pack/install 流程 |
| `docs/ide-code-editor-solution/archive` | 大量历史文档被主文档深链引用；应先收敛主文档再删除 archive |

## 5. 重复与臃肿设计

### Model Gateway

- `isRecord`、`stringOrNull`、`stringifyCompact` 等局部 helper 在多个 adapter 重复；只在语义完全一致时收敛到现有内部工具模块。
- legacy function-call 到 tool-call 的转换在 streaming/adapter 中重复。应先用 protocol matrix 锁定每种输出，再抽取“解析”而保留协议专属序列化。
- `service.ts` 应按现有职责拆出配置存储、运行时选择、用量账本或健康管理，不增加 generic manager/factory。

### Channel Connectors

- v3-only 配置已经完成，但 daemon/service 仍残留一批编译器可确认的旧辅助代码。
- daemon 拆分顺序应是纯函数解析/签名、持久 store、平台 supervisor、dispatch orchestration；不改变一个账号一个物理连接和持久队列语义。

### Files / IDE

- Files service 内旧 JSON/shard 迁移路径与 SQLite 主路径并存，是优先删除候选。
- File Manager 的 Page/List/Chrome 需要先删除未使用 props 和旧对话框路径，再按真实职责抽 hook/component。
- IDE layout 与 terminal layout 都实现了远端 hydration、local fallback、merge 和 persistence；这是重复状态机，需在对应 smoke 全绿后收敛。
- 大量 IDE smoke 重复 `createDefaultWorkbenchLayout` 和服务器启动样板，应先建立测试 helper，减少后续行为变更时的复制修改。

## 6. 文档、脚本与仓库卫生

- `chat-history.md` 被 Git 跟踪，需要确认是否仍是产品/开发入口；若只是历史记录应删除。
- `.legacy-source/`、`.tmp/`、`tmp/`、构建输出均已忽略，不属于 Git 代码；最终验收时清理本轮生成物，但不擅自删除用户本地数据。
- IDE archive 文件数量庞大，且主 README/阶段文档包含大量重复的“已完成阶段”长段落。应保留当前架构合同和验收说明，删除可由 Git 历史恢复的逐阶段进度文档。
- npm scripts 超过百项，很多只是端口不同的单 smoke 入口。保留可组合的 domain/RC matrix 和常用开发命令，逐步移除只被历史文档引用的别名。

## 7. 当前结论

项目存在真实瘦身空间，但最大收益不是把所有大文件机械拆小，而是：

1. 清零编译器已经确认的未使用实现；
2. 删除未使用依赖、孤立组件、API/query 预留层和只验证“文件存在”的测试；
3. 移除 SQLite/v3 主线已经替代的旧迁移与兼容代码；
4. 收敛 IDE smoke 和历史文档的高重复样板；
5. 最后再对 daemon/service/Page 等热点按真实职责拆分。

详细执行顺序和门槛见 [plan.md](./plan.md)。
