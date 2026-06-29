import { test } from "node:test";
import assert from "node:assert";
import fs from "node:fs";

const readWeb = (rel) =>
  fs.readFileSync(new URL(`../../apps/web/src/${rel}`, import.meta.url), "utf-8");

test("Workspace Evidence Review Surface wires the cockpit to the live basket", () => {
  const surface = readWeb("features/workspace/shared/WorkspaceEvidenceReviewSurface.tsx");
  const panel = readWeb("features/workspace/shared/WorkspaceEvidenceReviewPanel.tsx");
  const barrel = readWeb("features/workspace/shared/index.ts");
  assert.match(surface, /export interface WorkspaceEvidenceReviewSurfaceProps/);
  assert.match(surface, /export function WorkspaceEvidenceReviewSurface/);
  assert.match(surface, /readWorkspaceEvidenceBasket/);
  assert.match(surface, /subscribeWorkspaceEvidenceBasket/);
  assert.match(surface, /clearWorkspaceEvidenceBasket/);
  assert.match(surface, /WorkspaceEvidenceReviewDensity/);
  assert.match(surface, /WorkspaceEvidenceReviewPanel/);
  assert.match(surface, /Live evidence basket/);
  assert.match(surface, /aria-label="Refresh workspace evidence records"/);
  assert.match(surface, /aria-live="polite"/);
  assert.match(surface, /data-workspace-evidence-review-density=\{density\}/);
  assert.match(surface, /onRecordsChange\?\.\(nextRecords\)/);
  assert.match(surface, /density=\{density\}/);
  assert.match(surface, /onClearEvidence=\{handleClear\}/);
  assert.match(panel, /export type WorkspaceEvidenceReviewDensity = "comfortable" \| "compact"/);
  assert.match(panel, /density\?: WorkspaceEvidenceReviewDensity/);
  assert.match(panel, /onClearEvidence\?: \(\) => void/);
  assert.match(panel, /aria-label="Clear workspace evidence records"/);
  assert.match(panel, /disabled=\{!packet\.records\.length\}/);
  assert.match(barrel, /export \* from "\.\/WorkspaceEvidenceReviewSurface"/);
});
