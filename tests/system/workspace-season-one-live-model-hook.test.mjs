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

  assert.match(hook, /useFilesSummaryQuery/);
  assert.match(hook, /FilesSummaryPayload/);
  assert.match(hook, /WorkspaceSeasonOneSourceSnapshot/);
  assert.match(hook, /WorkspaceSeasonOneLiveModelState/);
  assert.match(hook, /source: "demo" \| "workspace-hooks"/);
  assert.match(hook, /sourceSnapshot: WorkspaceSeasonOneSourceSnapshot/);
  assert.match(hook, /WORKSPACE_SESSION_STORAGE_KEY = "tracevane.workspace.session.v1"/);
  assert.match(hook, /WORKSPACE_EVIDENCE_BASKET_STORAGE_KEY/);
  assert.match(hook, /createWorkspaceSeasonOneStoredSessionSnapshot/);
  assert.match(hook, /createWorkspaceSeasonOneEvidenceSnapshot/);
  assert.match(hook, /mergeWorkspaceSeasonOneSourceSnapshots/);
  assert.match(hook, /isWorkspaceSeasonOneEvidenceRecord/);
  assert.match(hook, /createWorkspaceSeasonOneFilesSummarySnapshot/);
  assert.match(hook, /filesSummary\.data/);
  assert.match(hook, /selectWorkspaceSeasonOneRoot/);
  assert.match(hook, /source: storedSnapshot \|\| evidenceSnapshot \|\| filesSnapshot \? "workspace-hooks" : "demo"/);
  assert.match(hook, /createWorkspaceSeasonOneAdapterInputFromSnapshot/);
  assert.match(hook, /createWorkspaceSeasonOneDemoSourceSnapshot/);
  assert.match(hook, /createWorkspaceSeasonOneDemoAdapterInput/);
  assert.match(hook, /createWorkspaceSeasonOneLiveModel\(adapterInput\)/);
  assert.match(hook, /normalizeOpenFiles/);
  assert.match(index, /useWorkspaceSeasonOneLiveModel/);
});
