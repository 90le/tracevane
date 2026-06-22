# Model Gateway 综合优化实现计划（P0 前端打磨 + P1/P2 App Connections 版本化/diff/源编辑）

> 日期：2026-06-22 · 分支：在 `main` 上迭代（已合并 frontend-rebuild）
> 范围：Model Gateway 全局 UI/UX/交互/设计优化 + App Connections 应用前 diff、多版本回滚、源文件编辑（高风险写，带备份+确认+回滚）。
> 验证：每阶段 `typecheck:web`/`build:web`（+ `build:api`/`typecheck:api` 后端阶段）+ `python3 scripts/smoke-web-model-gateway.py`（7 view × 桌面/移动）。

## 后端现状（已核验，service.ts）
- `backupFileIfExists(src, backupsRoot, appId)` → 已写**时间戳多版本**备份 `backups/app-connections/${appId}-${stamp}${ext}.bak`。
- `latestAppConnectionBackupPath()` → 仅取最新。`buildAppConnection()` → 产出 connection 视图（preview 仅含拟写内容）。`applyAppConnection()` → build 内容 + 备份 + 写入。`buildAppConnectionContent()` → 生成内容。
- 缺口：未暴露当前磁盘内容；rollback 只用最新；apply 不接受自定义内容；无备份列表端点。

## P1/P2 后端改动（research-first：写操作沿用既有 atomic write + 0600 + 备份先行；不引入新依赖）

### B1 currentContent（应用前 diff 依据）
- `ModelGatewayAppConnectionPreview` 或 connection 增 `currentContent: string | null`（脱敏，读 `target.path`，沿用 preview 同款脱敏；文件不存在为 null）。在 `buildAppConnection` 读取并脱敏。

### B2 备份历史
- 新增 `listAppConnectionBackups(appId)`：读 `backups/app-connections/${appId}-*.bak`，按时间倒序返回 `{ id(文件名), createdAt, size, format }[]`，并能读取某备份内容（脱敏）用于 diff。
- 路由：`GET /api/model-gateway/app-connections/:appId/backups`、`GET /api/model-gateway/app-connections/:appId/backups/:backupId`（返回脱敏内容）。
- 类型：`ModelGatewayAppConnectionBackup`、`...BackupsResponse`、`...BackupContentResponse`。

### B3 按版本回滚
- `rollbackAppConnection` 接受可选 `backupId`；为空=最新（兼容现状）。回滚前同样先备份当前文件（保证回滚可再回滚）。
- 类型：`ModelGatewayRollbackAppConnectionRequest.backupId?`。

### B4 源文件编辑写入（高风险）
- `applyAppConnection` 接受可选 `content`（自定义内容）：提供时跳过 `buildAppConnectionContent`，直接写用户内容；仍走备份先行 + atomic write + 0600；返回 `backupPath`。
- 校验：content 非空、格式与 `target.format`（json/toml）一致（json 尝试 parse，失败拒绝）。
- 类型：`ModelGatewayApplyAppConnectionRequest.content?: string`。
- 安全：仅写既有 `target.path`，不接受任意路径；保留备份；前端强风险确认。

### B5 后端验证
- 扩展 `tests/system/model-gateway-service.test.mjs`：currentContent 返回、backup 列表/内容、按 backupId 回滚、自定义 content apply（含 json 校验失败拒绝、备份先行）。

## P0 前端全局打磨（纯前端，安全）
- `shared/states`：统一 loading 骨架/空态文案/错误重试；新增 `DangerConfirm` 模式（点名目标文件 + 备份/回滚说明）。
- 统一"危险操作"视觉（红色 accent + 图标 + 二次确认），统一写操作成功/失败 toast 文案。
- 未保存更改离开拦截（Provider 配置 / 源编辑）。
- 行内编辑统一保存中/失败/Enter-Esc（Models 别名、账号动作）。
- Overview 顶部"整体健康"摘要锚点 + 快速跳转；Providers 行动作图标+tooltip；Account Pool 冷却倒计时。
- 引入轻量代码查看/diff 组件（无重依赖：用 `<pre>` + 自写行级 diff，或既有 highlight.js 若已在 web 依赖中）。

## P2 前端：App Connections 增强
- **代码查看器**：preview/当前内容/备份内容用等宽+语法着色（json/toml）呈现。
- **应用前 diff**：当前内容(B1) ↔ 拟写入 `preview.content`，行级高亮；apply 确认弹层内置 diff。
- **源文件编辑**：diff 视图右侧可切到编辑模式，编辑拟写入内容 → 保存=apply `{content}`（B4）；保存前强风险确认（点名文件、说明会备份且可回滚）。
- **多版本回滚**：connection 详情列出备份历史(B2)，选定版本 → 回滚前 diff（当前 ↔ 该版本，B2 内容）→ 确认 → rollback `{backupId}`(B3)；结果显示 `restoredFrom`/`backupPath`。
- 所有写操作统一证据：targetPath、backupPath、restoredFrom、失败回退提示。

## 执行顺序（subagent-driven，阶段报进度）
1. **B1-B5 后端**（先行，前端依赖）：类型 + service + routes + 测试。
2. **数据层**：apps/web 端点封装 + hooks（backups 列表/内容、rollback backupId、apply content）。
3. **P0 前端打磨**（与 2 可并行）。
4. **P2 App Connections**：代码查看器 → 应用前 diff → 多版本回滚 → 源编辑。
5. **验证**：typecheck/build（api+web）、后端系统测试、浏览器 smoke、新增 App Connections diff/版本/编辑的 smoke 场景。

## 风险与边界
- 源编辑只允许写既有 `target.path`，json 格式校验，备份先行，可回滚；UI 强风险确认。
- 不引入重型编辑器/ diff 库（保持包体；用轻量自写或既有依赖）。
- 备份保留：暂不自动清理（沿用现状累积）；如需保留策略后续单列。
