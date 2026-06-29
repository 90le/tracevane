import { test } from "node:test";
import assert from "node:assert";
import fs from "node:fs";

const readWeb = (rel) =>
  fs.readFileSync(new URL(`../../apps/web/src/${rel}`, import.meta.url), "utf-8");

test("Season One preview page is ready for route mounting without touching legacy Workbench", () => {
  const page = readWeb("features/workspace/season-one/WorkspaceSeasonOnePreviewPage.tsx");
  const index = readWeb("features/workspace/season-one/index.ts");
  const router = readWeb("app/router.tsx");
  assert.match(page, /export function WorkspaceSeasonOnePreviewPage/);
  assert.match(page, /WorkspaceSeasonOneFramePreview/);
  assert.match(page, /document\.title = "Workspace Season One Preview · Tracevane"/);
  assert.match(page, /data-workspace-season-one-preview-page/);
  assert.match(page, /h-dvh min-h-0 min-w-0 overflow-hidden/);
  assert.match(index, /export \{ WorkspaceSeasonOnePreviewPage \}/);
  assert.doesNotMatch(router, /WorkspaceSeasonOnePreviewPage/);
});
