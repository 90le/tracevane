import { test } from "node:test";
import assert from "node:assert";
import fs from "node:fs";

const readWeb = (rel) =>
  fs.readFileSync(new URL(`../../apps/web/src/${rel}`, import.meta.url), "utf-8");

test("Workspace Evidence Review Panel exposes a responsive AI review cockpit", () => {
  const panel = readWeb("features/workspace/shared/WorkspaceEvidenceReviewPanel.tsx");
  const barrel = readWeb("features/workspace/shared/index.ts");
  assert.match(panel, /export type WorkspaceEvidenceReviewDensity = "comfortable" \| "compact"/);
  assert.match(panel, /export interface WorkspaceEvidenceReviewPanelProps/);
  assert.match(panel, /export function WorkspaceEvidenceReviewPanel/);
  assert.match(panel, /buildWorkspaceEvidenceHandoffPacket/);
  assert.match(panel, /formatWorkspaceEvidenceHandoffForAi/);
  assert.match(panel, /aria-label="Workspace evidence review"/);
  assert.match(panel, /AI review cockpit/);
  assert.match(panel, /Copy handoff/);
  assert.match(panel, /Review guardrail/);
  assert.match(panel, /No evidence selected/);
  assert.match(panel, /lg:grid-cols-\[minmax\(0,0\.9fr\)_minmax\(0,1\.1fr\)\]/);
  assert.match(panel, /max-h-\[min\(56dvh,520px\)\] overflow-y-auto/);
  assert.match(panel, /sm:grid-cols-2/);
  assert.match(panel, /navigator\.clipboard\.writeText\(handoff\)/);
  assert.match(panel, /groupEvidenceBySource/);
  assert.match(barrel, /export \* from "\.\/WorkspaceEvidenceReviewPanel"/);
});
