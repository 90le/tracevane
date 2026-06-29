import { test } from "node:test";
import assert from "node:assert";
import fs from "node:fs";

const readWeb = (rel) =>
  fs.readFileSync(new URL(`../../apps/web/src/${rel}`, import.meta.url), "utf-8");

test("Season One route renders the live adapter demo instead of the preview fallback", () => {
  const page = readWeb("features/workspace/season-one/WorkspaceSeasonOnePreviewPage.tsx");

  assert.match(page, /createWorkspaceSeasonOneLiveModel/);
  assert.match(page, /seasonOneLiveDemoModel/);
  assert.match(page, /data-workspace-season-one-live-page/);
  assert.match(page, /WorkspaceSeasonOneFramePreview model=\{seasonOneLiveDemoModel\}/);
  assert.match(page, /Workspace Season One Live · Tracevane/);
  assert.match(page, /activePath: "docs\/DESIGN\.md"/);
  assert.match(page, /evidenceItems: 3/);
  assert.match(page, /terminalState: "passed"/);
  assert.doesNotMatch(page, /<WorkspaceSeasonOneFramePreview \/>/);
});
