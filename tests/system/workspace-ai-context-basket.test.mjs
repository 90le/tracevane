import { test } from "node:test";
import assert from "node:assert";
import fs from "node:fs";

const readWeb = (rel) =>
  fs.readFileSync(new URL(`../../apps/web/src/${rel}`, import.meta.url), "utf-8");

test("Workspace AI context basket has a local durable document item contract", () => {
  const workbench = readWeb("features/workspace/shared/DocumentWorkbench.tsx");
  assert.match(workbench, /interface WorkspaceAiContextBasketItem/);
  assert.match(workbench, /kind: "document"/);
  assert.match(workbench, /context: string/);
  assert.match(workbench, /addedAt: string/);
  assert.match(workbench, /localStorage\.setItem/);
  assert.match(workbench, /JSON\.stringify\(next\)/);
  assert.match(workbench, /new CustomEvent\(TRACEVANE_WORKSPACE_AI_CONTEXT_BASKET_EVENT/);
  assert.match(workbench, /slice\(0, 24\)/);
  assert.match(workbench, /id: `document:\$\{path\}`/);
  assert.match(workbench, /formatDocumentAiContext\(\{ path, mode, editable, textLike, stats \}\)/);
});
