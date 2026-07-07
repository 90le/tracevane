# M8-C RC quick gate execution and blocker triage summary

## 状态

已完成：M8-C RC smoke matrix execution and blocker triage 的 quick gate 收口。

本阶段目标不是新增 IDE 功能，而是让 M8-B 引入的 RC runner 能在本地稳定执行 quick gate，并把执行中暴露的 blocker 固化为 runner / smoke 基础设施修复。

## 本次完成

- 执行 `npm run ide:rc:quick`，覆盖：
  - `typecheck:api -- --pretty false`
  - `typecheck:web -- --pretty false`
  - `smoke:ide:workbench-layout`
  - `smoke:ide:editor-foundation`
  - `smoke:ide:terminal-foundation`
  - `smoke:ide:search-foundation`
  - `smoke:ide:problems-output`
  - `smoke:ide:lsp-diagnostics`
  - `smoke:ide:git-status`
  - `smoke:ide:debug-foundation`
  - `git diff --check`
- 修复 RC runner 端口污染：
  - `scripts/ide-rc-matrix.mjs` 默认把 smoke 运行在 `TRACEVANE_RC_WEB_PORT` / `TRACEVANE_WEB_PORT` / `5310`，避免开发者本地 `5176` dev server 被误当作验收 server。
  - 对 with_server 型 smoke 同步注入 `TRACEVANE_WEB_SMOKE_URL`，避免脚本内部仍访问默认 `5176`。
  - 对自启动 debug smoke 只注入 `TRACEVANE_WEB_PORT`，保留其自启动 server 行为。
- 修复 smoke Vite 稳定性：
  - `scripts/dev-web-smoke.sh` 使用按端口隔离的 `TRACEVANE_VITE_CACHE_DIR`，避免连续 matrix run 复用/污染同一个 optimized-deps cache。
  - smoke server 默认开启 `TRACEVANE_SMOKE_DISABLE_WATCH=1`，禁用 HMR/watch 重启；RC smoke 不依赖 HMR。
  - `apps/web/vite.config.ts` 支持 `TRACEVANE_VITE_CACHE_DIR` 和 smoke disable watch。
- 修复 smoke artifacts 污染：
  - RC runner 在每个命令前后清理失败运行残留的 `git-*-smoke-*.txt` / `tracevane-terminal-focus-*.ts`。
  - `.gitignore` 忽略本地 `tmp/` smoke cache。

## 本次没有做

- 没有扩展 IDE 产品能力。
- 没有调整 Files / Git / LSP / Debug / Terminal 的业务 API。
- 没有执行 full RC matrix。
- 没有新增 CI workflow；本阶段仍是本地 runner 稳定化。
- 没有改变 Git push / pull / checkout / merge / rebase / stash 等后置产品边界。

## 验证

- `node --check scripts/ide-rc-matrix.mjs`
- `bash -n scripts/dev-web-smoke.sh`
- `npx tsc -p apps/web/tsconfig.json --noEmit --pretty false`
- `TRACEVANE_WEB_PORT=5310 TRACEVANE_WEB_SMOKE_URL=http://127.0.0.1:5310 npm run smoke:ide:git-status`
- `TRACEVANE_WEB_PORT=5310 TRACEVANE_WEB_SMOKE_URL=http://127.0.0.1:5310 npm run smoke:ide:terminal-foundation`
- `npm run ide:rc:quick`
- `git diff --check`

## 下一步

M8-D：执行 full/domain RC matrix，并按域分级 triage 剩余 release blockers。优先使用：

- `npm run ide:rc:full -- --continue-on-error`
- `node scripts/ide-rc-matrix.mjs --domain=<fileSurface|workbenchEditor|terminal|searchProblemsOutput|lsp|git|debug> --continue-on-error`

M8-D 仍然是稳定化与验收，不应新增大功能。
