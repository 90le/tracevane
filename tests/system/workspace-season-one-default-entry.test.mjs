import { test } from "node:test";
import assert from "node:assert";
import fs from "node:fs";

const readWeb = (rel) =>
  fs.readFileSync(
    new URL(`../../apps/web/src/${rel}`, import.meta.url),
    "utf-8",
  );

test("default Workspace route renders the Season One replacement shell", () => {
  const workspacePage = readWeb("features/workspace/WorkspacePage.tsx");
  const router = readWeb("app/router.tsx");

  assert.match(workspacePage, /WorkspaceSeasonOnePreviewPage/);
  assert.match(workspacePage, /Workspace Season One · Tracevane/);
  assert.doesNotMatch(workspacePage, /WorkspaceWorkbench/);
  assert.match(router, /path="\/workspace"/);
  assert.match(router, /<WorkspacePage \/>/);
});
