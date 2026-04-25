import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function read(filePath) {
  return fs.readFileSync(path.join(rootDir, filePath), "utf8");
}

const typesSource = read("types/skills.ts");
const skillsApi = read("apps/web-vue/src/features/skills/api.ts");
const skillsRoutes = read("apps/api/modules/skills/routes.ts");
const skillsService = read("apps/api/modules/skills/service.ts");
const skillsControlPage = read("apps/web-vue/src/features/skills/SkillsControlPage.vue");

test("skills types expose install targets, canonical identity, and lifecycle contracts", () => {
  assert.match(typesSource, /SkillInstallTargetScope/);
  assert.match(typesSource, /SkillTargetDescriptor/);
  assert.match(typesSource, /SkillPhysicalCopy/);
  assert.match(typesSource, /SkillAgentMapping/);
  assert.match(typesSource, /agentMappings:\s*SkillAgentMapping\[\]/);
  assert.match(typesSource, /SkillsLifecyclePayload/);
  assert.match(typesSource, /SkillsLifecycleResponse/);
  assert.match(typesSource, /installedAs:\s*string\s*\|\s*null/);
  assert.match(typesSource, /installedReason:\s*string\s*\|\s*null/);
});

test("skills API and routes expose target discovery and lifecycle actions", () => {
  assert.match(skillsApi, /fetchSkillTargets/);
  assert.match(skillsApi, /runSkillLifecycleAction/);
  assert.match(skillsApi, /preflightUploadedSkillArchive/);
  assert.match(skillsApi, /installUploadedSkillArchive/);
  assert.match(skillsRoutes, /\/api\/skills\/targets/);
  assert.match(skillsRoutes, /\/api\/skills\/lifecycle/);
  assert.match(skillsRoutes, /\/api\/skills\/upload\/preflight/);
  assert.match(skillsRoutes, /\/api\/skills\/upload\/install/);
});

test("skills service resolves targets safely and avoids slug-only installed checks", () => {
  assert.match(skillsService, /resolveSkillTarget/);
  assert.match(skillsService, /assertSafeTargetPath/);
  assert.match(skillsService, /buildInstalledAliasSet/);
  assert.match(skillsService, /resolveMarketplaceInstalledState/);
  assert.match(skillsService, /runLifecycleAction/);
  assert.match(skillsService, /locateUniqueSkillRoot/);
  assert.match(skillsService, /extractZipSafely/);
  assert.match(skillsService, /preflightUploadedSkillArchive/);
  assert.match(skillsService, /installUploadedSkillArchive/);
  assert.doesNotMatch(skillsService, /installed:\s*installedSlugs\.has\(slug\)/);
});

test("skills UI exposes install target selector and lifecycle panel", () => {
  assert.match(skillsControlPage, /marketInstallTargetId/);
  assert.match(skillsControlPage, /fetchSkillTargets/);
  assert.match(skillsControlPage, /Agent 复用矩阵|Agent reuse matrix/);
  assert.match(skillsControlPage, /agentSkillMatrixRows/);
  assert.match(skillsControlPage, /mode === 'local-install'/);
  assert.match(skillsControlPage, /本地安装|Local Install/);
  assert.match(skillsControlPage, /上传技能压缩包|Upload skill archive/);
  assert.match(skillsControlPage, /handleUploadArchiveChange/);
  assert.match(skillsControlPage, /生命周期操作|Lifecycle actions/);
  assert.match(skillsControlPage, /requestSkillLifecycleAction\('copy'\)/);
  assert.match(skillsControlPage, /requestSkillLifecycleAction\('move'\)/);
  assert.match(skillsControlPage, /requestSkillLifecycleAction\('promote'\)/);
  assert.match(skillsControlPage, /requestSkillLifecycleAction\('map'\)/);
  assert.match(skillsControlPage, /requestSkillLifecycleAction\('sync'\)/);
  assert.match(skillsControlPage, /requestSkillLifecycleAction\('delete'\)/);
  assert.match(skillsControlPage, /requestSkillLifecycleForAgent\('unmap'/);
});
