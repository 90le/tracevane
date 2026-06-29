import { test } from "node:test";
import assert from "node:assert";
import fs from "node:fs";

const readRoot = (rel) =>
  fs.readFileSync(new URL(`../../${rel}`, import.meta.url), "utf-8");
const readWeb = (rel) =>
  fs.readFileSync(new URL(`../../apps/web/src/${rel}`, import.meta.url), "utf-8");

test("Season One responsive contract covers desktop tablet and phone explicitly", () => {
  const doc = readRoot("docs/Workspace第一季前端推翻重构总纲.md");
  const frame = readWeb("features/workspace/shared/WorkspaceSeasonOneFrame.tsx");
  const preview = readWeb("features/workspace/shared/WorkspaceSeasonOneFramePreview.tsx");
  const router = readWeb("app/router.tsx");

  assert.match(doc, /Desktop ≥ 1280/);
  assert.match(doc, /Tablet 768–1279/);
  assert.match(doc, /Phone < 768/);
  assert.match(doc, /No persistent multi-column layout/);
  assert.match(frame, /md:grid-cols-\[56px_minmax\(220px,280px\)_minmax\(0,1fr\)\]/);
  assert.match(frame, /xl:grid-cols-\[64px_minmax\(248px,320px\)_minmax\(0,1fr\)_minmax\(280px,360px\)\]/);
  assert.match(frame, /className="md:hidden"/);
  assert.match(frame, /data-workspace-season-one-mobile-switcher/);
  assert.match(preview, /Workspace mobile task switcher/);
  assert.match(preview, /\['Files', FileText\]/);
  assert.match(preview, /\['Stage', Braces\]/);
  assert.match(preview, /\['AI', Bot\]/);
  assert.match(preview, /\['Evidence', ShieldCheck\]/);
  assert.match(preview, /\['Run', Play\]/);
  assert.match(router, /path="\/workspace\/season-one"/);
});
