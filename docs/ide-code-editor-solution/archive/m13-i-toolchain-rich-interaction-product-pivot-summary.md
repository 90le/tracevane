# M13-I Toolchain Rich Interaction Acceptance / Product Pivot Summary

## 状态

已完成。M13-I 是 docs-only 产品决策阶段，不新增 runtime provider，不改 LSP/Git/Debug/Terminal 代码。

## 决策结论

Tracevane 已经通过 M13-E Go/gopls 与 M13-H Rust/rust-analyzer 证明：heavy toolchain provider 可以在现有 LSP API、external gateway、trusted config、workspace marker、version probe、root/path guard 和 degraded/empty 语义下安全接入 hover + definition。

因此 M13-I 决定：

1. Go + Rust rich interaction proof 验收通过。
2. Go/Rust guarded rich interaction 模板冻结为未来 provider 的参考实现。
3. 暂停继续扩 clangd / Java hover + definition。
4. 暂停 Go / Rust completion / references / rename / formatting / code action 深化。
5. 将 deeper toolchain rich interactions 放入 parking lot。
6. 下一阶段切换到 **P0 Remote Code Editing Mainline Audit**。

## 为什么暂停 toolchain 横向扩张

继续顺着 Go/Rust/clangd/Java 做 rich interactions 会让项目滑向“浏览器版 VS Code parity”路线，短期不会明显改善用户在远程服务器 / 面板场景中的核心任务：安全打开、浏览、编辑、保存、搜索、查看错误、最小 Git 提交。

当前产品风险更集中在主链路：

- 真实远程项目从打开到提交是否顺手。
- dirty/save/conflict/readonly/large file 是否足够安全。
- Search / Quick Open / Problems / provider status 是否能解释状态。
- Git status/diff/stage/commit 是否足够可靠。
- 不同 provider 的 degraded reason 是否清晰，不静默失败。

这些问题比继续补 clangd/Java hover 或 Go/Rust references 更接近产品可用性。

## 冻结的 provider 模板

未来如果重新启用某个 heavy provider rich interaction，必须满足：

```txt
- 复用现有 /api/lsp/hover、/api/lsp/definition 或已存在 LSP route。
- 不新增第二套 LSP/Files/Search API。
- runtime 只在 API service / external gateway 执行。
- 前端只消费 capability/status/result，不执行 toolchain command。
- 必须有 trusted config。
- 必须有 workspace marker。
- 必须有 bounded version probe。
- 必须有 timeout / payload / path guard。
- 缺配置、缺 marker、缺 binary、unsupported version 或 request failure 必须 degraded/empty。
- CI 使用 mock stdio server 证明 routing/shape/lifecycle。
- 真实 binary 只作为 optional manual evidence。
```

## Parking lot

以下能力不删除，但默认后置：

- clangd hover / definition / references。
- Java JDT LS hover / definition / references。
- Go completion / references / rename / formatting / code actions。
- Rust completion / references / rename / formatting / code actions。
- toolchain installer / download / PATH discovery。
- build-system import/generation UI：Cargo metadata、proc macros、clangd compile DB、Maven/Gradle import。
- provider marketplace。

## 下一阶段

下一阶段进入 [`p0-remote-code-editing-mainline-audit-plan.md`](./p0-remote-code-editing-mainline-audit-plan.md)。

P0 audit 不按功能清单验收，而按真实用户路径验收：

```txt
打开远程项目
→ 浏览文件
→ 搜索文件/文本/符号
→ 查看 Problems / provider status
→ hover / definition 高频路径
→ 编辑文件
→ 保存 / 冲突 / readonly / large file
→ Git diff / stage / commit
→ 终端执行简单命令
```

## 验证

Docs-only 阶段验证：

```bash
git diff --check
markdown relative-link check for touched docs
```
