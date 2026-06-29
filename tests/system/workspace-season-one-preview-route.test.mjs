import { test } from "node:test";
import assert from "node:assert";
import fs from "node:fs";

const readWeb = (rel) =>
  fs.readFileSync(new URL(`../../apps/web/src/${rel}`, import.meta.url), "utf-8");

test("Season One preview route is mounted as an explicit full-bleed experiment", () => {
  const router = readWeb("app/router.tsx");
  assert.match(router, /const WorkspaceSeasonOnePreviewPage = React\.lazy/);
  assert.match(router, /import\("@\/features\/workspace\/season-one"\)/);
  assert.match(router, /path="\/workspace\/season-one"/);
  assert.match(router, /<WorkspaceSeasonOnePreviewPage \/>/);
  assert.match(router, /Full-bleed Workspace shell/);
  assert.ok(
    router.indexOf('path="/workspace/season-one"') < router.indexOf('path="/workspace"'),
    "season-one route must be declared before the base workspace route",
  );
});
