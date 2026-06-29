import { test } from "node:test";
import assert from "node:assert";
import fs from "node:fs";

const readWeb = (rel) =>
  fs.readFileSync(new URL(`../../apps/web/src/${rel}`, import.meta.url), "utf-8");

test("Season One route gets live model through a replaceable hook", () => {
  const page = readWeb("features/workspace/season-one/WorkspaceSeasonOnePreviewPage.tsx");
  const hook = readWeb("features/workspace/season-one/useWorkspaceSeasonOneLiveModel.ts");
  const index = readWeb("features/workspace/season-one/index.ts");

  assert.match(page, /useWorkspaceSeasonOneLiveModel/);
  assert.match(page, /const \{ model, source \} = useWorkspaceSeasonOneLiveModel\(\)/);
  assert.match(page, /data-workspace-season-one-live-source=\{source\}/);
  assert.match(page, /WorkspaceSeasonOneFramePreview model=\{model\}/);
  assert.doesNotMatch(page, /createWorkspaceSeasonOneLiveModel\(/);
  assert.doesNotMatch(page, /seasonOneLiveDemoModel/);

  assert.match(hook, /WorkspaceSeasonOneSourceSnapshot/);
  assert.match(hook, /WorkspaceSeasonOneLiveModelState/);
  assert.match(hook, /source: "demo" \| "workspace-hooks"/);
  assert.match(hook, /sourceSnapshot: WorkspaceSeasonOneSourceSnapshot/);
  assert.match(hook, /createWorkspaceSeasonOneAdapterInputFromSnapshot/);
  assert.match(hook, /createWorkspaceSeasonOneDemoSourceSnapshot/);
  assert.match(hook, /createWorkspaceSeasonOneDemoAdapterInput/);
  assert.match(hook, /createWorkspaceSeasonOneLiveModel\(adapterInput\)/);
  assert.match(hook, /normalizeOpenFiles/);
  assert.match(index, /useWorkspaceSeasonOneLiveModel/);
});
