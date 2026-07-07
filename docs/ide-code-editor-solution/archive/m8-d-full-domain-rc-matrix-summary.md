# M8-D full/domain RC matrix execution and blocker triage summary

## 状态

已完成：M8-D 执行并稳定 IDE full/domain RC matrix 的本地验收路径。

本阶段仍然是 release-candidate 稳定化与验证基础设施收口，不新增 IDE 产品功能，不新增 Files / Terminal / LSP / Git / Debug API。

下一步进入 **M8-E：RC acceptance baseline and CI gate decision**。

## 本次完成

### 1. Domain matrix 执行与 blocker triage

本轮按域验证并收口：

- `fileSurface` domain：通过。
- `workbenchEditor` domain：通过。
- `terminal` domain：通过。
- `searchProblemsOutput` domain：通过。
- `lsp` domain：通过。
- `git` domain：通过。
- `debug` domain：通过。
- `ide:rc:quick`：通过。

### 2. RC runner 端口与脚本隔离

`./scripts/ide-rc-matrix.mjs` 继续保持 quick/full/domain runner 作为 M8 验收入口，并补齐这些稳定性边界：

- 对声明了自身端口的 smoke 脚本不再强行注入统一 `TRACEVANE_WEB_PORT=5310`，避免破坏 LSP external-api 与 Git branch/stash 等自管理端口脚本。
- 对常规 with_server smoke 继续统一注入 `TRACEVANE_WEB_PORT` / `TRACEVANE_WEB_SMOKE_URL`，避免误连开发者本地 `5176`。
- 增加单命令超时与进程组清理，避免单个 smoke 无限挂起后污染后续矩阵。

### 3. External API smoke 日志背压与残留进程修复

`./scripts/dev-web-smoke-external-api.sh` 现在把 standalone API 和 Web smoke server 都放入独立进程组，并将 API/Web 日志写入 `tmp/tracevane-external-*.log`：

- 避免 Python `with_server.py` 对 server stdout/stderr 使用 PIPE 但不持续消费时，被 noisy API 日志填满管道导致卡死。
- cleanup 同时终止 API 与 Web 进程组，避免 quick/domain 间留下旧 API/Vite 进程。
- readiness 失败时只输出对应 API 日志尾部，保留可诊断性但不污染正常 smoke 输出。

### 4. Smoke 脚本稳定性修复

- LSP 与 Git branch/stash smoke 的 API helper 对启动期 network / 5xx 做有限重试；4xx 业务控制流错误不重试。
- Terminal smokes 更新过期 Debug Console selector。
- Terminal durable backend smoke 区分首次 create 与重启 resume，避免误复用旧 session。
- File Manager smoke scripts 使用 `TRACEVANE_WEB_PORT` fallback，不再固定占用 `5176`。

## 本次没有做

- 没有新增 IDE runtime feature。
- 没有新增或分叉 Files / Terminal / LSP / Git / Debug API。
- 没有改变产品阶段边界：M8 仍然是稳定化与 release-candidate 验收，不是功能扩张阶段。
- 没有把 quick/full matrix 接入 CI；这留给 M8-E 决策。
- 没有处理 post-M8 的 force push、merge/rebase、Git graph/blame、多语言 LSP 全量 parity 或完整 VS Code Debug parity。

## 验证

本阶段执行并通过：

```bash
node --check scripts/ide-rc-matrix.mjs
bash -n scripts/dev-web-smoke-external-api.sh
node --check tests/ide-workbench/ide-lsp-diagnostics.smoke.mjs
node --check tests/ide-workbench/ide-lsp-interaction.smoke.mjs
node --check tests/ide-workbench/ide-lsp-typescript-diagnostics.smoke.mjs
node --check tests/ide-workbench/ide-lsp-typescript-interaction.smoke.mjs
node --check tests/ide-workbench/ide-lsp-typescript-completion.smoke.mjs
node --check tests/ide-workbench/ide-lsp-typescript-references.smoke.mjs
node --check tests/ide-workbench/ide-lsp-workspace-edit-foundation.smoke.mjs
node --check tests/ide-workbench/ide-lsp-rename-format-code-actions.smoke.mjs
node scripts/ide-rc-matrix.mjs --domain=fileSurface --continue-on-error
node scripts/ide-rc-matrix.mjs --domain=terminal --continue-on-error
node scripts/ide-rc-matrix.mjs --domain=lsp --continue-on-error
node scripts/ide-rc-matrix.mjs --domain=git --continue-on-error
node scripts/ide-rc-matrix.mjs --domain=workbenchEditor --continue-on-error
node scripts/ide-rc-matrix.mjs --domain=searchProblemsOutput --continue-on-error
node scripts/ide-rc-matrix.mjs --domain=debug --continue-on-error
npm run ide:rc:quick
git diff --check
```

> LSP domain 仍然较慢，因为 external-api smoke 会按脚本隔离启动 API/Web。M8-E 可决定是否将 quick gate 纳入 CI，并把 full/domain matrix 保留为 nightly/manual RC gate。

## M8-E 入口

M8-E 建议只做 release-candidate acceptance baseline 与 CI gate 决策：

1. 固化 quick gate 为 PR/阶段收口标准。
2. 决定是否把 `npm run ide:rc:quick` 接入 CI。
3. 定义 full/domain matrix 的运行频率（manual / nightly / release branch）。
4. 汇总仍后置的 post-M8 功能，不在 RC 收口阶段继续横向扩功能。
