import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import ts from "typescript";
import { pathToFileURL, fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(testDir, "../..");

const agentsView = fs.readFileSync(
  path.join(rootDir, "apps/web-vue/src/views/AgentsView.vue"),
  "utf8",
);

const workspaceLayout = fs.readFileSync(
  path.join(
    rootDir,
    "apps/web-vue/src/features/agents/AgentsWorkspaceLayout.vue",
  ),
  "utf8",
);

const workspaceSummaryPath = path.join(
  rootDir,
  "apps/web-vue/src/features/agents/agent-workspace-summary.ts",
);
const workspaceSummarySource = fs.readFileSync(workspaceSummaryPath, "utf8");

const agentsApi = fs.readFileSync(
  path.join(rootDir, "apps/web-vue/src/features/agents/api.ts"),
  "utf8",
);

const agentsService = fs.readFileSync(
  path.join(rootDir, "apps/api/modules/agents/service.ts"),
  "utf8",
);

async function importTranspiledWorkspaceSummary() {
  const source = fs.readFileSync(workspaceSummaryPath, "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: workspaceSummaryPath,
  }).outputText;
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "agents-summary-test-"),
  );
  const tempFile = path.join(tempDir, "agent-workspace-summary.mjs");
  fs.writeFileSync(tempFile, transpiled, "utf8");
  return import(pathToFileURL(tempFile).href);
}

test("agents view keeps workspace layout wiring minimal while consuming management manifest", () => {
  assert.match(
    agentsView,
    /import\s+\{\s*getManagementDomainEntry\s*\}\s+from\s+'\.\.\/features\/management\/management-domain-manifest'/,
  );
  assert.match(agentsView, /getManagementDomainEntry\('agents'\)/);
  assert.match(
    agentsView,
    /<AgentsWorkspaceLayout\s+:management-entry="managementEntry"\s*\/>/,
  );
  assert.doesNotMatch(agentsView, /overview-recipe/);
  assert.doesNotMatch(agentsView, /buildAgentsOverviewRecipe/);
});

test("agents workspace layout computes roster groups directly from local helpers", () => {
  assert.match(
    workspaceLayout,
    /buildAgentRosterSummary\s*\}\s+from\s+'\.\/agent-workspace-summary'/,
  );
  assert.match(workspaceLayout, /const\s+rosterSummary\s*=\s*computed\(/);
  assert.match(workspaceLayout, /buildAgentRosterSummary\(\{/);
  assert.doesNotMatch(workspaceLayout, /overviewRecipe\?:/);
  assert.doesNotMatch(workspaceLayout, /buildAgentsOverviewRecipe/);
  assert.doesNotMatch(workspaceLayout, /workspaceSummary/);
});

test("buildAgentRosterSummary keeps default rail isolated and sorts recent activity first", async () => {
  const { buildAgentRosterSummary } = await importTranspiledWorkspaceSummary();
  const summary = buildAgentRosterSummary({
    agents: [
      {
        id: "writer",
        isDefault: false,
        lastActiveAt: "2026-04-09T10:00:00.000Z",
      },
      {
        id: "main",
        isDefault: true,
        lastActiveAt: "2026-04-11T10:00:00.000Z",
      },
      {
        id: "ops",
        isDefault: false,
        lastActiveAt: "2026-04-10T10:00:00.000Z",
      },
    ],
    defaultAgentId: "main",
  });

  assert.deepEqual(
    summary.defaultRailAgents.map((agent) => agent.id),
    ["main"],
  );
  assert.deepEqual(
    summary.regularRailAgents.map((agent) => agent.id),
    ["ops", "writer"],
  );
  assert.deepEqual(
    summary.order.map((agent) => agent.id),
    ["main", "ops", "writer"],
  );
});

test("workspace helper keeps only roster logic in the web layer", () => {
  assert.match(
    workspaceSummarySource,
    /export function buildAgentRosterSummary\(/,
  );
  assert.doesNotMatch(
    workspaceSummarySource,
    /export function buildAgentWorkspaceSummary\(/,
  );
  assert.doesNotMatch(agentsApi, /export function buildAgentRosterSummary\(/);
  assert.doesNotMatch(
    agentsApi,
    /export function buildAgentWorkspaceSummary\(/,
  );
  assert.doesNotMatch(
    agentsService,
    /export function buildAgentRosterSummary\(/,
  );
  assert.doesNotMatch(
    agentsService,
    /export function buildAgentWorkspaceSummary\(/,
  );
});
