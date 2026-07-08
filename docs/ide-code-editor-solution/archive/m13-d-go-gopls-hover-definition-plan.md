# M13-D Go / gopls Hover + Definition Guarded Proof Plan

## 状态

M13-D 已完成：Go / gopls Hover + Definition Guarded Proof Plan。

这是 docs-only implementation plan。它承接 M13-C 的单 provider rich interaction decision，把 Go / gopls hover + definition proof 收敛成后续实现阶段可执行、可验证、可回滚的最小切片。本阶段不改 runtime，不启动 `gopls`，不修改 `/api/lsp/hover` 或 `/api/lsp/definition` 行为。

## 目标

后续实现阶段的最小目标：

```txt
已通过 M12-K Go diagnostics guard 的 workspace
→ 对 .go 文件复用现有 IDE hover / definition pipeline
→ 通过 existing external language server gateway 与 gopls stdio session 请求 hover / definition
→ 返回现有 LSP response shape
→ 缺配置 / 未信任 / 缺 marker / 缺 binary / unsupported version / timeout 时 degraded，不拖垮 IDE
```

## 必须复用

```txt
- apps/api/modules/lsp/routes.ts 的 /api/lsp/hover 与 /api/lsp/definition。
- apps/api/modules/lsp/service.ts 的现有 hoverDocument / definition routing contract。
- M12-K Go / gopls diagnostics proof 的 workspace marker、trusted config、version/binary guard、degraded skip 口径。
- apps/api/modules/lsp/toolchain/toolchainProviderStatus.ts 的 Go provider config/trust/status/setup guidance。
- existing external language server gateway / stdio session lifecycle。
- Files root/path guard 与 rootId + relative path 语义。
- apps/web/src/features/ide-workbench/lsp/monacoLspProviders.ts 的 Monaco hover / definition provider registration。
- Problems/Output/status surfaces 只用于 degraded evidence，不新建 Go 专属 UI。
```

不得新增第二套 LSP、Files 或 Search API。Dockview/Monaco shell 不拥有 gopls runtime；后端 LSP service 才拥有 provider routing 和 guard。

## 推荐实现切片

### M13-E：Go / gopls Hover + Definition Guarded Implementation

建议 M13-E 才开始代码实现，范围仅限：

```txt
- 在 LSP service routing 中为 language="go" 的 hover / definition 增加 Go provider branch。
- 复用 M12-K 的 Go marker detection：go.work 优先，其次 nearest go.mod；不做 GOPATH fallback。
- 复用 trusted OpenClaw config gate：enabled=true、trusted=true、profileId=workspace。
- 继续拒绝 command / args / env / cwd runtime override。
- 复用 bounded binary/version probe：缺 binary 或 unsupported version 返回 degraded/empty feature response。
- 通过 external language server gateway 初始化 gopls session。
- 对当前 .go document 执行 textDocument/hover 与 textDocument/definition。
- 将 hover markdown/plain text 与 definition locations 映射到现有 response shape。
- 增加 mock stdio LSP proof，不要求 CI 安装真实 gopls。
```

### M13-E 不做

```txt
- Go completion、references、rename、formatting、codeAction。
- Go workspace-wide indexing UX、GOPATH fallback、module download UI、go env/go list management。
- gopls installation/download/PATH discovery/auto-write config。
- Rust/clangd/Java rich interactions。
- 新 UI 面板、新 command palette action、第二套 API。
```

## Guard / degraded 状态矩阵

| 状态                     | 条件                                      | hover/definition 行为                                  | 用户可见证据                                    |
| ------------------------ | ----------------------------------------- | ------------------------------------------------------ | ----------------------------------------------- |
| `notConfigured`          | Go toolchain provider 未 enabled          | 返回 empty hover/definition，不启动 gopls              | Provider Status setup guidance 指向 config hint |
| `disabledByTrust`        | enabled 但 trusted=false                  | 返回 empty，不启动                                     | Provider Status 显示 trust degraded reason      |
| `missingWorkspaceConfig` | 无 go.work/go.mod 或 profileId 缺失       | 返回 empty，不启动                                     | Output/Status 记录 missing marker/profile       |
| `missingBinary`          | allowlisted gopls binary 无法执行         | 返回 empty，不拖垮请求                                 | bounded stderr/status summary                   |
| `unsupportedVersion`     | version probe 不满足 proof policy         | 返回 empty                                             | status/degraded reason                          |
| `unavailable`            | initialize/request timeout/protocol error | 返回 empty 或 request-level degraded error（不得白屏） | bounded stderr tail + Output note               |
| `configured`             | 所有 gate 通过                            | 请求 hover/definition                                  | 现有 Monaco hover/definition UI 展示结果        |

## Runtime budget

后续实现必须设置：

```txt
- binary/version probe timeout。
- initialize timeout。
- hover/definition request timeout。
- stderr/stdout tail byte limit。
- max open document/session lifetime。
- per root/session cleanup。
```

建议先复用 M12-K diagnostics proof 的 session lifecycle；若 M12-K 当前为 one-shot diagnostics，会话复用策略应保持保守：每次 feature request 可以短会话 proof，后续再优化为 workspace-scoped pooled session。

## 测试计划

### System test

新增或扩展：

```txt
npm run test:system:lsp-go-gopls-provider
```

覆盖：

```txt
- no trusted config：hover/definition 不启动，返回 empty/degraded。
- missing go.work/go.mod：不启动，返回 empty/degraded。
- forbidden runtime override：继续拒绝 command/args/env/cwd。
- missing binary：bounded degraded，不抛未捕获错误。
- mock stdio gopls hover：返回 hover contents。
- mock stdio gopls definition：返回 root-guarded location。
- definition location 逃逸 workspace：必须丢弃或 degraded。
```

### IDE smoke

新增建议：

```txt
npm run smoke:ide:lsp-go-gopls-interaction
```

覆盖：

```txt
- 打开 .go 文件后 Monaco hover provider 不报错。
- mock/fixture 模式下 hover 可见。
- definition 跳转使用现有 IDE editor open/reveal path。
- 无真实 gopls 时显示/记录 degraded，而不是白屏或阻塞其它 LSP provider。
```

真实 gopls 仍作为 optional manual evidence；主线 CI 不应因本机缺 Go/gopls 失败。

## 文档和验收

实现阶段完成后需要更新：

```txt
- .codex/project-context.md
- docs/ide-code-editor-solution/00-README.md
- docs/ide-code-editor-solution/07-终端运行语言服务Git方案.md
- docs/ide-code-editor-solution/08-实施阶段验收与风险.md
- archive/m13-e-go-gopls-hover-definition-summary.md
```

## M13-D 明确不做

```txt
- 不实现 runtime。
- 不启动 gopls。
- 不修改 API 行为。
- 不新增 tests/smoke 脚本。
- 不做 installer/discovery。
- 不做 Rust/clangd/Java rich interactions。
```

## 下一步

进入：

```txt
M13-E Go / gopls Hover + Definition Guarded Implementation
```

M13-E 应优先从后端 system test + mock stdio proof 开始，再接 IDE smoke；如果发现 M12-K diagnostics helper 不适合复用，应先抽小的 Go provider interaction helper，不能复制一套独立 gopls runtime。

## 验证

M13-D 为 docs-only plan：

```bash
git diff --check
临时 markdown relative-link check for touched docs
```
