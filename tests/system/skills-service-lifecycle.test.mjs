import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import "tsx/esm";

import { createSkillsService } from "../../dist/apps/api/modules/skills/service.js";

const require = createRequire(import.meta.url);
const which = require("which");
const skillsServiceSource =
  await import("../../apps/api/modules/skills/service.ts");

const SKILLS_COMMAND_MAX_STREAM_BYTES = 8 * 1024 * 1024;

function makeTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "tracevane-skills-lifecycle-"));
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
  const pythonCommand = resolveTestPythonCommand();
  execFileSync(pythonCommand, [
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
    pluginId: "tracevane",
    pluginName: "Tracevane",
    version: "0.1.0",
    port: 3760,
    autoStart: true,
    openclawRoot: root,
    openclawConfigFile: path.join(root, "openclaw.json"),
    projectRoot: "/tmp/tracevane-extension",
    webDistDir: "/tmp/tracevane-extension/apps/web/dist",
    gatewayPort: 31879,
    gatewayWsUrl: "ws://127.0.0.1:31879",
    gatewayControlUiBasePath: "",
    transport: {
      standalone: { enabled: true, port: 3760 },
      gateway: { enabled: false, basePath: "/tracevane" },
    },
  };
}

function resolveTestPythonCommand() {
  for (const candidate of ["python3", "python"]) {
    const resolved = which.sync(candidate, { nothrow: true });
    if (resolved) return resolved;
  }
  throw new Error("python3 or python is required to create Skills zip fixtures");
}

async function withPythonOnlyPath(root, fn) {
  const pythonCommand = resolveTestPythonCommand();
  const binDir = path.join(root, "python-only-bin");
  const previousPath = process.env.PATH;
  fs.mkdirSync(binDir, { recursive: true });
  if (process.platform === "win32") {
    fs.writeFileSync(
      path.join(binDir, "python.cmd"),
      `@echo off\r\n"${pythonCommand}" %*\r\n`,
      "utf8",
    );
  } else {
    fs.symlinkSync(pythonCommand, path.join(binDir, "python"));
  }
  process.env.PATH = binDir;

  try {
    await fn();
  } finally {
    if (previousPath === undefined) delete process.env.PATH;
    else process.env.PATH = previousPath;
  }
}

function processIsRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error?.code === "EPERM") return true;
    if (error?.code === "ESRCH") return false;
    throw error;
  }
}

async function waitUntil(check, timeoutMs = 3_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (check()) return true;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return check();
}

function writeFakeMarketplaceCli(binDir, name, runnerPath) {
  if (process.platform === "win32") {
    const commandPath = path.join(binDir, `${name}.cmd`);
    fs.writeFileSync(
      commandPath,
      `@echo off\r\n"${process.execPath}" "%~dp0${path.basename(runnerPath)}" "${name}" %*\r\n`,
      "utf8",
    );
    return commandPath;
  }

  const commandPath = path.join(binDir, name);
  const behavior = name === "openclaw"
    ? `process.stdout.write(JSON.stringify({ workspaceDir: process.env.TRACEVANE_FAKE_SKILLS_WORKSPACE, managedSkillsDir: process.env.TRACEVANE_FAKE_SKILLS_MANAGED, skills: [] }));`
    : `const args = process.argv.slice(2);\nfs.appendFileSync(process.env.TRACEVANE_FAKE_SKILLS_CLI_LOG, JSON.stringify({ cli: ${JSON.stringify(name)}, args, cwd: process.cwd() }) + "\\n", "utf8");\nprocess.stdout.write(JSON.stringify({ cli: ${JSON.stringify(name)}, args, cwd: process.cwd() }));`;
  fs.writeFileSync(
    commandPath,
    `#!/usr/bin/env node\nconst fs = require("node:fs");\n${behavior}\n`,
    { encoding: "utf8", mode: 0o755 },
  );
  fs.chmodSync(commandPath, 0o755);
  return commandPath;
}

function createFakeMarketplaceCliFixture(root) {
  const binDir = path.join(root, "工具 CLI fixtures with spaces");
  const runnerPath = path.join(binDir, "fake-marketplace-cli.mjs");
  const logPath = path.join(root, "marketplace-cli.jsonl");
  fs.mkdirSync(binDir, { recursive: true });
  fs.writeFileSync(
    runnerPath,
    `import fs from "node:fs";\nconst [cli, ...args] = process.argv.slice(2);\nif (cli === "openclaw") {\n  process.stdout.write(JSON.stringify({ workspaceDir: process.env.TRACEVANE_FAKE_SKILLS_WORKSPACE, managedSkillsDir: process.env.TRACEVANE_FAKE_SKILLS_MANAGED, skills: [] }));\n} else {\n  fs.appendFileSync(process.env.TRACEVANE_FAKE_SKILLS_CLI_LOG, JSON.stringify({ cli, args, cwd: process.cwd() }) + "\\n", "utf8");\n  process.stdout.write(JSON.stringify({ cli, args, cwd: process.cwd() }));\n}\n`,
    "utf8",
  );
  writeFakeMarketplaceCli(binDir, "openclaw", runnerPath);
  writeFakeMarketplaceCli(binDir, "clawhub", runnerPath);
  writeFakeMarketplaceCli(binDir, "skillhub", runnerPath);
  return { binDir, logPath };
}

async function withFakeMarketplaceCli(root, fn) {
  const fixture = createFakeMarketplaceCliFixture(root);
  const previousPath = process.env.PATH;
  const previousLog = process.env.TRACEVANE_FAKE_SKILLS_CLI_LOG;
  const previousWorkspace = process.env.TRACEVANE_FAKE_SKILLS_WORKSPACE;
  const previousManaged = process.env.TRACEVANE_FAKE_SKILLS_MANAGED;
  const previousFetch = globalThis.fetch;
  let fetchCalls = 0;
  process.env.PATH = [fixture.binDir, path.dirname(process.execPath)].join(path.delimiter);
  process.env.TRACEVANE_FAKE_SKILLS_CLI_LOG = fixture.logPath;
  process.env.TRACEVANE_FAKE_SKILLS_WORKSPACE = path.join(root, "workspace");
  process.env.TRACEVANE_FAKE_SKILLS_MANAGED = path.join(root, "skills");
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error("network fallback is disabled in marketplace CLI tests");
  };
  try {
    await fn({ ...fixture, fetchCalls: () => fetchCalls });
  } finally {
    globalThis.fetch = previousFetch;
    if (previousPath === undefined) delete process.env.PATH;
    else process.env.PATH = previousPath;
    if (previousLog === undefined) delete process.env.TRACEVANE_FAKE_SKILLS_CLI_LOG;
    else process.env.TRACEVANE_FAKE_SKILLS_CLI_LOG = previousLog;
    if (previousWorkspace === undefined) delete process.env.TRACEVANE_FAKE_SKILLS_WORKSPACE;
    else process.env.TRACEVANE_FAKE_SKILLS_WORKSPACE = previousWorkspace;
    if (previousManaged === undefined) delete process.env.TRACEVANE_FAKE_SKILLS_MANAGED;
    else process.env.TRACEVANE_FAKE_SKILLS_MANAGED = previousManaged;
  }
}

async function withNoOpenClawCli(fn) {
  const previousPath = process.env.PATH;
  const binDir = fs.mkdtempSync(path.join(os.tmpdir(), "tracevane-no-openclaw-"));
  const commandPath = path.join(
    binDir,
    process.platform === "win32" ? "openclaw.cmd" : "openclaw",
  );
  fs.writeFileSync(
    commandPath,
    process.platform === "win32"
      ? "@echo off\r\nexit /b 1\r\n"
      : "#!/bin/sh\nexit 1\n",
    { encoding: "utf8", mode: 0o755 },
  );
  if (process.platform !== "win32") fs.chmodSync(commandPath, 0o755);
  process.env.PATH = [binDir, previousPath || ""].filter(Boolean).join(path.delimiter);
  try {
    await fn();
  } finally {
    if (previousPath === undefined) delete process.env.PATH;
    else process.env.PATH = previousPath;
    fs.rmSync(binDir, { recursive: true, force: true });
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

test("skills service detects and executes platform-native marketplace CLI shims", async () => {
  const parent = makeTempRoot();
  const root = path.join(parent, "技能 workspace with spaces");
  fs.mkdirSync(root, { recursive: true });
  const config = createConfig(root);
  writeJson(config.openclawConfigFile, { agents: { list: [] } });

  await withFakeMarketplaceCli(root, async ({ logPath, fetchCalls }) => {
    const service = createSkillsService(config);
    const summary = await service.getSummary({ refresh: true });
    assert.equal(summary.stale, false);
    assert.equal(summary.workspaceDir, path.join(root, "workspace"));
    assert.deepEqual(summary.tools, {
      clawhubInstalled: true,
      skillhubInstalled: true,
    });

    const installed = await service.installMarketplaceSkill({
      sourceId: "clawhub",
      slug: "portable-marketplace-skill",
    });
    assert.equal(installed.method, "clawhub-cli");
    assert.equal(fetchCalls(), 0, "successful CLI install must not use the network fallback");

    const records = fs
      .readFileSync(logPath, "utf8")
      .trim()
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    assert.deepEqual(records, [
      {
        cli: "clawhub",
        args: [
          "install",
          "portable-marketplace-skill",
          "--workdir",
          path.join(root, "workspace"),
          "--no-input",
        ],
        cwd: path.join(root, "workspace"),
      },
    ]);
  });
});

test("skills service command boundary is shell-free and assigns operation-specific timeouts", () => {
  const source = fs.readFileSync(
    path.resolve("apps/api/modules/skills/service.ts"),
    "utf8",
  );
  assert.match(source, /from "\.\.\/\.\.\/core\/owned-command\.js"/);
  assert.doesNotMatch(source, /from "cross-spawn"/);
  assert.match(source, /require\("which"\)/);
  assert.doesNotMatch(source, /command -v/);
  assert.match(source, /runOwnedCommand\(executable, args/);
  assert.match(source, /maxOutputBytes: SKILLS_COMMAND_MAX_STREAM_BYTES/);
  assert.match(source, /SKILLS_JSON_COMMAND_TIMEOUT_MS\s*=\s*20_000/);
  assert.match(source, /SKILLS_ZIP_COMMAND_TIMEOUT_MS\s*=\s*60_000/);
  assert.match(source, /SKILLS_MARKETPLACE_COMMAND_TIMEOUT_MS\s*=\s*120_000/);
  assert.match(
    source,
    /runSkillsCommand\(file, args, SKILLS_JSON_COMMAND_TIMEOUT_MS, cwd\)/,
  );
  assert.ok(
    (source.match(/SKILLS_ZIP_COMMAND_TIMEOUT_MS/g) || []).length >= 4,
    "the zip deadline must be passed to both marketplace and uploaded-archive extraction",
  );
  assert.ok(
    (source.match(/SKILLS_MARKETPLACE_COMMAND_TIMEOUT_MS/g) || []).length >= 3,
    "both marketplace CLI install paths must receive the marketplace deadline",
  );
  assert.match(source, /8 \* 1024 \* 1024/);
  assert.doesNotMatch(source, /taskkill\.exe/);
  assert.doesNotMatch(source, /posixGroupIsRunning/);
  assert.match(source, /Neither unzip nor Python \(python3\/python\) is available/);
});

test("skills command runner honors the timeout supplied by its caller", async () => {
  const runner = skillsServiceSource.runSkillsCommand;
  assert.equal(typeof runner, "function", "runSkillsCommand must be exported for focused command-boundary verification");
  const timeoutMs = 80;
  const startedAt = Date.now();
  await assert.rejects(
    () => runner(
      process.execPath,
      ["-e", "setInterval(() => {}, 1_000)"],
      timeoutMs,
    ),
    new RegExp(`Command timed out after ${timeoutMs}ms`),
  );
  assert.ok(Date.now() - startedAt < 5_000, "caller timeout should not fall back to a 20 second global deadline");
});

test("skills command runner caps captured output without blocking child exit", async () => {
  const runner = skillsServiceSource.runSkillsCommand;
  assert.equal(typeof runner, "function", "runSkillsCommand must be exported for focused command-boundary verification");
  const result = await runner(
    process.execPath,
    ["-e", `process.stdout.write("x".repeat(${SKILLS_COMMAND_MAX_STREAM_BYTES + 1024}))`],
    10_000,
  );
  assert.equal(result.stderr, "");
  assert.match(result.stdout, /\.\.\.\[truncated\]$/);
  assert.ok(
    Buffer.byteLength(result.stdout) <= SKILLS_COMMAND_MAX_STREAM_BYTES + Buffer.byteLength("\n...[truncated]"),
    "retained output must stay within the configured cap plus its truncation marker",
  );
});

test("skills command timeout removes a platform-native descendant tree", async () => {
  const runner = skillsServiceSource.runSkillsCommand;
  assert.equal(typeof runner, "function", "runSkillsCommand must be exported for focused command-boundary verification");
  const root = makeTempRoot();
  const binDir = path.join(root, "Skills timeout CLI 测试");
  const descendantPidFile = path.join(root, "descendant.pid");
  const descendantPath = path.join(binDir, "descendant.cjs");
  const leaderPath = path.join(binDir, "leader.cjs");
  const previousPath = process.env.PATH;
  fs.mkdirSync(binDir, { recursive: true });
  fs.writeFileSync(
    descendantPath,
    "process.on('SIGTERM', () => {}); setInterval(() => {}, 1_000);\n",
    "utf8",
  );
  const leaderCode = [
    "const fs = require('node:fs')",
    "const { spawn } = require('node:child_process')",
    `const child = spawn(process.execPath, [${JSON.stringify(descendantPath)}], { stdio: 'ignore' })`,
    `fs.writeFileSync(${JSON.stringify(descendantPidFile)}, String(child.pid))`,
    "process.on('SIGTERM', () => process.exit(0))",
    "setInterval(() => {}, 1_000)",
  ].join(";");
  fs.writeFileSync(leaderPath, `${leaderCode};\n`, "utf8");
  if (process.platform === "win32") {
    fs.writeFileSync(
      path.join(binDir, "skills-owned-tree.cmd"),
      `@echo off\r\n"${process.execPath}" "%~dp0leader.cjs" %*\r\n`,
      "utf8",
    );
  } else {
    const commandPath = path.join(binDir, "skills-owned-tree");
    fs.writeFileSync(
      commandPath,
      `#!/usr/bin/env node\n${leaderCode};\n`,
      { encoding: "utf8", mode: 0o755 },
    );
    fs.chmodSync(commandPath, 0o755);
  }
  process.env.PATH = [binDir, previousPath || ""].filter(Boolean).join(path.delimiter);
  let descendantPid = 0;

  try {
    await assert.rejects(
      () => runner("skills-owned-tree", [], 250, root),
      /Command timed out after 250ms/,
    );
    descendantPid = Number.parseInt(fs.readFileSync(descendantPidFile, "utf8"), 10);
    assert.ok(Number.isSafeInteger(descendantPid) && descendantPid > 0);
    assert.equal(
      await waitUntil(() => !processIsRunning(descendantPid)),
      true,
      "the owned process group must be absent even when its leader exits before a TERM-ignoring descendant",
    );
  } finally {
    if (descendantPid > 0 && processIsRunning(descendantPid)) {
      try {
        process.kill(descendantPid, "SIGKILL");
      } catch {}
    }
    if (previousPath === undefined) delete process.env.PATH;
    else process.env.PATH = previousPath;
    await new Promise((resolve) => setTimeout(resolve, 25));
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});

test("skills uploaded zip inspection falls back from python3 to python", async () => {
  const root = makeTempRoot();
  const config = createConfig(root);
  writeJson(config.openclawConfigFile, { agents: { list: [] } });
  const archive = createSkillZip(root, "python-fallback-skill");

  await withPythonOnlyPath(root, async () => {
    const service = skillsServiceSource.createSkillsService(config);
    const preflight = await service.preflightUploadedSkillArchive(archive);
    assert.equal(preflight.suggestedSlug, "python-fallback-skill");
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
