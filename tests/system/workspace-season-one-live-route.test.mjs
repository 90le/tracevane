import { test } from "node:test";
import assert from "node:assert";
import fs from "node:fs";

const readWeb = (rel) =>
  fs.readFileSync(new URL(`../../apps/web/src/${rel}`, import.meta.url), "utf-8");

test("Season One route renders the live adapter demo instead of the preview fallback", () => {
  const page = readWeb("features/workspace/season-one/WorkspaceSeasonOnePreviewPage.tsx");

  const hook = readWeb("features/workspace/season-one/useWorkspaceSeasonOneLiveModel.ts");

  assert.match(page, /useWorkspaceSeasonOneLiveModel/);
  assert.match(page, /data-workspace-season-one-live-page/);
  assert.match(page, /WorkspaceSeasonOneFramePreview model=\{model\}/);
  assert.match(page, /Workspace Season One Live · Tracevane/);
  assert.match(hook, /createWorkspaceSeasonOneLiveModel/);
  assert.match(hook, /activePath: "docs\/DESIGN\.md"/);
  assert.match(hook, /evidenceItems: 3/);
  assert.match(hook, /terminalState: "passed"/);
  assert.doesNotMatch(page, /<WorkspaceSeasonOneFramePreview \/>/);
});
