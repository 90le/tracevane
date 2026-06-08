import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ChannelConnectorRuntimeProject } from "./agent-runner.js";

export interface ChannelConnectorSkill {
  name: string;
  displayName: string;
  description: string;
  prompt: string;
  source: string;
}

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const normalized = normalizeString(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    output.push(normalized);
  }
  return output;
}

function samePath(a: string, b: string): boolean {
  return path.resolve(a) === path.resolve(b);
}

function commandNameKey(value: string): string {
  return normalizeString(value).toLowerCase().replaceAll("-", "_");
}

function findProjectRoot(start: string): string {
  let current = path.resolve(start);
  for (;;) {
    if (fs.existsSync(path.join(current, ".git")) || fs.existsSync(path.join(current, ".jj"))) return current;
    const parent = path.dirname(current);
    if (parent === current) return "";
    current = parent;
  }
}

function walkUpSkillDirs(input: {
  workDir: string;
  markerDirNames: string[];
  stopAtProjectRoot: boolean;
}): string[] {
  const home = path.resolve(os.homedir());
  let current = path.resolve(input.workDir);
  const stopAt = input.stopAtProjectRoot ? findProjectRoot(current) : "";
  const dirs: string[] = [];
  for (;;) {
    if (home && samePath(current, home)) break;
    for (const marker of input.markerDirNames) {
      dirs.push(path.join(current, marker, "skills"));
    }
    if (stopAt && samePath(current, stopAt)) break;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return uniqueStrings(dirs);
}

export function channelConnectorSkillDirs(project: ChannelConnectorRuntimeProject): string[] {
  const workDir = path.resolve(normalizeString(project.workDir) || process.cwd());
  const home = os.homedir();
  if (project.agent === "codex") {
    const codexHome = normalizeString(process.env.CODEX_HOME) || path.join(home, ".codex");
    return uniqueStrings([
      ...walkUpSkillDirs({
        workDir,
        markerDirNames: [".agents", ".codex"],
        stopAtProjectRoot: true,
      }),
      path.join(codexHome, "skills"),
      path.join(home, ".agents", "skills"),
    ]);
  }
  if (project.agent === "claude-code") {
    const claudeHome = normalizeString(process.env.CLAUDE_CONFIG_DIR) || path.join(home, ".claude");
    return uniqueStrings([
      ...walkUpSkillDirs({
        workDir,
        markerDirNames: [".claude"],
        stopAtProjectRoot: true,
      }),
      path.join(claudeHome, "skills"),
    ]);
  }
  if (project.agent === "gemini") {
    return uniqueStrings([
      path.join(workDir, ".gemini", "skills"),
      path.join(home, ".gemini", "skills"),
    ]);
  }
  if (project.agent === "kimi") {
    return uniqueStrings([
      path.join(workDir, ".kimi", "skills"),
      path.join(home, ".kimi", "skills"),
    ]);
  }
  if (project.agent === "cursor" || project.agent === "qoder") {
    return uniqueStrings([
      path.join(workDir, ".claude", "skills"),
      path.join(home, ".claude", "skills"),
    ]);
  }
  return [];
}

function realPath(value: string): string {
  try {
    return fs.realpathSync(value);
  } catch {
    return path.resolve(value);
  }
}

function shouldDescend(fullPath: string, entry: fs.Dirent): boolean {
  if (entry.isDirectory()) return true;
  if (!entry.isSymbolicLink()) return false;
  try {
    return fs.statSync(fullPath).isDirectory();
  } catch {
    return false;
  }
}

function parseFrontmatter(block: string): Record<string, string> {
  const output: Record<string, string> = {};
  const lines = block.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = normalizeString(lines[index]);
    if (!line || line.startsWith("#")) continue;
    const splitAt = line.indexOf(":");
    if (splitAt < 0) continue;
    const key = normalizeString(line.slice(0, splitAt)).toLowerCase();
    let value = normalizeString(line.slice(splitAt + 1));
    if ([">-", "|-", ">", "|"].includes(value)) {
      const blockLines: string[] = [];
      while (index + 1 < lines.length) {
        const next = lines[index + 1] || "";
        if (next.length > 0 && !next.startsWith(" ") && !next.startsWith("\t")) break;
        index += 1;
        blockLines.push(normalizeString(next));
      }
      value = blockLines.join(" ");
    }
    if (key) output[key] = value.replace(/^['"]|['"]$/g, "");
  }
  return output;
}

function firstLine(value: string, maxRunes = 80): string {
  const line = normalizeString(value).split(/\r?\n/, 1)[0] || "";
  const runes = Array.from(line);
  return runes.length > maxRunes ? `${runes.slice(0, maxRunes).join("")}...` : line;
}

function parseSkillMd(skillName: string, raw: string, source: string): ChannelConnectorSkill | null {
  const content = normalizeString(raw);
  if (!content) return null;
  let body = content;
  let frontmatter: Record<string, string> = {};
  if (content.startsWith("---")) {
    const rest = content.slice(3);
    const end = rest.indexOf("\n---");
    if (end >= 0) {
      frontmatter = parseFrontmatter(rest.slice(0, end));
      body = normalizeString(rest.slice(end + 4));
    }
  }
  if (!body) return null;
  return {
    name: skillName,
    displayName: normalizeString(frontmatter.name),
    description: normalizeString(frontmatter.description) || firstLine(body),
    prompt: body,
    source,
  };
}

function discoverSkillsInDir(
  rootDir: string,
  currentDir: string,
  seen: Set<string>,
  visited: Set<string>,
): ChannelConnectorSkill[] {
  const real = realPath(currentDir);
  if (visited.has(real)) return [];
  visited.add(real);
  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(currentDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const skills: ChannelConnectorSkill[] = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const fullPath = path.join(currentDir, entry.name);
    if (entry.name === "SKILL.md") {
      const skillDir = path.dirname(fullPath);
      if (samePath(skillDir, rootDir)) continue;
      const skillName = path.basename(skillDir);
      const key = skillName.toLowerCase();
      if (!skillName || seen.has(key)) continue;
      let raw = "";
      try {
        raw = fs.readFileSync(fullPath, "utf8");
      } catch {
        continue;
      }
      const skill = parseSkillMd(skillName, raw, skillDir);
      if (!skill) continue;
      seen.add(key);
      skills.push(skill);
      continue;
    }
    if (shouldDescend(fullPath, entry)) {
      skills.push(...discoverSkillsInDir(rootDir, fullPath, seen, visited));
    }
  }
  return skills;
}

export function listChannelConnectorSkills(project: ChannelConnectorRuntimeProject): ChannelConnectorSkill[] {
  const seen = new Set<string>();
  const skills: ChannelConnectorSkill[] = [];
  for (const dir of channelConnectorSkillDirs(project)) {
    skills.push(...discoverSkillsInDir(path.resolve(dir), path.resolve(dir), seen, new Set<string>()));
  }
  return skills;
}

export function resolveChannelConnectorSkill(
  project: ChannelConnectorRuntimeProject,
  name: string,
): ChannelConnectorSkill | null {
  const key = commandNameKey(name);
  if (!key) return null;
  return listChannelConnectorSkills(project).find((skill) => commandNameKey(skill.name) === key) || null;
}

export function buildChannelConnectorSkillPrompt(skill: ChannelConnectorSkill, args: string[]): string {
  const lines = [
    "The user is asking you to execute the following skill.",
    "",
    `## Skill: ${skill.displayName || skill.name}`,
  ];
  if (skill.description) {
    lines.push(`## Description: ${skill.description}`);
  }
  lines.push("", "## Skill Instructions:", skill.prompt);
  if (args.length > 0) {
    lines.push("", "## User Arguments:", args.join(" "));
  }
  lines.push("", "Please follow the skill instructions above to complete the task.");
  return lines.join("\n");
}
