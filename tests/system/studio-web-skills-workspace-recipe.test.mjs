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
  assert.match(skillsControlPage, /overviewRecipe\.value\.pluginsHeadline/);
  assert.doesNotMatch(skillsControlPage, /DEFAULT_SKILLS_OVERVIEW_RECIPE/);
});

test("skills overview recipe exports typed default recipe builder", () => {
  assert.match(skillsOverviewRecipe, /export interface SkillsOverviewRecipe/);
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
