import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(testDir, "../..");

const skillsView = fs.readFileSync(
  path.join(rootDir, "apps/web-vue/src/views/SkillsView.vue"),
  "utf8",
);

const skillsControlPage = fs.readFileSync(
  path.join(rootDir, "apps/web-vue/src/features/skills/SkillsControlPage.vue"),
  "utf8",
);

const skillsWorkspaceCss = fs.readFileSync(
  path.join(rootDir, "apps/web-vue/src/features/skills/skills-workspace.css"),
  "utf8",
);

const skillsOverviewRecipe = fs.readFileSync(
  path.join(
    rootDir,
    "apps/web-vue/src/features/skills/skills-overview-recipe.ts",
  ),
  "utf8",
);

const skillsApi = fs.readFileSync(
  path.join(rootDir, "apps/web-vue/src/features/skills/api.ts"),
  "utf8",
);

const skillsService = fs.readFileSync(
  path.join(rootDir, "apps/api/modules/skills/service.ts"),
  "utf8",
);

test("skills view wires through overview recipe seam", () => {
  assert.match(
    skillsView,
    /import\s+\{\s*buildDefaultSkillsOverviewRecipe\s*\}\s+from\s+'\.\.\/features\/skills\/skills-overview-recipe'/,
  );
  assert.match(
    skillsView,
    /import\s+\{\s*getManagementDomainEntry\s*\}\s+from\s+'\.\.\/features\/management\/management-domain-manifest'/,
  );
  assert.match(skillsView, /getManagementDomainEntry\('skills'\)/);
  assert.match(skillsView, /buildDefaultSkillsOverviewRecipe\(text\)/);
  assert.match(skillsView, /pageEyebrow:\s*entry\.label/);
  assert.match(
    skillsView,
    /<SkillsControlPage\s+:overview-recipe="overviewRecipe"\s*\/>/,
  );
});

test("skills control page consumes recipe content for workspace copy", () => {
  assert.match(skillsControlPage, /overviewRecipe\?:\s*SkillsOverviewRecipe/);
  assert.match(
    skillsControlPage,
    /const\s+overviewRecipe\s*=\s*computed\(\(\)\s*=>\s*props\.overviewRecipe\s*\?\?\s*buildDefaultSkillsOverviewRecipe\(text\)\)/,
  );
  assert.match(skillsControlPage, /overviewRecipe\.value\.pageTitle/);
  assert.match(skillsControlPage, /overviewRecipe\.value\.installedHeadline/);
  assert.match(skillsControlPage, /overviewRecipe\.value\.marketplaceHeadline/);
  assert.match(skillsControlPage, /overviewRecipe\.value\.uploadHeadline/);
  assert.match(skillsControlPage, /skills-workspace-strip/);
  assert.match(skillsControlPage, /activeModeTitle/);
  assert.match(skillsControlPage, /activeModeSummary/);
  assert.match(skillsControlPage, /import '\.\/skills-workspace\.css';/);
  assert.doesNotMatch(skillsControlPage, /<style scoped>/);
  assert.doesNotMatch(skillsControlPage, /只关注本地技能、依赖缺口和维护动作/);
  assert.match(skillsWorkspaceCss, /\.skills-workspace-strip/);
  assert.match(skillsWorkspaceCss, /\.skills-workspace-copy/);
  assert.match(
    skillsWorkspaceCss,
    /\.skills-workspace-strip\s*\{[\s\S]*background:\s*var\(--surface-base\);[\s\S]*box-shadow:\s*none;/,
  );
  assert.match(
    skillsWorkspaceCss,
    /\.skills-workspace-copy\s*\{[\s\S]*border-left:\s*3px solid var\(--acc\);/,
  );
  assert.match(skillsWorkspaceCss, /\.skills-mode-strip/);
  assert.doesNotMatch(skillsControlPage, /skills-command-panel|skills-command-copy|skills-mode-switch/);
  assert.doesNotMatch(skillsWorkspaceCss, /\.skills-command-panel|\.skills-command-copy|\.skills-mode-switch/);
  assert.match(
    skillsWorkspaceCss,
    /\.skills-board\s*\{[\s\S]*background:\s*var\(--surface-base\);[\s\S]*box-shadow:\s*var\(--mono-shadow-sm,/,
  );
  assert.match(skillsControlPage, /skills-agent-matrix-row/);
  assert.doesNotMatch(skillsControlPage, /skills-agent-matrix-card|skills-plugin-card/);
  assert.match(
    skillsWorkspaceCss,
    /\.skills-agent-matrix-grid\s*\{[\s\S]*gap:\s*0;[\s\S]*background:\s*var\(--surface-base\);/,
  );
  assert.match(
    skillsWorkspaceCss,
    /\.skills-facts-grid,\s*\n\.skills-maintenance-grid\s*\{[\s\S]*gap:\s*0;[\s\S]*background:\s*var\(--surface-base\);/,
  );
  assert.match(
    skillsWorkspaceCss,
    /\.skills-missing-grid\s*\{[\s\S]*gap:\s*0;[\s\S]*background:\s*var\(--surface-base\);/,
  );
  assert.match(
    skillsWorkspaceCss,
    /\.skills-fact,\s*\n\.skills-fact-line\s*\{[\s\S]*border-radius:\s*0;[\s\S]*background:\s*transparent;[\s\S]*inset -1px 0 0 var\(--line\)/,
  );
  assert.doesNotMatch(skillsWorkspaceCss, /\.skills-workspace-strip\s*\{[\s\S]*linear-gradient/);
  assert.doesNotMatch(skillsControlPage, /DEFAULT_SKILLS_OVERVIEW_RECIPE/);
});

test("skills workspace surfaces inherit DuoYuan tokens instead of local glass colors", () => {
  assert.doesNotMatch(
    skillsWorkspaceCss,
    /var\(--surface\)|rgba\(|#[0-9a-fA-F]{3,6}|linear-gradient|radial-gradient|--sky|--atlas|--glass/,
  );
  assert.match(skillsWorkspaceCss, /background:\s*var\(--modal-backdrop\);/);
  assert.match(skillsWorkspaceCss, /box-shadow:\s*var\(--mono-shadow-md\);/);
  assert.match(skillsWorkspaceCss, /\.skills-detail-tab\s*\{[\s\S]*background:\s*var\(--button-secondary-bg\);/);
  assert.match(skillsWorkspaceCss, /\.skills-checkbox-row\s*\{[\s\S]*background:\s*var\(--surface-raised\);/);
  assert.match(
    skillsWorkspaceCss,
    /\.skills-preflight-group\.risk-high\s*\{[\s\S]*color-mix\(in srgb,\s*var\(--danger\)/,
  );
  assert.match(
    skillsWorkspaceCss,
    /\.skills-preflight-group\.risk-medium\s*\{[\s\S]*color-mix\(in srgb,\s*var\(--peach\)/,
  );
  assert.match(
    skillsWorkspaceCss,
    /\.skills-preflight-group\.risk-low\s*\{[\s\S]*color-mix\(in srgb,\s*var\(--success\)/,
  );
});

test("skills overview recipe exports typed default recipe builder", () => {
  assert.match(skillsOverviewRecipe, /export interface SkillsOverviewRecipe/);
  assert.match(skillsOverviewRecipe, /uploadHeadline:\s*string/);
  assert.match(skillsOverviewRecipe, /uploadCopy:\s*string/);
  assert.doesNotMatch(skillsOverviewRecipe, /pluginsHeadline:\s*string/);
  assert.match(
    skillsOverviewRecipe,
    /export function buildDefaultSkillsOverviewRecipe\(/,
  );
});

test("skills api and service keep seam builders and overview aliases out of transport layers", () => {
  assert.doesNotMatch(skillsApi, /buildDefaultSkillsOverviewRecipe/);
  assert.doesNotMatch(skillsApi, /fetchSkillsOverview/);
  assert.doesNotMatch(skillsService, /buildDefaultSkillsOverviewRecipe/);
  assert.doesNotMatch(skillsService, /getOverview\(/);
});
