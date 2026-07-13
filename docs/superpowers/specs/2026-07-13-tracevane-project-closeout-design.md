# Tracevane 项目停止开发与安全收口设计

## 决策

Tracevane 停止作为通用产品继续开发。项目不再扩建文件管理、IDE Workbench、Model Gateway、Channel Connectors、CLI Agents、OpenClaw 或其他产品能力。最终工作只完成一个已经确认会破坏真实 Agent 会话的 Model Gateway 协议修复，并把当前代码、测试、研究和迁移信息整理成可审计的最终快照。

本次收口不通过大规模删除来证明项目结束。现有实现由 Git 历史和最终归档标签保存，避免在停止维护前制造新的集成风险，也避免为已经停止的产品继续投入重构成本。

## 目标状态

收口完成后，仓库满足以下状态：

1. Codex Responses `custom_tool_call` 的合法 `ctc_*` item ID 不再被错误改写，定向回归测试通过。
2. 根 README 在首屏明确说明产品开发已经停止、仓库仅作归档参考，并链接到最终状态与迁移文档。
3. 最终状态文档记录停止原因、已实现能力、可复用工程资产、已知缺陷、未完成范围和验证结果。
4. 迁移文档按 IDE、文件管理、模型网关和 Agent 工作区提供成熟替代方案，不宣称 Tracevane 已完成未验证能力。
5. 现有路线图和阶段文档保留为历史资料；只在中央入口增加归档说明，不逐份重写。
6. 最终验证结果可复现；失败项明确标记为新回归、既有失败或环境限制。
7. 最终变更提交后创建本地注释标签 `tracevane-final-2026-07-13`。不自动推送、不删除远程仓库，也不代替仓库所有者执行 GitHub Archive。

## 实施范围

### 1. 最终生产修复

实现并验证已批准的 [Codex custom tool call ID 修复设计](./2026-07-13-codex-custom-tool-call-id-design.md)：

- 先增加捕获上游请求体的系统回归测试；
- `function_call` 继续使用 `fc_*` item ID 规则；
- `custom_tool_call` 保留合法 `ctc_*`，只有缺失或命名空间非法时才生成稳定的 `ctc_*`；
- 保持 `call_id` 和 `custom_tool_call_output` 的关联；
- 不修改飞书、IM、Codex app-server session 或其他 Agent 流程。

这是唯一允许的生产行为修改。其目的不是继续发展 Model Gateway，而是避免最终归档版本保留一个已经确认的数据破坏缺陷。

### 2. 项目状态与资产清单

新增 `docs/project-closeout/README.md`，至少记录：

- 停止产品开发的日期与决策；
- 当前可运行的主要能力及其实际验收边界；
- Model Gateway 协议矩阵、回归测试、IDE 阶段文档、Files API 安全边界和跨平台运行研究等可复用资产；
- 已知缺陷、未完成能力和未执行的 live smoke；
- 最终验证命令及结果；
- 仓库只读归档后的支持口径。

资产“收割”仅指建立可发现、可验证的清单，不把资产抽成新包、新仓库或新产品。任何后续提取工作都不属于 Tracevane 最终收口。

### 3. 迁移说明

新增 `docs/project-closeout/migration.md`：

- IDE / 浏览器工作台推荐 Code - OSS、Eclipse Theia、code-server 或 OpenVSCode Server；
- 通用 Web 文件管理推荐 File Browser，跨存储需求可评估 Filestash，跨设备本地优先需求可评估 Spacedrive；
- 模型网关推荐 CLIProxyAPI、LiteLLM 或 Portkey，并提示按实际协议、许可证和部署边界选择；
- Agent 开发工作区推荐 Continue 或 OpenHands；
- 记录 Tracevane 本地配置、数据库、运行时和日志的现有位置及人工备份方式；
- 不编写自动迁移器，不修改或删除用户本地数据。

### 4. 文档冻结

更新以下中央入口：

- 根 `README.md`：增加停止开发横幅和最终文档链接；
- `docs/ide-code-editor-solution/00-README.md`：标记为历史实现资料；
- `docs/model-gateway/README.md`：标记为归档时的验收合同，不再代表持续兼容承诺；
- `docs/研究先行开发清单.md`：记录本次外部替代生态调研、最终协议修复与产品冻结范围。

不批量编辑 archive 文档，不删除路线图，不重写历史完成记录。

## 明确不做

- 不新增功能、Provider、协议、页面或产品模块。
- 不删除 Channel Connectors、CLI Agents、OpenClaw、IDE 或文件管理实现。
- 不建立插件系统、发行版、协议实验室或新的共享框架。
- 不进行依赖升级、架构重构、样式重做或全仓死代码清理。
- 不为归档目的修复与 `ctc_*` 问题无关的历史缺陷。
- 不复制第三方项目源码，不把迁移建议实现成内嵌第三方产品。
- 不推送分支或标签，不关闭、删除或归档远程托管仓库。

## 验证与完成条件

按风险从小到大执行：

1. 新增的 `ctc_*` 定向回归测试；
2. Model Gateway 相关系统测试；
3. `npm run typecheck`；
4. `npm run typecheck:web`；
5. `npm run build:api`；
6. `npm run build:web`；
7. 仓库已有的完整 system test 入口；
8. 触及文档的链接检查与 `git diff --check`。

协议修复的定向测试、类型检查和相关构建必须通过。更广范围若存在既有失败或环境限制，必须在最终状态文档中记录命令、错误摘要和影响，不能写成“全部通过”。所有验证完成并记录后，先提交生产修复，再提交项目状态和归档文档，最后创建本地注释标签。

## 提交与归档边界

预期形成两个可审查的实施提交：

1. `fix(model-gateway): preserve custom tool call IDs`
2. `docs: close Tracevane product development`

设计文档本身独立提交。最终注释标签指向文档收口提交。工作区中与本次收口无关的用户改动必须保留且不得混入提交；如无法安全隔离，停止提交并报告冲突。

## 完成后的项目口径

“结束项目开发”表示不再接受或规划新产品能力，而不是声称所有历史目标已经完成。仓库可用于审阅既有实现、回归测试和研究资料，但不提供持续兼容、漏洞修复、供应商更新或支持承诺。任何未来恢复开发的决定都应视为新项目立项，而不是本次收口的延续。
