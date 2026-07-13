# Tracevane 全仓瘦身实施方案

日期：2026-07-11  
执行分支：`codex/project-simplification`  
配套分析：[analysis.md](./analysis.md)

## 1. 执行原则

1. 回归先行：每个领域先运行或补充能证明当前行为的最小测试。
2. 一次只处理一种气味：死代码、重复、命名/错误处理、测试补强分开提交或分开验证。
3. 删除优先：旧实现能删就不包一层 deprecated wrapper。
4. 复用现有边界：只有两个以上真实调用方且语义一致时才新增共享 helper。
5. 外部合同单独审计：OpenClaw、飞书、Octo、模型协议、LSP provider 兼容不能因“产品未发布”自动删除。
6. 不新增依赖：本轮使用 TypeScript、现有测试和构建工具完成审计。
7. 每批可回退：不把多个领域和行为变化混在同一批。

## 2. 目标指标

完成时至少满足：

- API 与 Web 严格未使用诊断清零；
- 将 `noUnusedLocals` 纳入 API/Web tsconfig；对框架签名保留的参数使用明确 `_` 前缀或删除；
- 删除所有经过证明无消费者的源码文件和导出；
- 删除 manifest 中无运行时、构建或测试用途的依赖；
- Web 构建不再报告 `FileOnlineEditorDialog` 无效动态导入；
- 不再有“只验证旧文件/旧 symbol 必须存在”的测试；
- 当前主路径的 typecheck、build、system tests 和领域 smoke 通过；
- 记录源码、测试、脚本、依赖与前端产物的前后变化；
- 不引入新的 generic manager、registry、factory 或第二套 UI/状态系统。

## 3. 分阶段执行

### 阶段 0：基线与证据

状态：进行中

- 记录源码/测试/脚本规模和热点；
- 运行 API/Web typecheck 与 build；
- 运行 TypeScript 严格未使用检查；
- 运行全量 system tests；
- 记录 Web chunk 与构建警告；
- 建立本分析和实施方案。

退出条件：基线结果可复现；失败项区分为现有失败、环境失败或真实回归。

### 阶段 1：低风险死代码与依赖

范围：编译器诊断、零消费者文件、未使用依赖、无效导入。

执行顺序：

1. 删除未使用 import、局部变量、纯内部 helper；
2. 删除零引用 barrel/layout/shim；
3. 删除无消费者 API/query 导出及相邻死类型；
4. 删除 `bcryptjs` 与类型包并更新 lockfile；
5. 修复无效动态导入，恢复真实懒加载；
6. 启用 `noUnusedLocals`，视签名情况决定是否启用 `noUnusedParameters`。

验证：

- `npm run typecheck`
- `npm run typecheck:web`
- `npm run build:api`
- `npm run build:web`
- 被触及领域的 system tests

### 阶段 2：陈旧前端/API 表面与测试合同

范围：运行时未接入但被“存在性测试”保护的组件、hook、API client、共享类型。

执行顺序：

1. 建立路由和页面实际消费矩阵；
2. 删除孤立 `FileEditor`/layout 等组件及相应存在性测试；
3. 删除未接入的 Files/Git/Terminal/Model Gateway/Channel Connector query 包装；
4. 若底层 API 也无消费者，继续向后端 route/service 收缩；
5. 删除 `types/chat.ts` 等历史合同前先确认根导出和插件入口。

验证：

- Web/API contract tests
- File Manager 与 IDE editor smoke
- Git、Terminal、Channel Connectors、Model Gateway 相关 smoke
- 浏览器主路由 desktop/mobile smoke

### 阶段 3：旧存储、迁移与兼容路径

范围：已被当前唯一数据模型替代的内部迁移；不包含尚在使用的外部协议兼容。

优先候选：

- Files 旧 trash/content-index shard 迁移；
- Channel Connectors v3-only 后残留 helper；
- 已无持久数据消费者的 route alias、payload field 和备份逻辑；
- 过期前端 redirect，仅在确认没有当前入口后删除。

验证要求：

- 先构造当前格式 fixture，证明主路径不依赖迁移；
- 搜索本地配置/持久文件读取点；
- 对外部协议路径查阅当前官方合同并更新 `docs/研究先行开发清单.md`；
- 每个领域单独运行系统测试和真实 smoke。

### 阶段 4：重复实现收敛

范围：已有两个以上真实调用方、语义一致的重复逻辑。

候选顺序：

1. IDE smoke 的 server/layout/fixture helper；
2. Model Gateway tool/function-call 解析；
3. IDE layout/terminal layout 持久化状态机；
4. API route 中重复的 context/response/error 处理；
5. 前端页面的 view/search-param/suspense 壳，仅在抽取后明显减少代码时实施。

反目标：

- 不建立万能 `utils.ts`；
- 不把不同协议的输出模型强行合并；
- 不把 File Manager、IDE、Channel Connectors、Model Gateway 做成一个配置驱动大组件；
- 不为了“分文件”增加 pass-through service。

### 阶段 5：热点模块拆责

这一阶段风险最高，必须按领域独立完成。

建议边界：

- Channel daemon：纯解析/签名、平台 supervisor、持久 store、dispatch orchestration；
- Model Gateway service：配置存储、路由选择、用量账本、健康管理；
- File Manager：数据/命令 hook、列表交互、Chrome、dialog orchestration；
- Source Control：status/changes、commit、branch/stash、history/graph；
- Files service：当前 SQLite repository、文件操作、索引任务。

每次只移动一个职责，并要求移动前后测试结果一致。若拆分只增加导出、参数和文件数量，则撤销该拆分。

### 阶段 6：脚本、文档与仓库卫生

- 用 RC/domain matrix 替代重复 npm smoke aliases；
- 提取 smoke 公共 helper 后删除重复 runner；
- 删除只描述已完成历史阶段且没有当前合同价值的 archive 文档；
- 压缩主 IDE 文档中的重复阶段流水账，保留当前架构、风险和验收合同；
- 删除 `chat-history.md` 等非产品历史文件；
- 清理本轮生成的构建/测试临时文件；
- 检查安装包、Web public 和根 assets 的重复资源用途。

## 4. 每批验收模板

每批变更必须记录：

- 范围和明确不触及范围；
- 删除/合并的文件、symbol、依赖或脚本；
- 删除证据；
- 行数、文件数、依赖数或 bundle 的变化；
- 回归测试和构建结果；
- 未测试项与回退条件。

建议输出：

```text
Scope:
Behavior lock:
Removed:
Consolidated:
Metrics before/after:
Verification:
Remaining risk:
```

## 5. 完成审计

Goal 只有在以下证据齐备后才能完成：

1. 分析中的高置信度候选均已删除、合并，或有明确保留理由；
2. 两套 tsconfig 的严格未使用检查为零；
3. 依赖、脚本、文档和资源均完成反向引用审计；
4. 高风险热点至少完成职责评估，实际拆分以净减少复杂度为条件；
5. 全量 typecheck、build、system tests 通过；
6. File Manager、IDE、Model Gateway、Channel Connectors、Platforms 的关键浏览器 smoke 通过；
7. `git diff --check` 通过，且分支仍为 `codex/project-simplification`；
8. 最终报告给出所有剩余风险，不把未验证内容表述为完成。
