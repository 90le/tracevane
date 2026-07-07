# M8-E RC acceptance baseline and CI gate decision summary

## 状态

已完成：M8-E 固化 Tracevane IDE release-candidate acceptance baseline，并明确 CI gate 决策。

本阶段是 docs / process / release-candidate 收口，不新增 IDE runtime 功能，不新增 Files / Terminal / LSP / Git / Debug API，不新增 GitHub Actions workflow。

下一步进入 **M8-F：RC release checklist and post-M8 roadmap freeze**。

## RC acceptance baseline

### PR / 阶段收口 quick gate

`npm run ide:rc:quick` 是当前 Tracevane IDE PR / 阶段收口的标准 quick gate。它覆盖：

```bash
npm run typecheck:api -- --pretty false
npm run typecheck:web -- --pretty false
npm run smoke:ide:workbench-layout
npm run smoke:ide:editor-foundation
npm run smoke:ide:terminal-foundation
npm run smoke:ide:search-foundation
npm run smoke:ide:problems-output
npm run smoke:ide:lsp-diagnostics
npm run smoke:ide:git-status
npm run smoke:ide:debug-foundation
git diff --check
```

要求：

- 每个 IDE / editor / terminal / LSP / Git / Debug 阶段提交前必须运行并记录结果。
- quick gate 失败时不允许标记阶段完成；必须按 P0/P1/P2/P3 triage 处理。
- quick gate 只证明代表性主链路，不替代 domain/full matrix。

### Domain matrix

M8-D 已验证以下 domain matrix 可运行：

```bash
node scripts/ide-rc-matrix.mjs --domain=fileSurface --continue-on-error
node scripts/ide-rc-matrix.mjs --domain=workbenchEditor --continue-on-error
node scripts/ide-rc-matrix.mjs --domain=terminal --continue-on-error
node scripts/ide-rc-matrix.mjs --domain=searchProblemsOutput --continue-on-error
node scripts/ide-rc-matrix.mjs --domain=lsp --continue-on-error
node scripts/ide-rc-matrix.mjs --domain=git --continue-on-error
node scripts/ide-rc-matrix.mjs --domain=debug --continue-on-error
```

要求：

- release branch / RC 候选发布前至少跑全 domain matrix。
- 大范围改动可只跑受影响 domain + quick gate；但如果改动跨 editor / terminal / LSP / Git / Debug 边界，必须补相邻 domain。
- LSP external-api domain 当前较慢，属于 RC/manual gate 合理成本；后续若要 CI 化，需要先稳定 runner image 与缓存策略。

### Full matrix

`npm run ide:rc:full` 保留为完整发布候选矩阵入口。M8-E 不要求每个普通 PR 都跑 full matrix。

建议使用频率：

- release branch cut 前。
- 大版本候选发布前。
- 影响多个基础设施域的 smoke runner / Vite / Playwright / terminal runtime 改动后。

## CI gate decision

当前仓库没有既有 `.github/workflows` CI contract。M8-E 决策如下：

1. **暂不新增 GitHub Actions workflow。**
   - 原因：当前 quick/domain smokes 依赖本地 Chrome、Playwright、PTY/node-pty、tmux/terminal 运行时、可用端口和较长执行时间。
   - 在未定义 runner image、浏览器安装、tmux/node-pty 能力、端口隔离和 artifact/log 采集策略前，直接新增 CI workflow 风险较高，容易产生假红。
2. **`npm run ide:rc:quick` 先作为本地 mandatory gate。**
   - 阶段提交和 review 报告必须包含 quick gate 结果。
   - 发生 quick gate 失败时，优先修 runner/smoke 可信度，再判断是否为产品 blocker。
3. **domain/full matrix 保留为 manual / release-candidate gate。**
   - M8-F 再把执行清单、日志保存位置、失败分级和 release checklist 固化。
4. **未来 CI 化前置条件。**
   - 明确 Linux runner image。
   - 固定 Chrome/Playwright 安装路径或改为 Playwright-managed browser。
   - 明确 tmux/node-pty 能力与可跳过策略。
   - 为 external-api smoke 定义日志 artifact 上传。
   - 把超时、端口和 cache 目录全部参数化。

## 本次没有做

- 没有新增 CI workflow。
- 没有新增 IDE runtime feature。
- 没有改变 RC matrix runner 行为。
- 没有修改 model-gateway 等非 IDE 范围漂移。
- 没有把 full matrix 变成普通 PR 必跑项。

## 验证

本阶段为 docs/process 收口，验证：

```bash
# touched docs relative link check
git diff --check
```

M8-D 已提供 quick/domain matrix 运行证据；M8-E 不重复执行完整 smoke，以避免把 docs-only 决策阶段扩成运行时修复阶段。

## M8-F 入口

M8-F 建议只做 RC release checklist and post-M8 roadmap freeze：

1. 固化 release checklist：分支、命令、日志、失败分级、签核要求。
2. 列出 post-M8 后置功能：force push / merge / rebase、Git graph/blame、多语言 LSP parity、Debug parity、CI workflow 正式接入。
3. 明确哪些问题是 RC blocker，哪些只能进入 post-M8 roadmap。
