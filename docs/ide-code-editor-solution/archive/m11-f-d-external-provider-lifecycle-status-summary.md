# M11-F-D External Provider Lifecycle / Status Hardening Summary

## 状态

已完成。M11-F-D 在 M11-F-B gateway skeleton 与 M11-F-C YAML real provider proof 的基础上，补齐 external language server provider 的 lifecycle/status 可观测性与验收口径。

## 本阶段完成

- 扩展 `ExternalLanguageServerState`：增加 `lastTransitionAt`、`lastError` 与 `stderrTail`，用于记录 provider 状态变化、最近错误和受限 stderr 尾部。
- `ExternalLanguageServerGateway` 保留 stopped/crashed/degraded 后的 last known status，`getStatus()` / `listStatuses()` 返回克隆快照，避免外部调用方修改内部状态。
- `LspStdioTransport` 捕获 stderr chunk；gateway 只保留尾部少量行，不长期保存完整敏感输出。
- request timeout、server response error、transport error、crash、stop 都统一进入受控 transition，并清理/reject pending request。
- crashed/stopped provider 不再允许继续发送 request；`stop()` 可安全收口 crashed provider 并保留 stopped 状态。
- `LspService.getStatus()` 增加 `externalProviders` 概览：暴露 server-side allowlisted profiles 与当前 status 快照，仍复用现有 `/api/lsp/status`，不新增第二套 status API。
- 扩展 system tests 覆盖 crash status、exitCode、lastError、stderr tail、停止后状态保留、status clone、service status external provider 概览。

## 安全边界

- external provider command/args 仍由后端 allowlist profile 控制；前端不能传 arbitrary command。
- 仍只接入 YAML diagnostics proof；没有新增 pyright、gopls、rust-analyzer 或其它 heavy provider。
- stderr 只保留有限 tail，避免把完整 provider 输出长期保存在内存/持久层。
- root/cwd guard、request timeout、shutdown timeout 继续沿用 M11-F-B/M11-F-C 的边界。
- `/api/lsp/status` 只是 status 扩展，不改变 `/api/lsp/diagnostics`、`/ws/lsp` 和 Problems/Output contract。

## 明确未做

- 未实现 provider pool、长驻 session manager、自动 restart/backoff、provider 安装器或版本管理 UI。
- 未实现 IDE 侧 provider status 面板、toast、设置页或 command palette 管理入口。
- 未接入第二个真实 external provider。
- 未实现 YAML hover/completion/formatting/code actions。
- 未做 Git force/merge/rebase、Debug parity、Terminal 新能力或 File Manager Online Editor 产品壳变更。

## 验证

- `npm run typecheck:api -- --pretty false`
- `npm run test:system:lsp-external-gateway`
- `npm run test:system:lsp-yaml-provider`
- `git diff --check`

## 下一步

M11-G：external provider expansion and IDE status UI plan。建议先规划 provider expansion 顺序（例如 Python/YAML capabilities/Go/Rust 选择标准）、IDE status UI/command palette 暴露方式、provider install/version 策略和 smoke matrix，再接入第二个 real external provider。
