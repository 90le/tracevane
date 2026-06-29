import { test } from "node:test";
import assert from "node:assert";
import fs from "node:fs";

const readWeb = (rel) =>
  fs.readFileSync(
    new URL(`../../apps/web/src/${rel}`, import.meta.url),
    "utf-8",
  );

test("Season One preview composes the first-class workspace product model", () => {
  const preview = readWeb(
    "features/workspace/shared/WorkspaceSeasonOneFramePreview.tsx",
  );
  const model = readWeb(
    "features/workspace/shared/WorkspaceSeasonOneProductModel.ts",
  );
  const barrel = readWeb("features/workspace/shared/index.ts");

  assert.match(preview, /data-season-one-command-center/);
  assert.match(preview, /data-season-one-redesign-manifest/);
  assert.match(preview, /Rebuild Studio/);
  assert.match(preview, /Legacy shell replacement/);
  assert.match(preview, /Command Deck/);
  assert.match(preview, /data-season-one-real-ide-stage/);
  assert.match(preview, /data-season-one-editor-grid/);
  assert.match(preview, /data-season-one-live-editor/);
  assert.match(preview, /data-season-one-draft-diff-gate/);
  assert.match(preview, /IDE Stage/);
  assert.match(preview, /Live file preview/);
  assert.doesNotMatch(preview, /data-season-one-viewport-manifest/);
  assert.match(preview, /data-season-one-resource-map/);
  assert.match(preview, /data-season-one-primary-workstage/);
  assert.match(preview, /data-season-one-ai-copilot/);
  assert.match(preview, /data-season-one-work-canvas/);
  assert.match(preview, /data-season-one-evidence-rail/);
  assert.match(preview, /data-season-one-run-panel/);
  assert.match(preview, /data-season-one-mobile-navigation/);

  assert.match(preview, /model = createWorkspaceSeasonOnePreviewModel\(\)/);
  assert.match(preview, /WorkspaceSeasonOneProductModel/);

  assert.match(model, /interface WorkspaceSeasonOneProductModel/);
  assert.match(model, /Current mission/);
  assert.match(model, /AI coding \+ writing studio/);
  assert.match(model, /Replace the IDE shell with a focused AI work surface/);
  assert.match(model, /AI Work Partner/);
  assert.match(model, /WorkspaceShell\.tsx/);
  assert.match(model, /Writing brief/);
  assert.match(model, /Review loop/);
  assert.match(model, /Recovery model/);
  assert.match(model, /desktop · tablet · phone/);
  assert.match(barrel, /WorkspaceSeasonOneProductModel/);
});
