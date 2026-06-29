import { test } from "node:test";
import assert from "node:assert";
import fs from "node:fs";

const readRoot = (rel) =>
  fs.readFileSync(new URL(`../../${rel}`, import.meta.url), "utf-8");
const readWeb = (rel) =>
  fs.readFileSync(new URL(`../../apps/web/src/${rel}`, import.meta.url), "utf-8");

test("Season One redesign contract rejects incremental legacy patching", () => {
  const doc = readRoot("docs/Workspace第一季前端推翻重构总纲.md");
  assert.match(doc, /不能继续以“小修小补”方式推进/);
  assert.match(doc, /Primary Stage first/);
  assert.match(doc, /One adaptive frame/);
  assert.match(doc, /Evidence is first-class/);
  assert.match(doc, /Desktop ≥ 1280/);
  assert.match(doc, /Tablet 768–1279/);
  assert.match(doc, /Phone < 768/);
  assert.match(doc, /不继续给旧 Workbench 局部加按钮/);
});

test("Season One frame defines a new responsive Workspace shell contract", () => {
  const frame = readWeb("features/workspace/shared/WorkspaceSeasonOneFrame.tsx");
  const barrel = readWeb("features/workspace/shared/index.ts");
  assert.match(frame, /export interface WorkspaceSeasonOneFrameProps/);
  assert.match(frame, /export function WorkspaceSeasonOneFrame/);
  assert.match(frame, /data-workspace-season-one-frame/);
  assert.match(frame, /data-workspace-season-one-topbar/);
  assert.match(frame, /data-workspace-season-one-activity/);
  assert.match(frame, /data-workspace-season-one-resources/);
  assert.match(frame, /data-workspace-season-one-stage/);
  assert.match(frame, /data-workspace-season-one-context/);
  assert.match(frame, /data-workspace-season-one-bottom-panel/);
  assert.match(frame, /data-workspace-season-one-mobile-switcher/);
  assert.match(frame, /md:grid-cols-\[56px_minmax\(220px,280px\)_minmax\(0,1fr\)\]/);
  assert.match(frame, /xl:grid-cols-\[64px_minmax\(248px,320px\)_minmax\(0,1fr\)_minmax\(280px,360px\)\]/);
  assert.match(frame, /aria-label="Workspace primary stage"/);
  assert.match(frame, /aria-label="Workspace context and evidence"/);
  assert.match(barrel, /export \* from "\.\/WorkspaceSeasonOneFrame"/);
});
