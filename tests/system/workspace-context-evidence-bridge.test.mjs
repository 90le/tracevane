import { test } from "node:test";
import assert from "node:assert";
import fs from "node:fs";

const readWeb = (rel) =>
  fs.readFileSync(new URL(`../../apps/web/src/${rel}`, import.meta.url), "utf-8");

test("Workspace context evidence bridge converts AI context into review evidence", () => {
  const bridge = readWeb("features/workspace/shared/WorkspaceContextEvidenceBridge.ts");
  assert.match(bridge, /from "\.\/WorkspaceAiContextBasket"/);
  assert.match(bridge, /from "\.\/WorkspaceEvidenceBasket"/);
  assert.match(bridge, /export interface WorkspaceAiContextEvidenceRef extends Record<string, unknown>/);
  assert.match(bridge, /export function buildWorkspaceEvidenceInputFromAiContext/);
  assert.match(bridge, /export function buildWorkspaceAiContextEvidenceRef/);
  assert.match(bridge, /export function buildWorkspaceEvidenceInputsFromAiContextBasket/);
  assert.match(bridge, /export function appendAiContextToWorkspaceEvidence/);
  assert.match(bridge, /export function appendAiContextBasketToWorkspaceEvidence/);
  assert.match(bridge, /id: `ai-context:\$\{item\.id\}`/);
  assert.match(bridge, /source: "ai-context"/);
  assert.match(bridge, /kind: "context"/);
  assert.match(bridge, /title: `AI context · \$\{item\.title\}`/);
  assert.match(bridge, /contextId: item\.id/);
  assert.match(bridge, /path: item\.path/);
  assert.match(bridge, /stats: item\.stats/);
  assert.match(bridge, /context: item\.context/);
  assert.match(bridge, /appendWorkspaceEvidence\(buildWorkspaceEvidenceInputFromAiContext\(item\)\)/);
});
