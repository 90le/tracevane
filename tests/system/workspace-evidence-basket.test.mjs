import { test } from "node:test";
import assert from "node:assert";
import fs from "node:fs";

const readWeb = (rel) =>
  fs.readFileSync(new URL(`../../apps/web/src/${rel}`, import.meta.url), "utf-8");

test("Workspace Evidence Basket has an append-only review contract", () => {
  const evidence = readWeb("features/workspace/shared/WorkspaceEvidenceBasket.ts");
  assert.match(evidence, /export type WorkspaceEvidenceSource/);
  assert.match(evidence, /"ai-context"/);
  assert.match(evidence, /"terminal"/);
  assert.match(evidence, /"git"/);
  assert.match(evidence, /"verification"/);
  assert.match(evidence, /export interface WorkspaceEvidenceRecord/);
  assert.match(evidence, /refs: Record<string, unknown>/);
  assert.match(evidence, /tracevane\.workspace\.evidence-basket\.v1/);
  assert.match(evidence, /tracevane:workspace-evidence-basket-updated/);
  assert.match(evidence, /WORKSPACE_EVIDENCE_BASKET_LIMIT = 80/);
  assert.match(evidence, /export function appendWorkspaceEvidence/);
  assert.match(evidence, /export function subscribeWorkspaceEvidenceBasket/);
  assert.match(evidence, /export function removeWorkspaceEvidence/);
  assert.match(evidence, /export function clearWorkspaceEvidenceBasket/);
  assert.match(evidence, /export function replaceWorkspaceEvidenceBasket/);
  assert.match(evidence, /export function exportWorkspaceEvidenceBundle/);
  assert.match(evidence, /new CustomEvent\(TRACEVANE_WORKSPACE_EVIDENCE_BASKET_EVENT/);
  assert.match(evidence, /action: "append"/);
  assert.match(evidence, /action: "remove"/);
  assert.match(evidence, /action: "clear"/);
  assert.match(evidence, /action: "replace"/);
});
