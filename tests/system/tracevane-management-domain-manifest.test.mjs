import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const packageJson = JSON.parse(
  fs.readFileSync(path.join(root, "package.json"), "utf8"),
);
const manifestSource = fs.readFileSync(
  path.join(
    root,
    "apps",
    "web-vue",
    "src",
    "features",
    "management",
    "management-domain-manifest.ts",
  ),
  "utf8",
);

test("management domain manifest covers config agents channels skills files cron", () => {
  assert.match(manifestSource, /id:\s*["']config["']/);
  assert.match(manifestSource, /id:\s*["']agents["']/);
  assert.match(manifestSource, /id:\s*["']channels["']/);
  assert.match(manifestSource, /id:\s*["']skills["']/);
  assert.match(manifestSource, /id:\s*["']files["']/);
  assert.match(manifestSource, /id:\s*["']cron["']/);
  assert.doesNotMatch(manifestSource, /id:\s*["']plugins["']/);
});

test("management domain manifest exports a machine readable coverage seed", () => {
  assert.match(manifestSource, /MANAGEMENT_DOMAIN_COVERAGE_SEED/);
  assert.match(manifestSource, /webViewFile/);
  assert.match(manifestSource, /apiModuleDir/);
  assert.match(manifestSource, /testPattern/);
});

test("all active management views consume the shared manifest in runtime wiring", () => {
  const views = [
    ["ConfigView.vue", "config"],
    ["AgentsView.vue", "agents"],
    ["ChannelsView.vue", "channels"],
    ["SkillsView.vue", "skills"],
    ["FilesView.vue", "files"],
    ["CronView.vue", "cron"],
  ];

  for (const [file, domainId] of views) {
    const source = fs.readFileSync(
      path.join(root, "apps", "web-vue", "src", "views", file),
      "utf8",
    );
    assert.match(source, /getManagementDomainEntry/);
    assert.match(
      source,
      new RegExp(`getManagementDomainEntry\\(['\"]${domainId}['\"]\\)`),
    );
    assert.match(source, /managementEntry/);
  }
});

test("skills coverage seed points at concrete skills workspace tests", () => {
  assert.match(
    manifestSource,
    /id:\s*["']skills["'][\s\S]*testPattern:\s*["']tracevane-web-skills-\*\.test\.mjs["']/,
  );
});

test("package json declares tracevane management coverage script", () => {
  assert.equal(
    typeof packageJson.scripts?.["tracevane:management-coverage"],
    "string",
  );
  assert.ok(
    packageJson.scripts["tracevane:management-coverage"].includes(
      "scripts/tracevane-management-coverage.mjs",
    ),
  );
});
