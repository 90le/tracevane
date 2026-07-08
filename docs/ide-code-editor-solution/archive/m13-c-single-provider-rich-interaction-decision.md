# M13-C Single Provider Rich Interaction Proof Decision

## 状态

M13-C 已完成：Single Provider Rich Interaction Proof Decision。

这是 docs-only decision stage。它承接 M12-U 的 Go / Rust / clangd / Java guarded diagnostics proof、M13-A 的 post-diagnostics roadmap 和 M13-B 的 Provider Status / setup guidance UX，不直接实现新的 rich LSP runtime。

## 决策

M13-C 选择 **Go / gopls hover + definition proof** 作为下一段实现优先级。

推荐下一阶段：

```txt
M13-D Go / gopls Hover + Definition Guarded Proof Plan
```

M13-D 仍应先做具体实现计划，随后再进入 guarded implementation；不要直接一次性拉入 completion、references、rename、formatting 或 codeAction。

## 为什么选择 Go / gopls

1. **风险最低**：Go / gopls 已在 M12-K 完成 guarded diagnostics proof，已有 workspace marker、toolchain status/config/trust gate、version probe 与 degraded skip 模式。
2. **能力明确**：gopls 官方能力覆盖 diagnostics、hover、definition、completion、references、rename、formatting、code action 等，hover + definition 是最小 rich interaction 切片。
3. **副作用较少**：相比 Rust proc macro/build script、clangd compile database、JDT LS import/indexing，Go hover/definition 的副作用面更小，适合作为第一个 toolchain-backed rich interaction proof。
4. **复用路径清晰**：可复用现有 external language server gateway、Files root/path guard、toolchain provider status/config/trust gate、Problems/Output degraded reporting 和 IDE editor LSP interaction command pipeline。

## M13-D 建议边界

M13-D Go / gopls Hover + Definition Guarded Proof Plan 应明确：

```txt
- 请求入口：复用现有 IDE editor hover/definition pipeline 和 LSP service，不新增第二套 API。
- Provider gate：必须通过 Go toolchain provider configured/trusted/profileId=workspace。
- Workspace marker：仅在 go.work 或 go.mod marker 存在时允许 runtime proof。
- Root/path guard：所有 file path / cwd 必须受 Files root guard 约束。
- Version/binary guard：继续使用 bounded version probe；缺 binary 或 unsupported version degraded，不失败整 IDE。
- Runtime budget：hover/definition request 必须有 timeout、stderr tail limit 和 graceful shutdown/reuse 策略。
- Degraded reason：notConfigured / disabledByTrust / missingWorkspaceConfig / missingBinary / unsupportedVersion / unavailable / timeout 均需有用户可解释状态。
- Smoke：可在无本机 gopls 时通过 mock stdio proof 验证 request/response/routing/degraded behavior；真实 gopls 只作为 optional manual evidence。
```

## 暂缓项

M13-C 明确不选择以下作为下一步实现：

```txt
- Go completion / references / rename / formatting / codeAction。
- Rust rich interactions：需先处理 proc macro/build script trust、Cargo metadata budget 和 project config override 风险。
- clangd rich interactions：需先明确 compile database / .clangd UX 和 query-driver 风险。
- Java rich interactions：需先明确 Java 21+、JDT LS launcher/config、workspace -data、Maven/Gradle import 与 indexing 状态。
- Toolchain install/download/PATH discovery/auto-write config。
- 第二套 LSP/Files/Search API。
- Git/Debug/Terminal 新能力。
- File Manager Online Editor 产品壳变更。
```

## M13-C 不做

```txt
- 不实现 Go hover/definition runtime。
- 不启动新的 language server。
- 不修改 `/api/lsp/hover` / `/api/lsp/definition` 行为。
- 不新增 provider installer。
- 不新增 UI 控件或命令。
```

## 下一步

进入：

```txt
M13-D Go / gopls Hover + Definition Guarded Proof Plan
```

M13-D 的目标是把上述决策转成实现前计划与验收标准；M13-E 或后续实现阶段再落地 guarded runtime proof。

## 验证

M13-C 为 docs-only decision：

```bash
git diff --check
临时 markdown relative-link check for touched docs
```
