import { test } from "node:test";
import assert from "node:assert";
import fs from "node:fs";

const readRoot = (rel) =>
  fs.readFileSync(new URL(`../../${rel}`, import.meta.url), "utf-8");
const readWeb = (rel) =>
  fs.readFileSync(
    new URL(`../../apps/web/src/${rel}`, import.meta.url),
    "utf-8",
  );

test("Season One responsive contract covers desktop tablet and phone explicitly", () => {
  const doc = readRoot("docs/Workspace第一季前端推翻重构总纲.md");
  const frame = readWeb(
    "features/workspace/shared/WorkspaceSeasonOneFrame.tsx",
  );
  const preview = readWeb(
    "features/workspace/shared/WorkspaceSeasonOneFramePreview.tsx",
  );
  const model = readWeb(
    "features/workspace/shared/WorkspaceSeasonOneProductModel.ts",
  );
  const router = readWeb("app/router.tsx");

  assert.match(doc, /Desktop ≥ 1280/);
  assert.match(doc, /Tablet 768–1279/);
  assert.match(doc, /Phone < 768/);
  assert.match(doc, /No persistent multi-column layout/);
  assert.match(
    frame,
    /md:grid-cols-\[64px_minmax\(248px,312px\)_minmax\(0,1fr\)\]/,
  );
  assert.match(
    frame,
    /xl:grid-cols-\[72px_minmax\(272px,340px\)_minmax\(0,1fr\)_minmax\(304px,384px\)\]/,
  );
  assert.match(frame, /radial-gradient\(circle_at_top_left/);
  assert.match(frame, /backdrop-blur-2xl/);
  assert.match(frame, /className="md:hidden"/);
  assert.match(frame, /data-workspace-season-one-mobile-switcher/);
  assert.match(preview, /Workspace mobile task switcher/);
  assert.match(preview, /Rebuild Studio/);
  assert.match(preview, /Legacy shell replacement/);
  assert.match(preview, /Command Deck/);
  assert.match(preview, /data-season-one-real-ide-stage/);
  assert.match(preview, /data-season-one-editor-grid/);
  assert.match(preview, /data-season-one-live-editor/);
  assert.doesNotMatch(preview, /Desktop command deck/);
  assert.match(model, /id: "files", label: "Files", icon: "files"/);
  assert.match(model, /id: "stage", label: "Stage", icon: "code"/);
  assert.match(model, /id: "ai", label: "AI", icon: "ai"/);
  assert.match(model, /id: "evidence", label: "Evidence", icon: "evidence"/);
  assert.match(model, /id: "run", label: "Run", icon: "run"/);
  assert.match(router, /path="\/workspace\/season-one"/);
});
