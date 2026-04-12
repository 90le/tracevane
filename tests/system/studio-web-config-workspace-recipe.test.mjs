import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(testDir, "../..");

const configView = fs.readFileSync(
  path.join(rootDir, "apps/web-vue/src/views/ConfigView.vue"),
  "utf8",
);

const configEditorPage = fs.readFileSync(
  path.join(rootDir, "apps/web-vue/src/features/config/ConfigEditorPage.vue"),
  "utf8",
);

const workspaceSections = fs.readFileSync(
  path.join(
    rootDir,
    "apps/web-vue/src/features/config/config-workspace-sections.ts",
  ),
  "utf8",
);

const overviewRecipe = fs.readFileSync(
  path.join(
    rootDir,
    "apps/web-vue/src/features/config/config-overview-recipe.ts",
  ),
  "utf8",
);

test("config view routes through a shell-era workspace recipe seam", () => {
  assert.match(
    configView,
    /import\s+\{\s*buildConfigWorkspaceSections\s*\}\s+from\s+'\.\.\/features\/config\/config-workspace-sections'/,
  );
  assert.match(
    configView,
    /import\s+\{\s*buildConfigOverviewRecipe\s*\}\s+from\s+'\.\.\/features\/config\/config-overview-recipe'/,
  );
  assert.match(
    configView,
    /import\s+\{\s*getManagementDomainEntry\s*\}\s+from\s+'\.\.\/features\/management\/management-domain-manifest'/,
  );
  assert.match(
    configView,
    /<ConfigEditorPage\s+:workspace-sections="workspaceSections"\s+:overview-recipe="overviewRecipe"\s*\/>/,
  );
  assert.match(configView, /getManagementDomainEntry\('config'\)/);
  assert.match(
    configView,
    /const workspaceSections\s*=\s*computed\(\(\)\s*=>\s*buildConfigWorkspaceSections\(/,
  );
  assert.match(configView, /buildConfigOverviewRecipe\(text\)/);
  assert.match(configView, /sidebarTitle:\s*text\(`/);
});

test("workspace section builder exports the single config tab source", () => {
  assert.match(workspaceSections, /export interface ConfigWorkspaceSection/);
  assert.match(workspaceSections, /export const CONFIG_TAB_IDS\s*=\s*\[/);
  assert.match(
    workspaceSections,
    /export const DEFAULT_CONFIG_WORKSPACE_SECTIONS\s*=\s*\[/,
  );
  assert.match(
    workspaceSections,
    /export function buildConfigWorkspaceSections\(/,
  );
  assert.match(workspaceSections, /id:\s*["']model["']/);
  assert.match(workspaceSections, /id:\s*["']security["']/);
  assert.match(workspaceSections, /id:\s*["']session["']/);
  assert.match(workspaceSections, /id:\s*["']providers["']/);
});

test("overview recipe builder owns both signal metadata and key-to-value mapping", () => {
  assert.match(overviewRecipe, /export interface ConfigOverviewSignal/);
  assert.match(overviewRecipe, /export function buildConfigOverviewRecipe\(/);
  assert.match(overviewRecipe, /export function buildConfigOverviewSignals\(/);
  assert.match(overviewRecipe, /export function buildConfigSidebarSummary\(/);
});

test("config editor page consumes unified tab source and built overview signals only", () => {
  assert.match(
    configEditorPage,
    /workspaceSections\?:\s*ConfigWorkspaceSection\[]/,
  );
  assert.match(configEditorPage, /overviewRecipe\?:\s*ConfigOverviewRecipe/);
  assert.match(configEditorPage, /CONFIG_TAB_IDS/);
  assert.match(configEditorPage, /DEFAULT_CONFIG_WORKSPACE_SECTIONS/);
  assert.match(
    configEditorPage,
    /const tabs\s*=\s*computed\(\(\)\s*=>\s*props\.workspaceSections\?\.length\s*\?\s*props\.workspaceSections\s*:\s*DEFAULT_CONFIG_WORKSPACE_SECTIONS\)/,
  );
  assert.match(configEditorPage, /buildConfigOverviewSignals\(/);
  assert.match(configEditorPage, /buildConfigSidebarSummary\(/);
  assert.doesNotMatch(configEditorPage, /signal\.key === 'defaultModel'/);
  assert.doesNotMatch(configEditorPage, /signal\.key === 'imageModel'/);
  assert.doesNotMatch(configEditorPage, /signal\.key === 'providers'/);
  assert.doesNotMatch(configEditorPage, /signal\.key === 'syncedAt'/);
});
