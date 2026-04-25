import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

import { createSkillsService } from "../../dist/apps/api/modules/skills/service.js";

function makeTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "studio-skills-lifecycle-"));
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeSkill(root, relativeDir, skillName, meta = {}) {
  const dir = path.join(root, relativeDir, skillName);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "SKILL.md"), `---\nname: ${skillName}\n---\n# ${skillName}\n`, "utf8");
  fs.writeFileSync(path.join(dir, "_meta.json"), `${JSON.stringify({ slug: skillName, ...meta }, null, 2)}\n`, "utf8");
  return dir;
}

function createSkillZip(root, skillName, options = {}) {
  const archiveRoot = path.join(root, `archive-${skillName}`);
  const skillDir = path.join(archiveRoot, options.nested === false ? "" : skillName);
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(path.join(skillDir, "SKILL.md"), `---\nname: ${skillName}\n---\n# ${skillName}\n`, "utf8");
  fs.writeFileSync(path.join(skillDir, "README.md"), `# ${skillName}\n`, "utf8");
  if (options.secondSkill) {
    const secondDir = path.join(archiveRoot, "second");
    fs.mkdirSync(secondDir, { recursive: true });
    fs.writeFileSync(path.join(secondDir, "SKILL.md"), "---\nname: second\n---\n# second\n", "utf8");
  }
  const zipPath = path.join(root, `${skillName}.zip`);
  execFileSync("python3", [
    "-c",
    `
import sys
import zipfile
from pathlib import Path
root = Path(sys.argv[1])
zip_path = Path(sys.argv[2])
with zipfile.ZipFile(zip_path, "w") as zf:
    for file in root.rglob("*"):
        if file.is_file():
            zf.write(file, file.relative_to(root).as_posix())
`,
    archiveRoot,
    zipPath,
  ]);
  return {
    fileName: path.basename(zipPath),
    dataBase64: fs.readFileSync(zipPath).toString("base64"),
  };
}

function createConfig(root) {
  return {
    pluginId: "studio",
    pluginName: "OpenClaw Studio",
    version: "0.1.0",
    port: 3760,
    autoStart: true,
    openclawRoot: root,
    openclawConfigFile: path.join(root, "openclaw.json"),
    projectRoot: "/tmp/openclaw-studio-extension",
    webDistDir: "/tmp/openclaw-studio-extension/apps/web-vue/dist",
    gatewayPort: 31879,
    gatewayWsUrl: "ws://127.0.0.1:31879",
    gatewayControlUiBasePath: "",
    transport: {
      standalone: { enabled: true, port: 3760 },
      gateway: { enabled: false, basePath: "/studio" },
    },
  };
}

async function withNoOpenClawCli(fn) {
  const previousPath = process.env.PATH;
  process.env.PATH = "/usr/bin:/bin";
  try {
    await fn();
  } finally {
    process.env.PATH = previousPath;
  }
}

test("skills service exposes default, managed, and agent install targets", async () => {
  await withNoOpenClawCli(async () => {
    const root = makeTempRoot();
    const config = createConfig(root);
    writeJson(config.openclawConfigFile, {
      agents: {
        list: [
          { id: "main", name: "Main", workspace: path.join(root, "workspace") },
          { id: "frontend", name: "Frontend", workspace: path.join(root, "workspace-frontend") },
        ],
      },
    });

    const service = createSkillsService(config);
    const targets = await service.getTargets();

    assert.ok(targets.targets.find((target) => target.id === "default-workspace"));
    assert.ok(targets.targets.find((target) => target.id === "managed"));
    assert.ok(targets.targets.find((target) => target.id === "agent:frontend"));
  });
});

test("skills lifecycle copies, moves, maps, syncs, and deletes safe targets", async () => {
  await withNoOpenClawCli(async () => {
    const root = makeTempRoot();
    const config = createConfig(root);
    writeJson(config.openclawConfigFile, {
      agents: {
        list: [
          { id: "main", name: "Main", workspace: path.join(root, "workspace") },
          { id: "frontend", name: "Frontend", workspace: path.join(root, "workspace-frontend") },
        ],
      },
    });
    const service = createSkillsService(config);
    const sourcePath = writeSkill(root, "workspace/skills", "alpha");

    const copy = await service.runLifecycleAction({
      action: "copy",
      slug: "alpha",
      destination: { scope: "agent-workspace", agentId: "frontend" },
      replaceExisting: true,
    });
    assert.equal(copy.success, true);
    assert.equal(fs.existsSync(path.join(root, "workspace-frontend", "skills", "alpha", "SKILL.md")), true);

    const promote = await service.runLifecycleAction({
      action: "promote",
      slug: "alpha",
      source: { scope: "agent-workspace", agentId: "frontend" },
      replaceExisting: true,
    });
    assert.equal(promote.success, true);
    assert.equal(fs.existsSync(path.join(root, "skills", "alpha", "SKILL.md")), true);

    const map = await service.runLifecycleAction({
      action: "map",
      slug: "alpha",
      agentIds: ["frontend"],
    });
    assert.equal(map.affectedAgents[0]?.agentId, "frontend");
    const mappedConfig = JSON.parse(fs.readFileSync(config.openclawConfigFile, "utf8"));
    assert.deepEqual(mappedConfig.agents.list.find((agent) => agent.id === "frontend").skills, ["alpha"]);

    const mappedSummary = await service.getSummary({ refresh: true });
    const mappedSkill = mappedSummary.skills.find((skill) => skill.slug === "alpha");
    assert.equal(mappedSkill?.agentMappings.some((mapping) => mapping.agentId === "frontend"), true);

    const sync = await service.runLifecycleAction({ action: "sync", slug: "alpha" });
    assert.ok(sync.affectedAgents.length >= 1 || sync.skippedAgents.length >= 1);

    const deleted = await service.runLifecycleAction({
      action: "delete",
      slug: "alpha",
      source: { scope: "managed" },
      deleteMode: "physical-and-mappings",
      confirmAffected: true,
    });
    assert.equal(deleted.success, true);
    assert.equal(fs.existsSync(path.join(root, "skills", "alpha")), false);

    assert.equal(fs.existsSync(sourcePath), true, "managed delete should not remove original default workspace copy");
  });
});

test("skills upload validates archive shape and installs into shared target by default", async () => {
  await withNoOpenClawCli(async () => {
    const root = makeTempRoot();
    const config = createConfig(root);
    writeJson(config.openclawConfigFile, {
      agents: {
        list: [
          { id: "main", name: "Main", workspace: path.join(root, "workspace") },
        ],
      },
    });
    const service = createSkillsService(config);
    const archive = createSkillZip(root, "uploaded-skill");

    const preflight = await service.preflightUploadedSkillArchive(archive);
    assert.equal(preflight.suggestedSlug, "uploaded-skill");
    assert.equal(preflight.preflight.payload.hasSkillMd, true);

    const installed = await service.installUploadedSkillArchive({
      ...archive,
      replaceExisting: false,
    });
    assert.equal(installed.success, true);
    assert.equal(installed.target?.scope, "managed");
    assert.equal(fs.existsSync(path.join(root, "skills", "uploaded-skill", "SKILL.md")), true);
  });
});

test("skills upload rejects archives with multiple skill roots", async () => {
  await withNoOpenClawCli(async () => {
    const root = makeTempRoot();
    const config = createConfig(root);
    writeJson(config.openclawConfigFile, { agents: { list: [] } });
    const service = createSkillsService(config);
    const archive = createSkillZip(root, "multi-skill", { secondSkill: true });

    await assert.rejects(
      () => service.preflightUploadedSkillArchive(archive),
      /multiple SKILL\.md/i,
    );
  });
});

test("skills summary includes managed directory skills even when CLI snapshot omits them", async () => {
  await withNoOpenClawCli(async () => {
    const root = makeTempRoot();
    const config = createConfig(root);
    writeJson(config.openclawConfigFile, { agents: { list: [] } });
    writeSkill(root, "skills", "managed-only");

    const service = createSkillsService(config);
    const summary = await service.getSummary({ refresh: true });
    const skill = summary.skills.find((item) => item.slug === "managed-only");

    assert.ok(skill, "managed directory skill should be included in summary");
    assert.equal(skill.paths.managedPath, path.join(root, "skills", "managed-only"));
  });
});
