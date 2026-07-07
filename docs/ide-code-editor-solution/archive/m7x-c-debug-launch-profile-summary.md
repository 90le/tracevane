# M7.x-C Debug Launch Profile / Config Foundation Summary

M7.x-C 已完成 Debug launch profile / config foundation。该阶段目标是在 M7.x-B lifecycle 基础上建立最小、受控、可验证的 launch profile/config 输入边界；不追完整 VS Code `launch.json`，不接真实 Node inspector。

## 已完成

- 新增 `DebugLaunchProfile` 与 `DebugLaunchConfig` 类型。
- `/api/debug/status` 的 `supportedProfiles` 暴露受控 profile metadata：
  - `mock-node`
  - `node-lite`
- Debug status features 新增：
  - `launch-profiles`
  - `launch-config-validation`
  - `launch-args-env-guard`
- `createSession` 支持最小 launch config：
  - `profileId`
  - `cwd`
  - `program`
  - `args`
  - `env`
- 后端 profile allowlist 继续只允许当前受控 profile。
- `mock-node` 禁止 launch args/env。
- `node-lite` 允许有界 args/env：
  - `args` 必须是字符串数组，数量与单项长度受限。
  - `env` 必须是字符串 key/value 对象，key 受 shell-safe 规则限制。
  - session 只保存 `envKeys`，不保存 env values，避免把潜在 secret 写入 UI/store。
- `node-lite` program 继续复用 Files root guard，并按 profile `programExtensions` 限制 JavaScript / TypeScript 源文件。
- Debug session descriptor 增加：
  - `launchProfileId`
  - `launchArgs`
  - `launchEnvKeys`
- Debug View 增加最小 profile 选择、args/env 输入和“启动所选配置”入口。
- Debug View session row 展示 launch args count 与 env keys。
- node-lite adapter proof variables 增加 `args` 与 `envKeys` 证明链路。
- 新增 `smoke:ide:debug-launch-profile`。

## 保留边界

M7.x-C 不做：

- 完整 VS Code `launch.json`。
- 真实 Node inspector adapter。
- remote attach。
- compound debug。
- preLaunchTask。
- continue / pause / step over / step in / step out。
- Watch expressions。
- evaluate。
- Debug Console REPL。
- 多语言 adapter。
- secret env value 持久化。
- 第二套 Debug / Output / Files API。

## 架构边界

- Debug launch config 继续走既有 `/api/debug/sessions` 和 `/ws/debug`，不新增第二套 Debug API。
- Program/cwd 安全继续复用 Files root guard。
- Debug Console 继续复用 Output `debug` channel。
- Debug service 不拥有 Monaco model、Editor lifecycle、Terminal session 或 Git/LSP state。
- 前端 launch profile UI 是最小配置入口，不是完整 launch.json 编辑器。
- env values 只用于后端校验入口，本阶段不会写入长期 store、Output 或 session descriptor。

## 验收命令

- `npm run typecheck:api -- --pretty false`
- `npm run typecheck:web -- --pretty false`
- `npm run smoke:ide:debug-foundation`
- `npm run smoke:ide:debug-breakpoints`
- `npm run smoke:ide:debug-adapter-proof`
- `npm run smoke:ide:debug-lifecycle`
- `npm run smoke:ide:debug-launch-profile`
- `git diff --check`

## 下一步

M7.x-D：Real Node inspector adapter minimal。

建议继续保持小切片：先接一个最小 Node inspector adapter path，复用现有 lifecycle/profile/program guard，并继续把 step/watch/evaluate/remote attach/compound 后置。
