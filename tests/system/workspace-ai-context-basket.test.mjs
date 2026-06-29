import { test } from "node:test";
import assert from "node:assert";
import fs from "node:fs";

const readWeb = (rel) =>
  fs.readFileSync(new URL(`../../apps/web/src/${rel}`, import.meta.url), "utf-8");

test("Workspace AI context basket has a shared durable document item contract", () => {
  const basket = readWeb("features/workspace/shared/WorkspaceAiContextBasket.ts");
  const workbench = readWeb("features/workspace/shared/DocumentWorkbench.tsx");
  assert.match(basket, /export interface WorkspaceAiContextBasketItem/);
  assert.match(basket, /kind: WorkspaceAiContextKind/);
  assert.match(basket, /context: string/);
  assert.match(basket, /addedAt: string/);
  assert.match(basket, /export function readWorkspaceAiContextBasket/);
  assert.match(basket, /export function writeWorkspaceAiContextBasket/);
  assert.match(basket, /export function addDocumentToAiContextBasket/);
  assert.match(basket, /export function exportWorkspaceAiContextBundle/);
  assert.match(basket, /WORKSPACE_AI_CONTEXT_BASKET_LIMIT = 24/);
  assert.match(basket, /tracevane\.workspace\.ai-context-basket\.v1/);
  assert.match(basket, /tracevane:workspace-ai-context-basket-updated/);
  assert.match(basket, /new CustomEvent\(TRACEVANE_WORKSPACE_AI_CONTEXT_BASKET_EVENT/);
  assert.match(basket, /id: `document:\$\{path\}`/);
  assert.match(workbench, /from "\.\/WorkspaceAiContextBasket"/);
  assert.doesNotMatch(workbench, /const WORKSPACE_AI_CONTEXT_BASKET_STORAGE_KEY/);
});
