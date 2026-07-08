# M13-E Go / gopls Hover + Definition Guarded Implementation Summary

## 状态

M13-E 已完成：Go / gopls hover + definition guarded implementation。

本阶段把 M13-D 的计划落到现有 LSP service：Go provider 在通过 trusted toolchain config、`go.work` / `go.mod` marker、bounded `gopls version` probe 与 Files root/path guard 后，复用 existing external language server gateway 请求 `textDocument/hover` 与 `textDocument/definition`。缺配置、缺 marker、缺 binary、unsupported version 或 request failure 时返回 empty response，不拖垮 IDE。

## 完成内容

```txt
- Go provider registry capability 增加 hover / definition。
- /api/lsp/hover 的 Go branch 复用 hoverWithGoGopls。
- /api/lsp/definition 的 Go branch 复用 defineWithGoGopls，并在 service 层过滤 workspace 外 definition location。
- Go gopls helper 抽出 guarded session：trusted config、workspace marker、version probe、external gateway start/didOpen/request/stop。
- external LSP initialize capability 明确声明 hover / definition。
- mock stdio LSP fixture 增加 hoverProvider / definitionProvider 与 mock response。
- system test 覆盖 no trusted config empty response、mock stdio diagnostics、mock hover、mock definition。
```

## Guard 语义

```txt
- 不配置 / 不信任：不启动 gopls，hover/definition 返回 empty。
- 无 go.work / go.mod marker：不启动 gopls，返回 empty。
- gopls binary 缺失或 version probe 失败：返回 empty/degraded，不抛未捕获错误。
- definition location 必须再经过 workspace root guard；逃逸 workspace 的 location 会被丢弃。
- 真实 gopls 仍为 optional manual evidence，CI 通过 mock stdio proof 验证 routing/shape/lifecycle。
```

## 明确没有做

```txt
- Go completion / references / rename / formatting / codeAction。
- Rust / clangd / Java rich interactions。
- gopls installation / download / PATH discovery / auto-write config。
- GOPATH fallback、go env/go list/module download UX。
- 新 UI、新 command palette action、第二套 LSP/Files/Search API。
```

## 验证

```bash
npm run typecheck:api -- --pretty false
npm run test:system:lsp-go-gopls-provider
```

后续收口时还应运行 web typecheck、Provider Status smoke 与 markdown link/diff checks。

## 下一步

建议进入 M13-F Toolchain rich interaction acceptance closeout：冻结 Go/gopls rich proof 完成口径，决定下一个 rich provider 是 Rust、clangd、Java，还是先做 rich interaction degraded/status UX hardening。
