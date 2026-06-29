import { test } from "node:test";
import assert from "node:assert";
import fs from "node:fs";

const readWeb = (rel) =>
  fs.readFileSync(new URL(`../../apps/web/src/${rel}`, import.meta.url), "utf-8");

test("Season One frame preview demonstrates the new product skeleton", () => {
  const preview = readWeb("features/workspace/shared/WorkspaceSeasonOneFramePreview.tsx");
  const barrel = readWeb("features/workspace/shared/index.ts");
  assert.match(preview, /export function WorkspaceSeasonOneFramePreview/);
  assert.match(preview, /<WorkspaceSeasonOneFrame/);
  assert.match(preview, /Tracevane Season One/);
  assert.match(preview, /AI coding \+ writing studio/);
  assert.match(preview, /Primary Stage/);
  assert.match(preview, /Writing \+ Code/);
  assert.match(preview, /Evidence gated/);
  assert.match(preview, /WorkspaceEvidenceResponsiveLauncher/);
  assert.match(preview, /Workspace mobile task switcher/);
  assert.match(preview, /terminal · tests · agent runs/);
  assert.match(preview, /Season One Frame Preview/);
  assert.match(barrel, /export \* from "\.\/WorkspaceSeasonOneFramePreview"/);
});
