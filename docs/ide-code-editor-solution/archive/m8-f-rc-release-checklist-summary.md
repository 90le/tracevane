# M8-F RC release checklist and post-M8 roadmap freeze summary

## 状态

已完成：M8-F 固化 Tracevane IDE release-candidate 发布清单、失败分级、日志留存、签核要求和 post-M8 roadmap freeze。

本阶段仍然是 release-candidate 收口，不新增 IDE runtime 功能，不新增 CI workflow，不新增 Files / Terminal / LSP / Git / Debug API。

下一步进入 **M8-G：RC signoff and release-candidate handoff**。

## RC release checklist

### 1. 分支与范围确认

发布候选前必须确认：

- 当前分支只包含 IDE / editor / terminal / LSP / Git / Debug RC 范围内的提交，或清楚记录并隔离非 IDE 提交。
- `git status --short --branch` 清楚展示无未提交 IDE 改动。
- 不把 File Manager Online Editor 和 IDE Workbench 合并成一个产品壳。
- 不新增第二套 Files / Git / Terminal / LSP API。
- 不把 post-M8 enhancement 作为 RC blocker 强行纳入。

### 2. 必跑命令

普通 IDE PR / 阶段收口：

```bash
npm run ide:rc:quick
```

RC 候选发布前：

```bash
node scripts/ide-rc-matrix.mjs --domain=fileSurface --continue-on-error
node scripts/ide-rc-matrix.mjs --domain=workbenchEditor --continue-on-error
node scripts/ide-rc-matrix.mjs --domain=terminal --continue-on-error
node scripts/ide-rc-matrix.mjs --domain=searchProblemsOutput --continue-on-error
node scripts/ide-rc-matrix.mjs --domain=lsp --continue-on-error
node scripts/ide-rc-matrix.mjs --domain=git --continue-on-error
node scripts/ide-rc-matrix.mjs --domain=debug --continue-on-error
```

完整候选发布或大范围基础设施改动后：

```bash
npm run ide:rc:full -- --continue-on-error
```

> 如果 full matrix 因耗时拆分执行，必须保留每个 domain 的命令、开始时间、结束状态和失败列表。

### 3. 日志与证据留存

发布候选记录至少包含：

- `npm run ide:rc:quick` 完整输出或摘要。
- domain matrix 每个 domain 的通过/失败状态。
- external-api smoke 日志路径，例如 `tmp/tracevane-external-api-<port>.log` / `tmp/tracevane-external-web-<port>.log`。
- 失败 smoke 的 Playwright console/pageerror/body state 摘要。
- `git diff --check` 结果。
- 文档链接检查结果。
- 相关 commit SHA。

### 4. 失败分级

P0：不得发布；必须立即修复。

- IDE 入口白屏。
- 文件保存/rename/move/delete 丢数据。
- Files root guard / Terminal cwd guard / WorkspaceEdit root guard 绕过。
- Git 高风险操作无确认或误操作。
- Terminal process 泄漏导致资源不可控。

P1：默认阻塞 RC；除非产品负责人显式降级。

- `ide:rc:quick` 失败。
- 任何 release-candidate 必跑 domain 失败。
- Monaco dirty/save/conflict 主链路失败。
- LSP diagnostics / Git status / Debug foundation 主链路不可用。

P2：可进入 RC 但必须登记。

- 非核心 smoke 间歇失败且有明确 workaround。
- 响应式/主题/布局瑕疵但不影响数据安全和核心路径。
- full matrix 中非当前改动域失败，但 quick gate 与相关 domain 通过。

P3：不阻塞 RC。

- 文案、轻微视觉、非关键 tooltip、非阻塞日志噪声。

### 5. 签核要求

RC handoff 前至少记录：

- 当前阶段 archive summary 已存在。
- `.codex/project-context.md`、`00-README.md`、`07`、`08` 阶段状态一致。
- quick gate / domain matrix 证据完整。
- 所有 P0/P1 关闭或明确不适用。
- P2/P3 已进入 post-M8 issue/roadmap。

## post-M8 roadmap freeze

以下能力明确冻结到 post-M8，不作为当前 RC blocker：

### Git post-M8

- force push。
- merge / rebase UI。
- branch delete / rename / upstream set UI。
- Git graph / blame。
- credential manager / private token flow。
- hunk / partial stage parity。
- 完整 VS Code Source Control parity。

### LSP post-M8

- 多语言全集支持。
- semantic tokens 完整 parity。
- cross-workspace symbols。
- 大规模 workspace indexing。
- tsserver / typescript-language-server 进程化替代当前有界 provider。

### Debug post-M8

- 完整 DAP parity。
- 多语言 debug adapters。
- attach / compound launch / launch.json 全量 schema。
- advanced variable editing / watch persistence / reverse debugging。

### Terminal / Workbench post-M8

- Terminal editor-like tab。
- Terminal global view movement。
- Secondary SideBar。
- 完整 View Movement parity。
- CI workflow 正式接入。

## 本次没有做

- 没有运行 full matrix；M8-D 已完成 domain/quick evidence，本阶段是 release checklist 文档收口。
- 没有新增 GitHub Actions workflow。
- 没有新增运行时代码。
- 没有修改 model-gateway 等非 IDE 范围。

## 验证

```bash
# touched docs relative link check
git diff --check
```

## M8-G 入口

M8-G 建议只做 RC signoff and release-candidate handoff：

1. 汇总 M8-A 到 M8-F 的最终 RC 证据。
2. 输出 release-candidate handoff 文档。
3. 若需要创建 release branch / tag / PR，应先确认用户授权；默认不自动发布或推送。
