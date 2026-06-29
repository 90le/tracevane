import { test } from "node:test";
import assert from "node:assert";
import fs from "node:fs";

const readWeb = (rel) =>
  fs.readFileSync(new URL(`../../apps/web/src/${rel}`, import.meta.url), "utf-8");

test("Season One preview composes the first-class workspace product model", () => {
  const preview = readWeb("features/workspace/shared/WorkspaceSeasonOneFramePreview.tsx");

  assert.match(preview, /data-season-one-command-center/);
  assert.match(preview, /data-season-one-resource-map/);
  assert.match(preview, /data-season-one-primary-workstage/);
  assert.match(preview, /data-season-one-ai-copilot/);
  assert.match(preview, /data-season-one-work-canvas/);
  assert.match(preview, /data-season-one-evidence-rail/);
  assert.match(preview, /data-season-one-run-panel/);
  assert.match(preview, /data-season-one-mobile-navigation/);

  assert.match(preview, /AI coding \+ writing studio/);
  assert.match(preview, /Current mission/);
  assert.match(preview, /Replace the IDE shell with a focused AI work surface/);
  assert.match(preview, /AI Work Partner/);
  assert.match(preview, /WorkspaceShell\.tsx/);
  assert.match(preview, /Writing brief/);
  assert.match(preview, /Review loop/);
  assert.match(preview, /Recovery model/);
  assert.match(preview, /desktop · tablet · phone/);
});
