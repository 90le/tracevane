# M12-C Vue External Provider Guarded Diagnostics Proof Summary

## 状态

已完成。M12-C 将 Vue 作为第一个 framework external provider proof 接入现有 LSP external provider gateway，但只承诺 diagnostics/status 路径，不扩展到 Volar 的完整交互能力。

## 本阶段完成

- 新增 `@vue/language-server@3.3.6` exact-pinned bundled npm dependency。
- 在 provider registry 中新增 `vue` provider：
  - mode: `external`
  - languages: `vue`
  - capabilities: `diagnostics` only
  - source: `@vue/language-server`
- 在 external provider profiles 中新增 server-side allowlisted Vue profile：
  - command 固定为 `process.execPath`
  - bin 通过 `require.resolve("@vue/language-server/bin/vue-language-server.js")`
  - args 固定为 `--stdio`
  - frontend 不能传 command / args / env / cwd。
- 在 provider metadata/status 中记录 package、version、pin、license、install status、audit/policy notes。
- `normalizeLanguage` 支持 `.vue` 与 `language: "vue"`。
- `diagnoseDocument` 可以把 Vue 文件路由到 external Vue provider，返回标准 Tracevane diagnostics response shape。
- external gateway 增加 Vue 专用 `tsserver/request` null response bridge，避免 M12-C 未托管 TypeScript plugin bridge 时 Vue LS diagnostics request 长时间悬挂；完整 TS plugin / Volar rich interaction bridge 后置。
- 新增 `test:system:lsp-vue-provider`，覆盖 Vue profile lifecycle、installed/pinned metadata、provider matrix 与 diagnostics route contract。

## 明确未做

- 不接入 Svelte；`svelte-language-server@0.18.3` 的 TypeScript peer range 与当前项目 TypeScript pin 不匹配，需后续单独评估。
- 不接入 Go / Rust / Java / C / C++ heavy toolchain providers。
- 不启用 Vue hover / completion / definition / references / semantic tokens / formatting / code action。
- 不托管完整 Volar TypeScript plugin bridge。
- 不替换现有 TypeScript / JavaScript in-process provider。
- 不新增第二套 LSP / Files / Search API。
- 不启用 auto install、system binary discovery、npx 或用户自定义 provider command/env/runtime/cwd/options。

## 验证

- `npm run test:system:lsp-vue-provider`

补充完整验证由 M12-C 提交报告记录，包括 API typecheck、provider hygiene、IDE provider status smoke 与 `git diff --check`。

## 下一步建议

M12-D：Svelte dependency compatibility / TypeScript peer policy plan。先评估 TypeScript 升级影响、隔离安装策略或延后接入策略，再决定是否做 Svelte guarded implementation。
