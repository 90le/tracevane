import { test } from "node:test";
import assert from "node:assert";
import fs from "node:fs";

const readRoot = (rel) =>
  fs.readFileSync(new URL(`../../${rel}`, import.meta.url), "utf-8");
const readWeb = (rel) =>
  fs.readFileSync(new URL(`../../apps/web/src/${rel}`, import.meta.url), "utf-8");

test("top-tier Workspace goal contract records research, phases, and non-completion gates", () => {
  const doc = readRoot("docs/Workspace全球顶级AI编程写作工作区Goal.md");
  assert.match(doc, /全球顶级 AI 编程与写作工作区 Goal/);
  assert.match(doc, /Research-First Implementation Gate/);
  assert.match(doc, /VS Code 官方 User Interface/);
  assert.match(doc, /Monaco Editor 官方 API/);
  assert.match(doc, /Cursor 官方 Agent\/Composer/);
  assert.match(doc, /OpenAI ChatGPT Canvas/);
  assert.match(doc, /Phase A：北极星与质量门禁/);
  assert.match(doc, /Phase D：AI 协作与证据闭环/);
  assert.match(doc, /不能在仅完成 Phase A 后关闭/);
  assert.match(doc, /每个阶段性代码修改后必须 git commit/);
});

test("Workspace empty state exposes the AI coding and writing north star", () => {
  const stage = readWeb("features/workspace/editor/WorkspaceEditorStage.tsx");
  assert.match(stage, /WorkspaceTopTierEmptyState/);
  assert.match(stage, /全球顶级 AI 编程与写作工作区/);
  assert.match(stage, /AI 上下文/);
  assert.match(stage, /写作/);
  assert.match(stage, /代码/);
  assert.match(stage, /终端/);
  assert.match(stage, /Git/);
  assert.match(stage, /证据/);
  assert.match(stage, /data-workspace-top-tier-empty/);
});
