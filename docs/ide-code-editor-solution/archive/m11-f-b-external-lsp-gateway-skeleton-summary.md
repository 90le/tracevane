# M11-F-B External LSP Gateway Skeleton Guarded Implementation Summary

## 状态

已完成。M11-F-B 将 M11-F-A 的 external language server gateway 研究计划落成内部受控骨架：只建立进程网关、stdio LSP framing、profile/status、cwd guard 和 mock harness，不把任何真实 heavy provider 作为已完成能力。

## 本阶段完成

- 新增 `apps/api/modules/lsp/external/` 内部模块：
  - `externalLanguageServerTypes.ts`：external server profile、status、budget、JSON-RPC/LSP message 类型。
  - `lspMessageFraming.ts`：`Content-Length` stdio LSP message encode/parser，支持 chunked 和连续 message。
  - `externalProviderProfiles.ts`：默认 budget、空 external profile allowlist、workspace root/cwd guard。
  - `lspStdioTransport.ts`：后端 stdio transport，只负责 spawn、send、parse、exit/error 回调。
  - `externalLanguageServerGateway.ts`：start/request/notify/stop/status、initialize handshake、request timeout、diagnostics notification cache、crash/degraded/stopped 状态。
  - `index.ts`：内部导出入口。
- 新增 `tests/fixtures/lsp-mock-server.mjs` 作为 test-only mock language server。
- 新增 `tests/system/lsp-external-gateway.test.mjs` 和 `npm run test:system:lsp-external-gateway`：验证 framing、mock initialize/request、diagnostics notification、request timeout、crash status、cwd escape rejection。
- 现有 `/api/lsp/*` 与 `/ws/lsp` contract 未改变；JSON/TS/JS/HTML/CSS in-process provider 行为不迁移、不替换。

## 安全边界

- 前端不能传 arbitrary command。M11-F-B 的 external profiles 是 server-side allowlist；当前默认空列表。
- external server cwd 必须解析到 workspace root 内部，越界直接拒绝。
- stdout 使用 LSP `Content-Length` framing；不把完整输出长期持久化到 React/localStorage。
- timeout/crash 只把 provider 标记 degraded/crashed；不静默承诺 fallback 已完成。
- Gateway 是 internal module，不新增第二套公开 LSP API。

## 明确未做

- 未接入 pyright、yaml-language-server、gopls、rust-analyzer、Java、Vue、Svelte 或任何真实 external provider。
- 未自动安装 language server 依赖。
- 未做全语言支持、多语言 workspace symbols、remote schema fetching 或 schema association UI。
- 未让 WorkspaceEdit 自动写文件；仍必须走既有 preview/apply、dirty/conflict、root guard。
- 未做 Git force/merge/rebase、Debug parity、Terminal 新能力或 File Manager Online Editor 产品壳变更。

## 验证

- `npm run typecheck:api -- --pretty false`
- `npm run test:system:lsp-external-gateway`
- `git diff --check`

## 下一步

M11-F-C：first real external language server provider proof。建议选择一个低风险 provider 做 proof，例如 YAML 或 Python 之一，但必须先确认依赖、license、binary availability、workspace root/cwd/env guard、timeout、stderr budget 和 provider status UI，不允许一次性承诺“全语言支持”。
