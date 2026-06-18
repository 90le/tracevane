import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type {
  SkillApiKeyMode,
  SkillAgentMapping,
  SkillConfigPayload,
  SkillConfigSaveResponse,
  SkillConfigState,
  SkillConfigUpdatePayload,
  SkillInstallTargetScope,
  SkillInstallMetadata,
  SkillPackageSourceId,
  SkillMissingRequirements,
  SkillPhysicalCopy,
  SkillStatus,
  SkillSummary,
  SkillTargetDescriptor,
  SkillTargetRef,
  SkillTogglePayload,
  SkillSecretPayload,
  SkillsDeleteMode,
  SkillsInstallMethod,
  SkillsLifecyclePayload,
  SkillsLifecycleResponse,
  SkillsMaintenancePayload,
  SkillsMaintenanceResponse,
  SkillsMarketplaceInstallPayload,
  SkillsMarketplaceInstallResponse,
  SkillsMarketplaceItem,
  SkillsMarketplacePayload,
  SkillsMarketplaceSort,
  SkillsMarketplaceSource,
  SkillsMarketplaceSourceId,
  SkillsMarketplaceSourcesPayload,
  SkillsPreflightIndicator,
  SkillsPreflightPayload,
  SkillsPreflightResult,
  SkillsRiskLevel,
  SkillsSummaryPayload,
  SkillsTargetsPayload,
  SkillsUploadArchivePayload,
  SkillsUploadInstallPayload,
  SkillsUploadInstallResponse,
  SkillsUploadPreflightPayload,
  SkillsUploadPreflightResult,
} from "../../../../types/skills.js";
import type { StudioServerConfig } from "../../../../types/api.js";
import {
  ensureDir,
  fileExists,
  readOpenClawConfig,
  writeJsonFile,
} from "../../core/state.js";

const execFileAsync = promisify(execFile);

const SKILLS_SNAPSHOT_TTL_MS = 2 * 60_000;
const SKILLS_SNAPSHOT_STALE_MS = 15 * 60_000;
const MARKETPLACE_TTL_MS = 5 * 60_000;
const DEFAULT_WORKSPACE_DIRNAME = "workspace";
const TEXT_SCAN_MAX_BYTES = 200_000;

const SKILLHUB_INSTALL_DOC_URL =
  "https://skillhub-1388575217.cos.ap-guangzhou.myqcloud.com/install/skillhub.md";
const SKILLHUB_INSTALL_COMMAND =
  "curl -fsSL https://skillhub-1388575217.cos.ap-guangzhou.myqcloud.com/install/install.sh | bash";
const SKILLHUB_CLI_ONLY_COMMAND =
  "curl -fsSL https://skillhub-1388575217.cos.ap-guangzhou.myqcloud.com/install/install.sh | bash -s -- --cli-only";

const DEFAULT_SKILLS_SOURCES: Record<
  SkillsMarketplaceSourceId,
  Omit<SkillsMarketplaceSource, "cliInstalled">
> = {
  "skillhub-tencent": {
    id: "skillhub-tencent",
    name: "SkillHub Tencent",
    region: "domestic",
    preferred: true,
    description:
      "国内镜像与加速源，适合作为默认市场入口，支持镜像搜索与直连下载。",
    browseUrl: "https://skillhub.tencent.com/",
    docsUrl: SKILLHUB_INSTALL_DOC_URL,
    cliName: "skillhub",
    installCommand: SKILLHUB_INSTALL_COMMAND,
    cliOnlyCommand: SKILLHUB_CLI_ONLY_COMMAND,
    supportsSearch: true,
    supportsDirectInstall: true,
    note: "数据由 SkillHub 镜像聚合，页面说明中明确标注其技能数据来源于 ClawHub。",
  },
  clawhub: {
    id: "clawhub",
    name: "ClawHub",
    region: "global",
    preferred: false,
    description: "官方海外技能源，数据完整，但当前更容易出现接口限流。",
    browseUrl: "https://clawhub.ai/",
    docsUrl: "https://clawhub.ai/",
    cliName: "clawhub",
    installCommand: "npm i -g clawhub",
    cliOnlyCommand: null,
    supportsSearch: true,
    supportsDirectInstall: true,
    note: "官方 CLI 与 API 近期较容易返回 429，建议默认优先使用腾讯镜像。",
  },
};

interface OpenClawSkillSnapshotItem {
  name: string;
  description?: string;
  emoji?: string;
  eligible?: boolean;
  disabled?: boolean;
  blockedByAllowlist?: boolean;
  source?: string;
  bundled?: boolean;
  homepage?: string;
  primaryEnv?: string;
  missing?: Partial<SkillMissingRequirements>;
}

interface OpenClawSkillsSnapshot {
  workspaceDir?: string;
  managedSkillsDir?: string;
  skills?: OpenClawSkillSnapshotItem[];
}

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

interface SkillsSnapshotState {
  payload: SkillsSummaryPayload;
}

interface SkillsSnapshotFileCache {
  ts: number;
  payload: SkillsSummaryPayload;
}

interface MarketplaceQueryOptions {
  sourceId: SkillsMarketplaceSourceId;
  query?: string;
  sort?: SkillsMarketplaceSort;
  page?: number;
  pageSize?: number;
}

interface SkillEntryRecord {
  enabled?: boolean;
  apiKey?: unknown;
  env?: Record<string, unknown>;
  config?: Record<string, unknown>;
}

interface ExtractedSkillBundle {
  tmpDir: string;
  extractDir: string;
  skillRoot: string;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function createEmptyMissing(): SkillMissingRequirements {
  return {
    bins: [],
    anyBins: [],
    env: [],
    config: [],
    os: [],
  };
}

function getSkillsSnapshotCacheFile(config: StudioServerConfig): string {
  return path.join(config.openclawRoot, ".cache", "studio-skills-summary.json");
}

function readSummaryFileCache(
  config: StudioServerConfig,
): SkillsSnapshotFileCache | null {
  const filePath = getSkillsSnapshotCacheFile(config);
  if (!fileExists(filePath)) return null;
  try {
    return JSON.parse(
      fs.readFileSync(filePath, "utf-8"),
    ) as SkillsSnapshotFileCache;
  } catch {
    return null;
  }
}

function writeSummaryFileCache(
  config: StudioServerConfig,
  payload: SkillsSummaryPayload,
): void {
  const filePath = getSkillsSnapshotCacheFile(config);
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(
    filePath,
    JSON.stringify({ ts: Date.now(), payload }, null, 2),
    "utf-8",
  );
}

function clearSummaryFileCache(config: StudioServerConfig): void {
  const filePath = getSkillsSnapshotCacheFile(config);
  if (fileExists(filePath)) fs.rmSync(filePath, { force: true });
}

function normalizeMissing(
  value: Partial<SkillMissingRequirements> | undefined,
): SkillMissingRequirements {
  const empty = createEmptyMissing();
  if (!value) return empty;

  return {
    bins: Array.isArray(value.bins)
      ? value.bins.filter((item): item is string => typeof item === "string")
      : empty.bins,
    anyBins: Array.isArray(value.anyBins)
      ? value.anyBins.filter((item): item is string => typeof item === "string")
      : empty.anyBins,
    env: Array.isArray(value.env)
      ? value.env.filter((item): item is string => typeof item === "string")
      : empty.env,
    config: Array.isArray(value.config)
      ? value.config.filter((item): item is string => typeof item === "string")
      : empty.config,
    os: Array.isArray(value.os)
      ? value.os.filter((item): item is string => typeof item === "string")
      : empty.os,
  };
}

function normalizeStringRecord(value: unknown): Record<string, string> {
  if (!isPlainObject(value)) return {};

  return Object.fromEntries(
    Object.entries(value)
      .map(
        ([key, item]) =>
          [
            key.trim(),
            typeof item === "string" ? item : String(item ?? ""),
          ] as const,
      )
      .filter(([key, item]) => key && item.trim()),
  );
}

function normalizeConfigRecord(value: unknown): Record<string, unknown> {
  if (!isPlainObject(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(([key]) => key.trim()),
  );
}

function normalizeOptionalText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function maskSecret(value: string): string {
  if (!value) return "••••";
  if (value.length <= 4) return "•".repeat(Math.max(4, value.length));
  return `${"•".repeat(Math.max(4, value.length - 4))}${value.slice(-4)}`;
}

function detectApiKeyMode(value: unknown): SkillApiKeyMode {
  if (typeof value === "string" && value.trim()) return "plaintext";
  if (isPlainObject(value) && Object.keys(value).length > 0)
    return "secret-ref";
  return "none";
}

function formatSecretRefLabel(value: unknown): string | null {
  if (!isPlainObject(value)) return null;
  const source = typeof value.source === "string" ? value.source : "secret";
  const provider =
    typeof value.provider === "string" ? value.provider : "default";
  const id = typeof value.id === "string" ? value.id : "unknown";
  return `${source}:${provider}/${id}`;
}

function deriveSourceCategory(
  source: string | undefined,
  slug: string,
  workspacePath: string | null,
  managedPath: string | null,
): SkillSummary["sourceCategory"] {
  if (workspacePath) return "workspace";
  if (managedPath) return "managed";
  if (!source) return "unknown";
  if (source.includes("bundled")) return "bundled";
  if (source.includes("workspace")) return "workspace";
  if (source.includes("managed")) return "managed";
  if (source.includes("plugin")) return "plugin";
  if (source.includes("extra")) return "extra";
  if (slug === "config-only") return "config-only";
  return "unknown";
}

function deriveStatus(input: {
  blockedByAllowlist: boolean;
  disabled: boolean;
  eligible: boolean;
}): SkillStatus {
  if (input.blockedByAllowlist) return "blocked";
  if (input.disabled) return "disabled";
  if (input.eligible) return "ready";
  return "needs-setup";
}

function parseSkillsJson(stdout: string): OpenClawSkillsSnapshot {
  const trimmed = stdout.trim();
  const start = trimmed.indexOf("{");
  if (start === -1) throw new Error("Failed to parse skills snapshot JSON");

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < trimmed.length; index += 1) {
    const char = trimmed[index];

    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return JSON.parse(
          trimmed.slice(start, index + 1),
        ) as OpenClawSkillsSnapshot;
      }
    }
  }

  throw new Error("Failed to isolate skills snapshot JSON payload");
}

async function runJsonCommand(
  file: string,
  args: string[],
  cwd: string,
): Promise<{ stdout: string; stderr: string }> {
  const result = await execFileAsync(file, args, {
    cwd,
    timeout: 20_000,
    maxBuffer: 8 * 1024 * 1024,
  });

  return {
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

async function commandExists(command: string): Promise<boolean> {
  try {
    await execFileAsync("bash", ["-lc", `command -v ${command}`], {
      timeout: 5_000,
    });
    return true;
  } catch {
    return false;
  }
}

function readInstallMetadataFromDir(
  dirPath: string | null,
): SkillInstallMetadata | null {
  if (!dirPath) return null;
  const metaPath = path.join(dirPath, "_meta.json");
  if (!fileExists(metaPath)) return null;

  try {
    const raw = JSON.parse(fs.readFileSync(metaPath, "utf-8")) as Record<
      string,
      unknown
    >;
    return {
      slug: typeof raw.slug === "string" ? raw.slug : null,
      version: typeof raw.version === "string" ? raw.version : null,
      publishedAt:
        typeof raw.publishedAt === "number"
          ? new Date(raw.publishedAt).toISOString()
          : null,
      ownerId: typeof raw.ownerId === "string" ? raw.ownerId : null,
    };
  } catch {
    return null;
  }
}

interface AgentSkillTargetInfo {
  id: string;
  name: string;
  workspace: string;
}

function normalizeAliasKey(value: string | null | undefined): string {
  return String(value || "").trim().toLowerCase();
}

function readSkillMarkdownName(dirPath: string): string {
  const skillMdPath = path.join(dirPath, "SKILL.md");
  if (!fileExists(skillMdPath)) return "";
  const content = safeReadText(skillMdPath) || "";
  const yamlName = content.match(/^name:\s*["']?([^"'\n]+)["']?/m)?.[1];
  if (yamlName?.trim()) return yamlName.trim();
  const heading = content.match(/^#\s+(.+)$/m)?.[1];
  return heading?.trim() || "";
}

function buildInstalledIdentity(
  dirPath: string,
  sourceId: SkillPackageSourceId | null = null,
): SkillPhysicalCopy["identity"] {
  const folderName = path.basename(dirPath);
  const installMetadata = readInstallMetadataFromDir(dirPath);
  const skillMdName = readSkillMarkdownName(dirPath);
  const canonicalSlug = installMetadata?.slug || skillMdName || folderName;
  const aliases = Array.from(
    new Set(
      [folderName, canonicalSlug, installMetadata?.slug || "", skillMdName]
        .map((value) => String(value || "").trim())
        .filter(Boolean),
    ),
  );

  return {
    canonicalSlug,
    folderName,
    aliases,
    sourceId,
    installMetadata,
  };
}

function buildPhysicalCopy(
  scope: SkillInstallTargetScope,
  agentId: string | null,
  dirPath: string,
): SkillPhysicalCopy | null {
  if (!fileExists(dirPath)) return null;
  return {
    scope,
    agentId,
    path: dirPath,
    folderName: path.basename(dirPath),
    identity: buildInstalledIdentity(dirPath),
  };
}

function readConfiguredAgentTargets(
  config: StudioServerConfig,
  openclawConfig: Record<string, any>,
): AgentSkillTargetInfo[] {
  const defaults = openclawConfig.agents?.defaults || {};
  const rawAgents = Array.isArray(openclawConfig.agents?.list)
    ? openclawConfig.agents.list
    : [];
  const agents = rawAgents
    .filter((agent: unknown): agent is Record<string, any> => isPlainObject(agent))
    .map((agent: Record<string, any>) => {
      const id = normalizeOptionalText(agent.id);
      if (!id) return null;
      const workspace = normalizeOptionalText(agent.workspace)
        || normalizeOptionalText(defaults.workspace)
        || path.join(config.openclawRoot, id === "main" ? "workspace" : `workspace-${id}`);
      return {
        id,
        name: normalizeOptionalText(agent.name) || id,
        workspace,
      };
    })
    .filter((agent: AgentSkillTargetInfo | null): agent is AgentSkillTargetInfo => Boolean(agent));

  if (agents.length) return agents;
  const fallbackWorkspace = normalizeOptionalText(defaults.workspace)
    || path.join(config.openclawRoot, DEFAULT_WORKSPACE_DIRNAME);
  return [{ id: "main", name: "main", workspace: fallbackWorkspace }];
}

function isSafeDescendantPath(root: string, target: string): boolean {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(target);
  const relative = path.relative(resolvedRoot, resolvedTarget);
  return Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function assertSafeTargetPath(config: StudioServerConfig, targetPath: string): string {
  const resolved = path.resolve(targetPath);
  if (!isSafeDescendantPath(config.openclawRoot, resolved)) {
    throw new Error(`Unsafe skill target path outside OpenClaw root: ${resolved}`);
  }
  return resolved;
}

function canWriteParent(targetPath: string): boolean {
  try {
    ensureDir(path.dirname(targetPath));
    fs.accessSync(path.dirname(targetPath), fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

function targetDescriptor(params: {
  id: string;
  scope: SkillInstallTargetScope;
  label: string;
  targetPath: string;
  agentId?: string | null;
  config: StudioServerConfig;
}): SkillTargetDescriptor {
  const safe = isSafeDescendantPath(params.config.openclawRoot, params.targetPath);
  return {
    id: params.id,
    scope: params.scope,
    label: params.label,
    path: path.resolve(params.targetPath),
    agentId: params.agentId || null,
    writable: safe && canWriteParent(params.targetPath),
    safe,
  };
}

function getSkillPaths(
  workspaceDir: string,
  managedSkillsDir: string,
  slug: string,
  agentTargets: AgentSkillTargetInfo[] = [],
): SkillSummary["paths"] {
  const workspacePath = path.join(workspaceDir, "skills", slug);
  const managedPath = path.join(managedSkillsDir, slug);
  const workspaceExists = fileExists(workspacePath);
  const managedExists = fileExists(managedPath);
  const agentWorkspacePaths: Record<string, string> = {};
  const physicalCopies: SkillPhysicalCopy[] = [];

  const workspaceCopy = buildPhysicalCopy("default-workspace", null, workspacePath);
  const managedCopy = buildPhysicalCopy("managed", null, managedPath);
  if (workspaceCopy) physicalCopies.push(workspaceCopy);
  if (managedCopy) physicalCopies.push(managedCopy);

  for (const agent of agentTargets) {
    const agentSkillPath = path.join(agent.workspace, "skills", slug);
    if (!fileExists(agentSkillPath)) continue;
    agentWorkspacePaths[agent.id] = agentSkillPath;
    const copy = buildPhysicalCopy("agent-workspace", agent.id, agentSkillPath);
    if (copy) physicalCopies.push(copy);
  }

  return {
    workspacePath: workspaceExists ? workspacePath : null,
    managedPath: managedExists ? managedPath : null,
    activePath: workspaceExists
      ? workspacePath
      : managedExists
        ? managedPath
        : Object.values(agentWorkspacePaths)[0] || null,
    agentWorkspacePaths,
    physicalCopies,
  };
}

function normalizedSkillList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => normalizeAliasKey(String(item))).filter(Boolean)
    : [];
}

function buildAgentMappingsForSummary(params: {
  slug: string;
  openclawConfig: Record<string, any>;
  agentTargets: AgentSkillTargetInfo[];
  paths: SkillSummary["paths"];
}): SkillAgentMapping[] {
  const normalizedSlug = normalizeAliasKey(params.slug);
  const globalDefaults = normalizedSkillList(params.openclawConfig.agents?.defaults?.skills);
  const mappings: SkillAgentMapping[] = [];

  for (const agent of params.agentTargets) {
    const rawAgent = Array.isArray(params.openclawConfig.agents?.list)
      ? params.openclawConfig.agents.list.find((item: Record<string, any>) => normalizeOptionalText(item.id) === agent.id)
      : null;
    const agentSkills = normalizedSkillList(rawAgent?.skills);
    const localPath = params.paths.agentWorkspacePaths[agent.id] || "";
    const hasLocalCopy = Boolean(localPath);
    const hasAgentMapping = agentSkills.includes(normalizedSlug);
    const hasGlobalDefault = globalDefaults.includes(normalizedSlug);
    if (!hasLocalCopy && !hasAgentMapping && !hasGlobalDefault) continue;

    const mode: SkillAgentMapping["mode"] = hasLocalCopy
      ? hasAgentMapping || hasGlobalDefault
        ? "detached-fork"
        : "local-copy"
      : hasAgentMapping
        ? "shared-mapping"
        : "global-default";

    mappings.push({
      agentId: agent.id,
      agentName: agent.name,
      slug: params.slug,
      mode,
      sourcePath: params.paths.managedPath || params.paths.workspacePath || null,
      targetPath: hasLocalCopy ? localPath : null,
    });
  }

  return mappings;
}

function buildSummaryRecord(
  skill: OpenClawSkillSnapshotItem,
  entry: SkillEntryRecord | undefined,
  workspaceDir: string,
  managedSkillsDir: string,
  agentTargets: AgentSkillTargetInfo[] = [],
  openclawConfig: Record<string, any> = {},
): SkillSummary {
  const slug = skill.name;
  const paths = getSkillPaths(workspaceDir, managedSkillsDir, slug, agentTargets);
  const apiKeyMode = detectApiKeyMode(entry?.apiKey);
  const env = normalizeStringRecord(entry?.env);
  const config = normalizeConfigRecord(entry?.config);
  const disabled = skill.disabled === true || entry?.enabled === false;
  const eligible = skill.eligible === true;
  const blockedByAllowlist = skill.blockedByAllowlist === true;
  const sourceCategory = deriveSourceCategory(
    skill.source,
    slug,
    paths.workspacePath,
    paths.managedPath,
  );

  return {
    slug,
    name: skill.name,
    description: skill.description || "",
    emoji: typeof skill.emoji === "string" ? skill.emoji : null,
    homepage: typeof skill.homepage === "string" ? skill.homepage : null,
    primaryEnv: typeof skill.primaryEnv === "string" ? skill.primaryEnv : null,
    eligible,
    enabled: !disabled,
    disabled,
    blockedByAllowlist,
    bundled: skill.bundled === true,
    source: skill.source || "unknown",
    sourceCategory,
    status: deriveStatus({ blockedByAllowlist, disabled, eligible }),
    hasApiKey: apiKeyMode !== "none",
    apiKeyMode,
    envKeys: Object.keys(env).sort(),
    configKeys: Object.keys(config).sort(),
    missing: normalizeMissing(skill.missing),
    paths,
    installMetadata: readInstallMetadataFromDir(
      paths.workspacePath || paths.managedPath,
    ),
    agentMappings: buildAgentMappingsForSummary({
      slug,
      openclawConfig,
      agentTargets,
      paths,
    }),
  };
}

function buildConfigOnlySummary(
  slug: string,
  entry: SkillEntryRecord | undefined,
  workspaceDir: string,
  managedSkillsDir: string,
  agentTargets: AgentSkillTargetInfo[] = [],
  openclawConfig: Record<string, any> = {},
): SkillSummary {
  const paths = getSkillPaths(workspaceDir, managedSkillsDir, slug, agentTargets);
  const apiKeyMode = detectApiKeyMode(entry?.apiKey);
  const env = normalizeStringRecord(entry?.env);
  const config = normalizeConfigRecord(entry?.config);
  const disabled = entry?.enabled === false;
  const sourceCategory = deriveSourceCategory(
    "config-only",
    "config-only",
    paths.workspacePath,
    paths.managedPath,
  );

  return {
    slug,
    name: slug,
    description: "",
    emoji: null,
    homepage: null,
    primaryEnv: null,
    eligible: false,
    enabled: !disabled,
    disabled,
    blockedByAllowlist: false,
    bundled: false,
    source: "config-only",
    sourceCategory,
    status: disabled ? "disabled" : "needs-setup",
    hasApiKey: apiKeyMode !== "none",
    apiKeyMode,
    envKeys: Object.keys(env).sort(),
    configKeys: Object.keys(config).sort(),
    missing: createEmptyMissing(),
    paths,
    installMetadata: readInstallMetadataFromDir(
      paths.workspacePath || paths.managedPath,
    ),
    agentMappings: buildAgentMappingsForSummary({
      slug,
      openclawConfig,
      agentTargets,
      paths,
    }),
  };
}

function buildConfigState(
  entry: SkillEntryRecord | undefined,
): SkillConfigState {
  const apiKeyMode = detectApiKeyMode(entry?.apiKey);
  const apiKeyMasked =
    apiKeyMode === "plaintext" && typeof entry?.apiKey === "string"
      ? maskSecret(entry.apiKey)
      : apiKeyMode === "secret-ref"
        ? "SecretRef"
        : null;

  return {
    enabled: entry?.enabled !== false,
    hasApiKey: apiKeyMode !== "none",
    apiKeyMode,
    apiKeyMasked,
    apiKeySecretRefLabel: formatSecretRefLabel(entry?.apiKey),
    env: normalizeStringRecord(entry?.env),
    config: normalizeConfigRecord(entry?.config),
  };
}

function buildSkillsCounts(
  skills: SkillSummary[],
): SkillsSummaryPayload["counts"] {
  return {
    total: skills.length,
    enabled: skills.filter((skill) => skill.enabled).length,
    ready: skills.filter((skill) => skill.status === "ready").length,
    needsSetup: skills.filter((skill) => skill.status === "needs-setup").length,
    disabled: skills.filter((skill) => skill.status === "disabled").length,
    blocked: skills.filter((skill) => skill.status === "blocked").length,
    workspace: skills.filter((skill) => skill.sourceCategory === "workspace")
      .length,
    managed: skills.filter((skill) => skill.sourceCategory === "managed")
      .length,
    bundled: skills.filter((skill) => skill.sourceCategory === "bundled")
      .length,
    configured: skills.filter(
      (skill) =>
        skill.hasApiKey ||
        skill.envKeys.length > 0 ||
        skill.configKeys.length > 0,
    ).length,
    marketplaceInstalled: skills.filter((skill) => skill.installMetadata?.slug)
      .length,
  };
}

function listSubdirectories(dirPath: string): string[] {
  if (!fileExists(dirPath)) return [];
  try {
    return fs
      .readdirSync(dirPath, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}

function normalizeAgentRuntimeForConfig(
  value: unknown,
): Record<string, unknown> | null {
  if (!isPlainObject(value)) return null;
  const type = normalizeOptionalText(value.type).toLowerCase();
  if (!type || type === "default" || type === "embedded") return null;
  if (type !== "acp") return null;

  const acp = isPlainObject(value.acp) ? value.acp : {};
  return {
    type: "acp",
    acp: {
      agent: normalizeOptionalText(acp.agent),
      backend: normalizeOptionalText(acp.backend),
      mode: normalizeOptionalText(acp.mode),
      cwd: normalizeOptionalText(acp.cwd),
    },
  };
}

function sanitizeAgentRuntimesInConfig(
  openclawConfig: Record<string, unknown>,
): boolean {
  if (
    !isPlainObject(openclawConfig.agents) ||
    !Array.isArray(openclawConfig.agents.list)
  )
    return false;

  let changed = false;
  for (const item of openclawConfig.agents.list) {
    if (!isPlainObject(item) || !Object.hasOwn(item, "runtime")) continue;
    const nextRuntime = normalizeAgentRuntimeForConfig(item.runtime);
    if (!nextRuntime) {
      delete item.runtime;
      changed = true;
      continue;
    }

    const prev = JSON.stringify(item.runtime);
    const next = JSON.stringify(nextRuntime);
    if (prev !== next) {
      item.runtime = nextRuntime;
      changed = true;
    }
  }

  return changed;
}

function createMarketplaceSourcePayload(
  sourceId: SkillsMarketplaceSourceId,
  status: { clawhubInstalled: boolean; skillhubInstalled: boolean },
): SkillsMarketplaceSource {
  const definition = DEFAULT_SKILLS_SOURCES[sourceId];
  const cliInstalled =
    definition.cliName === "skillhub"
      ? status.skillhubInstalled
      : definition.cliName === "clawhub"
        ? status.clawhubInstalled
        : false;

  return {
    ...definition,
    cliInstalled,
  };
}

function buildInstalledAliasSet(skills: SkillSummary[]): Set<string> {
  const aliases = new Set<string>();
  for (const skill of skills) {
    aliases.add(normalizeAliasKey(skill.slug));
    aliases.add(normalizeAliasKey(skill.name));
    if (skill.installMetadata?.slug) aliases.add(normalizeAliasKey(skill.installMetadata.slug));
    for (const copy of skill.paths.physicalCopies || []) {
      aliases.add(normalizeAliasKey(copy.folderName));
      aliases.add(normalizeAliasKey(copy.identity.canonicalSlug));
      for (const alias of copy.identity.aliases) aliases.add(normalizeAliasKey(alias));
      if (copy.identity.installMetadata?.slug) aliases.add(normalizeAliasKey(copy.identity.installMetadata.slug));
    }
  }
  aliases.delete("");
  return aliases;
}

function resolveMarketplaceInstalledState(input: {
  slug: string;
  name: string;
  installedAliases: Set<string>;
}): { installed: boolean; installedAs: string | null; installedReason: string | null } {
  const candidates = [input.slug, input.name].filter(Boolean);
  for (const candidate of candidates) {
    const key = normalizeAliasKey(candidate);
    if (input.installedAliases.has(key)) {
      return {
        installed: true,
        installedAs: candidate,
        installedReason: key === normalizeAliasKey(input.slug)
          ? "slug-match"
          : "alias-match",
      };
    }
  }
  return { installed: false, installedAs: null, installedReason: null };
}

function normalizeTencentMarketItem(
  item: Record<string, unknown>,
  installedAliases: Set<string>,
): SkillsMarketplaceItem {
  const slug = typeof item.slug === "string" ? item.slug : "";
  const ownerName = typeof item.ownerName === "string" ? item.ownerName : null;
  const homepage = typeof item.homepage === "string" ? item.homepage : null;
  const name = typeof item.name === "string" ? item.name : slug;
  const installedState = resolveMarketplaceInstalledState({
    slug,
    name,
    installedAliases,
  });

  return {
    sourceId: "skillhub-tencent",
    slug,
    name,
    summary:
      typeof item.description_zh === "string" && item.description_zh.trim()
        ? item.description_zh
        : typeof item.description === "string"
          ? item.description
          : "",
    summaryZh:
      typeof item.description_zh === "string" ? item.description_zh : null,
    version: typeof item.version === "string" ? item.version : null,
    ownerName,
    downloads: typeof item.downloads === "number" ? item.downloads : null,
    stars: typeof item.stars === "number" ? item.stars : null,
    installs: typeof item.installs === "number" ? item.installs : null,
    category: typeof item.category === "string" ? item.category : null,
    tags: Array.isArray(item.tags)
      ? item.tags.filter((value): value is string => typeof value === "string")
      : [],
    homepage,
    detailUrl: homepage || `https://clawhub.ai/${ownerName || ""}/${slug}`,
    updatedAt:
      typeof item.updated_at === "number"
        ? new Date(item.updated_at).toISOString()
        : null,
    installed: installedState.installed,
    installedAs: installedState.installedAs,
    installedReason: installedState.installedReason,
  };
}

function normalizeClawhubMarketItem(
  item: Record<string, unknown>,
  installedAliases: Set<string>,
): SkillsMarketplaceItem {
  const slug = typeof item.slug === "string" ? item.slug : "";
  const latestVersion = isPlainObject(item.latestVersion)
    ? item.latestVersion
    : null;
  const stats = isPlainObject(item.stats) ? item.stats : null;
  const ownerName =
    typeof item.ownerName === "string"
      ? item.ownerName
      : isPlainObject(item.owner) && typeof item.owner.handle === "string"
        ? item.owner.handle
        : null;
  const name =
    typeof item.displayName === "string"
      ? item.displayName
      : typeof item.name === "string"
        ? item.name
        : slug;
  const installedState = resolveMarketplaceInstalledState({
    slug,
    name,
    installedAliases,
  });
  const detailUrl =
    typeof item.url === "string"
      ? item.url
      : ownerName
        ? `https://clawhub.ai/${ownerName}/${slug}`
        : `https://clawhub.ai/s/${slug}`;

  return {
    sourceId: "clawhub",
    slug,
    name,
    summary:
      typeof item.summary === "string"
        ? item.summary
        : typeof item.description === "string"
          ? item.description
          : "",
    summaryZh: null,
    version:
      latestVersion && typeof latestVersion.version === "string"
        ? latestVersion.version
        : typeof item.version === "string"
          ? item.version
          : null,
    ownerName,
    downloads:
      stats && typeof stats.downloads === "number" ? stats.downloads : null,
    stars: stats && typeof stats.stars === "number" ? stats.stars : null,
    installs:
      stats && typeof stats.installsCurrent === "number"
        ? stats.installsCurrent
        : stats && typeof stats.installs === "number"
          ? stats.installs
          : null,
    category: typeof item.category === "string" ? item.category : null,
    tags: Array.isArray(item.tags)
      ? item.tags.filter((value): value is string => typeof value === "string")
      : [],
    homepage: typeof item.homepage === "string" ? item.homepage : detailUrl,
    detailUrl,
    updatedAt:
      typeof item.updatedAt === "string"
        ? item.updatedAt
        : latestVersion && typeof latestVersion.createdAt === "string"
          ? latestVersion.createdAt
          : null,
    installed: installedState.installed,
    installedAs: installedState.installedAs,
    installedReason: installedState.installedReason,
  };
}

function sanitizeSkillSlug(value: string): string {
  const slug = value.trim();
  if (!slug) throw new Error("Missing skill slug");
  if (slug.length > 200) throw new Error("Skill slug is too long");
  if (
    !/^[a-zA-Z0-9@._/-]+$/.test(slug) ||
    slug.includes("..") ||
    slug.startsWith("/")
  ) {
    throw new Error("Invalid skill slug");
  }
  return slug;
}

function resolveMarketplaceDownloadUrl(
  sourceId: SkillsMarketplaceSourceId,
  slug: string,
): string {
  return sourceId === "skillhub-tencent"
    ? `https://lightmake.site/api/v1/download?slug=${encodeURIComponent(slug)}`
    : `https://clawhub.ai/api/v1/download?slug=${encodeURIComponent(slug)}`;
}

function collectFiles(rootDir: string): string[] {
  const files: string[] = [];

  function walk(currentDir: string): void {
    const entries = fs
      .readdirSync(currentDir, { withFileTypes: true })
      .filter((entry) => !entry.name.startsWith("."));

    for (const entry of entries) {
      const absolutePath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) walk(absolutePath);
      else files.push(absolutePath);
    }
  }

  walk(rootDir);
  return files;
}

function safeReadText(filePath: string): string | null {
  try {
    const buffer = fs.readFileSync(filePath);
    if (buffer.length > TEXT_SCAN_MAX_BYTES) return null;
    if (buffer.includes(0)) return null;
    return buffer.toString("utf-8");
  } catch {
    return null;
  }
}

function pushRiskIndicator(
  target: SkillsPreflightIndicator[],
  indicator: SkillsPreflightIndicator,
): void {
  if (
    target.some(
      (item) => item.key === indicator.key && item.detail === indicator.detail,
    )
  )
    return;
  target.push(indicator);
}

function extractQuotedList(block: string | undefined): string[] {
  if (!block) return [];
  return Array.from(block.matchAll(/"([^"]+)"/g)).map((match) => match[1]);
}

function deriveRiskLevel(
  indicators: SkillsPreflightIndicator[],
): SkillsRiskLevel {
  if (indicators.some((item) => item.severity === "high")) return "high";
  if (indicators.some((item) => item.severity === "medium")) return "medium";
  return "low";
}

function analyzeExtractedSkillBundle(
  sourceId: SkillPackageSourceId,
  slug: string,
  skillRoot: string,
): SkillsPreflightResult {
  const files = collectFiles(skillRoot);
  const skillMdPath = path.join(skillRoot, "SKILL.md");
  const textFiles = files
    .map((filePath) => ({ filePath, content: safeReadText(filePath) }))
    .filter(
      (item): item is { filePath: string; content: string } =>
        typeof item.content === "string",
    );
  const indicators: SkillsPreflightIndicator[] = [];
  const externalUrls = new Set<string>();
  const suggestedEnv = new Set<string>();
  const requiredBins = new Set<string>();
  const installHints = new Set<string>();

  const rules: Array<{
    key: string;
    severity: SkillsRiskLevel;
    label: string;
    regex: RegExp;
    detail: string;
  }> = [
    {
      key: "pipe-shell",
      severity: "high",
      label: "Shell pipe install",
      regex: /\b(?:curl|wget)[^|\n]*\|\s*(?:bash|sh)\b/gi,
      detail: "检测到 curl/wget 直接管道执行 shell 的模式。",
    },
    {
      key: "sudo",
      severity: "medium",
      label: "Elevated command",
      regex: /\bsudo\s+/gi,
      detail: "检测到 sudo 命令，意味着安装或执行可能需要提升权限。",
    },
    {
      key: "destructive-remove",
      severity: "high",
      label: "Destructive remove",
      regex: /\brm\s+-rf\b/gi,
      detail: "检测到 rm -rf，存在高风险删除操作。",
    },
    {
      key: "docker",
      severity: "medium",
      label: "Container operation",
      regex: /\bdocker\s+(?:run|build|compose)\b/gi,
      detail: "检测到 Docker 相关操作，可能需要额外环境和网络权限。",
    },
    {
      key: "global-install",
      severity: "medium",
      label: "Global package install",
      regex: /\b(?:npm|pnpm|yarn|bun|pip|go)\s+(?:install|add)\b[^\n]*\s-g\b/gi,
      detail: "检测到全局安装命令，会修改宿主机工具链环境。",
    },
    {
      key: "chmod",
      severity: "low",
      label: "Permission change",
      regex: /\bchmod\s+\+x\b/gi,
      detail: "检测到 chmod +x，说明技能可能在本地写入并执行脚本。",
    },
  ];

  for (const { filePath, content } of textFiles) {
    const relativePath =
      path.relative(skillRoot, filePath) || path.basename(filePath);

    for (const match of content.matchAll(/https?:\/\/[^\s)"'`]+/g)) {
      externalUrls.add(match[0]);
    }

    const binsBlock = content.match(/"bins"\s*:\s*\[([^\]]*)\]/);
    for (const bin of extractQuotedList(binsBlock?.[1])) requiredBins.add(bin);

    const envBlock = content.match(/"env"\s*:\s*\[([^\]]*)\]/);
    for (const envName of extractQuotedList(envBlock?.[1]))
      suggestedEnv.add(envName);

    for (const match of content.matchAll(
      /\b(?:brew install|npm install -g|pnpm add -g|yarn global add|go install|pip install|curl -fsSL [^\n]+)\b/gi,
    )) {
      installHints.add(match[0].trim());
    }

    for (const rule of rules) {
      if (rule.regex.test(content)) {
        pushRiskIndicator(indicators, {
          key: rule.key,
          label: rule.label,
          severity: rule.severity,
          detail: `${rule.detail} [${relativePath}]`,
        });
      }
      rule.regex.lastIndex = 0;
    }

    if (/metadata\s*:/i.test(content) && /"install"\s*:/i.test(content)) {
      pushRiskIndicator(indicators, {
        key: "metadata-installers",
        label: "Installer metadata",
        severity: "low",
        detail: `技能声明了 metadata.openclaw.install，可由宿主引导安装依赖。 [${relativePath}]`,
      });
    }
  }

  if (!fileExists(skillMdPath)) {
    pushRiskIndicator(indicators, {
      key: "missing-skill-md",
      label: "Missing SKILL.md",
      severity: "high",
      detail: "下载包中没有找到 SKILL.md，无法确认其是否符合官方技能结构。",
    });
  }

  if (files.length > 40) {
    pushRiskIndicator(indicators, {
      key: "large-bundle",
      label: "Large bundle",
      severity: "medium",
      detail: `下载包内共 ${files.length} 个文件，体积与复杂度高于常见技能。`,
    });
  }

  const level = deriveRiskLevel(indicators);
  const summary =
    level === "high"
      ? `发现 ${indicators.length} 个风险信号，建议先人工审阅再安装。`
      : level === "medium"
        ? `发现 ${indicators.length} 个注意项，建议确认依赖与宿主权限后再安装。`
        : "未发现明显高风险信号，但仍建议先阅读 SKILL.md 再启用。";

  return {
    checkedAt: new Date().toISOString(),
    sourceId,
    slug,
    level,
    summary,
    indicators,
    payload: {
      fileCount: files.length,
      textFileCount: textFiles.length,
      hasSkillMd: fileExists(skillMdPath),
      externalUrls: Array.from(externalUrls).slice(0, 20),
      suggestedEnv: Array.from(suggestedEnv).sort(),
      requiredBins: Array.from(requiredBins).sort(),
      installHints: Array.from(installHints).slice(0, 12),
    },
  };
}

async function extractZip(zipPath: string, outputDir: string): Promise<void> {
  if (await commandExists("unzip")) {
    await execFileAsync("unzip", ["-qq", "-o", zipPath, "-d", outputDir], {
      timeout: 60_000,
      maxBuffer: 8 * 1024 * 1024,
    });
    return;
  }

  if (await commandExists("python3")) {
    await execFileAsync(
      "python3",
      [
        "-c",
        `
import sys
import zipfile

zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])
`,
        zipPath,
        outputDir,
      ],
      {
        timeout: 60_000,
        maxBuffer: 8 * 1024 * 1024,
      },
    );
    return;
  }

  throw new Error(
    "Neither unzip nor python3 is available to extract marketplace downloads",
  );
}

function locateSkillRoot(rootDir: string): string {
  const directSkill = path.join(rootDir, "SKILL.md");
  if (fileExists(directSkill)) return rootDir;

  const entries = fs
    .readdirSync(rootDir, { withFileTypes: true })
    .filter((entry) => !entry.name.startsWith("."));
  if (entries.length === 1 && entries[0].isDirectory()) {
    const nested = path.join(rootDir, entries[0].name);
    if (fileExists(path.join(nested, "SKILL.md"))) return nested;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const nested = path.join(rootDir, entry.name);
    if (fileExists(path.join(nested, "SKILL.md"))) return nested;
  }

  return rootDir;
}

function locateUniqueSkillRoot(rootDir: string): string {
  const skillMdFiles = collectFiles(rootDir).filter(
    (filePath) => path.basename(filePath) === "SKILL.md",
  );
  if (skillMdFiles.length === 0) {
    throw new Error("Uploaded archive does not contain SKILL.md");
  }
  if (skillMdFiles.length > 1) {
    throw new Error(
      `Uploaded archive contains multiple SKILL.md files (${skillMdFiles.length}); install one skill at a time`,
    );
  }
  return path.dirname(skillMdFiles[0]);
}

async function extractZipSafely(zipPath: string, outputDir: string): Promise<void> {
  if (!(await commandExists("python3"))) {
    throw new Error("python3 is required to safely inspect uploaded zip archives");
  }
  await execFileAsync(
    "python3",
    [
      "-c",
      `
import pathlib
import sys
import zipfile

zip_path, output_dir = sys.argv[1], sys.argv[2]
with zipfile.ZipFile(zip_path) as zf:
    for member in zf.infolist():
        name = member.filename
        pure = pathlib.PurePosixPath(name)
        if not name or name.startswith('/') or pure.is_absolute() or '..' in pure.parts:
            raise SystemExit(f'unsafe zip entry: {name}')
    zf.extractall(output_dir)
`,
      zipPath,
      outputDir,
    ],
    {
      timeout: 60_000,
      maxBuffer: 8 * 1024 * 1024,
    },
  );
}

function decodeUploadArchive(payload: SkillsUploadArchivePayload): Buffer {
  const fileName = normalizeOptionalText(payload.fileName);
  if (!fileName.toLowerCase().endsWith(".zip")) {
    throw new Error("Only .zip skill archives are supported");
  }
  const rawBase64 = normalizeOptionalText(payload.dataBase64).replace(/^data:[^,]+,/, "");
  if (!rawBase64) throw new Error("Uploaded archive is empty");
  const buffer = Buffer.from(rawBase64, "base64");
  if (!buffer.length) throw new Error("Uploaded archive could not be decoded");
  return buffer;
}

async function extractUploadedSkillArchive(
  payload: SkillsUploadArchivePayload,
): Promise<ExtractedSkillBundle> {
  const tmpDir = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "openclaw-studio-upload-skill-"),
  );
  const zipPath = path.join(tmpDir, "upload.zip");
  const extractDir = path.join(tmpDir, "extract");

  try {
    const buffer = decodeUploadArchive(payload);
    ensureDir(extractDir);
    await fs.promises.writeFile(zipPath, buffer);
    await extractZipSafely(zipPath, extractDir);
    const skillRoot = locateUniqueSkillRoot(extractDir);
    return {
      tmpDir,
      extractDir,
      skillRoot,
    };
  } catch (error) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    throw error;
  }
}

async function downloadAndExtractSkillBundle(
  downloadUrl: string,
): Promise<ExtractedSkillBundle> {
  const tmpDir = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "openclaw-studio-skill-"),
  );
  const zipPath = path.join(tmpDir, "skill.zip");
  const extractDir = path.join(tmpDir, "extract");

  try {
    const response = await fetch(downloadUrl, {
      headers: {
        "User-Agent": "openclaw-studio/0.1.0",
      },
    });

    if (!response.ok) {
      throw new Error(
        `Marketplace download failed with HTTP ${response.status}`,
      );
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    ensureDir(extractDir);
    await fs.promises.writeFile(zipPath, buffer);
    await extractZip(zipPath, extractDir);

    const skillRoot = locateSkillRoot(extractDir);
    return {
      tmpDir,
      extractDir,
      skillRoot,
    };
  } catch (error) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    throw error;
  }
}

function cleanupExtractedSkillBundle(
  bundle: ExtractedSkillBundle | null,
): void {
  if (!bundle) return;
  fs.rmSync(bundle.tmpDir, { recursive: true, force: true });
}

async function downloadAndInstallSkill(params: {
  downloadUrl: string;
  targetDir: string;
  replaceExisting: boolean;
}): Promise<void> {
  const { downloadUrl, targetDir, replaceExisting } = params;
  let bundle: ExtractedSkillBundle | null = null;

  try {
    bundle = await downloadAndExtractSkillBundle(downloadUrl);
    if (!replaceExisting && fileExists(targetDir)) {
      throw new Error(`Skill already exists at ${targetDir}`);
    }

    fs.rmSync(targetDir, { recursive: true, force: true });
    ensureDir(path.dirname(targetDir));
    fs.cpSync(bundle.skillRoot, targetDir, { recursive: true });
  } finally {
    cleanupExtractedSkillBundle(bundle);
  }
}

export interface SkillsService {
  getSummary(options?: { refresh?: boolean }): Promise<SkillsSummaryPayload>;
  getTargets(): Promise<SkillsTargetsPayload>;
  toggleSkill(payload: SkillTogglePayload): Promise<SkillTogglePayload>;
  getSkillConfig(slug: string): Promise<SkillConfigPayload>;
  saveSkillConfig(
    slug: string,
    payload: SkillConfigUpdatePayload,
  ): Promise<SkillConfigSaveResponse>;
  getSkillSecret(slug: string): Promise<SkillSecretPayload>;
  getMarketplaceSources(): Promise<SkillsMarketplaceSourcesPayload>;
  getMarketplace(
    options: MarketplaceQueryOptions,
  ): Promise<SkillsMarketplacePayload>;
  preflightMarketplaceSkill(
    payload: SkillsPreflightPayload,
  ): Promise<SkillsPreflightResult>;
  installMarketplaceSkill(
    payload: SkillsMarketplaceInstallPayload,
  ): Promise<SkillsMarketplaceInstallResponse>;
  preflightUploadedSkillArchive(
    payload: SkillsUploadPreflightPayload,
  ): Promise<SkillsUploadPreflightResult>;
  installUploadedSkillArchive(
    payload: SkillsUploadInstallPayload,
  ): Promise<SkillsUploadInstallResponse>;
  updateInstalledSkill(
    payload: SkillsMaintenancePayload,
  ): Promise<SkillsMaintenanceResponse>;
  uninstallSkill(
    payload: SkillsMaintenancePayload,
  ): Promise<SkillsMaintenanceResponse>;
  runLifecycleAction(
    payload: SkillsLifecyclePayload,
  ): Promise<SkillsLifecycleResponse>;
}

export function createSkillsService(config: StudioServerConfig): SkillsService {
  let summaryCache: CacheEntry<SkillsSnapshotState> | null = null;
  const marketplaceCache = new Map<
    string,
    CacheEntry<SkillsMarketplacePayload>
  >();
  let toolStateCache: CacheEntry<{
    clawhubInstalled: boolean;
    skillhubInstalled: boolean;
  }> | null = null;

  async function getToolState(): Promise<{
    clawhubInstalled: boolean;
    skillhubInstalled: boolean;
  }> {
    if (toolStateCache && toolStateCache.expiresAt > Date.now()) {
      return toolStateCache.value;
    }

    const [clawhubInstalled, skillhubInstalled] = await Promise.all([
      commandExists("clawhub"),
      commandExists("skillhub"),
    ]);

    const value = { clawhubInstalled, skillhubInstalled };
    toolStateCache = {
      value,
      expiresAt: Date.now() + SKILLS_SNAPSHOT_TTL_MS,
    };

    return value;
  }

  async function loadSummary(refresh = false): Promise<SkillsSummaryPayload> {
    if (!refresh && summaryCache && summaryCache.expiresAt > Date.now()) {
      return summaryCache.value.payload;
    }

    if (!refresh) {
      const fileCache = readSummaryFileCache(config);
      if (fileCache?.payload) {
        const ageMs = Date.now() - Number(fileCache.ts || 0);
        if (ageMs <= SKILLS_SNAPSHOT_STALE_MS) {
          const payload = {
            ...fileCache.payload,
            stale: ageMs > SKILLS_SNAPSHOT_TTL_MS,
          };
          summaryCache = {
            value: { payload },
            expiresAt:
              Date.now() +
              Math.max(
                5_000,
                SKILLS_SNAPSHOT_TTL_MS -
                  Math.min(ageMs, SKILLS_SNAPSHOT_TTL_MS),
              ),
          };
          return payload;
        }
      }
    }

    const openclawConfig = readOpenClawConfig(config);
    if (sanitizeAgentRuntimesInConfig(openclawConfig)) {
      writeJsonFile(config.openclawConfigFile, openclawConfig);
    }

    const toolState = await getToolState();

    try {
      const result = await runJsonCommand(
        "openclaw",
        ["skills", "list", "--json"],
        config.openclawRoot,
      );
      const snapshot = parseSkillsJson(result.stdout || result.stderr);
      const workspaceDir =
        snapshot.workspaceDir ||
        path.join(config.openclawRoot, DEFAULT_WORKSPACE_DIRNAME);
      const managedSkillsDir =
        snapshot.managedSkillsDir || path.join(config.openclawRoot, "skills");
      const entries = isPlainObject(openclawConfig.skills?.entries)
        ? (openclawConfig.skills.entries as Record<string, SkillEntryRecord>)
        : {};
      const agentTargets = readConfiguredAgentTargets(config, openclawConfig);

      const summaries = new Map<string, SkillSummary>();
      for (const item of snapshot.skills || []) {
        summaries.set(
          item.name,
          buildSummaryRecord(
            item,
            entries[item.name],
            workspaceDir,
            managedSkillsDir,
            agentTargets,
            openclawConfig,
          ),
        );
      }

      for (const slug of listSubdirectories(path.join(workspaceDir, "skills"))) {
        if (!summaries.has(slug)) {
          summaries.set(
            slug,
            buildConfigOnlySummary(
              slug,
              entries[slug],
              workspaceDir,
              managedSkillsDir,
              agentTargets,
              openclawConfig,
            ),
          );
        }
      }

      for (const slug of listSubdirectories(managedSkillsDir)) {
        if (!summaries.has(slug)) {
          summaries.set(
            slug,
            buildConfigOnlySummary(
              slug,
              entries[slug],
              workspaceDir,
              managedSkillsDir,
              agentTargets,
              openclawConfig,
            ),
          );
        }
      }

      for (const agent of agentTargets) {
        for (const slug of listSubdirectories(path.join(agent.workspace, "skills"))) {
          if (!summaries.has(slug)) {
            summaries.set(
              slug,
              buildConfigOnlySummary(
                slug,
                entries[slug],
                workspaceDir,
                managedSkillsDir,
                agentTargets,
                openclawConfig,
              ),
            );
          }
        }
      }

      for (const slug of Object.keys(entries)) {
        if (!summaries.has(slug)) {
          summaries.set(
            slug,
            buildConfigOnlySummary(
              slug,
              entries[slug],
              workspaceDir,
              managedSkillsDir,
              agentTargets,
              openclawConfig,
            ),
          );
        }
      }

      const skills = Array.from(summaries.values()).sort((left, right) =>
        left.name.localeCompare(right.name),
      );
      const payload: SkillsSummaryPayload = {
        checkedAt: new Date().toISOString(),
        stale: false,
        workspaceDir,
        managedSkillsDir,
        counts: buildSkillsCounts(skills),
        tools: toolState,
        skills,
      };

      summaryCache = {
        value: { payload },
        expiresAt: Date.now() + SKILLS_SNAPSHOT_TTL_MS,
      };
      writeSummaryFileCache(config, payload);

      return payload;
    } catch (error) {
      const fileCache = readSummaryFileCache(config);
      if (fileCache?.payload) {
        const payload: SkillsSummaryPayload = {
          ...fileCache.payload,
          checkedAt: new Date().toISOString(),
          stale: true,
        };
        summaryCache = {
          value: { payload },
          expiresAt: Date.now() + 10_000,
        };
        return payload;
      }

      const workspaceDir = path.join(
        config.openclawRoot,
        DEFAULT_WORKSPACE_DIRNAME,
      );
      const managedSkillsDir = path.join(config.openclawRoot, "skills");
      const entries = isPlainObject(openclawConfig.skills?.entries)
        ? (openclawConfig.skills.entries as Record<string, SkillEntryRecord>)
        : {};
      const agentTargets = readConfiguredAgentTargets(config, openclawConfig);

      const slugs = new Set<string>(Object.keys(entries));
      for (const slug of listSubdirectories(path.join(workspaceDir, "skills")))
        slugs.add(slug);
      for (const slug of listSubdirectories(managedSkillsDir)) slugs.add(slug);
      for (const agent of agentTargets) {
        for (const slug of listSubdirectories(path.join(agent.workspace, "skills"))) {
          slugs.add(slug);
        }
      }

      const summaries = new Map<string, SkillSummary>();
      for (const slug of slugs) {
        summaries.set(
          slug,
          buildConfigOnlySummary(
            slug,
            entries[slug],
            workspaceDir,
            managedSkillsDir,
            agentTargets,
            openclawConfig,
          ),
        );
      }
      const skills = Array.from(summaries.values()).sort((left, right) =>
        left.name.localeCompare(right.name),
      );
      const payload: SkillsSummaryPayload = {
        checkedAt: new Date().toISOString(),
        stale: true,
        workspaceDir,
        managedSkillsDir,
        counts: buildSkillsCounts(skills),
        tools: toolState,
        skills,
      };

      summaryCache = {
        value: { payload },
        expiresAt: Date.now() + 10_000,
      };
      writeSummaryFileCache(config, payload);
      console.warn(
        "[studio][skills] fallback summary due to openclaw CLI failure:",
        error instanceof Error ? error.message : String(error),
      );
      return payload;
    }
  }

  function persistSkillEntry(
    slug: string,
    payload: SkillConfigUpdatePayload,
  ): SkillConfigState {
    const openclawConfig = readOpenClawConfig(config);
    if (!isPlainObject(openclawConfig.skills)) openclawConfig.skills = {};
    if (!isPlainObject(openclawConfig.skills.entries))
      openclawConfig.skills.entries = {};

    const entries = openclawConfig.skills.entries as Record<
      string,
      SkillEntryRecord
    >;
    const entry = isPlainObject(entries[slug]) ? { ...entries[slug] } : {};

    if (payload.enabled !== undefined) {
      if (payload.enabled === false) entry.enabled = false;
      else entry.enabled = true;
    }

    if ("apiKey" in payload) {
      if (payload.apiKey === null || payload.apiKey === "") delete entry.apiKey;
      else entry.apiKey = payload.apiKey;
    }

    if (payload.env !== undefined) {
      const env = normalizeStringRecord(payload.env);
      if (Object.keys(env).length > 0) entry.env = env;
      else delete entry.env;
    }

    if (payload.config !== undefined) {
      const customConfig = normalizeConfigRecord(payload.config);
      if (Object.keys(customConfig).length > 0) entry.config = customConfig;
      else delete entry.config;
    }

    if (
      entry.enabled === true &&
      !entry.apiKey &&
      !entry.env &&
      !entry.config
    ) {
      delete entry.enabled;
    }

    if (Object.keys(entry).length === 0) delete entries[slug];
    else entries[slug] = entry;

    writeJsonFile(config.openclawConfigFile, openclawConfig);
    summaryCache = null;
    clearSummaryFileCache(config);
    return buildConfigState(entries[slug]);
  }

  function removeSkillConfigEntry(slug: string): void {
    const openclawConfig = readOpenClawConfig(config);
    if (
      isPlainObject(openclawConfig.skills?.entries) &&
      slug in openclawConfig.skills.entries
    ) {
      delete openclawConfig.skills.entries[slug];
      writeJsonFile(config.openclawConfigFile, openclawConfig);
    }
    summaryCache = null;
    clearSummaryFileCache(config);
  }

  async function getSkillOrThrow(slug: string): Promise<SkillSummary> {
    const summary = await loadSummary(false);
    const skill = summary.skills.find((item) => item.slug === slug);
    if (!skill) throw new Error(`Unknown skill: ${slug}`);
    return skill;
  }

  async function runMarketplaceCliInstall(
    sourceId: SkillsMarketplaceSourceId,
    slug: string,
    workspaceDir: string,
  ): Promise<{ method: SkillsInstallMethod; output: string }> {
    if (sourceId === "skillhub-tencent" && (await commandExists("skillhub"))) {
      const result = await execFileAsync("skillhub", ["install", slug], {
        cwd: workspaceDir,
        timeout: 120_000,
        maxBuffer: 8 * 1024 * 1024,
      });
      return {
        method: "skillhub-cli",
        output:
          `${result.stdout}${result.stderr}`.trim() ||
          `skillhub install ${slug}`,
      };
    }

    if (sourceId === "clawhub" && (await commandExists("clawhub"))) {
      const result = await execFileAsync(
        "clawhub",
        ["install", slug, "--workdir", workspaceDir, "--no-input"],
        {
          cwd: workspaceDir,
          timeout: 120_000,
          maxBuffer: 8 * 1024 * 1024,
        },
      );
      return {
        method: "clawhub-cli",
        output:
          `${result.stdout}${result.stderr}`.trim() ||
          `clawhub install ${slug}`,
      };
    }

    throw new Error("CLI not available");
  }

  function sanitizeInstallFolder(value: string | null | undefined, fallback: string): string {
    const folder = normalizeOptionalText(value) || fallback;
    if (
      !folder ||
      folder.includes("/") ||
      folder.includes("\\") ||
      folder.includes("..") ||
      !/^[a-zA-Z0-9@._-]+$/.test(folder)
    ) {
      throw new Error(`Invalid skill install folder: ${folder}`);
    }
    return folder;
  }

  function buildTargetDescriptors(
    summary: SkillsSummaryPayload,
    openclawConfig: Record<string, any>,
  ): SkillTargetDescriptor[] {
    const agents = readConfiguredAgentTargets(config, openclawConfig);
    return [
      targetDescriptor({
        id: "default-workspace",
        scope: "default-workspace",
        label: "Default workspace",
        targetPath: path.join(summary.workspaceDir, "skills"),
        config,
      }),
      targetDescriptor({
        id: "managed",
        scope: "managed",
        label: "Shared managed skills",
        targetPath: summary.managedSkillsDir,
        config,
      }),
      ...agents.map((agent) =>
        targetDescriptor({
          id: `agent:${agent.id}`,
          scope: "agent-workspace",
          label: `${agent.name} (${agent.id})`,
          targetPath: path.join(agent.workspace, "skills"),
          agentId: agent.id,
          config,
        }),
      ),
    ];
  }

  function resolveAgentTarget(
    openclawConfig: Record<string, any>,
    agentId: string | null | undefined,
  ): AgentSkillTargetInfo {
    const normalizedAgentId = normalizeOptionalText(agentId);
    const match = readConfiguredAgentTargets(config, openclawConfig).find(
      (agent) => agent.id === normalizedAgentId,
    );
    if (!match) throw new Error(`Unknown agent target: ${normalizedAgentId || "(missing)"}`);
    return match;
  }

  function resolveSkillTarget(params: {
    target: SkillTargetRef | null | undefined;
    slug: string;
    summary: SkillsSummaryPayload;
    openclawConfig: Record<string, any>;
    defaultScope?: SkillInstallTargetScope;
  }): SkillTargetDescriptor {
    const scope = params.target?.scope || params.defaultScope || "default-workspace";
    const folder = sanitizeInstallFolder(params.target?.installAs, params.slug);
    let targetPath = "";
    let label = "";
    let agentId: string | null = null;
    let id: string = scope;

    if (scope === "managed") {
      targetPath = path.join(params.summary.managedSkillsDir, folder);
      label = "Shared managed skills";
    } else if (scope === "agent-workspace") {
      const agent = resolveAgentTarget(params.openclawConfig, params.target?.agentId);
      targetPath = path.join(agent.workspace, "skills", folder);
      label = `${agent.name} (${agent.id})`;
      agentId = agent.id;
      id = `agent:${agent.id}`;
    } else if (scope === "custom") {
      const customBase = normalizeOptionalText(params.target?.targetPath);
      if (!customBase) throw new Error("Custom skill target path is required");
      targetPath = params.target?.installAs ? path.join(customBase, folder) : customBase;
      label = "Custom target";
    } else {
      targetPath = path.join(params.summary.workspaceDir, "skills", folder);
      label = "Default workspace";
      id = "default-workspace";
    }

    const safePath = assertSafeTargetPath(config, targetPath);
    return targetDescriptor({
      id,
      scope,
      label,
      targetPath: safePath,
      agentId,
      config,
    });
  }

  function inferTargetRefFromPath(skill: SkillSummary, sourcePath: string): SkillTargetRef {
    if (skill.paths.managedPath === sourcePath) return { scope: "managed" };
    if (skill.paths.workspacePath === sourcePath) return { scope: "default-workspace" };
    const agentEntry = Object.entries(skill.paths.agentWorkspacePaths || {}).find(([, value]) => value === sourcePath);
    if (agentEntry) return { scope: "agent-workspace", agentId: agentEntry[0] };
    return { scope: "custom", targetPath: sourcePath };
  }

  async function resolveLifecycleSource(
    slug: string,
    source: SkillTargetRef | null | undefined,
    summary: SkillsSummaryPayload,
    openclawConfig: Record<string, any>,
  ): Promise<{ descriptor: SkillTargetDescriptor; path: string; skill: SkillSummary }> {
    const skill = await getSkillOrThrow(slug);
    const sourceRef = source || inferTargetRefFromPath(skill, skill.paths.activePath || "");
    const descriptor = resolveSkillTarget({
      target: sourceRef,
      slug,
      summary,
      openclawConfig,
    });
    if (!fileExists(descriptor.path)) {
      throw new Error(`Skill source does not exist: ${descriptor.path}`);
    }
    return { descriptor, path: descriptor.path, skill };
  }

  function readAgentMappings(
    slug: string,
    openclawConfig: Record<string, any>,
    skill: SkillSummary | null = null,
  ): SkillAgentMapping[] {
    const normalizedSlug = normalizeAliasKey(slug);
    const mappings: SkillAgentMapping[] = [];
    for (const agent of readConfiguredAgentTargets(config, openclawConfig)) {
      const rawAgent = Array.isArray(openclawConfig.agents?.list)
        ? openclawConfig.agents.list.find((item: Record<string, any>) => normalizeOptionalText(item.id) === agent.id)
        : null;
      const configured = Array.isArray(rawAgent?.skills)
        ? rawAgent.skills.map((value: unknown) => normalizeAliasKey(String(value)))
        : [];
      const localPath = skill?.paths.agentWorkspacePaths?.[agent.id] || path.join(agent.workspace, "skills", slug);
      const hasLocalCopy = fileExists(localPath);
      if (!configured.includes(normalizedSlug) && !hasLocalCopy) continue;
      mappings.push({
        agentId: agent.id,
        agentName: agent.name,
        slug,
        mode: hasLocalCopy ? "local-copy" : "shared-mapping",
        sourcePath: skill?.paths.managedPath || skill?.paths.workspacePath || null,
        targetPath: hasLocalCopy ? localPath : null,
      });
    }
    return mappings;
  }

  function updateAgentSkillMappings(
    slug: string,
    agentIds: string[],
    enabled: boolean,
    openclawConfig: Record<string, any>,
  ): SkillAgentMapping[] {
    if (!isPlainObject(openclawConfig.agents) || !Array.isArray(openclawConfig.agents.list)) {
      openclawConfig.agents = { ...(isPlainObject(openclawConfig.agents) ? openclawConfig.agents : {}), list: [] };
    }
    const affected: SkillAgentMapping[] = [];
    const targets = readConfiguredAgentTargets(config, openclawConfig);
    for (const agentId of agentIds) {
      const target = targets.find((agent) => agent.id === agentId);
      if (!target) throw new Error(`Unknown agent target: ${agentId}`);
      let rawAgent = openclawConfig.agents.list.find((item: Record<string, any>) => normalizeOptionalText(item.id) === agentId);
      if (!rawAgent) {
        rawAgent = { id: agentId, name: target.name, workspace: target.workspace };
        openclawConfig.agents.list.push(rawAgent);
      }
      const current = Array.isArray(rawAgent.skills)
        ? rawAgent.skills.map((value: unknown) => String(value).trim()).filter(Boolean)
        : [];
      const next = enabled
        ? Array.from(new Set([...current, slug]))
        : current.filter((value: string) => normalizeAliasKey(value) !== normalizeAliasKey(slug));
      if (next.length) rawAgent.skills = next;
      else delete rawAgent.skills;
      affected.push({
        agentId,
        agentName: target.name,
        slug,
        mode: "shared-mapping",
        sourcePath: null,
        targetPath: null,
      });
    }
    return affected;
  }

  async function fetchTencentMarketplace(
    options: MarketplaceQueryOptions,
    installedAliases: Set<string>,
  ): Promise<SkillsMarketplacePayload> {
    const sort = options.sort || "featured";
    const page = Math.max(1, options.page || 1);
    const pageSize = Math.min(50, Math.max(1, options.pageSize || 24));
    const query = (options.query || "").trim();
    const source = createMarketplaceSourcePayload(
      "skillhub-tencent",
      await getToolState(),
    );
    const url = new URL(
      sort === "featured" && !query
        ? "https://lightmake.site/api/skills/top"
        : "https://lightmake.site/api/skills",
    );

    if (url.pathname.endsWith("/skills")) {
      url.searchParams.set("page", String(page));
      url.searchParams.set("pageSize", String(pageSize));
      if (query) url.searchParams.set("keyword", query);
      if (sort === "downloads") {
        url.searchParams.set("sortBy", "downloads");
        url.searchParams.set("order", "desc");
      } else if (sort === "stars") {
        url.searchParams.set("sortBy", "stars");
        url.searchParams.set("order", "desc");
      } else if (sort === "installs") {
        url.searchParams.set("sortBy", "installs");
        url.searchParams.set("order", "desc");
      }
    }

    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "openclaw-studio/0.1.0",
      },
    });

    if (!response.ok) {
      throw new Error(`SkillHub Tencent responded ${response.status}`);
    }

    const data = (await response.json()) as Record<string, unknown>;
    const payload = isPlainObject(data.data)
      ? (data.data as Record<string, unknown>)
      : {};
    const items = Array.isArray(payload.skills)
      ? payload.skills
          .filter((item): item is Record<string, unknown> =>
            isPlainObject(item),
          )
          .map((item) => normalizeTencentMarketItem(item, installedAliases))
      : [];
    const total =
      typeof payload.total === "number" ? payload.total : items.length;

    return {
      checkedAt: new Date().toISOString(),
      source,
      query,
      sort,
      page,
      pageSize,
      total,
      stale: false,
      error: null,
      items,
    };
  }

  async function fetchClawhubMarketplace(
    options: MarketplaceQueryOptions,
    installedAliases: Set<string>,
  ): Promise<SkillsMarketplacePayload> {
    const sort = options.sort || "downloads";
    const query = (options.query || "").trim();
    const pageSize = Math.min(50, Math.max(1, options.pageSize || 24));
    const source = createMarketplaceSourcePayload(
      "clawhub",
      await getToolState(),
    );
    const url = new URL("https://clawhub.ai/api/v1/skills");

    if (query) url.searchParams.set("q", query);
    if (sort !== "featured") url.searchParams.set("sort", sort);
    if (pageSize) url.searchParams.set("limit", String(pageSize));

    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "openclaw-studio/0.1.0",
      },
    });

    if (!response.ok) {
      throw new Error(`ClawHub responded ${response.status}`);
    }

    const data = (await response.json()) as Record<string, unknown>;
    const itemsRaw = Array.isArray(data.items)
      ? data.items
      : isPlainObject(data.data) &&
          Array.isArray((data.data as Record<string, unknown>).items)
        ? ((data.data as Record<string, unknown>).items as unknown[])
        : [];
    const items = itemsRaw
      .filter((item): item is Record<string, unknown> => isPlainObject(item))
      .map((item) => normalizeClawhubMarketItem(item, installedAliases));
    const total =
      typeof data.total === "number"
        ? data.total
        : isPlainObject(data.data) &&
            typeof (data.data as Record<string, unknown>).total === "number"
          ? ((data.data as Record<string, unknown>).total as number)
          : items.length;

    return {
      checkedAt: new Date().toISOString(),
      source,
      query,
      sort,
      page: 1,
      pageSize,
      total,
      stale: false,
      error: null,
      items,
    };
  }

  return {
    async getSummary(options = {}): Promise<SkillsSummaryPayload> {
      return loadSummary(Boolean(options.refresh));
    },

    async getTargets(): Promise<SkillsTargetsPayload> {
      const [summary, openclawConfig] = await Promise.all([
        loadSummary(false),
        Promise.resolve(readOpenClawConfig(config)),
      ]);
      return {
        checkedAt: new Date().toISOString(),
        targets: buildTargetDescriptors(summary, openclawConfig),
      };
    },

    async toggleSkill(
      payload: SkillTogglePayload,
    ): Promise<SkillTogglePayload> {
      persistSkillEntry(payload.slug, { enabled: payload.enabled });
      return payload;
    },

    async getSkillConfig(slug: string): Promise<SkillConfigPayload> {
      const skill = await getSkillOrThrow(slug);

      const openclawConfig = readOpenClawConfig(config);
      const entry = isPlainObject(openclawConfig.skills?.entries?.[slug])
        ? (openclawConfig.skills.entries[slug] as SkillEntryRecord)
        : undefined;

      return {
        checkedAt: new Date().toISOString(),
        slug,
        summary: skill,
        entry: buildConfigState(entry),
      };
    },

    async saveSkillConfig(
      slug: string,
      payload: SkillConfigUpdatePayload,
    ): Promise<SkillConfigSaveResponse> {
      const entry = persistSkillEntry(slug, payload);
      return {
        success: true,
        slug,
        entry,
      };
    },

    async getSkillSecret(slug: string): Promise<SkillSecretPayload> {
      const openclawConfig = readOpenClawConfig(config);
      const entry = isPlainObject(openclawConfig.skills?.entries?.[slug])
        ? (openclawConfig.skills.entries[slug] as SkillEntryRecord)
        : undefined;
      const apiKeyMode = detectApiKeyMode(entry?.apiKey);
      const skill = await getSkillOrThrow(slug);

      return {
        slug,
        apiKey:
          apiKeyMode === "plaintext" && typeof entry?.apiKey === "string"
            ? entry.apiKey
            : null,
        apiKeyMode,
        primaryEnv: skill?.primaryEnv || null,
      };
    },

    async getMarketplaceSources(): Promise<SkillsMarketplaceSourcesPayload> {
      const toolState = await getToolState();
      return {
        checkedAt: new Date().toISOString(),
        recommendedSourceId: "skillhub-tencent",
        sources: [
          createMarketplaceSourcePayload("skillhub-tencent", toolState),
          createMarketplaceSourcePayload("clawhub", toolState),
        ],
      };
    },

    async getMarketplace(
      options: MarketplaceQueryOptions,
    ): Promise<SkillsMarketplacePayload> {
      const sourceId = options.sourceId;
      const query = (options.query || "").trim();
      const sort =
        options.sort ||
        (sourceId === "skillhub-tencent" ? "featured" : "downloads");
      const page = Math.max(1, options.page || 1);
      const pageSize = Math.min(50, Math.max(1, options.pageSize || 24));
      const cacheKey = JSON.stringify({
        sourceId,
        query,
        sort,
        page,
        pageSize,
      });
      const cached = marketplaceCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        return cached.value;
      }

      const summary = await loadSummary(false);
      const installedAliases = buildInstalledAliasSet(summary.skills);

      try {
        const payload =
          sourceId === "skillhub-tencent"
            ? await fetchTencentMarketplace(
                { sourceId, query, sort, page, pageSize },
                installedAliases,
              )
            : await fetchClawhubMarketplace(
                { sourceId, query, sort, page, pageSize },
                installedAliases,
              );

        marketplaceCache.set(cacheKey, {
          value: payload,
          expiresAt: Date.now() + MARKETPLACE_TTL_MS,
        });
        return payload;
      } catch (error) {
        const source = createMarketplaceSourcePayload(
          sourceId,
          await getToolState(),
        );
        const message =
          error instanceof Error ? error.message : "Marketplace request failed";
        const stale = cached?.value;
        if (stale) {
          return {
            ...stale,
            stale: true,
            error: message,
            source,
            checkedAt: new Date().toISOString(),
          };
        }

        return {
          checkedAt: new Date().toISOString(),
          source,
          query,
          sort,
          page,
          pageSize,
          total: 0,
          stale: false,
          error: message,
          items: [],
        };
      }
    },

    async preflightMarketplaceSkill(
      payload: SkillsPreflightPayload,
    ): Promise<SkillsPreflightResult> {
      const slug = sanitizeSkillSlug(payload.slug);
      const downloadUrl = resolveMarketplaceDownloadUrl(payload.sourceId, slug);
      let bundle: ExtractedSkillBundle | null = null;

      try {
        bundle = await downloadAndExtractSkillBundle(downloadUrl);
        return analyzeExtractedSkillBundle(
          payload.sourceId,
          slug,
          bundle.skillRoot,
        );
      } finally {
        cleanupExtractedSkillBundle(bundle);
      }
    },

    async installMarketplaceSkill(
      payload: SkillsMarketplaceInstallPayload,
    ): Promise<SkillsMarketplaceInstallResponse> {
      const sourceId = payload.sourceId;
      const slug = sanitizeSkillSlug(payload.slug);
      const replaceExisting = payload.replaceExisting === true;
      const summary = await loadSummary(true);
      const openclawConfig = readOpenClawConfig(config);
      const target = resolveSkillTarget({
        target: payload.target,
        slug,
        summary,
        openclawConfig,
        defaultScope: "default-workspace",
      });
      const targetDir = target.path;

      if (fileExists(targetDir) && !replaceExisting) {
        throw new Error(`Skill ${slug} already exists at ${targetDir}`);
      }

      let method: SkillsInstallMethod = "unavailable";
      let output = "";
      let note: string | null = null;
      const defaultTargetDir = path.join(summary.workspaceDir, "skills", slug);
      const canUseCli = target.scope === "default-workspace" && targetDir === defaultTargetDir;

      try {
        if (!canUseCli) throw new Error("CLI target override unavailable");
        const cliResult = await runMarketplaceCliInstall(
          sourceId,
          slug,
          summary.workspaceDir || path.join(config.openclawRoot, DEFAULT_WORKSPACE_DIRNAME),
        );
        method = cliResult.method;
        output = cliResult.output;
      } catch (cliError) {
        const downloadUrl =
          sourceId === "skillhub-tencent"
            ? `https://lightmake.site/api/v1/download?slug=${encodeURIComponent(slug)}`
            : `https://clawhub.ai/api/v1/download?slug=${encodeURIComponent(slug)}`;

        await downloadAndInstallSkill({
          downloadUrl,
          targetDir,
          replaceExisting,
        });
        method = "mirror-download";
        output = `Installed ${slug} into ${targetDir}`;

        if (sourceId === "clawhub") {
          note =
            "ClawHub 官方源直连安装完成；若后续遇到限流，建议切换到腾讯镜像。";
        } else if (
          cliError instanceof Error &&
          cliError.message !== "CLI not available" &&
          cliError.message !== "CLI target override unavailable"
        ) {
          note = `SkillHub CLI 安装失败，已回退为镜像直连安装：${cliError.message}`;
        }
      }

      summaryCache = null;
      clearSummaryFileCache(config);
      marketplaceCache.clear();

      const identity = fileExists(targetDir) ? buildInstalledIdentity(targetDir, sourceId) : null;

      return {
        success: true,
        sourceId,
        slug,
        canonicalSlug: identity?.canonicalSlug || slug,
        target,
        method,
        installedPath: targetDir,
        output,
        note,
        requiresNewSession: true,
      };
    },

    async preflightUploadedSkillArchive(
      payload: SkillsUploadPreflightPayload,
    ): Promise<SkillsUploadPreflightResult> {
      let bundle: ExtractedSkillBundle | null = null;
      try {
        bundle = await extractUploadedSkillArchive(payload);
        const identity = buildInstalledIdentity(bundle.skillRoot, "upload");
        return {
          checkedAt: new Date().toISOString(),
          fileName: normalizeOptionalText(payload.fileName),
          suggestedSlug: sanitizeInstallFolder(identity.canonicalSlug, identity.folderName),
          skillRootName: path.basename(bundle.skillRoot),
          preflight: analyzeExtractedSkillBundle(
            "upload",
            identity.canonicalSlug,
            bundle.skillRoot,
          ),
        };
      } finally {
        cleanupExtractedSkillBundle(bundle);
      }
    },

    async installUploadedSkillArchive(
      payload: SkillsUploadInstallPayload,
    ): Promise<SkillsUploadInstallResponse> {
      let bundle: ExtractedSkillBundle | null = null;
      try {
        bundle = await extractUploadedSkillArchive(payload);
        const identity = buildInstalledIdentity(bundle.skillRoot, "upload");
        const preflight = analyzeExtractedSkillBundle(
          "upload",
          identity.canonicalSlug,
          bundle.skillRoot,
        );
        if (!preflight.payload.hasSkillMd) {
          throw new Error("Uploaded archive failed SKILL.md validation");
        }

        const summary = await loadSummary(true);
        const openclawConfig = readOpenClawConfig(config);
        const installAs = sanitizeInstallFolder(
          payload.installAs || payload.target?.installAs,
          identity.canonicalSlug || identity.folderName,
        );
        const target = resolveSkillTarget({
          target: {
            ...(payload.target || { scope: "managed" as const }),
            scope: payload.target?.scope || "managed",
            installAs,
          },
          slug: installAs,
          summary,
          openclawConfig,
          defaultScope: "managed",
        });

        if (fileExists(target.path) && payload.replaceExisting !== true) {
          throw new Error(`Skill already exists at ${target.path}`);
        }

        fs.rmSync(target.path, { recursive: true, force: true });
        ensureDir(path.dirname(target.path));
        fs.cpSync(bundle.skillRoot, target.path, { recursive: true });

        summaryCache = null;
        clearSummaryFileCache(config);
        marketplaceCache.clear();

        const installedIdentity = buildInstalledIdentity(target.path, "upload");
        return {
          success: true,
          slug: installAs,
          canonicalSlug: installedIdentity.canonicalSlug || installAs,
          target,
          installedPath: target.path,
          output: `Installed uploaded skill ${installAs} into ${target.path}`,
          note: "上传技能已通过结构校验；建议开启新会话让 OpenClaw 重新发现。",
          requiresNewSession: true,
          preflight,
        };
      } finally {
        cleanupExtractedSkillBundle(bundle);
      }
    },

    async updateInstalledSkill(
      payload: SkillsMaintenancePayload,
    ): Promise<SkillsMaintenanceResponse> {
      const slug = sanitizeSkillSlug(payload.slug);
      const sourceId = payload.sourceId || "skillhub-tencent";
      const skill = await getSkillOrThrow(slug);
      const targetDir = skill.paths.activePath;

      if (!targetDir) {
        throw new Error(`Skill ${slug} is not installed locally`);
      }

      if (skill.sourceCategory === "bundled") {
        throw new Error(`Bundled skill ${slug} cannot be updated from Tracevane`);
      }

      const downloadUrl = resolveMarketplaceDownloadUrl(sourceId, slug);
      await downloadAndInstallSkill({
        downloadUrl,
        targetDir,
        replaceExisting: true,
      });

      summaryCache = null;
      clearSummaryFileCache(config);
      marketplaceCache.clear();

      return {
        success: true,
        action: "update",
        slug,
        sourceId,
        output: `Updated ${slug} from ${sourceId} into ${targetDir}`,
        note: "建议开启新会话，让 OpenClaw 使用更新后的技能快照。",
        affectedPath: targetDir,
        requiresNewSession: true,
      };
    },

    async uninstallSkill(
      payload: SkillsMaintenancePayload,
    ): Promise<SkillsMaintenanceResponse> {
      const slug = sanitizeSkillSlug(payload.slug);
      const skill = await getSkillOrThrow(slug);

      if (!skill.paths.workspacePath && !skill.paths.managedPath) {
        throw new Error(`Skill ${slug} has no local install to remove`);
      }

      const removedPaths = [
        skill.paths.workspacePath,
        skill.paths.managedPath,
      ].filter((item): item is string => Boolean(item));
      for (const targetPath of removedPaths) {
        fs.rmSync(targetPath, { recursive: true, force: true });
      }

      removeSkillConfigEntry(slug);
      marketplaceCache.clear();

      return {
        success: true,
        action: "uninstall",
        slug,
        sourceId: null,
        output: `Removed ${slug} from ${removedPaths.join(", ")}`,
        note: "已同步清理该技能的 Tracevane 配置项。",
        affectedPath: removedPaths[0] || null,
        requiresNewSession: true,
      };
    },

    async runLifecycleAction(
      payload: SkillsLifecyclePayload,
    ): Promise<SkillsLifecycleResponse> {
      const slug = sanitizeSkillSlug(payload.slug);
      const summary = await loadSummary(true);
      const openclawConfig = readOpenClawConfig(config);
      const action = payload.action;
      let source: SkillTargetDescriptor | null = null;
      let destination: SkillTargetDescriptor | null = null;
      const affectedPaths: string[] = [];
      let affectedAgents: SkillAgentMapping[] = [];
      let skippedAgents: SkillAgentMapping[] = [];
      let note: string | null = null;
      let output = "";

      if (action === "map" || action === "unmap") {
        const agentIds = Array.from(new Set((payload.agentIds || []).map(normalizeOptionalText).filter(Boolean)));
        if (!agentIds.length) throw new Error(`${action} requires at least one agent id`);
        affectedAgents = updateAgentSkillMappings(slug, agentIds, action === "map", openclawConfig);
        writeJsonFile(config.openclawConfigFile, openclawConfig);
        output = `${action === "map" ? "Mapped" : "Unmapped"} ${slug} for ${agentIds.length} agent(s)`;
      } else if (action === "sync") {
        const skill = await getSkillOrThrow(slug);
        const mappings = readAgentMappings(slug, openclawConfig, skill);
        affectedAgents = mappings.filter((mapping) => mapping.mode !== "local-copy");
        skippedAgents = mappings.filter((mapping) => mapping.mode === "local-copy");
        output = `Synced ${affectedAgents.length} mapped agent(s) for ${slug}`;
        if (skippedAgents.length) {
          note = `${skippedAgents.length} agent(s) have local detached copies and were not overwritten.`;
        }
      } else {
        const sourceResolved = await resolveLifecycleSource(
          slug,
          payload.source,
          summary,
          openclawConfig,
        );
        source = sourceResolved.descriptor;

        if (action === "delete") {
          const deleteMode: SkillsDeleteMode = payload.deleteMode || "physical-and-mappings";
          const mappings = readAgentMappings(slug, openclawConfig, sourceResolved.skill);
          const sharedDelete = source.scope === "managed" || source.scope === "default-workspace";
          if (sharedDelete && mappings.length && !payload.confirmAffected) {
            throw new Error(`Deleting ${slug} affects ${mappings.length} agent mapping(s); confirmAffected is required`);
          }
          if (deleteMode !== "mappings-only") {
            fs.rmSync(source.path, { recursive: true, force: true });
            affectedPaths.push(source.path);
          }
          if (deleteMode !== "physical-only") {
            affectedAgents = updateAgentSkillMappings(
              slug,
              mappings.map((mapping) => mapping.agentId),
              false,
              openclawConfig,
            );
            writeJsonFile(config.openclawConfigFile, openclawConfig);
          }
          output = `Deleted ${slug} (${deleteMode})`;
        } else {
          const destinationScope: SkillInstallTargetScope = action === "promote"
            ? "managed"
            : action === "detach"
              ? "agent-workspace"
              : payload.destination?.scope || "managed";
          destination = resolveSkillTarget({
            target: { ...(payload.destination || {}), scope: destinationScope },
            slug,
            summary,
            openclawConfig,
            defaultScope: destinationScope,
          });
          if (fileExists(destination.path) && !payload.replaceExisting) {
            throw new Error(`Destination already exists: ${destination.path}`);
          }
          fs.rmSync(destination.path, { recursive: true, force: true });
          ensureDir(path.dirname(destination.path));
          fs.cpSync(source.path, destination.path, { recursive: true });
          affectedPaths.push(destination.path);

          if (action === "move" || action === "promote") {
            fs.rmSync(source.path, { recursive: true, force: true });
            affectedPaths.push(source.path);
          }

          if (action === "detach" && destination.agentId) {
            affectedAgents = updateAgentSkillMappings(slug, [destination.agentId], true, openclawConfig);
            writeJsonFile(config.openclawConfigFile, openclawConfig);
          }
          output = `${action} ${slug} from ${source.path} to ${destination.path}`;
        }
      }

      summaryCache = null;
      clearSummaryFileCache(config);
      marketplaceCache.clear();

      return {
        success: true,
        action,
        slug,
        source,
        destination,
        affectedPaths,
        affectedAgents,
        skippedAgents,
        output,
        note,
        requiresNewSession: true,
      };
    },
  };
}
