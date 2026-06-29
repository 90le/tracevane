import { test } from "node:test";
import assert from "node:assert";
import fs from "node:fs";

const readRoot = (rel) =>
  fs.readFileSync(new URL(`../../${rel}`, import.meta.url), "utf-8");
const readWeb = (rel) =>
  fs.readFileSync(new URL(`../../apps/web/src/${rel}`, import.meta.url), "utf-8");

test("top-tier Workspace goal blueprint defines the IDE-first cleanup and rebuild contract", () => {
  const doc = readRoot("docs/Workspace全球顶级AI编程IDE工作区Goal蓝图.md");
  assert.match(doc, /全球顶级 AI 编程 IDE 工作区 Goal 蓝图/);
  assert.match(doc, /IDE-first、AI-native、可无限扩展/);
  assert.match(doc, /写作、渲染、预览增强仅作为未来扩展，不是当前主线/);
  assert.match(doc, /先完成 IDE 工作区本体/);
  assert.doesNotMatch(doc, /写作工作区/);
  assert.match(doc, /Phase 0 — 先清理不恰当代码与文档/);
  assert.match(doc, /先 IDE，后 AI/);
  assert.match(doc, /不做预览增强/);
  assert.match(doc, /禁止再做“看起来很酷但不能工作”的说明页式 Workspace/);
  assert.match(doc, /路线 B：基于 Eclipse Theia/);
  assert.match(doc, /路线 C：集成 code-server \/ OpenVSCode Server/);
  assert.match(doc, /手机端不是缩小版桌面 IDE/);
  assert.match(doc, /只 edit 本阶段确认文件/);
  assert.match(doc, /git add.*显式列路径/);
});

test("docs README promotes the goal blueprint as the first authority", () => {
  const readme = readRoot("docs/README.md");
  assert.match(readme, /Workspace全球顶级AI编程IDE工作区Goal蓝图\.md/);
  assert.match(readme, /当前 Codex Goal 的最高执行宪章/);
  assert.match(readme, /终端、前后端边界、桌面\/手机 UI\/UX/);
  assert.match(readme, /文件\/终端\/Git\/搜索\/证据\/Agent handoff 后端设计/);
  assert.match(readme, /文件管理、代码编辑器、终端、Git、搜索、上下文证据/);
  assert.match(readme, /预览\/渲染只作为未来扩展边界/);
  assert.doesNotMatch(readme, /文件管理、编辑器、预览、终端、Git/);
  assert.doesNotMatch(readme, /Tracevane前端重设计原型\.md/);
  assert.doesNotMatch(readme, /Workspace重设计总纲\.md/);
  assert.doesNotMatch(readme, /Workspace前端原型\.md/);
});

test("Workspace design contract keeps the active goal IDE-only", () => {
  const blueprint = readRoot("docs/Workspace全球顶级AI编程IDE工作区Goal蓝图.md");
  const design = readRoot("DESIGN.md");
  assert.match(blueprint, /Codex Goal 文本修正声明/);
  assert.match(blueprint, /当前执行目标只推进 IDE 工作区本体和 UI\/UX/);
  assert.match(blueprint, /文件\/编辑器、终端、Git、搜索、命令、状态、布局/);
  assert.match(blueprint, /IDE Core Features[\s\S]*code editor[\s\S]*terminal[\s\S]*search[\s\S]*git[\s\S]*command\/status\/layout/);
  assert.match(blueprint, /Future Extension Placeholders \(not Phase 0\/1\/2 scope\)[\s\S]*preview\/rendering[\s\S]*writing/);
  assert.doesNotMatch(blueprint, /IDE Core Features[\s\S]{0,160}preview/);
  assert.match(design, /real AI coding IDE workbench/);
  assert.match(design, /writing, rendering and preview enhancement are future extension lines only/);
  assert.doesNotMatch(design, /AI writing workbench/);
});

test("Workspace empty state exposes the AI coding IDE north star", () => {
  const stage = readWeb("features/workspace/editor/WorkspaceEditorStage.tsx");
  assert.match(stage, /WorkspaceTopTierEmptyState/);
  assert.match(stage, /全球顶级 AI 编程 IDE 工作区/);
  assert.match(stage, /AI 上下文/);
  assert.match(stage, /代码/);
  assert.match(stage, /终端/);
  assert.match(stage, /Git/);
  assert.match(stage, /证据/);
  assert.doesNotMatch(stage, /全球顶级 AI 编程与写作工作区/);
  assert.match(stage, /data-workspace-top-tier-empty/);
});

test("Workspace command system keeps the current IDE UI mainline out of preview/writing scope", () => {
  const commands = readWeb("features/workspace/workbench/workspaceCommands.tsx");
  assert.match(commands, /id: "workspace\.editor\.maximize"/);
  assert.match(commands, /最大化编辑器工作区/);
  assert.match(commands, /当前代码编辑器和 IDE 主舞台/);
  assert.match(commands, /审查证据入口/);
  assert.match(commands, /侧边面板当前已经收起/);
  assert.match(commands, /disabled: !sideOpen/);
  assert.match(commands, /disabled: !toggleMaximizedDockPanel/);
  assert.doesNotMatch(commands, /AI Diff 入口/);
  assert.doesNotMatch(commands, /最大化编辑\/预览区/);
  assert.doesNotMatch(commands, /所见即所得画布全屏化/);
});

test("Workspace command palette is framed as an IDE command center", () => {
  const palette = readWeb("features/workspace/workbench/WorkspaceCommandPalette.tsx");
  assert.match(palette, /IDE 命令控制台/);
  assert.match(palette, /文件、搜索、Git、终端、布局的统一动作入口/);
  assert.match(palette, /输入 IDE 命令：打开文件、搜索项目、Git 审查、终端动作/);
  assert.match(palette, /enabledCommandCount/);
  assert.match(palette, /所有命令必须映射到真实 IDE 操作/);
  assert.match(palette, /不可用动作会被禁用/);
  assert.match(palette, /data-workspace-command-palette-summary/);
  assert.match(palette, /data-workspace-keybinding-conflicts="header-alert"/);
  assert.match(palette, /data-workspace-command-palette-header="ide-command-console"/);
  assert.match(palette, /data-workspace-command-palette-surface="ide-command-center"/);
  assert.match(palette, /没有匹配的 IDE 命令/);
  assert.match(palette, /index < WORKSPACE_COMMAND_GROUPS\.length - 1/);
  assert.doesNotMatch(palette, /group !== "AI"/);
  assert.doesNotMatch(palette, /AI 上下文…/);
});

test("Workspace command palette has IDE command-center styling hooks", () => {
  const css = readWeb("features/workspace/workbench/workspace-workbench.css");
  assert.match(css, /data-workspace-command-palette-surface="ide-command-center"/);
  assert.match(css, /data-workspace-command-palette-header="ide-command-console"/);
  assert.match(css, /data-workspace-command-palette-scope/);
  assert.match(css, /data-workspace-command-palette-summary/);
  assert.match(css, /data-workspace-keybinding-conflicts="header-alert"/);
  assert.match(css, /--workspace-command-hit-target: 2\.75rem/);
  assert.match(css, /--workspace-command-hit-target: 3\.25rem/);
  assert.match(css, /data-workspace-command-palette-mobile-sheet/);
  assert.match(css, /generic AI prompt box/);
});

test("Workspace terminal commands treat terminal as a first-class IDE panel", () => {
  const panelCommands = readWeb("features/workspace/terminal/terminalPanelCommands.tsx");
  const sessionActions = readWeb("features/workspace/terminal/terminalSessionActions.tsx");
  assert.match(panelCommands, /终端：停靠到 IDE 主工作区/);
  assert.match(panelCommands, /一等 IDE 面板参与工作区布局/);
  assert.match(panelCommands, /终端：复制上下文证据/);
  assert.match(panelCommands, /可审查终端证据/);
  assert.match(panelCommands, /终端：生成诊断证据摘要/);
  assert.match(panelCommands, /可审查诊断上下文/);
  assert.match(panelCommands, /终端：复制当前 cwd 证据/);
  assert.match(panelCommands, /终端：插入当前 cwd 到输入行/);
  assert.match(panelCommands, /不自动执行命令/);
  assert.match(sessionActions, /停靠到 IDE 主工作区/);
  assert.match(sessionActions, /复制上下文证据/);
  assert.match(sessionActions, /插入 cwd 到输入行/);
  assert.doesNotMatch(sessionActions, /terminal\.session\.copyAiContext/);
  assert.doesNotMatch(panelCommands, /AI：复制当前终端上下文/);
  assert.doesNotMatch(panelCommands, /终端：AI 诊断当前输出/);
  assert.doesNotMatch(panelCommands, /预留终端编辑器标签能力/);
  assert.doesNotMatch(sessionActions, /移动到编辑区域/);
});

test("Workspace search commands frame replace as reviewable IDE plans", () => {
  const searchCommands = readWeb("features/workspace/files/searchPanelCommands.tsx");
  const searchPanel = readWeb("features/workspace/files/WorkspaceSearchPanel.tsx");
  assert.match(searchCommands, /搜索：聚焦替换输入/);
  assert.match(searchCommands, /搜索：清空替换文本/);
  assert.match(searchCommands, /搜索：审查跨文件替换计划/);
  assert.match(searchCommands, /可审查替换计划/);
  assert.match(searchCommands, /hasReplacePlan/);
  assert.match(searchCommands, /prepareReplacePlan/);
  assert.match(searchCommands, /applyReplacePlan/);
  assert.match(searchCommands, /search\.panel\.prepareReplacePreview/);
  assert.match(searchCommands, /search\.panel\.applyReplacePreview/);
  assert.match(searchCommands, /搜索：应用本次替换计划/);
  assert.match(searchPanel, /审查跨文件替换计划/);
  assert.match(searchPanel, /审查替换计划/);
  assert.match(searchPanel, /ReplacePlanDialog/);
  assert.match(searchPanel, /replaceInputRef/);
  assert.match(searchPanel, /focusReplaceInput/);
  assert.match(searchPanel, /clearReplaceInput/);
  assert.match(searchPanel, /prepareReplacePlan/);
  assert.match(searchPanel, /selectedReplacePlanItems/);
  assert.match(searchPanel, /全选本次计划/);
  assert.match(searchPanel, /复制上下文证据/);
  assert.doesNotMatch(searchCommands, /搜索：预览跨文件替换/);
  assert.doesNotMatch(searchCommands, /确认本次替换预览/);
  assert.doesNotMatch(searchCommands, /hasReplacePreview/);
  assert.doesNotMatch(searchPanel, /预览跨文件替换/);
  assert.doesNotMatch(searchPanel, /预览替换/);
  assert.doesNotMatch(searchPanel, /ReplacePreviewDialog/);
  assert.doesNotMatch(searchPanel, /prepareReplacePreview/);
  assert.doesNotMatch(searchPanel, /selectedReplaceItems/);
  assert.doesNotMatch(searchPanel, /全选本次预览/);
  assert.doesNotMatch(searchPanel, /复制 AI 上下文/);
});

test("Workspace Git commands prioritize review evidence over generic AI copy", () => {
  const gitCommands = readWeb("features/workspace/git/gitPanelCommands.tsx");
  const gitPanel = readWeb("features/workspace/git/WorkspaceGitPanel.tsx");
  assert.match(gitCommands, /Git：复制 Diff 审查上下文/);
  assert.match(gitCommands, /Diff 审查上下文/);
  assert.match(gitCommands, /Git：复制提交证据包/);
  assert.match(gitCommands, /审查证据包/);
  assert.match(gitPanel, /复制 Git 审查上下文/);
  assert.match(gitPanel, /已复制 Git 审查上下文/);
  assert.doesNotMatch(gitCommands, /Diff AI 上下文/);
  assert.doesNotMatch(gitCommands, /复制该提交的 AI 上下文/);
  assert.doesNotMatch(gitPanel, /复制 Git AI 上下文/);
  assert.doesNotMatch(gitPanel, /已复制 Git AI 上下文/);
});

test("Workspace Git panel uses review language instead of AI-first labels", () => {
  const gitPanel = readWeb("features/workspace/git/WorkspaceGitPanel.tsx");
  assert.match(gitPanel, /Git 冲突审查入口已预留/);
  assert.match(gitPanel, /Git 提交信息建议入口已预留/);
  assert.match(gitPanel, /Git Diff 审查入口已预留/);
  assert.match(gitPanel, /Git 提交审查入口已预留/);
  assert.match(gitPanel, /Git 分支审查入口已预留/);
  assert.match(gitPanel, /提交信息建议/);
  assert.match(gitPanel, /审查分支上下文/);
  assert.match(gitPanel, /审查提交上下文/);
  assert.match(gitPanel, /审查上下文入口/);
  assert.doesNotMatch(gitPanel, /AI 冲突解释入口已预留/);
  assert.doesNotMatch(gitPanel, /AI 提交信息入口已预留/);
  assert.doesNotMatch(gitPanel, /AI Diff 解释入口已预留/);
  assert.doesNotMatch(gitPanel, /AI 提交解释入口已预留/);
  assert.doesNotMatch(gitPanel, /AI 分支解释入口已预留/);
  assert.doesNotMatch(gitPanel, />\s*AI 上下文\s*<\/Button>/);
});

test("Workspace Git commands separate evidence from AI generation", () => {
  const gitCommands = readWeb("features/workspace/git/gitPanelCommands.tsx");
  assert.match(gitCommands, /Git：生成提交信息建议/);
  assert.match(gitCommands, /只填入草稿，不会提交/);
  assert.match(gitCommands, /Git：生成变更审查摘要/);
  assert.match(gitCommands, /group: "证据"/);
  assert.match(gitCommands, /group: "证据" as const/);
  assert.match(gitCommands, /Git：复制近期历史上下文/);
  assert.match(gitCommands, /Git：复制 Diff 审查上下文/);
  assert.match(gitCommands, /Git：复制提交证据包/);
  assert.match(gitCommands, /id: "git\.panel\.ai\.commitMessage"[\s\S]{0,220}group: "证据"/);
  assert.doesNotMatch(gitCommands, /Git：AI 提交信息/);
  assert.doesNotMatch(gitCommands, /Git：AI 总结当前变更/);
  assert.doesNotMatch(gitCommands, /release note|changelog/i);
  assert.doesNotMatch(gitCommands, /group: "AI" as const/);
});

test("Workspace context commands collect reviewable evidence before AI handoff", () => {
  const workspaceCommands = readWeb("features/workspace/workbench/workspaceCommands.tsx");
  const searchCommands = readWeb("features/workspace/files/searchPanelCommands.tsx");
  assert.match(workspaceCommands, /"证据"/);
  assert.match(workspaceCommands, /准备 IDE 上下文证据/);
  assert.match(workspaceCommands, /交给 AI 扩展前先形成可审查证据/);
  assert.match(searchCommands, /group: "证据"/);
  assert.match(searchCommands, /搜索：复制上下文证据/);
  assert.match(searchCommands, /可审查上下文证据/);
  assert.doesNotMatch(workspaceCommands, /准备 AI 上下文入口/);
  assert.doesNotMatch(searchCommands, /搜索：复制 AI 上下文/);
});
