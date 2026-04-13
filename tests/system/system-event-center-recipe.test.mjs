import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import "tsx/esm";

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const modulePath = path.join(
  rootDir,
  "apps/web-vue/src/features/system/system-event-center-recipe.ts",
);
const moduleUrl = `${pathToFileURL(modulePath).href}?t=${Date.now()}`;

test("system event center recipe exports default recipe builder", async () => {
  const recipeModule = await import(moduleUrl);
  assert.equal(
    typeof recipeModule.buildDefaultSystemEventCenterRecipe,
    "function",
  );

  const text = (zh, en) => zh || en;
  const recipe = recipeModule.buildDefaultSystemEventCenterRecipe(text);

  assert.equal(typeof recipe.pageTitle, "string");
  assert.equal(typeof recipe.pageCopy, "string");
  assert.ok(Array.isArray(recipe.summaryCards));
  assert.equal(recipe.summaryCards.length, 4);
  assert.ok(
    recipe.summaryCards.every((entry) => typeof entry.label === "string"),
  );
});
