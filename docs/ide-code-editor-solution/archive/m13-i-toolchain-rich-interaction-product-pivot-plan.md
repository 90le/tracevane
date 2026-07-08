# M13-I Toolchain Rich Interaction Acceptance / Product Pivot Plan

## 状态

计划阶段。M13-I 的目标不是继续默认扩展 clangd/Java/Go/Rust rich interactions，而是验收 M13-E Go/gopls 与 M13-H Rust/rust-analyzer 的 guarded hover + definition proof，并决定是否暂停 toolchain 横向扩张，把下一阶段切回远程改代码主链路。

## 背景

M12/M13 已经证明 Tracevane 具备较强的 toolchain-backed provider 能力：

- Go / gopls diagnostics、hover、definition。
- Rust / rust-analyzer diagnostics、hover、definition。
- clangd diagnostics proof。
- Java JDT LS diagnostics proof。
- provider status / trust / allowlist / root guard / degraded reason。

这证明工程能力已经足够，但也暴露出产品风险：如果继续顺着 provider 能力横向扩张，Tracevane 会滑向“浏览器版 VS Code parity”，而不是打穿“远程项目在线改代码”主链路。

## M13-I 要回答的问题

1. Go + Rust guarded hover/definition proof 是否稳定，能否作为 future provider 模板冻结。
2. 是否继续推进 clangd / Java hover + definition。
3. 是否继续推进 Go / Rust completion / references / rename / formatting / codeAction。
4. 是否暂停 toolchain rich interaction 深化。
5. 下一阶段是否切到 Remote Code Editing Mainline Audit。

## 推荐决策

推荐 M13-I 得出以下结论：

- Go + Rust rich interaction proof 验收通过，模板冻结。
- 暂停继续扩 clangd / Java hover + definition。
- 暂停 Go / Rust completion / references 深化。
- 将 heavy toolchain provider 深化放入 parking-lot。
- 下一阶段进入 P0 Remote Code Editing Mainline Audit。

## 下一阶段建议：P0 Remote Code Editing Mainline Audit

目标：用产品主链路而不是功能清单审计当前 IDE。

审计路径：

```txt
打开项目
→ 浏览文件
→ 搜索文件/文本
→ 查看 Problems
→ 跳定义/hover
→ 修改文件
→ 保存
→ 处理冲突/外部修改/只读/大文件
→ Git diff/stage/commit
→ 终端执行简单命令
```

输出：

- 主链路 P0 bug list。
- 高频体验缺口。
- 必须修复项。
- 可后置项。
- 对应 smoke/test plan。

## 不做事项

M13-I 不做：

- 新 runtime provider。
- clangd / Java hover + definition implementation。
- Go/Rust completion/references/rename/formatting/codeAction implementation。
- installer/download/PATH discovery。
- Git dangerous operations。
- Debug parity。
- Terminal advanced layout。
- 第二套 Files/LSP/Git/Terminal API。

## 验证方式

Docs-only 阶段：

```bash
git diff --check
markdown relative-link check for touched docs
```

如后续进入 P0 audit，再按审计范围选择相关 smoke，而不是提前跑完整 RC matrix。
