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
import {
  studioChannelConnectorPlatformSkills,
} from "./studio-channel-skills.js";

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
const CHANNEL_SKILL_CONTEXT_EXCERPT_CHARS = 3200;
const CHANNEL_SKILL_CONTEXT_TOTAL_EXCERPT_CHARS = 9000;
const CHANNEL_SKILL_CONTEXT_SECTION_CHARS = 360;
const CHANNEL_SKILL_ACTION_INDEX_MAX_ITEMS = 16;
const CHANNEL_SKILL_CONTEXT_ACTION_INDEX_CHARS = 1600;

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

function shellSingleQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function runtimeRunnerPlatform(skill: Pick<ChannelConnectorSkill, "platform">): string {
  const platform = normalizeString(skill.platform).toLowerCase();
  if (platform === "lark") return "feishu";
  if (platform === "dmwork") return "octo";
  return platform || "<platform>";
}

function runtimeRunnerCommandForAction(
  platform: string,
  actionValue: unknown,
): string | null {
  const record = recordValue(actionValue);
  if (!record) return null;
  const tool = normalizeString(record.tool ?? record.skill ?? record.feishuTool ?? record.feishu_tool);
  const action = normalizeString(record.action);
  if (!tool || !action) return null;
  const explicitParams = recordValue(record.params ?? record.arguments ?? record.args);
  const params = explicitParams
    ? explicitParams
    : Object.fromEntries(Object.entries(record).filter(([key]) => ![
      "tool",
      "skill",
      "feishuTool",
      "feishu_tool",
      "action",
      "params",
      "arguments",
      "args",
    ].includes(key)));
  return `studio-channel-skill ${platform} ${tool}.${action} ${shellSingleQuote(JSON.stringify(params))}`;
}

function runtimeRunnerFence(platform: string, rawJson: string): string {
  try {
    const parsed = JSON.parse(rawJson.trim()) as unknown;
    const parsedRecord = recordValue(parsed);
    const actions: unknown[] = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsedRecord?.actions)
        ? parsedRecord.actions as unknown[]
        : [parsed];
    const commands = actions
      .map((action) => runtimeRunnerCommandForAction(platform, action))
      .filter((command): command is string => Boolean(command));
    if (commands.length) return ["```bash", ...commands, "```"].join("\n");
  } catch {
    // Keep a runnable generic example below when the old manifest sample is malformed.
  }
  return [
    "```bash",
    `studio-channel-skill ${platform} <tool>.<action> '<json-params>'`,
    "```",
  ].join("\n");
}

function adaptPlatformSkillPromptForNativeRunner(
  skill: Pick<ChannelConnectorSkill, "platform" | "runtimeActions">,
  prompt: string,
): string {
  if (!skill.runtimeActions?.length) return prompt;
  const platform = runtimeRunnerPlatform(skill);
  return prompt
    .replace(/```[ \t]*(studio-feishu-actions|studio-octo-actions)[^\r\n]*\r?\n([\s\S]*?)```/gi, (_match, blockName: string, rawJson: string) => {
      const blockPlatform = String(blockName).toLowerCase().includes("octo") ? "octo" : "feishu";
      return runtimeRunnerFence(blockPlatform, rawJson);
    })
    .replace(/For explicit platform operations, return a `studio-octo-actions` JSON block\.[^\n]*/g, "For explicit platform operations, call `studio-channel-skill octo <tool>.<action> '<json-params>'` through the Agent's normal tool/shell path, inspect stdout JSON, and continue the same turn.")
    .replace(/For OpenClaw-compatible Feishu channel operations, use `studio-feishu-actions` with `tool:"([^"]+)"`\.[^\n]*/g, (_match, tool: string) => `For OpenClaw-compatible Feishu channel operations, call \`studio-channel-skill feishu ${tool}.<action> '<json-params>'\` through the Agent's normal tool/shell path, inspect stdout JSON, and continue the same turn.`)
    .replace(/Studio manages this skill as a channel capability contract\. Use `studio-feishu-actions` for ([^.]+)\./g, (_match, scope: string) => `Studio manages this skill as a channel capability contract. Use \`studio-channel-skill feishu <tool>.<action> '<json-params>'\` for ${scope}.`)
    .replace(/Use this manifest shape:/g, "Use runner calls like:")
    .replace(/Agents should provide concise content and manifests;/g, "Agents should provide concise content and use `studio-channel-skill` for platform operations;")
    .replace(/Studio native manifests/g, "Studio native runner calls")
    .replace(/native manifests and commands/g, "the native `studio-channel-skill` command")
    .replace(/`studio-feishu-actions`/g, "`studio-channel-skill feishu`")
    .replace(/`studio-octo-actions`/g, "`studio-channel-skill octo`")
    .replace(/emit a studio-feishu-actions manifest/g, `call \`studio-channel-skill ${platform}\``)
    .replace(/emit a studio-octo-actions manifest/g, `call \`studio-channel-skill ${platform}\``);
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

function sectionSearchText(value: string): string {
  return normalizeString(value)
    .toLowerCase()
    .replace(/[`*_()[\]{}<>:"'，。；：、]/g, " ")
    .replace(/[^\p{L}\p{N}.]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
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

function isSetupOrBridgeSection(title: string): boolean {
  const key = sectionSearchText(title);
  return /\b(save locally|register|save credentials|receive messages|openclaw plugin|install plugin|setup guide|multi agent setup guide|session isolation|quickstart flow)\b/.test(key);
}

function runtimeSectionPatterns(skill: ChannelConnectorSkill): RegExp[] {
  const platform = normalizeString(skill.platform).toLowerCase();
  const name = commandNameKey(skill.name);
  if (platform === "octo" || platform === "dmwork" || name.includes("octo")) {
    return [
      /\bstep\s*3\b.*\bsend messages\b|\bsend messages\b/,
      /\bmessage history sync\b|\bhistory sync\b/,
      /\bmulti bot coordination\b|\bmulti-bot coordination\b|\bcollaboration\b/,
      /\bfiles?\b|\bupload file\b|\bsend file\b|\bdownload file\b/,
      /\bgroups?\b|\bgroup\.md\b|\bgroup conversations\b/,
      /\bthreads?\b|\bthread\.md\b|\bthread event\b/,
      /\bchannel types\b|\bevent format\b|\bdm conversations\b/,
    ];
  }
  if (platform === "feishu" || platform === "lark" || name.includes("feishu") || name.includes("lark")) {
    return [
      /\bactions\b/,
      /\b(read|write|append|create) document\b|\bupload image\b|\bupload file\b/,
      /\blist folder\b|\bget file\b|\bcreate folder\b|\bfile types\b/,
      /\blist collaborators\b|\badd collaborator\b|\bpermission levels\b/,
      /\blist knowledge spaces\b|\blist nodes\b|\bwiki doc workflow\b/,
      /\bpermissions\b|\btoken extraction\b/,
    ];
  }
  return [
    /\bactions\b|\busage\b|\bworkflow\b/,
    /\bsend\b|\bmessage\b|\bhistory\b|\bfile\b/,
    /\bgroup\b|\bmember\b|\bpermission\b|\bbot\b|\bchannel\b/,
    /\bapi\b|\bcommands\b|\bexamples\b/,
  ];
}

function sectionMatches(section: MarkdownSection, pattern: RegExp): boolean {
  return pattern.test(sectionSearchText(section.title));
}

function skillSectionSnippet(section: MarkdownSection, skill?: ChannelConnectorSkill): string {
  const source = skill ? adaptPlatformSkillPromptForNativeRunner(skill, section.text) : section.text;
  const lines = compactSkillPromptForContext(source).split("\n");
  const heading = lines.shift() || `## ${section.title}`;
  const body = lines.join("\n").trim();
  if (!body) return heading;
  return `${heading}\n${truncateRunes(body, CHANNEL_SKILL_CONTEXT_SECTION_CHARS)}`;
}

function selectRuntimeSkillPromptForContext(skill: ChannelConnectorSkill): string {
  const prompt = compactSkillPromptForContext(skill.prompt);
  const sections = splitMarkdownSections(prompt).filter((section) => !isSetupOrBridgeSection(section.title));
  if (!sections.length) return adaptPlatformSkillPromptForNativeRunner(skill, prompt);
  const selected: MarkdownSection[] = [];
  const seen = new Set<number>();
  for (const pattern of runtimeSectionPatterns(skill)) {
    const section = sections.find((candidate) => !seen.has(candidate.index) && sectionMatches(candidate, pattern));
    if (!section) continue;
    selected.push(section);
    seen.add(section.index);
    if (selected.length >= 4) break;
  }
  if (!selected.length) {
    const firstRuntimeSection = sections.find((section) => section.level <= 2) || sections[0];
    const fallback = firstRuntimeSection ? skillSectionSnippet(firstRuntimeSection, skill) : prompt;
    return adaptPlatformSkillPromptForNativeRunner(skill, fallback);
  }
  return adaptPlatformSkillPromptForNativeRunner(skill, selected.map((section) => skillSectionSnippet(section, skill)).join("\n\n"));
}

function isRuntimeActionSection(section: MarkdownSection): boolean {
  const key = sectionSearchText(section.title);
  if (!key) return false;
  if (/\b(configuration|permissions|required|known limitations?|note|examples?|workflow|reading workflow|token extraction|file types|token types|member types|permission levels)\b/.test(key)) {
    return false;
  }
  return /\b(read|write|append|create|upload|list|get|update|delete|move|rename|add|remove|send|download|history|search|thread|group|node|folder|collaborator|table|block|file|image|message|space)\b/.test(key);
}

function buildRuntimeSkillActionIndex(skill: ChannelConnectorSkill): string | null {
  if (skill.runtimeActions?.length) {
    const platform = normalizeString(skill.platform).toLowerCase();
    return [
      "## Runtime Action Index",
      "Use the native skill runner for the entries below. The runner returns JSON on stdout; inspect it and continue the same Agent turn.",
      skill.runtimeActions.map((action) => {
        const command = action.tool
          ? `studio-channel-skill ${platform || "<platform>"} ${action.tool}.${action.action || "<action>"} '<json-params>'`
          : `${action.manifest}`;
        const parts = [
          `- ${action.label}`,
          `runner \`${command}\``,
          action.tool ? `tool \`${action.tool}\`` : "",
          action.action ? `action \`${action.action}\`` : "",
          `approval: ${action.approval}`,
          action.notes ? action.notes : "",
        ].filter(Boolean);
        return parts.join(" — ");
      }).join("\n"),
    ].join("\n");
  }
  const sections = splitMarkdownSections(skill.prompt)
    .filter((section) => !isSetupOrBridgeSection(section.title))
    .filter(isRuntimeActionSection);
  const seen = new Set<string>();
  const items: string[] = [];
  for (const section of sections) {
    const title = normalizeString(section.title);
    const key = sectionSearchText(title);
    if (!title || !key || seen.has(key)) continue;
    seen.add(key);
    items.push(title);
    if (items.length >= CHANNEL_SKILL_ACTION_INDEX_MAX_ITEMS) break;
  }
  if (!items.length) return null;
  return [
    "## Runtime Action Index",
    "This index is inferred from external Markdown. It is not an execution guarantee unless the action also appears in a Studio runtime manifest below:",
    items.map((item) => `- ${item}`).join("\n"),
  ].join("\n");
}

function buildRuntimeSkillActionIndexForContext(skill: ChannelConnectorSkill): string | null {
  if (skill.runtimeActions?.length) {
    const platform = normalizeString(skill.platform).toLowerCase();
    return [
      "## Runtime Action Index",
      "Use native skill runner calls below when platform state must be read or changed; stdout is the tool result for the Agent to continue from.",
      skill.runtimeActions.map((action) => {
        const call = action.tool
          ? `studio-channel-skill ${platform || "<platform>"} ${action.tool}.${action.action || "*"}`
          : `${action.manifest}.${action.action || "send"}`;
        return `- ${call} [${action.approval}]`;
      }).join("\n"),
    ].join("\n");
  }
  return buildRuntimeSkillActionIndex(skill);
}

function skillScopeLabel(skill: Pick<ChannelConnectorSkill, "scope" | "platform">): string {
  if (skill.scope === "binding") return "binding";
  if (skill.scope === "platform") return skill.platform ? `platform:${skill.platform}` : "platform";
  return "agent";
}

function nativeSkillDirName(value: string): string {
  const normalized = commandNameKey(value)
    .replace(/[^a-z0-9_.-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "channel-skill";
}

function yamlString(value: string): string {
  return JSON.stringify(value);
}

export function buildChannelConnectorNativeSkillPrompt(skill: ChannelConnectorSkill): string {
  const platform = normalizeString(skill.platform) || "unknown";
  const displayName = normalizeString(skill.displayName) || skill.name;
  const description = normalizeString(skill.description)
    || `${displayName} Studio Channel Connector runtime skill`;
  const runtimePrompt = selectRuntimeSkillPromptForContext(skill);
  const actionIndex = buildRuntimeSkillActionIndex(skill);
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
    "This is a Studio Channel Connector runtime projection of the platform skill.",
    "",
    "Studio owns channel credentials, transport, file upload, and message delivery. Do not run cc-connect, OpenClaw plugin setup, curl registration flows, or external IM bridge CLIs from the Agent.",
    "",
    "Use this as a native Agent skill: when the task needs platform data or a platform action, run the local `studio-channel-skill` command through the Agent's normal tool/shell capability, read its stdout JSON, and continue reasoning in the same turn. Do not output a platform action manifest and stop unless the runner is unavailable.",
    "",
    "Runner forms:",
    `- \`studio-channel-skill ${platform} <tool>.<action> '<json-params>'\``,
    `- \`studio-channel-skill ${platform} '[{"tool":"<tool>","action":"<action>","params":{}}]'\` for batch calls`,
    "",
    "Read-only runner calls execute immediately. Mutation runner calls pause for Studio IM approval and then return the approved/denied result to stdout.",
    "",
    "Use Studio native manifests only for outbound delivery artifacts that are not direct platform skill calls:",
    "- `studio-channel-files` for files, images, and binary attachments.",
    "- `studio-channel-messages` for IM messages, Octo group/thread mentions, and Feishu text/Markdown/group mention targets.",
    "",
    `Current platform family: ${platform}.`,
    "",
    ...(actionIndex ? [actionIndex, ""] : []),
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
    // Best-effort; generated skill files contain no secrets.
  }
  const projected: ChannelConnectorNativeSkillProjection["skills"] = [];
  for (const skill of listChannelConnectorPlatformSkills(input.project, input.context)) {
    const skillDir = path.join(rootDir, nativeSkillDirName(skill.name));
    fs.mkdirSync(skillDir, { recursive: true, mode: 0o700 });
    const filePath = path.join(skillDir, "SKILL.md");
    fs.writeFileSync(filePath, buildChannelConnectorNativeSkillPrompt(skill), {
      encoding: "utf8",
      mode: 0o600,
    });
    projected.push({
      name: skill.name,
      filePath,
      source: skill.source,
      scope: skill.scope,
      platform: skill.platform || null,
    });
  }
  return { rootDir, skills: projected };
}

function channelSkillContextExcerpts(skills: ChannelConnectorSkill[]): string[] {
  const excerpts: string[] = [];
  let remaining = CHANNEL_SKILL_CONTEXT_TOTAL_EXCERPT_CHARS;
  for (const skill of skills.slice(0, CHANNEL_SKILL_CONTEXT_MAX_EXCERPTS)) {
    if (remaining <= 0) break;
    const prompt = selectRuntimeSkillPromptForContext(skill);
    if (!prompt) continue;
    const actionIndex = buildRuntimeSkillActionIndexForContext(skill);
    const maxRunes = Math.min(CHANNEL_SKILL_CONTEXT_EXCERPT_CHARS, remaining);
    const actionIndexExcerpt = actionIndex
      ? truncateRunes(actionIndex, Math.min(CHANNEL_SKILL_CONTEXT_ACTION_INDEX_CHARS, Math.floor(maxRunes * 0.45)))
      : "";
    const actionIndexRunes = Array.from(actionIndexExcerpt).length;
    const promptBudget = Math.max(0, maxRunes - actionIndexRunes - (actionIndexExcerpt ? 2 : 0));
    const excerpt = [
      actionIndexExcerpt,
      promptBudget > 0 ? truncateRunes(prompt, promptBudget) : "",
    ].filter(Boolean).join("\n\n");
    remaining -= Array.from(excerpt).length;
    excerpts.push([
      `### /${skill.name} [${skillScopeLabel(skill)}]`,
      skill.description ? `Intent: ${skill.description}` : "",
      excerpt,
    ].filter(Boolean).join("\n"));
  }
  return excerpts;
}

function channelSkillRuntimeActionSummary(skills: ChannelConnectorSkill[]): string[] {
  const rows = skills
    .filter((skill) => skill.runtimeActions?.length)
    .map((skill) => {
      const platform = runtimeRunnerPlatform(skill);
      const calls = (skill.runtimeActions || []).map((action) => {
        const call = action.tool
          ? `studio-channel-skill ${platform} ${action.tool}.${action.action || "*"}`
          : `${action.manifest}.${action.action || "send"}`;
        return `${call}[${action.approval}]`;
      });
      return `- /${skill.name}: ${calls.join(", ")}`;
    });
  return rows.length ? ["Runtime action summary:", ...rows] : [];
}

function parseSkillMd(
  skillName: string,
  raw: string,
  source: string,
  scope: ChannelConnectorSkill["scope"],
  platform?: string | null,
  runtimeActions?: ChannelConnectorCommandSurfaceSkillAction[],
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
    runtimeActions: runtimeActions || [],
  };
}

function addStudioPlatformSkills(input: {
  binding?: ChannelConnectorRuntimeBinding | null;
  seen: Set<string>;
}): ChannelConnectorSkill[] {
  const platform = normalizeString(input.binding?.platform).toLowerCase();
  if (!platform) return [];
  const skills: ChannelConnectorSkill[] = [];
  for (const definition of studioChannelConnectorPlatformSkills(platform)) {
    const key = definition.name.toLowerCase();
    if (!definition.name || input.seen.has(key)) continue;
    const skill = parseSkillMd(
      definition.name,
      definition.markdown,
      `studio://channel-skills/${definition.platform}/${definition.name}`,
      "platform",
      definition.platform,
      definition.runtimeActions,
    );
    if (!skill) continue;
    input.seen.add(key);
    skills.push(skill);
  }
  return skills;
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
  skills.push(...addStudioPlatformSkills({ binding: context?.binding || null, seen }));
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
  const actionSummary = channelSkillRuntimeActionSummary(skills);
  const lines = [
    "[Studio IM channel skills]",
    `Current IM platform: ${platform}.`,
    "Available platform skills in this binding:",
    ...skills.slice(0, CHANNEL_SKILL_CONTEXT_MAX_LISTED).map((skill) => {
      const description = normalizeString(skill.description);
      return `- /${skill.name}${description ? `: ${description}` : ""}`;
    }),
    "",
    "Auto-activation: if the current user request matches a platform skill description or asks for IM platform, file, group, document, permission, member, bot, or channel work, follow the relevant skill excerpt even when the user did not type /skill.",
    "Studio owns channel credentials and transport. Do not run cc-connect, OpenClaw plugin setup, curl registration flows, or external IM bridge CLIs from the Agent; use the native `studio-channel-skill` command for platform API work.",
    platform === "octo"
      ? "Studio native Octo commands available to users: /octo groups, /octo info [group_no], /octo members [group_no], /octo search <keyword>, /octo threads [group_no], /octo thread <short_id> [group_no], /octo thread-members <short_id> [group_no], /octo history [limit], /octo group-md [group_no], /octo thread-md <short_id> [group_no], /octo voice-context, /octo create-group <name> --members uid1,uid2, /octo update-group <group_no> --name <name> --notice <notice>, /octo add-members <group_no> uid1,uid2, /octo remove-members <group_no> uid1,uid2, /octo create-thread <group_no> <name>, /octo delete-thread <short_id> [group_no], /octo join-thread <short_id> [group_no], /octo leave-thread <short_id> [group_no], /octo set-group-md [--group group_no] <markdown>, /octo set-thread-md [--group group_no] [--thread short_id] <markdown>, /octo set-voice-context <text>, /octo delete-voice-context."
      : "",
    platform === "octo"
      ? "Octo Admin-Plane Boundary: User API bot management endpoints, user API keys, bot token retrieval, registration, heartbeat, typing, read receipts, event ack, upload credentials, and raw retry flows are Studio admin/daemon responsibilities and are not Agent runtime actions."
      : "",
    "Use these channel/platform skills only when the user asks for platform-specific IM, file, group, document, or bot API work.",
    "For sending local files back to the user, emit a studio-channel-files manifest; do not call cc-connect or external IM bridge CLIs.",
    "For sending IM messages, emit a studio-channel-messages manifest; Studio will deliver it through the active channel.",
    platform === "octo"
      ? "For Octo group/thread/history/voice-context management, call `studio-channel-skill octo <tool>.<action> '<json-params>'`; stdout is the Agent tool result and mutation calls wait for Studio IM approval."
      : "",
    platform === "feishu"
      ? "For Feishu channel/app-scope/doc/drive/perm/wiki/bitable actions, call `studio-channel-skill feishu <tool>.<action> '<json-params>'`; stdout is the Agent tool result and mutation calls wait for Studio IM approval."
      : "",
    actionSummary.length ? "[Runtime action summary]" : "",
    ...actionSummary,
    excerpts.length ? "[Platform skill instruction excerpts]" : "",
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
  lines.push("", "## Skill Instructions:", adaptPlatformSkillPromptForNativeRunner(skill, skill.prompt));
  if (args.length > 0) {
    lines.push("", "## User Arguments:", args.join(" "));
  }
  lines.push("", "Please follow the skill instructions above to complete the task.");
  return lines.join("\n");
}
