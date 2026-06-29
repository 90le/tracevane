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
  assert.doesNotMatch(readme, /Tracevane前端重设计原型\.md/);
  assert.doesNotMatch(readme, /Workspace重设计总纲\.md/);
  assert.doesNotMatch(readme, /Workspace前端原型\.md/);
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
