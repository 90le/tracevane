# Codex Agent 配置应用能力恢复设计

## 背景与根因

当前运行版本仍保留完整的 Codex CLI 配置生成、预览、备份、写入和回滚实现，但在后续稳定性改动中增加了 `manageCodexCli` 管理边界。该选项默认关闭，并形成三处特殊行为：

- `listAppConnections()` 将 Codex 标记为不可应用；
- `applyAppConnection(...codex...)` 在任何文件写入前返回 409；
- `applyAppConnections()` 从批量应用中排除 Codex。

前端据此把 Codex 显示为“账户直连/保持账户直连”，并从客户端配置统计中排除。该限制是 Tracevane 的产品决策，不是 Codex CLI 的配置能力限制。

OpenAI 当前配置参考确认：用户级配置位于 `~/.codex/config.toml`，`model`、`model_provider` 和 `model_providers` 属于受支持的用户级配置；这些 Provider 字段不能由项目级 `.codex/config.toml` 覆盖。因此 Tracevane 继续只管理用户明确选择应用的用户级配置文件。

## 已确认目标

Codex CLI 恢复为与 Claude Code、OpenCode、OpenClaw 一致的客户端接入对象：

- 支持独立选择路由模型；
- 支持单项应用和重新应用；
- 支持加入批量应用；
- 写入前展示差异并创建备份；
- 支持从备份回滚；
- 不修改 Codex 登录凭据。

本次不增加“账户直连/网关”第二套模式状态，也不建立新的配置管理抽象。

## 采用方案

删除 Codex 的特殊禁用层，复用现有 App Connection 流程。

### 后端

1. 删除 `ModelGatewayServiceOptions.manageCodexCli` 及其默认关闭状态。
2. 删除 Codex 专属不可应用 issue 和 `model_gateway_codex_direct_login_preserved` 409 分支。
3. `applyAppConnections()` 恢复遍历全部四个 App Connection spec。
4. 保留现有 Codex 配置生成器：
   - 合并并保留非 Tracevane 管理的 TOML 内容；
   - 设置所选 `model` 与 `model_provider = "tracevane_gateway"`；
   - 写入 Tracevane Provider block 和模型目录引用；
   - 使用原子写入及现有备份目录。
5. 保留现有回滚接口，由备份逐字节恢复先前的 `config.toml`。

### 前端

1. 删除 Codex 的“账户直连”状态特判。
2. Codex 操作按钮恢复为“应用/重新应用”，启用条件完全使用通用 `canApply`。
3. 应用统计、待处理统计和可写统计重新包含 Codex。
4. 页面说明恢复为四个本地 CLI 客户端统一接入网关的描述。

### 凭据与安全边界

- 应用目标仅为 `~/.codex/config.toml` 和同目录的 `tracevane-gateway-models.json`。
- 不读取、不写入、不删除 `~/.codex/auth.json`，也不改变 Codex 凭据存储设置。
- `config.toml` 已存在时先创建备份；回滚恢复该备份，因此原官方账户直连配置可恢复。
- 继续使用差异确认、敏感值脱敏、管理请求授权、内容大小限制、路径约束和原子写入。

## 未采用方案

### 增加“账户直连/网关”模式开关

这会引入新的持久状态、切换语义和恢复规则，与“Codex 和其他 Agent 一样”的目标冲突。现有“应用 + 回滚”已经覆盖显式接管和恢复。

### 保留隐藏的 `manageCodexCli` 开关并在生产环境开启

隐藏开关使测试环境与生产环境产生两套行为，也容易再次出现 UI 与服务启动参数不一致。删除特殊分支更直接、可验证。

## 测试与验收

采用测试驱动修改，至少覆盖：

1. Codex 在满足通用前置条件时 `canApply=true`。
2. 单项应用写入所选模型、Tracevane Provider 和当前 Gateway endpoint，并产生备份。
3. `auth.json` 在应用前后字节不变。
4. 批量应用结果包含 Codex、Claude Code、OpenCode、OpenClaw。
5. Codex 回滚逐字节恢复原 `config.toml`。
6. Web 合同不再包含“保持账户直连”特殊按钮或 Codex 排除统计。

实现完成后运行：

```powershell
npm run build:api
npm run typecheck:web
node --test --test-name-pattern="Codex.*app connection|app connections.*Codex|bulk apply" tests/system/model-gateway-service.test.mjs
node --test tests/system/web-model-gateway.test.mjs
git diff --check
```

最后重新编译并重启当前 `codex-cross-platform-supervisor` 运行实例，通过客户端接入页面确认 Codex 可选择模型、应用、重新应用和回滚。

## 文档同步

更新 `docs/研究先行开发清单.md` 中 2026-07-12 的旧决策，明确 2026-07-13 用户已授权恢复 Codex CLI 用户级配置管理，同时保留凭据文件不受管理的边界。
