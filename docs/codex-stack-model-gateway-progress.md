# Studio Gateway 迁移进度

> 状态：Phase C completed
> 更新：2026-06-04
> 文档规则：只保留当前状态、验证、下一步；过期细节直接替换。

## 当前状态

- Studio Gateway 是后续唯一正式模型中转目标。
- Codex Stack / CPA / Compact 旧功能面已停止演进。
- 新 UI / API 需要重新以 Studio Gateway、Provider Center、App Connections、Runtime、Diagnostics 命名建设。

## 本轮完成

- 删除旧后端：`apps/api/modules/codex-stack/**` 和 `/api/codex-stack/*` 注册入口。
- 删除旧前端：`apps/web-vue/src/features/codex-stack/**`、`CodexStackView.vue`、导航和首页入口。
- 删除旧资源：`resources/codex-stack/**`。
- 删除旧测试/设计保护面：`codex-stack-*`、`studio-web-codex-stack-*`、旧 release/design/page-density 合约测试。
- 刷新 `studio-domain-inventory.json`，基线不再包含 `/codex-stack`、`codex-stack` API module 或 web feature。
- 保留并验证 Studio Gateway daemon/service contract；修复 systemd service template 的 `WorkingDirectory` 引号问题。

## 验证

- 通过：`node --test --test-reporter=dot tests/system/studio-web-shell-route-manifest.test.mjs tests/system/studio-domain-inventory.test.mjs tests/system/model-gateway-service.test.mjs`
- 通过：`npm run build:api`
- 通过：`npm run typecheck:web`
- 通过：`npm run build:web`
- 未全绿：`npm run test:system` 仍有 9 个非本轮相关旧 UI 形态断言失败，集中在 Agents / Channels / Chat / Config 测试。

## 下一步

1. 新建 Studio Gateway 管理入口和 API 命名，不复用旧 Codex Stack 代码。
2. 补 Studio Gateway 协议矩阵测试：Chat Completions、Responses、Anthropic Messages、streaming、compact、tool/history。
3. 新建 App Connections：Codex、Claude Code、OpenCode、OpenClaw、CC / cc-connect 的 preview / apply / rollback。
4. 处理剩余非相关旧 UI 测试，决定删除还是按当前页面真实结构重建。
