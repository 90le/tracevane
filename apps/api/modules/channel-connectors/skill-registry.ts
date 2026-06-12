import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type {
  ChannelConnectorCommandSurfaceSkillAction,
} from "../../../../types/channel-connectors.js";
import type {
  ChannelConnectorRuntimeBinding,
  ChannelConnectorRuntimeProject,
} from "./agent-runner.js";

export interface ChannelConnectorSkill {
  name: string;
  displayName: string;
  description: string;
  prompt: string;
  source: string;
  scope: "agent" | "binding" | "platform";
  platform?: string | null;
  runtimeActions?: ChannelConnectorCommandSurfaceSkillAction[];
}

export interface ChannelConnectorSkillDiscoveryContext {
  binding?: ChannelConnectorRuntimeBinding | null;
}

export interface ChannelConnectorNativeSkillProjection {
  rootDir: string;
  skills: Array<{
    name: string;
    filePath: string;
    source: string;
    scope: ChannelConnectorSkill["scope"];
    platform?: string | null;
  }>;
}

const CHANNEL_SKILL_CONTEXT_MAX_LISTED = 10;
const CHANNEL_SKILL_CONTEXT_MAX_EXCERPTS = 4;
const CHANNEL_SKILL_CONTEXT_EXCERPT_CHARS = 2200;
const CHANNEL_SKILL_CONTEXT_TOTAL_EXCERPT_CHARS = 6000;
const CHANNEL_SKILL_CONTEXT_SECTION_CHARS = 420;

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

function recordValue(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function metadataStringList(metadata: Record<string, unknown>, keys: string[]): string[] {
  const values: string[] = [];
  for (const key of keys) {
    const value = metadata[key];
    if (Array.isArray(value)) {
      for (const item of value) {
        const normalized = normalizeString(item);
        if (normalized) values.push(normalized);
      }
      continue;
    }
    const normalized = normalizeString(value);
    if (!normalized) continue;
    values.push(...normalized.split(/[,\n;]+/).map((item) => item.trim()).filter(Boolean));
  }
  return uniqueStrings(values);
}

function samePath(a: string, b: string): boolean {
  return path.resolve(a) === path.resolve(b);
}

function commandNameKey(value: string): string {
  return normalizeString(value).toLowerCase().replaceAll("-", "_");
}

function resolveConfiguredPath(value: string, home: string): string {
  const normalized = normalizeString(value);
  if (!normalized) return "";
  if (normalized === "~") return home;
  if (normalized.startsWith("~/")) return path.join(home, normalized.slice(2));
  return path.resolve(normalized
    .replaceAll("$HOME", home)
    .replaceAll("${HOME}", home));
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

interface SkillDirSpec {
  dir: string;
  scope: ChannelConnectorSkill["scope"];
  platform?: string | null;
}

function agentSkillDirSpecs(project: ChannelConnectorRuntimeProject): SkillDirSpec[] {
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
    ]).map((dir) => ({ dir, scope: "agent" }));
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
    ]).map((dir) => ({ dir, scope: "agent" }));
  }
  if (project.agent === "gemini") {
    return uniqueStrings([
      path.join(workDir, ".gemini", "skills"),
      path.join(home, ".gemini", "skills"),
    ]).map((dir) => ({ dir, scope: "agent" }));
  }
  if (project.agent === "kimi") {
    return uniqueStrings([
      path.join(workDir, ".kimi", "skills"),
      path.join(home, ".kimi", "skills"),
    ]).map((dir) => ({ dir, scope: "agent" }));
  }
  if (project.agent === "cursor" || project.agent === "qoder") {
    return uniqueStrings([
      path.join(workDir, ".claude", "skills"),
      path.join(home, ".claude", "skills"),
    ]).map((dir) => ({ dir, scope: "agent" }));
  }
  return [];
}

function platformSkillDirSpecs(context?: ChannelConnectorSkillDiscoveryContext): SkillDirSpec[] {
  const binding = context?.binding || null;
  const platform = normalizeString(binding?.platform).toLowerCase();
  if (!binding || !platform) return [];
  const home = os.homedir();
  const metadata = recordValue(binding.metadata) || {};
  const explicitDirs = metadataStringList(metadata, [
    "skillDirs",
    "skill_dirs",
    "channelSkillDirs",
    "channel_skill_dirs",
    "platformSkillDirs",
    "platform_skill_dirs",
  ]).map((dir) => resolveConfiguredPath(dir, home)).filter(Boolean);
  return explicitDirs.map((dir) => ({ dir, scope: "binding" as const, platform }));
}

function channelConnectorSkillDirSpecs(
  project: ChannelConnectorRuntimeProject,
  context?: ChannelConnectorSkillDiscoveryContext,
): SkillDirSpec[] {
  const seen = new Set<string>();
  const specs: SkillDirSpec[] = [];
  for (const spec of [...agentSkillDirSpecs(project), ...platformSkillDirSpecs(context)]) {
    const dir = normalizeString(spec.dir);
    if (!dir || seen.has(path.resolve(dir))) continue;
    seen.add(path.resolve(dir));
    specs.push({ ...spec, dir });
  }
  return specs;
}

export function channelConnectorSkillDirs(
  project: ChannelConnectorRuntimeProject,
  context?: ChannelConnectorSkillDiscoveryContext,
): string[] {
  return channelConnectorSkillDirSpecs(project, context).map((spec) => spec.dir);
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

function truncateRunes(value: string, maxRunes: number): string {
  const runes = Array.from(value);
  return runes.length > maxRunes ? `${runes.slice(0, maxRunes).join("")}\n...` : value;
}

function compactSkillPromptForContext(value: string): string {
  return normalizeString(value)
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n");
}

interface MarkdownSection {
  title: string;
  level: number;
  text: string;
  index: number;
}

function markdownHeading(line: string): { level: number; title: string } | null {
  const match = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
  if (!match) return null;
  return {
    level: match[1]?.length || 1,
    title: normalizeString(match[2]).replace(/\s+#*$/, ""),
  };
}

function splitMarkdownSections(value: string): MarkdownSection[] {
  const prompt = compactSkillPromptForContext(value);
  if (!prompt) return [];
  const lines = prompt.split("\n");
  const headings: Array<{ lineIndex: number; level: number; title: string }> = [];
  for (let index = 0; index < lines.length; index += 1) {
    const heading = markdownHeading(lines[index] || "");
    if (!heading) continue;
    headings.push({ lineIndex: index, ...heading });
  }
  const sections: MarkdownSection[] = [];
  for (let index = 0; index < headings.length; index += 1) {
    const heading = headings[index];
    if (!heading) continue;
    let endLine = lines.length;
    for (let next = index + 1; next < headings.length; next += 1) {
      const nextHeading = headings[next];
      if (nextHeading && nextHeading.level <= heading.level) {
        endLine = nextHeading.lineIndex;
        break;
      }
    }
    sections.push({
      title: heading.title,
      level: heading.level,
      text: lines.slice(heading.lineIndex, endLine).join("\n").trim(),
      index,
    });
  }
  return sections;
}

function sectionSearchText(value: string): string {
  return normalizeString(value)
    .toLowerCase()
    .replace(/[`*_()[\]{}<>:"'，。；：、]/g, " ")
    .replace(/[^\p{L}\p{N}.]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isSetupOrBridgeSection(title: string): boolean {
  const key = sectionSearchText(title);
  return /\b(save locally|register|save credentials|receive messages|openclaw plugin|install plugin|setup guide|multi agent setup guide|session isolation|quickstart flow)\b/.test(key);
}

function privateTransportSectionPatterns(skill: ChannelConnectorSkill): RegExp[] {
  const platform = normalizeString(skill.platform).toLowerCase();
  const name = commandNameKey(skill.name);
  if (platform === "octo" || platform === "dmwork" || name.includes("octo")) {
    return [
      /\bsend messages\b|\bmessage\b|\bdm conversations\b/,
      /\bfiles?\b|\bupload file\b|\bsend file\b|\bdownload file\b/,
      /\bmessage history sync\b|\bhistory sync\b/,
    ];
  }
  if (platform === "feishu" || platform === "lark" || name.includes("feishu") || name.includes("lark")) {
    return [
      /\bsend messages\b|\bmessage\b|\bdm\b/,
      /\bfiles?\b|\bupload file\b|\bsend file\b/,
      /\bcards and commands\b|\bcommands\b/,
    ];
  }
  return [
    /\bsend\b|\bmessage\b|\bdm\b/,
    /\bfile\b|\battachment\b|\bimage\b/,
    /\bcommands\b|\busage\b|\bworkflow\b/,
  ];
}

function sectionMatches(section: MarkdownSection, pattern: RegExp): boolean {
  return pattern.test(sectionSearchText(section.title));
}

function skillSectionSnippet(section: MarkdownSection): string {
  const lines = compactSkillPromptForContext(section.text).split("\n");
  const heading = lines.shift() || `## ${section.title}`;
  const body = lines.join("\n").trim();
  if (!body) return heading;
  return `${heading}\n${truncateRunes(body, CHANNEL_SKILL_CONTEXT_SECTION_CHARS)}`;
}

function selectRuntimeSkillPromptForContext(skill: ChannelConnectorSkill): string {
  const prompt = compactSkillPromptForContext(skill.prompt);
  const sections = splitMarkdownSections(prompt).filter((section) => !isSetupOrBridgeSection(section.title));
  if (!sections.length) return prompt;
  const selected: MarkdownSection[] = [];
  const seen = new Set<number>();
  for (const pattern of privateTransportSectionPatterns(skill)) {
    const section = sections.find((candidate) => !seen.has(candidate.index) && sectionMatches(candidate, pattern));
    if (!section) continue;
    selected.push(section);
    seen.add(section.index);
    if (selected.length >= 3) break;
  }
  if (!selected.length) {
    const firstRuntimeSection = sections.find((section) => section.level <= 2) || sections[0];
    return firstRuntimeSection ? skillSectionSnippet(firstRuntimeSection) : prompt;
  }
  return selected.map((section) => skillSectionSnippet(section)).join("\n\n");
}

function skillScopeLabel(skill: Pick<ChannelConnectorSkill, "scope" | "platform">): string {
  if (skill.scope === "binding") return "binding";
  if (skill.scope === "platform") return skill.platform ? `platform:${skill.platform}` : "platform";
  return "agent";
}

function yamlString(value: string): string {
  return JSON.stringify(value);
}

export function buildChannelConnectorNativeSkillPrompt(skill: ChannelConnectorSkill): string {
  const platform = normalizeString(skill.platform) || "unknown";
  const displayName = normalizeString(skill.displayName) || skill.name;
  const description = normalizeString(skill.description)
    || `${displayName} Studio Channel Connector helper skill`;
  const runtimePrompt = selectRuntimeSkillPromptForContext(skill);
  return [
    "---",
    `name: ${yamlString(displayName)}`,
    `description: ${yamlString(description)}`,
    `metadata: ${yamlString(JSON.stringify({
      studioChannelConnector: true,
      platform,
      sourceScope: skill.scope,
      sourceSkill: skill.name,
    }))}`,
    "---",
    "",
    `# ${displayName}`,
    "",
    "This is a Studio Channel Connector helper projection.",
    "",
    "Studio owns channel credentials, transport, file upload, and message delivery. Do not run external bridge CLIs, plugin setup flows, curl registration flows, or platform API action manifests from the Agent.",
    "",
    "Use Studio native manifests only for private IM delivery artifacts:",
    "- `studio-channel-files` for files, images, and binary attachments.",
    "- `studio-channel-messages` for private IM messages to known recipients.",
    "",
    `Current platform family: ${platform}.`,
    "",
    "## Runtime Instructions",
    "",
    runtimePrompt,
    "",
  ].join("\n");
}

export function materializeChannelConnectorNativePlatformSkills(input: {
  project: ChannelConnectorRuntimeProject;
  context?: ChannelConnectorSkillDiscoveryContext;
  rootDir: string;
}): ChannelConnectorNativeSkillProjection {
  const rootDir = path.resolve(input.rootDir);
  fs.mkdirSync(rootDir, { recursive: true, mode: 0o700 });
  try {
    fs.chmodSync(rootDir, 0o700);
  } catch {
    // Best-effort; generated skill directories contain no secrets.
  }
  return { rootDir, skills: [] };
}

function channelSkillContextExcerpts(skills: ChannelConnectorSkill[]): string[] {
  const excerpts: string[] = [];
  let remaining = CHANNEL_SKILL_CONTEXT_TOTAL_EXCERPT_CHARS;
  for (const skill of skills.slice(0, CHANNEL_SKILL_CONTEXT_MAX_EXCERPTS)) {
    if (remaining <= 0) break;
    const prompt = selectRuntimeSkillPromptForContext(skill);
    if (!prompt) continue;
    const excerpt = truncateRunes(prompt, Math.min(CHANNEL_SKILL_CONTEXT_EXCERPT_CHARS, remaining));
    remaining -= Array.from(excerpt).length;
    excerpts.push([
      `### /${skill.name} [${skillScopeLabel(skill)}]`,
      skill.description ? `Intent: ${skill.description}` : "",
      excerpt,
    ].filter(Boolean).join("\n"));
  }
  return excerpts;
}

function parseSkillMd(
  skillName: string,
  raw: string,
  source: string,
  scope: ChannelConnectorSkill["scope"],
  platform?: string | null,
): ChannelConnectorSkill | null {
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
    scope,
    platform: platform || null,
    runtimeActions: [],
  };
}

function discoverSkillsInDir(
  rootDir: string,
  currentDir: string,
  seen: Set<string>,
  visited: Set<string>,
  scope: ChannelConnectorSkill["scope"],
  platform?: string | null,
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
      const skill = parseSkillMd(skillName, raw, skillDir, scope, platform);
      if (!skill) continue;
      seen.add(key);
      skills.push(skill);
      continue;
    }
    if (shouldDescend(fullPath, entry)) {
      skills.push(...discoverSkillsInDir(rootDir, fullPath, seen, visited, scope, platform));
    }
  }
  return skills;
}

export function listChannelConnectorSkills(
  project: ChannelConnectorRuntimeProject,
  context?: ChannelConnectorSkillDiscoveryContext,
): ChannelConnectorSkill[] {
  const seen = new Set<string>();
  const skills: ChannelConnectorSkill[] = [];
  for (const spec of channelConnectorSkillDirSpecs(project, context)) {
    skills.push(...discoverSkillsInDir(
      path.resolve(spec.dir),
      path.resolve(spec.dir),
      seen,
      new Set<string>(),
      spec.scope,
      spec.platform,
    ));
  }
  return skills;
}

export function resolveChannelConnectorSkill(
  project: ChannelConnectorRuntimeProject,
  name: string,
  context?: ChannelConnectorSkillDiscoveryContext,
): ChannelConnectorSkill | null {
  const key = commandNameKey(name);
  if (!key) return null;
  return listChannelConnectorSkills(project, context).find((skill) => commandNameKey(skill.name) === key) || null;
}

export function listChannelConnectorPlatformSkills(
  project: ChannelConnectorRuntimeProject,
  context?: ChannelConnectorSkillDiscoveryContext,
): ChannelConnectorSkill[] {
  return listChannelConnectorSkills(project, context).filter((skill) => skill.scope !== "agent");
}

export function buildChannelConnectorSkillContext(
  project: ChannelConnectorRuntimeProject,
  context?: ChannelConnectorSkillDiscoveryContext,
): string | null {
  const binding = context?.binding || null;
  const skills = listChannelConnectorPlatformSkills(project, context);
  if (!binding || !skills.length) return null;
  const platform = normalizeString(binding.platform) || "unknown";
  const excerpts = channelSkillContextExcerpts(skills);
  const lines = [
    "[Studio IM channel helper skills]",
    `Current IM platform: ${platform}.`,
    "Configured binding skills in this binding:",
    ...skills.slice(0, CHANNEL_SKILL_CONTEXT_MAX_LISTED).map((skill) => {
      const description = normalizeString(skill.description);
      return `- /${skill.name}${description ? `: ${description}` : ""}`;
    }),
    "",
    "Studio only exposes private IM transport to the Agent here: files/images through `studio-channel-files`, private messages through `studio-channel-messages`, and normal Agent CLI tools/commands.",
    "Do not emit platform API action manifests, raw Feishu/Octo API calls, or external bridge CLI calls.",
    "Use these helper excerpts only as operating guidance for private IM conversations and attachments.",
    excerpts.length ? "[Helper skill instruction excerpts]" : "",
    ...excerpts,
  ];
  return lines.filter(Boolean).join("\n");
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
  lines.push(
    "",
    "## Studio Channel Boundary:",
    "Use only private IM manifests (`studio-channel-files` / `studio-channel-messages`) and normal Agent CLI tools. Do not use platform action manifests, raw Feishu/Octo APIs, or external bridge CLIs.",
    "",
    "## Skill Instructions:",
    skill.prompt,
  );
  if (args.length > 0) {
    lines.push("", "## User Arguments:", args.join(" "));
  }
  lines.push("", "Please follow the skill instructions above within the Studio Channel boundary.");
  return lines.join("\n");
}
