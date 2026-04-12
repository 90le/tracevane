import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(testDir, "../..");

const agentsView = fs.readFileSync(
  path.join(rootDir, "apps/web-vue/src/views/AgentsView.vue"),
  "utf8",
);

const workspaceLayout = fs.readFileSync(
  path.join(rootDir, "apps/web-vue/src/features/agents/AgentsWorkspaceLayout.vue"),
  "utf8",
);

const recipeFilePath = path.join(
  rootDir,
  "apps/web-vue/src/features/agents/agents-overview-recipe.ts",
);

const agentsApi = fs.readFileSync(
  path.join(rootDir, "apps/web-vue/src/features/agents/api.ts"),
  "utf8",
);

const agentsService = fs.readFileSync(
  path.join(rootDir, "apps/api/modules/agents/service.ts"),
  "utf8",
);

test("agents view wires the roster-plus-stage recipe seam into workspace layout", () => {
  assert.match(
    agentsView,
    /import\s+\{\s*buildAgentsOverviewRecipe\s*\}\s+from\s+'\.\.\/features\/agents\/agents-overview-recipe'/,
  );
  assert.match(agentsView, /const\s+overviewRecipe\s*=\s*buildAgentsOverviewRecipe\(/);
  assert.match(
    agentsView,
    /<AgentsWorkspaceLayout\s+:overview-recipe="overviewRecipe"\s*\/>/,
  );
});

test("agents overview recipe exports roster and workspace summary builders", () => {
  const recipe = fs.readFileSync(recipeFilePath, "utf8");
  assert.match(recipe, /export interface AgentsOverviewRecipe/);
  assert.match(recipe, /buildAgentRosterSummary/);
  assert.match(recipe, /buildAgentWorkspaceSummary/);
  assert.match(recipe, /export function buildAgentsOverviewRecipe\(/);
});

test("agents workspace layout consumes injected overview recipe", () => {
  assert.match(workspaceLayout, /overviewRecipe\?:\s*AgentsOverviewRecipe/);
  assert.match(workspaceLayout, /const\s+recipe\s*=\s*computed\(\(\)\s*=>\s*props\.overviewRecipe\s*\?\?\s*buildAgentsOverviewRecipe\(\)\)/);
  assert.match(workspaceLayout, /recipe\.value\.buildAgentRosterSummary\(/);
  assert.match(workspaceLayout, /recipe\.value\.buildAgentWorkspaceSummary\(/);
});

test("agents api and service expose workspace-summary helpers", () => {
  assert.match(agentsApi, /buildAgentRosterSummary/);
  assert.match(agentsApi, /buildAgentWorkspaceSummary/);
  assert.match(agentsService, /export function buildAgentRosterSummary\(/);
  assert.match(agentsService, /export function buildAgentWorkspaceSummary\(/);
});
