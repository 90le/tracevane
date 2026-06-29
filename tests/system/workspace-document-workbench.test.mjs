import { test } from "node:test";
import assert from "node:assert";
import fs from "node:fs";

const readWeb = (rel) =>
  fs.readFileSync(new URL(`../../apps/web/src/${rel}`, import.meta.url), "utf-8");

test("DocumentWorkbench exposes AI writing context without creating a second document object", () => {
  const workbench = readWeb("features/workspace/shared/DocumentWorkbench.tsx");
  assert.match(workbench, /function DocumentAiWritingGuide/);
  assert.match(workbench, /data-document-ai-writing-guide/);
  assert.match(workbench, /AI 工作上下文/);
  assert.match(workbench, /@selection/);
  assert.match(workbench, /@file/);
  assert.match(workbench, /保存 \/ Git Diff \/ 终端验证后形成审查证据/);
  assert.match(workbench, /showAiWritingGuide = !compact && !splitPane && showModeSwitcher/);
  assert.match(workbench, /data-document-ai-writing-mode=\{mode\}/);
  assert.match(workbench, /data-document-writing-stats/);
  assert.match(workbench, /data-document-copy-ai-context/);
  assert.match(workbench, /data-document-add-ai-context/);
  assert.match(workbench, /加入上下文篮/);
  assert.match(workbench, /addDocumentToAiContextBasket/);
  assert.match(workbench, /summarizeDocumentForAi/);
  assert.match(workbench, /formatDocumentAiContext/);
  assert.match(workbench, /from "\.\/WorkspaceAiContextBasket"/);
});
